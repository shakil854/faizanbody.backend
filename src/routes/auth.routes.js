import { Router } from 'express';
import {
  login,
  getMe,
  forgotPassword,
  verifyOtp,
  resetPassword,
  changePassword,
} from '../controllers/auth.controller.js';
import { verifyToken } from '../middlewares/auth.middleware.js';

const router = Router();

// ==========================================
// 🔓 Public Authentication Routes
// ==========================================
router.post('/auth/login', login);
router.post('/auth/forgot-password', forgotPassword);
router.post('/auth/verify-otp', verifyOtp);
router.post('/auth/reset-password', resetPassword);

// ==========================================
// 🔒 Protected Authenticated Routes
// ==========================================
router.get('/auth/me', verifyToken, getMe);
router.post('/auth/change-password', verifyToken, changePassword);

export default router;
