/**
 * App Settings Model Definition
 * Key-value persistent store for application settings (e.g. order alert badge color thresholds)
 */
export const SettingModel = {
  tableName: 'app_settings',
  columns: {
    id: 'INT AUTO_INCREMENT PRIMARY KEY',
    setting_key: 'VARCHAR(100) NOT NULL UNIQUE',
    setting_value: 'LONGTEXT NOT NULL',
    description: 'VARCHAR(255) NULL',
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  },
  indexes: [
    { name: 'idx_settings_key', column: 'setting_key' },
  ],
  initialSeed: [],
};

export default SettingModel;
