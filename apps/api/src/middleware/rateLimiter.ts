import { Request, Response, NextFunction } from 'express';
import { RateLimitError } from './errorHandler';

interface RateLimitRule {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

interface ClientRecord {
  count: number;
  resetTime: number;
  firstRequest: number;
}

/**
 * Simple in-memory rate limiter
 * For production, consider using Redis or similar
 */
class MemoryRateLimiter {
  private clients = new Map<string, ClientRecord>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.clients.entries()) {
      if (record.resetTime < now) {
        this.clients.delete(key);
      }
    }
  }

  private getClientKey(req: Request): string {
    // Use IP address as the primary identifier
    const ip = req.ip ||
               req.connection.remoteAddress ||
               req.headers['x-forwarded-for']?.toString().split(',')[0] ||
               'unknown';

    // Include user agent for better identification (but keep it short)
    const userAgent = req.get('User-Agent')?.substring(0, 50) || 'unknown';

    return `${ip}:${Buffer.from(userAgent).toString('base64').substring(0, 20)}`;
  }

  check(req: Request, rule: RateLimitRule): { allowed: boolean; record: ClientRecord } {
    const clientKey = this.getClientKey(req);
    const now = Date.now();

    let record = this.clients.get(clientKey);

    // Initialize or reset if window expired
    if (!record || record.resetTime < now) {
      record = {
        count: 0,
        resetTime: now + rule.windowMs,
        firstRequest: now
      };
    }

    // Increment count
    record.count++;
    this.clients.set(clientKey, record);

    return {
      allowed: record.count <= rule.maxRequests,
      record
    };
  }

  getStats(req: Request): ClientRecord | null {
    const clientKey = this.getClientKey(req);
    return this.clients.get(clientKey) || null;
  }

  reset(req: Request): void {
    const clientKey = this.getClientKey(req);
    this.clients.delete(clientKey);
  }

  size(): number {
    return this.clients.size;
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.clients.clear();
  }
}

// Global rate limiter instance
const globalLimiter = new MemoryRateLimiter();

/**
 * Create rate limiting middleware
 */
export function createRateLimiter(rule: RateLimitRule) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { allowed, record } = globalLimiter.check(req, rule);

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': rule.maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, rule.maxRequests - record.count).toString(),
        'X-RateLimit-Reset': Math.ceil(record.resetTime / 1000).toString(),
        'X-RateLimit-Window': Math.ceil(rule.windowMs / 1000).toString()
      });

      if (!allowed) {
        res.set('Retry-After', Math.ceil((record.resetTime - Date.now()) / 1000).toString());

        const message = rule.message ||
          `Too many requests. Limit: ${rule.maxRequests} requests per ${Math.ceil(rule.windowMs / 1000)} seconds`;

        throw new RateLimitError(message);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Pre-configured rate limiters
 */

// General API rate limiter (100 requests per minute)
export const generalRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  message: 'Too many requests from this IP, please try again in a minute'
});

// Strict rate limiter for sensitive endpoints (10 requests per minute)
export const strictRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  message: 'Too many requests to this endpoint, please try again in a minute'
});

// Auth rate limiter (5 login attempts per 15 minutes)
export const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  message: 'Too many authentication attempts, please try again in 15 minutes'
});

// Upload rate limiter (5 uploads per 5 minutes)
export const uploadRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 5,
  message: 'Too many upload attempts, please try again in a few minutes'
});

/**
 * Rate limiter status endpoint middleware
 * Provides information about current rate limit status
 */
export function rateLimiterStatus(req: Request, res: Response, next: NextFunction) {
  const stats = globalLimiter.getStats(req);

  if (stats) {
    res.set({
      'X-RateLimit-Status-Count': stats.count.toString(),
      'X-RateLimit-Status-FirstRequest': stats.firstRequest.toString(),
      'X-RateLimit-Status-Reset': stats.resetTime.toString()
    });
  }

  // Add global limiter stats
  res.set('X-RateLimit-Global-Clients', globalLimiter.size().toString());

  next();
}

/**
 * Graceful shutdown
 */
export function shutdownRateLimiter(): void {
  globalLimiter.destroy();
}