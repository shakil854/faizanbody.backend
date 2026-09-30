import { ApiResponse } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { config } from '../config/env.js';

export const getHealthStatus = asyncHandler(async (req, res) => {
  const healthData = {
    status: 'online',
    uptime: `${Math.floor(process.uptime())}s`,
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
    service: 'FaizanBody Backend API',
  };

  return ApiResponse.success(res, healthData, 'Server is running smoothly');
});
