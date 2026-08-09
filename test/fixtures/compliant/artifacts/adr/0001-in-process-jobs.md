# 0001 — Use an in-process job runner

- **Status:** Accepted
- **Date:** 2026-01-01

## Context

The fixture needs one recorded decision so the ADR rule has something to observe.

## Decision

Schedule the nightly job in-process rather than adding a queue.

## Consequences

Simpler deployment; no horizontal scaling of jobs.
