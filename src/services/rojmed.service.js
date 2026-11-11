import db, { pool } from '../config/db.js';
import { workerService } from './worker.service.js';
import { truckAccountService } from './truckAccount.service.js';

/**
 * In-memory fallback datasets for when MySQL is offline
 * Strict Zero Dummy Data Rule: Always starts completely empty []
 */
let memoryRojmedEntries = [];
let nextEntryId = 1;
let memoryRojmedOpenings = [];
let nextOpeningId = 1;

export function formatLocalDate(val) {
  if (!val) return null;
  if (typeof val === 'string') return val.split('T')[0];
  if (val instanceof Date) {
    const yyyy = val.getFullYear();
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const dd = String(val.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return String(val);
}

function getTodayDate() {
  return formatLocalDate(new Date());
}

function resolveSourceConfig({ entryType, sourceType, subType }) {
  const cleanEntryType = entryType === 'aavak' ? 'aavak' : 'javak';
  const cleanSourceType = ['worker', 'truck_account'].includes(sourceType) ? sourceType : 'general';

  if (cleanSourceType === 'worker') {
    if (cleanEntryType === 'aavak') {
      // Cash received from worker credits their Worker Khata Jama column ('salary')
      return {
        entry_type: 'aavak',
        source_type: 'worker',
        rojmed_sub_type: 'jama',
        worker_tx_type: 'salary',
        default_label: 'રોકડા જમા',
      };
    }
    const cleanSub = subType === 'payment' ? 'payment' : 'upad';
    return {
      entry_type: 'javak',
      source_type: 'worker',
      rojmed_sub_type: cleanSub,
      worker_tx_type: cleanSub,
      default_label: cleanSub === 'payment' ? 'હિસાબ પેટે' : 'ઉપાડ',
    };
  }

  if (cleanSourceType === 'truck_account') {
    if (cleanEntryType === 'aavak') {
      return {
        entry_type: 'aavak',
        source_type: 'truck_account',
        rojmed_sub_type: 'jama',
        truck_entry_type: 'jama',
        default_label: 'રોકડા જમા',
      };
    }
    return {
      entry_type: 'javak',
      source_type: 'truck_account',
      rojmed_sub_type: 'udhar',
      truck_entry_type: 'udhar',
      default_label: 'રોકડ ખર્ચ / ઉધાર',
    };
  }

  return {
    entry_type: cleanEntryType,
    source_type: 'general',
    rojmed_sub_type: null,
    default_label: '',
  };
}

function formatEntryRow(r) {
  return {
    id: r.id,
    date: formatLocalDate(r.date),
    entry_type: r.entry_type,
    amount: Number(r.amount) || 0,
    particulars: r.particulars || '',
    source_type: r.source_type || 'general',
    source_id: r.source_id ? Number(r.source_id) : null,
    sub_type: r.sub_type || null,
    linked_tx_id: r.linked_tx_id ? Number(r.linked_tx_id) : null,
    payment_mode: r.payment_mode || 'Cash',
    notes: r.notes || '',
    created_by: r.created_by || null,
    worker_name: r.worker_name || null,
    worker_mobile: r.worker_mobile || null,
    truck_party_name: r.truck_party_name || null,
    truck_no: r.truck_no || null,
    truck_page_no: r.truck_page_no !== null && r.truck_page_no !== undefined ? Number(r.truck_page_no) : null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

class RojmedService {
  /**
   * Compute opening Silak (cash balance) for a target date in MySQL
   */
  async _computeOpeningSilakSQL(conn, targetDate) {
    const [anchors] = await conn.query(
      'SELECT date, opening_balance, notes FROM rojmed_daily_openings WHERE date <= ? ORDER BY date DESC LIMIT 1',
      [targetDate]
    );

    if (anchors && anchors.length > 0) {
      const anchor = anchors[0];
      const anchorDate = formatLocalDate(anchor.date);
      const anchorBalance = Number(anchor.opening_balance) || 0;

      if (anchorDate === targetDate) {
        return {
          opening_silak: anchorBalance,
          is_manual_opening: true,
          opening_notes: anchor.notes || '',
          anchor_date: anchorDate,
        };
      }

      const [netRows] = await conn.query(
        `SELECT COALESCE(SUM(CASE WHEN entry_type = 'aavak' THEN amount ELSE -amount END), 0) AS net_cash
         FROM rojmed_entries
         WHERE payment_mode = 'Cash' AND date >= ? AND date < ?`,
        [anchorDate, targetDate]
      );
      const netCash = Number(netRows[0]?.net_cash) || 0;
      return {
        opening_silak: anchorBalance + netCash,
        is_manual_opening: false,
        opening_notes: '',
        anchor_date: anchorDate,
      };
    }

    const [netRows] = await conn.query(
      `SELECT COALESCE(SUM(CASE WHEN entry_type = 'aavak' THEN amount ELSE -amount END), 0) AS net_cash
       FROM rojmed_entries
       WHERE payment_mode = 'Cash' AND date < ?`,
      [targetDate]
    );
    const netCash = Number(netRows[0]?.net_cash) || 0;
    return {
      opening_silak: netCash,
      is_manual_opening: false,
      opening_notes: '',
      anchor_date: null,
    };
  }

  /**
   * Compute opening Silak in memory fallback mode
   */
  _computeOpeningSilakMemory(targetDate) {
    const anchors = memoryRojmedOpenings
      .filter((o) => o.date <= targetDate)
      .sort((a, b) => b.date.localeCompare(a.date));

    if (anchors.length > 0) {
      const anchor = anchors[0];
      const anchorBal = Number(anchor.opening_balance) || 0;
      if (anchor.date === targetDate) {
        return {
          opening_silak: anchorBal,
          is_manual_opening: true,
          opening_notes: anchor.notes || '',
          anchor_date: anchor.date,
        };
      }
      const netCash = memoryRojmedEntries
        .filter((e) => e.payment_mode === 'Cash' && e.date >= anchor.date && e.date < targetDate)
        .reduce((sum, e) => sum + (e.entry_type === 'aavak' ? Number(e.amount) : -Number(e.amount)), 0);
      return {
        opening_silak: anchorBal + netCash,
        is_manual_opening: false,
        opening_notes: '',
        anchor_date: anchor.date,
      };
    }

    const netCash = memoryRojmedEntries
      .filter((e) => e.payment_mode === 'Cash' && e.date < targetDate)
      .reduce((sum, e) => sum + (e.entry_type === 'aavak' ? Number(e.amount) : -Number(e.amount)), 0);

    return {
      opening_silak: netCash,
      is_manual_opening: false,
      opening_notes: '',
      anchor_date: null,
    };
  }

  /**
   * Fetch single enriched Rojmed entry by ID
   */
  async _getEntryByIdSQL(conn, id) {
    const [rows] = await conn.query(
      `SELECT 
        r.*,
        w.name AS worker_name,
        w.mobile AS worker_mobile,
        t.party_name AS truck_party_name,
        t.truck_no AS truck_no,
        t.page_no AS truck_page_no
      FROM rojmed_entries r
      LEFT JOIN workers w ON r.source_type = 'worker' AND r.source_id = w.id
      LEFT JOIN truck_accounts t ON r.source_type = 'truck_account' AND r.source_id = t.id
      WHERE r.id = ? LIMIT 1`,
      [Number(id)]
    );
    return rows && rows.length > 0 ? formatEntryRow(rows[0]) : null;
  }

  /**
   * Get complete Rojmed daily sheet for a given date (YYYY-MM-DD)
   */
  async getDailySheet(targetDateInput) {
    const targetDate = formatLocalDate(targetDateInput) || getTodayDate();

    try {
      const openingInfo = await this._computeOpeningSilakSQL(db, targetDate);

      const [rows] = await db.query(
        `SELECT 
          r.*,
          w.name AS worker_name,
          w.mobile AS worker_mobile,
          t.party_name AS truck_party_name,
          t.truck_no AS truck_no,
          t.page_no AS truck_page_no
        FROM rojmed_entries r
        LEFT JOIN workers w ON r.source_type = 'worker' AND r.source_id = w.id
        LEFT JOIN truck_accounts t ON r.source_type = 'truck_account' AND r.source_id = t.id
        WHERE r.date = ?
        ORDER BY r.id ASC`,
        [targetDate]
      );

      const entries = (rows || []).map(formatEntryRow);
      return this._buildDailySheetPayload(targetDate, openingInfo, entries);
    } catch (err) {
      console.warn('⚠️ [RojmedService getDailySheet DB Fallback]:', err.message);
      const openingInfo = this._computeOpeningSilakMemory(targetDate);
      const entries = memoryRojmedEntries
        .filter((e) => e.date === targetDate)
        .sort((a, b) => a.id - b.id);
      return this._buildDailySheetPayload(targetDate, openingInfo, entries);
    }
  }

  _buildDailySheetPayload(targetDate, openingInfo, entries) {
    const aavakEntries = entries.filter((e) => e.entry_type === 'aavak');
    const javakEntries = entries.filter((e) => e.entry_type === 'javak');

    const totalAavakEntries = aavakEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalJavak = javakEntries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalAavakWithOpening = (Number(openingInfo.opening_silak) || 0) + totalAavakEntries;
    const closingSilak = totalAavakWithOpening - totalJavak;

    return {
      date: targetDate,
      opening_silak: Number(openingInfo.opening_silak) || 0,
      is_manual_opening: Boolean(openingInfo.is_manual_opening),
      opening_notes: openingInfo.opening_notes || '',
      anchor_date: openingInfo.anchor_date || null,
      aavak_entries: aavakEntries,
      javak_entries: javakEntries,
      total_aavak_entries: totalAavakEntries,
      total_aavak_with_opening: totalAavakWithOpening,
      total_javak: totalJavak,
      closing_silak: closingSilak,
      total_entries_count: entries.length,
    };
  }

  /**
   * Get day-by-day summary for a month (YYYY-MM) or date range
   */
  async getPeriodSummary({ month = '', startDate = '', endDate = '' } = {}) {
    let rangeStart = formatLocalDate(startDate);
    let rangeEnd = formatLocalDate(endDate);

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [yStr, mStr] = month.split('-');
      const lastDay = new Date(Number(yStr), Number(mStr), 0).getDate();
      rangeStart = `${month}-01`;
      rangeEnd = `${month}-${String(lastDay).padStart(2, '0')}`;
    } else if (!rangeStart || !rangeEnd) {
      const today = getTodayDate();
      const ym = today.slice(0, 7);
      const [yStr, mStr] = ym.split('-');
      const lastDay = new Date(Number(yStr), Number(mStr), 0).getDate();
      rangeStart = rangeStart || `${ym}-01`;
      rangeEnd = rangeEnd || `${ym}-${String(lastDay).padStart(2, '0')}`;
    }

    try {
      const startOpening = await this._computeOpeningSilakSQL(db, rangeStart);

      const [entryRows] = await db.query(
        `SELECT 
          date,
          COALESCE(SUM(CASE WHEN entry_type = 'aavak' THEN amount ELSE 0 END), 0) AS total_aavak,
          COALESCE(SUM(CASE WHEN entry_type = 'javak' THEN amount ELSE 0 END), 0) AS total_javak,
          COUNT(*) AS entry_count
        FROM rojmed_entries
        WHERE date >= ? AND date <= ? AND payment_mode = 'Cash'
        GROUP BY date
        ORDER BY date ASC`,
        [rangeStart, rangeEnd]
      );

      const [openingRows] = await db.query(
        `SELECT date, opening_balance, notes
         FROM rojmed_daily_openings
         WHERE date >= ? AND date <= ?
         ORDER BY date ASC`,
        [rangeStart, rangeEnd]
      );

      return this._buildSummaryPayload(rangeStart, rangeEnd, startOpening.opening_silak, entryRows, openingRows);
    } catch (err) {
      console.warn('⚠️ [RojmedService getPeriodSummary DB Fallback]:', err.message);
      const startOpening = this._computeOpeningSilakMemory(rangeStart);

      const grouped = new Map();
      memoryRojmedEntries
        .filter((e) => e.date >= rangeStart && e.date <= rangeEnd && e.payment_mode === 'Cash')
        .forEach((e) => {
          const cur = grouped.get(e.date) || { date: e.date, total_aavak: 0, total_javak: 0, entry_count: 0 };
          if (e.entry_type === 'aavak') cur.total_aavak += Number(e.amount) || 0;
          else cur.total_javak += Number(e.amount) || 0;
          cur.entry_count += 1;
          grouped.set(e.date, cur);
        });

      const openingRows = memoryRojmedOpenings.filter((o) => o.date >= rangeStart && o.date <= rangeEnd);
      return this._buildSummaryPayload(
        rangeStart,
        rangeEnd,
        startOpening.opening_silak,
        Array.from(grouped.values()),
        openingRows
      );
    }
  }

  _buildSummaryPayload(rangeStart, rangeEnd, initialOpening, entryRows, openingRows) {
    const entryMap = new Map();
    (entryRows || []).forEach((r) => {
      const d = formatLocalDate(r.date);
      entryMap.set(d, {
        total_aavak: Number(r.total_aavak) || 0,
        total_javak: Number(r.total_javak) || 0,
        entry_count: Number(r.entry_count) || 0,
      });
    });

    const openingMap = new Map();
    (openingRows || []).forEach((o) => {
      openingMap.set(formatLocalDate(o.date), {
        opening_balance: Number(o.opening_balance) || 0,
        notes: o.notes || '',
      });
    });

    const allDates = Array.from(new Set([...entryMap.keys(), ...openingMap.keys()])).sort((a, b) =>
      a.localeCompare(b)
    );

    let runningBalance = Number(initialOpening) || 0;
    let periodTotalAavak = 0;
    let periodTotalJavak = 0;
    const days = [];

    for (const d of allDates) {
      const manual = openingMap.get(d);
      const dayOpening = manual ? manual.opening_balance : runningBalance;
      const stats = entryMap.get(d) || { total_aavak: 0, total_javak: 0, entry_count: 0 };
      const dayClosing = dayOpening + stats.total_aavak - stats.total_javak;

      days.push({
        date: d,
        opening_silak: dayOpening,
        is_manual_opening: Boolean(manual),
        total_aavak: stats.total_aavak,
        total_javak: stats.total_javak,
        closing_silak: dayClosing,
        entry_count: stats.entry_count,
      });

      periodTotalAavak += stats.total_aavak;
      periodTotalJavak += stats.total_javak;
      runningBalance = dayClosing;
    }

    return {
      startDate: rangeStart,
      endDate: rangeEnd,
      opening_silak: Number(initialOpening) || 0,
      total_aavak: periodTotalAavak,
      total_javak: periodTotalJavak,
      closing_silak: runningBalance,
      days,
    };
  }

  /**
   * Get minimal Worker and Truck Account options for Rojmed dropdowns
   */
  async getAccountsOptions() {
    try {
      const [workerRows] = await db.query(
        'SELECT id, name, mobile, going_date FROM workers ORDER BY going_date IS NOT NULL ASC, name ASC'
      );
      const [truckRows] = await db.query(
        'SELECT id, party_name, truck_no, page_no, phone FROM truck_accounts ORDER BY page_no ASC, party_name ASC'
      );

      return {
        workers: (workerRows || []).map((w) => ({
          id: w.id,
          name: w.name,
          mobile: w.mobile || '',
          status: w.going_date ? 'relieved' : 'active',
        })),
        truck_accounts: (truckRows || []).map((t) => ({
          id: t.id,
          party_name: t.party_name,
          truck_no: t.truck_no || '',
          page_no: t.page_no !== null && t.page_no !== undefined ? Number(t.page_no) : null,
          phone: t.phone || '',
        })),
      };
    } catch (err) {
      console.warn('⚠️ [RojmedService getAccountsOptions DB Fallback]:', err.message);
      const workers = await workerService.getAllWorkers();
      const trucks = await truckAccountService.getAllAccounts();
      return {
        workers: workers.map((w) => ({
          id: w.id,
          name: w.name,
          mobile: w.mobile || '',
          status: w.status || 'active',
        })),
        truck_accounts: trucks.map((t) => ({
          id: t.id,
          party_name: t.party_name,
          truck_no: t.truck_no || '',
          page_no: t.page_no ?? null,
          phone: t.phone || '',
        })),
      };
    }
  }

  /**
   * Set or clear manual Opening Silak (સિલક) for a specific date
   */
  async setDailyOpening({ date, opening_balance, notes = '', clear = false, userId = null }) {
    const cleanDate = formatLocalDate(date) || getTodayDate();

    try {
      if (clear) {
        await db.query('DELETE FROM rojmed_daily_openings WHERE date = ?', [cleanDate]);
      } else {
        const numBal = Number(opening_balance);
        if (Number.isNaN(numBal)) {
          throw new Error('Valid opening balance amount is required');
        }
        await db.query(
          `INSERT INTO rojmed_daily_openings (date, opening_balance, notes, updated_by)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             opening_balance = VALUES(opening_balance),
             notes = VALUES(notes),
             updated_by = VALUES(updated_by),
             updated_at = CURRENT_TIMESTAMP`,
          [cleanDate, numBal, notes ? String(notes).trim() : null, userId]
        );
      }

      return this.getDailySheet(cleanDate);
    } catch (err) {
      if (err.message === 'Valid opening balance amount is required') throw err;
      console.warn('⚠️ [RojmedService setDailyOpening DB Fallback]:', err.message);

      if (clear) {
        memoryRojmedOpenings = memoryRojmedOpenings.filter((o) => o.date !== cleanDate);
      } else {
        const numBal = Number(opening_balance) || 0;
        const idx = memoryRojmedOpenings.findIndex((o) => o.date === cleanDate);
        if (idx !== -1) {
          memoryRojmedOpenings[idx] = {
            ...memoryRojmedOpenings[idx],
            opening_balance: numBal,
            notes: notes ? String(notes).trim() : '',
          };
        } else {
          memoryRojmedOpenings.push({
            id: nextOpeningId++,
            date: cleanDate,
            opening_balance: numBal,
            notes: notes ? String(notes).trim() : '',
          });
        }
      }
      return this.getDailySheet(cleanDate);
    }
  }

  /**
   * Create a new Rojmed entry AND atomically sync with Worker / Truck Account Khata
   */
  async createEntry(payload, userId = null) {
    const cleanDate = formatLocalDate(payload.date) || getTodayDate();
    const numAmount = Number(payload.amount);
    const config = resolveSourceConfig({
      entryType: payload.entry_type,
      sourceType: payload.source_type,
      subType: payload.sub_type,
    });
    const cleanNotes = payload.notes ? String(payload.notes).trim() : '';
    const sourceId = payload.source_id ? Number(payload.source_id) : null;
    let cleanParticulars = payload.particulars ? String(payload.particulars).trim() : '';

    let conn = null;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      // Resolve source entity details & validate existence
      let linkedTxId = null;
      let sourceLabel = '';

      if (config.source_type === 'worker') {
        const [wRows] = await conn.query('SELECT id, name FROM workers WHERE id = ? LIMIT 1', [sourceId]);
        if (!wRows || wRows.length === 0) {
          const err = new Error('Selected worker not found');
          err.statusCode = 404;
          throw err;
        }
        sourceLabel = wRows[0].name;
        if (!cleanParticulars) {
          cleanParticulars = `${sourceLabel} - ${config.default_label}`;
        }
      } else if (config.source_type === 'truck_account') {
        const [tRows] = await conn.query(
          'SELECT id, party_name, truck_no FROM truck_accounts WHERE id = ? LIMIT 1',
          [sourceId]
        );
        if (!tRows || tRows.length === 0) {
          const err = new Error('Selected truck account not found');
          err.statusCode = 404;
          throw err;
        }
        const t = tRows[0];
        sourceLabel = t.truck_no ? `${t.party_name} (${t.truck_no})` : t.party_name;
        if (!cleanParticulars) {
          cleanParticulars = `${sourceLabel} - ${config.default_label}`;
        }
      }

      const [insertRes] = await conn.query(
        `INSERT INTO rojmed_entries
          (date, entry_type, amount, particulars, source_type, source_id, sub_type, linked_tx_id, payment_mode, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'Cash', ?, ?)`,
        [
          cleanDate,
          config.entry_type,
          numAmount,
          cleanParticulars,
          config.source_type,
          sourceId,
          config.rojmed_sub_type,
          cleanNotes || null,
          userId,
        ]
      );
      const rojmedId = insertRes.insertId;

      if (config.source_type === 'worker') {
        const workerNotes = cleanNotes || cleanParticulars || `${config.default_label} (Rojmed)`;
        const [txRes] = await conn.query(
          `INSERT INTO worker_transactions (worker_id, type, amount, date, notes, payment_mode, rojmed_entry_id)
           VALUES (?, ?, ?, ?, ?, 'Cash', ?)`,
          [sourceId, config.worker_tx_type, numAmount, cleanDate, workerNotes, rojmedId]
        );
        linkedTxId = txRes.insertId;
        await conn.query('UPDATE rojmed_entries SET linked_tx_id = ? WHERE id = ?', [linkedTxId, rojmedId]);
        workerService.invalidateCache();
      } else if (config.source_type === 'truck_account') {
        const truckPart = cleanNotes || cleanParticulars || config.default_label;
        const [txRes] = await conn.query(
          `INSERT INTO truck_account_entries (account_id, type, amount, date, particulars, payment_mode, rojmed_entry_id)
           VALUES (?, ?, ?, ?, ?, 'Cash', ?)`,
          [sourceId, config.truck_entry_type, numAmount, cleanDate, truckPart, rojmedId]
        );
        linkedTxId = txRes.insertId;
        await conn.query('UPDATE rojmed_entries SET linked_tx_id = ? WHERE id = ?', [linkedTxId, rojmedId]);
      }

      await conn.commit();
      const createdEntry = await this._getEntryByIdSQL(db, rojmedId);
      const sheet = await this.getDailySheet(cleanDate);
      return { entry: createdEntry, sheet };
    } catch (err) {
      if (conn) {
        await conn.rollback().catch(() => {});
      }
      if (err.statusCode === 404) throw err;
      console.warn('⚠️ [RojmedService createEntry DB Fallback]:', err.message);

      // Memory fallback
      let workerName = null;
      let workerMobile = null;
      let truckParty = null;
      let truckNo = null;
      let truckPage = null;
      let linkedTxId = null;
      const rojmedId = nextEntryId++;

      if (config.source_type === 'worker') {
        const w = await workerService.getWorkerById(sourceId);
        if (!w) {
          const nf = new Error('Selected worker not found');
          nf.statusCode = 404;
          throw nf;
        }
        workerName = w.name;
        workerMobile = w.mobile || '';
        if (!cleanParticulars) cleanParticulars = `${w.name} - ${config.default_label}`;
        const tx = await workerService.addWorkerTransaction(sourceId, {
          type: config.worker_tx_type,
          amount: numAmount,
          date: cleanDate,
          notes: cleanNotes || cleanParticulars,
          payment_mode: 'Cash',
          rojmed_entry_id: rojmedId,
          _skipRojmedSync: true,
        });
        linkedTxId = tx?.id || null;
      } else if (config.source_type === 'truck_account') {
        const t = await truckAccountService.getAccountById(sourceId);
        if (!t) {
          const nf = new Error('Selected truck account not found');
          nf.statusCode = 404;
          throw nf;
        }
        truckParty = t.party_name;
        truckNo = t.truck_no || '';
        truckPage = t.page_no ?? null;
        const label = truckNo ? `${truckParty} (${truckNo})` : truckParty;
        if (!cleanParticulars) cleanParticulars = `${label} - ${config.default_label}`;
        const tx = await truckAccountService.addEntry(sourceId, {
          type: config.truck_entry_type,
          amount: numAmount,
          date: cleanDate,
          particulars: cleanNotes || cleanParticulars,
          payment_mode: 'Cash',
          rojmed_entry_id: rojmedId,
          _skipRojmedSync: true,
        });
        linkedTxId = tx?.id || null;
      }

      const newEntry = {
        id: rojmedId,
        date: cleanDate,
        entry_type: config.entry_type,
        amount: numAmount,
        particulars: cleanParticulars,
        source_type: config.source_type,
        source_id: sourceId,
        sub_type: config.rojmed_sub_type,
        linked_tx_id: linkedTxId,
        payment_mode: 'Cash',
        notes: cleanNotes,
        created_by: userId,
        worker_name: workerName,
        worker_mobile: workerMobile,
        truck_party_name: truckParty,
        truck_no: truckNo,
        truck_page_no: truckPage,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      memoryRojmedEntries.push(newEntry);
      const sheet = await this.getDailySheet(cleanDate);
      return { entry: newEntry, sheet };
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Update a Rojmed entry AND keep linked Worker / Truck Account entry in sync
   */
  async updateEntry(entryId, payload) {
    const numId = Number(entryId);
    const cleanDate = formatLocalDate(payload.date) || getTodayDate();
    const numAmount = Number(payload.amount);
    const config = resolveSourceConfig({
      entryType: payload.entry_type,
      sourceType: payload.source_type,
      subType: payload.sub_type,
    });
    const cleanNotes = payload.notes ? String(payload.notes).trim() : '';
    const sourceId = payload.source_id ? Number(payload.source_id) : null;
    let cleanParticulars = payload.particulars ? String(payload.particulars).trim() : '';

    let conn = null;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [existingRows] = await conn.query('SELECT * FROM rojmed_entries WHERE id = ? LIMIT 1', [numId]);
      if (!existingRows || existingRows.length === 0) {
        await conn.rollback();
        return null;
      }
      const existing = existingRows[0];

      // Validate target source entity if linked
      if (config.source_type === 'worker') {
        const [wRows] = await conn.query('SELECT id, name FROM workers WHERE id = ? LIMIT 1', [sourceId]);
        if (!wRows || wRows.length === 0) {
          const err = new Error('Selected worker not found');
          err.statusCode = 404;
          throw err;
        }
        if (!cleanParticulars) cleanParticulars = `${wRows[0].name} - ${config.default_label}`;
      } else if (config.source_type === 'truck_account') {
        const [tRows] = await conn.query(
          'SELECT id, party_name, truck_no FROM truck_accounts WHERE id = ? LIMIT 1',
          [sourceId]
        );
        if (!tRows || tRows.length === 0) {
          const err = new Error('Selected truck account not found');
          err.statusCode = 404;
          throw err;
        }
        const label = tRows[0].truck_no ? `${tRows[0].party_name} (${tRows[0].truck_no})` : tRows[0].party_name;
        if (!cleanParticulars) cleanParticulars = `${label} - ${config.default_label}`;
      }

      let newLinkedTxId = existing.linked_tx_id ? Number(existing.linked_tx_id) : null;
      const sourceTypeChanged = existing.source_type !== config.source_type;

      // Remove old linked tx if source_type changed or switched to general
      if (sourceTypeChanged && newLinkedTxId) {
        if (existing.source_type === 'worker') {
          await conn.query('DELETE FROM worker_transactions WHERE id = ?', [newLinkedTxId]);
          workerService.invalidateCache();
        } else if (existing.source_type === 'truck_account') {
          await conn.query('DELETE FROM truck_account_entries WHERE id = ?', [newLinkedTxId]);
        }
        newLinkedTxId = null;
      }

      if (config.source_type === 'worker') {
        const workerNotes = cleanNotes || cleanParticulars || `${config.default_label} (Rojmed)`;
        if (newLinkedTxId && !sourceTypeChanged) {
          const [upd] = await conn.query(
            `UPDATE worker_transactions
             SET worker_id = ?, type = ?, amount = ?, date = ?, notes = ?, payment_mode = 'Cash', rojmed_entry_id = ?
             WHERE id = ?`,
            [sourceId, config.worker_tx_type, numAmount, cleanDate, workerNotes, numId, newLinkedTxId]
          );
          if (upd.affectedRows === 0) {
            newLinkedTxId = null;
          }
        }
        if (!newLinkedTxId) {
          const [ins] = await conn.query(
            `INSERT INTO worker_transactions (worker_id, type, amount, date, notes, payment_mode, rojmed_entry_id)
             VALUES (?, ?, ?, ?, ?, 'Cash', ?)`,
            [sourceId, config.worker_tx_type, numAmount, cleanDate, workerNotes, numId]
          );
          newLinkedTxId = ins.insertId;
        }
        workerService.invalidateCache();
      } else if (config.source_type === 'truck_account') {
        const truckPart = cleanNotes || cleanParticulars || config.default_label;
        if (newLinkedTxId && !sourceTypeChanged) {
          const [upd] = await conn.query(
            `UPDATE truck_account_entries
             SET account_id = ?, type = ?, amount = ?, date = ?, particulars = ?, payment_mode = 'Cash', rojmed_entry_id = ?
             WHERE id = ?`,
            [sourceId, config.truck_entry_type, numAmount, cleanDate, truckPart, numId, newLinkedTxId]
          );
          if (upd.affectedRows === 0) {
            newLinkedTxId = null;
          }
        }
        if (!newLinkedTxId) {
          const [ins] = await conn.query(
            `INSERT INTO truck_account_entries (account_id, type, amount, date, particulars, payment_mode, rojmed_entry_id)
             VALUES (?, ?, ?, ?, ?, 'Cash', ?)`,
            [sourceId, config.truck_entry_type, numAmount, cleanDate, truckPart, numId]
          );
          newLinkedTxId = ins.insertId;
        }
      } else {
        newLinkedTxId = null;
      }

      await conn.query(
        `UPDATE rojmed_entries
         SET date = ?, entry_type = ?, amount = ?, particulars = ?, source_type = ?, source_id = ?,
             sub_type = ?, linked_tx_id = ?, notes = ?, payment_mode = 'Cash'
         WHERE id = ?`,
        [
          cleanDate,
          config.entry_type,
          numAmount,
          cleanParticulars,
          config.source_type,
          sourceId,
          config.rojmed_sub_type,
          newLinkedTxId,
          cleanNotes || null,
          numId,
        ]
      );

      await conn.commit();
      const updatedEntry = await this._getEntryByIdSQL(db, numId);
      const sheet = await this.getDailySheet(cleanDate);
      return { entry: updatedEntry, sheet };
    } catch (err) {
      if (conn) await conn.rollback().catch(() => {});
      if (err.statusCode === 404) throw err;
      console.warn('⚠️ [RojmedService updateEntry DB Fallback]:', err.message);

      const idx = memoryRojmedEntries.findIndex((e) => e.id === numId);
      if (idx === -1) return null;
      const existing = memoryRojmedEntries[idx];

      if (existing.source_type !== config.source_type && existing.linked_tx_id) {
        if (existing.source_type === 'worker') {
          await workerService.deleteWorkerTransaction(existing.linked_tx_id, { _skipRojmedSync: true });
        } else if (existing.source_type === 'truck_account') {
          await truckAccountService.deleteEntry(existing.source_id, existing.linked_tx_id, { _skipRojmedSync: true });
        }
      }

      let linkedTxId = existing.source_type === config.source_type ? existing.linked_tx_id : null;
      let workerName = null;
      let truckParty = null;
      let truckNo = null;
      let truckPage = null;

      if (config.source_type === 'worker') {
        const w = await workerService.getWorkerById(sourceId);
        if (!w) {
          const nf = new Error('Selected worker not found');
          nf.statusCode = 404;
          throw nf;
        }
        workerName = w.name;
        if (!cleanParticulars) cleanParticulars = `${w.name} - ${config.default_label}`;
        if (linkedTxId) {
          const upd = await workerService.updateWorkerTransaction(linkedTxId, {
            worker_id: sourceId,
            type: config.worker_tx_type,
            amount: numAmount,
            date: cleanDate,
            notes: cleanNotes || cleanParticulars,
            payment_mode: 'Cash',
            _skipRojmedSync: true,
          });
          if (!upd) linkedTxId = null;
        }
        if (!linkedTxId) {
          const created = await workerService.addWorkerTransaction(sourceId, {
            type: config.worker_tx_type,
            amount: numAmount,
            date: cleanDate,
            notes: cleanNotes || cleanParticulars,
            payment_mode: 'Cash',
            rojmed_entry_id: numId,
            _skipRojmedSync: true,
          });
          linkedTxId = created?.id || null;
        }
      } else if (config.source_type === 'truck_account') {
        const t = await truckAccountService.getAccountById(sourceId);
        if (!t) {
          const nf = new Error('Selected truck account not found');
          nf.statusCode = 404;
          throw nf;
        }
        truckParty = t.party_name;
        truckNo = t.truck_no || '';
        truckPage = t.page_no ?? null;
        const label = truckNo ? `${truckParty} (${truckNo})` : truckParty;
        if (!cleanParticulars) cleanParticulars = `${label} - ${config.default_label}`;
        if (linkedTxId) {
          const upd = await truckAccountService.updateEntry(sourceId, linkedTxId, {
            type: config.truck_entry_type,
            amount: numAmount,
            date: cleanDate,
            particulars: cleanNotes || cleanParticulars,
            payment_mode: 'Cash',
            _skipRojmedSync: true,
          });
          if (!upd) linkedTxId = null;
        }
        if (!linkedTxId) {
          const created = await truckAccountService.addEntry(sourceId, {
            type: config.truck_entry_type,
            amount: numAmount,
            date: cleanDate,
            particulars: cleanNotes || cleanParticulars,
            payment_mode: 'Cash',
            rojmed_entry_id: numId,
            _skipRojmedSync: true,
          });
          linkedTxId = created?.id || null;
        }
      } else {
        linkedTxId = null;
      }

      memoryRojmedEntries[idx] = {
        ...existing,
        date: cleanDate,
        entry_type: config.entry_type,
        amount: numAmount,
        particulars: cleanParticulars,
        source_type: config.source_type,
        source_id: sourceId,
        sub_type: config.rojmed_sub_type,
        linked_tx_id: linkedTxId,
        notes: cleanNotes,
        worker_name: workerName,
        truck_party_name: truckParty,
        truck_no: truckNo,
        truck_page_no: truckPage,
        updated_at: new Date().toISOString(),
      };
      const sheet = await this.getDailySheet(cleanDate);
      return { entry: memoryRojmedEntries[idx], sheet };
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Delete a Rojmed entry AND its linked Worker / Truck Account entry
   */
  async deleteEntry(entryId) {
    const numId = Number(entryId);
    let conn = null;

    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [rows] = await conn.query('SELECT * FROM rojmed_entries WHERE id = ? LIMIT 1', [numId]);
      if (!rows || rows.length === 0) {
        await conn.rollback();
        return null;
      }
      const existing = rows[0];
      const entryDate = formatLocalDate(existing.date);

      if (existing.linked_tx_id) {
        if (existing.source_type === 'worker') {
          await conn.query('DELETE FROM worker_transactions WHERE id = ?', [existing.linked_tx_id]);
          workerService.invalidateCache();
        } else if (existing.source_type === 'truck_account') {
          await conn.query('DELETE FROM truck_account_entries WHERE id = ?', [existing.linked_tx_id]);
        }
      }

      await conn.query('DELETE FROM rojmed_entries WHERE id = ?', [numId]);
      await conn.commit();

      const sheet = await this.getDailySheet(entryDate);
      return { deletedId: numId, date: entryDate, sheet };
    } catch (err) {
      if (conn) await conn.rollback().catch(() => {});
      console.warn('⚠️ [RojmedService deleteEntry DB Fallback]:', err.message);

      const idx = memoryRojmedEntries.findIndex((e) => e.id === numId);
      if (idx === -1) return null;
      const existing = memoryRojmedEntries[idx];
      const entryDate = existing.date;

      if (existing.linked_tx_id) {
        if (existing.source_type === 'worker') {
          await workerService.deleteWorkerTransaction(existing.linked_tx_id, { _skipRojmedSync: true });
        } else if (existing.source_type === 'truck_account') {
          await truckAccountService.deleteEntry(existing.source_id, existing.linked_tx_id, { _skipRojmedSync: true });
        }
      }

      memoryRojmedEntries.splice(idx, 1);
      const sheet = await this.getDailySheet(entryDate);
      return { deletedId: numId, date: entryDate, sheet };
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Memory-mode sync helpers called by WorkerService / TruckAccountService
   * when MySQL is offline.
   */
  syncMemoryFromLinkedTx({
    action,
    rojmedEntryId = null,
    sourceType,
    sourceId,
    linkedTxId,
    entryType,
    subType,
    amount,
    date,
    particulars,
    notes = '',
    workerName = null,
    truckPartyName = null,
    truckNo = null,
    truckPageNo = null,
  }) {
    if (action === 'delete') {
      if (!rojmedEntryId) return null;
      memoryRojmedEntries = memoryRojmedEntries.filter((e) => e.id !== Number(rojmedEntryId));
      return null;
    }

    const cleanDate = formatLocalDate(date) || getTodayDate();
    if (action === 'update' && rojmedEntryId) {
      const idx = memoryRojmedEntries.findIndex((e) => e.id === Number(rojmedEntryId));
      if (idx !== -1) {
        memoryRojmedEntries[idx] = {
          ...memoryRojmedEntries[idx],
          date: cleanDate,
          entry_type: entryType,
          amount: Number(amount) || 0,
          particulars,
          source_type: sourceType,
          source_id: Number(sourceId),
          sub_type: subType,
          linked_tx_id: Number(linkedTxId),
          notes,
          worker_name: workerName,
          truck_party_name: truckPartyName,
          truck_no: truckNo,
          truck_page_no: truckPageNo,
          updated_at: new Date().toISOString(),
        };
        return memoryRojmedEntries[idx].id;
      }
    }

    const id = nextEntryId++;
    memoryRojmedEntries.push({
      id,
      date: cleanDate,
      entry_type: entryType,
      amount: Number(amount) || 0,
      particulars,
      source_type: sourceType,
      source_id: Number(sourceId),
      sub_type: subType,
      linked_tx_id: Number(linkedTxId),
      payment_mode: 'Cash',
      notes,
      created_by: null,
      worker_name: workerName,
      worker_mobile: null,
      truck_party_name: truckPartyName,
      truck_no: truckNo,
      truck_page_no: truckPageNo,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return id;
  }
}

export const rojmedService = new RojmedService();
export default rojmedService;

