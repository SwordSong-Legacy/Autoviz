.PHONY: install format lint test run clean help db-init docker-gcr docker-gcr-build docker-gcr-push deploy-frontend frontend-build firebase-deploy

# === Setup ===
install:
	uv sync --directory backend --dev
	@if git rev-parse --git-dir > /dev/null 2>&1; then \
		uv run --directory backend pre-commit install; \
	else \
		echo "⚠️  Not a git repository - skipping pre-commit install"; \
		echo "   Run 'git init && make install' to set up pre-commit hooks"; \
	fi
	@echo ""
	@echo "✅ Installation complete!"
	@echo ""
	@echo "Next steps:"
	@echo "  • make docker-db        # Start PostgreSQL"
	@echo "  • make db-upgrade       # Apply migrations"
	@echo "  • make run              # Start development server"
	@echo ""
	@echo "Note: backend/.env is pre-configured for development"

# === Code Quality ===
format:
	uv run --directory backend ruff format app tests cli
	uv run --directory backend ruff check app tests cli --fix

lint:
	uv run --directory backend ruff check app tests cli
	uv run --directory backend ruff format app tests cli --check
	uv run --directory backend mypy app

# === Testing ===
test:
	uv run --directory backend pytest tests/ -v

test-cov:
	uv run --directory backend pytest tests/ -v --cov=app --cov-report=html --cov-report=term-missing

# === Database ===
db-init: docker-db
	@echo "Waiting for PostgreSQL to be ready..."
	@sleep 3
	uv run --directory backend autoviz db upgrade
	@echo ""
	@echo "✅ Database initialized!"

db-migrate:
	@read -p "Migration message: " msg; \
	uv run --directory backend autoviz db migrate -m "$$msg"

db-upgrade:
	uv run --directory backend autoviz db upgrade

db-downgrade:
	uv run --directory backend autoviz db downgrade

db-current:
	uv run --directory backend autoviz db current

db-history:
	uv run --directory backend autoviz db history

# === Server ===
run:
	uv run --directory backend autoviz server run --reload

run-prod:
	uv run --directory backend autoviz server run --host 0.0.0.0 --port 8000

routes:
	uv run --directory backend autoviz server routes

# === Docker: Backend (Development) ===
docker-up:
	docker-compose up -d
	@echo ""
	@echo "✅ Backend services started!"
	@echo "   API: http://localhost:8000"
	@echo "   Docs: http://localhost:8000/docs"
	@echo "   PostgreSQL: localhost:5432"

docker-down:
	docker-compose down
	docker-compose -f docker-compose.frontend.yml down 2>/dev/null || true

docker-logs:
	docker-compose logs -f

docker-build:
	docker-compose build

docker-shell:
	docker-compose exec app /bin/bash

# === Docker: Frontend (Development) ===
docker-frontend:
	docker-compose -f docker-compose.frontend.yml up -d
	@echo ""
	@echo "✅ Frontend started!"
	@echo "   URL: http://localhost:3000"
	@echo ""
	@echo "Note: Backend must be running (make docker-up)"

docker-frontend-down:
	docker-compose -f docker-compose.frontend.yml down

docker-frontend-logs:
	docker-compose -f docker-compose.frontend.yml logs -f

docker-frontend-build:
	docker-compose -f docker-compose.frontend.yml build

# === Docker: Production (with Traefik) ===
docker-prod:
	docker-compose -f docker-compose.prod.yml up -d
	@echo ""
	@echo "✅ Production services started with Traefik!"
	@echo ""
	@echo "Endpoints (replace DOMAIN with your domain):"
	@echo "   Frontend: https://$$DOMAIN"
	@echo "   API: https://api.$$DOMAIN"
	@echo "   Traefik: https://traefik.$$DOMAIN"

docker-prod-down:
	docker-compose -f docker-compose.prod.yml down

docker-prod-logs:
	docker-compose -f docker-compose.prod.yml logs -f

docker-prod-build:
	docker-compose -f docker-compose.prod.yml build

# === Docker: Google Cloud Run ===
GCR_REGISTRY ?= asia-east1-docker.pkg.dev/comp4502fyp/fyp4502
GCR_IMAGE ?= fyp4502-backend
GCR_TAG ?= latest

docker-gcr-build:
	docker build -t $(GCR_REGISTRY)/$(GCR_IMAGE):$(GCR_TAG) ./backend

docker-gcr-push:
	docker push $(GCR_REGISTRY)/$(GCR_IMAGE):$(GCR_TAG)

docker-gcr: docker-gcr-build docker-gcr-push
	@echo ""
	@echo "✅ Backend image pushed to $(GCR_REGISTRY)/$(GCR_IMAGE):$(GCR_TAG)"

# === Firebase: Frontend Deployment ===
frontend-build:
	cd frontend && bun run build

firebase-deploy:
	cd frontend && firebase deploy

deploy-frontend: frontend-build firebase-deploy
	@echo ""
	@echo "✅ Frontend built and deployed to Firebase"

# === Docker: Individual Services ===
docker-db:
	docker-compose up -d db
	@echo ""
	@echo "✅ PostgreSQL started on port 5432"
	@echo "   Connection: postgresql://postgres:postgres@localhost:5432/autoviz"

docker-db-stop:
	docker-compose stop db

# === Cleanup ===
clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .ruff_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .mypy_cache -exec rm -rf {} + 2>/dev/null || true
	rm -rf htmlcov/ .coverage coverage.xml

# === Help ===
help:
	@echo ""
	@echo "autoviz - Available Commands"
	@echo "======================================"
	@echo ""
	@echo "Setup:"
	@echo "  make install       Install dependencies + pre-commit hooks"
	@echo ""
	@echo "Development:"
	@echo "  make run           Start dev server (with hot reload)"
	@echo "  make test          Run tests"
	@echo "  make lint          Check code quality"
	@echo "  make format        Auto-format code"
	@echo ""
	@echo "Database:"
	@echo "  make db-init       Initialize database (start + migrate)"
	@echo "  make db-migrate    Create new migration"
	@echo "  make db-upgrade    Apply migrations"
	@echo "  make db-downgrade  Rollback last migration"
	@echo "  make db-current    Show current migration"
	@echo ""
	@echo "Docker (Development):"
	@echo "  make docker-up            Start backend services"
	@echo "  make docker-down          Stop all services"
	@echo "  make docker-logs          View backend logs"
	@echo "  make docker-build         Build backend images"
	@echo "  make docker-frontend      Start frontend (separate)"
	@echo "  make docker-frontend-down Stop frontend"
	@echo "  make docker-db            Start only PostgreSQL"
	@echo ""
	@echo "Docker (Production with Traefik):"
	@echo "  make docker-prod          Start production stack"
	@echo "  make docker-prod-down     Stop production stack"
	@echo "  make docker-prod-logs     View production logs"
	@echo ""
	@echo "Docker (Google Cloud Run):"
	@echo "  make docker-gcr          Build + push backend to GCR"
	@echo "  make docker-gcr-build    Build backend image only"
	@echo "  make docker-gcr-push     Push backend image only"
	@echo ""
	@echo "Firebase (Frontend):"
	@echo "  make deploy-frontend     Build + deploy to Firebase"
	@echo "  make frontend-build      Build frontend only"
	@echo "  make firebase-deploy     Deploy to Firebase only"
	@echo ""
	@echo "Other:"
	@echo "  make routes        Show all API routes"
	@echo "  make clean         Clean cache files"
	@echo ""
