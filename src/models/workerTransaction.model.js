/**
 * Worker Transaction / Khata Model Definition
 * Represents financial ledger records (उपाड़, पेमेंट, मजदूरी/पगार) for workers.
 * Adding this table is a safe additive change (Zero Data Loss).
 */
export const WorkerTransactionModel = {
  tableName: 'worker_transactions',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    worker_id: 'INT NOT NULL',
    type: "VARCHAR(50) NOT NULL COMMENT 'upad, payment, salary'",
    amount: 'DECIMAL(10, 2) NOT NULL',
    date: 'DATE NOT NULL',
    notes: 'VARCHAR(255) NULL',
    payment_mode: "VARCHAR(50) DEFAULT 'Cash'",
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_worker_tx_worker', column: 'worker_id' },
    { name: 'idx_worker_tx_date', column: 'date' },
    { name: 'idx_worker_tx_type', column: 'type' },
  ],
  initialSeed: [],
};

export default WorkerTransactionModel;
