import { prisma } from '../lib/prisma';
import { AIGateway } from '@gymiq/ai-gateway';

export interface GymKnowledgeBase {
  gymName: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  openingHours: {
    [key: string]: { open: string; close: string } | 'closed';
  };
  facilities: string[];
  classes?: Array<{
    name: string;
    day: string;
    time: string;
    instructor?: string;
    description?: string;
  }>;
  pricing: {
    [membershipType: string]: string;
  };
  faqs: Array<{
    question: string;
    answer: string;
    category?: string;
  }>;
  policies: {
    cancellation?: string;
    freeze?: string;
    guestPolicy?: string;
    ageRestrictions?: string;
    dresscode?: string;
  };
  usp: string; // Unique selling proposition
  tone: string; // Communication tone guidelines
  retentionOffers?: {
    [offerType: string]: {
      name: string;
      price: string;
      description: string;
      duration?: string;
    };
  };
}

export class KnowledgeBaseService {
  private ai: AIGateway;

  constructor() {
    this.ai = new AIGateway();
  }

  /**
   * Get gym knowledge base
   */
  async getKnowledgeBase(gymId: string): Promise<GymKnowledgeBase | null> {
    try {
      const gym = await prisma.gym.findUnique({
        where: { id: gymId },
        select: { knowledgeBase: true, name: true }
      });

      if (!gym) {
        return null;
      }

      // Return knowledge base with defaults
      return this.ensureKnowledgeBaseDefaults(gym.knowledgeBase as any, gym.name);
    } catch (error) {
      console.error('[Knowledge Base] Get error:', error);
      return null;
    }
  }

  /**
   * Update gym knowledge base
   */
  async updateKnowledgeBase(gymId: string, knowledgeBase: Partial<GymKnowledgeBase>): Promise<boolean> {
    try {
      const existing = await this.getKnowledgeBase(gymId);
      if (!existing) {
        return false;
      }

      const updated = {
        ...existing,
        ...knowledgeBase,
        updatedAt: new Date().toISOString()
      };

      await prisma.gym.update({
        where: { id: gymId },
        data: { knowledgeBase: updated }
      });

      return true;
    } catch (error) {
      console.error('[Knowledge Base] Update error:', error);
      return false;
    }
  }

  /**
   * Build context string for AI prompt injection
   */
  buildContext(gymId: string): Promise<string> {
    return this.getKnowledgeBase(gymId).then(kb => {
      if (!kb) return '';

      return `GYM INFORMATION:
Name: ${kb.gymName}
${kb.address ? `Address: ${kb.address}` : ''}
${kb.phone ? `Phone: ${kb.phone}` : ''}
${kb.email ? `Email: ${kb.email}` : ''}

OPENING HOURS:
${Object.entries(kb.openingHours)
  .map(([day, hours]) => `${day}: ${typeof hours === 'string' ? hours : `${hours.open}-${hours.close}`}`)
  .join('\n')}

FACILITIES:
${kb.facilities.join(', ')}

${kb.classes && kb.classes.length > 0 ? `CLASSES:
${kb.classes.map(c => `${c.name} - ${c.day} ${c.time}${c.instructor ? ` (${c.instructor})` : ''}`).join('\n')}` : ''}

PRICING:
${Object.entries(kb.pricing).map(([type, price]) => `${type}: ${price}`).join('\n')}

UNIQUE SELLING PROPOSITION:
${kb.usp}

POLICIES:
${Object.entries(kb.policies)
  .filter(([_, value]) => value)
  .map(([key, value]) => `${key}: ${value}`)
  .join('\n')}

COMMUNICATION TONE: ${kb.tone}`;
    });
  }

  /**
   * Search knowledge base for relevant information
   */
  async findAnswer(
    gymId: string,
    question: string
  ): Promise<{ answer: string; confidence: number; sources: string[] } | null> {
    try {
      const kb = await this.getKnowledgeBase(gymId);
      if (!kb) {
        return null;
      }

      // First, check FAQs for direct matches
      const faqMatch = this.findFAQMatch(question, kb.faqs);
      if (faqMatch && faqMatch.confidence > 0.8) {
        return {
          answer: faqMatch.answer,
          confidence: faqMatch.confidence,
          sources: ['FAQ']
        };
      }

      // Use AI to find and generate answer from knowledge base
      const context = await this.buildContext(gymId);
      const aiAnswer = await this.generateKnowledgeAnswer(question, context, kb);

      if (!aiAnswer) {
        return null;
      }

      return {
        answer: aiAnswer.answer,
        confidence: aiAnswer.confidence,
        sources: aiAnswer.sources
      };
    } catch (error) {
      console.error('[Knowledge Base] Find answer error:', error);
      return null;
    }
  }

  /**
   * Test a question against the knowledge base
   */
  async testQuestion(gymId: string, question: string): Promise<{
    answer: string;
    confidence: number;
    sources: string[];
    processingTime: number;
  } | null> {
    const startTime = Date.now();
    const result = await this.findAnswer(gymId, question);
    const processingTime = Date.now() - startTime;

    if (!result) {
      return null;
    }

    return {
      ...result,
      processingTime
    };
  }

  /**
   * Get default knowledge base template
   */
  getDefaultTemplate(gymName: string): GymKnowledgeBase {
    return {
      gymName,
      openingHours: {
        monday: { open: '06:00', close: '22:00' },
        tuesday: { open: '06:00', close: '22:00' },
        wednesday: { open: '06:00', close: '22:00' },
        thursday: { open: '06:00', close: '22:00' },
        friday: { open: '06:00', close: '22:00' },
        saturday: { open: '08:00', close: '20:00' },
        sunday: { open: '08:00', close: '20:00' }
      },
      facilities: [
        'Gym Floor',
        'Free Weights',
        'Cardio Zone',
        'Changing Rooms',
        'Parking'
      ],
      pricing: {
        'Basic': '£29.99/month',
        'Premium': '£39.99/month'
      },
      faqs: [
        {
          question: 'What are your opening hours?',
          answer: 'We are open Monday-Friday 6am-10pm, weekends 8am-8pm.',
          category: 'general'
        },
        {
          question: 'Do you offer day passes?',
          answer: 'Yes, day passes are available for £15. Please speak to reception.',
          category: 'pricing'
        },
        {
          question: 'Can I bring a guest?',
          answer: 'Members can bring one guest per visit for £10. Guest must be accompanied at all times.',
          category: 'policies'
        }
      ],
      policies: {
        cancellation: '30 days notice required for cancellations',
        freeze: 'Memberships can be frozen for up to 3 months per year',
        guestPolicy: 'One guest per member, £10 fee, must be accompanied',
        ageRestrictions: '16+ welcome, under 18s require parent/guardian consent'
      },
      usp: 'State-of-the-art equipment with 24/7 access for premium members',
      tone: 'friendly, professional, helpful, not pushy',
      retentionOffers: {
        downgrade: {
          name: 'Basic Membership',
          price: '£19.99/month',
          description: 'Essential gym access with core facilities'
        },
        freeze: {
          name: 'Membership Freeze',
          price: 'Free',
          description: 'Pause membership for up to 3 months',
          duration: '3 months'
        },
        discount: {
          name: 'Loyalty Discount',
          price: '25% off',
          description: 'Special discount for valued members',
          duration: '3 months'
        }
      }
    };
  }

  /**
   * Ensure knowledge base has all required defaults
   */
  private ensureKnowledgeBaseDefaults(kb: any, gymName: string): GymKnowledgeBase {
    const defaults = this.getDefaultTemplate(gymName);

    return {
      gymName: kb?.gymName || gymName,
      address: kb?.address,
      phone: kb?.phone,
      email: kb?.email,
      website: kb?.website,
      openingHours: kb?.openingHours || defaults.openingHours,
      facilities: kb?.facilities || defaults.facilities,
      classes: kb?.classes || [],
      pricing: kb?.pricing || defaults.pricing,
      faqs: kb?.faqs || defaults.faqs,
      policies: kb?.policies || defaults.policies,
      usp: kb?.usp || defaults.usp,
      tone: kb?.tone || defaults.tone,
      retentionOffers: kb?.retentionOffers || defaults.retentionOffers
    };
  }

  /**
   * Find direct FAQ matches
   */
  private findFAQMatch(
    question: string,
    faqs: Array<{ question: string; answer: string }>
  ): { answer: string; confidence: number } | null {
    const questionLower = question.toLowerCase();

    for (const faq of faqs) {
      const faqQuestionLower = faq.question.toLowerCase();

      // Exact match
      if (questionLower === faqQuestionLower) {
        return { answer: faq.answer, confidence: 1.0 };
      }

      // High similarity
      const similarity = this.calculateStringSimilarity(questionLower, faqQuestionLower);
      if (similarity > 0.7) {
        return { answer: faq.answer, confidence: similarity };
      }

      // Keyword overlap
      const questionWords = questionLower.split(/\s+/).filter(w => w.length > 3);
      const faqWords = faqQuestionLower.split(/\s+/).filter(w => w.length > 3);
      const overlap = questionWords.filter(w => faqWords.includes(w)).length;
      const overlapRatio = overlap / Math.max(questionWords.length, faqWords.length);

      if (overlapRatio > 0.6) {
        return { answer: faq.answer, confidence: overlapRatio };
      }
    }

    return null;
  }

  /**
   * Generate AI answer from knowledge base context
   */
  private async generateKnowledgeAnswer(
    question: string,
    context: string,
    kb: GymKnowledgeBase
  ): Promise<{ answer: string; confidence: number; sources: string[] } | null> {
    try {
      const systemPrompt = `You are a helpful AI assistant for ${kb.gymName}.
Answer questions accurately using only the provided gym information.
Be helpful and ${kb.tone}.

If you cannot answer from the provided information, say "I don't have that specific information, but I can have someone from our team help you with that."

AVAILABLE INFORMATION:
${context}`;

      const userPrompt = `Question: ${question}

Please provide a helpful answer based on the gym information. If you can answer, also indicate your confidence level (0-1) and which sections of information you used.

Format:
ANSWER: [your answer]
CONFIDENCE: [0-1]
SOURCES: [comma-separated list of what information sections you used]`;

      const result = await this.ai.generateMemberReply(userPrompt, { question }, kb);

      return {
        answer: result.reply,
        confidence: 0.8,
        sources: ['Knowledge Base']
      };
    } catch (error) {
      console.error('[Knowledge Base] AI answer error:', error);
      return null;
    }
  }

  /**
   * Parse AI knowledge response
   */
  private parseKnowledgeResponse(response: string): { answer: string; confidence: number; sources: string[] } | null {
    try {
      const lines = response.split('\n');
      let answer = '';
      let confidence = 0.5;
      let sources: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('ANSWER:')) {
          answer = line.replace('ANSWER:', '').trim();
          // Continue reading until we hit CONFIDENCE or SOURCES
          for (let j = i + 1; j < lines.length; j++) {
            const nextLine = lines[j].trim();
            if (nextLine.startsWith('CONFIDENCE:') || nextLine.startsWith('SOURCES:')) {
              break;
            }
            answer += '\n' + nextLine;
          }
        } else if (line.startsWith('CONFIDENCE:')) {
          const confMatch = line.match(/CONFIDENCE:\s*([\d.]+)/);
          if (confMatch) {
            confidence = Math.max(0, Math.min(1, parseFloat(confMatch[1])));
          }
        } else if (line.startsWith('SOURCES:')) {
          const sourcesText = line.replace('SOURCES:', '').trim();
          sources = sourcesText.split(',').map(s => s.trim()).filter(s => s);
        }
      }

      // If no structured format found, treat entire response as answer
      if (!answer) {
        answer = response.replace(/CONFIDENCE:.*$/gm, '').replace(/SOURCES:.*$/gm, '').trim();
      }

      return {
        answer: answer || response,
        confidence,
        sources: sources.length > 0 ? sources : ['Knowledge Base']
      };
    } catch (error) {
      console.error('[Knowledge Base] Parse response error:', error);
      return {
        answer: response,
        confidence: 0.5,
        sources: ['Knowledge Base']
      };
    }
  }

  /**
   * Simple string similarity calculation
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array.from({ length: str2.length + 1 }, (_, i) => [i]);
    matrix[0] = Array.from({ length: str1.length + 1 }, (_, i) => i);

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2[i - 1] === str1[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }
}

// Export singleton instance
export const knowledgeBaseService = new KnowledgeBaseService();