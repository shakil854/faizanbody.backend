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
          a.id, a.party_name, a.truck_no, a.phone, a.address, a.page_no, a.current_cycle, a.notes, a.created_at,
          COALESCE(SUM(CASE WHEN e.type = 'jama' AND (e.is_settled IS NULL OR e.is_settled = 0) THEN e.amount ELSE 0 END), 0) AS total_jama,
          COALESCE(SUM(CASE WHEN e.type = 'udhar' AND (e.is_settled IS NULL OR e.is_settled = 0) THEN e.amount ELSE 0 END), 0) AS total_udhar,
          COALESCE(SUM(CASE WHEN e.type = 'jama' THEN e.amount ELSE 0 END), 0) AS all_time_jama,
          COALESCE(SUM(CASE WHEN e.type = 'udhar' THEN e.amount ELSE 0 END), 0) AS all_time_udhar,
          COUNT(CASE WHEN (e.is_settled IS NULL OR e.is_settled = 0) THEN e.id ELSE NULL END) AS active_entries,
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
        const allTimeJama = Number(a.all_time_jama) || 0;
        const allTimeUdhar = Number(a.all_time_udhar) || 0;
        const allTimeBalance = allTimeUdhar - allTimeJama;
        return {
          id: a.id,
          party_name: a.party_name,
          truck_no: a.truck_no || '',
          phone: a.phone || '',
          address: a.address || '',
          page_no: a.page_no !== null && a.page_no !== undefined ? Number(a.page_no) : null,
          current_cycle: Number(a.current_cycle) || 1,
          notes: a.notes || '',
          created_at: a.created_at,
          total_jama: totalJama,
          total_udhar: totalUdhar,
          balance,
          all_time_jama: allTimeJama,
          all_time_udhar: allTimeUdhar,
          all_time_balance: allTimeBalance,
          status: balance > 0 ? 'due' : balance < 0 ? 'advance' : 'settled',
          active_entries: Number(a.active_entries) || 0,
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
        const activeEntries = entries.filter((e) => !e.is_settled || e.is_settled === 0);
        const totalJama = activeEntries.filter((e) => e.type === 'jama').reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const totalUdhar = activeEntries.filter((e) => e.type === 'udhar').reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const balance = totalUdhar - totalJama;
        const allTimeJama = entries.filter((e) => e.type === 'jama').reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const allTimeUdhar = entries.filter((e) => e.type === 'udhar').reduce((sum, e) => sum + Number(e.amount || 0), 0);
        return {
          ...a,
          current_cycle: Number(a.current_cycle) || 1,
          total_jama: totalJama,
          total_udhar: totalUdhar,
          balance,
          all_time_jama: allTimeJama,
          all_time_udhar: allTimeUdhar,
          all_time_balance: allTimeUdhar - allTimeJama,
          status: balance > 0 ? 'due' : balance < 0 ? 'advance' : 'settled',
          active_entries: activeEntries.length,
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
        cycle_no: e.cycle_no !== null && e.cycle_no !== undefined ? Number(e.cycle_no) : 1,
        is_settled: Boolean(e.is_settled),
        rojmed_entry_id: e.rojmed_entry_id ? Number(e.rojmed_entry_id) : null,
        created_at: e.created_at,
      }));

      const activeEntries = formattedEntries.filter((e) => !e.is_settled);
      const activeJama = activeEntries.filter((e) => e.type === 'jama').reduce((sum, e) => sum + e.amount, 0);
      const activeUdhar = activeEntries.filter((e) => e.type === 'udhar').reduce((sum, e) => sum + e.amount, 0);
      const activeBalance = activeUdhar - activeJama;

      const totalJama = formattedEntries.filter((e) => e.type === 'jama').reduce((sum, e) => sum + e.amount, 0);
      const totalUdhar = formattedEntries.filter((e) => e.type === 'udhar').reduce((sum, e) => sum + e.amount, 0);
      const allTimeBalance = totalUdhar - totalJama;

      return {
        ...account,
        page_no: account.page_no !== null ? Number(account.page_no) : null,
        current_cycle: Number(account.current_cycle) || 1,
        entries: formattedEntries,
        summary: {
          total_jama: totalJama,
          total_udhar: totalUdhar,
          balance: activeBalance, // current cycle balance
          all_time_balance: allTimeBalance,
          active_jama: activeJama,
          active_udhar: activeUdhar,
          active_balance: activeBalance,
          current_cycle: Number(account.current_cycle) || 1,
          status: activeBalance > 0 ? 'due' : activeBalance < 0 ? 'advance' : 'settled',
        },
      };
    } catch (err) {
      console.warn('⚠️ [TruckAccountService getById DB Fallback]:', err.message);
      const account = memoryTruckAccounts.find((a) => a.id === numId);
      if (!account) return null;

      const entries = memoryTruckEntries.filter((e) => e.account_id === numId);
      const activeEntries = entries.filter((e) => !e.is_settled || e.is_settled === 0);
      const activeJama = activeEntries.filter((e) => e.type === 'jama').reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const activeUdhar = activeEntries.filter((e) => e.type === 'udhar').reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const activeBalance = activeUdhar - activeJama;

      const totalJama = entries.filter((e) => e.type === 'jama').reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const totalUdhar = entries.filter((e) => e.type === 'udhar').reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const allTimeBalance = totalUdhar - totalJama;

      return {
        ...account,
        page_no: account.page_no !== null ? Number(account.page_no) : null,
        current_cycle: Number(account.current_cycle) || 1,
        entries,
        summary: {
          total_jama: totalJama,
          total_udhar: totalUdhar,
          balance: activeBalance,
          all_time_balance: allTimeBalance,
          active_jama: activeJama,
          active_udhar: activeUdhar,
          active_balance: activeBalance,
          current_cycle: Number(account.current_cycle) || 1,
          status: activeBalance > 0 ? 'due' : activeBalance < 0 ? 'advance' : 'settled',
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
      ).catch(() => { });
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
          'SELECT party_name, truck_no, current_cycle FROM truck_accounts WHERE id = ? LIMIT 1',
          [numAccId]
        );
        const partyName = accRows?.[0]?.party_name || `Truck #${numAccId}`;
        const truckNo = accRows?.[0]?.truck_no || '';
        const currentCycle = Number(accRows?.[0]?.current_cycle) || 1;

        const [res] = await conn.query(
          `INSERT INTO truck_account_entries (account_id, type, amount, date, particulars, payment_mode, cycle_no, is_settled)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
          [numAccId, cleanType, cleanAmt, cleanDate, cleanPart, cleanMode, currentCycle]
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
          cycle_no: currentCycle,
          is_settled: false,
          rojmed_entry_id: linkedRojmedId,
        };
      }

      const [accRows] = await db.query(
        'SELECT current_cycle FROM truck_accounts WHERE id = ? LIMIT 1',
        [numAccId]
      );
      const currentCycle = Number(accRows?.[0]?.current_cycle) || 1;

      const [res] = await db.query(
        `INSERT INTO truck_account_entries (account_id, type, amount, date, particulars, payment_mode, cycle_no, is_settled, rojmed_entry_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [numAccId, cleanType, cleanAmt, cleanDate, cleanPart, cleanMode, currentCycle, rojmed_entry_id]
      );
      return {
        id: res.insertId,
        account_id: numAccId,
        type: cleanType,
        amount: cleanAmt,
        date: cleanDate,
        particulars: cleanPart,
        payment_mode: cleanMode,
        cycle_no: currentCycle,
        is_settled: false,
        rojmed_entry_id: rojmed_entry_id ? Number(rojmed_entry_id) : null,
      };
    } catch (err) {
      if (conn) await conn.rollback().catch(() => { });
      console.warn('⚠️ [TruckAccountService addEntry DB Fallback]:', err.message);
      const txId = nextEntryId++;
      let finalRojmedId = rojmed_entry_id ? Number(rojmed_entry_id) : null;
      const acc = memoryTruckAccounts.find((a) => a.id === numAccId);
      const partyName = acc?.party_name || `Truck #${numAccId}`;
      const truckNo = acc?.truck_no || '';
      const currentCycle = Number(acc?.current_cycle) || 1;

      if (shouldSyncRojmed) {
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
        cycle_no: currentCycle,
        is_settled: 0,
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
    if (conn) await conn.rollback().catch(() => { });
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
    if (conn) await conn.rollback().catch(() => { });
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

  /**
   * Settle current cycle of truck account (archive active entries, open next round)
   * If there is an outstanding balance (Due or Advance), carries it forward into the new round
   */
  async settleCycle(id, { notes } = {}) {
    const numId = Number(id);
    let conn = null;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [accRows] = await conn.query('SELECT current_cycle FROM truck_accounts WHERE id = ? LIMIT 1', [numId]);
      if (!accRows || !accRows.length) {
        await conn.rollback();
        return null;
      }
      const curCycle = Number(accRows[0].current_cycle) || 1;

      // Calculate outstanding balance of the current active cycle
      const [sumRows] = await conn.query(
        `SELECT 
          COALESCE(SUM(CASE WHEN type = 'jama' THEN amount ELSE 0 END), 0) AS total_jama,
          COALESCE(SUM(CASE WHEN type = 'udhar' THEN amount ELSE 0 END), 0) AS total_udhar
        FROM truck_account_entries
        WHERE account_id = ? AND (is_settled = 0 OR is_settled IS NULL)`,
        [numId]
      );
      const curJama = Number(sumRows?.[0]?.total_jama) || 0;
      const curUdhar = Number(sumRows?.[0]?.total_udhar) || 0;
      const carryDiff = curUdhar - curJama;

      // Mark all unsettled entries for this account as settled in this cycle
      await conn.query(
        'UPDATE truck_account_entries SET is_settled = 1, cycle_no = ? WHERE account_id = ? AND (is_settled = 0 OR is_settled IS NULL)',
        [curCycle, numId]
      );

      // Increment cycle_no in account
      const nextCycle = curCycle + 1;
      await conn.query('UPDATE truck_accounts SET current_cycle = ? WHERE id = ?', [nextCycle, numId]);

      // If carryDiff !== 0, carry forward the remaining balance into the new round
      if (carryDiff > 0) {
        // Due (બાકી): Carry forward as Udhar entry in the new round
        await conn.query(
          `INSERT INTO truck_account_entries (account_id, type, amount, date, particulars, payment_mode, cycle_no, is_settled, rojmed_entry_id)
           VALUES (?, 'udhar', ?, CURDATE(), ?, 'Cash', ?, 0, NULL)`,
          [numId, carryDiff, `Round ${curCycle} ની આગળની બાકી રહેલ રકમ`, nextCycle]
        );
      } else if (carryDiff < 0) {
        // Advance (એડવાન્સ જમા): Carry forward as Jama entry in the new round
        await conn.query(
          `INSERT INTO truck_account_entries (account_id, type, amount, date, particulars, payment_mode, cycle_no, is_settled, rojmed_entry_id)
           VALUES (?, 'jama', ?, CURDATE(), ?, 'Cash', ?, 0, NULL)`,
          [numId, Math.abs(carryDiff), `Round ${curCycle} ની આગળની એડવાન્સ જમા રકમ`, nextCycle]
        );
      }

      await conn.commit();
      return this.getAccountById(numId);
    } catch (err) {
      if (conn) await conn.rollback().catch(() => {});
      console.warn('⚠️ [TruckAccountService settleCycle DB Fallback]:', err.message);
      const acc = memoryTruckAccounts.find((a) => a.id === numId);
      if (acc) {
        const curCycle = Number(acc.current_cycle) || 1;
        const activeEntries = memoryTruckEntries.filter(
          (e) => e.account_id === numId && (!e.is_settled || e.is_settled === 0)
        );
        const curJama = activeEntries.filter((e) => e.type === 'jama').reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const curUdhar = activeEntries.filter((e) => e.type === 'udhar').reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const carryDiff = curUdhar - curJama;

        activeEntries.forEach((e) => {
          e.is_settled = 1;
          e.cycle_no = curCycle;
        });

        const nextCycle = curCycle + 1;
        acc.current_cycle = nextCycle;

        if (carryDiff > 0) {
          memoryTruckEntries.push({
            id: nextEntryId++,
            account_id: numId,
            type: 'udhar',
            amount: carryDiff,
            date: formatDate(new Date()),
            particulars: `Round ${curCycle} ની આગળની બાકી રહેલ રકમ`,
            payment_mode: 'Cash',
            cycle_no: nextCycle,
            is_settled: 0,
            rojmed_entry_id: null,
            created_at: new Date().toISOString(),
          });
        } else if (carryDiff < 0) {
          memoryTruckEntries.push({
            id: nextEntryId++,
            account_id: numId,
            type: 'jama',
            amount: Math.abs(carryDiff),
            date: formatDate(new Date()),
            particulars: `Round ${curCycle} ની આગળની એડવાન્સ જમા રકમ`,
            payment_mode: 'Cash',
            cycle_no: nextCycle,
            is_settled: 0,
            rojmed_entry_id: null,
            created_at: new Date().toISOString(),
          });
        }
      }
      return this.getAccountById(numId);
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Reopen previous cycle of truck account
   */
  async reopenCycle(id) {
    const numId = Number(id);
    let conn = null;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [accRows] = await conn.query('SELECT current_cycle FROM truck_accounts WHERE id = ? LIMIT 1', [numId]);
      if (!accRows || !accRows.length) {
        await conn.rollback();
        return null;
      }
      const curCycle = Number(accRows[0].current_cycle) || 1;
      if (curCycle <= 1) {
        await conn.rollback();
        return this.getAccountById(numId);
      }

      const targetCycle = curCycle - 1;
      // Remove opening carry forward entry from curCycle if any was added
      await conn.query(
        'DELETE FROM truck_account_entries WHERE account_id = ? AND cycle_no = ? AND particulars LIKE ?',
        [numId, curCycle, `%Round ${targetCycle} ની આગળની%`]
      );

      // Reopen entries of targetCycle
      await conn.query(
        'UPDATE truck_account_entries SET is_settled = 0 WHERE account_id = ? AND cycle_no = ?',
        [numId, targetCycle]
      );

      await conn.query('UPDATE truck_accounts SET current_cycle = ? WHERE id = ?', [targetCycle, numId]);

      await conn.commit();
      return this.getAccountById(numId);
    } catch (err) {
      if (conn) await conn.rollback().catch(() => {});
      console.warn('⚠️ [TruckAccountService reopenCycle DB Fallback]:', err.message);
      const acc = memoryTruckAccounts.find((a) => a.id === numId);
      if (acc && (Number(acc.current_cycle) || 1) > 1) {
        const targetCycle = (Number(acc.current_cycle) || 1) - 1;
        memoryTruckEntries = memoryTruckEntries.filter(
          (e) => !(e.account_id === numId && Number(e.cycle_no) === curCycle && String(e.particulars).includes(`Round ${targetCycle} ની આગળની`))
        );
        memoryTruckEntries.forEach((e) => {
          if (e.account_id === numId && Number(e.cycle_no) === targetCycle) {
            e.is_settled = 0;
          }
        });
        acc.current_cycle = targetCycle;
      }
      return this.getAccountById(numId);
    } finally {
      if (conn) conn.release();
    }
  }
}

export const truckAccountService = new TruckAccountService();
export default truckAccountService;

