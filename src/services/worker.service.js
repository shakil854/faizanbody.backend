import db from '../config/db.js';

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

class WorkerService {
  async getAllWorkers({ search = '', status = 'all' } = {}) {
    const isDefaultQuery = !search && status === 'all';

    // Serve from ultra-fast burst memory cache if available
    if (isDefaultQuery && queryCache && Date.now() - cacheTime < CACHE_TTL_MS) {
      return queryCache;
    }

    try {
      let sql = `
        SELECT 
          w.id, w.name, w.mobile, w.aadhar_card, w.coming_date, w.going_date,
          COALESCE(SUM(CASE WHEN t.type = 'salary' THEN t.amount ELSE 0 END), 0) AS total_salary,
          COALESCE(SUM(CASE WHEN t.type = 'upad' THEN t.amount ELSE 0 END), 0) AS total_upad,
          COALESCE(SUM(CASE WHEN t.type = 'payment' THEN t.amount ELSE 0 END), 0) AS total_paid
        FROM workers w
        LEFT JOIN worker_transactions t ON w.id = t.worker_id
      `;
      const conditions = [];
      const params = [];

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
      const [result] = await db.query('DELETE FROM workers WHERE id = ?', [numId]);
      return result.affectedRows > 0;
    } catch (error) {
      console.warn('⚠️ [WorkerService DB Warning - Using Memory Store]:', error.message);
      const initialLen = memoryWorkers.length;
      memoryWorkers = memoryWorkers.filter((item) => item.id !== numId);
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
        'SELECT id, worker_id, type, amount, date, notes, payment_mode, created_at FROM worker_transactions WHERE worker_id = ? ORDER BY date DESC, id DESC',
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
   */
  async addWorkerTransaction(workerId, { type, amount, date, notes = '', payment_mode = 'Cash' }) {
    const numWorkerId = Number(workerId);
    const numAmount = Number(amount);
    const formattedDate = formatDate(date) || new Date().toISOString().split('T')[0];
    const sanitizedNotes = notes ? String(notes).trim() : '';
    const sanitizedMode = payment_mode ? String(payment_mode).trim() : 'Cash';

    invalidateCache();

    try {
      const [result] = await db.query(
        'INSERT INTO worker_transactions (worker_id, type, amount, date, notes, payment_mode) VALUES (?, ?, ?, ?, ?, ?)',
        [numWorkerId, type, numAmount, formattedDate, sanitizedNotes, sanitizedMode]
      );

      return {
        id: result.insertId,
        worker_id: numWorkerId,
        type,
        amount: numAmount,
        date: formattedDate,
        notes: sanitizedNotes,
        payment_mode: sanitizedMode,
        created_at: new Date().toISOString(),
      };
    } catch (error) {
      console.warn('⚠️ [WorkerService DB Warning - Using Memory Store for Transaction Insert]:', error.message);
      const newTx = {
        id: nextTxId++,
        worker_id: numWorkerId,
        type,
        amount: numAmount,
        date: formattedDate,
        notes: sanitizedNotes,
        payment_mode: sanitizedMode,
        created_at: new Date().toISOString(),
      };
      memoryTransactions.push(newTx);
      return newTx;
    }
  }

  /**
   * Delete a transaction record
   */
  async deleteWorkerTransaction(transactionId) {
    const numId = Number(transactionId);
    invalidateCache();

    try {
      const [result] = await db.query('DELETE FROM worker_transactions WHERE id = ?', [numId]);
      return result.affectedRows > 0;
    } catch (error) {
      console.warn('⚠️ [WorkerService DB Warning - Using Memory Store for Transaction Delete]:', error.message);
      const initLen = memoryTransactions.length;
      memoryTransactions = memoryTransactions.filter((t) => t.id !== numId);
      return memoryTransactions.length < initLen;
    }
  }

  /**
   * Get overall workshop-wide Khata summary
   */
  async getWorkshopKhataSummary() {
    try {
      const [rows] = await db.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN type = 'salary' THEN amount ELSE 0 END), 0) AS total_salary,
          COALESCE(SUM(CASE WHEN type = 'upad' THEN amount ELSE 0 END), 0) AS total_upad,
          COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END), 0) AS total_paid
        FROM worker_transactions
      `);
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
      const totalSalary = memoryTransactions.filter((t) => t.type === 'salary').reduce((s, t) => s + Number(t.amount || 0), 0);
      const totalUpad = memoryTransactions.filter((t) => t.type === 'upad').reduce((s, t) => s + Number(t.amount || 0), 0);
      const totalPaid = memoryTransactions.filter((t) => t.type === 'payment').reduce((s, t) => s + Number(t.amount || 0), 0);
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

