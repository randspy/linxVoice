UV ?= $(shell command -v uv 2>/dev/null || echo $(HOME)/.local/bin/uv)
PNPM := corepack pnpm

.PHONY: setup hooks infra-up infra-down migrate seed backend frontend dev generate check test test-e2e

setup:
	$(UV) sync --project backend --locked
	cd frontend && $(PNPM) install --frozen-lockfile

hooks:
	cd backend && $(UV) run pre-commit install

infra-up:
	docker compose up -d --wait

infra-down:
	docker compose down

migrate:
	cd backend && $(UV) run alembic upgrade head

seed:
	cd backend && $(UV) run python -m linxvoice.seed

backend:
	cd backend && $(UV) run flask --app linxvoice.app run --debug --port 5000

frontend:
	cd frontend && $(PNPM) dev

dev: infra-up migrate
	$(MAKE) -j2 backend frontend

generate:
	cd backend && $(UV) run python -m linxvoice.openapi
	cd frontend && $(PNPM) generate:api

check:
	cd backend && $(UV) run ruff format --check src tests migrations
	cd backend && $(UV) run ruff check src tests migrations
	cd backend && $(UV) run mypy src
	cd frontend && $(PNPM) format:check
	cd frontend && $(PNPM) lint
	cd frontend && $(PNPM) typecheck

test:
	cd backend && $(UV) run pytest --cov --cov-branch --cov-report=term-missing
	cd frontend && $(PNPM) test:coverage

test-e2e:
	cd frontend && $(PNPM) test:e2e
