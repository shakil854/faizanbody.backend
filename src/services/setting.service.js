import db from '../config/db.js';

export const settingService = {
  /**
   * Retrieve a setting by its unique key
   */
  async getSetting(key, defaultValue = null) {
    try {
      const [rows] = await db.query(
        'SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1',
        [key]
      );
      if (!rows || rows.length === 0) return defaultValue;
      try {
        return JSON.parse(rows[0].setting_value);
      } catch {
        return rows[0].setting_value;
      }
    } catch (err) {
      console.warn(`[SettingService] Error reading setting ${key}:`, err.message);
      return defaultValue;
    }
  },

  /**
   * Save or update a setting by key
   */
  async setSetting(key, value, description = null) {
    const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
    await db.query(
      `INSERT INTO app_settings (setting_key, setting_value, description)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), description = VALUES(description), updated_at = CURRENT_TIMESTAMP`,
      [key, strVal, description]
    );
    return value;
  },

  /**
   * Get order badge color alert threshold settings
   */
  async getOrderBadgeSettings() {
    const defaultSettings = {
      redThreshold: 2,
      greenThreshold: 5,
      blueThreshold: 6,
      countType: 'in_progress', // 'in_progress' | 'incoming' | 'total'
    };
    const saved = await this.getSetting('order_badge_settings', defaultSettings);
    return {
      redThreshold: Number.isFinite(Number(saved?.redThreshold)) ? Number(saved.redThreshold) : 2,
      greenThreshold: Number.isFinite(Number(saved?.greenThreshold)) ? Number(saved.greenThreshold) : 5,
      blueThreshold: Number.isFinite(Number(saved?.blueThreshold)) ? Number(saved.blueThreshold) : 6,
      countType: ['total', 'incoming', 'in_progress'].includes(saved?.countType)
        ? saved.countType
        : 'in_progress',
    };
  },

  /**
   * Save order badge color alert threshold settings
   */
  async saveOrderBadgeSettings(settings) {
    const cleanSettings = {
      redThreshold: Math.max(0, parseInt(settings?.redThreshold, 10) || 0),
      greenThreshold: Math.max(0, parseInt(settings?.greenThreshold, 10) || 0),
      blueThreshold: Math.max(0, parseInt(settings?.blueThreshold, 10) || 0),
      countType: ['total', 'incoming', 'in_progress'].includes(settings?.countType)
        ? settings.countType
        : 'in_progress',
    };
    await this.setSetting(
      'order_badge_settings',
      cleanSettings,
      'Threshold rules for Orders Alert color badge'
    );
    return cleanSettings;
  },

  /**
   * Get custom order dropdown options
   */
  async getOrderDropdownOptions() {
    const saved = await this.getSetting('order_dropdown_options', {});
    return typeof saved === 'object' && saved !== null && !Array.isArray(saved) ? saved : {};
  },

  /**
   * Save custom order dropdown options
   */
  async saveOrderDropdownOptions(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new Error('Options must be an object with field keys mapped to option arrays');
    }

    const cleaned = {};
    for (const [key, list] of Object.entries(options)) {
      if (Array.isArray(list)) {
        cleaned[key] = list
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean);
      }
    }

    await this.setSetting(
      'order_dropdown_options',
      cleaned,
      'Custom options for work order dropdown fields'
    );
    return cleaned;
  },
};

export default settingService;
