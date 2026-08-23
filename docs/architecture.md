# Architecture

## Ownership map

| Concern | Owner |
| --- | --- |
| Durable Todo state | PostgreSQL |
| Validation and write authorization boundary | Flask/APIFlask |
| Replicated read path | Electric Shape stream |
| Local normalized state and optimistic mutations | TanStack DB |
| Request-oriented readiness data | TanStack Query |
| URL filter state and loading boundaries | TanStack Router |
| Form state and client validation | TanStack Form + generated Zod |

The frontend never keeps a second Todo cache in TanStack Query. Query is used only for readiness diagnostics.

## Todo model

`todos(id UUID, title VARCHAR(200), completed BOOLEAN, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, version INTEGER)`

The browser generates UUIDs and provisional optimistic timestamps. Flask owns canonical timestamps, completion-at-creation, and versions. PostgreSQL duplicates durable non-null, length, and positive-version invariants. `REPLICA IDENTITY FULL` allows Electric to describe updates and deletes completely.

## Failure semantics

- Validation is returned as RFC 9457 `application/problem+json` with field errors.
- Missing `If-Match` is `428`; stale versions are `412`; duplicate IDs are `409`.
- Writes are not retried automatically.
- A definitive API rejection rolls back the optimistic row.
- An Electric confirmation timeout triggers collection reload and a delayed-sync message, not a claim that the write failed.
- Controls for one Todo are disabled while its mutation is pending; unrelated Todos remain interactive.

## Local topology

PostgreSQL and Electric run in Compose. Flask and Vite run on the host for fast reloads. Vite proxies `/api`, `/healthz`, and `/readyz` to Flask, matching the same-origin browser boundary.

No production images or deployment configuration are maintained.

