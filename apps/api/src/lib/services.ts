import { AIGateway } from '@gymiq/ai-gateway';
import { TwilioService } from '../services/twilio';
import { WorkflowEngine } from '../services/workflow';
import { prisma } from './prisma';

// Singletons shared across all routes
export const aiGateway = new AIGateway();
export const twilioService = new TwilioService();
export const workflowEngine = new WorkflowEngine(prisma, aiGateway, twilioService);

export { prisma };
