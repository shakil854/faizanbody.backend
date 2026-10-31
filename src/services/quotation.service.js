import db from '../config/db.js';

// Safe in-memory fallback stores (Empty by default - Zero Dummy Data Rule)
const memoryQuotations = [];
const memoryCatalogItems = [];

const parseJson = (val, fallback = []) => {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
};

const formatDate = (val) => {
  if (!val) return '';
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch {}
  return String(val).slice(0, 10);
};

const formatQuotationRow = (row) => {
  if (!row) return null;
  const items = parseJson(row.items, []);
  return {
    id: row.id,
    quotation_no: row.quotation_no,
    quotation_date: formatDate(row.quotation_date),
    customer_name: row.customer_name,
    mobile_number: row.mobile_number || '',
    truck_chassis_no: row.truck_chassis_no || '',
    items: Array.isArray(items) ? items : [],
    subtotal: Number(row.subtotal) || 0,
    extra_percent: Number(row.extra_percent) || 0,
    extra_amount: Number(row.extra_amount) || 0,
    discount_percent: Number(row.discount_percent) || 0,
    discount_amount: Number(row.discount_amount) || 0,
    final_price: Number(row.final_price) || 0,
    notes: row.notes || '',
    status: row.status || 'Draft',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const formatCatalogItemRow = (row) => {
  if (!row) return null;
  const variants = parseJson(row.variants, []);
  return {
    id: row.id,
    name: row.name,
    rate: Number(row.rate) || 0,
    unit: row.unit || 'Unit',
    variants: Array.isArray(variants) ? variants : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

class QuotationService {
  // =========================================================================
  // 1. Quotations List & CRUD
  // =========================================================================

  async getAllQuotations({ search = '', status = 'all' } = {}) {
    try {
      let sql = 'SELECT * FROM quotations';
      const conditions = [];
      const params = [];

      if (search && search.trim()) {
        const q = `%${search.trim()}%`;
        conditions.push(
          '(quotation_no LIKE ? OR customer_name LIKE ? OR mobile_number LIKE ? OR truck_chassis_no LIKE ?)'
        );
        params.push(q, q, q, q);
      }

      if (status && status !== 'all') {
        conditions.push('status = ?');
        params.push(status);
      }

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }

      sql += ' ORDER BY quotation_date DESC, id DESC';

      const [rows] = await db.query(sql, params);
      return rows.map(formatQuotationRow);
    } catch (error) {
      console.warn('⚠️ [QuotationService DB Warning - Using Memory Store]:', error.message);
      let list = [...memoryQuotations];

      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        list = list.filter(
          (o) =>
            o.quotation_no?.toLowerCase().includes(q) ||
            o.customer_name?.toLowerCase().includes(q) ||
            o.mobile_number?.includes(q) ||
            o.truck_chassis_no?.toLowerCase().includes(q)
        );
      }

      if (status && status !== 'all') {
        list = list.filter((o) => o.status === status);
      }

      list.sort((a, b) => b.id - a.id);
      return list.map(formatQuotationRow);
    }
  }

  async getQuotationById(id) {
    const numId = Number(id);
    try {
      const [rows] = await db.query('SELECT * FROM quotations WHERE id = ? LIMIT 1', [numId]);
      if (rows && rows.length > 0) {
        return formatQuotationRow(rows[0]);
      }
    } catch (error) {
      console.warn('⚠️ [QuotationService DB Warning - Using Memory Store]:', error.message);
      const found = memoryQuotations.find((o) => o.id === numId);
      if (found) return formatQuotationRow(found);
    }
    return null;
  }

  async generateNextQuotationNo() {
    const year = new Date().getFullYear();
    const prefix = `QT-${year}-`;
    try {
      const [rows] = await db.query(
        'SELECT quotation_no FROM quotations WHERE quotation_no LIKE ? ORDER BY id DESC LIMIT 1',
        [`${prefix}%`]
      );
      if (rows && rows.length > 0) {
        const lastNo = rows[0].quotation_no;
        const match = lastNo.match(/(\d+)$/);
        if (match) {
          const nextNum = Number(match[1]) + 1;
          return `${prefix}${String(nextNum).padStart(3, '0')}`;
        }
      }
    } catch {}
    return `${prefix}001`;
  }

  async createQuotation(data) {
    const quotationNo = data.quotation_no || (await this.generateNextQuotationNo());
    const formattedDate = formatDate(data.quotation_date || new Date());
    const customerName = (data.customer_name || '').trim();
    const mobileNumber = (data.mobile_number || '').trim();
    const truckChassisNo = (data.truck_chassis_no || '').trim();
    const notes = (data.notes || '').trim();
    const status = data.status || 'Draft';

    // Compute Item Amounts & Totals
    const items = Array.isArray(data.items) ? data.items : [];
    let subtotal = 0;
    const computedItems = items.map((it, idx) => {
      const rate = Number(it.rate) || 0;
      const qty = Number(it.qty) || 0;
      const amount = Math.round(rate * qty * 100) / 100;
      subtotal += amount;
      return {
        id: it.id || `item_${idx + 1}`,
        name: (it.name || '').trim(),
        variant_name: (it.variant_name || '').trim(),
        rate,
        qty,
        amount,
        variants: Array.isArray(it.variants) ? it.variants : [],
      };
    });

    subtotal = Math.round(subtotal * 100) / 100;
    const extraPercent = Math.max(0, Number(data.extra_percent) || 0);
    const extraAmount = Math.round((subtotal * extraPercent) / 100 * 100) / 100;

    const baseForDiscount = subtotal + extraAmount;
    const discountPercent = Math.max(0, Number(data.discount_percent) || 0);
    const discountAmount = Math.round((baseForDiscount * discountPercent) / 100 * 100) / 100;

    const finalPrice = Math.max(0, Math.round((baseForDiscount - discountAmount) * 100) / 100);

    const itemsJson = JSON.stringify(computedItems);

    try {
      const sql = `
        INSERT INTO quotations (
          quotation_no, quotation_date, customer_name, mobile_number,
          truck_chassis_no, items, subtotal, extra_percent, extra_amount,
          discount_percent, discount_amount, final_price, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [
        quotationNo,
        formattedDate,
        customerName,
        mobileNumber,
        truckChassisNo,
        itemsJson,
        subtotal,
        extraPercent,
        extraAmount,
        discountPercent,
        discountAmount,
        finalPrice,
        notes,
        status,
      ];

      const [result] = await db.query(sql, params);
      return this.getQuotationById(result.insertId);
    } catch (error) {
      console.warn('⚠️ [QuotationService DB Error - Saving to Memory]:', error.message);
      const newId = memoryQuotations.length > 0 ? Math.max(...memoryQuotations.map((q) => q.id)) + 1 : 1;
      const newQuotation = {
        id: newId,
        quotation_no: quotationNo,
        quotation_date: formattedDate,
        customer_name: customerName,
        mobile_number: mobileNumber,
        truck_chassis_no: truckChassisNo,
        items: computedItems,
        subtotal,
        extra_percent: extraPercent,
        extra_amount: extraAmount,
        discount_percent: discountPercent,
        discount_amount: discountAmount,
        final_price: finalPrice,
        notes,
        status,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      memoryQuotations.unshift(newQuotation);
      return formatQuotationRow(newQuotation);
    }
  }

  async updateQuotation(id, data) {
    const numId = Number(id);
    const existing = await this.getQuotationById(numId);
    if (!existing) {
      throw new Error(`Quotation #${id} not found`);
    }

    const quotationNo = data.quotation_no ?? existing.quotation_no;
    const formattedDate = formatDate(data.quotation_date ?? existing.quotation_date);
    const customerName = (data.customer_name ?? existing.customer_name).trim();
    const mobileNumber = (data.mobile_number ?? existing.mobile_number).trim();
    const truckChassisNo = (data.truck_chassis_no ?? existing.truck_chassis_no).trim();
    const notes = (data.notes ?? existing.notes).trim();
    const status = data.status ?? existing.status;

    // Recalculate Items & Totals
    const items = Array.isArray(data.items) ? data.items : existing.items;
    let subtotal = 0;
    const computedItems = items.map((it, idx) => {
      const rate = Number(it.rate) || 0;
      const qty = Number(it.qty) || 0;
      const amount = Math.round(rate * qty * 100) / 100;
      subtotal += amount;
      return {
        id: it.id || `item_${idx + 1}`,
        name: (it.name || '').trim(),
        variant_name: (it.variant_name || '').trim(),
        rate,
        qty,
        amount,
        variants: Array.isArray(it.variants) ? it.variants : [],
      };
    });

    subtotal = Math.round(subtotal * 100) / 100;
    const extraPercent = Math.max(0, Number(data.extra_percent ?? existing.extra_percent) || 0);
    const extraAmount = Math.round((subtotal * extraPercent) / 100 * 100) / 100;

    const baseForDiscount = subtotal + extraAmount;
    const discountPercent = Math.max(0, Number(data.discount_percent ?? existing.discount_percent) || 0);
    const discountAmount = Math.round((baseForDiscount * discountPercent) / 100 * 100) / 100;

    const finalPrice = Math.max(0, Math.round((baseForDiscount - discountAmount) * 100) / 100);

    const itemsJson = JSON.stringify(computedItems);

    try {
      const sql = `
        UPDATE quotations SET
          quotation_no = ?,
          quotation_date = ?,
          customer_name = ?,
          mobile_number = ?,
          truck_chassis_no = ?,
          items = ?,
          subtotal = ?,
          extra_percent = ?,
          extra_amount = ?,
          discount_percent = ?,
          discount_amount = ?,
          final_price = ?,
          notes = ?,
          status = ?
        WHERE id = ?
      `;
      const params = [
        quotationNo,
        formattedDate,
        customerName,
        mobileNumber,
        truckChassisNo,
        itemsJson,
        subtotal,
        extraPercent,
        extraAmount,
        discountPercent,
        discountAmount,
        finalPrice,
        notes,
        status,
        numId,
      ];

      await db.query(sql, params);
      return this.getQuotationById(numId);
    } catch (error) {
      console.warn('⚠️ [QuotationService DB Error - Updating Memory]:', error.message);
      const idx = memoryQuotations.findIndex((q) => q.id === numId);
      if (idx !== -1) {
        memoryQuotations[idx] = {
          ...memoryQuotations[idx],
          quotation_no: quotationNo,
          quotation_date: formattedDate,
          customer_name: customerName,
          mobile_number: mobileNumber,
          truck_chassis_no: truckChassisNo,
          items: computedItems,
          subtotal,
          extra_percent: extraPercent,
          extra_amount: extraAmount,
          discount_percent: discountPercent,
          discount_amount: discountAmount,
          final_price: finalPrice,
          notes,
          status,
          updated_at: new Date().toISOString(),
        };
        return formatQuotationRow(memoryQuotations[idx]);
      }
      throw error;
    }
  }

  async deleteQuotation(id) {
    const numId = Number(id);
    try {
      await db.query('DELETE FROM quotations WHERE id = ?', [numId]);
      return true;
    } catch (error) {
      console.warn('⚠️ [QuotationService DB Error - Deleting from Memory]:', error.message);
      const idx = memoryQuotations.findIndex((q) => q.id === numId);
      if (idx !== -1) {
        memoryQuotations.splice(idx, 1);
        return true;
      }
      throw error;
    }
  }

  // =========================================================================
  // 2. Saved Items & Rates Master Catalog (वस्तु और रेट सेविंग)
  // =========================================================================

  async getCatalogItems() {
    try {
      const [rows] = await db.query('SELECT * FROM quotation_items_catalog ORDER BY name ASC');
      return rows.map(formatCatalogItemRow);
    } catch (error) {
      console.warn('⚠️ [QuotationService Catalog DB Error - Using Memory]:', error.message);
      return [...memoryCatalogItems].sort((a, b) => a.name.localeCompare(b.name)).map(formatCatalogItemRow);
    }
  }

  async saveCatalogItem(data) {
    const name = (data.name || '').trim();
    if (!name) throw new Error('Item name is required');
    const rate = Number(data.rate) || 0;
    const unit = (data.unit || 'Unit').trim();
    const variants = Array.isArray(data.variants)
      ? data.variants.map((v) => ({
          name: (v.name || '').trim(),
          rate: Number(v.rate) || 0,
        }))
      : [];
    const variantsJson = JSON.stringify(variants);

    const numId = data.id ? Number(data.id) : null;

    try {
      if (numId) {
        // Update existing item
        const sql = `
          UPDATE quotation_items_catalog SET
            name = ?, rate = ?, unit = ?, variants = ?
          WHERE id = ?
        `;
        await db.query(sql, [name, rate, unit, variantsJson, numId]);
        const [rows] = await db.query('SELECT * FROM quotation_items_catalog WHERE id = ? LIMIT 1', [numId]);
        return formatCatalogItemRow(rows[0]);
      } else {
        // Insert new item or update if same name exists
        const [existing] = await db.query('SELECT id FROM quotation_items_catalog WHERE LOWER(name) = LOWER(?) LIMIT 1', [name]);
        if (existing && existing.length > 0) {
          const existId = existing[0].id;
          const sql = `
            UPDATE quotation_items_catalog SET
              rate = ?, unit = ?, variants = ?
            WHERE id = ?
          `;
          await db.query(sql, [rate, unit, variantsJson, existId]);
          const [rows] = await db.query('SELECT * FROM quotation_items_catalog WHERE id = ? LIMIT 1', [existId]);
          return formatCatalogItemRow(rows[0]);
        } else {
          const sql = `
            INSERT INTO quotation_items_catalog (name, rate, unit, variants)
            VALUES (?, ?, ?, ?)
          `;
          const [result] = await db.query(sql, [name, rate, unit, variantsJson]);
          const [rows] = await db.query('SELECT * FROM quotation_items_catalog WHERE id = ? LIMIT 1', [result.insertId]);
          return formatCatalogItemRow(rows[0]);
        }
      }
    } catch (error) {
      console.warn('⚠️ [QuotationService Catalog DB Error - Saving Memory]:', error.message);
      if (numId) {
        const idx = memoryCatalogItems.findIndex((it) => it.id === numId);
        if (idx !== -1) {
          memoryCatalogItems[idx] = {
            ...memoryCatalogItems[idx],
            name,
            rate,
            unit,
            variants,
            updated_at: new Date().toISOString(),
          };
          return formatCatalogItemRow(memoryCatalogItems[idx]);
        }
      }
      const newId = memoryCatalogItems.length > 0 ? Math.max(...memoryCatalogItems.map((i) => i.id)) + 1 : 1;
      const newItem = {
        id: newId,
        name,
        rate,
        unit,
        variants,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      memoryCatalogItems.push(newItem);
      return formatCatalogItemRow(newItem);
    }
  }

  async deleteCatalogItem(id) {
    const numId = Number(id);
    try {
      await db.query('DELETE FROM quotation_items_catalog WHERE id = ?', [numId]);
      return true;
    } catch (error) {
      console.warn('⚠️ [QuotationService Catalog DB Error - Deleting from Memory]:', error.message);
      const idx = memoryCatalogItems.findIndex((it) => it.id === numId);
      if (idx !== -1) {
        memoryCatalogItems.splice(idx, 1);
        return true;
      }
      throw error;
    }
  }
}

export const quotationService = new QuotationService();
export default quotationService;

