/**
 * Quotation & Item Catalog Models
 * Defines schema for Quotations / Estimates and Saved Items & Rates Master Catalog.
 * 
 * Strict Zero Dummy Data: initialSeed is strictly empty [].
 */

export const QuotationModel = {
  tableName: 'quotations',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    quotation_no: 'VARCHAR(50) NOT NULL',
    quotation_date: 'DATE NOT NULL',
    customer_name: 'VARCHAR(200) NOT NULL',
    mobile_number: 'VARCHAR(50) NULL',
    truck_chassis_no: 'VARCHAR(100) NULL',
    items: 'JSON NOT NULL',
    subtotal: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00',
    extra_percent: 'DECIMAL(5, 2) NOT NULL DEFAULT 0.00',
    extra_amount: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00',
    discount_percent: 'DECIMAL(5, 2) NOT NULL DEFAULT 0.00',
    discount_amount: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00',
    final_price: 'DECIMAL(12, 2) NOT NULL DEFAULT 0.00',
    notes: 'TEXT NULL',
    status: "VARCHAR(50) DEFAULT 'Draft'",
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_quotation_no', column: 'quotation_no' },
    { name: 'idx_quotation_date', column: 'quotation_date' },
    { name: 'idx_quotation_customer', column: 'customer_name' },
  ],
  initialSeed: [],
};

export const QuotationCatalogItemModel = {
  tableName: 'quotation_items_catalog',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    name: 'VARCHAR(200) NOT NULL',
    rate: 'DECIMAL(10, 2) NOT NULL DEFAULT 0.00',
    unit: "VARCHAR(50) DEFAULT 'Unit'",
    variants: 'JSON NULL',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_catalog_item_name', column: 'name' },
  ],
  initialSeed: [],
};

export default { QuotationModel, QuotationCatalogItemModel };

