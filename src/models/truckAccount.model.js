/**
 * ====================================================================
 * 🚛 Truck Account Database Schema (Safe Additive - Zero Data Loss)
 * ====================================================================
 * For vehicle/truck customer ledger accounts (ગાડી વાળા નું ખાતાવહી).
 * Matches authentic physical Five Star notebook format without Account No.
 */

export const TruckAccountModel = {
  tableName: 'truck_accounts',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    party_name: 'VARCHAR(255) NOT NULL',
    truck_no: 'VARCHAR(100) NULL',
    phone: 'VARCHAR(50) NULL',
    address: 'VARCHAR(255) NULL',
    page_no: 'INT NULL',
    notes: 'TEXT NULL',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_truck_accounts_party', column: 'party_name' },
    { name: 'idx_truck_accounts_page', column: 'page_no' },
  ],
  initialSeed: [], // Strict Zero Dummy Data Rule: Always empty
};

export const TruckAccountEntryModel = {
  tableName: 'truck_account_entries',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    account_id: 'INT NOT NULL',
    type: "VARCHAR(20) NOT NULL COMMENT 'jama = payment received, udhar = bill/expense'",
    amount: 'DECIMAL(12,2) NOT NULL',
    date: 'DATE NOT NULL',
    particulars: 'VARCHAR(255) NOT NULL',
    payment_mode: "VARCHAR(50) NULL DEFAULT 'Cash'",
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_truck_entries_account', column: 'account_id' },
    { name: 'idx_truck_entries_date', column: 'date' },
  ],
  initialSeed: [], // Strict Zero Dummy Data Rule: Always empty
};

