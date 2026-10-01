/**
 * Vehicle Model Definition
 */
export const VehicleModel = {
  tableName: 'vehicle_models',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    name: 'VARCHAR(150) NOT NULL',
    category: 'VARCHAR(100) NOT NULL',
    status: 'VARCHAR(50) DEFAULT "Active"',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
  },
  initialSeed: [
    { name: 'Truck Body Model Alpha', category: 'Heavy Duty', status: 'Active' },
    { name: 'Tipper Body Model X', category: 'Tipper', status: 'Active' },
    { name: 'Container Body Spec-Z', category: 'Container', status: 'Pending Review' },
  ],
};

export default VehicleModel;
