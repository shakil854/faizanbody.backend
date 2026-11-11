import db, { pool } from '../config/db.js';
import { rojmedService } from './rojmed.service.js';

/**
 * In-memory fallback dataset for when MySQL is offline
 */
let memoryWorkers = [];
let nextId = 1;
let memoryTransactions = [];
let nextTxId = 1;

// High-speed short-term query cache for instant responses
let queryCache = null;
let cacheTime = 0;
const CACHE_TTL_MS = 3000; // 3 seconds burst cache for sub-millisecond responses

function invalidateCache() {
  queryCache = null;
  cacheTime = 0;
}

function formatDate(val) {
  if (!val) return null;
  if (typeof val === 'string') return val.split('T')[0];
  if (val instanceof Date) {
    const yyyy = val.getFullYear();
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const dd = String(val.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return val;
}

function formatWorkerRojmedMapping(type, workerName, notes) {
  const cleanNotes = notes ? String(notes).trim() : '';
  if (type === 'salary') {
    const label = 'રોકડા જમા';
    return {
      entry_type: 'aavak',
      sub_type: 'jama',
      particulars: cleanNotes ? `${workerName} - ${cleanNotes}` : `${workerName} - ${label}`,
    };
  }
  const label = type === 'payment' ? 'હિસાબ પેટે' : 'ઉપાડ';
  return {
    entry_type: 'javak',
    sub_type: type === 'payment' ? 'payment' : 'upad',
    particulars: cleanNotes ? `${workerName} - ${label} (${cleanNotes})` : `${workerName} - ${label}`,
  };
}

class WorkerService {
  invalidateCache() {
    invalidateCache();
  }
  async getAllWorkers({ search = '', status = 'all', startDate = '', endDate = '' } = {}) {
    const isDefaultQuery = !search && status === 'all' && !startDate && !endDate;

    // Serve from ultra-fast burst memory cache if available
    if (isDefaultQuery && queryCache && Date.now() - cacheTime < CACHE_TTL_MS) {
      return queryCache;
    }

    try {
      let selectFields = '';
      const params = [];

      if (startDate) {
        selectFields = `
          COALESCE(SUM(CASE WHEN t.type = 'salary' AND t.date >= ? AND t.date <= ? THEN t.amount ELSE 0 END), 0) AS total_salary,
          COALESCE(SUM(CASE WHEN t.type = 'upad' AND t.date >= ? AND t.date <= ? THEN t.amount ELSE 0 END), 0) AS total_upad,
          COALESCE(SUM(CASE WHEN t.type = 'payment' AND t.date >= ? AND t.date <= ? THEN t.amount ELSE 0 END), 0) AS total_paid,
          COALESCE(SUM(CASE WHEN t.date < ? THEN (CASE WHEN t.type IN ('upad', 'payment') THEN t.amount WHEN t.type = 'salary' THEN -t.amount ELSE 0 END) ELSE 0 END), 0) AS opening_balance
        `;
        params.push(startDate, endDate || '9999-12-31', startDate, endDate || '9999-12-31', startDate, endDate || '9999-12-31', startDate);
      } else {
        selectFields = `
          COALESCE(SUM(CASE WHEN t.type = 'salary' THEN t.amount ELSE 0 END), 0) AS total_salary,
          COALESCE(SUM(CASE WHEN t.type = 'upad' THEN t.amount ELSE 0 END), 0) AS total_upad,
          COALESCE(SUM(CASE WHEN t.type = 'payment' THEN t.amount ELSE 0 END), 0) AS total_paid,
          0 AS opening_balance
        `;
      }

      let sql = `
        SELECT 
          w.id, w.name, w.mobile, w.aadhar_card, w.coming_date, w.going_date,
          ${selectFields}
        FROM workers w
        LEFT JOIN worker_transactions t ON w.id = t.worker_id
      `;
      const conditions = [];

      if (search && search.trim()) {
        conditions.push('(w.name LIKE ? OR w.mobile LIKE ?)');
        params.push(`%${search.trim()}%`, `%${search.trim()}%`);
      }

      if (status === 'active') {
        conditions.push('(w.going_date IS NULL OR w.going_date = "")');
      } else if (status === 'relieved') {
        conditions.push('(w.going_date IS NOT NULL AND w.going_date != "")');
      }

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }

      sql += ' GROUP BY w.id ORDER BY w.coming_date DESC, w.id DESC';

      const [rows] = await db.query(sql, params);
      const result = rows.map((w) => {
        const totalSalary = Number(w.total_salary) || 0;
        const totalUpad = Number(w.total_upad) || 0;
        const totalPaid = Number(w.total_paid) || 0;
        const openingBalance = Number(w.opening_balance) || 0; // > 0 means advance B/F, < 0 means credit B/F
        const closingUpad = (openingBalance > 0 ? openingBalance : 0) + totalUpad + totalPaid;
        const closingWork = (openingBalance < 0 ? Math.abs(openingBalance) : 0) + totalSalary;
        const balance = closingWork - closingUpad; // > 0: Payable, < 0: Advance Due

        return {
          id: w.id,
          name: w.name,
          mobile: w.mobile || '',
          aadhar_card: w.aadhar_card || null,
          coming_date: formatDate(w.coming_date),
          going_date: formatDate(w.going_date),
          status: w.going_date ? 'relieved' : 'active',
          khata: {
            total_salary: totalSalary,
            total_upad: totalUpad,
            total_paid: totalPaid,
            opening_balance: openingBalance,
            closing_balance: Math.abs(balance),
            balance: balance,
          },
        };
      });

      if (isDefaultQuery) {
        queryCache = result;
        cacheTime = Date.now();
      }

      return result;
    } catch (error) {
      console.warn('⚠️ [WorkerService DB Warning - Using Memory Store]:', error.message);
      let list = [...memoryWorkers];

      if (search && search.trim()) {
        const query = search.trim().toLowerCase();
        list = list.filter((w) =>
          (w.name && w.name.toLowerCase().includes(query)) ||
          (w.mobile && w.mobile.toLowerCase().includes(query))
        );
      }

      if (status === 'active') {
        list = list.filter((w) => !w.going_date);
      } else if (status === 'relieved') {
        list = list.filter((w) => !!w.going_date);
      }

      list.sort((a, b) => new Date(b.coming_date) - new Date(a.coming_date));

      const result = list.map((w) => {
        const txs = memoryTransactions.filter((t) => {
          if (t.worker_id !== w.id) return false;
          if (startDate && t.date < startDate) return false;
          if (endDate && t.date > endDate) return false;
          return true;
        });
        const totalSalary = txs.filter((t) => t.type === 'salary').reduce((sum, t) => sum + Number(t.amount || 0), 0);
        const totalUpad = txs.filter((t) => t.type === 'upad').reduce((sum, t) => sum + Number(t.amount || 0), 0);
        const totalPaid = txs.filter((t) => t.type === 'payment').reduce((sum, t) => sum + Number(t.amount || 0), 0);
        const balance = totalSalary - (totalUpad + totalPaid);

        return {
          id: w.id,
          name: w.name,
          mobile: w.mobile || '',
          aadhar_card: w.aadhar_card || null,
          coming_date: formatDate(w.coming_date),
          going_date: formatDate(w.going_date),
          status: w.going_date ? 'relieved' : 'active',
          khata: {
            total_salary: totalSalary,
            total_upad: totalUpad,
            total_paid: totalPaid,
            balance: balance,
          },
        };
      });

      if (isDefaultQuery) {
        queryCache = result;
        cacheTime = Date.now();
      }

      return result;
    }
  }

  async getWorkerById(id) {
    const numId = Number(id);
    try {
      const [rows] = await db.query(
        `SELECT 
          w.id, w.name, w.mobile, w.aadhar_card, w.coming_date, w.going_date,
          COALESCE(SUM(CASE WHEN t.type = 'salary' THEN t.amount ELSE 0 END), 0) AS total_salary,
          COALESCE(SUM(CASE WHEN t.type = 'upad' THEN t.amount ELSE 0 END), 0) AS total_upad,
          COALESCE(SUM(CASE WHEN t.type = 'payment' THEN t.amount ELSE 0 END), 0) AS total_paid
        FROM workers w
        LEFT JOIN worker_transactions t ON w.id = t.worker_id
        WHERE w.id = ?
        GROUP BY w.id`,
        [numId]
      );
      if (rows && rows.length > 0) {
        const w = rows[0];
        const totalSalary = Number(w.total_salary) || 0;
        const totalUpad = Number(w.total_upad) || 0;
        const totalPaid = Number(w.total_paid) || 0;
        const balance = totalSalary - (totalUpad + totalPaid);

        return {
          id: w.id,
          name: w.name,
          mobile: w.mobile || '',
          aadhar_card: w.aadhar_card || null,
          coming_date: formatDate(w.coming_date),
          going_date: formatDate(w.going_date),
          status: w.going_date ? 'relieved' : 'active',
          khata: {
            total_salary: totalSalary,
            total_upad: totalUpad,
            total_paid: totalPaid,
            balance: balance,
          },
        };
      }
      return null;
    } catch (error) {
      const w = memoryWorkers.find((item) => item.id === numId);
      if (!w) return null;

      const txs = memoryTransactions.filter((t) => t.worker_id === w.id);
      const totalSalary = txs.filter((t) => t.type === 'salary').reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const totalUpad = txs.filter((t) => t.type === 'upad').reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const totalPaid = txs.filter((t) => t.type === 'payment').reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const balance = totalSalary - (totalUpad + totalPaid);

      return {
        id: w.id,
        name: w.name,
        mobile: w.mobile || '',
        aadhar_card: w.aadhar_card || null,
        coming_date: formatDate(w.coming_date),
        going_date: formatDate(w.going_date),
        status: w.going_date ? 'relieved' : 'active',
        khata: {
          total_salary: totalSalary,
          total_upad: totalUpad,
          total_paid: totalPaid,
          balance: balance,
        },
      };
    }
  }

  async createWorker({ name, mobile = '', aadhar_card = null, coming_date, going_date = null }) {
    const sanitizedName = name.trim();
    const sanitizedMobile = mobile ? String(mobile).trim() : '';
    const finalAadhar = aadhar_card || null;
    const formattedComingDate = formatDate(coming_date);
    const formattedGoingDate = going_date ? formatDate(going_date) : null;

    invalidateCache();

    try {
      const [result] = await db.query(
        'INSERT INTO workers (name, mobile, aadhar_card, coming_date, going_date) VALUES (?, ?, ?, ?, ?)',
        [sanitizedName, sanitizedMobile, finalAadhar, formattedComingDate, formattedGoingDate]
      );
      const insertId = result.insertId;
      return {
        id: insertId,
        name: sanitizedName,
        mobile: sanitizedMobile,
        aadhar_card: finalAadhar,
        coming_date: formattedComingDate,
        going_date: formattedGoingDate,
        status: formattedGoingDate ? 'relieved' : 'active',
      };
    } catch (error) {
      console.warn('⚠️ [WorkerService DB Warning - Using Memory Store]:', error.message);
      const newWorker = {
        id: nextId++,
        name: sanitizedName,
        mobile: sanitizedMobile,
        aadhar_card: finalAadhar,
        coming_date: formattedComingDate,
        going_date: formattedGoingDate,
        status: formattedGoingDate ? 'relieved' : 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      memoryWorkers.push(newWorker);
      return newWorker;
    }
  }

  async updateWorker(id, { name, mobile = '', aadhar_card = null, coming_date, going_date = null }) {
    const numId = Number(id);
    const sanitizedName = name.trim();
    const sanitizedMobile = mobile !== undefined ? String(mobile).trim() : '';
    const formattedComingDate = formatDate(coming_date);
    const formattedGoingDate = going_date ? formatDate(going_date) : null;

    invalidateCache();

    try {
      await db.query(
        'UPDATE workers SET name = ?, mobile = ?, aadhar_card = ?, coming_date = ?, going_date = ? WHERE id = ?',
        [sanitizedName, sanitizedMobile, aadhar_card, formattedComingDate, formattedGoingDate, numId]
      );
      return {
        id: numId,
        name: sanitizedName,
        mobile: sanitizedMobile,
        aadhar_card,
        coming_date: formattedComingDate,
        going_date: formattedGoingDate,
        status: formattedGoingDate ? 'relieved' : 'active',
      };
    } catch (error) {
      console.warn('⚠️ [WorkerService DB Warning - Using Memory Store]:', error.message);
      const index = memoryWorkers.findIndex((item) => item.id === numId);
      if (index === -1) return null;

      memoryWorkers[index] = {
        ...memoryWorkers[index],
        name: sanitizedName,
        mobile: sanitizedMobile,
        aadhar_card: aadhar_card !== undefined ? aadhar_card : memoryWorkers[index].aadhar_card,
        coming_date: formattedComingDate,
        going_date: formattedGoingDate,
        status: formattedGoingDate ? 'relieved' : 'active',
        updated_at: new Date().toISOString(),
      };
      return memoryWorkers[index];
    }
  }

  async deleteWorker(id) {
    const numId = Number(id);
    invalidateCache();

    try {
      await db.query(
        "UPDATE rojmed_entries SET linked_tx_id = NULL WHERE source_type = 'worker' AND source_id = ?",
        [numId]
      ).catch(() => {});
      await db.query('DELETE FROM worker_transactions WHERE worker_id = ?', [numId]).catch(() => {});
      const [result] = await db.query('DELETE FROM workers WHERE id = ?', [numId]);
      return result.affectedRows > 0;
    } catch (error) {
      console.warn('⚠️ [WorkerService DB Warning - Using Memory Store]:', error.message);
      const initialLen = memoryWorkers.length;
      memoryWorkers = memoryWorkers.filter((item) => item.id !== numId);
      memoryTransactions = memoryTransactions.filter((t) => t.worker_id !== numId);
      return memoryWorkers.length < initialLen;
    }
  }

  /**
   * Get all transactions & khata summary for a specific worker
   */
  async getWorkerTransactions(workerId) {
    const numId = Number(workerId);
    try {
      const [rows] = await db.query(
        'SELECT id, worker_id, type, amount, date, notes, payment_mode, rojmed_entry_id, created_at FROM worker_transactions WHERE worker_id = ? ORDER BY date DESC, id DESC',
        [numId]
      );
      const transactions = rows.map((t) => ({
        id: t.id,
        worker_id: t.worker_id,
        type: t.type,
        amount: Number(t.amount) || 0,
        date: formatDate(t.date),
        notes: t.notes || '',
        payment_mode: t.payment_mode || 'Cash',
        rojmed_entry_id: t.rojmed_entry_id ? Number(t.rojmed_entry_id) : null,
        created_at: t.created_at,
      }));

      const totalSalary = transactions.filter((t) => t.type === 'salary').reduce((s, t) => s + t.amount, 0);
      const totalUpad = transactions.filter((t) => t.type === 'upad').reduce((s, t) => s + t.amount, 0);
      const totalPaid = transactions.filter((t) => t.type === 'payment').reduce((s, t) => s + t.amount, 0);
      const balance = totalSalary - (totalUpad + totalPaid);

      return {
        transactions,
        summary: {
          total_salary: totalSalary,
          total_upad: totalUpad,
          total_paid: totalPaid,
          balance,
        },
      };
    } catch (error) {
      console.warn('⚠️ [WorkerService DB Warning - Using Memory Store for Transactions]:', error.message);
      const txs = memoryTransactions
        .filter((t) => t.worker_id === numId)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      const totalSalary = txs.filter((t) => t.type === 'salary').reduce((s, t) => s + Number(t.amount || 0), 0);
      const totalUpad = txs.filter((t) => t.type === 'upad').reduce((s, t) => s + Number(t.amount || 0), 0);
      const totalPaid = txs.filter((t) => t.type === 'payment').reduce((s, t) => s + Number(t.amount || 0), 0);
      const balance = totalSalary - (totalUpad + totalPaid);

      return {
        transactions: txs,
        summary: {
          total_salary: totalSalary,
          total_upad: totalUpad,
          total_paid: totalPaid,
          balance,
        },
      };
    }
  }

  /**
   * Add a new Khata transaction for worker (upad, payment, or salary)
   * Optionally syncs with Daily Rojmed when add_to_rojmed is true and payment_mode is Cash.
   */
  async addWorkerTransaction(
    workerId,
    {
      type,
      amount,
      date,
      notes = '',
      payment_mode = 'Cash',
      add_to_rojmed = false,
      rojmed_entry_id = null,
      _skipRojmedSync = false,
    }
  ) {
    const numWorkerId = Number(workerId);
    const numAmount = Number(amount);
    const formattedDate = formatDate(date) || formatDate(new Date());
    const sanitizedNotes = notes ? String(notes).trim() : '';
    const sanitizedMode = payment_mode ? String(payment_mode).trim() : 'Cash';
    const shouldSyncRojmed = Boolean(add_to_rojmed) && sanitizedMode === 'Cash' && !_skipRojmedSync;

    invalidateCache();

    let conn = null;
    try {
      if (shouldSyncRojmed) {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        const [wRows] = await conn.query('SELECT name FROM workers WHERE id = ? LIMIT 1', [numWorkerId]);
        const workerName = wRows?.[0]?.name || `Worker #${numWorkerId}`;

        const [txResult] = await conn.query(
          'INSERT INTO worker_transactions (worker_id, type, amount, date, notes, payment_mode) VALUES (?, ?, ?, ?, ?, ?)',
          [numWorkerId, type, numAmount, formattedDate, sanitizedNotes, sanitizedMode]
        );
        const txId = txResult.insertId;

        const map = formatWorkerRojmedMapping(type, workerName, sanitizedNotes);
        const [rRes] = await conn.query(
          `INSERT INTO rojmed_entries
            (date, entry_type, amount, particulars, source_type, source_id, sub_type, linked_tx_id, payment_mode, notes)
           VALUES (?, ?, ?, ?, 'worker', ?, ?, ?, 'Cash', ?)`,
          [formattedDate, map.entry_type, numAmount, map.particulars, numWorkerId, map.sub_type, txId, sanitizedNotes || null]
        );
        const linkedRojmedId = rRes.insertId;

        await conn.query('UPDATE worker_transactions SET rojmed_entry_id = ? WHERE id = ?', [linkedRojmedId, txId]);
        await conn.commit();

        return {
          id: txId,
          worker_id: numWorkerId,
          type,
          amount: numAmount,
          date: formattedDate,
          notes: sanitizedNotes,
          payment_mode: sanitizedMode,
          rojmed_entry_id: linkedRojmedId,
          created_at: new Date().toISOString(),
        };
      }

      const [result] = await db.query(
        'INSERT INTO worker_transactions (worker_id, type, amount, date, notes, payment_mode, rojmed_entry_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [numWorkerId, type, numAmount, formattedDate, sanitizedNotes, sanitizedMode, rojmed_entry_id]
      );

      return {
        id: result.insertId,
        worker_id: numWorkerId,
        type,
        amount: numAmount,
        date: formattedDate,
        notes: sanitizedNotes,
        payment_mode: sanitizedMode,
        rojmed_entry_id: rojmed_entry_id ? Number(rojmed_entry_id) : null,
        created_at: new Date().toISOString(),
      };
    } catch (error) {
      if (conn) await conn.rollback().catch(() => {});
      console.warn('⚠️ [WorkerService DB Warning - Using Memory Store for Transaction Insert]:', error.message);
      const txId = nextTxId++;
      let finalRojmedId = rojmed_entry_id ? Number(rojmed_entry_id) : null;

      if (shouldSyncRojmed) {
        const w = memoryWorkers.find((item) => item.id === numWorkerId);
        const workerName = w?.name || `Worker #${numWorkerId}`;
        const map = formatWorkerRojmedMapping(type, workerName, sanitizedNotes);
        finalRojmedId = rojmedService.syncMemoryFromLinkedTx({
          action: 'create',
          sourceType: 'worker',
          sourceId: numWorkerId,
          linkedTxId: txId,
          entryType: map.entry_type,
          subType: map.sub_type,
          amount: numAmount,
          date: formattedDate,
          particulars: map.particulars,
          notes: sanitizedNotes,
          workerName,
        });
      }

      const newTx = {
        id: txId,
        worker_id: numWorkerId,
        type,
        amount: numAmount,
        date: formattedDate,
        notes: sanitizedNotes,
        payment_mode: sanitizedMode,
        rojmed_entry_id: finalRojmedId,
        created_at: new Date().toISOString(),
      };
      memoryTransactions.push(newTx);
      return newTx;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Update an existing Khata transaction (and sync linked Rojmed entry if applicable)
   */
  async updateWorkerTransaction(
    transactionId,
    { worker_id, type, amount, date, notes = '', payment_mode = 'Cash', add_to_rojmed, _skipRojmedSync = false }
  ) {
    const numId = Number(transactionId);
    const numAmount = Number(amount);
    const formattedDate = formatDate(date) || formatDate(new Date());
    const sanitizedNotes = notes !== undefined ? String(notes).trim() : '';
    const sanitizedMode = payment_mode ? String(payment_mode).trim() : 'Cash';

    invalidateCache();

    let conn = null;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [existingRows] = await conn.query(
        `SELECT wt.*, w.name AS worker_name
         FROM worker_transactions wt
         LEFT JOIN workers w ON wt.worker_id = w.id
         WHERE wt.id = ? LIMIT 1`,
        [numId]
      );
      if (!existingRows || existingRows.length === 0) {
        await conn.rollback();
        return null;
      }
      const existing = existingRows[0];
      const targetWorkerId = worker_id ? Number(worker_id) : Number(existing.worker_id);

      let workerName = existing.worker_name || `Worker #${targetWorkerId}`;
      if (worker_id && Number(worker_id) !== Number(existing.worker_id)) {
        const [wRows] = await conn.query('SELECT name FROM workers WHERE id = ? LIMIT 1', [targetWorkerId]);
        workerName = wRows?.[0]?.name || workerName;
      }

      let finalRojmedId = existing.rojmed_entry_id ? Number(existing.rojmed_entry_id) : null;

      await conn.query(
        'UPDATE worker_transactions SET worker_id = ?, type = ?, amount = ?, date = ?, notes = ?, payment_mode = ? WHERE id = ?',
        [targetWorkerId, type, numAmount, formattedDate, sanitizedNotes, sanitizedMode, numId]
      );

      if (!_skipRojmedSync) {
        const wantRojmed = add_to_rojmed !== undefined ? Boolean(add_to_rojmed) : Boolean(finalRojmedId);
        const canStayInRojmed = wantRojmed && sanitizedMode === 'Cash';

        if (finalRojmedId && !canStayInRojmed) {
          await conn.query('DELETE FROM rojmed_entries WHERE id = ?', [finalRojmedId]);
          await conn.query('UPDATE worker_transactions SET rojmed_entry_id = NULL WHERE id = ?', [numId]);
          finalRojmedId = null;
        } else if (finalRojmedId && canStayInRojmed) {
          const map = formatWorkerRojmedMapping(type, workerName, sanitizedNotes);
          await conn.query(
            `UPDATE rojmed_entries
             SET date = ?, entry_type = ?, amount = ?, particulars = ?, source_id = ?, sub_type = ?, notes = ?
             WHERE id = ?`,
            [formattedDate, map.entry_type, numAmount, map.particulars, targetWorkerId, map.sub_type, sanitizedNotes || null, finalRojmedId]
          );
        } else if (!finalRojmedId && canStayInRojmed) {
          const map = formatWorkerRojmedMapping(type, workerName, sanitizedNotes);
          const [rRes] = await conn.query(
            `INSERT INTO rojmed_entries
              (date, entry_type, amount, particulars, source_type, source_id, sub_type, linked_tx_id, payment_mode, notes)
             VALUES (?, ?, ?, ?, 'worker', ?, ?, ?, 'Cash', ?)`,
            [formattedDate, map.entry_type, numAmount, map.particulars, targetWorkerId, map.sub_type, numId, sanitizedNotes || null]
          );
          finalRojmedId = rRes.insertId;
          await conn.query('UPDATE worker_transactions SET rojmed_entry_id = ? WHERE id = ?', [finalRojmedId, numId]);
        }
      }

      await conn.commit();
      const [rows] = await db.query(
        'SELECT id, worker_id, type, amount, date, notes, payment_mode, rojmed_entry_id, created_at FROM worker_transactions WHERE id = ?',
        [numId]
      );
      const row = rows[0];
      return row
        ? {
            id: row.id,
            worker_id: row.worker_id,
            type: row.type,
            amount: Number(row.amount) || 0,
            date: formatDate(row.date),
            notes: row.notes || '',
            payment_mode: row.payment_mode || 'Cash',
            rojmed_entry_id: row.rojmed_entry_id ? Number(row.rojmed_entry_id) : null,
            created_at: row.created_at,
          }
        : null;
    } catch (error) {
      if (conn) await conn.rollback().catch(() => {});
      console.warn('⚠️ [WorkerService DB Warning - Using Memory Store for Transaction Update]:', error.message);
      const idx = memoryTransactions.findIndex((t) => t.id === numId);
      if (idx === -1) return null;

      const existing = memoryTransactions[idx];
      const targetWorkerId = worker_id ? Number(worker_id) : existing.worker_id;
      let finalRojmedId = existing.rojmed_entry_id || null;

      if (!_skipRojmedSync) {
        const w = memoryWorkers.find((item) => item.id === targetWorkerId);
        const workerName = w?.name || `Worker #${targetWorkerId}`;
        const wantRojmed = add_to_rojmed !== undefined ? Boolean(add_to_rojmed) : Boolean(finalRojmedId);
        const canStayInRojmed = wantRojmed && sanitizedMode === 'Cash';

        if (finalRojmedId && !canStayInRojmed) {
          rojmedService.syncMemoryFromLinkedTx({ action: 'delete', rojmedEntryId: finalRojmedId });
          finalRojmedId = null;
        } else if (canStayInRojmed) {
          const map = formatWorkerRojmedMapping(type, workerName, sanitizedNotes);
          finalRojmedId = rojmedService.syncMemoryFromLinkedTx({
            action: finalRojmedId ? 'update' : 'create',
            rojmedEntryId: finalRojmedId,
            sourceType: 'worker',
            sourceId: targetWorkerId,
            linkedTxId: numId,
            entryType: map.entry_type,
            subType: map.sub_type,
            amount: numAmount,
            date: formattedDate,
            particulars: map.particulars,
            notes: sanitizedNotes,
            workerName,
          });
        }
      }

      memoryTransactions[idx] = {
        ...existing,
        worker_id: targetWorkerId,
        type,
        amount: numAmount,
        date: formattedDate,
        notes: sanitizedNotes,
        payment_mode: sanitizedMode,
        rojmed_entry_id: finalRojmedId,
      };
      return memoryTransactions[idx];
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Delete a transaction record (and its linked Rojmed entry if any)
   */
  async deleteWorkerTransaction(transactionId, { _skipRojmedSync = false } = {}) {
    const numId = Number(transactionId);
    invalidateCache();

    let conn = null;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [existingRows] = await conn.query(
        'SELECT rojmed_entry_id FROM worker_transactions WHERE id = ? LIMIT 1',
        [numId]
      );
      if (!existingRows || existingRows.length === 0) {
        await conn.rollback();
        return false;
      }
      const linkedRojmedId = existingRows[0].rojmed_entry_id;

      const [result] = await conn.query('DELETE FROM worker_transactions WHERE id = ?', [numId]);
      if (!_skipRojmedSync && linkedRojmedId) {
        await conn.query('DELETE FROM rojmed_entries WHERE id = ?', [linkedRojmedId]);
      }

      await conn.commit();
      return result.affectedRows > 0;
    } catch (error) {
      if (conn) await conn.rollback().catch(() => {});
      console.warn('⚠️ [WorkerService DB Warning - Using Memory Store for Transaction Delete]:', error.message);
      const existing = memoryTransactions.find((t) => t.id === numId);
      if (!existing) return false;
      if (!_skipRojmedSync && existing.rojmed_entry_id) {
        rojmedService.syncMemoryFromLinkedTx({ action: 'delete', rojmedEntryId: existing.rojmed_entry_id });
      }
      memoryTransactions = memoryTransactions.filter((t) => t.id !== numId);
      return true;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Get overall workshop-wide Khata summary
   */
  async getWorkshopKhataSummary({ startDate = '', endDate = '' } = {}) {
    try {
      let whereClause = '';
      const params = [];
      const conds = [];
      if (startDate) {
        conds.push('date >= ?');
        params.push(startDate);
      }
      if (endDate) {
        conds.push('date <= ?');
        params.push(endDate);
      }
      if (conds.length > 0) {
        whereClause = `WHERE ${conds.join(' AND ')}`;
      }

      const [rows] = await db.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN type = 'salary' THEN amount ELSE 0 END), 0) AS total_salary,
          COALESCE(SUM(CASE WHEN type = 'upad' THEN amount ELSE 0 END), 0) AS total_upad,
          COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END), 0) AS total_paid
        FROM worker_transactions
        ${whereClause}
      `, params);
      const totalSalary = Number(rows[0]?.total_salary) || 0;
      const totalUpad = Number(rows[0]?.total_upad) || 0;
      const totalPaid = Number(rows[0]?.total_paid) || 0;
      const balance = totalSalary - (totalUpad + totalPaid);

      return {
        total_salary: totalSalary,
        total_upad: totalUpad,
        total_paid: totalPaid,
        balance,
      };
    } catch (error) {
      console.warn('⚠️ [WorkerService Khata Summary DB Warning]:', error.message);
      const txs = memoryTransactions.filter((t) => {
        if (startDate && t.date < startDate) return false;
        if (endDate && t.date > endDate) return false;
        return true;
      });
      const totalSalary = txs.filter((t) => t.type === 'salary').reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const totalUpad = txs.filter((t) => t.type === 'upad').reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const totalPaid = txs.filter((t) => t.type === 'payment').reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const balance = totalSalary - (totalUpad + totalPaid);

      return {
        total_salary: totalSalary,
        total_upad: totalUpad,
        total_paid: totalPaid,
        balance,
      };
    }
  }
}

export const workerService = new WorkerService();

