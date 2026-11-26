import db from '../config/db.js';
import { workerService } from './worker.service.js';
import { orderService } from './order.service.js';

/**
 * ====================================================================
 * 📦 Stock & Inventory Service for Truck Body Fabrication
 * ====================================================================
 * - Strict Zero Dummy Data Rule: Starts with empty stores [].
 * - Supports dual MySQL + In-Memory Fallback.
 * - Tracks stock balance, low stock thresholds, and transaction audit trails.
 * ====================================================================
 */

let memoryCategories = [];
let nextCategoryId = 1;

let memoryItems = [];
let nextItemId = 1;

let memoryTransactions = [];
let nextTxId = 1;

let memoryWorkerRatings = new Map(); // worker_id -> { worker_id, rating, note, updated_at }

// Format date helper
function formatDate(val) {
  if (!val) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof val === 'string') return val.split('T')[0];
  if (val instanceof Date) {
    const yyyy = val.getFullYear();
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const dd = String(val.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return val;
}

function formatItemRow(row) {
  if (!row) return null;
  const quantity = Number(row.quantity) || 0;
  const minAlert = Number(row.min_alert_quantity) || 0;
  return {
    id: row.id,
    name: row.name,
    category_id: row.category_id || null,
    category_name: row.category_name,
    unit: row.unit || 'Pcs',
    quantity: quantity,
    min_alert_quantity: minAlert,
    is_low_stock: quantity <= minAlert,
    unit_price: row.unit_price !== null && row.unit_price !== undefined ? Number(row.unit_price) : null,
    location: row.location || '',
    notes: row.notes || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

class StockService {
  /* ====================================================================
   * 🏷️ CATEGORY MANAGEMENT
   * ==================================================================== */

  async getAllCategories() {
    try {
      const sql = `
        SELECT c.*, COUNT(i.id) AS item_count
        FROM stock_categories c
        LEFT JOIN stock_items i ON c.name = i.category_name
        GROUP BY c.id
        ORDER BY c.name ASC
      `;
      const [rows] = await db.query(sql);
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        item_count: Number(r.item_count) || 0,
        created_at: r.created_at,
      }));
    } catch (err) {
      console.warn('⚠️ [StockService Category DB Warning - Using Memory Store]:', err.message);
      return memoryCategories.map((c) => {
        const count = memoryItems.filter((i) => i.category_name.toLowerCase() === c.name.toLowerCase()).length;
        return {
          id: c.id,
          name: c.name,
          item_count: count,
          created_at: c.created_at,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  async createCategory(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new Error('Category name is required');
    }

    try {
      // Check existing
      const [existing] = await db.query('SELECT * FROM stock_categories WHERE LOWER(name) = LOWER(?) LIMIT 1', [trimmed]);
      if (existing && existing.length > 0) {
        return existing[0];
      }

      const [res] = await db.query('INSERT INTO stock_categories (name) VALUES (?)', [trimmed]);
      return {
        id: res.insertId,
        name: trimmed,
        created_at: new Date(),
      };
    } catch (err) {
      console.warn('⚠️ [StockService Create Cat DB Warning - Using Memory Store]:', err.message);
      const existing = memoryCategories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) return existing;

      const newCat = {
        id: nextCategoryId++,
        name: trimmed,
        created_at: new Date().toISOString(),
      };
      memoryCategories.push(newCat);
      return newCat;
    }
  }

  async updateCategory(id, newName) {
    const numId = Number(id);
    const trimmed = (newName || '').trim();
    if (!trimmed) {
      throw new Error('Category name is required (કેટેગરીનું નામ જરૂરી છે)');
    }

    try {
      // 1. Check if category exists
      const [catRows] = await db.query('SELECT * FROM stock_categories WHERE id = ? LIMIT 1', [numId]);
      if (!catRows || catRows.length === 0) {
        throw new Error('Category not found');
      }
      const oldName = catRows[0].name;

      // 2. Check if another category already has this name
      const [existing] = await db.query(
        'SELECT * FROM stock_categories WHERE LOWER(name) = LOWER(?) AND id != ? LIMIT 1',
        [trimmed, numId]
      );
      if (existing && existing.length > 0) {
        throw new Error(`Category "${trimmed}" already exists (આ નામની કેટેગરી પહેલેથી હાજર છે).`);
      }

      // 3. Update stock_categories table
      await db.query('UPDATE stock_categories SET name = ? WHERE id = ?', [trimmed, numId]);

      // 4. Update linked items in stock_items
      await db.query(
        'UPDATE stock_items SET category_name = ? WHERE category_id = ? OR category_name = ?',
        [trimmed, numId, oldName]
      );

      return {
        id: numId,
        name: trimmed,
        old_name: oldName,
      };
    } catch (err) {
      if (err.message.includes('already exists') || err.message.includes('Category not found')) throw err;
      console.warn('⚠️ [StockService Update Cat DB Warning - Using Memory Store]:', err.message);

      const cat = memoryCategories.find((c) => c.id === numId);
      if (!cat) throw new Error('Category not found');

      const duplicate = memoryCategories.find(
        (c) => c.name.toLowerCase() === trimmed.toLowerCase() && c.id !== numId
      );
      if (duplicate) {
        throw new Error(`Category "${trimmed}" already exists.`);
      }

      const oldName = cat.name;
      cat.name = trimmed;

      // Update memory items
      memoryItems.forEach((i) => {
        if (i.category_id === numId || (i.category_name && i.category_name.toLowerCase() === oldName.toLowerCase())) {
          i.category_name = trimmed;
        }
      });

      return { id: numId, name: trimmed, old_name: oldName };
    }
  }

  async deleteCategory(id) {
    const numId = Number(id);
    try {
      // Get category name
      const [catRows] = await db.query('SELECT * FROM stock_categories WHERE id = ? LIMIT 1', [numId]);
      if (!catRows || catRows.length === 0) return false;
      const catName = catRows[0].name;

      // Check if any items belong to this category
      const [itemRows] = await db.query('SELECT COUNT(*) as count FROM stock_items WHERE category_name = ?', [catName]);
      if (itemRows[0].count > 0) {
        throw new Error(`Cannot delete category "${catName}" because it has ${itemRows[0].count} item(s) in stock.`);
      }

      await db.query('DELETE FROM stock_categories WHERE id = ?', [numId]);
      return true;
    } catch (err) {
      if (err.message.includes('Cannot delete category')) throw err;
      const cat = memoryCategories.find((c) => c.id === numId);
      if (!cat) return false;

      const count = memoryItems.filter((i) => i.category_name.toLowerCase() === cat.name.toLowerCase()).length;
      if (count > 0) {
        throw new Error(`Cannot delete category "${cat.name}" because it has ${count} item(s) in stock.`);
      }

      memoryCategories = memoryCategories.filter((c) => c.id !== numId);
      return true;
    }
  }

  /* ====================================================================
   * 📦 STOCK ITEMS MANAGEMENT
   * ==================================================================== */

  async getAllItems({ search = '', category = 'all', lowStockOnly = false } = {}) {
    try {
      let sql = 'SELECT * FROM stock_items';
      const conditions = [];
      const params = [];

      if (search && search.trim()) {
        const q = `%${search.trim()}%`;
        conditions.push('(name LIKE ? OR location LIKE ? OR notes LIKE ?)');
        params.push(q, q, q);
      }

      if (category && category !== 'all') {
        conditions.push('category_name = ?');
        params.push(category);
      }

      if (lowStockOnly) {
        conditions.push('quantity <= min_alert_quantity');
      }

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }

      sql += ' ORDER BY name ASC';

      const [rows] = await db.query(sql, params);
      return rows.map(formatItemRow);
    } catch (err) {
      console.warn('⚠️ [StockService Items DB Warning - Using Memory Store]:', err.message);
      let list = [...memoryItems];

      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        list = list.filter(
          (i) =>
            i.name?.toLowerCase().includes(q) ||
            i.location?.toLowerCase().includes(q) ||
            i.notes?.toLowerCase().includes(q)
        );
      }

      if (category && category !== 'all') {
        list = list.filter((i) => i.category_name === category);
      }

      if (lowStockOnly) {
        list = list.filter((i) => Number(i.quantity) <= Number(i.min_alert_quantity));
      }

      list.sort((a, b) => a.name.localeCompare(b.name));
      return list.map(formatItemRow);
    }
  }

  async getItemById(id) {
    const numId = Number(id);
    try {
      const [rows] = await db.query('SELECT * FROM stock_items WHERE id = ? LIMIT 1', [numId]);
      if (rows && rows.length > 0) {
        return formatItemRow(rows[0]);
      }
      return null;
    } catch (err) {
      const item = memoryItems.find((i) => i.id === numId);
      return item ? formatItemRow(item) : null;
    }
  }

  async createItem(data) {
    const name = (data.name || '').trim();
    const category_name = (data.category_name || '').trim();
    const unit = (data.unit || 'Pcs').trim();
    const quantity = parseFloat(data.quantity) || 0;
    const min_alert_quantity = parseFloat(data.min_alert_quantity) || 0;
    const unit_price = data.unit_price !== undefined && data.unit_price !== '' && data.unit_price !== null ? parseFloat(data.unit_price) : null;
    const location = (data.location || '').trim();
    const notes = (data.notes || '').trim();

    if (!name) throw new Error('Item name is required');
    if (!category_name) throw new Error('Category is required');

    // Ensure category exists
    await this.createCategory(category_name).catch(() => {});

    try {
      const sql = `
        INSERT INTO stock_items (name, category_name, unit, quantity, min_alert_quantity, unit_price, location, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const [res] = await db.query(sql, [
        name,
        category_name,
        unit,
        quantity,
        min_alert_quantity,
        unit_price,
        location,
        notes,
      ]);

      const newItemId = res.insertId;

      // If initial quantity > 0, log initial stock transaction
      if (quantity > 0) {
        try {
          const txSql = `
            INSERT INTO stock_transactions (item_id, type, quantity, previous_quantity, new_quantity, date, reference_note)
            VALUES (?, 'IN', ?, 0, ?, ?, 'Initial Stock Setup')
          `;
          await db.query(txSql, [newItemId, quantity, quantity, formatDate()]);
        } catch (txErr) {
          console.warn('Initial stock tx insert warning:', txErr.message);
        }
      }

      return await this.getItemById(newItemId);
    } catch (err) {
      console.warn('⚠️ [StockService Create Item DB Warning - Using Memory Store]:', err.message);
      const newItem = {
        id: nextItemId++,
        name,
        category_name,
        unit,
        quantity,
        min_alert_quantity,
        unit_price,
        location,
        notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      memoryItems.push(newItem);

      if (quantity > 0) {
        memoryTransactions.push({
          id: nextTxId++,
          item_id: newItem.id,
          type: 'IN',
          quantity,
          previous_quantity: 0,
          new_quantity: quantity,
          date: formatDate(),
          reference_note: 'Initial Stock Setup',
          created_at: new Date().toISOString(),
        });
      }

      return formatItemRow(newItem);
    }
  }

  async updateItem(id, data) {
    const numId = Number(id);
    const existing = await this.getItemById(numId);
    if (!existing) return null;

    const name = data.name !== undefined ? data.name.trim() : existing.name;
    const category_name = data.category_name !== undefined ? data.category_name.trim() : existing.category_name;
    const unit = data.unit !== undefined ? data.unit.trim() : existing.unit;
    const min_alert_quantity = data.min_alert_quantity !== undefined ? parseFloat(data.min_alert_quantity) || 0 : existing.min_alert_quantity;
    const unit_price = data.unit_price !== undefined && data.unit_price !== '' && data.unit_price !== null ? parseFloat(data.unit_price) : null;
    const location = data.location !== undefined ? data.location.trim() : existing.location;
    const notes = data.notes !== undefined ? data.notes.trim() : existing.notes;

    if (category_name) {
      await this.createCategory(category_name).catch(() => {});
    }

    try {
      const sql = `
        UPDATE stock_items
        SET name = ?, category_name = ?, unit = ?, min_alert_quantity = ?, unit_price = ?, location = ?, notes = ?
        WHERE id = ?
      `;
      await db.query(sql, [name, category_name, unit, min_alert_quantity, unit_price, location, notes, numId]);
      return await this.getItemById(numId);
    } catch (err) {
      console.warn('⚠️ [StockService Update DB Warning - Using Memory Store]:', err.message);
      const idx = memoryItems.findIndex((i) => i.id === numId);
      if (idx !== -1) {
        memoryItems[idx] = {
          ...memoryItems[idx],
          name,
          category_name,
          unit,
          min_alert_quantity,
          unit_price,
          location,
          notes,
          updated_at: new Date().toISOString(),
        };
        return formatItemRow(memoryItems[idx]);
      }
      return null;
    }
  }

  async deleteItem(id) {
    const numId = Number(id);
    try {
      await db.query('DELETE FROM stock_transactions WHERE item_id = ?', [numId]);
      const [res] = await db.query('DELETE FROM stock_items WHERE id = ?', [numId]);
      return res.affectedRows > 0;
    } catch (err) {
      console.warn('⚠️ [StockService Delete DB Warning - Using Memory Store]:', err.message);
      memoryTransactions = memoryTransactions.filter((t) => t.item_id !== numId);
      const prevLen = memoryItems.length;
      memoryItems = memoryItems.filter((i) => i.id !== numId);
      return memoryItems.length < prevLen;
    }
  }

  /* ====================================================================
   * 🔄 STOCK ADJUSTMENT & TRANSACTIONS (Proper Stock Maintenance)
   * ==================================================================== */

  async adjustStock(
    itemId,
    {
      type,
      quantity,
      date,
      reference_note,
      worker_id = null,
      worker_name = null,
      order_id = null,
      order_no = null,
      truck_chassis_no = null,
    } = {}
  ) {
    const numId = Number(itemId);
    const item = await this.getItemById(numId);
    if (!item) throw new Error('Stock item not found');

    const adjQty = Math.abs(parseFloat(quantity) || 0);
    if (adjQty <= 0 && type !== 'ADJUSTMENT') {
      throw new Error('Quantity must be greater than zero');
    }

    const prevQty = Number(item.quantity) || 0;
    let newQty = prevQty;
    const upperType = (type || 'IN').toUpperCase();

    if (upperType === 'IN') {
      newQty = prevQty + adjQty;
    } else if (upperType === 'OUT') {
      if (adjQty > prevQty) {
        throw new Error(`Insufficient stock. Current stock is ${prevQty} ${item.unit}.`);
      }
      newQty = prevQty - adjQty;
    } else if (upperType === 'ADJUSTMENT') {
      newQty = parseFloat(quantity) || 0;
    } else {
      throw new Error('Invalid transaction type. Must be IN, OUT, or ADJUSTMENT.');
    }

    const txDate = formatDate(date);
    const refNote = (reference_note || '').trim();
    const cleanWorkerId = upperType === 'OUT' && worker_id ? Number(worker_id) : null;
    const cleanWorkerName = upperType === 'OUT' && worker_name ? String(worker_name).trim() : null;
    const cleanOrderId = upperType === 'OUT' && order_id ? Number(order_id) : null;
    const cleanOrderNo = upperType === 'OUT' && order_no ? String(order_no).trim() : null;
    const cleanTruckNo = upperType === 'OUT' && truck_chassis_no ? String(truck_chassis_no).trim() : null;

    try {
      // 1. Update stock item quantity
      await db.query('UPDATE stock_items SET quantity = ? WHERE id = ?', [newQty, numId]);

      // 2. Insert transaction log
      const txSql = `
        INSERT INTO stock_transactions (
          item_id, type, quantity, previous_quantity, new_quantity, date, reference_note,
          worker_id, worker_name, order_id, order_no, truck_chassis_no
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await db.query(txSql, [
        numId,
        upperType,
        adjQty,
        prevQty,
        newQty,
        txDate,
        refNote,
        cleanWorkerId,
        cleanWorkerName,
        cleanOrderId,
        cleanOrderNo,
        cleanTruckNo,
      ]);

      return await this.getItemById(numId);
    } catch (err) {
      console.warn('⚠️ [StockService Adjust DB Warning - Using Memory Store]:', err.message);
      const idx = memoryItems.findIndex((i) => i.id === numId);
      if (idx !== -1) {
        memoryItems[idx].quantity = newQty;
        memoryItems[idx].updated_at = new Date().toISOString();
      }

      memoryTransactions.push({
        id: nextTxId++,
        item_id: numId,
        type: upperType,
        quantity: adjQty,
        previous_quantity: prevQty,
        new_quantity: newQty,
        date: txDate,
        reference_note: refNote,
        worker_id: cleanWorkerId,
        worker_name: cleanWorkerName,
        order_id: cleanOrderId,
        order_no: cleanOrderNo,
        truck_chassis_no: cleanTruckNo,
        created_at: new Date().toISOString(),
      });

      return await this.getItemById(numId);
    }
  }

  async getItemTransactions(itemId) {
    const numId = Number(itemId);
    try {
      const sql = `
        SELECT t.*, i.name as item_name, i.unit
        FROM stock_transactions t
        LEFT JOIN stock_items i ON t.item_id = i.id
        WHERE t.item_id = ?
        ORDER BY t.date DESC, t.id DESC
      `;
      const [rows] = await db.query(sql, [numId]);
      return rows.map((r) => ({
        id: r.id,
        item_id: r.item_id,
        item_name: r.item_name,
        unit: r.unit || 'Pcs',
        type: r.type,
        quantity: Number(r.quantity),
        previous_quantity: Number(r.previous_quantity),
        new_quantity: Number(r.new_quantity),
        date: formatDate(r.date),
        reference_note: r.reference_note || '',
        worker_id: r.worker_id || null,
        worker_name: r.worker_name || '',
        order_id: r.order_id || null,
        order_no: r.order_no || '',
        truck_chassis_no: r.truck_chassis_no || '',
        created_at: r.created_at,
      }));
    } catch (err) {
      console.warn('⚠️ [StockService Tx DB Warning - Using Memory Store]:', err.message);
      return memoryTransactions
        .filter((t) => t.item_id === numId)
        .map((t) => {
          const item = memoryItems.find((i) => i.id === t.item_id);
          return {
            ...t,
            item_name: item ? item.name : '',
            unit: item ? item.unit : 'Pcs',
            quantity: Number(t.quantity),
            previous_quantity: Number(t.previous_quantity),
            new_quantity: Number(t.new_quantity),
            date: formatDate(t.date),
            worker_id: t.worker_id || null,
            worker_name: t.worker_name || '',
            order_id: t.order_id || null,
            order_no: t.order_no || '',
            truck_chassis_no: t.truck_chassis_no || '',
          };
        })
        .sort((a, b) => b.id - a.id);
    }
  }

  async getAllTransactions({ limit = 50 } = {}) {
    const numLimit = Math.min(Number(limit) || 50, 200);
    try {
      const sql = `
        SELECT t.*, i.name as item_name, i.category_name, i.unit
        FROM stock_transactions t
        LEFT JOIN stock_items i ON t.item_id = i.id
        ORDER BY t.date DESC, t.id DESC
        LIMIT ?
      `;
      const [rows] = await db.query(sql, [numLimit]);
      return rows.map((r) => ({
        id: r.id,
        item_id: r.item_id,
        item_name: r.item_name,
        category_name: r.category_name,
        unit: r.unit || 'Pcs',
        type: r.type,
        quantity: Number(r.quantity),
        previous_quantity: Number(r.previous_quantity),
        new_quantity: Number(r.new_quantity),
        date: formatDate(r.date),
        reference_note: r.reference_note || '',
        worker_id: r.worker_id || null,
        worker_name: r.worker_name || '',
        order_id: r.order_id || null,
        order_no: r.order_no || '',
        truck_chassis_no: r.truck_chassis_no || '',
        created_at: r.created_at,
      }));
    } catch (err) {
      console.warn('⚠️ [StockService All Tx DB Warning - Using Memory Store]:', err.message);
      return memoryTransactions
        .slice(-numLimit)
        .map((t) => {
          const item = memoryItems.find((i) => i.id === t.item_id);
          return {
            ...t,
            item_name: item ? item.name : '',
            category_name: item ? item.category_name : '',
            unit: item ? item.unit : 'Pcs',
            quantity: Number(t.quantity),
            previous_quantity: Number(t.previous_quantity),
            new_quantity: Number(t.new_quantity),
            date: formatDate(t.date),
            worker_id: t.worker_id || null,
            worker_name: t.worker_name || '',
            order_id: t.order_id || null,
            order_no: t.order_no || '',
            truck_chassis_no: t.truck_chassis_no || '',
          };
        })
        .sort((a, b) => b.id - a.id);
    }
  }

  async setWorkerMaterialRating(workerId, rating, note = '') {
    const numWorkerId = Number(workerId);
    const numRating = Math.min(5, Math.max(1, Math.round(Number(rating) || 0)));
    if (!numWorkerId) throw new Error('Valid worker_id is required');
    if (!numRating || numRating < 1 || numRating > 5) throw new Error('Rating must be between 1 and 5');

    const cleanNote = (note || '').trim() || null;

    try {
      await db.query(
        `INSERT INTO stock_worker_ratings (worker_id, rating, note)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE rating = VALUES(rating), note = VALUES(note)`,
        [numWorkerId, numRating, cleanNote]
      );
      return { worker_id: numWorkerId, rating: numRating, note: cleanNote || '' };
    } catch (err) {
      console.warn('⚠️ [StockService Rating DB Warning - Using Memory Store]:', err.message);
      const entry = {
        worker_id: numWorkerId,
        rating: numRating,
        note: cleanNote || '',
        updated_at: new Date().toISOString(),
      };
      memoryWorkerRatings.set(numWorkerId, entry);
      return entry;
    }
  }

  async getUsageAnalytics({ workerId = null, orderId = null } = {}) {
    let outRows = [];
    let ratingMap = new Map();

    try {
      const conditions = ["t.type = 'OUT'"];
      const params = [];
      if (workerId) {
        conditions.push('t.worker_id = ?');
        params.push(Number(workerId));
      }
      if (orderId) {
        conditions.push('t.order_id = ?');
        params.push(Number(orderId));
      }

      const sql = `
        SELECT t.*, i.name as item_name, i.category_name, i.unit, i.unit_price
        FROM stock_transactions t
        LEFT JOIN stock_items i ON t.item_id = i.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY t.date DESC, t.id DESC
        LIMIT 1000
      `;
      const [rows] = await db.query(sql, params);
      outRows = rows.map((r) => ({
        id: r.id,
        item_id: r.item_id,
        item_name: r.item_name || 'Unknown Item',
        category_name: r.category_name || '',
        unit: r.unit || 'Pcs',
        unit_price: r.unit_price !== null ? Number(r.unit_price) : 0,
        quantity: Number(r.quantity) || 0,
        date: formatDate(r.date),
        reference_note: r.reference_note || '',
        worker_id: r.worker_id || null,
        worker_name: r.worker_name || '',
        order_id: r.order_id || null,
        order_no: r.order_no || '',
        truck_chassis_no: r.truck_chassis_no || '',
      }));

      try {
        const [rRows] = await db.query('SELECT worker_id, rating, note FROM stock_worker_ratings');
        rRows.forEach((rr) => {
          ratingMap.set(Number(rr.worker_id), {
            rating: Number(rr.rating),
            note: rr.note || '',
          });
        });
      } catch {
        // Table may not exist on first boot before initDB; ignore gracefully
      }
    } catch (err) {
      console.warn('⚠️ [StockService Usage DB Warning - Using Memory Store]:', err.message);
      outRows = memoryTransactions
        .filter((t) => t.type === 'OUT')
        .filter((t) => (!workerId || Number(t.worker_id) === Number(workerId)))
        .filter((t) => (!orderId || Number(t.order_id) === Number(orderId)))
        .map((t) => {
          const item = memoryItems.find((i) => i.id === t.item_id);
          return {
            id: t.id,
            item_id: t.item_id,
            item_name: item ? item.name : 'Unknown Item',
            category_name: item ? item.category_name : '',
            unit: item ? item.unit : 'Pcs',
            unit_price: item && item.unit_price ? Number(item.unit_price) : 0,
            quantity: Number(t.quantity) || 0,
            date: formatDate(t.date),
            reference_note: t.reference_note || '',
            worker_id: t.worker_id || null,
            worker_name: t.worker_name || '',
            order_id: t.order_id || null,
            order_no: t.order_no || '',
            truck_chassis_no: t.truck_chassis_no || '',
          };
        })
        .sort((a, b) => b.id - a.id);

      ratingMap = new Map(memoryWorkerRatings);
    }

    // Group by Order
    const orderMap = new Map();
    // Group by Worker
    const workerMap = new Map();

    for (const tx of outRows) {
      const estValue = tx.quantity * (tx.unit_price || 0);

      if (tx.order_id || tx.order_no || tx.truck_chassis_no) {
        const oKey = tx.order_id ? `id:${tx.order_id}` : `no:${tx.order_no || tx.truck_chassis_no}`;
        if (!orderMap.has(oKey)) {
          orderMap.set(oKey, {
            order_id: tx.order_id,
            order_no: tx.order_no || '-',
            truck_chassis_no: tx.truck_chassis_no || '-',
            total_quantity: 0,
            total_value: 0,
            tx_count: 0,
            workers: new Set(),
            items: [],
          });
        }
        const og = orderMap.get(oKey);
        og.total_quantity += tx.quantity;
        og.total_value += estValue;
        og.tx_count += 1;
        if (tx.worker_name) og.workers.add(tx.worker_name);
        og.items.push(tx);
      }

      if (tx.worker_id || tx.worker_name) {
        const wKey = tx.worker_id ? `id:${tx.worker_id}` : `name:${tx.worker_name}`;
        if (!workerMap.has(wKey)) {
          workerMap.set(wKey, {
            worker_id: tx.worker_id,
            worker_name: tx.worker_name || 'Unknown Worker',
            total_quantity: 0,
            total_value: 0,
            tx_count: 0,
            order_keys: new Set(),
            items: [],
          });
        }
        const wg = workerMap.get(wKey);
        wg.total_quantity += tx.quantity;
        wg.total_value += estValue;
        wg.tx_count += 1;
        if (tx.order_id || tx.order_no || tx.truck_chassis_no) {
          wg.order_keys.add(tx.order_id ? `id:${tx.order_id}` : `${tx.order_no}:${tx.truck_chassis_no}`);
        }
        wg.items.push(tx);
      }
    }

    const byOrder = Array.from(orderMap.values()).map((o) => ({
      order_id: o.order_id,
      order_no: o.order_no,
      truck_chassis_no: o.truck_chassis_no,
      total_quantity: Number(o.total_quantity.toFixed(2)),
      total_value: Number(o.total_value.toFixed(2)),
      tx_count: o.tx_count,
      workers: Array.from(o.workers),
      items: o.items,
    }));

    const workerListRaw = Array.from(workerMap.values()).map((w) => {
      const ordersCount = w.order_keys.size;
      const avgPerOrder = ordersCount > 0 ? w.total_quantity / ordersCount : w.total_quantity;
      const savedRating = w.worker_id ? ratingMap.get(Number(w.worker_id)) : null;
      return {
        worker_id: w.worker_id,
        worker_name: w.worker_name,
        orders_count: ordersCount,
        tx_count: w.tx_count,
        total_quantity: Number(w.total_quantity.toFixed(2)),
        avg_qty_per_order: Number(avgPerOrder.toFixed(2)),
        total_value: Number(w.total_value.toFixed(2)),
        manual_rating: savedRating ? savedRating.rating : null,
        rating_note: savedRating ? savedRating.note : '',
        items: w.items,
      };
    });

    // Calculate auto efficiency rating (lowest avg_qty_per_order = highest 5.0 rating)
    const minAvg = workerListRaw.length > 0 ? Math.min(...workerListRaw.map((w) => w.avg_qty_per_order)) : 0;
    const maxAvg = workerListRaw.length > 0 ? Math.max(...workerListRaw.map((w) => w.avg_qty_per_order)) : 0;

    const byWorker = workerListRaw
      .map((w) => {
        let autoScore = 5.0;
        if (maxAvg > minAvg) {
          const ratio = (w.avg_qty_per_order - minAvg) / (maxAvg - minAvg); // 0 = best (lowest usage), 1 = highest usage
          autoScore = Number((5 - ratio * 2.5).toFixed(1)); // 2.5 to 5.0 scale
        }
        return {
          ...w,
          efficiency_score: autoScore,
          is_top_saver: workerListRaw.length > 0 && w.avg_qty_per_order === minAvg,
        };
      })
      .sort((a, b) => a.avg_qty_per_order - b.avg_qty_per_order);

    return {
      transactions: outRows,
      byOrder,
      byWorker,
    };
  }

  async getIssueOptions() {
    let workers = [];
    let orders = [];

    try {
      const [wRows] = await db.query('SELECT id, name FROM workers ORDER BY name ASC');
      workers = wRows.map((w) => ({ id: w.id, name: w.name || '' }));
    } catch {
      try {
        const list = await workerService.getAllWorkers();
        workers = (list || []).map((w) => ({ id: w.id, name: w.name || '' }));
      } catch {
        workers = [];
      }
    }

    try {
      const [oRows] = await db.query(
        'SELECT id, order_no, truck_chassis_no, owner_name, shade_no, status FROM orders ORDER BY id DESC'
      );
      orders = oRows.map((o) => ({
        id: o.id,
        order_no: o.order_no || '',
        truck_chassis_no: o.truck_chassis_no || '',
        owner_name: o.owner_name || '',
        shade_no: o.shade_no || '',
        status: o.status || '',
      }));
    } catch {
      try {
        const list = await orderService.getAllOrders();
        orders = (list || []).map((o) => ({
          id: o.id,
          order_no: o.order_no || '',
          truck_chassis_no: o.truck_chassis_no || '',
          owner_name: o.owner_name || '',
          shade_no: o.shade_no || '',
          status: o.status || '',
        }));
      } catch {
        orders = [];
      }
    }

    return { workers, orders };
  }

  async getStockSummary() {
    const items = await this.getAllItems();
    const categories = await this.getAllCategories();

    const totalItems = items.length;
    const totalCategories = categories.length;
    const lowStockCount = items.filter((i) => i.is_low_stock).length;
    const totalUnits = items.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);

    return {
      totalItems,
      totalCategories,
      lowStockCount,
      totalUnits,
    };
  }
}

export const stockService = new StockService();
export default stockService;
