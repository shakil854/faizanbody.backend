/**
 * ====================================================================
 * 💳 UPI Rojmed (યુપીઆઈ રોજમેળ) Database Schema
 * ====================================================================
 * Safe Additive Schema (Zero Data Loss Guarantee).
 * Keeps UPI Silak & UPI Wallet/Bank balances completely separate from
 * Cash Rojmed Silak, while linking From -> To entries directly to
 * Truck Accounts, Vyapari Accounts, Workers, and Our UPI Accounts.
 * ====================================================================
 */

export const UpiAccountModel = {
  tableName: 'upi_accounts',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    name: 'VARCHAR(150) NOT NULL',
    upi_id: 'VARCHAR(150) NULL',
    opening_balance: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00',
    notes: 'VARCHAR(255) NULL',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_upi_accounts_name', column: 'name' },
  ],
  initialSeed: [], // Strict Zero Dummy Data Rule: Always empty
};

export const UpiTransactionModel = {
  tableName: 'upi_transactions',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    date: 'DATE NOT NULL',
    entry_type: "VARCHAR(20) NOT NULL DEFAULT 'aavak'",
    amount: 'DECIMAL(12, 2) NOT NULL',
    particulars: 'VARCHAR(255) NOT NULL',
    from_type: "VARCHAR(30) NOT NULL DEFAULT 'general'",
    from_id: 'INT NULL',
    from_label: 'VARCHAR(255) NULL',
    from_linked_tx_id: 'INT NULL',
    to_type: "VARCHAR(30) NOT NULL DEFAULT 'general'",
    to_id: 'INT NULL',
    to_label: 'VARCHAR(255) NULL',
    to_linked_tx_id: 'INT NULL',
    notes: 'VARCHAR(255) NULL',
    created_by: 'INT NULL',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_upi_tx_date', column: 'date' },
    { name: 'idx_upi_tx_from', column: 'from_type' },
    { name: 'idx_upi_tx_to', column: 'to_type' },
  ],
  initialSeed: [], // Strict Zero Dummy Data Rule: Always empty
};

export default {
  UpiAccountModel,
  UpiTransactionModel,
};
