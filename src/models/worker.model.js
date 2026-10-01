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
    coming_date: 'DATE NOT NULL',
    going_date: 'DATE NULL',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  initialSeed: [
    { name: 'Mohammad Faizan', coming_date: '2025-01-10', going_date: null },
    { name: 'Rashid Ahmed', coming_date: '2025-02-01', going_date: null },
    { name: 'Ramesh Sharma', coming_date: '2024-10-15', going_date: '2025-03-15' },
  ],
};

export default WorkerModel;
