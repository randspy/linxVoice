# Architecture

## Backend dependency rule

The backend follows Clean Architecture with four explicit layers:

| Layer | Owns | Allowed dependencies |
| --- | --- | --- |
| `domain` | Todo entities, value objects, and business invariants | Python standard library |
| `application` | Use cases, commands, results, repository ports, and Unit of Work port | `domain` |
| `adapters` | Flask/Pydantic transport, SQLAlchemy persistence, Electric proxy | `application`, `domain` |
| `bootstrap` | Configuration, dependency wiring, executable entry points | All inward layers |

Dependencies point inward: `bootstrap -> adapters -> application -> domain`. The domain and
application layers never import Flask, APIFlask, Pydantic, SQLAlchemy, HTTPX, or other delivery
and persistence frameworks. Import Linter enforces both the direction and exhaustive placement of
production modules.

Todo commands enter through the HTTP adapter as Pydantic transport models and are converted to
framework-independent application commands. The application service opens the Unit of Work,
coordinates the repository port, and returns domain entities. The SQLAlchemy adapter performs the
atomic version check and maps ORM records to domain entities. HTTP errors are produced only by the
HTTP adapter.

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

## Frontend dependency rule

The Todo feature uses five explicit roles. Other features can start smaller and extract these
roles when they have responsibilities to separate:

| Layer | Owns | Allowed dependencies |
| --- | --- | --- |
| `domain` | Framework-independent entities, value types, and business invariants | Other domain modules |
| `application` | Use cases, outcomes, observable application state, and ports | `domain`, other application modules |
| `adapters` | TanStack DB/Electric repositories, generated HTTP gateways, and React bindings for external stores | `application`, `domain`, integrations |
| `presentation` | React views, form interaction, and display formatting | `application`, `domain`, shared UI |
| `bootstrap` and `routes` | Concrete construction and dependency wiring | All feature layers |

Dependencies point inward from composition to adapters and presentation, then to application and
domain. Presentation components receive application services and view data as props; they do not
import a repository, generated SDK, or TanStack DB. Application modules do not import React or any
other package. ESLint's `architecture/feature-boundaries` rule enforces these directions for
production modules in the feature layers, including aliases, re-exports, and dynamic imports.
The normal lint command also runs the dependency-contract tests. See ADR 0004 for the allowed
presentation packages and shared directories.

The Todo feature demonstrates the split. The domain normalizes titles and constructs optimistic
entities. `TodoService` owns command orchestration and mutation-state semantics through a
`TodoRepository` port. The TanStack repository implements that port and translates HTTP/Electric
behavior into application outcomes. The `/todos` route is the composition boundary that connects
the live-query adapter and service to the React view.

On a confirmation timeout, the repository immediately returns a delayed outcome. The service marks
sync as delayed before asking the repository to reload; a reload failure preserves that status
and does not report the accepted write as rejected. Time and ID generation are injected functions.

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
