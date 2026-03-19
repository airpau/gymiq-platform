// Logging middleware
export {
  requestLogging,
  detailedLogging,
  performanceMonitoring
} from './logging';

// Error handling middleware
export {
  globalErrorHandler,
  asyncHandler,
  notFoundHandler,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError
} from './errorHandler';

// Rate limiting middleware
export {
  createRateLimiter,
  generalRateLimit,
  strictRateLimit,
  uploadRateLimit,
  rateLimiterStatus,
  shutdownRateLimiter
} from './rateLimiter';

// CORS middleware
export {
  createCORSMiddleware,
  developmentCORS,
  productionCORS,
  dashboardCORS,
  webhookCORS,
  apiCORS,
  getCORSForEnvironment
} from './cors';

// Authentication middleware
export {
  authenticate,
  requireRole,
  requireGymAccess,
  optionalAuth,
  createToken,
  authRateLimit
} from './authentication';