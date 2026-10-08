/**
 * Worker Model Definition
 * Define columns and table specifications here.
 * Adding any new field here will automatically be added to MySQL database on server startup
 * without losing existing data (via alterSync).
 */
export const WorkerModel = {
  tableName: 'workers',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    name: 'VARCHAR(150) NOT NULL',
    mobile: 'VARCHAR(30) NULL',
    aadhar_card: 'LONGTEXT NULL',
    coming_date: 'DATE NOT NULL',
    going_date: 'DATE NULL',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_workers_name', column: 'name' },
    { name: 'idx_workers_mobile', column: 'mobile' },
    { name: 'idx_workers_coming', column: 'coming_date' },
    { name: 'idx_workers_going', column: 'going_date' },
  ],
  initialSeed: [],
};

export default WorkerModel;
