import db from '../config/db.js';

/**
 * In-memory fallback dataset for when MySQL is offline
 * Zero Dummy Data Rule: Always starts completely empty []
 */
let memoryTruckAccounts = [];
let nextAccountId = 1;
let memoryTruckEntries = [];
let nextEntryId = 1;

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

class TruckAccountService {
  /**
   * Get all truck accounts with total Jama, total Udhar, and balance
   */
  async getAllAccounts({ search = '' } = {}) {
    try {
      let sql = `
        SELECT 
          a.id, a.party_name, a.truck_no, a.phone, a.address, a.page_no, a.notes, a.created_at,
          COALESCE(SUM(CASE WHEN e.type = 'jama' THEN e.amount ELSE 0 END), 0) AS total_jama,
          COALESCE(SUM(CASE WHEN e.type = 'udhar' THEN e.amount ELSE 0 END), 0) AS total_udhar,
          COUNT(e.id) AS total_entries
        FROM truck_accounts a
        LEFT JOIN truck_account_entries e ON a.id = e.account_id
      `;
      const params = [];

      if (search && search.trim()) {
        sql += ` WHERE (a.party_name LIKE ? OR a.truck_no LIKE ? OR a.phone LIKE ? OR CAST(a.page_no AS CHAR) LIKE ?)`;
        const q = `%${search.trim()}%`;
        params.push(q, q, q, q);
      }

      sql += ` GROUP BY a.id ORDER BY a.page_no ASC, a.id DESC`;

      const [rows] = await db.query(sql, params);
      return rows.map((a) => {
        const totalJama = Number(a.total_jama) || 0;
        const totalUdhar = Number(a.total_udhar) || 0;
        const balance = totalUdhar - totalJama; // > 0: Due to pay (બાકી), <= 0: Settled/Advance
        return {
          id: a.id,
          party_name: a.party_name,
          truck_no: a.truck_no || '',
          phone: a.phone || '',
          address: a.address || '',
          page_no: a.page_no !== null && a.page_no !== undefined ? Number(a.page_no) : null,
          notes: a.notes || '',
          created_at: a.created_at,
          total_jama: totalJama,
          total_udhar: totalUdhar,
          balance,
          status: balance > 0 ? 'due' : balance < 0 ? 'advance' : 'settled',
          total_entries: Number(a.total_entries) || 0,
        };
      });
    } catch (err) {
      console.warn('⚠️ [TruckAccountService DB Warning - Using Memory Store]:', err.message);
      let list = [...memoryTruckAccounts];
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        list = list.filter(
          (a) =>
            (a.party_name && a.party_name.toLowerCase().includes(q)) ||
            (a.truck_no && a.truck_no.toLowerCase().includes(q)) ||
            (a.phone && a.phone.includes(q)) ||
            (a.page_no && String(a.page_no).includes(q))
        );
      }
      return list.map((a) => {
        const entries = memoryTruckEntries.filter((e) => e.account_id === a.id);
        const totalJama = entries.filter((e) => e.type === 'jama').reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const totalUdhar = entries.filter((e) => e.type === 'udhar').reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const balance = totalUdhar - totalJama;
        return {
          ...a,
          total_jama: totalJama,
          total_udhar: totalUdhar,
          balance,
          status: balance > 0 ? 'due' : balance < 0 ? 'advance' : 'settled',
          total_entries: entries.length,
        };
      });
    }
  }

  /**
   * Get single truck account with all its entries
   */
  async getAccountById(id) {
    const numId = Number(id);
    try {
      const [accRows] = await db.query('SELECT * FROM truck_accounts WHERE id = ?', [numId]);
      if (!accRows || !accRows.length) return null;
      const account = accRows[0];

      const [entries] = await db.query(
        'SELECT * FROM truck_account_entries WHERE account_id = ? ORDER BY date ASC, id ASC',
        [numId]
      );

      const formattedEntries = entries.map((e) => ({
        id: e.id,
        account_id: e.account_id,
        type: e.type,
        amount: Number(e.amount) || 0,
        date: formatDate(e.date),
        particulars: e.particulars || '',
        payment_mode: e.payment_mode || 'Cash',
        created_at: e.created_at,
      }));

      const totalJama = formattedEntries.filter((e) => e.type === 'jama').reduce((sum, e) => sum + e.amount, 0);
      const totalUdhar = formattedEntries.filter((e) => e.type === 'udhar').reduce((sum, e) => sum + e.amount, 0);
      const balance = totalUdhar - totalJama;

      return {
        ...account,
        page_no: account.page_no !== null ? Number(account.page_no) : null,
        entries: formattedEntries,
        summary: {
          total_jama: totalJama,
          total_udhar: totalUdhar,
          balance,
          status: balance > 0 ? 'due' : balance < 0 ? 'advance' : 'settled',
        },
      };
    } catch (err) {
      console.warn('⚠️ [TruckAccountService getById DB Fallback]:', err.message);
      const account = memoryTruckAccounts.find((a) => a.id === numId);
      if (!account) return null;

      const entries = memoryTruckEntries.filter((e) => e.account_id === numId);
      const totalJama = entries.filter((e) => e.type === 'jama').reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const totalUdhar = entries.filter((e) => e.type === 'udhar').reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const balance = totalUdhar - totalJama;

      return {
        ...account,
        entries,
        summary: {
          total_jama: totalJama,
          total_udhar: totalUdhar,
          balance,
          status: balance > 0 ? 'due' : balance < 0 ? 'advance' : 'settled',
        },
      };
    }
  }

  /**
   * Create new truck account
   */
  async createAccount(data) {
    const { party_name, truck_no, phone, address, page_no, notes } = data;
    try {
      const [res] = await db.query(
        `INSERT INTO truck_accounts (party_name, truck_no, phone, address, page_no, notes) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          party_name ? party_name.trim() : '',
          truck_no ? truck_no.trim() : null,
          phone ? phone.trim() : null,
          address ? address.trim() : null,
          page_no ? Number(page_no) : null,
          notes ? notes.trim() : null,
        ]
      );
      return this.getAccountById(res.insertId);
    } catch (err) {
      console.warn('⚠️ [TruckAccountService createAccount DB Fallback]:', err.message);
      const newAcc = {
        id: nextAccountId++,
        party_name: party_name ? party_name.trim() : '',
        truck_no: truck_no ? truck_no.trim() : '',
        phone: phone ? phone.trim() : '',
        address: address ? address.trim() : '',
        page_no: page_no ? Number(page_no) : null,
        notes: notes ? notes.trim() : '',
        created_at: new Date().toISOString(),
      };
      memoryTruckAccounts.push(newAcc);
      return this.getAccountById(newAcc.id);
    }
  }

  /**
   * Update truck account details
   */
  async updateAccount(id, data) {
    const numId = Number(id);
    const { party_name, truck_no, phone, address, page_no, notes } = data;
    try {
      await db.query(
        `UPDATE truck_accounts SET party_name = ?, truck_no = ?, phone = ?, address = ?, page_no = ?, notes = ? WHERE id = ?`,
        [
          party_name ? party_name.trim() : '',
          truck_no ? truck_no.trim() : null,
          phone ? phone.trim() : null,
          address ? address.trim() : null,
          page_no ? Number(page_no) : null,
          notes ? notes.trim() : null,
          numId,
        ]
      );
      return this.getAccountById(numId);
    } catch (err) {
      console.warn('⚠️ [TruckAccountService updateAccount DB Fallback]:', err.message);
      const idx = memoryTruckAccounts.findIndex((a) => a.id === numId);
      if (idx !== -1) {
        memoryTruckAccounts[idx] = {
          ...memoryTruckAccounts[idx],
          party_name: party_name ? party_name.trim() : memoryTruckAccounts[idx].party_name,
          truck_no: truck_no !== undefined ? truck_no : memoryTruckAccounts[idx].truck_no,
          phone: phone !== undefined ? phone : memoryTruckAccounts[idx].phone,
          address: address !== undefined ? address : memoryTruckAccounts[idx].address,
          page_no: page_no !== undefined ? Number(page_no) : memoryTruckAccounts[idx].page_no,
          notes: notes !== undefined ? notes : memoryTruckAccounts[idx].notes,
        };
      }
      return this.getAccountById(numId);
    }
  }

  /**
   * Delete truck account & all its entries
   */
  async deleteAccount(id) {
    const numId = Number(id);
    try {
      await db.query('DELETE FROM truck_account_entries WHERE account_id = ?', [numId]);
      await db.query('DELETE FROM truck_accounts WHERE id = ?', [numId]);
      return { success: true, id: numId };
    } catch (err) {
      console.warn('⚠️ [TruckAccountService deleteAccount DB Fallback]:', err.message);
      memoryTruckEntries = memoryTruckEntries.filter((e) => e.account_id !== numId);
      memoryTruckAccounts = memoryTruckAccounts.filter((a) => a.id !== numId);
      return { success: true, id: numId };
    }
  }

  /**
   * Add entry (Jama or Udhar) to truck account
   */
  async addEntry(accountId, data) {
    const numAccId = Number(accountId);
    const { type, amount, date, particulars, payment_mode } = data;
    const cleanType = type === 'udhar' ? 'udhar' : 'jama';
    const cleanAmt = Number(amount) || 0;
    const cleanDate = date || new Date().toISOString().split('T')[0];
    const cleanPart = particulars ? particulars.trim() : (cleanType === 'jama' ? 'રોકડા જમા' : 'ગાડી ની કિંમત');

    try {
      const [res] = await db.query(
        `INSERT INTO truck_account_entries (account_id, type, amount, date, particulars, payment_mode) VALUES (?, ?, ?, ?, ?, ?)`,
        [numAccId, cleanType, cleanAmt, cleanDate, cleanPart, payment_mode || 'Cash']
      );
      return {
        id: res.insertId,
        account_id: numAccId,
        type: cleanType,
        amount: cleanAmt,
        date: cleanDate,
        particulars: cleanPart,
        payment_mode: payment_mode || 'Cash',
      };
    } catch (err) {
      console.warn('⚠️ [TruckAccountService addEntry DB Fallback]:', err.message);
      const newEntry = {
        id: nextEntryId++,
        account_id: numAccId,
        type: cleanType,
        amount: cleanAmt,
        date: cleanDate,
        particulars: cleanPart,
        payment_mode: payment_mode || 'Cash',
        created_at: new Date().toISOString(),
      };
      memoryTruckEntries.push(newEntry);
      return newEntry;
    }
  }

  /**
   * Update entry in truck account
   */
  async updateEntry(accountId, entryId, data) {
    const numAccId = Number(accountId);
    const numEntryId = Number(entryId);
    const { type, amount, date, particulars, payment_mode } = data;
    const cleanType = type === 'udhar' ? 'udhar' : 'jama';
    const cleanAmt = Number(amount) || 0;
    const cleanDate = date || new Date().toISOString().split('T')[0];
    const cleanPart = particulars ? particulars.trim() : (cleanType === 'jama' ? 'રોકડા જમા' : 'ગાડી ની કિંમત');

    try {
      await db.query(
        `UPDATE truck_account_entries SET type = ?, amount = ?, date = ?, particulars = ?, payment_mode = ? WHERE id = ? AND account_id = ?`,
        [cleanType, cleanAmt, cleanDate, cleanPart, payment_mode || 'Cash', numEntryId, numAccId]
      );
      return {
        id: numEntryId,
        account_id: numAccId,
        type: cleanType,
        amount: cleanAmt,
        date: cleanDate,
        particulars: cleanPart,
        payment_mode: payment_mode || 'Cash',
      };
    } catch (err) {
      console.warn('⚠️ [TruckAccountService updateEntry DB Fallback]:', err.message);
      const idx = memoryTruckEntries.findIndex((e) => e.id === numEntryId && e.account_id === numAccId);
      if (idx !== -1) {
        memoryTruckEntries[idx] = {
          ...memoryTruckEntries[idx],
          type: cleanType,
          amount: cleanAmt,
          date: cleanDate,
          particulars: cleanPart,
          payment_mode: payment_mode || memoryTruckEntries[idx].payment_mode,
        };
        return memoryTruckEntries[idx];
      }
      return null;
    }
  }

  /**
   * Delete entry from truck account
   */
  async deleteEntry(accountId, entryId) {
    const numAccId = Number(accountId);
    const numEntryId = Number(entryId);
    try {
      await db.query('DELETE FROM truck_account_entries WHERE id = ? AND account_id = ?', [numEntryId, numAccId]);
      return { success: true, id: numEntryId };
    } catch (err) {
      console.warn('⚠️ [TruckAccountService deleteEntry DB Fallback]:', err.message);
      memoryTruckEntries = memoryTruckEntries.filter((e) => !(e.id === numEntryId && e.account_id === numAccId));
      return { success: true, id: numEntryId };
    }
  }
}

export const truckAccountService = new TruckAccountService();
export default truckAccountService;

