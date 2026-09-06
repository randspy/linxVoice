# ADR 0004: Enforce inward dependencies in frontend features

Status: accepted

The Todo feature separates `domain`, `application`, `adapters`, `presentation`, and `bootstrap`
because optimistic writes and sync confirmation give each role a concrete responsibility. This
follows the separation of views, models, and data access described in
[Modularizing React Applications](https://martinfowler.com/articles/modularizing-react-apps.html).
The five folders are not a template required for every feature: start small and extract roles as
behavior warrants them. Routes are also composition roots because TanStack Router owns their
lifecycle and supplies runtime clients.

Domain code is plain TypeScript and can import other domain modules. Application code can import only domain and other
application modules. External systems are isolated behind adapters. React views receive data and
application services from bootstrap instead of locating a TanStack DB client or generated HTTP
client themselves.

The allowed dependency direction is:

`bootstrap/routes -> adapters/presentation -> application -> domain`

ESLint checks production modules placed in these layers, resolving relative paths and the `@/`
alias before checking allowed dependencies. It covers imports, re-exports, literal dynamic imports,
TypeScript import types, and CommonJS imports. Computed import paths are rejected because their
targets cannot be checked statically. Domain and application have no package dependencies. Views
can use React, React DOM, TanStack Form, Zod, shared UI components/utilities, and feature styles;
data packages and API clients belong in adapters. Adapters can use packages and the API, utility,
and integration directories. These contracts are verified as part of frontend lint.

Use functions for single-operation dependencies such as the clock and ID generator. Keep ports
for the actual repository and command boundaries, without introducing a generic service framework.
