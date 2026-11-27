import db from '../config/db.js';
import { ApiError } from '../utils/apiError.js';
import { orderService } from './order.service.js';
import { workerService } from './worker.service.js';
import { truckAccountService } from './truckAccount.service.js';
import { vyapariService } from './vyapari.service.js';
import { rojmedService } from './rojmed.service.js';
import { upiRojmedService } from './upiRojmed.service.js';
import { stockService } from './stock.service.js';
import { quotationService } from './quotation.service.js';

const MODULE_EXECUTORS = {
  work_order: async (entityId) => orderService.deleteOrder(entityId),
  work_order_photo: async (entityId, meta) => {
    if (!meta?.photoId) throw new Error('Missing photoId for work_order_photo deletion');
    return orderService.deletePhotoFromOrder(entityId, meta.photoId);
  },
  work_order_all_photos: async (entityId) => orderService.deleteAllPhotosFromOrder(entityId),
  worker: async (entityId) => workerService.deleteWorker(entityId),
  worker_transaction: async (entityId) => workerService.deleteWorkerTransaction(entityId),
  truck_account: async (entityId) => truckAccountService.deleteAccount(entityId),
  truck_account_entry: async (entityId, meta) => {
    if (!meta?.accountId) throw new Error('Missing accountId for truck_account_entry deletion');
    return truckAccountService.deleteEntry(meta.accountId, entityId);
  },
  vyapari_account: async (entityId) => vyapariService.deleteAccount(entityId),
  vyapari_entry: async (entityId, meta) => {
    if (!meta?.accountId) throw new Error('Missing accountId for vyapari_entry deletion');
    return vyapariService.deleteEntry(meta.accountId, entityId);
  },
  rojmed_entry: async (entityId) => rojmedService.deleteEntry(entityId),
  upi_account: async (entityId) => upiRojmedService.deleteUpiAccount(entityId),
  upi_entry: async (entityId) => upiRojmedService.deleteUpiTransaction(entityId),
  stock_item: async (entityId) => stockService.deleteItem(entityId),
  stock_category: async (entityId) => stockService.deleteCategory(entityId),
  quotation: async (entityId) => quotationService.deleteQuotation(entityId),
};

function safeJsonParse(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

function formatRow(row) {
  if (!row) return null;
  return {
    ...row,
    entity_meta: safeJsonParse(row.entity_meta),
    entity_snapshot: safeJsonParse(row.entity_snapshot),
  };
}

let tableEnsured = false;
async function ensureTableExists() {
  if (tableEnsured) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS \`delete_requests\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`module\` VARCHAR(80) NOT NULL,
      \`entity_id\` INT NOT NULL,
      \`entity_meta\` JSON NULL,
      \`entity_label\` VARCHAR(255) NOT NULL,
      \`entity_snapshot\` JSON NULL,
      \`reason\` TEXT NOT NULL,
      \`status\` VARCHAR(30) NOT NULL DEFAULT 'pending',
      \`requested_by_id\` INT NOT NULL,
      \`requested_by_name\` VARCHAR(150) NOT NULL,
      \`reviewed_by_id\` INT NULL,
      \`reviewed_by_name\` VARCHAR(150) NULL,
      \`review_note\` TEXT NULL,
      \`reviewed_at\` TIMESTAMP NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_del_req_status\` (\`status\`),
      INDEX \`idx_del_req_module\` (\`module\`),
      INDEX \`idx_del_req_entity\` (\`entity_id\`),
      INDEX \`idx_del_req_requester\` (\`requested_by_id\`),
      INDEX \`idx_del_req_created\` (\`created_at\`)
    )
  `);
  tableEnsured = true;
}

export const deleteRequestService = {
  async createRequest(payload, user) {
    await ensureTableExists();

    const {
      module,
      entityId,
      entityMeta = null,
      entityLabel,
      entitySnapshot = null,
      reason,
    } = payload || {};

    if (!module || !MODULE_EXECUTORS[module]) {
      throw ApiError.badRequest(`Unsupported module for delete request: ${module || 'unknown'}`);
    }

    const numericId = Number(entityId);
    if (!numericId || Number.isNaN(numericId)) {
      throw ApiError.badRequest('Valid entityId is required');
    }

    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) {
      throw ApiError.badRequest('Please provide a reason for deleting this record.');
    }

    const trimmedLabel = String(entityLabel || `${module} #${numericId}`).slice(0, 255);

    // Check for duplicate pending request
    const [existingRows] = await db.query(
      `SELECT id, entity_meta FROM delete_requests WHERE module = ? AND entity_id = ? AND status = 'pending'`,
      [module, numericId]
    );

    const hasDuplicate = existingRows.some((r) => {
      if (module === 'work_order_photo') {
        const parsed = safeJsonParse(r.entity_meta);
        return String(parsed?.photoId || '') === String(entityMeta?.photoId || '');
      }
      return true;
    });

    if (hasDuplicate) {
      throw ApiError.badRequest('A delete request for this item is already pending admin approval.');
    }

    const metaJson = entityMeta ? JSON.stringify(entityMeta) : null;
    const snapshotJson = entitySnapshot ? JSON.stringify(entitySnapshot) : null;

    const [insertRes] = await db.query(
      `INSERT INTO delete_requests (
        module, entity_id, entity_meta, entity_label, entity_snapshot,
        reason, status, requested_by_id, requested_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        module,
        numericId,
        metaJson,
        trimmedLabel,
        snapshotJson,
        trimmedReason,
        user.id,
        user.name || user.email || 'User',
      ]
    );

    const [rows] = await db.query('SELECT * FROM delete_requests WHERE id = ? LIMIT 1', [insertRes.insertId]);
    return formatRow(rows[0]);
  },

  async listRequests({ status, module } = {}, user) {
    await ensureTableExists();

    const conditions = [];
    const params = [];

    if (user.role !== 'admin') {
      conditions.push('requested_by_id = ?');
      params.push(user.id);
    }

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (module && MODULE_EXECUTORS[module]) {
      conditions.push('module = ?');
      params.push(module);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await db.query(
      `SELECT * FROM delete_requests
       ${whereClause}
       ORDER BY FIELD(status, 'pending', 'approved', 'rejected'), created_at DESC
       LIMIT 300`,
      params
    );

    return rows.map(formatRow);
  },

  async getPendingCount(user) {
    await ensureTableExists();

    if (user.role === 'admin') {
      const [rows] = await db.query(`SELECT COUNT(*) AS count FROM delete_requests WHERE status = 'pending'`);
      return rows[0]?.count || 0;
    }

    const [rows] = await db.query(
      `SELECT COUNT(*) AS count FROM delete_requests WHERE status = 'pending' AND requested_by_id = ?`,
      [user.id]
    );
    return rows[0]?.count || 0;
  },

  async getPendingKeys() {
    await ensureTableExists();
    const [rows] = await db.query(
      `SELECT id, module, entity_id, entity_meta, requested_by_name, created_at
       FROM delete_requests
       WHERE status = 'pending'`
    );
    return rows.map(formatRow);
  },

  async approveRequest(requestId, adminUser, reviewNote = '') {
    await ensureTableExists();

    const [rows] = await db.query('SELECT * FROM delete_requests WHERE id = ? LIMIT 1', [requestId]);
    if (!rows || rows.length === 0) {
      throw ApiError.notFound('Delete request not found');
    }

    const request = formatRow(rows[0]);
    if (request.status !== 'pending') {
      throw ApiError.badRequest(`This request has already been ${request.status}.`);
    }

    const executor = MODULE_EXECUTORS[request.module];
    if (!executor) {
      throw ApiError.badRequest(`Unsupported module: ${request.module}`);
    }

    // Execute the actual module deletion using existing service logic
    try {
      await executor(request.entity_id, request.entity_meta || {});
    } catch (err) {
      // If record was already deleted manually, still allow marking or report clearly
      const msg = String(err?.message || '').toLowerCase();
      if (!msg.includes('not found')) {
        throw err;
      }
    }

    await db.query(
      `UPDATE delete_requests
       SET status = 'approved',
           reviewed_by_id = ?,
           reviewed_by_name = ?,
           review_note = ?,
           reviewed_at = NOW()
       WHERE id = ?`,
      [
        adminUser.id,
        adminUser.name || adminUser.email || 'Admin',
        String(reviewNote || '').trim() || null,
        request.id,
      ]
    );

    const [updated] = await db.query('SELECT * FROM delete_requests WHERE id = ? LIMIT 1', [request.id]);
    return formatRow(updated[0]);
  },

  async rejectRequest(requestId, adminUser, reviewNote = '') {
    await ensureTableExists();

    const [rows] = await db.query('SELECT * FROM delete_requests WHERE id = ? LIMIT 1', [requestId]);
    if (!rows || rows.length === 0) {
      throw ApiError.notFound('Delete request not found');
    }

    const request = formatRow(rows[0]);
    if (request.status !== 'pending') {
      throw ApiError.badRequest(`This request has already been ${request.status}.`);
    }

    await db.query(
      `UPDATE delete_requests
       SET status = 'rejected',
           reviewed_by_id = ?,
           reviewed_by_name = ?,
           review_note = ?,
           reviewed_at = NOW()
       WHERE id = ?`,
      [
        adminUser.id,
        adminUser.name || adminUser.email || 'Admin',
        String(reviewNote || '').trim() || null,
        request.id,
      ]
    );

    const [updated] = await db.query('SELECT * FROM delete_requests WHERE id = ? LIMIT 1', [request.id]);
    return formatRow(updated[0]);
  },
};

export default deleteRequestService;

