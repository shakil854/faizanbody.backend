import crypto from 'crypto';
import db from '../config/db.js';

/**
 * Helper to parse client user agent into readable device, browser, and OS names
 */
export function parseClientInfo(req) {
  const userAgent = req.headers['user-agent'] || '';
  let ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || 'Unknown';
  if (typeof ip === 'string' && ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  // Clean IPv6 localhost or standard format
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    ip = '127.0.0.1 (Localhost)';
  } else if (ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }

  // Detect OS
  let os = 'Unknown OS';
  if (/windows phone/i.test(userAgent)) os = 'Windows Phone';
  else if (/win/i.test(userAgent)) os = 'Windows';
  else if (/android/i.test(userAgent)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(userAgent)) os = 'iOS';
  else if (/mac/i.test(userAgent)) os = 'macOS';
  else if (/linux/i.test(userAgent)) os = 'Linux';

  // Detect Browser
  let browser = 'Unknown Browser';
  if (/edg/i.test(userAgent)) browser = 'Microsoft Edge';
  else if (/opr\//i.test(userAgent) || /opera/i.test(userAgent)) browser = 'Opera';
  else if (/chrome|crios/i.test(userAgent)) browser = 'Google Chrome';
  else if (/firefox|fxios/i.test(userAgent)) browser = 'Mozilla Firefox';
  else if (/safari/i.test(userAgent)) browser = 'Apple Safari';

  // Device Category
  let deviceType = 'Desktop';
  if (/mobile/i.test(userAgent)) deviceType = 'Mobile';
  else if (/tablet|ipad/i.test(userAgent)) deviceType = 'Tablet';

  const deviceName = `${browser} on ${os} (${deviceType})`;

  return { ip, os, browser, deviceName };
}

/**
 * Register a new login session for a user
 */
export async function createSession({ userId, req }) {
  const { ip, os, browser, deviceName } = parseClientInfo(req);
  const sessionToken = crypto.randomBytes(32).toString('hex');

  const [result] = await db.query(
    `INSERT INTO user_sessions (user_id, session_token, device_name, browser, os, ip_address, is_active, last_active_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
    [userId, sessionToken, deviceName, browser, os, ip]
  );

  return {
    sessionId: result.insertId,
    sessionToken,
    deviceName,
    browser,
    os,
    ip,
  };
}

/**
 * Check if a session is still active and update its last active timestamp
 */
export async function validateAndTouchSession(sessionId) {
  if (!sessionId) return false;

  const [rows] = await db.query(
    'SELECT id, user_id, is_active FROM user_sessions WHERE id = ? LIMIT 1',
    [sessionId]
  );

  if (!rows || rows.length === 0) return false;
  const session = rows[0];

  if (!session.is_active) {
    return false;
  }

  // Update last_active_at non-blockingly
  db.query('UPDATE user_sessions SET last_active_at = NOW() WHERE id = ?', [sessionId]).catch(
    () => {}
  );

  return true;
}

/**
 * List all sessions across users (for Admin dashboard)
 */
export async function getAllSessions() {
  const [rows] = await db.query(
    `SELECT 
       s.id,
       s.user_id,
       s.device_name,
       s.browser,
       s.os,
       s.ip_address,
       s.is_active,
       s.last_active_at,
       s.created_at,
       u.name AS user_name,
       u.email AS user_email,
       u.mobile AS user_mobile,
       u.role AS user_role
     FROM user_sessions s
     JOIN users u ON s.user_id = u.id
     ORDER BY s.is_active DESC, s.last_active_at DESC
     LIMIT 200`
  );
  return rows;
}

/**
 * List sessions for a specific user
 */
export async function getUserSessions(userId) {
  const [rows] = await db.query(
    `SELECT 
       s.id,
       s.user_id,
       s.device_name,
       s.browser,
       s.os,
       s.ip_address,
       s.is_active,
       s.last_active_at,
       s.created_at
     FROM user_sessions s
     WHERE s.user_id = ?
     ORDER BY s.is_active DESC, s.last_active_at DESC`,
    [userId]
  );
  return rows;
}

/**
 * Revoke/Logout a session by ID
 */
export async function revokeSession(sessionId) {
  const [result] = await db.query(
    'UPDATE user_sessions SET is_active = 0 WHERE id = ?',
    [sessionId]
  );
  return result.affectedRows > 0;
}

/**
 * Revoke/Logout all sessions of a user (or all except one)
 */
export async function revokeAllUserSessions(userId, exceptSessionId = null) {
  let query = 'UPDATE user_sessions SET is_active = 0 WHERE user_id = ?';
  const params = [userId];

  if (exceptSessionId) {
    query += ' AND id != ?';
    params.push(exceptSessionId);
  }

  const [result] = await db.query(query, params);
  return result.affectedRows;
}
