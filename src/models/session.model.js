/**
 * User Sessions Model Definition
 * Tracks active devices, IP addresses, browsers, and login timestamps for device management and remote logout.
 */
export const SessionModel = {
  tableName: 'user_sessions',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    user_id: 'INT NOT NULL',
    session_token: 'VARCHAR(191) NOT NULL UNIQUE',
    device_name: 'VARCHAR(150) NULL',
    browser: 'VARCHAR(100) NULL',
    os: 'VARCHAR(100) NULL',
    ip_address: 'VARCHAR(100) NULL',
    is_active: 'TINYINT(1) NOT NULL DEFAULT 1',
    last_active_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_sessions_user', column: 'user_id' },
    { name: 'idx_sessions_token', column: 'session_token' },
    { name: 'idx_sessions_active', column: 'is_active' },
    { name: 'idx_sessions_last_active', column: 'last_active_at' },
  ],
  initialSeed: [],
};

export default SessionModel;
