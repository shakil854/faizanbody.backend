import bcrypt from 'bcryptjs';
import db from '../config/db.js';
import { ApiError } from '../utils/apiError.js';

const parsePermissions = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

export const userService = {
  /**
   * Get all registered users (excluding sensitive credentials)
   */
  async getUsers() {
    const [rows] = await db.query(
      `SELECT id, name, email, mobile, role, permissions, is_active, created_at, updated_at
       FROM users
       ORDER BY id DESC`
    );

    return rows.map((u) => ({
      ...u,
      permissions: parsePermissions(u.permissions),
      is_active: u.is_active === 1 || u.is_active === true,
    }));
  },

  /**
   * Get single user by ID
   */
  async getUserById(id) {
    const [rows] = await db.query(
      `SELECT id, name, email, mobile, role, permissions, is_active, created_at, updated_at
       FROM users
       WHERE id = ? LIMIT 1`,
      [id]
    );

    if (!rows || rows.length === 0) {
      throw ApiError.notFound('User not found');
    }

    const u = rows[0];
    return {
      ...u,
      permissions: parsePermissions(u.permissions),
      is_active: u.is_active === 1 || u.is_active === true,
    };
  },

  /**
   * Create a new user with granular permissions
   */
  async createUser({ name, email, mobile, password, role = 'user', permissions = [], is_active = true }) {
    if (!name || !name.trim()) {
      throw ApiError.badRequest('User full name is required');
    }
    if (!email || !email.trim()) {
      throw ApiError.badRequest('User email address is required');
    }
    if (!password || password.length < 6) {
      throw ApiError.badRequest('Password must be at least 6 characters long');
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    const cleanMobile = mobile ? mobile.trim() : null;

    // Check if email already registered
    const [existing] = await db.query(
      'SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1',
      [cleanEmail]
    );

    if (existing && existing.length > 0) {
      throw ApiError.badRequest('A user with this email address already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const permissionsJson = JSON.stringify(Array.isArray(permissions) ? permissions : []);
    const activeVal = is_active ? 1 : 0;
    const finalRole = role === 'admin' ? 'admin' : 'user';

    const [result] = await db.query(
      `INSERT INTO users (name, email, mobile, password, role, permissions, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [cleanName, cleanEmail, cleanMobile, hashedPassword, finalRole, permissionsJson, activeVal]
    );

    return this.getUserById(result.insertId);
  },

  /**
   * Update existing user details, password (optional) and permissions
   */
  async updateUser(id, { name, email, mobile, password, role, permissions, is_active }) {
    const user = await this.getUserById(id);

    const cleanName = name ? name.trim() : user.name;
    const cleanEmail = email ? email.trim().toLowerCase() : user.email;
    const cleanMobile = mobile !== undefined ? (mobile ? mobile.trim() : null) : user.mobile;
    const finalRole = role !== undefined ? (role === 'admin' ? 'admin' : 'user') : user.role;
    const finalActive = is_active !== undefined ? (is_active ? 1 : 0) : (user.is_active ? 1 : 0);

    // If email is changing, ensure uniqueness
    if (cleanEmail !== user.email) {
      const [duplicate] = await db.query(
        'SELECT id FROM users WHERE LOWER(email) = ? AND id != ? LIMIT 1',
        [cleanEmail, id]
      );
      if (duplicate && duplicate.length > 0) {
        throw ApiError.badRequest('Another user already uses this email address');
      }
    }

    let finalPermissionsJson;
    if (permissions !== undefined) {
      finalPermissionsJson = JSON.stringify(Array.isArray(permissions) ? permissions : []);
    } else {
      finalPermissionsJson = JSON.stringify(user.permissions || []);
    }

    if (password && password.trim()) {
      if (password.length < 6) {
        throw ApiError.badRequest('New password must be at least 6 characters long');
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      await db.query(
        `UPDATE users
         SET name = ?, email = ?, mobile = ?, password = ?, role = ?, permissions = ?, is_active = ?
         WHERE id = ?`,
        [cleanName, cleanEmail, cleanMobile, hashedPassword, finalRole, finalPermissionsJson, finalActive, id]
      );
    } else {
      await db.query(
        `UPDATE users
         SET name = ?, email = ?, mobile = ?, role = ?, permissions = ?, is_active = ?
         WHERE id = ?`,
        [cleanName, cleanEmail, cleanMobile, finalRole, finalPermissionsJson, finalActive, id]
      );
    }

    return this.getUserById(id);
  },

  /**
   * Toggle user active/suspended state
   */
  async toggleUserStatus(id, currentAdminId) {
    if (Number(id) === Number(currentAdminId)) {
      throw ApiError.badRequest('You cannot deactivate your own active session account');
    }

    const user = await this.getUserById(id);
    const newStatus = user.is_active ? 0 : 1;

    await db.query('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, id]);
    return this.getUserById(id);
  },

  /**
   * Delete user permanently
   */
  async deleteUser(id, currentAdminId) {
    if (Number(id) === Number(currentAdminId)) {
      throw ApiError.badRequest('You cannot delete your own active administrator account');
    }

    const user = await this.getUserById(id);
    await db.query('DELETE FROM users WHERE id = ?', [id]);

    return {
      message: `User "${user.name}" (${user.email}) deleted successfully`,
    };
  },
};

export default userService;
