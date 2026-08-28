# CLAUDE.md

## Project Overview

**AutoViz** — an AI-powered data visualization platform. Users upload CSV/JSON data or provide a URL and receive chart recommendations, rendered visualizations, and insight reports via a multi-agent pipeline. Supports guest mode, i18n (EN/ZH), and analytics tracking.

**Stack:** FastAPI (Python 3.12+) + Next.js 15 (React 19, TypeScript) + PostgreSQL + PydanticAI + e2b code interpreter (CJK template)

---

## Commands

### Backend

```bash
cd backend

# Development
uv run autoviz server run --reload        # Dev server (preferred)
uv run uvicorn app.main:app --reload      # Alternative

# Code quality
uv run ruff check app tests cli --fix && uv run ruff format app tests cli   # Lint + format
uv run mypy app                                                               # Type check

# Testing
uv run pytest tests/ -v                                          # Run tests
uv run pytest tests/ -v --cov=app --cov-report=term-missing      # With coverage

# Database
uv run autoviz db upgrade                                         # Apply migrations
uv run autoviz db migrate -m "description"                        # New migration
uv run autoviz db current                                         # Current revision
uv run autoviz db history                                         # Migration history
uv run autoviz db downgrade                                       # Rollback last

# CLI inspection
uv run autoviz server routes                                      # List all routes
```

### Frontend

```bash
cd frontend

bun dev                   # Dev server (port 3000)
bun build                 # Production build (outputs to out/)
bun run lint              # ESLint
bun run format            # Prettier
bun run type-check        # tsc --noEmit
bun test                  # Unit tests (Vitest, watch mode)
bun run test:run          # Unit tests (single run)
bun run test:coverage     # With coverage
bun run test:e2e          # E2E tests (Playwright)
bun run test:e2e:ui       # Playwright UI mode
```

### Make (project root)

```bash
make install          # Install all deps + pre-commit hooks
make run              # Start backend dev server
make test             # Run backend tests
make lint             # Check code quality (ruff + mypy)
make format           # Auto-format backend

make docker-up        # Start backend services (API + PostgreSQL)
make docker-down      # Stop all services
make docker-db        # Start only PostgreSQL
make db-init          # Start PostgreSQL + apply migrations

make docker-prod      # Start production stack (Traefik + all services)
make docker-gcr       # Build + push backend image to Google Cloud Run
make deploy-frontend  # Build frontend + deploy to Firebase
```

---

## Architecture

```
HTTP Request → API Route → Service → Repository → Database
                              ↓
              WebSocket ← Agent Pipeline ← AI Agents (PydanticAI)
                              ↓
                         e2b Sandbox (code execution)
```

### Backend (`backend/app/`)

```
backend/app/
├── api/
│   ├── routes/v1/        # HTTP + WebSocket endpoints
│   │   ├── agent.py      # WebSocket: streaming AI agent + viz pipeline
│   │   ├── auth.py       # Login, register, refresh, OAuth callback
│   │   ├── conversations.py
│   │   ├── api_key.py    # User API key management
│   │   ├── items.py
│   │   └── health.py
│   ├── deps.py           # DI: get_db, get_current_user
│   ├── exception_handlers.py
│   └── versioning.py
├── agents/               # PydanticAI agents
│   ├── assistant.py      # Conversational assistant agent
│   ├── viz_main_agent.py # Plans visualization tasks
│   ├── viz_selector.py   # Feasibility + information-gain filter
│   ├── viz_sub_agent.py  # Generates chart code + runs in sandbox
│   ├── viz_critic_agent.py    # Quality-checks rendered charts
│   ├── viz_annotation_agent.py # Writes chart annotations
│   ├── viz_quiz_agent.py      # Generates dataset comprehension quiz questions
│   ├── report_agent.py   # Generates structured insight reports
│   ├── feature_engineer.py    # Writes feature engineering code
│   ├── data_query.py     # Natural-language data query agent
│   ├── prompts.py        # All LLM system prompts (centralized)
│   ├── llm_context.py    # Per-request LLM model override
│   └── tools/
│       └── datetime_tool.py
├── pipelines/            # Orchestration pipelines
│   ├── visualization.py  # Multi-turn viz pipeline (plan → code → critique → annotate)
│   ├── feature_engineer.py    # Feature engineering pipeline
│   ├── csv_preprocessor.py    # CSV parsing + summary generation
│   ├── tabular_upload.py      # Unified tabular upload pipeline (CSV/JSON)
│   ├── url_ingest.py          # URL ingestion pipeline with fallback
│   └── base.py
├── services/             # Business logic
│   ├── viz_agent_manager.py   # SubAgentManager, HistoryManager
│   ├── sandbox_service.py     # e2b sandbox wrapper
│   ├── report_export_service.py # PDF/DOCX export
│   ├── analytics_service.py   # Fire-and-forget pipeline analytics
│   ├── conversation.py
│   ├── user.py
│   ├── api_key.py
│   └── item.py
├── repositories/         # DB queries only (flush, not commit)
│   ├── base.py
│   ├── analytics.py      # Pipeline run + behavior event queries
│   ├── conversation.py
│   ├── chat_message.py
│   ├── visualization.py
│   ├── report.py
│   ├── user.py
│   └── item.py
├── schemas/              # Pydantic request/response models
│   ├── conversation.py
│   ├── user.py
│   ├── api_key.py
│   └── task.py
├── db/
│   ├── models/           # SQLAlchemy models
│   │   ├── analytics.py  # PipelineRun + BehaviorEvent tables
│   │   ├── user.py
│   │   ├── conversation.py
│   │   ├── visualization.py
│   │   ├── report.py
│   │   └── item.py
│   └── session.py
├── core/
│   ├── config.py         # Settings via pydantic-settings (.env)
│   ├── exceptions.py     # NotFoundError, AlreadyExistsError, …
│   ├── security.py       # JWT encode/decode, password hashing
│   ├── message_bus.py    # VizTask, VizResult event types
│   ├── middleware.py
│   └── sanitize.py
└── commands/             # CLI sub-commands (auto-discovered)
    ├── seed.py
    ├── cleanup.py
    └── example.py
```

### Frontend (`frontend/src/`)

```
frontend/src/
├── app/
│   ├── (auth)/           # Login, register pages
│   ├── (dashboard)/      # Chat, analysis, dashboard, profile pages
│   │   ├── chat/[id]/    # Chat conversation page
│   │   ├── analysis/[id]/ # Analysis results page
│   │   └── dashboard/    # Main dashboard
│   ├── api/              # Next.js API routes (BFF layer)
│   │   ├── auth/         # login, logout, me, refresh, register, oauth-callback
│   │   ├── conversations/ # conversation CRUD
│   │   └── v1/[...path]/ # Passthrough proxy to backend
│   ├── auth/callback/    # OAuth callback handler
│   └── settings/         # User settings page
├── components/
│   ├── analysis/         # Analysis result components (charts, report, upload, data cleaning summary)
│   ├── auth/             # Login/register forms, login-prompt dialog
│   ├── chat/             # Chat UI (container, input, sidebar, markdown, progress)
│   ├── home/             # Landing page
│   ├── layout/           # Header, sidebar
│   ├── settings/         # OpenRouter config modal
│   ├── theme/            # Theme provider + toggle
│   └── ui/               # shadcn/ui primitives (button, card, dialog, …)
├── contexts/
│   └── chat-context.tsx
├── hooks/
│   ├── use-auth.ts       # Auth actions (login, logout, register)
│   ├── use-chat.ts       # WebSocket streaming chat (authenticated)
│   ├── use-local-chat.ts # Guest (unauthenticated) chat
│   ├── use-conversations.ts
│   └── use-websocket.ts
├── i18n/
│   └── translations.ts   # EN + ZH translations
├── lib/
│   ├── api-client.ts     # Typed fetch wrapper
│   ├── server-api.ts     # Server-side fetch (for Next.js RSC)
│   ├── auth-token.ts     # Token helpers
│   ├── viz-critic.ts     # Visualization critic client
│   └── openrouter-models.ts
├── stores/               # Zustand state (auth, chat, sidebar, theme, …)
└── types/                # Shared TypeScript types
```

---

## Key Conventions

### Backend

- **Repositories:** use `db.flush()`, never `db.commit()` — the dependency manages transactions
- **Services:** raise `NotFoundError` / `AlreadyExistsError` from `app.core.exceptions`; never raise HTTP exceptions directly
- **Schemas:** separate `Create`, `Update`, `Response` models; `Response` schemas need `model_config = ConfigDict(from_attributes=True)`
- **Routes:** delegate all business logic to services; routes handle HTTP concerns only
- **Linting:** ruff with strict rules; mypy with strict mode — fix all type errors before committing
- **CLI:** the `autoviz` entry point is defined in `cli/commands.py`; sub-commands are auto-discovered from `app/commands/`

### AI Agents (`backend/app/agents/`)

All LLM prompts live in `prompts.py` — edit there, not inside agent files.

When adding agent tools, the docstring is the tool description sent to the LLM — write it precisely.

**Visualization pipeline** (`pipelines/visualization.py`):

```
For each turn (1..VIZ_TURNS):
  1. viz_main_agent        → plans VIZ_TARGET_CHARTS tasks
  2. viz_selector          → filters by feasibility + information gain (optional)
  3. viz_sub_agent         → generates Python code, runs in e2b sandbox, produces PNG
  4. viz_critic_agent      → accepts or rejects each chart (code retry / chart change)
  5. viz_annotation_agent  → writes annotation for accepted charts
  6. report_agent          → synthesizes all annotations into structured report
```

**Ingestion pipelines:**
- `tabular_upload.py` — handles CSV and JSON file uploads (unified entry point)
- `url_ingest.py` — fetches and parses data from a URL, with fallback to raw text

**Analytics** (`services/analytics_service.py`):
- Fire-and-forget: logs `PipelineRun` (timing, chart counts) and `BehaviorEvent` (agent actions) asynchronously — never blocks the main pipeline

Key config knobs (in `core/config.py` / `.env`):
- `VIZ_TARGET_CHARTS` — charts per turn (default 10)
- `VIZ_TURNS` — planning turns; total = `VIZ_TARGET_CHARTS × VIZ_TURNS`
- `VIZ_CONCURRENCY` — parallel sandbox tasks
- `VIZ_CRITIC_MAX_CODE_ROUNDS` — max code retry cycles per chart (default 3)
- `VIZ_CRITIC_MAX_SEMANTIC_REPLANS` — max chart-type/feature replacements (default 2)
- `VIZ_SELECTOR_ENABLED` — enable/disable pre-flight feasibility filter

### Frontend

- **Auth:** HTTP-only cookies managed by Next.js API routes; Zustand `useAuthStore` for client state
- **Guest mode:** `useLocalChat` handles unauthenticated users — same WebSocket streaming, no persisted history
- **Data fetching:** TanStack React Query for server state; `useChat` / `useLocalChat` hooks for WebSocket streaming
- **Styling:** Tailwind CSS v4 — no inline styles, no `style={}` props; brutalist design system
- **i18n:** `frontend/src/i18n/translations.ts` — EN + ZH; pass locale through component props, not a global context
- **API proxy:** `/api/v1/[...path]` forwards authenticated requests to the FastAPI backend
- **CSP:** `next.config.ts` defines Content-Security-Policy; add `frame-src` entries for any embedded iframes (e.g. YouTube)

---

## Environment Variables

Copy `backend/.env` and fill in secrets. Key variables:

```bash
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=autoviz

# JWT
SECRET_KEY=your_secret_key
ACCESS_TOKEN_EXPIRE_MINUTES=10080   # 7 days

# AI (OpenRouter)
OPENROUTER_API_KEY=sk-or-...
AI_MODEL=anthropic/claude-3.5-sonnet

# e2b (sandboxed code execution)
E2B_API_KEY=e2b_...
E2B_TEMPLATE_ID=autoviz-cjk         # Custom template with CJK fonts

# CORS
CORS_ORIGINS=["http://localhost:3000"]
```

---

## Adding Features

### New API endpoint (full stack)

1. Schema in `schemas/<entity>.py` (`Create`, `Update`, `Response`)
2. DB model in `db/models/<entity>.py` (if new table)
3. Repository in `repositories/<entity>.py`
4. Service in `services/<entity>.py`
5. Route in `api/routes/v1/<entity>.py`
6. Register router in `api/routes/v1/__init__.py`
7. Migration: `uv run autoviz db migrate -m "Add <entity> table"` then `uv run autoviz db upgrade`

### New CLI command

Create `app/commands/my_command.py` with a `@click.command()` function — auto-discovered by the CLI.

### New database migration

```bash
cd backend
uv run autoviz db migrate -m "description"
uv run autoviz db upgrade
```

---

## Docker

| File | Purpose |
|---|---|
| `docker-compose.yml` | Backend dev stack (API + PostgreSQL) |
| `docker-compose.frontend.yml` | Frontend dev container |
| `docker-compose.prod.yml` | Production stack with Traefik reverse proxy |
| `docker-compose.dev.yml` | Alternative dev configuration |

---

## Deployment

- **Frontend:** Firebase Hosting — `make deploy-frontend` (builds to `frontend/out`, deploys via Firebase CLI)
- **Backend:** Google Cloud Run — `make docker-gcr` (builds + pushes to `asia-east1-docker.pkg.dev/comp4502fyp/fyp4502`)
- **Database:** Cloud SQL (PostgreSQL) — connect via Unix socket on Cloud Run

---

## Docs

- `docs/architecture.md` — layered architecture details
- `docs/patterns.md` — code patterns with examples
- `docs/adding_features.md` — step-by-step feature guide
- `docs/testing.md` — testing guide and fixture reference
