/**
 * Delete Request Model Definition
 * Stores user-submitted delete approval requests for admin review.
 * Zero Dummy Data: starts completely empty.
 */
export const DeleteRequestModel = {
  tableName: 'delete_requests',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    module: 'VARCHAR(80) NOT NULL',
    entity_id: 'INT NOT NULL',
    entity_meta: 'JSON NULL',
    entity_label: 'VARCHAR(255) NOT NULL',
    entity_snapshot: 'JSON NULL',
    reason: 'TEXT NOT NULL',
    status: "VARCHAR(30) NOT NULL DEFAULT 'pending'",
    requested_by_id: 'INT NOT NULL',
    requested_by_name: 'VARCHAR(150) NOT NULL',
    reviewed_by_id: 'INT NULL',
    reviewed_by_name: 'VARCHAR(150) NULL',
    review_note: 'TEXT NULL',
    reviewed_at: 'TIMESTAMP NULL',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_del_req_status', column: 'status' },
    { name: 'idx_del_req_module', column: 'module' },
    { name: 'idx_del_req_entity', column: 'entity_id' },
    { name: 'idx_del_req_requester', column: 'requested_by_id' },
    { name: 'idx_del_req_created', column: 'created_at' },
  ],
  initialSeed: [],
};

export default DeleteRequestModel;

