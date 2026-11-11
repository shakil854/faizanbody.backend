/**
 * ====================================================================
 * 📒 Rojmed (રોજમેળ / Daily Cash Book) Database Schema
 * ====================================================================
 * Safe Additive Schema (Zero Data Loss Guarantee).
 * Stores daily Aavak (cash in) & Javak (cash out) entries with optional
 * bidirectional links to Worker Khata and Truck Account Khata, plus
 * daily manual opening Silak (સિલક) anchors for accurate carry-forward.
 * ====================================================================
 */

export const RojmedEntryModel = {
  tableName: 'rojmed_entries',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    date: 'DATE NOT NULL',
    entry_type: "VARCHAR(20) NOT NULL COMMENT 'aavak = cash in (left), javak = cash out (right)'",
    amount: 'DECIMAL(12, 2) NOT NULL',
    particulars: 'VARCHAR(255) NOT NULL',
    source_type: "VARCHAR(30) NOT NULL DEFAULT 'general' COMMENT 'general, worker, truck_account'",
    source_id: 'INT NULL',
    sub_type: "VARCHAR(30) NULL COMMENT 'upad, payment, salary (worker) or jama, udhar (truck_account)'",
    linked_tx_id: 'INT NULL',
    payment_mode: "VARCHAR(50) NOT NULL DEFAULT 'Cash'",
    notes: 'VARCHAR(255) NULL',
    created_by: 'INT NULL',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_rojmed_date', column: 'date' },
    { name: 'idx_rojmed_type', column: 'entry_type' },
    { name: 'idx_rojmed_source', column: 'source_type' },
    { name: 'idx_rojmed_source_id', column: 'source_id' },
    { name: 'idx_rojmed_linked_tx', column: 'linked_tx_id' },
  ],
  initialSeed: [], // Strict Zero Dummy Data Rule: Always empty
};

export const RojmedOpeningModel = {
  tableName: 'rojmed_daily_openings',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    date: 'DATE NOT NULL UNIQUE',
    opening_balance: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00',
    notes: 'VARCHAR(255) NULL',
    updated_by: 'INT NULL',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_rojmed_opening_date', column: 'date' },
  ],
  initialSeed: [], // Strict Zero Dummy Data Rule: Always empty
};

export default {
  RojmedEntryModel,
  RojmedOpeningModel,
};

