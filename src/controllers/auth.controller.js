import { authService } from '../services/auth.service.js';
import * as sessionService from '../services/session.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const login = asyncHandler(async (req, res) => {
  const { identifier, email, mobile, password } = req.body;
  const loginId = identifier || email || mobile;

  if (!loginId || !password) {
    throw ApiError.badRequest('Email or mobile number and password are required');
  }

  const result = await authService.login({ identifier: loginId, password, req });
  return ApiResponse.success(res, result, result.message || 'Login processed');
});

export const verifyLoginOtp = asyncHandler(async (req, res) => {
  const { userId, otp } = req.body;

  if (!userId || !otp) {
    throw ApiError.badRequest('User ID and 6-digit OTP code are required');
  }

  const result = await authService.verifyLoginOtp({ userId, otp, req });
  return ApiResponse.success(res, result, result.message || 'Login verified successfully');
});

export const resendLoginOtp = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    throw ApiError.badRequest('User ID is required');
  }

  const result = await authService.resendLoginOtp({ userId });
  return ApiResponse.success(res, result, result.message || 'OTP resent successfully');
});

export const getAllSessions = asyncHandler(async (req, res) => {
  const sessions = await sessionService.getAllSessions();
  return ApiResponse.success(res, sessions, 'Active sessions retrieved successfully');
});

export const revokeSession = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id) {
    throw ApiError.badRequest('Session ID is required');
  }

  await sessionService.revokeSession(id);
  return ApiResponse.success(res, { id: Number(id) }, 'Device session successfully logged out');
});

export const revokeUserSessions = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    throw ApiError.badRequest('User ID is required');
  }

  const count = await sessionService.revokeAllUserSessions(userId);
  return ApiResponse.success(res, { count }, 'All sessions for this user logged out');
});

export const getMe = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user.id);
  return ApiResponse.success(res, user, 'User profile retrieved');
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { identifier, email, mobile } = req.body;
  const resetId = identifier || email || mobile;

  if (!resetId) {
    throw ApiError.badRequest('Please enter your registered email or mobile number');
  }

  const result = await authService.forgotPassword(resetId);
  return ApiResponse.success(res, result, result.message);
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const { identifier, email, otp } = req.body;
  const inputId = identifier || email;

  if (!inputId || !otp) {
    throw ApiError.badRequest('Email or mobile and OTP are required');
  }

  const result = await authService.verifyOtp({ identifier: inputId, otp });
  return ApiResponse.success(res, result, result.message);
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { identifier, email, otp, newPassword } = req.body;
  const inputId = identifier || email;

  if (!inputId || !otp || !newPassword) {
    throw ApiError.badRequest('Email/mobile, OTP, and new password are required');
  }

  const result = await authService.resetPassword({ identifier: inputId, otp, newPassword });
  return ApiResponse.success(res, result, result.message);
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword) {
    throw ApiError.badRequest('Current (old) password is required');
  }
  if (!newPassword) {
    throw ApiError.badRequest('New password is required');
  }

  const result = await authService.changePassword({
    userId: req.user.id,
    currentPassword,
    newPassword,
  });

  return ApiResponse.success(res, result, result.message);
});
