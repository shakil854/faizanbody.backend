/**
 * Work Order / Job Card Model Definition
 * Represents truck body work orders with detailed section tasks,
 * 3 blank metadata boxes per section, completion checkboxes, and signatures.
 */
export const OrderModel = {
  tableName: 'work_orders',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    order_no: 'VARCHAR(50) NOT NULL',
    order_date: 'DATE NULL',
    condition_text: 'VARCHAR(255) NULL',
    owner_name: 'VARCHAR(200) NOT NULL',
    mobile_number: 'VARCHAR(50) NULL',
    entry_date: 'DATE NULL',
    truck_chassis_no: 'VARCHAR(100) NOT NULL',
    shade_no: 'VARCHAR(100) NULL',
    status: "VARCHAR(50) DEFAULT 'In Progress'",
    cabin_work: 'JSON NULL',
    inside_work: 'JSON NULL',
    body_work: 'JSON NULL',
    accessories: 'JSON NULL',
    finishing_work: 'JSON NULL',
    machro: 'JSON NULL',
    md_signature: 'LONGTEXT NULL',
    party_owner_signature: 'LONGTEXT NULL',
    notes: 'TEXT NULL',
    photos: 'JSON NULL',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_orders_truck', column: 'truck_chassis_no' },
    { name: 'idx_orders_owner', column: 'owner_name' },
    { name: 'idx_orders_date', column: 'order_date' },
    { name: 'idx_orders_status', column: 'status' },
  ],
  initialSeed: [],
};

export default OrderModel;
