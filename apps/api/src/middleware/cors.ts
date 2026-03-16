import { Request, Response, NextFunction } from 'express';

interface CORSOptions {
  origin?: string | string[] | boolean | ((origin: string | undefined) => boolean);
  credentials?: boolean;
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  maxAge?: number;
  preflightContinue?: boolean;
  optionsSuccessStatus?: number;
}

/**
 * Custom CORS middleware with enhanced configuration
 */
export function createCORSMiddleware(options: CORSOptions = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    // Handle origin
    if (options.origin !== false) {
      let allowedOrigin = '';

      if (typeof options.origin === 'boolean' && options.origin) {
        allowedOrigin = '*';
      } else if (typeof options.origin === 'string') {
        allowedOrigin = options.origin;
      } else if (Array.isArray(options.origin)) {
        if (origin && options.origin.includes(origin)) {
          allowedOrigin = origin;
        }
      } else if (typeof options.origin === 'function') {
        if (options.origin(origin)) {
          allowedOrigin = origin || '*';
        }
      } else {
        // Default behavior - allow same origin
        allowedOrigin = origin || '*';
      }

      if (allowedOrigin) {
        res.header('Access-Control-Allow-Origin', allowedOrigin);
      }
    }

    // Handle credentials
    if (options.credentials) {
      res.header('Access-Control-Allow-Credentials', 'true');
    }

    // Handle methods
    const methods = options.methods || ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];
    res.header('Access-Control-Allow-Methods', methods.join(', '));

    // Handle allowed headers
    const allowedHeaders = options.allowedHeaders || [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-API-Key',
      'X-Request-ID'
    ];
    res.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));

    // Handle exposed headers
    if (options.exposedHeaders) {
      res.header('Access-Control-Expose-Headers', options.exposedHeaders.join(', '));
    }

    // Handle max age for preflight requests
    if (options.maxAge) {
      res.header('Access-Control-Max-Age', options.maxAge.toString());
    }

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      const successStatus = options.optionsSuccessStatus || 204;
      res.status(successStatus);

      if (!options.preflightContinue) {
        res.end();
        return;
      }
    }

    next();
  };
}

/**
 * Development CORS configuration
 * Allows all origins for development
 */
export const developmentCORS = createCORSMiddleware({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key',
    'X-Request-ID',
    'X-Forwarded-For',
    'User-Agent'
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-ID'
  ],
  maxAge: 86400 // 24 hours
});

/**
 * Production CORS configuration
 * Restrictive settings for production
 */
export const productionCORS = createCORSMiddleware({
  origin: (origin) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return true;

    // List of allowed origins for production
    const allowedOrigins = [
      'https://dashboard.gymiq.ai',
      'https://app.gymiq.ai',
      'https://gymiq.ai',
      'https://www.gymiq.ai'
    ];

    return allowedOrigins.includes(origin);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key'
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset'
  ],
  maxAge: 3600 // 1 hour
});

/**
 * Dashboard-specific CORS configuration
 * Configured for the Next.js dashboard
 */
export const dashboardCORS = createCORSMiddleware({
  origin: (origin) => {
    // Allow requests with no origin (for development)
    if (!origin) return true;

    // Dashboard origins
    const dashboardOrigins = [
      'http://localhost:3000',  // Next.js dev server
      'http://127.0.0.1:3000',
      'https://dashboard.gymiq.ai',
      'https://app.gymiq.ai'
    ];

    return dashboardOrigins.includes(origin);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-API-Key'
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Total-Count',
    'X-Page-Count'
  ],
  maxAge: 7200 // 2 hours
});

/**
 * Webhook CORS configuration
 * For external webhook endpoints
 */
export const webhookCORS = createCORSMiddleware({
  origin: false, // Disable CORS for webhooks
  credentials: false,
  methods: ['POST'],
  maxAge: 0
});

/**
 * API-specific CORS configuration
 * For general API endpoints
 */
export const apiCORS = createCORSMiddleware({
  origin: (origin) => {
    // Allow requests with no origin
    if (!origin) return true;

    // Check if origin is from a trusted domain
    const trustedDomains = [
      'localhost',
      '127.0.0.1',
      'gymiq.ai',
      'app.gymiq.ai',
      'dashboard.gymiq.ai'
    ];

    return trustedDomains.some(domain => {
      return origin.includes(domain);
    });
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key'
  ],
  maxAge: 3600
});

/**
 * Get appropriate CORS configuration based on environment
 */
export function getCORSForEnvironment(): ReturnType<typeof createCORSMiddleware> {
  const env = process.env.NODE_ENV;

  switch (env) {
    case 'production':
      return productionCORS;
    case 'development':
    default:
      return developmentCORS;
  }
}