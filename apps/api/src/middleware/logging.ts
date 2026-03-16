import { Request, Response, NextFunction } from 'express';

interface LogRequest extends Request {
  startTime?: number;
}

/**
 * Request logging middleware
 * Logs HTTP method, path, status code, response time, and IP address
 */
export function requestLogging(req: LogRequest, res: Response, next: NextFunction) {
  // Record start time
  req.startTime = Date.now();

  // Get client IP (handles proxy scenarios)
  const clientIP = req.ip ||
                   req.connection.remoteAddress ||
                   req.headers['x-forwarded-for']?.toString().split(',')[0] ||
                   'unknown';

  // Override res.end to capture when response is sent
  const originalEnd = res.end.bind(res);
  res.end = function(chunk?: any, encoding?: any, cb?: any) {
    // Calculate duration
    const duration = req.startTime ? Date.now() - req.startTime : 0;

    // Log format: [timestamp] method path status duration_ms client_ip
    const logLine = [
      `[${new Date().toISOString()}]`,
      req.method,
      req.originalUrl || req.url,
      res.statusCode,
      `${duration}ms`,
      clientIP,
      req.headers['user-agent'] ? `"${req.headers['user-agent']}"` : '"-"'
    ].join(' ');

    // Use different log levels based on status code
    if (res.statusCode >= 500) {
      console.error(`❌ ${logLine}`);
    } else if (res.statusCode >= 400) {
      console.warn(`⚠️  ${logLine}`);
    } else {
      console.log(`✅ ${logLine}`);
    }

    // Call original end method
    return originalEnd(chunk, encoding, cb);
  };

  next();
}

/**
 * More detailed logging middleware for development
 */
export function detailedLogging(req: LogRequest, res: Response, next: NextFunction) {
  const startTime = Date.now();

  // Log request details
  console.log(`\n🔵 [${new Date().toISOString()}] ${req.method} ${req.originalUrl || req.url}`);

  if (Object.keys(req.query).length > 0) {
    console.log('   Query params:', req.query);
  }

  if (req.body && Object.keys(req.body).length > 0) {
    // Avoid logging sensitive data
    const sanitizedBody = { ...req.body };
    ['password', 'token', 'secret', 'apiKey'].forEach(key => {
      if (sanitizedBody[key]) {
        sanitizedBody[key] = '[REDACTED]';
      }
    });
    console.log('   Request body:', JSON.stringify(sanitizedBody, null, 2));
  }

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(body: any) {
    const duration = Date.now() - startTime;

    console.log(`🔴 [${new Date().toISOString()}] Response ${res.statusCode} (${duration}ms)`);

    if (res.statusCode >= 400) {
      console.log('   Response body:', JSON.stringify(body, null, 2));
    }

    return originalJson.call(this, body);
  };

  next();
}

/**
 * API performance monitoring middleware
 */
export function performanceMonitoring(req: LogRequest, res: Response, next: NextFunction) {
  req.startTime = Date.now();

  res.on('finish', () => {
    const duration = req.startTime ? Date.now() - req.startTime : 0;

    // Log slow requests (>1000ms)
    if (duration > 1000) {
      console.warn(`🐌 Slow request: ${req.method} ${req.originalUrl} took ${duration}ms`);
    }

    // Log large responses (>1MB)
    const contentLength = res.get('content-length');
    if (contentLength && parseInt(contentLength) > 1024 * 1024) {
      console.warn(`📦 Large response: ${req.method} ${req.originalUrl} returned ${Math.round(parseInt(contentLength) / 1024)}KB`);
    }
  });

  next();
}