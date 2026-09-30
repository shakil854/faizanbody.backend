import { ApiError } from '../utils/apiError.js';

/**
 * 404 Route Not Found Middleware
 */
export const notFound = (req, res, next) => {
  next(ApiError.notFound(`Endpoint not found: ${req.method} ${req.originalUrl}`));
};
