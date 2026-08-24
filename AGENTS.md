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

## Code review rules

Flag as an architectural defect when:

- domain or application code imports an external framework;
- business behavior exists only in a route or repository;
- an ORM entity or HTTP DTO crosses the application boundary;
- a use case accesses a concrete database implementation;
- dependency wiring occurs outside the bootstrap layer;
- an Import Linter contract is weakened instead of correcting the dependency violation.
