**GitHub:** [https://github.com/SwordSong-Legacy/COMP4502](https://github.com/SwordSong-Legacy/Autoviz)

# Insight AutoViz

**AI-Powered Multi-Agent Visualisation Dashboard Generator**

[![Final Year Project](https://img.shields.io/badge/FYP-2026-blue)](.)

Insight AutoViz is a modular multi-agent AI system that enables **end-to-end automated insight generation**. Users upload a CSV/JSON file or paste a URL and receive an automated dashboard of visualizations and data-driven insights — without writing any code or prompts.

---

## Demo

[![Demo Video](https://img.youtube.com/vi/qeitwrWg6WQ/maxresdefault.jpg)](https://youtu.be/qeitwrWg6WQ)

---

## Features

- **Zero-prompt analysis** — upload a dataset and get a full dashboard automatically
- **Multi-format ingestion** — CSV upload, JSON upload, and URL ingestion with fallback pipeline
- **Multi-agent visualization pipeline** — plan → filter → code → critique → annotate → report
- **Feature engineering** — automated semantic type detection and derived feature generation
- **Interactive chat** — ask follow-up questions about your data via WebSocket streaming
- **Data quiz** — AI-generated questions to verify understanding of the dataset
- **Insight report** — structured narrative report synthesized from all chart annotations
- **Export** — download reports as PDF or DOCX
- **Guest mode** — try the platform without creating an account
- **i18n** — English and Chinese interface
- **Analytics** — per-pipeline run timing and behavior event tracking

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI, Python 3.12+, PydanticAI, PostgreSQL (async SQLAlchemy) |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS v4 |
| AI | LLMs via OpenRouter (Claude, GPT-4o, etc.) |
| Sandbox | e2b cloud code interpreter (CJK-font template) |
| Data | Pandas, Matplotlib, Seaborn |
| Auth | JWT (HTTP-only cookies) + OAuth |
| Deployment | Google Cloud Run (backend) + Firebase Hosting (frontend) |

---

## Architecture

```
HTTP / WebSocket → API Route → Service → Repository → PostgreSQL
                                  ↓
              WebSocket ← Agent Pipeline ← PydanticAI Agents
                                  ↓
                         e2b Sandbox (chart code execution)
```

**Visualization pipeline** (per turn):

```
viz_main_agent → viz_selector → viz_sub_agent → viz_critic_agent → viz_annotation_agent → report_agent
  (plan tasks)   (filter)       (code + run)    (accept/reject)    (write annotation)    (report)
```

---

## Getting Started

### Prerequisites

- [Python 3.12+](https://www.python.org/) with [uv](https://docs.astral.sh/uv/)
- [Node.js 18+](https://nodejs.org/) with [Bun](https://bun.sh/)
- [PostgreSQL 16](https://www.postgresql.org/) (or Docker)

### 1. Clone

```bash
git clone https://github.com/SwordSong-Legacy/COMP4502.git
cd autoviz
```

### 2. Backend

```bash
cd backend

# Install dependencies
uv sync

# Configure environment
cp .env.example .env
# Edit .env: set POSTGRES_*, OPENROUTER_API_KEY, E2B_API_KEY

# Apply database migrations
uv run autoviz db upgrade

# Start dev server
cd ..
make run
```

**Backend:** http://localhost:8000  
**API docs:** http://localhost:8000/docs

### 3. Frontend

```bash
cd frontend
bun install
bun dev
```

**Frontend:** http://localhost:3000

### 4. Docker (Alternative)

```bash
make docker-up      # Backend API + PostgreSQL
make db-init        # Apply migrations
# Then: cd frontend && bun dev
```

---

## Addresses

| Environment | Frontend | Backend | API Docs |
|-------------|----------|---------|----------|
| **Local** | http://localhost:3000 | http://localhost:8000 | http://localhost:8000/docs |
| **Production** | [autoviz-fyp4502.web.app](https://autoviz-fyp4502.web.app/) | [Cloud Run](https://fyp4502-backend-137393663085.asia-east1.run.app) | *(hidden)* |

---

## Project Structure

```
autoviz/
├── backend/app/
│   ├── api/routes/v1/    # HTTP + WebSocket endpoints
│   ├── agents/           # PydanticAI agents (viz, report, feature_engineer, quiz, …)
│   ├── pipelines/        # Orchestration (visualization, feature_engineer, url_ingest, tabular_upload)
│   ├── services/         # Business logic + analytics
│   ├── repositories/     # DB queries (analytics, visualization, report, …)
│   ├── db/models/        # SQLAlchemy models
│   └── commands/         # CLI sub-commands (auto-discovered)
├── frontend/             # Next.js 15 app (chat, analysis, dashboard, auth, i18n)
├── docs/                 # Architecture, patterns, testing guides
└── docker-compose.yml
```

---

## Common Commands

```bash
# Backend
cd backend
uv run autoviz server run --reload          # Dev server
uv run autoviz db upgrade                   # Apply migrations
uv run autoviz db migrate -m "description"  # New migration
uv run ruff check app tests cli --fix && uv run ruff format app tests cli
uv run mypy app
uv run pytest tests/ -v

# Frontend
cd frontend
bun dev
bun run type-check
bun run lint
bun test
```

## Deployment

```bash
# Backend → Google Cloud Run
make docker-gcr

# Frontend → Firebase Hosting
make deploy-frontend
```

---

## Team

| Name | Student ID |
|------|------------|
| Han Yuxin | 3035974511 |
| Huang Yichong | 3035974406 |
| Lu Bo | 3036104046 |
| Li Yongyan | 3033108106 |

---

## License

MIT
