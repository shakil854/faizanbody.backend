import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import db from '../config/db.js';

/**
 * ====================================================================
 * 🛡️ Authentication Middleware
 * ====================================================================
 * Verifies JWT token and attaches user information to request.
 * ====================================================================
 */
export async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No token provided.',
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authorization token format.',
      });
    }

    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret);

    // Verify that the user still exists in the database
    const [rows] = await db.query(
      'SELECT id, name, email, mobile, role, permissions, is_active FROM users WHERE id = ? LIMIT 1',
      [decoded.id]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User belonging to this token no longer exists.',
      });
    }

    const dbUser = rows[0];

    // Check if account is suspended/deactivated
    if (dbUser.is_active === 0 || dbUser.is_active === false) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact your administrator.',
      });
    }

    let parsedPermissions = [];
    try {
      if (typeof dbUser.permissions === 'string' && dbUser.permissions.trim()) {
        parsedPermissions = JSON.parse(dbUser.permissions);
      } else if (Array.isArray(dbUser.permissions)) {
        parsedPermissions = dbUser.permissions;
      }
    } catch {
      parsedPermissions = [];
    }

    req.user = {
      ...dbUser,
      permissions: parsedPermissions,
    };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid or corrupted token.',
    });
  }
}

/**
 * ====================================================================
 * 👑 Role-Based Authorization Middleware
 * ====================================================================
 * Enforces role restriction ('admin', 'user').
 * ====================================================================
 */
export function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Requires one of the following roles: [${allowedRoles.join(', ')}]. Current role: "${req.user.role}".`,
      });
    }

    next();
  };
}

/**
 * ====================================================================
 * 🛡️ Granular Permission Authorization Middleware
 * ====================================================================
 * Verifies if user has specific permission (Admins bypass all checks).
 * ====================================================================
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    // Admin has unconditional master access
    if (req.user.role === 'admin') {
      return next();
    }

    const userPerms = Array.isArray(req.user.permissions) ? req.user.permissions : [];

    if (!userPerms.includes(permission)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. You do not have permission to perform this action (${permission}).`,
      });
    }

    next();
  };
}

export default {
  verifyToken,
  authorizeRoles,
  requirePermission,
};
