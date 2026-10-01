/**
 * User Model Definition
 * Stores authentication, roles ('admin', 'user'), and email OTP credentials.
 */
export const UserModel = {
  tableName: 'users',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    name: 'VARCHAR(150) NOT NULL',
    email: 'VARCHAR(191) NOT NULL UNIQUE',
    mobile: 'VARCHAR(20) NULL',
    password: 'VARCHAR(255) NOT NULL',
    role: "ENUM('admin', 'user') NOT NULL DEFAULT 'user'",
    reset_otp: 'VARCHAR(10) NULL',
    otp_expires_at: 'DATETIME NULL',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_users_email', column: 'email' },
    { name: 'idx_users_mobile', column: 'mobile' },
    { name: 'idx_users_role', column: 'role' },
  ],
  initialSeed: [],
};

export default UserModel;
