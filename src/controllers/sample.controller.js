import { sampleService } from '../services/sample.service.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getWelcome = asyncHandler(async (req, res) => {
  const data = await sampleService.getWelcomeMessage();
  return ApiResponse.success(res, data, 'API operational overview retrieved');
});

export const getItems = asyncHandler(async (req, res) => {
  const items = await sampleService.getSampleItems();
  return ApiResponse.success(res, items, 'Sample items retrieved successfully');
});
