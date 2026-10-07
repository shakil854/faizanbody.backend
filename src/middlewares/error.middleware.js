import { config } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Global centralized error handling middleware
 */
export const errorHandler = (err, req, res, next) => {
  let error = err;

  // If error is not an instance of ApiError, normalize it
  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || error.status || 500;
    const message = error.message || 'Internal Server Error';
    error = new ApiError(statusCode, message, error?.errors || [], error.stack);
  }

  const response = {
    success: false,
    statusCode: error.statusCode,
    message: error.message,
    errors: error.errors,
    ...(config.nodeEnv === 'development' && { stack: error.stack }),
  };

  return res.status(error.statusCode).json(response);
};
