# GymIQ Project Structure

## Overview
AI-powered gym management platform with lead recovery, member retention, and call answering.

## Architecture

### Monorepo Structure
```
gymiq/
├── apps/
│   ├── web/          # Next.js dashboard
│   └── api/          # Express API server
├── packages/
│   ├── database/     # Prisma schema + client
│   ├── ai-gateway/   # AI model router (cost-optimized)
│   └── shared/       # Shared types + utilities
```

## AI Cost Optimization

The AI Gateway (`packages/ai-gateway`) routes requests to the cheapest appropriate model:

| Task | Model | Cost/1K | vs GPT-4 |
|------|-------|---------|----------|
| Member replies | GPT-4o-mini | $0.00075 | 40x cheaper |
| Intent classification | GPT-4o-mini | $0.00075 | 40x cheaper |
| Churn analysis | Claude Sonnet | $0.003 | 10x cheaper |
| Cancel-save | Claude Sonnet | $0.003 | 10x cheaper |
| CSV parsing | GPT-4.1 | $0.005 | 6x cheaper |

**Estimated monthly AI cost per gym:** £4-6 (vs £50-80 using GPT-4)

## Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment variables
```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Set up database
```bash
npm run db:generate
npm run db:migrate
```

### 4. Run development
```bash
npm run dev
```

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/gymiq"

# AI APIs
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."

# Twilio
TWILIO_ACCOUNT_SID="AC..."
TWILIO_AUTH_TOKEN="..."
TWILIO_WHATSAPP_NUMBER="whatsapp:+44..."

# App
JWT_SECRET="your-secret"
PORT=3001
```

## Next Steps

1. [ ] Complete database package setup
2. [ ] Build Twilio webhook handlers
3. [ ] Create dashboard UI
4. [ ] Implement lead follow-up workflows
5. [ ] Add retention features
6. [ ] Build call answering system

## Documentation

- [Product Spec](./docs/product-spec.md)
- [Build Spec](./docs/build-spec.md)
- [API Docs](./docs/api.md)