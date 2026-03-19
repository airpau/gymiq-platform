import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/services';
import {
  asyncHandler,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  ConflictError
} from '../middleware/errorHandler';
import {
  authenticate,
  createToken,
  authRateLimit
} from '../middleware/authentication';
import rateLimit from 'express-rate-limit';

export const authRouter = Router();

// Rate limiter for auth endpoints
const authLimiter = rateLimit(authRateLimit);

// Validation schemas
const RegisterSchema = z.object({
  gymName: z.string().min(1, 'Gym name is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phone: z.string().optional()
});

const LoginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required')
});

const ForgotPasswordSchema = z.object({
  email: z.string().email('Valid email is required')
});

const ResetPasswordSchema = z.object({
  token: z.string().uuid('Valid reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

/**
 * POST /auth/register
 * Create gym + owner account (onboarding flow)
 */
authRouter.post('/register', authLimiter, asyncHandler(async (req: Request, res: Response) => {
  const data = RegisterSchema.parse(req.body);

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email }
  });

  if (existingUser) {
    throw new ConflictError('An account with this email already exists');
  }

  // Create gym slug from name
  const gymSlug = data.gymName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Check if gym slug is taken
  const existingGym = await prisma.gym.findUnique({
    where: { slug: gymSlug }
  });

  if (existingGym) {
    // Add random suffix if slug is taken
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    var finalSlug = `${gymSlug}-${randomSuffix}`;
  } else {
    var finalSlug = gymSlug;
  }

  // Hash password
  const passwordHash = await bcrypt.hash(data.password, 12);

  // Create gym and user in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create gym
    const gym = await tx.gym.create({
      data: {
        name: data.gymName,
        slug: finalSlug,
        settings: {},
        knowledgeBase: {}
      }
    });

    // Create owner user
    const user = await tx.user.create({
      data: {
        email: data.email,
        passwordHash,
        role: 'GYM_OWNER',
        gymId: gym.id,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone
      }
    });

    return { gym, user };
  });

  // Create session
  const sessionToken = uuidv4();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const session = await prisma.session.create({
    data: {
      id: uuidv4(),
      userId: result.user.id,
      token: sessionToken,
      expiresAt,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    }
  });

  // Create JWT token
  const jwt = createToken({
    userId: result.user.id,
    sessionId: session.id,
    gymId: result.gym.id,
    role: result.user.role
  });

  // Set httpOnly cookie (secure in production)
  res.cookie('token', jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  res.status(201).json({
    success: true,
    data: {
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role
      },
      gym: {
        id: result.gym.id,
        name: result.gym.name,
        slug: result.gym.slug
      },
      token: jwt // Also return in response for frontend compatibility
    }
  });
}));

/**
 * POST /auth/login
 * Email/password login, return JWT
 */
authRouter.post('/login', authLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = LoginSchema.parse(req.body);

  // Find user with gym info
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      gym: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    }
  });

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.isActive) {
    throw new UnauthorizedError('Account has been deactivated');
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Create session
  const sessionToken = uuidv4();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const session = await prisma.session.create({
    data: {
      id: uuidv4(),
      userId: user.id,
      token: sessionToken,
      expiresAt,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    }
  });

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });

  // Create JWT token
  const jwt = createToken({
    userId: user.id,
    sessionId: session.id,
    gymId: user.gymId,
    role: user.role
  });

  // Set httpOnly cookie
  res.cookie('token', jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      gym: user.gym,
      token: jwt
    }
  });
}));

/**
 * POST /auth/logout
 * Invalidate session
 */
authRouter.post('/logout', authenticate, asyncHandler(async (req: Request, res: Response) => {
  if (req.session?.id) {
    // Delete session from database
    await prisma.session.delete({
      where: { id: req.session.id }
    });
  }

  // Clear cookie
  res.clearCookie('token');

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
}));

/**
 * GET /auth/me
 * Return current user + gym info
 */
authRouter.get('/me', authenticate, asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }

  // Get full user and gym details
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: {
      gym: {
        select: {
          id: true,
          name: true,
          slug: true,
          settings: true
        }
      }
    }
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        phone: user.phone,
        lastLoginAt: user.lastLoginAt
      },
      gym: user.gym,
      session: {
        id: req.session?.id,
        expiresAt: req.session?.expiresAt
      }
    }
  });
}));

/**
 * POST /auth/forgot-password
 * Send reset email (placeholder - implement email service)
 */
authRouter.post('/forgot-password', authLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email } = ForgotPasswordSchema.parse(req.body);

  const user = await prisma.user.findUnique({
    where: { email }
  });

  // Always return success to prevent email enumeration
  // But only create reset token if user exists
  if (user) {
    // Clean up any existing reset tokens for this email
    await prisma.passwordReset.deleteMany({
      where: { email }
    });

    // Create reset token
    const resetToken = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordReset.create({
      data: {
        email,
        token: resetToken,
        expiresAt
      }
    });

    // TODO: Send email with reset link
    // For now, log the token for development
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔐 Password reset token for ${email}: ${resetToken}`);
      console.log(`🔗 Reset URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`);
    }
  }

  res.json({
    success: true,
    message: 'If an account with that email exists, a password reset link has been sent.'
  });
}));

/**
 * POST /auth/reset-password
 * Consume reset token and set new password
 */
authRouter.post('/reset-password', authLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = ResetPasswordSchema.parse(req.body);

  // Find valid reset token
  const resetRecord = await prisma.passwordReset.findFirst({
    where: {
      token,
      expiresAt: { gt: new Date() },
      usedAt: null
    }
  });

  if (!resetRecord) {
    throw new UnauthorizedError('Invalid or expired reset token');
  }

  // Find user
  const user = await prisma.user.findUnique({
    where: { email: resetRecord.email }
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(password, 12);

  // Update password and mark token as used
  await prisma.$transaction(async (tx) => {
    // Update user password
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });

    // Mark reset token as used
    await tx.passwordReset.update({
      where: { id: resetRecord.id },
      data: { usedAt: new Date() }
    });

    // Invalidate all existing sessions for security
    await tx.session.deleteMany({
      where: { userId: user.id }
    });
  });

  res.json({
    success: true,
    message: 'Password has been reset successfully. Please log in with your new password.'
  });
}));

/**
 * POST /auth/refresh
 * Refresh JWT token (extend session)
 */
authRouter.post('/refresh', authenticate, asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !req.session) {
    throw new UnauthorizedError('Valid session required');
  }

  // Extend session expiry
  const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await prisma.session.update({
    where: { id: req.session.id },
    data: { expiresAt: newExpiresAt }
  });

  // Create new JWT
  const jwt = createToken({
    userId: req.user.id,
    sessionId: req.session.id,
    gymId: req.user.gymId,
    role: req.user.role
  });

  // Set new cookie
  res.cookie('token', jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.json({
    success: true,
    data: {
      token: jwt,
      expiresAt: newExpiresAt
    }
  });
}));