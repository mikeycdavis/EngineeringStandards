# Design preparation - worktree acquisition and exact-HEAD controls (#48)

## Decision and boundary

Handling is inventory-first. Registered worktrees are classified from durable evidence as active,
stale (specifically, a stale registration where that is all the evidence proves), or unknown. Active
and unknown work are preserved. A stale registration is not
proof that former work is disposable. Pruning remains a separate owner-gated action after exact
target, ownership, staleness, and recoverable-work verification.

The actor and cause of the 2026-08-28 transition remain unknown. These controls are preventive; they
do not explain that event. This design performs no worktree mutation or live control experiment.

## Proposed checkpoints

1. Inventory registrations, accessibility, branch occupancy, exact HEAD, dirty/untracked state, and
   lock evidence before acquisition.
2. Select an unoccupied exact path and branch; capture common Git directory, symbolic branch, HEAD,
   and expected base before authoring.
3. Recheck branch and HEAD before applying work, before validation, after validation, before commit,
   and before any delivery action. Invalidate validation evidence when either identity changes.
4. Bind retained evidence to the measured commit and disclose the interval it covers.

Sequential checks detect changes only across their measured interval. They do not establish atomic
ownership or continuous exclusion; any later no-race claim needs stronger concurrency evidence. No
portfolio-wide lease implementation is proposed.

## Validation-route options; none selected

| Route | Boundary and trade-off |
| --- | --- |
| Clean reserved full checkout | Author in an isolated worktree, then validate the exact commit in a clean integration checkout; requires an actually reserved, clean checkout |
| Separate full clone | Avoids linked-worktree rejection but duplicates repository storage and acquisition state |
| Linked-worktree CI support | Would require separate approval to change current CI scripts, documentation, and tests; not part of #48's authorized batch |

The current local-CI contract rejects linked worktrees, so isolated authoring alone does not select a
validation route. Review must choose a route explicitly before implementation.

## Future non-destructive falsifiers

- inaccessible paths classify unknown; clean, old, merged, or detached alone never means stale;
- refuse an occupied branch, unexpected path, unexpected symbolic branch, or unexpected HEAD;
- invalidate evidence for branch/HEAD movement at every declared checkpoint;
- preserve dirty, active, and unknown registrations;
- demonstrate and document any race window left between the last check and the protected action.

No test may prune, unregister, move, clean, or repair a real worktree.
