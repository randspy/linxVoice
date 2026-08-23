# Contributing

1. Run `make setup` and `make hooks`.
2. Keep migrations explicit and generated OpenAPI artifacts committed.
3. Add behavior tests through public HTTP or rendered UI boundaries.
4. Run `make generate`, `make check`, and `make test` before opening a change.
5. Run `make infra-up && make migrate && make test-e2e` for synchronization changes.

Do not introduce a second Todo cache, direct browser writes, automatic mutation retries, or arbitrary Electric proxy parameters without a new decision record.

