# PM Radar – AI-Powered Competitor Intelligence for PMs

## Problem
Product managers struggle to track fast-moving competitor updates across multiple SaaS platforms. Manually monitoring Google Workspace, Microsoft 365, Notion, Figma, and dozens of other tools is time-consuming and leads to missed competitive insights.

## Solution
PM Radar is a centralized dashboard that aggregates competitor product updates through RSS feeds and uses AI to summarize launches, categorize feature trends, and surface strategic insights. Get competitive intelligence in seconds, not hours.

## Features
- **Competitor Feed Aggregation** - Track Google Workspace, Microsoft 365, and custom RSS feeds in one place
- **AI-Generated Summaries** - Automatic summaries of releases using Gemini 2.5 Flash
- **Feature Categorization** - Auto-categorize releases into 9 strategic categories (AI/Assist, Integrations, Mobility, etc.)
- **Product Trend Tracking** - Quarterly timeline view with up to 4 products side-by-side
- **Strategic Insight Generation** - AI-powered market briefing and gap analysis recommendations
- **Gap Analysis** - Identify competitive gaps and feature priorities at a glance

## Why I Built This
Having worked on collaboration and productivity products, I wanted a faster way for PMs to monitor evolving market trends and product directions without manually tracking dozens of update channels. PM Radar solves this with automation and AI.

## Quick Start

### Prerequisites
- Node.js 18+
- npm or Bun
- Supabase account (free tier)
- Lovable API key

### Installation
```bash
# Clone the repository
git clone https://github.com/madhutest0407/Competitor-Viewer.git
cd Competitor-Viewer

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local and add your API keys

# Start development server
npm run dev
```

Visit `http://localhost:5173`

## Configuration

### Environment Variables (`.env.local`)
```bash
SUPABASE_URL="your-supabase-url"
SUPABASE_PUBLISHABLE_KEY="your-key"
VITE_SUPABASE_URL="your-url"
VITE_SUPABASE_PUBLISHABLE_KEY="your-key"
VITE_SUPABASE_PROJECT_ID="your-id"
LOVABLE_API_KEY="your-api-key"
```

**Getting Keys:**
- Supabase: [supabase.com](https://supabase.com)
- Lovable: [lovable.dev](https://lovable.dev)

## How It Works

### 1. Timeline Dashboard
Browse competitor releases organized by quarter. Enable up to 4 products and see releases side-by-side with AI-powered market briefing insights.

### 2. Gap Analysis
Identify which competitors lead in each feature category. AI provides strategic recommendations on what to prioritize based on competitive moves.

### 3. Trend Tracking
Track which feature categories competitors are investing in most. Surface market opportunities and threats automatically.

## Tech Stack
- **Frontend**: React 19 + TypeScript + TanStack Router
- **Backend**: Node.js + TanStack Start
- **Database**: Supabase (PostgreSQL)
- **UI**: Tailwind CSS + Radix UI
- **State Management**: React Query
- **AI**: Lovable API (Gemini 2.5 Flash)
- **Deployment**: Vite + Cloudflare

## Project Structure
```
src/
├── components/               # React components
│   └── AIInsightsSummary.tsx # AI insights display
├── routes/                   # Pages & API endpoints
│   ├── index.tsx            # Timeline dashboard
│   ├── gaps.tsx             # Gap analysis
│   ├── sources.tsx          # Data source management
│   └── api/ai/insights.ts   # AI processing
├── lib/
│   ├── sync.server.ts       # Feed sync & AI extraction
│   ├── releases.ts          # Data hooks
│   └── categories.ts        # Feature categories
└── integrations/supabase/   # Database client
```

## Use Cases

**Product Managers**
- Quarterly competitive reviews
- Feature prioritization
- Strategic roadmap planning

**Executive Teams**
- Monitor market trends
- Identify strategic opportunities
- Business reviews with competitive context

**Product Teams**
- Understand competitive landscape
- Track competitor releases
- Identify gaps and differentiation opportunities

## Roadmap

**Current**
- ✅ Multi-source competitor tracking
- ✅ AI summaries and categorization
- ✅ Gap analysis with strategic insights
- ✅ Quarterly timeline views
- ✅ Private user roadmaps

**Planned**
- 📌 Custom product feeds
- 📌 Slack/email alerts
- 📌 Export reports (PDF/CSV)
- 📌 Team collaboration features
- 📌 Advanced filtering & saved views

**Future**
- 🔮 Predictive trend analysis
- 🔮 Impact scoring for releases
- 🔮 Automated competitive alerts
- 🔮 API for integrations

## Deploy to Production

### Vercel
```bash
vercel deploy
```

### Cloudflare Pages
```bash
npm run build
# Deploy dist/ to Cloudflare Pages
wrangler secret put LOVABLE_API_KEY
```

## Security
- API keys stored in `.env.local` (never committed)
- User data private with Supabase RLS
- Authentication required for sensitive features
- Open source for full transparency

## Live Demo
[Coming Soon - Add URL here]

## GitHub
[madhutest0407/Competitor-Viewer](https://github.com/madhutest0407/Competitor-Viewer)

## About
Built by **Madhumitha Krishnamurthi** – PM with full-stack development experience. PM Radar demonstrates end-to-end product thinking: identifying customer problems, building solutions with modern tech (React, Node, AI), and delivering measurable value.

**Interested in Product Roles?** This project shows:
- User-centric problem solving
- Technical product architecture
- Full-stack implementation skills
- AI/LLM integration experience
- Deployment and DevOps knowledge

---

**Made for Product Managers who want smarter competitive insights, faster.**
