# Project instructions

## Learning objective

This is a Clean Architecture learning project. Backend changes must make architectural
boundaries explicit, even when a simpler implementation would require less code.

When proposing or implementing backend changes, explain which architectural layer owns each
responsibility and why. Do not describe code as Clean Architecture unless its dependency
direction is enforced by the import contracts.

## Backend architecture

Use these layers under `backend/src/linxvoice/`:

1. `domain`
   - Entities, value objects, domain services, domain rules, and domain errors.
   - May depend only on the Python standard library.
   - Must not import application, adapter, bootstrap, transport, ORM, or database code.
2. `application`
   - Use cases, commands, results, and ports expressed as `Protocol` interfaces.
   - May depend on `domain` and the Python standard library only.
   - Owns use-case orchestration and transaction semantics through ports.
3. `adapters`
   - Inbound HTTP controllers and Pydantic transport schemas.
   - Outbound SQLAlchemy repositories, Unit of Work implementations, and external clients.
   - Converts framework-specific objects to and from application/domain objects.
   - Translates domain/application errors into transport-specific responses.
4. `bootstrap`
   - Application construction, configuration, dependency wiring, and framework setup.
   - This is the only layer allowed to select and connect concrete implementations.

Dependencies must point inward:

    bootstrap -> adapters -> application -> domain

Inner layers must never import outer layers. Siblings in the same layer should not depend on
each other unless the dependency represents a deliberate shared abstraction.

## Location policy

All production backend modules must live under `domain`, `application`, `adapters`, or
`bootstrap`. Import Linter's exhaustive layers contract rejects modules outside these packages.
Record any intentional architectural exception in an ADR; never weaken an import contract merely
to make a change pass.

## Implementation rules

- Do not pass Pydantic models into application use cases.
- Do not return SQLAlchemy models from application use cases.
- Do not raise HTTP-status-aware exceptions from domain or application code.
- Do not perform SQLAlchemy queries directly inside use cases.
- Do not obtain dependencies through Flask globals in domain or application code.
- Inject dependencies through explicit ports.
- Keep framework validation at the transport boundary and business validation in the domain.
- Introduce an abstraction only when it represents a real architectural boundary.
- If a requested shortcut would violate these rules, explain the violation and request explicit
  approval before implementing it.

## Backend workflow

Before implementing a backend feature:

1. Identify the affected domain behavior and application use case.
2. State the intended dependency flow.
3. Define or update ports before concrete adapters.
4. Implement domain and application behavior independently of frameworks.
5. Implement and wire adapters in `bootstrap`.
6. Run `uv run lint-imports` from `backend/` and the relevant tests.

## Testing

- Domain tests must use no Flask, APIFlask, Pydantic, SQLAlchemy, HTTPX, or database.
- Application tests must use in-memory fakes that implement the ports.
- Adapter tests may use framework test clients and real PostgreSQL integration tests.
- Every use case must have behavior-focused tests.
- Run `make check` and the relevant test suites after changes.

### Optional mutation testing

`mutmut` is available as an optional diagnostic for assessing whether tests detect meaningful
behavior changes. Agents may run it when it is likely to add value; it is not a required check for
every change.

- Prefer mutation testing for domain invariants, application branching and error selection,
  boundary conditions, state transitions, and regression tests for subtle defects.
- Mutmut 3 does not currently generate mutants for dunder methods such as dataclass
  `__post_init__`. Do not interpret the absence of mutants for those domain rules as evidence that
  their boundary tests are sufficient.
- Usually skip it for documentation, formatting, dependency-only changes, generated code, simple
  wiring, and other changes where mutations would not provide useful evidence.
- Run the ordinary relevant tests first. Start with the smallest affected module or function, for
  example `cd backend && uv run mutmut run "linxvoice.application.todos.use_cases*"`, before
  considering a broad `uv run mutmut run`.
- The default mutation configuration excludes integration tests because mutmut's forked workers
  are incompatible with Testcontainers' Docker client on macOS. Persistence-adapter mutation
  testing requires a deliberate, fork-safe database test setup; keep using the real PostgreSQL
  integration suite for ordinary persistence verification.
- Treat surviving mutants as investigation prompts, not automatic demands for more assertions.
  Add a test when the mutation represents a meaningful behavior change; do not distort production
  code or add implementation-coupled tests merely to improve a mutation score.
- Prefer zero unexplained survivors in changed domain and application behavior over a blanket
  project-wide percentage target. Report the scope run and any unresolved survivors.
- Use `uv run mutmut results`, `uv run mutmut show <mutant-name>`, or `uv run mutmut browse` to
  inspect results. Keep mutmut's generated `backend/mutants/` workspace out of version control.

### Cognitive complexity analysis

`complexipy` is available for identifying Python functions whose nested control flow is difficult
to understand. The normal `make check` run enforces the configured threshold and committed
baseline. Agents may also run focused analysis when cognitive complexity is likely to provide
useful design or review evidence.

- Prefer focused analysis for nested business rules, orchestration, parsers, validation, error
  translation, and functions that are already difficult to review. Usually skip additional
  analysis for documentation, configuration, generated code, and mechanical changes.
- Run from `backend/`, for example `uv run complexipy src/linxvoice/application/todos/use_cases.py`
  or `uv run complexipy src/linxvoice --failed --suggest-refactors`.
- Treat scores and refactoring suggestions as investigation prompts, not correctness findings.
  Confirm any refactor with behavior-focused tests.
- Preserve architectural ownership while reducing complexity. Do not move transport concerns into
  application or domain code, introduce abstractions without a real boundary, or weaken an import
  contract merely to lower a score.
- Do not raise the threshold or refresh the snapshot merely to make a regression pass. If added
  complexity is justified, document the reason and report any intentional baseline change.
- Report the analyzed scope, notable findings, and any unresolved threshold violations.

## Code review rules

Flag as an architectural defect when:

- domain or application code imports an external framework;
- business behavior exists only in a route or repository;
- an ORM entity or HTTP DTO crosses the application boundary;
- a use case accesses a concrete database implementation;
- dependency wiring occurs outside the bootstrap layer;
- an Import Linter contract is weakened instead of correcting the dependency violation.
