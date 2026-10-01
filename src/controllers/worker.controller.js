import { workerService } from '../services/worker.service.js';
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
  const { name, coming_date, going_date } = req.body;

  if (!name || !name.trim()) {
    throw ApiError.badRequest('Worker name is required (नाम आवश्यक है)');
  }
  if (!coming_date) {
    throw ApiError.badRequest('Coming date is required (आने की तारीख आवश्यक है)');
  }

  const newWorker = await workerService.createWorker({
    name,
    coming_date,
    going_date: going_date || null,
  });

  return ApiResponse.created(res, newWorker, 'Worker created successfully');
});

export const updateWorker = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, coming_date, going_date } = req.body;

  if (!name || !name.trim()) {
    throw ApiError.badRequest('Worker name is required');
  }
  if (!coming_date) {
    throw ApiError.badRequest('Coming date is required');
  }

  const updated = await workerService.updateWorker(id, {
    name,
    coming_date,
    going_date: going_date || null,
  });

  if (!updated) {
    throw ApiError.notFound('Worker not found');
  }

  return ApiResponse.success(res, updated, 'Worker updated successfully');
});

export const deleteWorker = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deleted = await workerService.deleteWorker(id);
  if (!deleted) {
    throw ApiError.notFound('Worker not found or already deleted');
  }
  return ApiResponse.success(res, { id: Number(id) }, 'Worker deleted successfully');
});
