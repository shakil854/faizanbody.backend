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

const VALID_TYPES = ['upi_account', 'truck_account', 'vyapari_account', 'worker', 'general'];

function formatTxRow(r) {
  return {
    id: r.id,
    date: formatLocalDate(r.date),
    amount: Number(r.amount) || 0,
    particulars: r.particulars || '',
    from_type: r.from_type || 'general',
    from_id: r.from_id ? Number(r.from_id) : null,
    from_label: r.from_label || 'General',
    from_linked_tx_id: r.from_linked_tx_id ? Number(r.from_linked_tx_id) : null,
    to_type: r.to_type || 'general',
    to_id: r.to_id ? Number(r.to_id) : null,
    to_label: r.to_label || 'General',
    to_linked_tx_id: r.to_linked_tx_id ? Number(r.to_linked_tx_id) : null,
    notes: r.notes || '',
    created_by: r.created_by || null,
    created_at: r.created_at,
  };
}

class UpiRojmedService {
  async getUpiAccounts() {
    try {
      const [accounts] = await db.query('SELECT * FROM upi_accounts ORDER BY id ASC');
      const [inRows] = await db.query(
        "SELECT to_id AS account_id, COALESCE(SUM(amount), 0) AS total_in FROM upi_transactions WHERE to_type = 'upi_account' AND to_id IS NOT NULL GROUP BY to_id"
      );
      const [outRows] = await db.query(
        "SELECT from_id AS account_id, COALESCE(SUM(amount), 0) AS total_out FROM upi_transactions WHERE from_type = 'upi_account' AND from_id IS NOT NULL GROUP BY from_id"
      );

      const inMap = new Map(inRows.map((r) => [Number(r.account_id), Number(r.total_in) || 0]));
      const outMap = new Map(outRows.map((r) => [Number(r.account_id), Number(r.total_out) || 0]));

      return (accounts || []).map((a) => {
        const opening = Number(a.opening_balance) || 0;
        const totalIn = inMap.get(Number(a.id)) || 0;
        const totalOut = outMap.get(Number(a.id)) || 0;
        return {
          id: a.id,
          name: a.name,
          upi_id: a.upi_id || '',
          opening_balance: opening,
          total_in: totalIn,
          total_out: totalOut,
          current_balance: Number((opening + totalIn - totalOut).toFixed(2)),
          notes: a.notes || '',
          created_at: a.created_at,
        };
      });
    } catch (err) {
      console.warn('⚠️ [UpiRojmedService getUpiAccounts DB Fallback]:', err.message);
      return memoryUpiAccounts.map((a) => {
        const opening = Number(a.opening_balance) || 0;
        const totalIn = memoryUpiTransactions
          .filter((t) => t.to_type === 'upi_account' && Number(t.to_id) === Number(a.id))
          .reduce((s, t) => s + (Number(t.amount) || 0), 0);
        const totalOut = memoryUpiTransactions
          .filter((t) => t.from_type === 'upi_account' && Number(t.from_id) === Number(a.id))
          .reduce((s, t) => s + (Number(t.amount) || 0), 0);
        return {
          ...a,
          opening_balance: opening,
          total_in: totalIn,
          total_out: totalOut,
          current_balance: Number((opening + totalIn - totalOut).toFixed(2)),
        };
      });
    }
  }

  async createUpiAccount({ name, upi_id = '', opening_balance = 0, notes = '' }) {
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('UPI Account name is required');
    const cleanUpiId = (upi_id || '').trim() || null;
    const cleanOpening = Number(opening_balance) || 0;
    const cleanNotes = (notes || '').trim() || null;

    try {
      const [res] = await db.query(
        'INSERT INTO upi_accounts (name, upi_id, opening_balance, notes) VALUES (?, ?, ?, ?)',
        [cleanName, cleanUpiId, cleanOpening, cleanNotes]
      );
      const list = await this.getUpiAccounts();
      return list.find((a) => a.id === res.insertId) || { id: res.insertId, name: cleanName };
    } catch (err) {
      console.warn('⚠️ [UpiRojmedService createUpiAccount DB Fallback]:', err.message);
      const acc = {
        id: nextUpiAccountId++,
        name: cleanName,
        upi_id: cleanUpiId || '',
        opening_balance: cleanOpening,
        notes: cleanNotes || '',
        created_at: new Date().toISOString(),
      };
      memoryUpiAccounts.push(acc);
      return { ...acc, total_in: 0, total_out: 0, current_balance: cleanOpening };
    }
  }

  async updateUpiAccount(id, { name, upi_id = '', opening_balance = 0, notes = '' }) {
    const numId = Number(id);
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('UPI Account name is required');
    const cleanUpiId = (upi_id || '').trim() || null;
    const cleanOpening = Number(opening_balance) || 0;
    const cleanNotes = (notes || '').trim() || null;

    try {
      await db.query(
        'UPDATE upi_accounts SET name = ?, upi_id = ?, opening_balance = ?, notes = ? WHERE id = ?',
        [cleanName, cleanUpiId, cleanOpening, cleanNotes, numId]
      );
      const list = await this.getUpiAccounts();
      return list.find((a) => a.id === numId) || null;
    } catch (err) {
      console.warn('⚠️ [UpiRojmedService updateUpiAccount DB Fallback]:', err.message);
      const idx = memoryUpiAccounts.findIndex((a) => a.id === numId);
      if (idx === -1) return null;
      memoryUpiAccounts[idx] = {
        ...memoryUpiAccounts[idx],
        name: cleanName,
        upi_id: cleanUpiId || '',
        opening_balance: cleanOpening,
        notes: cleanNotes || '',
      };
      const list = await this.getUpiAccounts();
      return list.find((a) => a.id === numId) || null;
    }
  }

  async deleteUpiAccount(id) {
    const numId = Number(id);
    try {
      const [rows] = await db.query(
        "SELECT COUNT(*) AS cnt FROM upi_transactions WHERE (from_type = 'upi_account' AND from_id = ?) OR (to_type = 'upi_account' AND to_id = ?)",
        [numId, numId]
      );
      if (Number(rows[0]?.cnt) > 0) {
        throw new Error('Cannot delete UPI account with existing transactions. Delete its entries first.');
      }
      await db.query('DELETE FROM upi_accounts WHERE id = ?', [numId]);
      return { success: true, id: numId };
    } catch (err) {
      if (err.message.includes('Cannot delete UPI account')) throw err;
      const hasTx = memoryUpiTransactions.some(
        (t) =>
          (t.from_type === 'upi_account' && Number(t.from_id) === numId) ||
          (t.to_type === 'upi_account' && Number(t.to_id) === numId)
      );
      if (hasTx) {
        throw new Error('Cannot delete UPI account with existing transactions.');
      }
      memoryUpiAccounts = memoryUpiAccounts.filter((a) => a.id !== numId);
      return { success: true, id: numId };
    }
  }

  async getUpiOptions() {
    const [upiAccounts, workers, truckAccounts, vyapariAccounts] = await Promise.all([
      this.getUpiAccounts().catch(() => []),
      workerService.getAllWorkers().catch(() => []),
      truckAccountService.getAllAccounts().catch(() => []),
      vyapariService.getAllAccounts().catch(() => []),
    ]);

    return {
      upi_accounts: upiAccounts,
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

  async getDailyUpiSheet(targetDateInput) {
    const targetDate = formatLocalDate(targetDateInput) || getTodayDate();
    const upiAccounts = await this.getUpiAccounts();
    const totalUpiSilak = Number(
      upiAccounts.reduce((sum, a) => sum + (Number(a.current_balance) || 0), 0).toFixed(2)
    );

    let entries = [];
    try {
      const [rows] = await db.query(
        'SELECT * FROM upi_transactions WHERE date = ? ORDER BY id DESC',
        [targetDate]
      );
      entries = (rows || []).map(formatTxRow);
    } catch (err) {
      console.warn('⚠️ [UpiRojmedService getDailySheet DB Fallback]:', err.message);
      entries = memoryUpiTransactions
        .filter((t) => t.date === targetDate)
        .map(formatTxRow)
        .sort((a, b) => b.id - a.id);
    }

    const dayIn = entries
      .filter((e) => e.to_type === 'upi_account')
      .reduce((s, e) => s + e.amount, 0);
    const dayOut = entries
      .filter((e) => e.from_type === 'upi_account')
      .reduce((s, e) => s + e.amount, 0);

    return {
      date: targetDate,
      upi_accounts: upiAccounts,
      total_upi_silak: totalUpiSilak,
      day_total_in: Number(dayIn.toFixed(2)),
      day_total_out: Number(dayOut.toFixed(2)),
      entries,
    };
  }

  async _resolveEntityLabel(type, id) {
    if (type === 'general' || !id) return 'General';
    const numId = Number(id);
    if (type === 'upi_account') {
      const list = await this.getUpiAccounts();
      const found = list.find((a) => Number(a.id) === numId);
      return found ? `${found.name} (UPI)` : `UPI #${numId}`;
    }
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
    return 'General';
  }

  async _createSideLinkedEntry({ side, type, id, amount, date, particulars, notes }) {
    if (!id || type === 'general' || type === 'upi_account') return null;
    // side === 'from' -> party GAVE money -> Jama / Salary
    // side === 'to' -> party RECEIVED money -> Udhar / Upad
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
    if (!linkedTxId || !type || type === 'general' || type === 'upi_account') return;
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

    const fromType = VALID_TYPES.includes(payload.from_type) ? payload.from_type : 'general';
    const toType = VALID_TYPES.includes(payload.to_type) ? payload.to_type : 'general';
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
      (payload.particulars || '').trim() || `UPI: ${fromLabel} ➔ ${toLabel}`;

    const fromLinkedTxId = await this._createSideLinkedEntry({
      side: 'from',
      type: fromType,
      id: fromId,
      amount: numAmount,
      date: cleanDate,
      particulars: `${cleanParticulars} (To: ${toLabel})`,
      notes: cleanNotes,
    });

    const toLinkedTxId = await this._createSideLinkedEntry({
      side: 'to',
      type: toType,
      id: toId,
      amount: numAmount,
      date: cleanDate,
      particulars: `${cleanParticulars} (From: ${fromLabel})`,
      notes: cleanNotes,
    });

    try {
      const [res] = await db.query(
        `INSERT INTO upi_transactions
          (date, amount, particulars, from_type, from_id, from_label, from_linked_tx_id,
           to_type, to_id, to_label, to_linked_tx_id, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cleanDate,
          numAmount,
          cleanParticulars,
          fromType,
          fromId,
          fromLabel,
          fromLinkedTxId,
          toType,
          toId,
          toLabel,
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
        amount: numAmount,
        particulars: cleanParticulars,
        from_type: fromType,
        from_id: fromId,
        from_label: fromLabel,
        from_linked_tx_id: fromLinkedTxId,
        to_type: toType,
        to_id: toId,
        to_label: toLabel,
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
