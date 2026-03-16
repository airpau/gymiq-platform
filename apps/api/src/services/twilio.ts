import twilio from 'twilio';

export class TwilioService {
  private client: twilio.Twilio;

  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }

  async sendWhatsApp(to: string, from: string, body: string) {
    return this.client.messages.create({
      from: `whatsapp:${from}`,
      to: `whatsapp:${to}`,
      body,
    });
  }

  async sendSMS(to: string, from: string, body: string) {
    return this.client.messages.create({ from, to, body });
  }

  validateWebhook(url: string, params: Record<string, string>, signature: string): boolean {
    return twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN || '',
      signature,
      url,
      params
    );
  }
}
