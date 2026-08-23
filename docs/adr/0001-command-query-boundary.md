# ADR 0001: Separate commands from synchronized queries

Status: accepted

All Todo mutations pass through Flask. All Todo reads pass through Electric into TanStack DB. Flask does not expose `GET /todos`, and the browser cannot choose arbitrary Electric shapes.

This preserves one validation/concurrency boundary and one reactive client cache. The restricted Flask shape proxy is also the future location for authorization.

