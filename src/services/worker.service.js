import db from '../config/db.js';

/**
 * In-memory fallback dataset for when MySQL is offline
 */
let memoryWorkers = [];
let nextId = 1;

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
      let sql = 'SELECT id, name, mobile, aadhar_card, coming_date, going_date FROM workers';
      const conditions = [];
      const params = [];

      if (search && search.trim()) {
        conditions.push('(name LIKE ? OR mobile LIKE ?)');
        params.push(`%${search.trim()}%`, `%${search.trim()}%`);
      }

      if (status === 'active') {
        conditions.push('(going_date IS NULL OR going_date = "")');
      } else if (status === 'relieved') {
        conditions.push('(going_date IS NOT NULL AND going_date != "")');
      }

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }

      sql += ' ORDER BY coming_date DESC, id DESC';

      const [rows] = await db.query(sql, params);
      const result = rows.map((w) => ({
        id: w.id,
        name: w.name,
        mobile: w.mobile || '',
        aadhar_card: w.aadhar_card || null,
        coming_date: formatDate(w.coming_date),
        going_date: formatDate(w.going_date),
        status: w.going_date ? 'relieved' : 'active',
      }));

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

      const result = list.map((w) => ({
        id: w.id,
        name: w.name,
        mobile: w.mobile || '',
        aadhar_card: w.aadhar_card || null,
        coming_date: formatDate(w.coming_date),
        going_date: formatDate(w.going_date),
        status: w.going_date ? 'relieved' : 'active',
      }));

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
        'SELECT id, name, mobile, aadhar_card, coming_date, going_date FROM workers WHERE id = ?',
        [numId]
      );
      if (rows && rows.length > 0) {
        const w = rows[0];
        return {
          id: w.id,
          name: w.name,
          mobile: w.mobile || '',
          aadhar_card: w.aadhar_card || null,
          coming_date: formatDate(w.coming_date),
          going_date: formatDate(w.going_date),
          status: w.going_date ? 'relieved' : 'active',
        };
      }
      return null;
    } catch (error) {
      const w = memoryWorkers.find((item) => item.id === numId);
      if (!w) return null;
      return {
        id: w.id,
        name: w.name,
        mobile: w.mobile || '',
        aadhar_card: w.aadhar_card || null,
        coming_date: formatDate(w.coming_date),
        going_date: formatDate(w.going_date),
        status: w.going_date ? 'relieved' : 'active',
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
}

export const workerService = new WorkerService();
