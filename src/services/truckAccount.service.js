import db, { pool } from '../config/db.js';
import { rojmedService } from './rojmed.service.js';

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

function formatTruckRojmedMapping(type, partyName, truckNo, particulars) {
  const cleanPart = particulars ? String(particulars).trim() : '';
  const accountLabel = truckNo ? `${partyName} (${truckNo})` : partyName;
  const isUdhar = type === 'udhar';
  return {
    entry_type: isUdhar ? 'javak' : 'aavak',
    sub_type: isUdhar ? 'udhar' : 'jama',
    particulars: cleanPart ? `${accountLabel} - ${cleanPart}` : `${accountLabel} - ${isUdhar ? 'ઉધાર' : 'રોકડા જમા'}`,
  };
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
        rojmed_entry_id: e.rojmed_entry_id ? Number(e.rojmed_entry_id) : null,
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
   * Delete truck account & all its entries (preserving historical Rojmed cash Silak)
   */
  async deleteAccount(id) {
    const numId = Number(id);
    try {
      await db.query(
        "UPDATE rojmed_entries SET linked_tx_id = NULL WHERE source_type = 'truck_account' AND source_id = ?",
        [numId]
      ).catch(() => {});
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
   * Optionally syncs with Daily Rojmed when add_to_rojmed is true and payment_mode is Cash.
   */
  async addEntry(accountId, data) {
    const numAccId = Number(accountId);
    const {
      type,
      amount,
      date,
      particulars,
      payment_mode,
      add_to_rojmed = false,
      rojmed_entry_id = null,
      _skipRojmedSync = false,
    } = data;
    const cleanType = type === 'udhar' ? 'udhar' : 'jama';
    const cleanAmt = Number(amount) || 0;
    const cleanDate = formatDate(date) || formatDate(new Date());
    const cleanPart = particulars ? particulars.trim() : (cleanType === 'jama' ? 'રોકડા જમા' : 'ગાડી ની કિંમત');
    const cleanMode = payment_mode ? String(payment_mode).trim() : 'Cash';
    const shouldSyncRojmed = Boolean(add_to_rojmed) && cleanMode === 'Cash' && !_skipRojmedSync;

    let conn = null;
    try {
      if (shouldSyncRojmed) {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        const [accRows] = await conn.query(
          'SELECT party_name, truck_no FROM truck_accounts WHERE id = ? LIMIT 1',
          [numAccId]
        );
        const partyName = accRows?.[0]?.party_name || `Truck #${numAccId}`;
        const truckNo = accRows?.[0]?.truck_no || '';

        const [res] = await conn.query(
          `INSERT INTO truck_account_entries (account_id, type, amount, date, particulars, payment_mode)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [numAccId, cleanType, cleanAmt, cleanDate, cleanPart, cleanMode]
        );
        const txId = res.insertId;

        const map = formatTruckRojmedMapping(cleanType, partyName, truckNo, cleanPart);
        const [rRes] = await conn.query(
          `INSERT INTO rojmed_entries
            (date, entry_type, amount, particulars, source_type, source_id, sub_type, linked_tx_id, payment_mode, notes)
           VALUES (?, ?, ?, ?, 'truck_account', ?, ?, ?, 'Cash', ?)`,
          [cleanDate, map.entry_type, cleanAmt, map.particulars, numAccId, map.sub_type, txId, cleanPart]
        );
        const linkedRojmedId = rRes.insertId;

        await conn.query('UPDATE truck_account_entries SET rojmed_entry_id = ? WHERE id = ?', [linkedRojmedId, txId]);
        await conn.commit();

        return {
          id: txId,
          account_id: numAccId,
          type: cleanType,
          amount: cleanAmt,
          date: cleanDate,
          particulars: cleanPart,
          payment_mode: cleanMode,
          rojmed_entry_id: linkedRojmedId,
        };
      }

      const [res] = await db.query(
        `INSERT INTO truck_account_entries (account_id, type, amount, date, particulars, payment_mode, rojmed_entry_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [numAccId, cleanType, cleanAmt, cleanDate, cleanPart, cleanMode, rojmed_entry_id]
      );
      return {
        id: res.insertId,
        account_id: numAccId,
        type: cleanType,
        amount: cleanAmt,
        date: cleanDate,
        particulars: cleanPart,
        payment_mode: cleanMode,
        rojmed_entry_id: rojmed_entry_id ? Number(rojmed_entry_id) : null,
      };
    } catch (err) {
      if (conn) await conn.rollback().catch(() => {});
      console.warn('⚠️ [TruckAccountService addEntry DB Fallback]:', err.message);
      const txId = nextEntryId++;
      let finalRojmedId = rojmed_entry_id ? Number(rojmed_entry_id) : null;

      if (shouldSyncRojmed) {
        const acc = memoryTruckAccounts.find((a) => a.id === numAccId);
        const partyName = acc?.party_name || `Truck #${numAccId}`;
        const truckNo = acc?.truck_no || '';
        const map = formatTruckRojmedMapping(cleanType, partyName, truckNo, cleanPart);
        finalRojmedId = rojmedService.syncMemoryFromLinkedTx({
          action: 'create',
          sourceType: 'truck_account',
          sourceId: numAccId,
          linkedTxId: txId,
          entryType: map.entry_type,
          subType: map.sub_type,
          amount: cleanAmt,
          date: cleanDate,
          particulars: map.particulars,
          notes: cleanPart,
          truckPartyName: partyName,
          truckNo,
          truckPageNo: acc?.page_no ?? null,
        });
      }

      const newEntry = {
        id: txId,
        account_id: numAccId,
        type: cleanType,
        amount: cleanAmt,
        date: cleanDate,
        particulars: cleanPart,
        payment_mode: cleanMode,
        rojmed_entry_id: finalRojmedId,
        created_at: new Date().toISOString(),
      };
      memoryTruckEntries.push(newEntry);
      return newEntry;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Update entry in truck account (and keep linked Rojmed entry in sync)
   */
  async updateEntry(accountId, entryId, data) {
    const numAccId = Number(accountId);
    const numEntryId = Number(entryId);
    const { type, amount, date, particulars, payment_mode, add_to_rojmed, _skipRojmedSync = false } = data;
    const cleanType = type === 'udhar' ? 'udhar' : 'jama';
    const cleanAmt = Number(amount) || 0;
    const cleanDate = formatDate(date) || formatDate(new Date());
    const cleanPart = particulars ? particulars.trim() : (cleanType === 'jama' ? 'રોકડા જમા' : 'ગાડી ની કિંમત');
    const cleanMode = payment_mode ? String(payment_mode).trim() : 'Cash';

    let conn = null;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [existingRows] = await conn.query(
        `SELECT e.*, a.party_name, a.truck_no
         FROM truck_account_entries e
         LEFT JOIN truck_accounts a ON e.account_id = a.id
         WHERE e.id = ? AND e.account_id = ? LIMIT 1`,
        [numEntryId, numAccId]
      );
      if (!existingRows || existingRows.length === 0) {
        await conn.rollback();
        return null;
      }
      const existing = existingRows[0];
      const partyName = existing.party_name || `Truck #${numAccId}`;
      const truckNo = existing.truck_no || '';
      let finalRojmedId = existing.rojmed_entry_id ? Number(existing.rojmed_entry_id) : null;

      await conn.query(
        `UPDATE truck_account_entries
         SET type = ?, amount = ?, date = ?, particulars = ?, payment_mode = ?
         WHERE id = ? AND account_id = ?`,
        [cleanType, cleanAmt, cleanDate, cleanPart, cleanMode, numEntryId, numAccId]
      );

      if (!_skipRojmedSync) {
        const wantRojmed = add_to_rojmed !== undefined ? Boolean(add_to_rojmed) : Boolean(finalRojmedId);
        const canStayInRojmed = wantRojmed && cleanMode === 'Cash';

        if (finalRojmedId && !canStayInRojmed) {
          await conn.query('DELETE FROM rojmed_entries WHERE id = ?', [finalRojmedId]);
          await conn.query('UPDATE truck_account_entries SET rojmed_entry_id = NULL WHERE id = ?', [numEntryId]);
          finalRojmedId = null;
        } else if (finalRojmedId && canStayInRojmed) {
          const map = formatTruckRojmedMapping(cleanType, partyName, truckNo, cleanPart);
          await conn.query(
            `UPDATE rojmed_entries
             SET date = ?, entry_type = ?, amount = ?, particulars = ?, sub_type = ?, notes = ?
             WHERE id = ?`,
            [cleanDate, map.entry_type, cleanAmt, map.particulars, map.sub_type, cleanPart, finalRojmedId]
          );
        } else if (!finalRojmedId && canStayInRojmed) {
          const map = formatTruckRojmedMapping(cleanType, partyName, truckNo, cleanPart);
          const [rRes] = await conn.query(
            `INSERT INTO rojmed_entries
              (date, entry_type, amount, particulars, source_type, source_id, sub_type, linked_tx_id, payment_mode, notes)
             VALUES (?, ?, ?, ?, 'truck_account', ?, ?, ?, 'Cash', ?)`,
            [cleanDate, map.entry_type, cleanAmt, map.particulars, numAccId, map.sub_type, numEntryId, cleanPart]
          );
          finalRojmedId = rRes.insertId;
          await conn.query('UPDATE truck_account_entries SET rojmed_entry_id = ? WHERE id = ?', [finalRojmedId, numEntryId]);
        }
      }

      await conn.commit();
      return {
        id: numEntryId,
        account_id: numAccId,
        type: cleanType,
        amount: cleanAmt,
        date: cleanDate,
        particulars: cleanPart,
        payment_mode: cleanMode,
        rojmed_entry_id: finalRojmedId,
      };
    } catch (err) {
      if (conn) await conn.rollback().catch(() => {});
      console.warn('⚠️ [TruckAccountService updateEntry DB Fallback]:', err.message);
      const idx = memoryTruckEntries.findIndex((e) => e.id === numEntryId && e.account_id === numAccId);
      if (idx === -1) return null;

      const existing = memoryTruckEntries[idx];
      let finalRojmedId = existing.rojmed_entry_id || null;

      if (!_skipRojmedSync) {
        const acc = memoryTruckAccounts.find((a) => a.id === numAccId);
        const partyName = acc?.party_name || `Truck #${numAccId}`;
        const truckNo = acc?.truck_no || '';
        const wantRojmed = add_to_rojmed !== undefined ? Boolean(add_to_rojmed) : Boolean(finalRojmedId);
        const canStayInRojmed = wantRojmed && cleanMode === 'Cash';

        if (finalRojmedId && !canStayInRojmed) {
          rojmedService.syncMemoryFromLinkedTx({ action: 'delete', rojmedEntryId: finalRojmedId });
          finalRojmedId = null;
        } else if (canStayInRojmed) {
          const map = formatTruckRojmedMapping(cleanType, partyName, truckNo, cleanPart);
          finalRojmedId = rojmedService.syncMemoryFromLinkedTx({
            action: finalRojmedId ? 'update' : 'create',
            rojmedEntryId: finalRojmedId,
            sourceType: 'truck_account',
            sourceId: numAccId,
            linkedTxId: numEntryId,
            entryType: map.entry_type,
            subType: map.sub_type,
            amount: cleanAmt,
            date: cleanDate,
            particulars: map.particulars,
            notes: cleanPart,
            truckPartyName: partyName,
            truckNo,
            truckPageNo: acc?.page_no ?? null,
          });
        }
      }

      memoryTruckEntries[idx] = {
        ...existing,
        type: cleanType,
        amount: cleanAmt,
        date: cleanDate,
        particulars: cleanPart,
        payment_mode: cleanMode,
        rojmed_entry_id: finalRojmedId,
      };
      return memoryTruckEntries[idx];
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Delete entry from truck account (and its linked Rojmed entry if any)
   */
  async deleteEntry(accountId, entryId, { _skipRojmedSync = false } = {}) {
    const numAccId = Number(accountId);
    const numEntryId = Number(entryId);
    let conn = null;

    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [existingRows] = await conn.query(
        'SELECT rojmed_entry_id FROM truck_account_entries WHERE id = ? AND account_id = ? LIMIT 1',
        [numEntryId, numAccId]
      );
      const linkedRojmedId = existingRows?.[0]?.rojmed_entry_id || null;

      await conn.query('DELETE FROM truck_account_entries WHERE id = ? AND account_id = ?', [numEntryId, numAccId]);
      if (!_skipRojmedSync && linkedRojmedId) {
        await conn.query('DELETE FROM rojmed_entries WHERE id = ?', [linkedRojmedId]);
      }

      await conn.commit();
      return { success: true, id: numEntryId };
    } catch (err) {
      if (conn) await conn.rollback().catch(() => {});
      console.warn('⚠️ [TruckAccountService deleteEntry DB Fallback]:', err.message);
      const existing = memoryTruckEntries.find((e) => e.id === numEntryId && e.account_id === numAccId);
      if (!_skipRojmedSync && existing?.rojmed_entry_id) {
        rojmedService.syncMemoryFromLinkedTx({ action: 'delete', rojmedEntryId: existing.rojmed_entry_id });
      }
      memoryTruckEntries = memoryTruckEntries.filter((e) => !(e.id === numEntryId && e.account_id === numAccId));
      return { success: true, id: numEntryId };
    } finally {
      if (conn) conn.release();
    }
  }
}

export const truckAccountService = new TruckAccountService();
export default truckAccountService;

