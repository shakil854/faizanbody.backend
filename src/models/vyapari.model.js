/**
 * ====================================================================
 * 🏪 Vyapari Account Database Schema (Safe Additive - Zero Data Loss)
 * ====================================================================
 * For merchant / supplier / vyapari ledger accounts (વેપારી ખાતાવહી).
 * Matches authentic physical Five Star notebook format without Account No.
 */

export const VyapariAccountModel = {
  tableName: 'vyapari_accounts',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    party_name: 'VARCHAR(255) NOT NULL',
    firm_name: 'VARCHAR(255) NULL',
    phone: 'VARCHAR(50) NULL',
    address: 'VARCHAR(255) NULL',
    page_no: 'INT NULL',
    current_cycle: 'INT NOT NULL DEFAULT 1',
    notes: 'TEXT NULL',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_vyapari_accounts_party', column: 'party_name' },
    { name: 'idx_vyapari_accounts_page', column: 'page_no' },
  ],
  initialSeed: [], // Strict Zero Dummy Data Rule: Always empty
};

export const VyapariAccountEntryModel = {
  tableName: 'vyapari_account_entries',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    account_id: 'INT NOT NULL',
    type: "VARCHAR(20) NOT NULL COMMENT 'jama = payment/credit, udhar = bill/debit'",
    amount: 'DECIMAL(12,2) NOT NULL',
    date: 'DATE NOT NULL',
    particulars: 'VARCHAR(255) NOT NULL',
    bill_no: 'VARCHAR(100) NULL',
    stock_item_id: 'INT NULL',
    stock_item_name: 'VARCHAR(200) NULL',
    stock_qty: 'DECIMAL(12,2) NULL',
    payment_mode: "VARCHAR(50) NULL DEFAULT 'Cash'",
    cycle_no: 'INT NOT NULL DEFAULT 1',
    is_settled: 'TINYINT(1) NOT NULL DEFAULT 0',
    rojmed_entry_id: 'INT NULL',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_vyapari_entries_account', column: 'account_id' },
    { name: 'idx_vyapari_entries_cycle', column: 'cycle_no' },
    { name: 'idx_vyapari_entries_date', column: 'date' },
    { name: 'idx_vyapari_entries_rojmed', column: 'rojmed_entry_id' },
  ],
  initialSeed: [], // Strict Zero Dummy Data Rule: Always empty
};
