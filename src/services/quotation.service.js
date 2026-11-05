import db from '../config/db.js';
import { settingService } from './setting.service.js';

// Safe in-memory fallback stores (Empty by default - Zero Dummy Data Rule)
const memoryQuotations = [];
const memoryCatalogItems = [];
let memoryBodyDefaults = null;

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
  } catch { }
  return String(val).slice(0, 10);
};

const formatQuotationRow = (row) => {
  if (!row) return null;
  const items = parseJson(row.items, []);
  const bodyCalc = parseJson(row.body_calc, null);
  return {
    id: row.id,
    quotation_no: row.quotation_no,
    quotation_date: formatDate(row.quotation_date),
    customer_name: row.customer_name,
    mobile_number: row.mobile_number || '',
    truck_chassis_no: row.truck_chassis_no || '',
    items: Array.isArray(items) ? items : [],
    body_calc: bodyCalc,
    total_weight: Number(row.total_weight) || 0,
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
    sort_order: Number(row.sort_order) || 0,
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
    } catch { }
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
    let itemsSubtotal = 0;
    const computedItems = items.map((it, idx) => {
      const qty = Number(it.qty) || 0;
      const rate = Number(it.rate) || 0;
      const amount = Math.round(qty * rate * 100) / 100;
      itemsSubtotal += amount;
      return {
        id: it.id || `item_${idx + 1}`,
        name: (it.name || '').trim(),
        variant_name: (it.variant_name || '').trim(),
        qty,
        rate,
        amount,
        variants: Array.isArray(it.variants) ? it.variants : [],
      };
    });

    itemsSubtotal = Math.round(itemsSubtotal * 100) / 100;
    let bodyCalc = data.body_calc || null;
    if (typeof bodyCalc === 'string') {
      try {
        bodyCalc = JSON.parse(bodyCalc);
      } catch {
        bodyCalc = null;
      }
    }
    const bodyCalcJson = bodyCalc ? JSON.stringify(bodyCalc) : null;
    const bodyAmount = bodyCalc && typeof bodyCalc.total_amount === 'number' ? Number(bodyCalc.total_amount) : 0;
    const totalWeight = Number(data.total_weight ?? bodyCalc?.total_weight) || 0;

    const subtotal = data.subtotal !== undefined
      ? Number(data.subtotal)
      : Math.round((itemsSubtotal + bodyAmount) * 100) / 100;

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
          truck_chassis_no, items, body_calc, total_weight, subtotal, extra_percent, extra_amount,
          discount_percent, discount_amount, final_price, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [
        quotationNo,
        formattedDate,
        customerName,
        mobileNumber,
        truckChassisNo,
        itemsJson,
        bodyCalcJson,
        totalWeight,
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
      if (bodyCalc && typeof bodyCalc === 'object') {
        this.persistBodyDefaultsFromCalc(bodyCalc).catch(() => {});
      }
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
        body_calc: bodyCalc,
        total_weight: totalWeight,
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
      if (bodyCalc && typeof bodyCalc === 'object') {
        this.persistBodyDefaultsFromCalc(bodyCalc).catch(() => {});
      }
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
    let itemsSubtotal = 0;
    const computedItems = items.map((it, idx) => {
      const qty = Number(it.qty) || 0;
      const rate = Number(it.rate) || 0;
      const amount = Math.round(qty * rate * 100) / 100;
      itemsSubtotal += amount;
      return {
        id: it.id || `item_${idx + 1}`,
        name: (it.name || '').trim(),
        variant_name: (it.variant_name || '').trim(),
        qty,
        rate,
        amount,
        variants: Array.isArray(it.variants) ? it.variants : [],
      };
    });

    itemsSubtotal = Math.round(itemsSubtotal * 100) / 100;
    let bodyCalc = data.body_calc !== undefined ? data.body_calc : existing.body_calc;
    if (typeof bodyCalc === 'string') {
      try {
        bodyCalc = JSON.parse(bodyCalc);
      } catch {
        bodyCalc = existing.body_calc;
      }
    }
    const bodyCalcJson = bodyCalc ? JSON.stringify(bodyCalc) : null;
    const bodyAmount = bodyCalc && typeof bodyCalc.total_amount === 'number' ? Number(bodyCalc.total_amount) : 0;
    const totalWeight = Number(data.total_weight ?? existing.total_weight ?? bodyCalc?.total_weight) || 0;

    const subtotal = data.subtotal !== undefined
      ? Number(data.subtotal)
      : Math.round((itemsSubtotal + bodyAmount) * 100) / 100;

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
          body_calc = ?,
          total_weight = ?,
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
        bodyCalcJson,
        totalWeight,
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
      if (bodyCalc && typeof bodyCalc === 'object') {
        this.persistBodyDefaultsFromCalc(bodyCalc).catch(() => {});
      }
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
          body_calc: bodyCalc,
          total_weight: totalWeight,
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
        if (bodyCalc && typeof bodyCalc === 'object') {
          this.persistBodyDefaultsFromCalc(bodyCalc).catch(() => {});
        }
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
  // 1.1 Body Calculation Defaults (બોડી માપ, વજન અને ભાવ કાયમી ડેટાબેઝ સેવિંગ)
  // Stores and retrieves default weight and bhav for all 6 body items:
  // 1. Taliyu (Floor)
  // 2. Side
  // 3. Dhoka
  // 4. Thambhla
  // 5. Purchuran
  // 6. Machado
  // =========================================================================

  async getBodyDefaults() {
    try {
      const saved = await settingService.getSetting('quotation_body_defaults', null);
      if (saved && typeof saved === 'object') {
        return saved;
      }
    } catch (err) {
      console.warn('⚠️ [QuotationService] Failed to get body defaults from DB:', err.message);
    }
    return memoryBodyDefaults;
  }

  async saveBodyDefaults(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid body defaults data');
    }

    const cleaned = {
      taliyu: {
        selected_option_index: Number(data.taliyu?.selected_option_index) || 0,
        options: Array.isArray(data.taliyu?.options)
          ? data.taliyu.options.map((opt, i) => ({
              id: opt.id || String(i + 1),
              name: (opt.name || '').trim(),
              weight_per_sqft: opt.weight_per_sqft !== undefined && opt.weight_per_sqft !== null ? String(opt.weight_per_sqft) : '',
              rate: opt.rate !== undefined && opt.rate !== null ? String(opt.rate) : '',
            }))
          : [],
      },
      side: {
        selected_option_index: Number(data.side?.selected_option_index) || 0,
        options: Array.isArray(data.side?.options)
          ? data.side.options.map((opt, i) => ({
              id: opt.id || String(i + 1),
              name: (opt.name || '').trim(),
              weight_per_sqft: opt.weight_per_sqft !== undefined && opt.weight_per_sqft !== null ? String(opt.weight_per_sqft) : '',
              rate: opt.rate !== undefined && opt.rate !== null ? String(opt.rate) : '',
            }))
          : [],
      },
      dhoka: {
        weight_per_piece: data.dhoka?.weight_per_piece !== undefined && data.dhoka?.weight_per_piece !== null ? String(data.dhoka.weight_per_piece) : '',
        rate: data.dhoka?.rate !== undefined && data.dhoka?.rate !== null ? String(data.dhoka.rate) : '',
      },
      thambhla: {
        weight_per_foot: data.thambhla?.weight_per_foot !== undefined && data.thambhla?.weight_per_foot !== null ? String(data.thambhla.weight_per_foot) : '',
        rate: data.thambhla?.rate !== undefined && data.thambhla?.rate !== null ? String(data.thambhla.rate) : '',
      },
      purchuran: {
        rate: data.purchuran?.rate !== undefined && data.purchuran?.rate !== null ? String(data.purchuran.rate) : '',
      },
      machado: {
        enabled: Boolean(data.machado?.enabled ?? false),
        amount: data.machado?.amount !== undefined && data.machado?.amount !== null ? String(data.machado.amount) : '',
      },
    };

    try {
      await settingService.setSetting(
        'quotation_body_defaults',
        cleaned,
        'Persistent Default Body Calculation Rates & Weights for Quotations'
      );
    } catch (err) {
      console.warn('⚠️ [QuotationService] Failed to persist body defaults to DB, using memory:', err.message);
    }
    memoryBodyDefaults = cleaned;
    return cleaned;
  }

  async persistBodyDefaultsFromCalc(bodyCalc) {
    if (!bodyCalc || typeof bodyCalc !== 'object') return;
    try {
      const existing = (await this.getBodyDefaults()) || {};

      const tOpts = Array.isArray(bodyCalc.taliyu?.options) && bodyCalc.taliyu.options.length > 0
        ? bodyCalc.taliyu.options
        : existing.taliyu?.options || [];

      const sOpts = Array.isArray(bodyCalc.side?.options) && bodyCalc.side.options.length > 0
        ? bodyCalc.side.options
        : existing.side?.options || [];

      const bodyDefaults = {
        taliyu: {
          selected_option_index: bodyCalc.taliyu?.selected_option_index ?? existing.taliyu?.selected_option_index ?? 0,
          options: tOpts,
        },
        side: {
          selected_option_index: bodyCalc.side?.selected_option_index ?? existing.side?.selected_option_index ?? 0,
          options: sOpts,
        },
        dhoka: {
          weight_per_piece: (bodyCalc.dhoka?.weight_per_piece !== undefined && bodyCalc.dhoka?.weight_per_piece !== '')
            ? String(bodyCalc.dhoka.weight_per_piece)
            : (existing.dhoka?.weight_per_piece ?? ''),
          rate: (bodyCalc.dhoka?.rate !== undefined && bodyCalc.dhoka?.rate !== '')
            ? String(bodyCalc.dhoka.rate)
            : (existing.dhoka?.rate ?? ''),
        },
        thambhla: {
          weight_per_foot: (bodyCalc.thambhla?.weight_per_foot !== undefined && bodyCalc.thambhla?.weight_per_foot !== '')
            ? String(bodyCalc.thambhla.weight_per_foot)
            : (existing.thambhla?.weight_per_foot ?? ''),
          rate: (bodyCalc.thambhla?.rate !== undefined && bodyCalc.thambhla?.rate !== '')
            ? String(bodyCalc.thambhla.rate)
            : (existing.thambhla?.rate ?? ''),
        },
        purchuran: {
          rate: (bodyCalc.purchuran?.rate !== undefined && bodyCalc.purchuran?.rate !== '')
            ? String(bodyCalc.purchuran.rate)
            : (existing.purchuran?.rate ?? ''),
        },
        machado: {
          enabled: Boolean(bodyCalc.machado?.enabled ?? existing.machado?.enabled ?? false),
          amount: (bodyCalc.machado?.amount !== undefined && String(bodyCalc.machado.amount).trim() !== '')
            ? String(bodyCalc.machado.amount)
            : (existing.machado?.amount || '12000'),
        },
      };

      await this.saveBodyDefaults(bodyDefaults);
    } catch (err) {
      console.warn('⚠️ [QuotationService] Failed to auto-persist body defaults from calculation:', err.message);
    }
  }

  // =========================================================================
  // 2. Saved Items & Rates Master Catalog (वस्तु और रेट सेविंग)
  // =========================================================================

  async getCatalogItems() {
    try {
      const [rows] = await db.query('SELECT * FROM quotation_items_catalog ORDER BY sort_order ASC, id ASC');
      return rows.map(formatCatalogItemRow);
    } catch (error) {
      console.warn('⚠️ [QuotationService Catalog DB Error - Using Memory]:', error.message);
      return [...memoryCatalogItems]
        .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || (a.id || 0) - (b.id || 0))
        .map(formatCatalogItemRow);
    }
  }

  async saveCatalogItem(data) {
    const name = (data.name || '').trim();
    if (!name) throw new Error('Item name is required');
    const rate = Number(data.rate) || 0;
    const unit = (data.unit || 'Unit').trim();
    const sort_order = (data.sort_order !== undefined && data.sort_order !== null && !isNaN(data.sort_order))
      ? Number(data.sort_order)
      : null;
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
        let sql;
        let params;
        if (sort_order !== null) {
          sql = `
            UPDATE quotation_items_catalog SET
              name = ?, rate = ?, unit = ?, variants = ?, sort_order = ?
            WHERE id = ?
          `;
          params = [name, rate, unit, variantsJson, sort_order, numId];
        } else {
          sql = `
            UPDATE quotation_items_catalog SET
              name = ?, rate = ?, unit = ?, variants = ?
            WHERE id = ?
          `;
          params = [name, rate, unit, variantsJson, numId];
        }
        await db.query(sql, params);
        const [rows] = await db.query('SELECT * FROM quotation_items_catalog WHERE id = ? LIMIT 1', [numId]);
        return formatCatalogItemRow(rows[0]);
      } else {
        // Insert new item or update if same name exists
        const [existing] = await db.query('SELECT id FROM quotation_items_catalog WHERE LOWER(name) = LOWER(?) LIMIT 1', [name]);
        if (existing && existing.length > 0) {
          const existId = existing[0].id;
          let sql;
          let params;
          if (sort_order !== null) {
            sql = `
              UPDATE quotation_items_catalog SET
                rate = ?, unit = ?, variants = ?, sort_order = ?
              WHERE id = ?
            `;
            params = [rate, unit, variantsJson, sort_order, existId];
          } else {
            sql = `
              UPDATE quotation_items_catalog SET
                rate = ?, unit = ?, variants = ?
              WHERE id = ?
            `;
            params = [rate, unit, variantsJson, existId];
          }
          await db.query(sql, params);
          const [rows] = await db.query('SELECT * FROM quotation_items_catalog WHERE id = ? LIMIT 1', [existId]);
          return formatCatalogItemRow(rows[0]);
        } else {
          // If sort_order not provided, put at bottom (max + 1)
          let finalSortOrder = sort_order;
          if (finalSortOrder === null || finalSortOrder === undefined) {
            const [maxRows] = await db.query('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM quotation_items_catalog');
            finalSortOrder = (maxRows[0]?.max_order || 0) + 1;
          }

          const sql = `
            INSERT INTO quotation_items_catalog (name, rate, unit, variants, sort_order)
            VALUES (?, ?, ?, ?, ?)
          `;
          const [result] = await db.query(sql, [name, rate, unit, variantsJson, finalSortOrder]);
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
            sort_order: sort_order !== null ? sort_order : memoryCatalogItems[idx].sort_order,
            updated_at: new Date().toISOString(),
          };
          return formatCatalogItemRow(memoryCatalogItems[idx]);
        }
      }
      const existingIdx = memoryCatalogItems.findIndex((it) => it.name.toLowerCase() === name.toLowerCase());
      if (existingIdx !== -1) {
        memoryCatalogItems[existingIdx] = {
          ...memoryCatalogItems[existingIdx],
          rate,
          unit,
          variants,
          sort_order: sort_order !== null ? sort_order : memoryCatalogItems[existingIdx].sort_order,
          updated_at: new Date().toISOString(),
        };
        return formatCatalogItemRow(memoryCatalogItems[existingIdx]);
      }
      const newId = memoryCatalogItems.length > 0 ? Math.max(...memoryCatalogItems.map((i) => i.id)) + 1 : 1;
      const maxOrder = memoryCatalogItems.length > 0 ? Math.max(...memoryCatalogItems.map((i) => i.sort_order || 0)) : 0;
      const newItem = {
        id: newId,
        name,
        rate,
        unit,
        variants,
        sort_order: sort_order !== null ? sort_order : (maxOrder + 1),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      memoryCatalogItems.push(newItem);
      return formatCatalogItemRow(newItem);
    }
  }

  async saveCatalogItemsBatch(itemsList) {
    if (!Array.isArray(itemsList)) return [];
    const results = [];
    for (let i = 0; i < itemsList.length; i++) {
      const it = itemsList[i];
      if (!it || !it.name || !it.name.trim()) continue;
      const finalSortOrder = typeof it.sort_order === 'number' ? it.sort_order : i + 1;
      const saved = await this.saveCatalogItem({
        ...it,
        sort_order: finalSortOrder,
      });
      results.push(saved);
    }
    return results;
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

