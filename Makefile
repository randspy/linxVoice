UV ?= $(shell command -v uv 2>/dev/null || echo $(HOME)/.local/bin/uv)
PNPM := corepack pnpm

.PHONY: setup hooks infra-up infra-down migrate seed backend frontend dev generate check test test-e2e

setup:
	$(UV) sync --project backend --locked
	$(PNPM) --dir frontend install --frozen-lockfile

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
	$(PNPM) --dir frontend dev

dev: infra-up migrate
	$(MAKE) -j2 backend frontend

generate:
	cd backend && $(UV) run python -m linxvoice.openapi
	$(PNPM) --dir frontend generate:api

check:
	cd backend && $(UV) run ruff format --check src tests migrations
	cd backend && $(UV) run ruff check src tests migrations
	cd backend && $(UV) run mypy src
	$(PNPM) --dir frontend format:check
	$(PNPM) --dir frontend lint
	$(PNPM) --dir frontend typecheck

test:
	cd backend && $(UV) run pytest --cov --cov-branch --cov-report=term-missing
	$(PNPM) --dir frontend test:coverage

test-e2e:
	$(PNPM) --dir frontend test:e2e
