# linxVoice backend

The backend uses Clean Architecture: a framework-independent domain, application use cases and
ports, Flask/Pydantic and SQLAlchemy adapters, and a bootstrap composition root. Import Linter
enforces inward dependencies. It exposes a typed command API and a restricted Electric Shape
proxy.
