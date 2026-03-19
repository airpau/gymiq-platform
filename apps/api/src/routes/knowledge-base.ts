import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { knowledgeBaseService } from '../services/knowledge-base';
import { authenticate, requireGymAccess } from '../middleware/authentication';

export const knowledgeBaseRouter = Router();

// Apply authentication to all routes
knowledgeBaseRouter.use(authenticate);
knowledgeBaseRouter.use(requireGymAccess);

/**
 * GET /knowledge-base
 * Get gym knowledge base
 */
knowledgeBaseRouter.get('/knowledge-base', async (req, res) => {
  try {
    const gymId = req.user!.gymId;

    const knowledgeBase = await knowledgeBaseService.getKnowledgeBase(gymId);

    if (!knowledgeBase) {
      return res.status(404).json({
        error: 'Gym not found or no knowledge base configured'
      });
    }

    res.json({
      success: true,
      data: knowledgeBase
    });
  } catch (error) {
    console.error('[Knowledge Base API] Get error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /knowledge-base
 * Update gym knowledge base
 */
knowledgeBaseRouter.put('/knowledge-base', async (req, res) => {
  try {
    const gymId = req.user!.gymId;
    const updates = req.body;

    // Verify gym exists
    const gym = await prisma.gym.findUnique({
      where: { id: gymId }
    });

    if (!gym) {
      return res.status(404).json({
        error: 'Gym not found'
      });
    }

    const success = await knowledgeBaseService.updateKnowledgeBase(gymId, updates);

    if (!success) {
      return res.status(500).json({
        error: 'Failed to update knowledge base'
      });
    }

    // Return updated knowledge base
    const updatedKB = await knowledgeBaseService.getKnowledgeBase(gymId);

    res.json({
      success: true,
      message: 'Knowledge base updated successfully',
      data: updatedKB
    });
  } catch (error) {
    console.error('[Knowledge Base API] Update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /gyms/:id/knowledge-base/test
 * Test a question against the knowledge base
 */
knowledgeBaseRouter.post('/knowledge-base/test', async (req, res) => {
  try {
    const gymId = req.user!.gymId;
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({
        error: 'Missing required field: question'
      });
    }

    const result = await knowledgeBaseService.testQuestion(gymId, question);

    if (!result) {
      return res.status(404).json({
        error: 'Could not find answer for this question'
      });
    }

    res.json({
      success: true,
      data: {
        question,
        answer: result.answer,
        confidence: result.confidence,
        sources: result.sources,
        processingTime: result.processingTime
      }
    });
  } catch (error) {
    console.error('[Knowledge Base API] Test question error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /gyms/:id/knowledge-base/context
 * Get formatted context string for AI prompts
 */
knowledgeBaseRouter.get('/knowledge-base/context', async (req, res) => {
  try {
    const gymId = req.user!.gymId;

    const context = await knowledgeBaseService.buildContext(gymId);

    res.json({
      success: true,
      data: {
        gymId,
        context,
        length: context.length
      }
    });
  } catch (error) {
    console.error('[Knowledge Base API] Get context error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /gyms/:id/knowledge-base/template
 * Get default knowledge base template
 */
knowledgeBaseRouter.get('/knowledge-base/template', async (req, res) => {
  try {
    const gymId = req.user!.gymId;

    // Get gym name
    const gym = await prisma.gym.findUnique({
      where: { id: gymId },
      select: { name: true }
    });

    if (!gym) {
      return res.status(404).json({
        error: 'Gym not found'
      });
    }

    const template = knowledgeBaseService.getDefaultTemplate(gym.name);

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('[Knowledge Base API] Get template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /gyms/:id/knowledge-base/reset
 * Reset knowledge base to default template
 */
knowledgeBaseRouter.post('/knowledge-base/reset', async (req, res) => {
  try {
    const gymId = req.user!.gymId;

    // Get gym name
    const gym = await prisma.gym.findUnique({
      where: { id: gymId },
      select: { name: true }
    });

    if (!gym) {
      return res.status(404).json({
        error: 'Gym not found'
      });
    }

    const defaultTemplate = knowledgeBaseService.getDefaultTemplate(gym.name);
    const success = await knowledgeBaseService.updateKnowledgeBase(gymId, defaultTemplate);

    if (!success) {
      return res.status(500).json({
        error: 'Failed to reset knowledge base'
      });
    }

    res.json({
      success: true,
      message: 'Knowledge base reset to default template',
      data: defaultTemplate
    });
  } catch (error) {
    console.error('[Knowledge Base API] Reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /gyms/:id/knowledge-base/search
 * Search knowledge base with multiple questions
 */
knowledgeBaseRouter.post('/knowledge-base/search', async (req, res) => {
  try {
    const gymId = req.user!.gymId;
    const { questions } = req.body;

    if (!questions || !Array.isArray(questions)) {
      return res.status(400).json({
        error: 'Missing required field: questions (array)'
      });
    }

    const results = await Promise.all(
      questions.map(async (question: string) => {
        const result = await knowledgeBaseService.findAnswer(gymId, question);
        return {
          question,
          result: result || {
            answer: 'No answer found',
            confidence: 0,
            sources: []
          }
        };
      })
    );

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('[Knowledge Base API] Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /gyms/:id/knowledge-base/validation
 * Validate knowledge base completeness
 */
knowledgeBaseRouter.get('/knowledge-base/validation', async (req, res) => {
  try {
    const gymId = req.user!.gymId;

    const kb = await knowledgeBaseService.getKnowledgeBase(gymId);

    if (!kb) {
      return res.status(404).json({
        error: 'Knowledge base not found'
      });
    }

    // Check completeness
    const validation = {
      complete: true,
      issues: [] as string[],
      suggestions: [] as string[],
      score: 0
    };

    let totalChecks = 0;
    let passedChecks = 0;

    // Basic information checks
    const basicChecks = [
      { field: 'gymName', label: 'Gym Name' },
      { field: 'usp', label: 'Unique Selling Proposition' },
      { field: 'tone', label: 'Communication Tone' }
    ];

    basicChecks.forEach(check => {
      totalChecks++;
      if (kb[check.field as keyof typeof kb]) {
        passedChecks++;
      } else {
        validation.issues.push(`Missing ${check.label}`);
      }
    });

    // Facilities check
    totalChecks++;
    if (kb.facilities && kb.facilities.length > 0) {
      passedChecks++;
    } else {
      validation.issues.push('No facilities listed');
    }

    // Pricing check
    totalChecks++;
    if (kb.pricing && Object.keys(kb.pricing).length > 0) {
      passedChecks++;
    } else {
      validation.issues.push('No pricing information');
    }

    // Opening hours check
    totalChecks++;
    if (kb.openingHours && Object.keys(kb.openingHours).length >= 7) {
      passedChecks++;
    } else {
      validation.issues.push('Incomplete opening hours');
    }

    // FAQs check
    totalChecks++;
    if (kb.faqs && kb.faqs.length >= 3) {
      passedChecks++;
    } else {
      validation.issues.push('Need at least 3 FAQs');
      validation.suggestions.push('Add more frequently asked questions');
    }

    // Policies check
    totalChecks++;
    if (kb.policies && Object.keys(kb.policies).length >= 2) {
      passedChecks++;
    } else {
      validation.issues.push('Missing key policies');
      validation.suggestions.push('Add cancellation and guest policies');
    }

    validation.score = Math.round((passedChecks / totalChecks) * 100);
    validation.complete = validation.issues.length === 0;

    // Add suggestions based on score
    if (validation.score < 70) {
      validation.suggestions.push('Knowledge base needs significant improvements');
    } else if (validation.score < 90) {
      validation.suggestions.push('Knowledge base is good but could be enhanced');
    }

    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    console.error('[Knowledge Base API] Validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});