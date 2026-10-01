import { authService } from '../services/auth.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const login = asyncHandler(async (req, res) => {
  const { identifier, email, mobile, password } = req.body;
  const loginId = identifier || email || mobile;

  if (!loginId || !password) {
    throw ApiError.badRequest('Email or mobile number and password are required');
  }

  const result = await authService.login({ identifier: loginId, password });
  return ApiResponse.success(res, result, 'Login successful');
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
