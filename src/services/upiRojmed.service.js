import db from '../config/db.js';
import { workerService } from './worker.service.js';
import { truckAccountService } from './truckAccount.service.js';
import { vyapariService } from './vyapari.service.js';

let memoryUpiAccounts = [];
let nextUpiAccountId = 1;

let memoryUpiTransactions = [];
let nextUpiTxId = 1;

function formatLocalDate(val) {
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

const VALID_TYPES = ['truck_account', 'vyapari_account', 'worker', 'general'];

function formatTxRow(r) {
  const inferredType =
    r.entry_type === 'javak' || r.entry_type === 'aavak'
      ? r.entry_type
      : r.from_type === 'general' && r.to_type !== 'general'
        ? 'javak'
        : 'aavak';

  return {
    id: r.id,
    date: formatLocalDate(r.date),
    entry_type: inferredType,
    amount: Number(r.amount) || 0,
    particulars: r.particulars || '',
    from_type: r.from_type || 'general',
    from_id: r.from_id ? Number(r.from_id) : null,
    from_label: r.from_label || 'General',
    from_linked_tx_id: r.from_linked_tx_id ? Number(r.from_linked_tx_id) : null,
    to_type: r.to_type || 'general',
    to_id: r.to_id ? Number(r.to_id) : null,
    to_label: r.to_label || 'General',
    to_mode: r.to_mode || (inferredType === 'aavak' ? 'balance' : 'khata'),
    to_linked_tx_id: r.to_linked_tx_id ? Number(r.to_linked_tx_id) : null,
    notes: r.notes || '',
    created_by: r.created_by || null,
    created_at: r.created_at,
  };
}

class UpiRojmedService {
  async getUpiAccounts() {
    return memoryUpiAccounts;
  }

  async createUpiAccount(data) {
    return { id: nextUpiAccountId++, ...data };
  }

  async updateUpiAccount() {
    return null;
  }

  async deleteUpiAccount() {
    return { success: true };
  }

  async getUpiOptions() {
    const [workers, truckAccounts, vyapariAccounts] = await Promise.all([
      workerService.getAllWorkers().catch(() => []),
      truckAccountService.getAllAccounts().catch(() => []),
      vyapariService.getAllAccounts().catch(() => []),
    ]);

    return {
      workers: (workers || []).map((w) => ({ id: w.id, name: w.name, mobile: w.mobile || '' })),
      truck_accounts: (truckAccounts || []).map((t) => ({
        id: t.id,
        party_name: t.party_name,
        truck_no: t.truck_no || '',
        page_no: t.page_no ?? null,
        balance: Number(t.balance) || 0,
      })),
      vyapari_accounts: (vyapariAccounts || []).map((v) => ({
        id: v.id,
        party_name: v.party_name,
        firm_name: v.firm_name || '',
        page_no: v.page_no ?? null,
        balance: Number(v.balance) || 0,
      })),
    };
  }

  _isBalanceTransfer(r) {
    return r.entry_type === 'javak' && r.to_type !== 'general' && r.to_mode === 'balance';
  }

  _isDirectKhataPassThrough(r) {
    return r.entry_type !== 'javak' && r.to_type !== 'general' && r.to_mode === 'khata';
  }

  _buildDailySheet(targetDate, allRows) {
    // Opening UPI Silak:
    // - aavak with to_mode='balance' or general: +amount
    // - aavak with to_mode='khata' (directly paid to To's Khata): 0 net (+amount in Aavak, -amount in Javak)
    // - javak paid out (to_mode='khata' or general): -amount
    // - javak internal balance transfer (to_mode='balance'): 0 net
    const beforeRows = allRows.filter((r) => r.date < targetDate);
    const openingSilak = beforeRows.reduce((sum, r) => {
      if (this._isBalanceTransfer(r) || this._isDirectKhataPassThrough(r)) return sum;
      return sum + (r.entry_type === 'javak' ? -r.amount : r.amount);
    }, 0);

    const dayRows = allRows.filter((r) => r.date === targetDate);
    const aavakEntries = dayRows.filter((r) => r.entry_type !== 'javak');
    // Include direct Khata pass-through entries in Javak too so Aavak - Javak = 0 Silak
    const javakEntries = dayRows.filter(
      (r) => r.entry_type === 'javak' || this._isDirectKhataPassThrough(r)
    );

    const totalAavak = aavakEntries.reduce((s, e) => s + e.amount, 0);
    // Only actual paid-out javak (and pass-throughs) reduce Total UPI Silak; balance transfers stay inside our UPI Silak
    const totalJavakPaid = javakEntries
      .filter((e) => !this._isBalanceTransfer(e))
      .reduce((s, e) => s + e.amount, 0);
    const totalAavakWithOpening = openingSilak + totalAavak;
    const closingSilak = totalAavakWithOpening - totalJavakPaid;

    // Account-wise UPI money held:
    // - On AAVAK (only when kept as UPI balance, NOT when directly paid to Khata): `to` gets +amount
    // - On JAVAK (paid to Khata / General): `from` gets -amount
    // - On JAVAK (kept as UPI Balance): moves from `from` (-amount) to `to` (+amount)
    const heldMap = new Map();
    const addHeld = (type, id, label, delta) => {
      const cleanType = type || 'general';
      const key = cleanType === 'general' ? 'general:0' : `${cleanType}:${id}`;
      const cleanLabel = cleanType === 'general' ? 'પોતાનું UPI (General)' : (label || `${cleanType} #${id}`);
      if (!heldMap.has(key)) {
        heldMap.set(key, { type: cleanType, id: cleanType === 'general' ? 0 : id, label: cleanLabel, balance: 0 });
      }
      heldMap.get(key).balance += delta;
    };

    allRows
      .filter((r) => r.date <= targetDate)
      .forEach((r) => {
        if (r.entry_type === 'javak') {
          addHeld(r.from_type, r.from_id, r.from_label, -r.amount);
          if (this._isBalanceTransfer(r)) {
            addHeld(r.to_type, r.to_id, r.to_label, r.amount);
          }
        } else if (!this._isDirectKhataPassThrough(r)) {
          addHeld(r.to_type, r.to_id, r.to_label, r.amount);
        }
      });

    const accountBalances = Array.from(heldMap.values())
      .map((b) => ({ ...b, balance: Number(b.balance.toFixed(2)) }))
      .filter((b) => b.balance !== 0)
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

    return {
      date: targetDate,
      opening_silak: Number(openingSilak.toFixed(2)),
      aavak_entries: aavakEntries,
      javak_entries: javakEntries,
      total_aavak_entries: Number(totalAavak.toFixed(2)),
      total_aavak_with_opening: Number(totalAavakWithOpening.toFixed(2)),
      total_javak: Number(totalJavakPaid.toFixed(2)),
      closing_silak: Number(closingSilak.toFixed(2)),
      account_balances: accountBalances,
      total_entries_count: dayRows.length,
    };
  }

  async getDailyUpiSheet(targetDateInput) {
    const targetDate = formatLocalDate(targetDateInput) || getTodayDate();
    let allRows = [];

    try {
      const [rows] = await db.query('SELECT * FROM upi_transactions ORDER BY date ASC, id ASC');
      allRows = (rows || []).map(formatTxRow);
    } catch (err) {
      console.warn('⚠️ [UpiRojmedService getDailySheet DB Fallback]:', err.message);
      allRows = memoryUpiTransactions
        .map(formatTxRow)
        .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.id - b.id);
    }

    return this._buildDailySheet(targetDate, allRows);
  }

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

    let allRows = [];
    try {
      const [rows] = await db.query('SELECT * FROM upi_transactions ORDER BY date ASC, id ASC');
      allRows = (rows || []).map(formatTxRow);
    } catch (err) {
      console.warn('⚠️ [UpiRojmedService getPeriodSummary DB Fallback]:', err.message);
      allRows = memoryUpiTransactions
        .map(formatTxRow)
        .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.id - b.id);
    }

    const beforeRows = allRows.filter((r) => r.date < rangeStart);
    const startOpening = beforeRows.reduce((sum, r) => {
      if (this._isBalanceTransfer(r) || this._isDirectKhataPassThrough(r)) return sum;
      return sum + (r.entry_type === 'javak' ? -r.amount : r.amount);
    }, 0);

    const periodRows = allRows.filter((r) => r.date >= rangeStart && r.date <= rangeEnd);
    const datesSet = new Set(periodRows.map((r) => r.date));
    const sortedDates = Array.from(datesSet).sort();

    let runningBalance = startOpening;
    let totalAavak = 0;
    let totalJavak = 0;

    const days = sortedDates.map((d) => {
      const dayRows = periodRows.filter((r) => r.date === d);
      const dayAavak = dayRows
        .filter((r) => r.entry_type !== 'javak')
        .reduce((s, r) => s + r.amount, 0);
      const dayJavak = dayRows
        .filter((r) => (r.entry_type === 'javak' || this._isDirectKhataPassThrough(r)) && !this._isBalanceTransfer(r))
        .reduce((s, r) => s + r.amount, 0);

      const dayOpen = runningBalance;
      const dayClose = dayOpen + dayAavak - dayJavak;
      runningBalance = dayClose;
      totalAavak += dayAavak;
      totalJavak += dayJavak;

      return {
        date: d,
        opening_silak: Number(dayOpen.toFixed(2)),
        total_aavak: Number(dayAavak.toFixed(2)),
        total_javak: Number(dayJavak.toFixed(2)),
        closing_silak: Number(dayClose.toFixed(2)),
        entry_count: dayRows.length,
      };
    });

    return {
      start_date: rangeStart,
      end_date: rangeEnd,
      opening_silak: Number(startOpening.toFixed(2)),
      total_aavak: Number(totalAavak.toFixed(2)),
      total_javak: Number(totalJavak.toFixed(2)),
      closing_silak: Number(runningBalance.toFixed(2)),
      days,
    };
  }

  async _resolveEntityLabel(type, id) {
    if (type === 'general' || !id) return 'General (પોતાનું UPI)';
    const numId = Number(id);
    if (type === 'truck_account') {
      const found = await truckAccountService.getAccountById(numId);
      if (!found) throw new Error('Selected Truck Account not found');
      return found.truck_no ? `${found.party_name} (${found.truck_no})` : found.party_name;
    }
    if (type === 'vyapari_account') {
      const found = await vyapariService.getAccountById(numId);
      if (!found) throw new Error('Selected Vyapari Account not found');
      return found.firm_name ? `${found.party_name} (${found.firm_name})` : found.party_name;
    }
    if (type === 'worker') {
      const found = await workerService.getWorkerById(numId);
      if (!found) throw new Error('Selected Worker not found');
      return found.name;
    }
    return 'General (પોતાનું UPI)';
  }

  async _createSideLinkedEntry({ side, type, id, amount, date, particulars, notes }) {
    if (!id || type === 'general') return null;
    const isFrom = side === 'from';
    const cleanNote = notes || particulars;

    if (type === 'truck_account') {
      const created = await truckAccountService.addEntry(id, {
        type: isFrom ? 'jama' : 'udhar',
        amount,
        date,
        particulars: cleanNote,
        payment_mode: 'UPI',
        _skipRojmedSync: true,
      });
      return created?.id || null;
    }

    if (type === 'vyapari_account') {
      const created = await vyapariService.addEntry(id, {
        type: isFrom ? 'jama' : 'udhar',
        amount,
        date,
        particulars: cleanNote,
        payment_mode: 'UPI',
        _skipRojmedSync: true,
      });
      return created?.id || null;
    }

    if (type === 'worker') {
      const created = await workerService.addWorkerTransaction(id, {
        type: isFrom ? 'salary' : 'upad',
        amount,
        date,
        notes: cleanNote,
        payment_mode: 'UPI',
        _skipRojmedSync: true,
      });
      return created?.id || null;
    }

    return null;
  }

  async _deleteSideLinkedEntry(type, accountId, linkedTxId) {
    if (!linkedTxId || !type || type === 'general') return;
    try {
      if (type === 'truck_account' && accountId) {
        await truckAccountService.deleteEntry(accountId, linkedTxId, { _skipRojmedSync: true });
      } else if (type === 'vyapari_account' && accountId) {
        await vyapariService.deleteEntry(accountId, linkedTxId, { _skipRojmedSync: true });
      } else if (type === 'worker') {
        await workerService.deleteWorkerTransaction(linkedTxId, { _skipRojmedSync: true });
      }
    } catch (err) {
      console.warn('⚠️ [UpiRojmedService unlink warning]:', err.message);
    }
  }

  async createUpiTransaction(payload, userId = null) {
    const cleanDate = formatLocalDate(payload.date) || getTodayDate();
    const numAmount = Number(payload.amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      throw new Error('Valid positive amount is required');
    }

    const entryType = payload.entry_type === 'javak' ? 'javak' : 'aavak';
    const fromType = VALID_TYPES.includes(payload.from_type) ? payload.from_type : 'general';
    const toType = VALID_TYPES.includes(payload.to_type) ? payload.to_type : 'general';
    const toMode = payload.to_mode === 'balance' ? 'balance' : 'khata';
    const fromId = fromType === 'general' ? null : (payload.from_id ? Number(payload.from_id) : null);
    const toId = toType === 'general' ? null : (payload.to_id ? Number(payload.to_id) : null);

    if (fromType !== 'general' && !fromId) {
      throw new Error('Please select From account');
    }
    if (toType !== 'general' && !toId) {
      throw new Error('Please select To account');
    }
    if (fromType !== 'general' && fromType === toType && fromId === toId) {
      throw new Error('From and To accounts cannot be the same');
    }

    const fromLabel = await this._resolveEntityLabel(fromType, fromId);
    const toLabel = await this._resolveEntityLabel(toType, toId);
    const cleanNotes = (payload.notes || '').trim();
    const cleanParticulars =
      (payload.particulars || '').trim() ||
      (entryType === 'aavak' ? `${fromLabel} ➔ ${toLabel}` : `${fromLabel} ➔ ${toLabel}`);

    // On AAVAK: only `from` (who paid us) gets a Jama entry in their Khata; `to` holds our UPI balance.
    // On JAVAK: only `to` (who we paid) gets an Udhar/Upad entry in their Khata; `from` deducts from held UPI balance.
    const fromLinkedTxId =
      entryType === 'aavak'
        ? await this._createSideLinkedEntry({
          side: 'from',
          type: fromType,
          id: fromId,
          amount: numAmount,
          date: cleanDate,
          particulars: cleanParticulars,
          notes: cleanNotes,
        })
        : null;

    const toLinkedTxId =
      toMode === 'khata'
        ? await this._createSideLinkedEntry({
          side: 'to',
          type: toType,
          id: toId,
          amount: numAmount,
          date: cleanDate,
          particulars: cleanParticulars,
          notes: cleanNotes,
        })
        : null;

    try {
      const [res] = await db.query(
        `INSERT INTO upi_transactions
          (date, entry_type, amount, particulars, from_type, from_id, from_label, from_linked_tx_id,
           to_type, to_id, to_label, to_mode, to_linked_tx_id, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cleanDate,
          entryType,
          numAmount,
          cleanParticulars,
          fromType,
          fromId,
          fromLabel,
          fromLinkedTxId,
          toType,
          toId,
          toLabel,
          toMode,
          toLinkedTxId,
          cleanNotes || null,
          userId,
        ]
      );
      const sheet = await this.getDailyUpiSheet(cleanDate);
      return { id: res.insertId, sheet };
    } catch (err) {
      console.warn('⚠️ [UpiRojmedService createTx DB Fallback]:', err.message);
      const tx = {
        id: nextUpiTxId++,
        date: cleanDate,
        entry_type: entryType,
        amount: numAmount,
        particulars: cleanParticulars,
        from_type: fromType,
        from_id: fromId,
        from_label: fromLabel,
        from_linked_tx_id: fromLinkedTxId,
        to_type: toType,
        to_id: toId,
        to_label: toLabel,
        to_mode: toMode,
        to_linked_tx_id: toLinkedTxId,
        notes: cleanNotes,
        created_by: userId,
        created_at: new Date().toISOString(),
      };
      memoryUpiTransactions.push(tx);
      const sheet = await this.getDailyUpiSheet(cleanDate);
      return { id: tx.id, sheet };
    }
  }

  async updateUpiTransaction(id, payload) {
    const numId = Number(id);
    const cleanDate = formatLocalDate(payload.date) || getTodayDate();
    const numAmount = Number(payload.amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      throw new Error('Valid positive amount is required');
    }

    const entryType = payload.entry_type === 'javak' ? 'javak' : 'aavak';
    const fromType = VALID_TYPES.includes(payload.from_type) ? payload.from_type : 'general';
    const toType = VALID_TYPES.includes(payload.to_type) ? payload.to_type : 'general';
    const toMode = payload.to_mode === 'balance' ? 'balance' : 'khata';
    const fromId = fromType === 'general' ? null : (payload.from_id ? Number(payload.from_id) : null);
    const toId = toType === 'general' ? null : (payload.to_id ? Number(payload.to_id) : null);

    if (fromType !== 'general' && !fromId) throw new Error('Please select From account');
    if (toType !== 'general' && !toId) throw new Error('Please select To account');
    if (fromType !== 'general' && fromType === toType && fromId === toId) {
      throw new Error('From and To accounts cannot be the same');
    }

    let existing = null;
    try {
      const [rows] = await db.query('SELECT * FROM upi_transactions WHERE id = ? LIMIT 1', [numId]);
      if (!rows || rows.length === 0) return null;
      existing = formatTxRow(rows[0]);

      await this._deleteSideLinkedEntry(existing.from_type, existing.from_id, existing.from_linked_tx_id);
      await this._deleteSideLinkedEntry(existing.to_type, existing.to_id, existing.to_linked_tx_id);

      const fromLabel = await this._resolveEntityLabel(fromType, fromId);
      const toLabel = await this._resolveEntityLabel(toType, toId);
      const cleanNotes = (payload.notes || '').trim();
      const cleanParticulars = (payload.particulars || '').trim() || `${fromLabel} ➔ ${toLabel}`;

      const fromLinkedTxId =
        entryType === 'aavak'
          ? await this._createSideLinkedEntry({
            side: 'from',
            type: fromType,
            id: fromId,
            amount: numAmount,
            date: cleanDate,
            particulars: cleanParticulars,
            notes: cleanNotes,
          })
          : null;

      const toLinkedTxId =
        toMode === 'khata'
          ? await this._createSideLinkedEntry({
            side: 'to',
            type: toType,
            id: toId,
            amount: numAmount,
            date: cleanDate,
            particulars: cleanParticulars,
            notes: cleanNotes,
          })
          : null;

      await db.query(
        `UPDATE upi_transactions
         SET date = ?, entry_type = ?, amount = ?, particulars = ?,
             from_type = ?, from_id = ?, from_label = ?, from_linked_tx_id = ?,
             to_type = ?, to_id = ?, to_label = ?, to_mode = ?, to_linked_tx_id = ?, notes = ?
         WHERE id = ?`,
        [
          cleanDate,
          entryType,
          numAmount,
          cleanParticulars,
          fromType,
          fromId,
          fromLabel,
          fromLinkedTxId,
          toType,
          toId,
          toLabel,
          toMode,
          toLinkedTxId,
          cleanNotes || null,
          numId,
        ]
      );

      const sheet = await this.getDailyUpiSheet(cleanDate);
      return { id: numId, sheet };
    } catch (err) {
      console.warn('⚠️ [UpiRojmedService updateTx DB Fallback]:', err.message);
      const idx = memoryUpiTransactions.findIndex((t) => t.id === numId);
      if (idx === -1) return null;
      existing = memoryUpiTransactions[idx];
      await this._deleteSideLinkedEntry(existing.from_type, existing.from_id, existing.from_linked_tx_id);
      await this._deleteSideLinkedEntry(existing.to_type, existing.to_id, existing.to_linked_tx_id);

      const fromLabel = await this._resolveEntityLabel(fromType, fromId);
      const toLabel = await this._resolveEntityLabel(toType, toId);
      const cleanNotes = (payload.notes || '').trim();
      const cleanParticulars = (payload.particulars || '').trim() || `${fromLabel} ➔ ${toLabel}`;

      const fromLinkedTxId =
        entryType === 'aavak'
          ? await this._createSideLinkedEntry({
            side: 'from',
            type: fromType,
            id: fromId,
            amount: numAmount,
            date: cleanDate,
            particulars: cleanParticulars,
            notes: cleanNotes,
          })
          : null;
      const toLinkedTxId =
        toMode === 'khata'
          ? await this._createSideLinkedEntry({
            side: 'to',
            type: toType,
            id: toId,
            amount: numAmount,
            date: cleanDate,
            particulars: cleanParticulars,
            notes: cleanNotes,
          })
          : null;

      memoryUpiTransactions[idx] = {
        ...existing,
        date: cleanDate,
        entry_type: entryType,
        amount: numAmount,
        particulars: cleanParticulars,
        from_type: fromType,
        from_id: fromId,
        from_label: fromLabel,
        from_linked_tx_id: fromLinkedTxId,
        to_type: toType,
        to_id: toId,
        to_label: toLabel,
        to_mode: toMode,
        to_linked_tx_id: toLinkedTxId,
        notes: cleanNotes,
      };
      const sheet = await this.getDailyUpiSheet(cleanDate);
      return { id: numId, sheet };
    }
  }

  async deleteUpiTransaction(id) {
    const numId = Number(id);
    let existing = null;

    try {
      const [rows] = await db.query('SELECT * FROM upi_transactions WHERE id = ? LIMIT 1', [numId]);
      if (!rows || rows.length === 0) return null;
      existing = formatTxRow(rows[0]);

      await this._deleteSideLinkedEntry(existing.from_type, existing.from_id, existing.from_linked_tx_id);
      await this._deleteSideLinkedEntry(existing.to_type, existing.to_id, existing.to_linked_tx_id);

      await db.query('DELETE FROM upi_transactions WHERE id = ?', [numId]);
      const sheet = await this.getDailyUpiSheet(existing.date);
      return { deleted_id: numId, sheet };
    } catch (err) {
      console.warn('⚠️ [UpiRojmedService deleteTx DB Fallback]:', err.message);
      const idx = memoryUpiTransactions.findIndex((t) => t.id === numId);
      if (idx === -1) return null;
      existing = memoryUpiTransactions[idx];
      await this._deleteSideLinkedEntry(existing.from_type, existing.from_id, existing.from_linked_tx_id);
      await this._deleteSideLinkedEntry(existing.to_type, existing.to_id, existing.to_linked_tx_id);
      memoryUpiTransactions.splice(idx, 1);
      const sheet = await this.getDailyUpiSheet(existing.date);
      return { deleted_id: numId, sheet };
    }
  }
}

export const upiRojmedService = new UpiRojmedService();
export default upiRojmedService;
