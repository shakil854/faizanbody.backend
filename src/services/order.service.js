import db from '../config/db.js';
import { r2Service } from './r2.service.js';

/**
 * Format date to YYYY-MM-DD string
 */
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

/**
 * Safely parse JSON or return object as-is
 */
function safeParseJson(data, fallback = null) {
  if (!data) return fallback;
  if (typeof data === 'object') return data;
  try {
    return JSON.parse(data);
  } catch (e) {
    return fallback;
  }
}

/**
 * Format order record from MySQL row or memory object
 */
function formatOrderRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    order_no: row.order_no,
    order_date: formatDate(row.order_date),
    condition_text: row.condition_text || '',
    owner_name: row.owner_name || '',
    mobile_number: row.mobile_number || '',
    entry_date: formatDate(row.entry_date),
    truck_chassis_no: row.truck_chassis_no || '',
    shade_no: row.shade_no || '',
    status: row.status || 'In Progress',
    cabin_work: safeParseJson(row.cabin_work, { boxes: ['', '', ''], items: {} }),
    inside_work: safeParseJson(row.inside_work, { boxes: ['', '', ''], items: {} }),
    body_work: safeParseJson(row.body_work, { boxes: ['', '', ''], items: {} }),
    accessories: safeParseJson(row.accessories, { boxes: ['', '', ''], items: {} }),
    finishing_work: safeParseJson(row.finishing_work, {
      color: { value: '', boxes: ['', '', ''], done: false },
      redium: { value: '', boxes: ['', '', ''], done: false },
      painting: { value: '', boxes: ['', '', ''], done: false },
      vayring: { value: '', boxes: ['', '', ''], done: false },
    }),
    machro: safeParseJson(row.machro, { boxes: ['', '', ''], items: {} }),
    md_signature: row.md_signature || '',
    party_owner_signature: row.party_owner_signature || '',
    notes: row.notes || '',
    photos: safeParseJson(row.photos, []),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * In-memory fallback dataset when MySQL is offline
 */
let memoryOrders = [];
let nextOrderId = 1;

class OrderService {
  async getAllOrders({ search = '', status = 'all' } = {}) {
    try {
      let sql = 'SELECT * FROM work_orders';
      const conditions = [];
      const params = [];

      if (search && search.trim()) {
        const q = `%${search.trim()}%`;
        conditions.push(
          '(truck_chassis_no LIKE ? OR owner_name LIKE ? OR mobile_number LIKE ? OR order_no LIKE ? OR condition_text LIKE ?)'
        );
        params.push(q, q, q, q, q);
      }

      if (status && status !== 'all') {
        conditions.push('status = ?');
        params.push(status);
      }

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }

      sql += ' ORDER BY id DESC';

      const [rows] = await db.query(sql, params);
      return rows.map(formatOrderRow);
    } catch (error) {
      console.warn('⚠️ [OrderService DB Warning - Using Memory Store]:', error.message);
      let list = [...memoryOrders];

      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        list = list.filter(
          (o) =>
            o.truck_chassis_no?.toLowerCase().includes(q) ||
            o.owner_name?.toLowerCase().includes(q) ||
            o.mobile_number?.includes(q) ||
            o.order_no?.toLowerCase().includes(q) ||
            o.condition_text?.toLowerCase().includes(q)
        );
      }

      if (status && status !== 'all') {
        list = list.filter((o) => o.status === status);
      }

      list.sort((a, b) => b.id - a.id);
      return list.map(formatOrderRow);
    }
  }

  async getOrderById(id) {
    const numId = Number(id);
    try {
      const [rows] = await db.query('SELECT * FROM work_orders WHERE id = ? LIMIT 1', [numId]);
      if (rows && rows.length > 0) {
        return formatOrderRow(rows[0]);
      }
      return null;
    } catch (error) {
      const found = memoryOrders.find((o) => o.id === numId);
      return found ? formatOrderRow(found) : null;
    }
  }

  async createOrder(data) {
    const orderNo = data.order_no || `WO-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    const formattedOrderDate = formatDate(data.order_date || new Date());
    const formattedEntryDate = formatDate(data.entry_date || new Date());

    const cabinJson = JSON.stringify(data.cabin_work || { boxes: ['', '', ''], items: {} });
    const insideJson = JSON.stringify(data.inside_work || { boxes: ['', '', ''], items: {} });
    const bodyJson = JSON.stringify(data.body_work || { boxes: ['', '', ''], items: {} });
    const accJson = JSON.stringify(data.accessories || { boxes: ['', '', ''], items: {} });
    const finishingJson = JSON.stringify(
      data.finishing_work || {
        color: { value: '', boxes: ['', '', ''], done: false },
        redium: { value: '', boxes: ['', '', ''], done: false },
        painting: { value: '', boxes: ['', '', ''], done: false },
        vayring: { value: '', boxes: ['', '', ''], done: false },
      }
    );
    const machroJson = JSON.stringify(data.machro || { boxes: ['', '', ''], items: {} });
    const photosJson = JSON.stringify(data.photos || []);

    try {
      const [result] = await db.query(
        `INSERT INTO work_orders (
          order_no, order_date, condition_text, owner_name, mobile_number,
          entry_date, truck_chassis_no, shade_no, status,
          cabin_work, inside_work, body_work, accessories, finishing_work, machro,
          md_signature, party_owner_signature, notes, photos
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderNo,
          formattedOrderDate,
          data.condition_text || '',
          data.owner_name || '',
          data.mobile_number || '',
          formattedEntryDate,
          data.truck_chassis_no || '',
          data.shade_no || '',
          data.status || 'In Progress',
          cabinJson,
          insideJson,
          bodyJson,
          accJson,
          finishingJson,
          machroJson,
          data.md_signature || '',
          data.party_owner_signature || '',
          data.notes || '',
          photosJson,
        ]
      );

      return this.getOrderById(result.insertId);
    } catch (error) {
      console.warn('⚠️ [OrderService DB Warning - Using Memory Store]:', error.message);
      const newOrder = {
        id: nextOrderId++,
        order_no: orderNo,
        order_date: formattedOrderDate,
        condition_text: data.condition_text || '',
        owner_name: data.owner_name || '',
        mobile_number: data.mobile_number || '',
        entry_date: formattedEntryDate,
        truck_chassis_no: data.truck_chassis_no || '',
        shade_no: data.shade_no || '',
        status: data.status || 'In Progress',
        cabin_work: data.cabin_work || { boxes: ['', '', ''], items: {} },
        inside_work: data.inside_work || { boxes: ['', '', ''], items: {} },
        body_work: data.body_work || { boxes: ['', '', ''], items: {} },
        accessories: data.accessories || { boxes: ['', '', ''], items: {} },
        finishing_work: data.finishing_work || {
          color: { value: '', boxes: ['', '', ''], done: false },
          redium: { value: '', boxes: ['', '', ''], done: false },
          painting: { value: '', boxes: ['', '', ''], done: false },
          vayring: { value: '', boxes: ['', '', ''], done: false },
        },
        machro: data.machro || { boxes: ['', '', ''], items: {} },
        md_signature: data.md_signature || '',
        party_owner_signature: data.party_owner_signature || '',
        notes: data.notes || '',
        photos: data.photos || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      memoryOrders.push(newOrder);
      return formatOrderRow(newOrder);
    }
  }

  async updateOrder(id, data) {
    const numId = Number(id);
    const existing = await this.getOrderById(numId);
    if (!existing) return null;

    const formattedOrderDate = formatDate(data.order_date ?? existing.order_date);
    const formattedEntryDate = formatDate(data.entry_date ?? existing.entry_date);

    const cabinJson = JSON.stringify(data.cabin_work ?? existing.cabin_work);
    const insideJson = JSON.stringify(data.inside_work ?? existing.inside_work);
    const bodyJson = JSON.stringify(data.body_work ?? existing.body_work);
    const accJson = JSON.stringify(data.accessories ?? existing.accessories);
    const finishingJson = JSON.stringify(data.finishing_work ?? existing.finishing_work);
    const machroJson = JSON.stringify(data.machro ?? existing.machro);
    const photosJson = JSON.stringify(data.photos ?? existing.photos ?? []);

    try {
      await db.query(
        `UPDATE work_orders SET
          order_no = ?,
          order_date = ?,
          condition_text = ?,
          owner_name = ?,
          mobile_number = ?,
          entry_date = ?,
          truck_chassis_no = ?,
          shade_no = ?,
          status = ?,
          cabin_work = ?,
          inside_work = ?,
          body_work = ?,
          accessories = ?,
          finishing_work = ?,
          machro = ?,
          md_signature = ?,
          party_owner_signature = ?,
          notes = ?,
          photos = ?
        WHERE id = ?`,
        [
          data.order_no ?? existing.order_no,
          formattedOrderDate,
          data.condition_text ?? existing.condition_text,
          data.owner_name ?? existing.owner_name,
          data.mobile_number ?? existing.mobile_number,
          formattedEntryDate,
          data.truck_chassis_no ?? existing.truck_chassis_no,
          data.shade_no ?? existing.shade_no,
          data.status ?? existing.status,
          cabinJson,
          insideJson,
          bodyJson,
          accJson,
          finishingJson,
          machroJson,
          data.md_signature ?? existing.md_signature,
          data.party_owner_signature ?? existing.party_owner_signature,
          data.notes ?? existing.notes,
          photosJson,
          numId,
        ]
      );

      return this.getOrderById(numId);
    } catch (error) {
      console.warn('⚠️ [OrderService DB Warning - Using Memory Store]:', error.message);
      const index = memoryOrders.findIndex((o) => o.id === numId);
      if (index === -1) return null;

      memoryOrders[index] = {
        ...memoryOrders[index],
        ...data,
        id: numId,
        photos: data.photos ?? existing.photos ?? [],
        order_date: formattedOrderDate,
        entry_date: formattedEntryDate,
        updated_at: new Date().toISOString(),
      };
      return formatOrderRow(memoryOrders[index]);
    }
  }

  /**
   * Fast toggle for task done checkbox ("side me box he vha pe right karna he vo kam ho jaye tab")
   */
  async toggleTaskDone(id, { section, itemKey, done }) {
    const numId = Number(id);
    const order = await this.getOrderById(numId);
    if (!order) return null;

    const updatedData = { ...order };

    if (section === 'finishing_work') {
      if (!updatedData.finishing_work) updatedData.finishing_work = {};
      if (!updatedData.finishing_work[itemKey]) {
        updatedData.finishing_work[itemKey] = { value: '', boxes: ['', '', ''], done: false };
      }
      updatedData.finishing_work[itemKey].done = !!done;
    } else {
      if (!updatedData[section]) updatedData[section] = { boxes: ['', '', ''], items: {} };
      if (!updatedData[section].items) updatedData[section].items = {};
      if (!updatedData[section].items[itemKey]) {
        updatedData[section].items[itemKey] = { value: '', done: false };
      }
      updatedData[section].items[itemKey].done = !!done;
    }

    return this.updateOrder(numId, updatedData);
  }

  /**
   * Add uploaded photos to order
   */
  async addPhotosToOrder(id, newPhotos = []) {
    const numId = Number(id);
    const order = await this.getOrderById(numId);
    if (!order) return null;

    const currentPhotos = Array.isArray(order.photos) ? order.photos : [];
    const updatedPhotos = [...currentPhotos, ...newPhotos];

    return this.updateOrder(numId, { ...order, photos: updatedPhotos });
  }

  /**
   * Delete a photo from order and storage
   */
  async deletePhotoFromOrder(id, photoId) {
    const numId = Number(id);
    const order = await this.getOrderById(numId);
    if (!order) return null;

    const currentPhotos = Array.isArray(order.photos) ? order.photos : [];
    const photoToDelete = currentPhotos.find((p) => p.id === photoId || p.key === photoId);

    if (photoToDelete) {
      // Delete object from Cloudflare R2 / local storage
      await r2Service.deletePhoto(photoToDelete.key);
    }

    const updatedPhotos = currentPhotos.filter((p) => p.id !== photoId && p.key !== photoId);
    return this.updateOrder(numId, { ...order, photos: updatedPhotos });
  }

  /**
   * Delete all photos from an order and storage
   */
  async deleteAllPhotosFromOrder(id) {
    const numId = Number(id);
    const order = await this.getOrderById(numId);
    if (!order) return null;

    const currentPhotos = Array.isArray(order.photos) ? order.photos : [];
    for (const p of currentPhotos) {
      if (p.key) {
        try {
          await r2Service.deletePhoto(p.key);
        } catch (err) {
          console.warn('Failed to delete photo from storage:', p.key, err.message);
        }
      }
    }

    return this.updateOrder(numId, { ...order, photos: [] });
  }

  async deleteOrder(id) {
    const numId = Number(id);
    // Also delete all photos attached to this order
    try {
      const order = await this.getOrderById(numId);
      if (order && Array.isArray(order.photos)) {
        for (const p of order.photos) {
          if (p.key) await r2Service.deletePhoto(p.key);
        }
      }
    } catch (e) {
      console.warn('Error cleaning up photos for deleted order:', e.message);
    }

    try {
      const [result] = await db.query('DELETE FROM work_orders WHERE id = ?', [numId]);
      return result.affectedRows > 0;
    } catch (error) {
      console.warn('⚠️ [OrderService DB Warning - Using Memory Store]:', error.message);
      const initLen = memoryOrders.length;
      memoryOrders = memoryOrders.filter((o) => o.id !== numId);
      return memoryOrders.length < initLen;
    }
  }
}

export const orderService = new OrderService();
export default orderService;

