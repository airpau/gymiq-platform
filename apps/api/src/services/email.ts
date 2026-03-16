import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma';

interface EmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  leadId?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize SMTP transporter with Google Workspace configuration
   */
  private initialize() {
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpUser || !smtpPass) {
      console.warn('[Email Service] SMTP credentials not configured - email sending disabled');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass, // Use App Password from Google
        },
        tls: {
          rejectUnauthorized: false, // Allow self-signed certificates
        },
      });

      this.isConfigured = true;
      console.log('[Email Service] SMTP transporter configured successfully');
    } catch (error) {
      console.error('[Email Service] Failed to initialize SMTP transporter:', error);
    }
  }

  /**
   * Send email with HTML and text versions
   */
  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    try {
      if (!this.isConfigured || !this.transporter) {
        console.log(`[Email Service] DRY RUN - Would send email to ${options.to}`);
        console.log(`  Subject: ${options.subject}`);
        console.log(`  Content: ${options.textBody.slice(0, 100)}...`);

        // Log to database even in dry run mode
        if (options.leadId) {
          await this.logEmail(options.leadId, options.to, options.subject, options.htmlBody, 'dry_run');
        }

        return {
          success: true,
          messageId: `dry_run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        };
      }

      // Get the sender email from environment or default
      const fromEmail = process.env.SMTP_USER || 'paul@gymiq.ai';
      const fromName = 'GymIQ';

      // Add unsubscribe link to both HTML and text versions
      const unsubscribeUrl = `https://gymiq.ai/unsubscribe?email=${encodeURIComponent(options.to)}`;

      const htmlBodyWithFooter = this.addEmailFooter(options.htmlBody, unsubscribeUrl);
      const textBodyWithFooter = this.addTextFooter(options.textBody, unsubscribeUrl);

      const mailOptions = {
        from: `${fromName} <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        text: textBodyWithFooter,
        html: htmlBodyWithFooter,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      };

      const info = await this.transporter.sendMail(mailOptions);

      console.log(`[Email Service] Email sent successfully to ${options.to}, MessageID: ${info.messageId}`);

      // Log successful email
      if (options.leadId) {
        await this.logEmail(options.leadId, options.to, options.subject, options.htmlBody, 'sent', info.messageId);
      }

      return {
        success: true,
        messageId: info.messageId,
      };

    } catch (error) {
      console.error(`[Email Service] Failed to send email to ${options.to}:`, error);

      // Log failed email
      const err = error as Error;
      if (options.leadId) {
        await this.logEmail(options.leadId, options.to, options.subject, options.htmlBody, 'failed', undefined, err.message);
      }

      return {
        success: false,
        error: err.message || 'Unknown email sending error',
      };
    }
  }

  /**
   * Add HTML footer with unsubscribe link and company info
   */
  private addEmailFooter(htmlBody: string, unsubscribeUrl: string): string {
    const footer = `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #666; font-size: 12px; text-align: center;">
      <p><strong>GymIQ</strong> - AI-Powered Member Retention</p>
      <p>123 Fitness Street, London, UK</p>
      <p>
        <a href="${unsubscribeUrl}" style="color: #666;">Unsubscribe</a> |
        <a href="https://gymiq.ai/privacy" style="color: #666;">Privacy Policy</a> |
        <a href="https://gymiq.ai" style="color: #666;">Visit GymIQ.ai</a>
      </p>
    </div>
    `;

    // Insert footer before closing body tag, or append if no body tag found
    if (htmlBody.includes('</body>')) {
      return htmlBody.replace('</body>', `${footer}</body>`);
    } else {
      return `${htmlBody}${footer}`;
    }
  }

  /**
   * Add text footer with unsubscribe link
   */
  private addTextFooter(textBody: string, unsubscribeUrl: string): string {
    const footer = `

---
GymIQ - AI-Powered Member Retention
123 Fitness Street, London, UK

Unsubscribe: ${unsubscribeUrl}
Privacy Policy: https://gymiq.ai/privacy
Visit: https://gymiq.ai
`;

    return `${textBody}${footer}`;
  }

  /**
   * Log email to database for audit trail
   */
  private async logEmail(
    leadId: string,
    to: string,
    subject: string,
    content: string,
    status: 'sent' | 'failed' | 'dry_run',
    messageId?: string,
    error?: string
  ): Promise<void> {
    try {
      // Find or create conversation for this lead
      let conversation = await prisma.conversation.findFirst({
        where: { leadId },
      });

      if (!conversation) {
        // Create a conversation if it doesn't exist
        conversation = await prisma.conversation.create({
          data: {
            leadId,
            status: 'active',
            channel: 'email',
          },
        });
      }

      // Create message record
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'outbound',
          content: `Subject: ${subject}\n\n${content}`,
          contentType: 'html',
          metadata: {
            channel: 'email',
            to,
            subject,
            messageId,
            status,
            error,
            timestamp: new Date().toISOString(),
          },
        },
      });

      // Update conversation timestamp
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });

    } catch (error) {
      console.error(`[Email Service] Failed to log email for lead ${leadId}:`, error);
    }
  }

  /**
   * Test email configuration
   */
  async testConfiguration(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      console.log('[Email Service] SMTP configuration verified successfully');
      return true;
    } catch (error) {
      console.error('[Email Service] SMTP verification failed:', error);
      return false;
    }
  }

  /**
   * Get configuration status
   */
  getStatus(): { configured: boolean; ready: boolean } {
    return {
      configured: this.isConfigured,
      ready: this.isConfigured && this.transporter !== null,
    };
  }
}

// Export singleton instance
export const emailService = new EmailService();