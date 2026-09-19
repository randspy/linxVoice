# Domain Docs

## Layout

Use a single context: `CONTEXT.md` at the repository root and the existing `docs/adr/` directory. Backend and frontend share this domain vocabulary.

## Before exploring

Read `CONTEXT.md` when present, `docs/architecture.md`, and ADRs relevant to the work. Follow `AGENTS.md` for architectural ownership and enforced dependency direction.

If `CONTEXT.md` does not exist, proceed silently. The domain-modeling skill creates it lazily when terms or decisions are resolved; do not create an empty glossary during setup.

## Vocabulary and decisions

Use glossary terms consistently in issues, proposals, and tests. Note meaningful gaps for domain-modeling. Explicitly identify any conflict with an existing ADR rather than silently overriding it. New ADRs belong in `docs/adr/` and continue the existing numbering.
