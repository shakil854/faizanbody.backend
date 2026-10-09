/**
 * Stock & Inventory Model Definitions for Faizan Body Works
 * Supports Truck Body Building inventory:
 * - Categories (e.g. Steel Channels, Angles, Plates, Hardware, Paint, Timber, Lights, Consumables)
 * - Stock Items with quantities, UOM, low stock alert threshold, rack location
 * - Stock Transactions (Stock In / Stock Out / Adjustments audit log)
 *
 * ZERO DUMMY DATA RULE: initialSeed is strictly empty [].
 */

export const StockCategoryModel = {
  tableName: 'stock_categories',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    name: 'VARCHAR(150) NOT NULL UNIQUE',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_stock_cat_name', column: 'name' },
  ],
  initialSeed: [],
};

export const StockItemModel = {
  tableName: 'stock_items',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    name: 'VARCHAR(200) NOT NULL',
    category_id: 'INT NULL',
    category_name: 'VARCHAR(150) NOT NULL',
    unit: "VARCHAR(50) DEFAULT 'Pcs'",
    quantity: 'DECIMAL(12, 2) DEFAULT 0.00',
    min_alert_quantity: 'DECIMAL(12, 2) DEFAULT 0.00',
    unit_price: 'DECIMAL(12, 2) NULL',
    location: 'VARCHAR(150) NULL',
    notes: 'TEXT NULL',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_stock_item_name', column: 'name' },
    { name: 'idx_stock_item_category', column: 'category_name' },
    { name: 'idx_stock_item_cat_id', column: 'category_id' },
  ],
  initialSeed: [],
};

export const StockTransactionModel = {
  tableName: 'stock_transactions',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    item_id: 'INT NOT NULL',
    type: "VARCHAR(50) NOT NULL COMMENT 'IN, OUT, ADJUSTMENT'",
    quantity: 'DECIMAL(12, 2) NOT NULL',
    previous_quantity: 'DECIMAL(12, 2) NOT NULL',
    new_quantity: 'DECIMAL(12, 2) NOT NULL',
    date: 'DATE NOT NULL',
    reference_note: 'VARCHAR(255) NULL',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_stock_tx_item', column: 'item_id' },
    { name: 'idx_stock_tx_date', column: 'date' },
    { name: 'idx_stock_tx_type', column: 'type' },
  ],
  initialSeed: [],
};

export default {
  StockCategoryModel,
  StockItemModel,
  StockTransactionModel,
};
