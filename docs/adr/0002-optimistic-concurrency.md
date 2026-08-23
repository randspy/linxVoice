# ADR 0002: Use explicit optimistic concurrency

Status: accepted

Todos carry a positive integer `version`. `PATCH` and `DELETE` require the current version as a strong `If-Match` ETag. Updates atomically match and increment the version.

A stale precondition returns `412`. Rename conflicts preserve the attempted draft and require an explicit retry; no client silently overwrites another client.

