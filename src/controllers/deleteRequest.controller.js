import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { deleteRequestService } from '../services/deleteRequest.service.js';

export const createDeleteRequest = asyncHandler(async (req, res) => {
  const created = await deleteRequestService.createRequest(req.body || {}, req.user);
  return ApiResponse.created(res, created, 'Delete request submitted to admin');
});

export const listDeleteRequests = asyncHandler(async (req, res) => {
  const { status, module } = req.query || {};
  const list = await deleteRequestService.listRequests({ status, module }, req.user);
  return ApiResponse.success(res, list, 'Delete requests fetched successfully');
});

export const getPendingDeleteRequestCount = asyncHandler(async (req, res) => {
  const count = await deleteRequestService.getPendingCount(req.user);
  return ApiResponse.success(res, { count }, 'Pending delete request count fetched');
});

export const getPendingDeleteRequestKeys = asyncHandler(async (req, res) => {
  const keys = await deleteRequestService.getPendingKeys();
  return ApiResponse.success(res, keys, 'Pending delete request keys fetched');
});

export const approveDeleteRequest = asyncHandler(async (req, res) => {
  const { reviewNote } = req.body || {};
  const updated = await deleteRequestService.approveRequest(req.params.id, req.user, reviewNote);
  return ApiResponse.success(res, updated, 'Delete request approved and record deleted');
});

export const rejectDeleteRequest = asyncHandler(async (req, res) => {
  const { reviewNote } = req.body || {};
  const updated = await deleteRequestService.rejectRequest(req.params.id, req.user, reviewNote);
  return ApiResponse.success(res, updated, 'Delete request rejected');
});

