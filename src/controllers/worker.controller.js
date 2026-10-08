import { workerService } from '../services/worker.service.js';
import { r2Service } from '../services/r2.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getWorkers = asyncHandler(async (req, res) => {
  const { search = '', status = 'all' } = req.query;
  const workers = await workerService.getAllWorkers({ search, status });
  return ApiResponse.success(res, workers, 'Workers fetched successfully');
});

export const getWorkerById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const worker = await workerService.getWorkerById(id);
  if (!worker) {
    throw ApiError.notFound('Worker not found');
  }
  return ApiResponse.success(res, worker, 'Worker details retrieved');
});

export const createWorker = asyncHandler(async (req, res) => {
  const { name, mobile, mobile_no, aadhar_card, aadhar_photo, coming_date, going_date } = req.body;

  if (!name || !name.trim()) {
    throw ApiError.badRequest('Worker name is required (नाम आवश्यक है)');
  }
  if (!coming_date) {
    throw ApiError.badRequest('Coming date is required (आने की तारीख आवश्यक है)');
  }

  const finalMobile = mobile !== undefined ? mobile : (mobile_no || '');
  const finalAadhar = aadhar_card !== undefined ? aadhar_card : (aadhar_photo || null);

  const newWorker = await workerService.createWorker({
    name,
    mobile: finalMobile,
    aadhar_card: finalAadhar,
    coming_date,
    going_date: going_date || null,
  });

  return ApiResponse.created(res, newWorker, 'Worker created successfully');
});

export const updateWorker = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, mobile, mobile_no, aadhar_card, aadhar_photo, coming_date, going_date } = req.body;

  if (!name || !name.trim()) {
    throw ApiError.badRequest('Worker name is required');
  }
  if (!coming_date) {
    throw ApiError.badRequest('Coming date is required');
  }

  const finalMobile = mobile !== undefined ? mobile : (mobile_no !== undefined ? mobile_no : '');
  const finalAadhar = aadhar_card !== undefined ? aadhar_card : (aadhar_photo !== undefined ? aadhar_photo : null);

  const updated = await workerService.updateWorker(id, {
    name,
    mobile: finalMobile,
    aadhar_card: finalAadhar,
    coming_date,
    going_date: going_date || null,
  });

  if (!updated) {
    throw ApiError.notFound('Worker not found');
  }

  return ApiResponse.success(res, updated, 'Worker updated successfully');
});

/**
 * Upload single Aadhar card photo (via camera click or gallery file)
 */
export const uploadAadharPhoto = asyncHandler(async (req, res) => {
  const file = req.file || (req.files && req.files[0]);

  if (!file) {
    throw ApiError.badRequest('Please select or capture an Aadhar card photo');
  }

  const workerId = req.body.workerId || 'temp';
  const uploaded = await r2Service.uploadWorkerAadhar({
    buffer: file.buffer,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    workerId,
  });

  return ApiResponse.success(res, uploaded, 'Aadhar card photo uploaded successfully');
});

export const deleteWorker = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deleted = await workerService.deleteWorker(id);
  if (!deleted) {
    throw ApiError.notFound('Worker not found or already deleted');
  }
  return ApiResponse.success(res, { id: Number(id) }, 'Worker deleted successfully');
});

/**
 * Get all Khata transactions & summary for a worker
 */
export const getWorkerTransactions = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const data = await workerService.getWorkerTransactions(id);
  return ApiResponse.success(res, data, 'Worker transactions retrieved successfully');
});

/**
 * Add a new Khata entry (upad, payment, salary) for a worker
 */
export const addWorkerTransaction = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { type, amount, date, notes, payment_mode } = req.body;

  if (!type || !['upad', 'payment', 'salary'].includes(type)) {
    throw ApiError.badRequest('Valid transaction type is required (upad, payment, or salary)');
  }

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw ApiError.badRequest('Amount must be a positive number (रुपये आवश्यक है)');
  }

  const createdTx = await workerService.addWorkerTransaction(id, {
    type,
    amount: numAmount,
    date,
    notes,
    payment_mode,
  });

  // Also fetch fresh summary
  const freshData = await workerService.getWorkerTransactions(id);

  return ApiResponse.created(res, {
    transaction: createdTx,
    summary: freshData.summary,
  }, 'Transaction recorded successfully');
});

/**
 * Delete a specific Khata transaction entry
 */
export const deleteWorkerTransaction = asyncHandler(async (req, res) => {
  const { id, transactionId } = req.params;
  const deleted = await workerService.deleteWorkerTransaction(transactionId);
  if (!deleted) {
    throw ApiError.notFound('Transaction not found or already deleted');
  }

  const freshData = await workerService.getWorkerTransactions(id);
  return ApiResponse.success(res, { summary: freshData.summary }, 'Transaction deleted successfully');
});

/**
 * Get workshop-wide Khata overall summary
 */
export const getWorkshopKhataSummary = asyncHandler(async (req, res) => {
  const summary = await workerService.getWorkshopKhataSummary();
  return ApiResponse.success(res, summary, 'Workshop Khata summary retrieved');
});


