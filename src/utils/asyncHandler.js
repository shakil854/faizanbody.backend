/**
 * Wrapper to catch asynchronous errors in Express routes
 * Avoids repetitive try-catch blocks in controllers
 */
export const asyncHandler = (requestHandler) => {
  return (req, res, next) => {
    Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err));
  };
};
