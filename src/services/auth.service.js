import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';
import { config } from '../config/env.js';
import { sendOtpEmail } from './email.service.js';
import { createSession } from './session.service.js';

/**
 * Generate JWT token for user, embedding sessionId for remote device tracking
 */
const generateToken = (user, sessionId = null) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      mobile: user.mobile || null,
      role: user.role,
      name: user.name,
      sessionId: sessionId || null,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
};

/**
 * Generate 6-digit numeric OTP
 */
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const authService = {
  /**
   * Step 1: Login user with Email OR Mobile and Password
   * Automatically generates 6-digit OTP and emails it to the user's registered email
   */
  async login({ identifier, email, mobile, password, req }) {
    const rawIdentifier = (identifier || email || mobile || '').trim();

    if (!rawIdentifier || !password) {
      throw { status: 400, message: 'Please provide email or mobile number and password.' };
    }

    const [rows] = await db.query(
      'SELECT id, name, email, mobile, password, role, permissions, is_active FROM users WHERE LOWER(email) = ? OR mobile = ? LIMIT 1',
      [rawIdentifier.toLowerCase(), rawIdentifier]
    );

    if (!rows || rows.length === 0) {
      throw { status: 401, message: 'Invalid email/mobile or password.' };
    }

    const user = rows[0];

    if (user.is_active === 0 || user.is_active === false) {
      throw { status: 403, message: 'Your account has been deactivated. Please contact your administrator.' };
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw { status: 401, message: 'Invalid email/mobile or password.' };
    }

    // If user has a registered email, dispatch 6-digit OTP for 2-step verification
    if (user.email && user.email.includes('@')) {
      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await db.query(
        'UPDATE users SET login_otp = ?, login_otp_expires_at = ? WHERE id = ?',
        [otp, expiresAt, user.id]
      );

      // Send OTP to registered email
      try {
        await sendOtpEmail({
          toEmail: user.email,
          userName: user.name,
          otp,
          type: 'login',
        });
      } catch (emailErr) {
        console.warn('⚠️ [Login OTP Dispatch Notice]:', emailErr.message);
      }

      const [namePart, domainPart] = user.email.split('@');
      const maskedEmail = namePart.length > 2
        ? `${namePart.slice(0, 2)}***@${domainPart}`
        : `${namePart}***@${domainPart}`;

      return {
        requiresOtp: true,
        userId: user.id,
        email: maskedEmail,
        message: `A 6-digit OTP code has been sent to your registered email (${maskedEmail}).`,
      };
    }

    // Direct fallback if no email exists
    const session = await createSession({ userId: user.id, req });
    const token = generateToken(user, session.sessionId);

    let parsedPermissions = [];
    try {
      if (typeof user.permissions === 'string' && user.permissions.trim()) {
        parsedPermissions = JSON.parse(user.permissions);
      } else if (Array.isArray(user.permissions)) {
        parsedPermissions = user.permissions;
      }
    } catch {
      parsedPermissions = [];
    }

    return {
      token,
      sessionId: session.sessionId,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        permissions: parsedPermissions,
        is_active: user.is_active !== 0,
      },
    };
  },

  /**
   * Step 2: Verify Login OTP, establish active device session, and issue JWT
   */
  async verifyLoginOtp({ userId, otp, req }) {
    if (!userId || !otp) {
      throw { status: 400, message: 'User ID and OTP are required.' };
    }

    const [rows] = await db.query(
      'SELECT id, name, email, mobile, role, permissions, is_active, login_otp, login_otp_expires_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (!rows || rows.length === 0) {
      throw { status: 404, message: 'User not found.' };
    }

    const user = rows[0];

    if (!user.login_otp || user.login_otp !== otp.trim()) {
      throw { status: 400, message: 'Invalid OTP code. Please enter the correct code sent to your email.' };
    }

    if (!user.login_otp_expires_at || new Date() > new Date(user.login_otp_expires_at)) {
      throw { status: 400, message: 'OTP has expired. Please click resend to get a new code.' };
    }

    // Clear login OTP once used
    await db.query('UPDATE users SET login_otp = NULL, login_otp_expires_at = NULL WHERE id = ?', [user.id]);

    // Create tracked session record for this device
    const session = await createSession({ userId: user.id, req });

    // Generate JWT token with sessionId
    const token = generateToken(user, session.sessionId);

    let parsedPermissions = [];
    try {
      if (typeof user.permissions === 'string' && user.permissions.trim()) {
        parsedPermissions = JSON.parse(user.permissions);
      } else if (Array.isArray(user.permissions)) {
        parsedPermissions = user.permissions;
      }
    } catch {
      parsedPermissions = [];
    }

    return {
      token,
      sessionId: session.sessionId,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        permissions: parsedPermissions,
        is_active: user.is_active !== 0,
      },
      message: 'Login successful!',
    };
  },

  /**
   * Resend Login OTP
   */
  async resendLoginOtp({ userId }) {
    if (!userId) {
      throw { status: 400, message: 'User ID is required.' };
    }

    const [rows] = await db.query(
      'SELECT id, name, email FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (!rows || rows.length === 0) {
      throw { status: 404, message: 'User not found.' };
    }

    const user = rows[0];
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.query(
      'UPDATE users SET login_otp = ?, login_otp_expires_at = ? WHERE id = ?',
      [otp, expiresAt, user.id]
    );

    await sendOtpEmail({
      toEmail: user.email,
      userName: user.name,
      otp,
      type: 'login',
    });

    const [namePart, domainPart] = user.email.split('@');
    const maskedEmail = namePart.length > 2
      ? `${namePart.slice(0, 2)}***@${domainPart}`
      : `${namePart}***@${domainPart}`;

    return {
      message: `A fresh 6-digit OTP code has been sent to your registered email (${maskedEmail}).`,
      email: maskedEmail,
    };
  },

  /**
   * Get currently logged-in user profile
   */
  async getMe(userId) {
    const [rows] = await db.query(
      'SELECT id, name, email, mobile, role, permissions, is_active, created_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (!rows || rows.length === 0) {
      throw { status: 404, message: 'User not found.' };
    }

    const user = rows[0];
    let parsedPermissions = [];
    try {
      if (typeof user.permissions === 'string' && user.permissions.trim()) {
        parsedPermissions = JSON.parse(user.permissions);
      } else if (Array.isArray(user.permissions)) {
        parsedPermissions = user.permissions;
      }
    } catch {
      parsedPermissions = [];
    }

    return {
      ...user,
      permissions: parsedPermissions,
      is_active: user.is_active !== 0,
    };
  },

  /**
   * Request OTP for Forgot Password
   * Accepts registered email OR mobile number, but sends OTP STRICTLY to user's registered email
   */
  async forgotPassword(identifier) {
    if (!identifier || !identifier.trim()) {
      throw { status: 400, message: 'Please enter your registered email or mobile number.' };
    }

    const cleanInput = identifier.trim();
    const [rows] = await db.query(
      'SELECT id, name, email, mobile FROM users WHERE LOWER(email) = ? OR mobile = ? LIMIT 1',
      [cleanInput.toLowerCase(), cleanInput]
    );

    if (!rows || rows.length === 0) {
      throw { status: 404, message: 'No registered user found with this email or mobile number.' };
    }

    const user = rows[0];
    const otp = generateOtp();
    // Expiration: 10 minutes from now
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.query(
      'UPDATE users SET reset_otp = ?, otp_expires_at = ? WHERE id = ?',
      [otp, expiresAt, user.id]
    );

    // Send OTP strictly to user's registered email address
    const emailResult = await sendOtpEmail({
      toEmail: user.email,
      userName: user.name,
      otp,
      type: 'forgot_password',
    });

    // Mask email for user privacy (e.g. ad***@faizanbody.com)
    const [namePart, domainPart] = user.email.split('@');
    const maskedEmail = namePart.length > 2
      ? `${namePart.slice(0, 2)}***@${domainPart}`
      : `${namePart}***@${domainPart}`;

    return {
      message: `A 6-digit OTP code has been sent to your registered email (${maskedEmail}).`,
      email: user.email,
      delivered: emailResult.delivered,
    };
  },

  /**
   * Verify entered OTP
   */
  async verifyOtp({ email, identifier, otp }) {
    const rawInput = (email || identifier || '').trim();
    if (!rawInput || !otp) {
      throw { status: 400, message: 'Identifier and OTP are required.' };
    }

    const [rows] = await db.query(
      'SELECT id, reset_otp, otp_expires_at FROM users WHERE LOWER(email) = ? OR mobile = ? LIMIT 1',
      [rawInput.toLowerCase(), rawInput]
    );

    if (!rows || rows.length === 0) {
      throw { status: 404, message: 'User not found.' };
    }

    const user = rows[0];

    if (!user.reset_otp || user.reset_otp !== otp.trim()) {
      throw { status: 400, message: 'Invalid OTP code. Please check and try again.' };
    }

    if (new Date() > new Date(user.otp_expires_at)) {
      throw { status: 400, message: 'OTP code has expired. Please request a new one.' };
    }

    return { valid: true, message: 'OTP verified successfully.' };
  },

  /**
   * Reset Password with OTP
   */
  async resetPassword({ email, identifier, otp, newPassword }) {
    const rawInput = (email || identifier || '').trim();
    if (!rawInput || !otp || !newPassword) {
      throw { status: 400, message: 'Identifier, OTP, and new password are required.' };
    }

    if (newPassword.length < 6) {
      throw { status: 400, message: 'Password must be at least 6 characters long.' };
    }

    // Verify OTP first
    await this.verifyOtp({ email: rawInput, otp });

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.query(
      'UPDATE users SET password = ?, reset_otp = NULL, otp_expires_at = NULL WHERE LOWER(email) = ? OR mobile = ?',
      [hashedPassword, rawInput.toLowerCase(), rawInput]
    );

    return { message: 'Password has been reset successfully! You can now log in with your new password.' };
  },

  /**
   * Change Password (for logged-in user via Old / Current Password)
   */
  async changePassword({ userId, currentPassword, newPassword }) {
    if (!currentPassword) {
      throw { status: 400, message: 'Please enter your current (old) password.' };
    }

    if (!newPassword || newPassword.length < 6) {
      throw { status: 400, message: 'New password must be at least 6 characters long.' };
    }

    const [rows] = await db.query(
      'SELECT id, password FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (!rows || rows.length === 0) {
      throw { status: 404, message: 'User not found.' };
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      throw { status: 400, message: 'Incorrect old password. Please verify and try again.' };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, userId]
    );

    return { message: 'Password updated successfully!' };
  },
};

export default authService;
