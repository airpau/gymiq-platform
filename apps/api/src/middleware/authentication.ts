import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@gymiq/database';
import { UnauthorizedError, ForbiddenError } from './errorHandler';

// Extend Express Request type to include user and session
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        gymId: string;
        firstName?: string;
        lastName?: string;
      };
      session?: {
        id: string;
        expiresAt: Date;
      };
    }
  }
}

interface JWTPayload {
  userId: string;
  sessionId: string;
  gymId: string;
  role: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'gymiq-development-secret-change-in-production';
const prisma = new PrismaClient();

/**
 * Extracts JWT token from cookies or Authorization header
 */
function extractToken(req: Request): string | null {
  // Try cookie first (httpOnly cookie is more secure)
  if (req.cookies?.token) {
    return req.cookies.token;
  }

  // Fallback to Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

/**
 * Verifies JWT token and returns payload
 */
function verifyToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid authentication token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Authentication token has expired');
    }
    throw new UnauthorizedError('Authentication failed');
  }
}

/**
 * Main authentication middleware
 * Verifies JWT and attaches user/session to request
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);

  if (!token) {
    return next(new UnauthorizedError('Authentication token required'));
  }

  try {
    const payload = verifyToken(token);

    // Verify session is still valid in database
    prisma.session.findFirst({
      where: {
        id: payload.sessionId,
        token,
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            gymId: true,
            firstName: true,
            lastName: true,
            isActive: true
          }
        }
      }
    }).then(session => {
      if (!session) {
        return next(new UnauthorizedError('Session expired or invalid'));
      }

      if (!session.user.isActive) {
        return next(new UnauthorizedError('Account has been deactivated'));
      }

      // Attach user and session to request
      req.user = {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
        gymId: session.user.gymId,
        firstName: session.user.firstName || undefined,
        lastName: session.user.lastName || undefined
      };

      req.session = {
        id: session.id,
        expiresAt: session.expiresAt
      };

      next();
    }).catch(error => {
      console.error('Authentication database error:', error);
      next(new UnauthorizedError('Authentication failed'));
    });

  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to require specific roles
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError(`Access denied. Required role: ${allowedRoles.join(' or ')}`));
    }

    next();
  };
}

/**
 * Middleware to require gym ownership or super admin
 */
export function requireGymAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  // Super admins can access any gym
  if (req.user.role === 'SUPER_ADMIN') {
    return next();
  }

  // Extract gymId from query, params, or body
  const requestedGymId = req.query.gymId || req.params.gymId || req.body.gymId;

  if (!requestedGymId) {
    return next(new ForbiddenError('Gym ID required'));
  }

  // Users can only access their own gym
  if (req.user.gymId !== requestedGymId) {
    return next(new ForbiddenError('Access denied to this gym'));
  }

  next();
}

/**
 * Middleware for optional authentication
 * Sets user if token is provided but doesn't require it
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);

  if (!token) {
    return next();
  }

  try {
    const payload = verifyToken(token);

    prisma.session.findFirst({
      where: {
        id: payload.sessionId,
        token,
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            gymId: true,
            firstName: true,
            lastName: true,
            isActive: true
          }
        }
      }
    }).then(session => {
      if (session && session.user.isActive) {
        req.user = {
          id: session.user.id,
          email: session.user.email,
          role: session.user.role,
          gymId: session.user.gymId,
          firstName: session.user.firstName || undefined,
          lastName: session.user.lastName || undefined
        };

        req.session = {
          id: session.id,
          expiresAt: session.expiresAt
        };
      }

      next();
    }).catch(error => {
      console.warn('Optional authentication error (continuing):', error);
      next();
    });

  } catch (error) {
    // For optional auth, log error but continue without authentication
    console.warn('Optional authentication token error (continuing):', error);
    next();
  }
}

/**
 * Utility function to create JWT token
 */
export function createToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '7d', // 7 day expiry as specified in requirements
    issuer: 'gymiq-api',
    audience: 'gymiq-dashboard'
  });
}

/**
 * Rate limiting for authentication endpoints
 */
export const authRateLimit = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window as specified in requirements
  message: {
    success: false,
    error: 'Too many authentication attempts. Try again in 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
};