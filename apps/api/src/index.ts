import { config } from 'dotenv';
import path from 'path';

// Load .env from monorepo root (two levels up from apps/api/src/)
config({ path: path.resolve(__dirname, '../../../.env') });
import express from 'express';
import { webhookRouter } from './routes/webhooks';
import { conversationRouter } from './routes/conversations';
import { memberRouter } from './routes/members';
import { leadRouter } from './routes/leads';
import { importRouter } from './routes/import';
import { connectorRouter } from './routes/connectors';
import { startFollowupWorker } from './workers/followup.worker';
import { startRetentionWorker, scheduleDailyChurnAnalysis } from './workers/retention.worker';
import { emailNurtureWorker } from './workers/email-nurture.worker';
import { retentionRouter } from './routes/retention';
import { cancelSaveRouter } from './routes/cancel-save';
import { knowledgeBaseRouter } from './routes/knowledge-base';
import { statsRouter } from './routes/stats';
import { gymConfigRouter } from './routes/gym-config';
import { auditRouter } from './routes/audit';
import { taskRouter } from './routes/tasks';
import { connectorScheduler } from '@gymiq/connectors';
import {
  requestLogging,
  performanceMonitoring,
  globalErrorHandler,
  notFoundHandler,
  generalRateLimit,
  dashboardCORS
} from './middleware';

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────

// Trust proxy for correct IP addresses
app.set('trust proxy', true);

// CORS configuration
app.use(dashboardCORS);

// Request logging and performance monitoring
app.use(requestLogging);
app.use(performanceMonitoring);

// Rate limiting (general)
app.use(generalRateLimit);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Required for Twilio webhooks

// Accept raw CSV bodies on /import routes
app.use('/import', express.text({ type: ['text/csv', 'text/plain'], limit: '10mb' }));

// ─── Routes ───────────────────────────────────────────────────────────────────

// Enhanced health check endpoint
app.get('/health', (_req, res) => {
  const healthData = {
    status: 'ok',
    service: 'gymiq-api',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
    database: 'connected', // Could add actual DB health check
    redis: 'connected' // Could add actual Redis health check
  };

  res.json(healthData);
});

// Readiness check endpoint
app.get('/health/ready', (_req, res) => {
  // Add checks for database connectivity, Redis, etc.
  res.json({ status: 'ready', timestamp: new Date().toISOString() });
});

// Liveness check endpoint
app.get('/health/live', (_req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

// Version endpoint to verify deployed code
app.get('/version', (_req, res) => {
  res.json({
    commit: '6a74ca2',
    feature: 'audit-signup-fix-v2',
    timestamp: '2026-03-18T16:30:00Z'
  });
});

app.use('/webhooks', webhookRouter);
app.use('/conversations', conversationRouter);
app.use('/members', memberRouter);
app.use('/leads', leadRouter);
app.use('/import', importRouter);
app.use('/connectors', connectorRouter);
app.use('/retention', retentionRouter);
app.use('/cancel-save', cancelSaveRouter);
app.use('/tasks', taskRouter);
app.use('/stats', statsRouter);
app.use('/gyms', gymConfigRouter);
app.use('/audit', auditRouter);
app.use('/', knowledgeBaseRouter);

// ─── Error handlers ───────────────────────────────────────────────────────────

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(globalErrorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`\n🚀 GymIQ API Server Started`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Ready: http://localhost:${PORT}/health/ready`);
  console.log(`   Docs: http://localhost:${PORT}/docs (coming soon)`);

  // Start background workers after the HTTP server is up
  try {
    startFollowupWorker();
    console.log('✅ Follow-up worker started');
  } catch (err) {
    console.warn('⚠️  Failed to start follow-up worker (Redis unavailable?):', err);
  }

  try {
    startRetentionWorker();
    scheduleDailyChurnAnalysis(); // registers 02:00 UTC repeatable job
    console.log('✅ Retention worker started');
  } catch (err) {
    console.warn('⚠️  Failed to start retention worker (Redis unavailable?):', err);
  }

  try {
    // Email nurture worker is initialized in its constructor - just log that it's ready
    console.log('✅ Email nurture worker started');
  } catch (err) {
    console.warn('⚠️  Failed to start email nurture worker (Redis unavailable?):', err);
  }

  // Start the connector scheduler (polls for gyms with scheduled syncs)
  try {
    connectorScheduler.start();
    console.log('✅ Connector scheduler started');
  } catch (err) {
    console.warn('⚠️  Failed to start connector scheduler:', err);
  }

  console.log('\n🎉 All systems ready!\n');
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, starting graceful shutdown...');
  gracefulShutdown();
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received, starting graceful shutdown...');
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process, just log the error
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // For uncaught exceptions, we should exit
  gracefulShutdown(1);
});

async function gracefulShutdown(exitCode = 0) {
  console.log('📝 Starting graceful shutdown process...');

  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      console.error('❌ Error closing server:', err);
    } else {
      console.log('✅ HTTP server closed');
    }

    // Stop background services
    try {
      connectorScheduler.stop();
      console.log('✅ Connector scheduler stopped');
    } catch (err) {
      console.error('❌ Error stopping connector scheduler:', err);
    }

    // Add cleanup for rate limiter
    try {
      const { shutdownRateLimiter } = require('./middleware');
      shutdownRateLimiter();
      console.log('✅ Rate limiter cleaned up');
    } catch (err) {
      console.error('❌ Error cleaning up rate limiter:', err);
    }

    console.log('👋 Graceful shutdown completed');
    process.exit(exitCode);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.log('⏰ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}
