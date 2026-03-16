export type SequenceType = 'waitlist' | 'audit';
export type EmailNumber = 1 | 2 | 3;

export interface EmailTemplate {
  subject: string;
  htmlBody: string;
  textBody: string;
}

export interface TemplateVariables {
  name?: string;
  gymName?: string;
  memberCount?: number;
  [key: string]: any;
}

export class EmailTemplatesService {
  /**
   * Get email template for a specific sequence and email number
   */
  getTemplate(sequenceType: SequenceType, emailNumber: EmailNumber, variables: TemplateVariables = {}): EmailTemplate {
    const templates = sequenceType === 'waitlist' ? this.waitlistTemplates : this.auditTemplates;
    const template = templates[emailNumber];

    if (!template) {
      throw new Error(`Template not found for ${sequenceType} sequence, email ${emailNumber}`);
    }

    return {
      subject: this.replaceVariables(template.subject, variables),
      htmlBody: this.replaceVariables(template.htmlBody, variables),
      textBody: this.replaceVariables(template.textBody, variables),
    };
  }

  /**
   * Waitlist email sequence templates
   */
  private waitlistTemplates = {
    1: {
      subject: 'Welcome to GymIQ — You are on the list 🎉',
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h1 style="color: #2563eb; text-align: center;">Welcome to GymIQ!</h1>

          <p>Hi {{name}},</p>

          <p>Thanks for joining our waitlist! You're now part of an exclusive group that will be the first to experience GymIQ's AI-powered member retention platform.</p>

          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1e40af; margin-top: 0;">What is GymIQ?</h3>
            <ul style="margin: 0; padding-left: 20px;">
              <li><strong>AI-Powered Member Retention:</strong> Predict and prevent member churn before it happens</li>
              <li><strong>Intelligent Lead Recovery:</strong> Automatically re-engage prospects who didn't convert</li>
              <li><strong>Cancel-Save Automation:</strong> Smart interventions when members try to cancel</li>
            </ul>
          </div>

          <p>We're launching very soon and you'll be among the first to know when we go live. Early access members get special launch pricing and personal onboarding.</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://gymiq.ai" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Visit GymIQ.ai</a>
          </div>

          <p>Get ready to transform your gym's retention rates!</p>

          <p>Best regards,<br>
          <strong>Paul</strong><br>
          Founder, GymIQ</p>
        </div>
      `,
      textBody: `Welcome to GymIQ!

Hi {{name}},

Thanks for joining our waitlist! You're now part of an exclusive group that will be the first to experience GymIQ's AI-powered member retention platform.

What is GymIQ?
• AI-Powered Member Retention: Predict and prevent member churn before it happens
• Intelligent Lead Recovery: Automatically re-engage prospects who didn't convert
• Cancel-Save Automation: Smart interventions when members try to cancel

We're launching very soon and you'll be among the first to know when we go live. Early access members get special launch pricing and personal onboarding.

Visit GymIQ.ai: https://gymiq.ai

Get ready to transform your gym's retention rates!

Best regards,
Paul
Founder, GymIQ`
    },
    2: {
      subject: 'How gyms are losing £2,000+/month without knowing it',
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h1 style="color: #dc2626; text-align: center;">The Hidden £2,000+/Month Problem</h1>

          <p>Hi {{name}},</p>

          <p>Did you know the average gym loses 30-50% of its members annually? That's potentially thousands of pounds walking out the door every month - often without any warning signs.</p>

          <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 20px; margin: 20px 0;">
            <h3 style="color: #dc2626; margin-top: 0;">The "Sleeper Member" Problem</h3>
            <p>These are members who:</p>
            <ul>
              <li>Stop visiting regularly but keep paying</li>
              <li>Show early warning signs of churn</li>
              <li>Could be saved with the right intervention</li>
              <li>Usually cancel without warning</li>
            </ul>
          </div>

          <p><strong>Here's what makes GymIQ different:</strong></p>

          <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <ul style="margin: 0; padding-left: 20px;">
              <li><strong>Early Detection:</strong> Our AI identifies at-risk members 30-60 days before they typically cancel</li>
              <li><strong>Automated Intervention:</strong> Personalized outreach that actually works</li>
              <li><strong>Revenue Recovery:</strong> Most clients see 15-25% improvement in retention rates</li>
            </ul>
          </div>

          <p>Instead of losing members silently, you'll know exactly who needs attention and when.</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://gymiq.ai/audit" style="background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Try Our Free Gym Audit</a>
          </div>

          <p>Our free audit shows you exactly how much revenue your gym could be losing to preventable churn. It takes 2 minutes and the insights are eye-opening.</p>

          <p>Best,<br>
          <strong>Paul</strong><br>
          GymIQ</p>
        </div>
      `,
      textBody: `The Hidden £2,000+/Month Problem

Hi {{name}},

Did you know the average gym loses 30-50% of its members annually? That's potentially thousands of pounds walking out the door every month - often without any warning signs.

THE "SLEEPER MEMBER" PROBLEM:
These are members who:
• Stop visiting regularly but keep paying
• Show early warning signs of churn
• Could be saved with the right intervention
• Usually cancel without warning

HERE'S WHAT MAKES GYMIQ DIFFERENT:
• Early Detection: Our AI identifies at-risk members 30-60 days before they typically cancel
• Automated Intervention: Personalized outreach that actually works
• Revenue Recovery: Most clients see 15-25% improvement in retention rates

Instead of losing members silently, you'll know exactly who needs attention and when.

Try Our Free Gym Audit: https://gymiq.ai/audit

Our free audit shows you exactly how much revenue your gym could be losing to preventable churn. It takes 2 minutes and the insights are eye-opening.

Best,
Paul
GymIQ`
    },
    3: {
      subject: 'Your gym audit is ready — see what you could save',
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h1 style="color: #7c3aed; text-align: center;">Your Personalized Audit Awaits</h1>

          <p>Hi {{name}},</p>

          <p>You're just one click away from discovering how much revenue your gym could recover with better member retention.</p>

          <div style="background: #faf5ff; border: 2px solid #7c3aed; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <h3 style="color: #7c3aed; margin-top: 0;">🎯 Limited Launch Spots Available</h3>
            <p>We're personally onboarding the first 50 gyms to use GymIQ. After that, you'll join a waiting list.</p>
          </div>

          <p><strong>What you'll discover in your free audit:</strong></p>
          <ul>
            <li>Your estimated monthly churn cost</li>
            <li>Revenue recovery potential</li>
            <li>Benchmark against similar gyms</li>
            <li>Specific improvement recommendations</li>
          </ul>

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://gymiq.ai/audit" style="background: #7c3aed; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 18px;">Get My Free Audit Now</a>
          </div>

          <p>Plus, if you like what you see, I'll personally walk you through how GymIQ works in a free 15-minute demo.</p>

          <div style="background: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0;"><strong>📧 Want to chat directly?</strong> Just reply to this email or send me a message at <a href="mailto:paul@gymiq.ai?subject=Demo%20Request" style="color: #7c3aed;">paul@gymiq.ai</a> with "Demo Request" in the subject line.</p>
          </div>

          <p>Don't let another month of preventable churn slip by.</p>

          <p>Speak soon,<br>
          <strong>Paul</strong><br>
          Founder, GymIQ</p>
        </div>
      `,
      textBody: `Your Personalized Audit Awaits

Hi {{name}},

You're just one click away from discovering how much revenue your gym could recover with better member retention.

🎯 LIMITED LAUNCH SPOTS AVAILABLE
We're personally onboarding the first 50 gyms to use GymIQ. After that, you'll join a waiting list.

WHAT YOU'LL DISCOVER IN YOUR FREE AUDIT:
• Your estimated monthly churn cost
• Revenue recovery potential
• Benchmark against similar gyms
• Specific improvement recommendations

Get My Free Audit Now: https://gymiq.ai/audit

Plus, if you like what you see, I'll personally walk you through how GymIQ works in a free 15-minute demo.

Want to chat directly? Just reply to this email or send me a message at paul@gymiq.ai with "Demo Request" in the subject line.

Don't let another month of preventable churn slip by.

Speak soon,
Paul
Founder, GymIQ`
    }
  };

  /**
   * Audit email sequence templates
   */
  private auditTemplates = {
    1: {
      subject: 'Your GymIQ Audit Results — here is what we found',
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h1 style="color: #059669; text-align: center;">Your Audit Results Are Ready</h1>

          <p>Hi {{name}},</p>

          <p>Thanks for running the audit for {{gymName}}! Based on your {{memberCount}} members, I've identified some key findings that could significantly impact your revenue.</p>

          <div style="background: #ecfdf5; border-left: 4px solid #059669; padding: 20px; margin: 20px 0;">
            <h3 style="color: #059669; margin-top: 0;">🔍 Key Findings for {{gymName}}</h3>
            <ul style="margin: 0; padding-left: 20px;">
              <li><strong>At-Risk Members:</strong> Approximately {{estimatedAtRisk}} members showing early churn signals</li>
              <li><strong>Revenue at Risk:</strong> £{{estimatedMonthlyRisk}}/month in preventable churn</li>
              <li><strong>Recovery Potential:</strong> £{{estimatedRecovery}}/month with proper intervention</li>
            </ul>
          </div>

          <p><strong>What GymIQ could do for {{gymName}}:</strong></p>

          <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <ul style="margin: 0; padding-left: 20px;">
              <li><strong>Cancel-Save AI:</strong> Personalized retention offers when members try to cancel</li>
              <li><strong>Sleeper Detection:</strong> Catch disengaged members before they quit</li>
              <li><strong>Automated Lead Follow-up:</strong> Never miss a prospect again</li>
            </ul>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="mailto:paul@gymiq.ai?subject=Demo%20Request%20-%20{{gymName}}" style="background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Book a Free Demo</a>
          </div>

          <p>I'd love to show you exactly how these systems work and what the implementation would look like for {{gymName}}.</p>

          <p>Best,<br>
          <strong>Paul</strong><br>
          GymIQ</p>
        </div>
      `,
      textBody: `Your Audit Results Are Ready

Hi {{name}},

Thanks for running the audit for {{gymName}}! Based on your {{memberCount}} members, I've identified some key findings that could significantly impact your revenue.

🔍 KEY FINDINGS FOR {{gymName}}:
• At-Risk Members: Approximately {{estimatedAtRisk}} members showing early churn signals
• Revenue at Risk: £{{estimatedMonthlyRisk}}/month in preventable churn
• Recovery Potential: £{{estimatedRecovery}}/month with proper intervention

WHAT GYMIQ COULD DO FOR {{gymName}}:
• Cancel-Save AI: Personalized retention offers when members try to cancel
• Sleeper Detection: Catch disengaged members before they quit
• Automated Lead Follow-up: Never miss a prospect again

Book a Free Demo: mailto:paul@gymiq.ai?subject=Demo Request - {{gymName}}

I'd love to show you exactly how these systems work and what the implementation would look like for {{gymName}}.

Best,
Paul
GymIQ`
    },
    2: {
      subject: '3 ways GymIQ stops members cancelling',
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h1 style="color: #2563eb; text-align: center;">3 Ways We Stop Member Churn</h1>

          <p>Hi {{name}},</p>

          <p>Following your audit results, I wanted to show you exactly how GymIQ's three core systems work to protect {{gymName}}'s revenue:</p>

          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0;">
            <h3 style="color: #f59e0b; margin-top: 0;">1. 🛡️ Cancel-Save AI</h3>
            <p><strong>The Problem:</strong> Members cancel without warning, often for reasons you could address.</p>
            <p><strong>Our Solution:</strong> When someone tries to cancel, our AI instantly generates personalized retention offers based on their usage patterns, payment history, and stated reason.</p>
            <p><strong>Result:</strong> Save 30-40% of cancellation attempts automatically.</p>
          </div>

          <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 20px 0;">
            <h3 style="color: #ef4444; margin-top: 0;">2. 🎯 Sleeper Detection</h3>
            <p><strong>The Problem:</strong> Members gradually disengage but keep paying until they suddenly cancel.</p>
            <p><strong>Our Solution:</strong> Track visit frequency, class bookings, and engagement patterns to identify at-risk members 4-6 weeks early.</p>
            <p><strong>Result:</strong> Proactive outreach that re-engages members before they even think about cancelling.</p>
          </div>

          <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 20px; margin: 20px 0;">
            <h3 style="color: #22c55e; margin-top: 0;">3. 🚀 Automated Lead Follow-up</h3>
            <p><strong>The Problem:</strong> Leads go cold because follow-up is inconsistent or too slow.</p>
            <p><strong>Our Solution:</strong> Multi-channel sequences that automatically nurture prospects based on their behavior and engagement level.</p>
            <p><strong>Result:</strong> Convert 15-25% more leads without additional staff time.</p>
          </div>

          <p><strong>The best part?</strong> Everything runs automatically once set up. No additional workload for your team.</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="mailto:paul@gymiq.ai?subject=Let's%20Chat%20-%20{{gymName}}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Reply to This Email to Get Started</a>
          </div>

          <p>Just hit reply and let me know when you'd like to see this in action for {{gymName}}.</p>

          <p>Best,<br>
          <strong>Paul</strong><br>
          GymIQ</p>
        </div>
      `,
      textBody: `3 Ways We Stop Member Churn

Hi {{name}},

Following your audit results, I wanted to show you exactly how GymIQ's three core systems work to protect {{gymName}}'s revenue:

1. 🛡️ CANCEL-SAVE AI
The Problem: Members cancel without warning, often for reasons you could address.
Our Solution: When someone tries to cancel, our AI instantly generates personalized retention offers based on their usage patterns, payment history, and stated reason.
Result: Save 30-40% of cancellation attempts automatically.

2. 🎯 SLEEPER DETECTION
The Problem: Members gradually disengage but keep paying until they suddenly cancel.
Our Solution: Track visit frequency, class bookings, and engagement patterns to identify at-risk members 4-6 weeks early.
Result: Proactive outreach that re-engages members before they even think about cancelling.

3. 🚀 AUTOMATED LEAD FOLLOW-UP
The Problem: Leads go cold because follow-up is inconsistent or too slow.
Our Solution: Multi-channel sequences that automatically nurture prospects based on their behavior and engagement level.
Result: Convert 15-25% more leads without additional staff time.

The best part? Everything runs automatically once set up. No additional workload for your team.

Reply to this email: mailto:paul@gymiq.ai?subject=Let's Chat - {{gymName}}

Just hit reply and let me know when you'd like to see this in action for {{gymName}}.

Best,
Paul
GymIQ`
    },
    3: {
      subject: 'Still thinking about GymIQ?',
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h1 style="color: #7c3aed; text-align: center;">I Get It - Big Decisions Take Time</h1>

          <p>Hi {{name}},</p>

          <p>I know you've been considering GymIQ for {{gymName}}, and I completely understand taking time to think it through. Implementing new systems is a big decision.</p>

          <p>Let me make this as simple as possible:</p>

          <div style="background: #f8fafc; border: 2px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #475569; margin-top: 0;">📋 Quick Recap:</h3>
            <ul style="margin: 0; padding-left: 20px;">
              <li>Your audit showed £{{estimatedMonthlyRisk}}/month in preventable churn</li>
              <li>GymIQ typically recovers 60-70% of this (£{{estimatedRecovery}}/month)</li>
              <li>ROI usually 300-500% within 6 months</li>
              <li>Setup takes 1-2 weeks, then runs automatically</li>
            </ul>
          </div>

          <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0;">
            <h3 style="color: #10b981; margin-top: 0;">🎁 Early Adopter Pricing</h3>
            <p>Since you're one of the first 50 gyms to see GymIQ, you'll get:</p>
            <ul style="margin: 0; padding-left: 20px;">
              <li><strong>50% off</strong> your first 6 months</li>
              <li><strong>Free setup</strong> and personal onboarding</li>
              <li><strong>Direct access</strong> to me for support</li>
            </ul>
          </div>

          <p>But honestly, the pricing isn't the main thing. It's about stopping the revenue leak that's happening right now, this month, while we're talking.</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="mailto:paul@gymiq.ai?subject=Ready%20to%20Start%20-%20{{gymName}}" style="background: #7c3aed; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">Reply to Get Started</a>
          </div>

          <p>Or if you need more info, just reply with any questions. I promise I'm not going to pressure you - I'd rather you be 100% confident this is right for {{gymName}}.</p>

          <div style="background: #fef7cd; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0;"><strong>📞 Prefer a quick call?</strong> Book 15 minutes with me: <a href="https://calendly.com/paul-gymiq" style="color: #7c3aed;">https://calendly.com/paul-gymiq</a></p>
          </div>

          <p>Thanks for considering GymIQ. Whatever you decide, I hope {{gymName}} continues to thrive.</p>

          <p>Best,<br>
          <strong>Paul</strong><br>
          Founder, GymIQ<br>
          <em>paul@gymiq.ai</em></p>
        </div>
      `,
      textBody: `I Get It - Big Decisions Take Time

Hi {{name}},

I know you've been considering GymIQ for {{gymName}}, and I completely understand taking time to think it through. Implementing new systems is a big decision.

Let me make this as simple as possible:

📋 QUICK RECAP:
• Your audit showed £{{estimatedMonthlyRisk}}/month in preventable churn
• GymIQ typically recovers 60-70% of this (£{{estimatedRecovery}}/month)
• ROI usually 300-500% within 6 months
• Setup takes 1-2 weeks, then runs automatically

🎁 EARLY ADOPTER PRICING:
Since you're one of the first 50 gyms to see GymIQ, you'll get:
• 50% off your first 6 months
• Free setup and personal onboarding
• Direct access to me for support

But honestly, the pricing isn't the main thing. It's about stopping the revenue leak that's happening right now, this month, while we're talking.

Reply to Get Started: mailto:paul@gymiq.ai?subject=Ready to Start - {{gymName}}

Or if you need more info, just reply with any questions. I promise I'm not going to pressure you - I'd rather you be 100% confident this is right for {{gymName}}.

📞 Prefer a quick call? Book 15 minutes with me: https://calendly.com/paul-gymiq

Thanks for considering GymIQ. Whatever you decide, I hope {{gymName}} continues to thrive.

Best,
Paul
Founder, GymIQ
paul@gymiq.ai`
    }
  };

  /**
   * Replace template variables with actual values
   */
  private replaceVariables(template: string, variables: TemplateVariables): string {
    let result = template;

    // Default variables
    const defaults = {
      name: variables.name || 'there',
      gymName: variables.gymName || 'your gym',
      memberCount: variables.memberCount || 100,
      estimatedAtRisk: Math.ceil((variables.memberCount || 100) * 0.15), // 15% at risk
      estimatedMonthlyRisk: Math.ceil((variables.memberCount || 100) * 0.15 * 45), // £45 avg per member
      estimatedRecovery: Math.ceil((variables.memberCount || 100) * 0.15 * 45 * 0.65), // 65% recovery rate
    };

    // Merge provided variables with defaults
    const allVariables = { ...defaults, ...variables };

    // Replace all {{variable}} placeholders
    Object.entries(allVariables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value || ''));
    });

    // Clean up any remaining unfilled templates
    result = result.replace(/\{\{[^}]+\}\}/g, '');

    return result.trim();
  }

  /**
   * Get all email timings for a sequence
   */
  getSequenceTimings(sequenceType: SequenceType): { emailNumber: EmailNumber; delayMinutes: number }[] {
    return [
      { emailNumber: 1, delayMinutes: 0 },      // Immediate
      { emailNumber: 2, delayMinutes: 24 * 60 }, // 24 hours
      { emailNumber: 3, delayMinutes: 72 * 60 }, // 72 hours
    ];
  }

  /**
   * Get sequence description for logging
   */
  getSequenceDescription(sequenceType: SequenceType): string {
    const descriptions = {
      waitlist: 'Waitlist nurture sequence: Welcome → Value prop → Urgency',
      audit: 'Audit results sequence: Results → Features → Final push',
    };

    return descriptions[sequenceType] || `${sequenceType} sequence`;
  }
}

// Export singleton instance
export const emailTemplatesService = new EmailTemplatesService();