import { Request, Response, NextFunction } from 'express';

interface APIError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}

/**
 * Standard error response format
 */
interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: any;
  requestId?: string;
  timestamp: string;
}

/**
 * Generate a simple request ID for error tracking
 */
function generateRequestId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Create standardized error response
 */
function createErrorResponse(error: APIError, requestId: string): ErrorResponse {
  const response: ErrorResponse = {
    success: false,
    error: error.message || 'An unexpected error occurred',
    requestId,
    timestamp: new Date().toISOString()
  };

  // Add error code if available
  if (error.code) {
    response.code = error.code;
  }

  // Add details in development mode only
  if (process.env.NODE_ENV === 'development' && error.stack) {
    response.details = {
      stack: error.stack,
      name: error.name
    };
  }

  return response;
}

/**
 * Determine HTTP status code from error
 */
function getStatusCode(error: APIError): number {
  // If status code is explicitly set
  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 600) {
    return error.statusCode;
  }

  // Handle specific error types
  if (error.name === 'ValidationError') return 400;
  if (error.name === 'UnauthorizedError') return 401;
  if (error.name === 'ForbiddenError') return 403;
  if (error.name === 'NotFoundError') return 404;
  if (error.name === 'ConflictError') return 409;
  if (error.name === 'RateLimitError') return 429;

  // Handle database errors
  if (error.name === 'PrismaClientValidationError') return 400;
  if (error.name === 'PrismaClientKnownRequestError') {
    const prismaError = error as any;
    if (prismaError.code === 'P2002') return 409; // Unique constraint violation
    if (prismaError.code === 'P2025') return 404; // Record not found
    return 400;
  }

  // Default to 500 for unknown errors
  return 500;
}

/**
 * Determine if error should be logged at ERROR level
 */
function shouldLogAsError(statusCode: number): boolean {
  return statusCode >= 500;
}

/**
 * Global error handling middleware
 * Must be registered last in middleware chain
 */
export function globalErrorHandler(
  error: APIError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const requestId = generateRequestId();
  const statusCode = getStatusCode(error);
  const errorResponse = createErrorResponse(error, requestId);

  // Log the error with appropriate level
  const logPrefix = shouldLogAsError(statusCode) ? '❌ ERROR' : '⚠️  WARN';
  const logMessage = `${logPrefix} [${requestId}] ${req.method} ${req.originalUrl} - ${error.message}`;

  if (shouldLogAsError(statusCode)) {
    console.error(logMessage);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  } else {
    console.warn(logMessage);
  }

  // Log request context for server errors
  if (statusCode >= 500) {
    console.error('Request context:', {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      query: req.query,
      body: req.body,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * Async error wrapper
 * Wraps async route handlers to catch and forward errors
 */
export function asyncHandler<T = any>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 Not Found handler
 * Should be registered after all routes
 */
export function notFoundHandler(req: Request, res: Response, next: NextFunction) {
  const error: APIError = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  error.code = 'ROUTE_NOT_FOUND';
  next(error);
}

/**
 * Custom error classes for better error handling
 */
export class ValidationError extends Error {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  isOperational = true;

  constructor(message: string, details?: any) {
    super(message);
    this.name = 'ValidationError';
    if (details) {
      (this as any).details = details;
    }
  }
}

export class NotFoundError extends Error {
  statusCode = 404;
  code = 'NOT_FOUND';
  isOperational = true;

  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends Error {
  statusCode = 401;
  code = 'UNAUTHORIZED';
  isOperational = true;

  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  statusCode = 403;
  code = 'FORBIDDEN';
  isOperational = true;

  constructor(message: string = 'Access denied') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends Error {
  statusCode = 409;
  code = 'CONFLICT';
  isOperational = true;

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends Error {
  statusCode = 429;
  code = 'RATE_LIMIT_EXCEEDED';
  isOperational = true;

  constructor(message: string = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}