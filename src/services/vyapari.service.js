import db, { pool } from '../config/db.js';
import { rojmedService } from './rojmed.service.js';
import { stockService } from './stock.service.js';

/**
 * In-memory fallback dataset for when MySQL is offline
 * Zero Dummy Data Rule: Always starts completely empty []
 */
let memoryVyapariAccounts = [];
let nextAccountId = 1;
let memoryVyapariEntries = [];
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

function formatVyapariRojmedMapping(type, partyName, firmName, particulars) {
  const cleanPart = particulars ? String(particulars).trim() : '';
  const accountLabel = firmName ? `${partyName} (${firmName})` : partyName;
  const isUdhar = type === 'udhar';
  return {
    entry_type: isUdhar ? 'javak' : 'aavak',
    sub_type: isUdhar ? 'udhar' : 'jama',
    particulars: cleanPart ? `${accountLabel} - ${cleanPart}` : `${accountLabel} - ${isUdhar ? 'ઉધાર' : 'રોકડા જમા'}`,
  };
}

class VyapariService {
  /**
   * Get all vyapari accounts with total Jama, total Udhar, and balance
   */
  async getAllAccounts({ search = '' } = {}) {
    try {
      let sql = `
        SELECT 
          a.id, a.party_name, a.firm_name, a.phone, a.address, a.page_no, a.current_cycle, a.notes, a.created_at,
          COALESCE(SUM(CASE WHEN e.type = 'jama' AND (e.is_settled IS NULL OR e.is_settled = 0) THEN e.amount ELSE 0 END), 0) AS total_jama,
          COALESCE(SUM(CASE WHEN e.type = 'udhar' AND (e.is_settled IS NULL OR e.is_settled = 0) THEN e.amount ELSE 0 END), 0) AS total_udhar,
          COALESCE(SUM(CASE WHEN e.type = 'jama' THEN e.amount ELSE 0 END), 0) AS all_time_jama,
          COALESCE(SUM(CASE WHEN e.type = 'udhar' THEN e.amount ELSE 0 END), 0) AS all_time_udhar,
          COUNT(CASE WHEN (e.is_settled IS NULL OR e.is_settled = 0) THEN e.id ELSE NULL END) AS active_entries,
          COUNT(e.id) AS total_entries
        FROM vyapari_accounts a
        LEFT JOIN vyapari_account_entries e ON a.id = e.account_id
      `;
      const params = [];

      if (search && search.trim()) {
        sql += ` WHERE (a.party_name LIKE ? OR a.firm_name LIKE ? OR a.phone LIKE ? OR CAST(a.page_no AS CHAR) LIKE ?)`;
        const q = `%${search.trim()}%`;
        params.push(q, q, q, q);
      }

      sql += ` GROUP BY a.id ORDER BY a.page_no ASC, a.id DESC`;

      const [rows] = await db.query(sql, params);
      return rows.map((a) => {
        const totalJama = Number(a.total_jama) || 0;
        const totalUdhar = Number(a.total_udhar) || 0;
        const balance = totalUdhar - totalJama;
        const allTimeJama = Number(a.all_time_jama) || 0;
        const allTimeUdhar = Number(a.all_time_udhar) || 0;
        const allTimeBalance = allTimeUdhar - allTimeJama;
        return {
          id: a.id,
          party_name: a.party_name,
          firm_name: a.firm_name || '',
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
      console.warn('⚠️ [VyapariService DB Warning - Using Memory Store]:', err.message);
      let list = [...memoryVyapariAccounts];
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        list = list.filter(
          (a) =>
            (a.party_name && a.party_name.toLowerCase().includes(q)) ||
            (a.firm_name && a.firm_name.toLowerCase().includes(q)) ||
            (a.phone && a.phone.includes(q)) ||
            (a.page_no && String(a.page_no).includes(q))
        );
      }
      return list.map((a) => {
        const entries = memoryVyapariEntries.filter((e) => e.account_id === a.id);
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
   * Get single vyapari account with all its entries
   */
  async getAccountById(id) {
    const numId = Number(id);
    try {
      const [accRows] = await db.query('SELECT * FROM vyapari_accounts WHERE id = ?', [numId]);
      if (!accRows || !accRows.length) return null;
      const account = accRows[0];

      const [entries] = await db.query(
        'SELECT * FROM vyapari_account_entries WHERE account_id = ? ORDER BY date ASC, id ASC',
        [numId]
      );

      const formattedEntries = entries.map((e) => ({
        id: e.id,
        account_id: e.account_id,
        type: e.type,
        amount: Number(e.amount) || 0,
        date: formatDate(e.date),
        particulars: e.particulars || '',
        bill_no: e.bill_no || null,
        stock_item_id: e.stock_item_id ? Number(e.stock_item_id) : null,
        stock_item_name: e.stock_item_name || null,
        stock_qty: e.stock_qty !== null && e.stock_qty !== undefined ? Number(e.stock_qty) : null,
        payment_mode: e.payment_mode || 'Cash',
        cycle_no: Number(e.cycle_no) || 1,
        is_settled: Boolean(e.is_settled),
        rojmed_entry_id: e.rojmed_entry_id ? Number(e.rojmed_entry_id) : null,
        created_at: e.created_at,
      }));

      const activeEntries = formattedEntries.filter((e) => !e.is_settled);
      const totalJama = activeEntries.filter((e) => e.type === 'jama').reduce((sum, e) => sum + e.amount, 0);
      const totalUdhar = activeEntries.filter((e) => e.type === 'udhar').reduce((sum, e) => sum + e.amount, 0);
      const balance = totalUdhar - totalJama;

      const allTimeJama = formattedEntries.filter((e) => e.type === 'jama').reduce((sum, e) => sum + e.amount, 0);
      const allTimeUdhar = formattedEntries.filter((e) => e.type === 'udhar').reduce((sum, e) => sum + e.amount, 0);

      return {
        id: account.id,
        party_name: account.party_name,
        firm_name: account.firm_name || '',
        phone: account.phone || '',
        address: account.address || '',
        page_no: account.page_no !== null && account.page_no !== undefined ? Number(account.page_no) : null,
        current_cycle: Number(account.current_cycle) || 1,
        notes: account.notes || '',
        created_at: account.created_at,
        total_jama: totalJama,
        total_udhar: totalUdhar,
        balance,
        all_time_jama: allTimeJama,
        all_time_udhar: allTimeUdhar,
        all_time_balance: allTimeUdhar - allTimeJama,
        entries: formattedEntries,
      };
    } catch (err) {
      console.warn('⚠️ [VyapariService getById DB Fallback]:', err.message);
      const account = memoryVyapariAccounts.find((a) => a.id === numId);
      if (!account) return null;
      const entries = memoryVyapariEntries
        .filter((e) => e.account_id === numId)
        .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.id - b.id);

      const formatted = entries.map((e) => ({
        ...e,
        cycle_no: Number(e.cycle_no) || 1,
        is_settled: Boolean(e.is_settled),
      }));
      const active = formatted.filter((e) => !e.is_settled);
      const totalJama = active.filter((e) => e.type === 'jama').reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const totalUdhar = active.filter((e) => e.type === 'udhar').reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const allTimeJama = formatted.filter((e) => e.type === 'jama').reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const allTimeUdhar = formatted.filter((e) => e.type === 'udhar').reduce((sum, e) => sum + Number(e.amount || 0), 0);

      return {
        ...account,
        current_cycle: Number(account.current_cycle) || 1,
        total_jama: totalJama,
        total_udhar: totalUdhar,
        balance: totalUdhar - totalJama,
        all_time_jama: allTimeJama,
        all_time_udhar: allTimeUdhar,
        all_time_balance: allTimeUdhar - allTimeJama,
        entries: formatted,
      };
    }
  }

  /**
   * Create a new vyapari account
   */
  async createAccount(data) {
    const { party_name, firm_name, phone, address, page_no, notes } = data;
    try {
      const [res] = await db.query(
        `INSERT INTO vyapari_accounts (party_name, firm_name, phone, address, page_no, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          party_name ? party_name.trim() : '',
          firm_name ? firm_name.trim() : null,
          phone ? phone.trim() : null,
          address ? address.trim() : null,
          page_no ? Number(page_no) : null,
          notes ? notes.trim() : null,
        ]
      );
      return this.getAccountById(res.insertId);
    } catch (err) {
      console.warn('⚠️ [VyapariService createAccount DB Fallback]:', err.message);
      const newAcc = {
        id: nextAccountId++,
        party_name: party_name ? party_name.trim() : '',
        firm_name: firm_name ? firm_name.trim() : '',
        phone: phone ? phone.trim() : '',
        address: address ? address.trim() : '',
        page_no: page_no ? Number(page_no) : null,
        current_cycle: 1,
        notes: notes ? notes.trim() : '',
        created_at: new Date().toISOString(),
      };
      memoryVyapariAccounts.push(newAcc);
      return this.getAccountById(newAcc.id);
    }
  }

  /**
   * Update vyapari account details
   */
  async updateAccount(id, data) {
    const numId = Number(id);
    const { party_name, firm_name, phone, address, page_no, notes } = data;
    try {
      await db.query(
        `UPDATE vyapari_accounts SET party_name = ?, firm_name = ?, phone = ?, address = ?, page_no = ?, notes = ? WHERE id = ?`,
        [
          party_name ? party_name.trim() : '',
          firm_name ? firm_name.trim() : null,
          phone ? phone.trim() : null,
          address ? address.trim() : null,
          page_no ? Number(page_no) : null,
          notes ? notes.trim() : null,
          numId,
        ]
      );
      return this.getAccountById(numId);
    } catch (err) {
      console.warn('⚠️ [VyapariService updateAccount DB Fallback]:', err.message);
      const idx = memoryVyapariAccounts.findIndex((a) => a.id === numId);
      if (idx !== -1) {
        memoryVyapariAccounts[idx] = {
          ...memoryVyapariAccounts[idx],
          party_name: party_name ? party_name.trim() : memoryVyapariAccounts[idx].party_name,
          firm_name: firm_name !== undefined ? firm_name : memoryVyapariAccounts[idx].firm_name,
          phone: phone !== undefined ? phone : memoryVyapariAccounts[idx].phone,
          address: address !== undefined ? address : memoryVyapariAccounts[idx].address,
          page_no: page_no !== undefined ? Number(page_no) : memoryVyapariAccounts[idx].page_no,
          notes: notes !== undefined ? notes : memoryVyapariAccounts[idx].notes,
        };
      }
      return this.getAccountById(numId);
    }
  }

  /**
   * Delete vyapari account & all its entries (preserving historical Rojmed cash Silak)
   */
  async deleteAccount(id) {
    const numId = Number(id);
    try {
      await db.query(
        "UPDATE rojmed_entries SET linked_tx_id = NULL WHERE source_type = 'vyapari_account' AND source_id = ?",
        [numId]
      ).catch(() => {});
      await db.query('DELETE FROM vyapari_account_entries WHERE account_id = ?', [numId]);
      await db.query('DELETE FROM vyapari_accounts WHERE id = ?', [numId]);
      return { success: true, id: numId };
    } catch (err) {
      console.warn('⚠️ [VyapariService deleteAccount DB Fallback]:', err.message);
      memoryVyapariEntries = memoryVyapariEntries.filter((e) => e.account_id !== numId);
      memoryVyapariAccounts = memoryVyapariAccounts.filter((a) => a.id !== numId);
      return { success: true, id: numId };
    }
  }

  /**
   * Add entry (Jama or Udhar) to vyapari account
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
      bill_no = null,
      stock_item_id = null,
      stock_qty = null,
      _skipRojmedSync = false,
    } = data;
    const cleanType = type === 'udhar' ? 'udhar' : 'jama';
    const cleanAmt = Number(amount) || 0;
    const cleanDate = formatDate(date) || formatDate(new Date());
    const cleanPart = particulars ? particulars.trim() : (cleanType === 'jama' ? 'રોકડા જમા' : 'માલ ઉધાર / બિલ');
    const cleanMode = payment_mode ? String(payment_mode).trim() : 'Cash';
    const cleanBillNo = bill_no ? String(bill_no).trim() : null;
    const cleanStockId = stock_item_id ? Number(stock_item_id) : null;
    const cleanStockQty = cleanStockId && Number(stock_qty) > 0 ? Number(stock_qty) : null;
    let cleanStockName = null;
    const shouldSyncRojmed = Boolean(add_to_rojmed) && cleanMode === 'Cash' && !_skipRojmedSync;

    if (cleanStockId && cleanStockQty) {
      try {
        const stockItem = await stockService.getItemById(cleanStockId);
        if (stockItem) cleanStockName = stockItem.name;
      } catch {
        // ignore lookup error
      }
    }

    let conn = null;
    try {
      if (shouldSyncRojmed) {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        const [accRows] = await conn.query(
          'SELECT party_name, firm_name, current_cycle FROM vyapari_accounts WHERE id = ? LIMIT 1',
          [numAccId]
        );
        const partyName = accRows?.[0]?.party_name || `Vyapari #${numAccId}`;
        const firmName = accRows?.[0]?.firm_name || '';
        const currentCycle = Number(accRows?.[0]?.current_cycle) || 1;

        const [res] = await conn.query(
          `INSERT INTO vyapari_account_entries (account_id, type, amount, date, particulars, bill_no, stock_item_id, stock_item_name, stock_qty, payment_mode, cycle_no, is_settled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [numAccId, cleanType, cleanAmt, cleanDate, cleanPart, cleanBillNo, cleanStockId, cleanStockName, cleanStockQty, cleanMode, currentCycle]
        );
        const txId = res.insertId;

        const map = formatVyapariRojmedMapping(cleanType, partyName, firmName, cleanPart);
        const [rRes] = await conn.query(
          `INSERT INTO rojmed_entries
            (date, entry_type, amount, particulars, source_type, source_id, sub_type, linked_tx_id, payment_mode, notes)
           VALUES (?, ?, ?, ?, 'vyapari_account', ?, ?, ?, 'Cash', ?)`,
          [cleanDate, map.entry_type, cleanAmt, map.particulars, numAccId, map.sub_type, txId, cleanPart]
        );
        const linkedRojmedId = rRes.insertId;

        await conn.query('UPDATE vyapari_account_entries SET rojmed_entry_id = ? WHERE id = ?', [linkedRojmedId, txId]);
        await conn.commit();

        if (cleanStockId && cleanStockQty) {
          const refParts = [`Vyapari: ${partyName}`];
          if (cleanBillNo) refParts.push(`Bill #${cleanBillNo}`);
          if (cleanPart) refParts.push(cleanPart);
          await stockService.adjustStock(cleanStockId, {
            type: 'IN',
            quantity: cleanStockQty,
            date: cleanDate,
            reference_note: refParts.join(' • '),
          }).catch((e) => console.warn('⚠️ Vyapari stock+ adjust warning:', e.message));
        }

        return {
          id: txId,
          account_id: numAccId,
          type: cleanType,
          amount: cleanAmt,
          date: cleanDate,
          particulars: cleanPart,
          bill_no: cleanBillNo,
          stock_item_id: cleanStockId,
          stock_item_name: cleanStockName,
          stock_qty: cleanStockQty,
          payment_mode: cleanMode,
          cycle_no: currentCycle,
          is_settled: false,
          rojmed_entry_id: linkedRojmedId,
        };
      }

      const [accRows] = await db.query(
        'SELECT party_name, current_cycle FROM vyapari_accounts WHERE id = ? LIMIT 1',
        [numAccId]
      );
      const partyName = accRows?.[0]?.party_name || `Vyapari #${numAccId}`;
      const currentCycle = Number(accRows?.[0]?.current_cycle) || 1;

      const [res] = await db.query(
        `INSERT INTO vyapari_account_entries (account_id, type, amount, date, particulars, bill_no, stock_item_id, stock_item_name, stock_qty, payment_mode, cycle_no, is_settled, rojmed_entry_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [numAccId, cleanType, cleanAmt, cleanDate, cleanPart, cleanBillNo, cleanStockId, cleanStockName, cleanStockQty, cleanMode, currentCycle, rojmed_entry_id]
      );

      if (cleanStockId && cleanStockQty) {
        const refParts = [`Vyapari: ${partyName}`];
        if (cleanBillNo) refParts.push(`Bill #${cleanBillNo}`);
        if (cleanPart) refParts.push(cleanPart);
        await stockService.adjustStock(cleanStockId, {
          type: 'IN',
          quantity: cleanStockQty,
          date: cleanDate,
          reference_note: refParts.join(' • '),
        }).catch((e) => console.warn('⚠️ Vyapari stock+ adjust warning:', e.message));
      }

      return {
        id: res.insertId,
        account_id: numAccId,
        type: cleanType,
        amount: cleanAmt,
        date: cleanDate,
        particulars: cleanPart,
        bill_no: cleanBillNo,
        stock_item_id: cleanStockId,
        stock_item_name: cleanStockName,
        stock_qty: cleanStockQty,
        payment_mode: cleanMode,
        cycle_no: currentCycle,
        is_settled: false,
        rojmed_entry_id: rojmed_entry_id ? Number(rojmed_entry_id) : null,
      };
    } catch (err) {
      if (conn) await conn.rollback().catch(() => {});
      console.warn('⚠️ [VyapariService addEntry DB Fallback]:', err.message);
      const txId = nextEntryId++;
      let finalRojmedId = rojmed_entry_id ? Number(rojmed_entry_id) : null;
      const acc = memoryVyapariAccounts.find((a) => a.id === numAccId);
      const partyName = acc?.party_name || `Vyapari #${numAccId}`;
      const firmName = acc?.firm_name || '';
      const currentCycle = Number(acc?.current_cycle) || 1;

      if (shouldSyncRojmed) {
        const map = formatVyapariRojmedMapping(cleanType, partyName, firmName, cleanPart);
        finalRojmedId = rojmedService.syncMemoryFromLinkedTx({
          action: 'create',
          sourceType: 'vyapari_account',
          sourceId: numAccId,
          linkedTxId: txId,
          entryType: map.entry_type,
          subType: map.sub_type,
          amount: cleanAmt,
          date: cleanDate,
          particulars: map.particulars,
          notes: cleanPart,
          vyapariPartyName: partyName,
          vyapariFirmName: firmName,
          vyapariPageNo: acc?.page_no ?? null,
        });
      }

      if (cleanStockId && cleanStockQty) {
        const refParts = [`Vyapari: ${partyName}`];
        if (cleanBillNo) refParts.push(`Bill #${cleanBillNo}`);
        await stockService.adjustStock(cleanStockId, {
          type: 'IN',
          quantity: cleanStockQty,
          date: cleanDate,
          reference_note: refParts.join(' • '),
        }).catch(() => {});
      }

      const newEntry = {
        id: txId,
        account_id: numAccId,
        type: cleanType,
        amount: cleanAmt,
        date: cleanDate,
        particulars: cleanPart,
        bill_no: cleanBillNo,
        stock_item_id: cleanStockId,
        stock_item_name: cleanStockName,
        stock_qty: cleanStockQty,
        payment_mode: cleanMode,
        cycle_no: currentCycle,
        is_settled: 0,
        rojmed_entry_id: finalRojmedId,
        created_at: new Date().toISOString(),
      };
      memoryVyapariEntries.push(newEntry);
      return newEntry;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Update entry in vyapari account (and keep linked Rojmed entry in sync)
   */
  async updateEntry(accountId, entryId, data) {
    const numAccId = Number(accountId);
    const numEntryId = Number(entryId);
    const { type, amount, date, particulars, payment_mode, add_to_rojmed, bill_no, _skipRojmedSync = false } = data;
    const cleanType = type === 'udhar' ? 'udhar' : 'jama';
    const cleanAmt = Number(amount) || 0;
    const cleanDate = formatDate(date) || formatDate(new Date());
    const cleanPart = particulars ? particulars.trim() : (cleanType === 'jama' ? 'રોકડા જમા' : 'માલ ઉધાર / બિલ');
    const cleanMode = payment_mode ? String(payment_mode).trim() : 'Cash';
    const hasBillNo = bill_no !== undefined;
    const cleanBillNo = hasBillNo ? (bill_no ? String(bill_no).trim() : null) : undefined;

    let conn = null;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [existingRows] = await conn.query(
        `SELECT e.*, a.party_name, a.firm_name
           FROM vyapari_account_entries e
           LEFT JOIN vyapari_accounts a ON e.account_id = a.id
           WHERE e.id = ? AND e.account_id = ? LIMIT 1`,
        [numEntryId, numAccId]
      );
      if (!existingRows || existingRows.length === 0) {
        await conn.rollback();
        return null;
      }
      const existing = existingRows[0];
      const partyName = existing.party_name || `Vyapari #${numAccId}`;
      const firmName = existing.firm_name || '';
      let finalRojmedId = existing.rojmed_entry_id ? Number(existing.rojmed_entry_id) : null;

      const finalBillNo = hasBillNo ? cleanBillNo : existing.bill_no;
      await conn.query(
        `UPDATE vyapari_account_entries
           SET type = ?, amount = ?, date = ?, particulars = ?, bill_no = ?, payment_mode = ?
           WHERE id = ? AND account_id = ?`,
        [cleanType, cleanAmt, cleanDate, cleanPart, finalBillNo, cleanMode, numEntryId, numAccId]
      );

      if (!_skipRojmedSync) {
        const wantRojmed = add_to_rojmed !== undefined ? Boolean(add_to_rojmed) : Boolean(finalRojmedId);
        const canStayInRojmed = wantRojmed && cleanMode === 'Cash';

        if (finalRojmedId && !canStayInRojmed) {
          await conn.query('DELETE FROM rojmed_entries WHERE id = ?', [finalRojmedId]);
          await conn.query('UPDATE vyapari_account_entries SET rojmed_entry_id = NULL WHERE id = ?', [numEntryId]);
          finalRojmedId = null;
        } else if (finalRojmedId && canStayInRojmed) {
          const map = formatVyapariRojmedMapping(cleanType, partyName, firmName, cleanPart);
          await conn.query(
            `UPDATE rojmed_entries
               SET date = ?, entry_type = ?, amount = ?, particulars = ?, sub_type = ?, notes = ?
               WHERE id = ?`,
            [cleanDate, map.entry_type, cleanAmt, map.particulars, map.sub_type, cleanPart, finalRojmedId]
          );
        } else if (!finalRojmedId && canStayInRojmed) {
          const map = formatVyapariRojmedMapping(cleanType, partyName, firmName, cleanPart);
          const [rRes] = await conn.query(
            `INSERT INTO rojmed_entries
                (date, entry_type, amount, particulars, source_type, source_id, sub_type, linked_tx_id, payment_mode, notes)
               VALUES (?, ?, ?, ?, 'vyapari_account', ?, ?, ?, 'Cash', ?)`,
            [cleanDate, map.entry_type, cleanAmt, map.particulars, numAccId, map.sub_type, numEntryId, cleanPart]
          );
          finalRojmedId = rRes.insertId;
          await conn.query('UPDATE vyapari_account_entries SET rojmed_entry_id = ? WHERE id = ?', [finalRojmedId, numEntryId]);
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
      console.warn('⚠️ [VyapariService updateEntry DB Fallback]:', err.message);
      const idx = memoryVyapariEntries.findIndex((e) => e.id === numEntryId && e.account_id === numAccId);
      if (idx === -1) return null;

      const existing = memoryVyapariEntries[idx];
      let finalRojmedId = existing.rojmed_entry_id || null;

      if (!_skipRojmedSync) {
        const acc = memoryVyapariAccounts.find((a) => a.id === numAccId);
        const partyName = acc?.party_name || `Vyapari #${numAccId}`;
        const firmName = acc?.firm_name || '';
        const wantRojmed = add_to_rojmed !== undefined ? Boolean(add_to_rojmed) : Boolean(finalRojmedId);
        const canStayInRojmed = wantRojmed && cleanMode === 'Cash';

        if (finalRojmedId && !canStayInRojmed) {
          rojmedService.syncMemoryFromLinkedTx({ action: 'delete', rojmedEntryId: finalRojmedId });
          finalRojmedId = null;
        } else if (canStayInRojmed) {
          const map = formatVyapariRojmedMapping(cleanType, partyName, firmName, cleanPart);
          finalRojmedId = rojmedService.syncMemoryFromLinkedTx({
            action: finalRojmedId ? 'update' : 'create',
            rojmedEntryId: finalRojmedId,
            sourceType: 'vyapari_account',
            sourceId: numAccId,
            linkedTxId: numEntryId,
            entryType: map.entry_type,
            subType: map.sub_type,
            amount: cleanAmt,
            date: cleanDate,
            particulars: map.particulars,
            notes: cleanPart,
            vyapariPartyName: partyName,
            vyapariFirmName: firmName,
            vyapariPageNo: acc?.page_no ?? null,
          });
        }
      }

      memoryVyapariEntries[idx] = {
        ...existing,
        type: cleanType,
        amount: cleanAmt,
        date: cleanDate,
        particulars: cleanPart,
        payment_mode: cleanMode,
        rojmed_entry_id: finalRojmedId,
      };
      return memoryVyapariEntries[idx];
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Delete entry from vyapari account (and its linked Rojmed entry if any)
   */
  async deleteEntry(accountId, entryId, { _skipRojmedSync = false } = {}) {
    const numAccId = Number(accountId);
    const numEntryId = Number(entryId);
    let conn = null;

    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [existingRows] = await conn.query(
        'SELECT rojmed_entry_id FROM vyapari_account_entries WHERE id = ? AND account_id = ? LIMIT 1',
        [numEntryId, numAccId]
      );
      const linkedRojmedId = existingRows?.[0]?.rojmed_entry_id || null;

      await conn.query('DELETE FROM vyapari_account_entries WHERE id = ? AND account_id = ?', [numEntryId, numAccId]);
      if (!_skipRojmedSync && linkedRojmedId) {
        await conn.query('DELETE FROM rojmed_entries WHERE id = ?', [linkedRojmedId]);
      }

      await conn.commit();
      return { success: true, id: numEntryId };
    } catch (err) {
      if (conn) await conn.rollback().catch(() => {});
      console.warn('⚠️ [VyapariService deleteEntry DB Fallback]:', err.message);
      const existing = memoryVyapariEntries.find((e) => e.id === numEntryId && e.account_id === numAccId);
      if (!_skipRojmedSync && existing?.rojmed_entry_id) {
        rojmedService.syncMemoryFromLinkedTx({ action: 'delete', rojmedEntryId: existing.rojmed_entry_id });
      }
      memoryVyapariEntries = memoryVyapariEntries.filter((e) => !(e.id === numEntryId && e.account_id === numAccId));
      return { success: true, id: numEntryId };
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Settle current cycle of vyapari account (archive active entries, open next round)
   */
  async settleCycle(id, { notes } = {}) {
    const numId = Number(id);
    let conn = null;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [accRows] = await conn.query('SELECT current_cycle FROM vyapari_accounts WHERE id = ? LIMIT 1', [numId]);
      if (!accRows || !accRows.length) {
        await conn.rollback();
        return null;
      }
      const curCycle = Number(accRows[0].current_cycle) || 1;

      const [sumRows] = await conn.query(
        `SELECT 
          COALESCE(SUM(CASE WHEN type = 'jama' THEN amount ELSE 0 END), 0) AS total_jama,
          COALESCE(SUM(CASE WHEN type = 'udhar' THEN amount ELSE 0 END), 0) AS total_udhar
        FROM vyapari_account_entries
        WHERE account_id = ? AND (is_settled = 0 OR is_settled IS NULL)`,
        [numId]
      );
      const curJama = Number(sumRows?.[0]?.total_jama) || 0;
      const curUdhar = Number(sumRows?.[0]?.total_udhar) || 0;
      const carryDiff = curUdhar - curJama;

      await conn.query(
        'UPDATE vyapari_account_entries SET is_settled = 1, cycle_no = ? WHERE account_id = ? AND (is_settled = 0 OR is_settled IS NULL)',
        [curCycle, numId]
      );

      const nextCycle = curCycle + 1;
      await conn.query('UPDATE vyapari_accounts SET current_cycle = ? WHERE id = ?', [nextCycle, numId]);

      if (carryDiff > 0) {
        await conn.query(
          `INSERT INTO vyapari_account_entries (account_id, type, amount, date, particulars, payment_mode, cycle_no, is_settled, rojmed_entry_id)
           VALUES (?, 'udhar', ?, CURDATE(), ?, 'Cash', ?, 0, NULL)`,
          [numId, carryDiff, `Round ${curCycle} ની આગળની બાકી રહેલ રકમ`, nextCycle]
        );
      } else if (carryDiff < 0) {
        await conn.query(
          `INSERT INTO vyapari_account_entries (account_id, type, amount, date, particulars, payment_mode, cycle_no, is_settled, rojmed_entry_id)
           VALUES (?, 'jama', ?, CURDATE(), ?, 'Cash', ?, 0, NULL)`,
          [numId, Math.abs(carryDiff), `Round ${curCycle} ની આગળની એડવાન્સ જમા રકમ`, nextCycle]
        );
      }

      await conn.commit();
      return this.getAccountById(numId);
    } catch (err) {
      if (conn) await conn.rollback().catch(() => {});
      console.warn('⚠️ [VyapariService settleCycle DB Fallback]:', err.message);
      const acc = memoryVyapariAccounts.find((a) => a.id === numId);
      if (acc) {
        const curCycle = Number(acc.current_cycle) || 1;
        const activeEntries = memoryVyapariEntries.filter(
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
          memoryVyapariEntries.push({
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
          memoryVyapariEntries.push({
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
   * Reopen previous cycle of vyapari account
   */
  async reopenCycle(id) {
    const numId = Number(id);
    let conn = null;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [accRows] = await conn.query('SELECT current_cycle FROM vyapari_accounts WHERE id = ? LIMIT 1', [numId]);
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
      await conn.query(
        'DELETE FROM vyapari_account_entries WHERE account_id = ? AND cycle_no = ? AND particulars LIKE ?',
        [numId, curCycle, `%Round ${targetCycle} ની આગળની%`]
      );

      await conn.query(
        'UPDATE vyapari_account_entries SET is_settled = 0 WHERE account_id = ? AND cycle_no = ?',
        [numId, targetCycle]
      );

      await conn.query('UPDATE vyapari_accounts SET current_cycle = ? WHERE id = ?', [targetCycle, numId]);

      await conn.commit();
      return this.getAccountById(numId);
    } catch (err) {
      if (conn) await conn.rollback().catch(() => {});
      console.warn('⚠️ [VyapariService reopenCycle DB Fallback]:', err.message);
      const acc = memoryVyapariAccounts.find((a) => a.id === numId);
      if (acc && (Number(acc.current_cycle) || 1) > 1) {
        const curCycle = Number(acc.current_cycle) || 1;
        const targetCycle = curCycle - 1;
        memoryVyapariEntries = memoryVyapariEntries.filter(
          (e) => !(e.account_id === numId && Number(e.cycle_no) === curCycle && String(e.particulars).includes(`Round ${targetCycle} ની આગળની`))
        );
        memoryVyapariEntries.forEach((e) => {
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

export const vyapariService = new VyapariService();
export default vyapariService;
