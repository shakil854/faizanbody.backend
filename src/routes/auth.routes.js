import { Router } from 'express';
import {
  login,
  verifyLoginOtp,
  resendLoginOtp,
  getMe,
  forgotPassword,
  verifyOtp,
  resetPassword,
  changePassword,
  getAllSessions,
  revokeSession,
  revokeUserSessions,
} from '../controllers/auth.controller.js';
import { verifyToken, authorizeRoles } from '../middlewares/auth.middleware.js';

const router = Router();

// ==========================================
// 🔓 Public Authentication Routes
// ==========================================
router.post('/auth/login', login);
router.post('/auth/verify-login-otp', verifyLoginOtp);
router.post('/auth/resend-login-otp', resendLoginOtp);
router.post('/auth/forgot-password', forgotPassword);
router.post('/auth/verify-otp', verifyOtp);
router.post('/auth/reset-password', resetPassword);

// ==========================================
// 🔒 Protected Authenticated Routes
// ==========================================
router.get('/auth/me', verifyToken, getMe);
router.post('/auth/change-password', verifyToken, changePassword);

// ==========================================
// 🛡️ Device Tracking & Remote Logout (Admin)
// ==========================================
router.get('/auth/sessions', verifyToken, getAllSessions);
router.delete('/auth/sessions/:id', verifyToken, revokeSession);
router.delete('/auth/users/:userId/sessions', verifyToken, revokeUserSessions);

export default router;
