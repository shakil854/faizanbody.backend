import { upiRojmedService } from '../services/upiRojmed.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getDailyUpiRojmed = asyncHandler(async (req, res) => {
  const { date } = req.query;
  const sheet = await upiRojmedService.getDailyUpiSheet(date);
  return ApiResponse.success(res, sheet, 'Daily UPI Rojmed retrieved successfully');
});

export const getUpiRojmedOptions = asyncHandler(async (req, res) => {
  const options = await upiRojmedService.getUpiOptions();
  return ApiResponse.success(res, options, 'UPI Rojmed account options retrieved');
});

export const getUpiAccounts = asyncHandler(async (req, res) => {
  const accounts = await upiRojmedService.getUpiAccounts();
  return ApiResponse.success(res, accounts, 'UPI accounts retrieved');
});

export const createUpiAccount = asyncHandler(async (req, res) => {
  try {
    const account = await upiRojmedService.createUpiAccount(req.body || {});
    return ApiResponse.created(res, account, 'UPI account created successfully');
  } catch (err) {
    throw ApiError.badRequest(err.message);
  }
});

export const updateUpiAccount = asyncHandler(async (req, res) => {
  try {
    const account = await upiRojmedService.updateUpiAccount(req.params.id, req.body || {});
    if (!account) throw ApiError.notFound('UPI account not found');
    return ApiResponse.success(res, account, 'UPI account updated successfully');
  } catch (err) {
    throw ApiError.badRequest(err.message);
  }
});

export const deleteUpiAccount = asyncHandler(async (req, res) => {
  try {
    const result = await upiRojmedService.deleteUpiAccount(req.params.id);
    return ApiResponse.success(res, result, 'UPI account deleted successfully');
  } catch (err) {
    throw ApiError.badRequest(err.message);
  }
});

export const createUpiRojmedEntry = asyncHandler(async (req, res) => {
  try {
    const result = await upiRojmedService.createUpiTransaction(req.body || {}, req.user?.id || null);
    return ApiResponse.created(res, result, 'UPI entry saved successfully');
  } catch (err) {
    throw ApiError.badRequest(err.message);
  }
});

export const deleteUpiRojmedEntry = asyncHandler(async (req, res) => {
  const result = await upiRojmedService.deleteUpiTransaction(req.params.id);
  if (!result) throw ApiError.notFound('UPI transaction not found');
  return ApiResponse.success(res, result, 'UPI entry deleted successfully');
});
