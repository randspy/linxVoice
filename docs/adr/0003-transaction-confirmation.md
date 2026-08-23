# ADR 0003: Confirm optimistic writes through Electric transaction IDs

Status: accepted

Flask reads the raw 32-bit PostgreSQL transaction ID inside the mutation transaction and returns it with every command response. TanStack DB retains its optimistic overlay until that ID appears in Electric’s stream.

After ten seconds without confirmation, the UI treats the outcome as indeterminate and reloads the collection. It does not retry the command automatically because the database commit may already have succeeded.

