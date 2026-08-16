# Local Docker CI, and verified pull request submission

GitHub remains the source-control, pull-request and review system. What it is no longer required to
do is *prove that a branch works*. That proof is produced here, in an ephemeral Docker container, on
the developer's machine, before the branch is pushed.

The invariant this exists to enforce is one sentence:

> **A pull request may only be submitted if the exact commit SHA being pushed has successfully
> passed the repository's complete containerized CI pipeline.**

Everything below is in service of that sentence being true rather than aspirational.

## Why this repository in particular

GitHub-hosted Actions have been unreliable for this account since the repository's first day: thirty
consecutive red runs said nothing about the code because no runner could start, and the required
check went unexercised until 2026-08-11. A gate that cannot be observed is not a gate. Local CI is
independently usable and does not care whether Actions can run.

## Prerequisites

| Command | Needed for | Notes |
| --- | --- | --- |
| **Docker** | `ci`, `submit-pr` | Engine plus Compose v2 (`docker compose`, not `docker-compose`). |
| **git** | `ci`, `submit-pr` | The audit resolves repository membership and ignore rules through git. |
| **gh** | the pull request only | Your existing authenticated session. No token is read, written, or stored. |

**Node is not a prerequisite.** The checks run against a Node baked into the CI image at a pinned
digest; even the submission gate is evaluated inside that image. A green run therefore says nothing
about what happens to be installed on the machine that produced it, which is the point.

## Running CI

```bash
.\scripts\ci.ps1
```

On Linux or macOS, and on a future self-hosted runner:

```bash
./scripts/ci.sh
```

Exit `0` means every gating check passed. Anything else means it did not. Options:

| Option | Effect |
| --- | --- |
| `-KeepOnFailure` / `--keep-on-failure` | Leave the container in place when the run fails, and print the commands to inspect it. |
| `-Verbose` / `--verbose` | Print each stage's rationale before it runs. Stage output is always shown. |
| `-Project` / `--project` | Reuse a specific compose project name; only useful when re-attaching to a kept run. |

Run it as often as you like — it submits nothing and pushes nothing.

## What CI performs

The stage list lives in one place, [`scripts/pipeline.mjs`](../scripts/pipeline.mjs), and both
executors read it: the container here, and `.github/workflows/ci.yml` on a runner. `npm run pipeline`
prints it.

| Stage | Command | Gating | What it establishes |
| --- | --- | --- | --- |
| `inventory` | `npm run inventory` | yes | The standards series has not silently changed shape. |
| `fidelity` | `npm run fidelity` | yes | Every block claiming to be verbatim source is verbatim, against that standard's own declared source sections. |
| `policy` | `npm run policy` | yes | `project-policy.yml` validates against its schema, and no compliance condition such as an expired exception is outstanding. |
| `diagrams` | `npm run diagrams` | yes | Mermaid source and its embedded copies have not drifted (Standard 39 R4). |
| `test` | `npm test` | yes | The full `node:test` suite, including the assertion that this repository's own audit produces no error-severity finding. |
| `audit` | `npm run audit` | yes | The audit tool run against the repository that defines it. Deliberately not `--strict`. |
| `validate` | `npm run validate` | **no** | The authoritative compliance verdict (ADR 0004). See below. |

**There is no dependency-installation stage, and its absence is a decision.** This repository has
zero third-party dependencies, recorded in [`design/standards-audit-cli.md`](../design/standards-audit-cli.md)
and enforced structurally by CI having no install step. An `npm ci` appearing in the pipeline or an
`apt-get` in the image would mean that decision changed.

### Why `validate` does not gate

`validate` is the authoritative verdict and **this repository is intentionally `NON_COMPLIANT`** —
rules carry recorded human rejections, so exit 1 is the correct answer and will stay the correct
answer until those rejections are withdrawn. `.github/workflows/ci.yml` already separates it into
its own non-required job for exactly this reason: while it lived in the required job, the required
check could never pass, and with PR-only protection that left no legal path to change `develop`.

Local CI reproduces that boundary rather than inventing one. `validate` runs on every local run, its
real exit code is recorded in the verification record and printed in the summary, and it is never
suppressed or reported as a pass. What it does not do is decide whether a pull request may be
opened — because on GitHub it does not decide that either. This is the one place where a check's
failure does not block, and it is documented here, in the pipeline manifest, and in a test that
fails if the two executors ever disagree about it.

## Submitting a verified pull request

```bash
.\scripts\submit-pr.ps1
```

The sequence, in order, and each step is a refusal point:

1. Verify this is a Git repository, on a branch, and not on `master`, `main`, or `develop`.
2. Refuse a dirty working tree. CI verifies a *commit*; an uncommitted change is not in one.
3. Record `git rev-parse HEAD`.
4. Run the complete containerized pipeline.
5. Stop if it failed — `CI failed. No branch was pushed and no PR was created.`
6. Resolve `HEAD` again and refuse if it moved — `HEAD changed after CI verification. The current commit has not been verified. Re-run CI before submitting.`
7. Check the pipeline's own record names that same commit, a complete run, and a containerized one.
8. Push **`<sha>:refs/heads/<branch>`** — the verified SHA explicitly, not the branch name, so a
   commit landing between the check and the push still cannot be what reaches the remote.
9. Create the pull request with `gh`, appending the verification block to your body.

Options: `-Base develop` (default), `-Title`, `-Body` / `-BodyFile`, `-Draft`, `-SkipPr`.

The script never commits, never amends, never stashes, never force-pushes, and never pushes when
verification failed. If CI is red the answer is to fix the code.

> **`submit-pr` is PowerShell only.** There is no `.sh` twin, deliberately: this repository's
> developer platform is Windows, and shipping a second untested implementation of the submission
> sequence would be the duplication the gate design exists to avoid. The *decision* is already
> platform-neutral — [`scripts/submit-gate.mjs`](../scripts/submit-gate.mjs) — so a POSIX twin would
> be plumbing only, and is a small, deliberate follow-up rather than an accident.

## Verification evidence

Every run prints repository, branch, verified commit, scope, environment, the stages executed with
their outcomes, the result, and a completion timestamp. The block is rendered inside the container,
because the container is the only party that knows what it actually ran.

It also writes `artifacts/local-ci/latest.json`, which is git-ignored — it is one machine's
transient record, not a reviewed artifact, and this repository's intentional evidence-retention
lives elsewhere (attestations in `project-policy.yml`, reviews under `artifacts/`).

```json
{
  "result": "passed",
  "failedStage": null,
  "commit": "9cb5376f397ca2bab4631363d8718f8826f02ca1",
  "branch": "chore/local-docker-ci",
  "repository": "https://github.com/mikeycdavis/EngineeringStandards.git",
  "environment": { "node": "v20.20.2", "image": "engineeringstandards-ci:engineeringstandards-ci-1755300000000-4812", "containerized": true },
  "scope": "complete",
  "startedAt": "…",
  "completedAt": "…",
  "checks": [{ "id": "test", "outcome": "passed", "exitCode": 0, "gating": true }]
}
```

Three fields exist to stop a record being read as more than it is. `commit` is resolved *inside* the
container, so a stale image announces itself rather than passing under the current commit's name.
`scope` is `partial` when only some stages ran, and the gate refuses anything but `complete`.
`containerized` is false for a host run, and the gate refuses those too — a pass on the developer's
machine proves the developer's machine.

### What the record is not

It is not tamper-evident, and nothing here should be read as claiming otherwise. The file is plain
JSON in the developer's own working tree; anyone who can run `submit-pr` can also write
`latest.json` by hand, and no signature, digest, or sealed channel stands between the two. The three
fields above defend against a record being *wrong* — stale, partial, produced outside the container
— not against one being *forged*.

That is a deliberate scope, not an unexamined gap. The threat model here is developer error and
drift: the run that quietly verified a different commit, the record left over from an earlier
branch, the pipeline that only got halfway. Against an author who has decided to fabricate a pass,
a local file offers no defence and cannot be made to — they already hold the push credential and the
working tree, and any secret the check could consult, they could read. Making the record
cryptographically self-certifying would move the problem to where the key lives, not solve it.

The control that survives a hostile author is not this file. It is that the pushed commit is public
and re-verifiable by anyone: the pipeline is deterministic, the base image is digest-pinned, and a
reviewer — or a runner that is not the author's machine — can run the same stages against the same
SHA and compare. Local verification is a claim the author makes; reproducibility is what makes the
claim checkable. Treat `latest.json` as the author's signed statement in the informal sense, and
weigh it accordingly.

## What the pull request claims

```markdown
## Local CI

This pipeline ran in an ephemeral Docker container on the author's machine.
It is **not** a GitHub-hosted Actions run and makes no claim about one.

- Verified commit: `<full sha>`
- Result: **PASS**
- Environment: Docker (…)
```

Your body is never replaced; the block is appended below a rule. The wording is asserted by a test:
reporting a GitHub-hosted success that did not happen would be `errors.no-false-success` reasoning
applied one level up from the code.

## Isolation

**Containers and networks.** Each run gets a unique compose project name derived from the repository
directory plus a timestamp and PID, so two concurrent runs — of this repository or any other — cannot
share a container, a network, or a teardown. Teardown removes exactly what the run created. There is
no `docker system prune` anywhere in these scripts and a test asserts there never is one: a CI script
that garbage-collects the host is a CI script that deletes someone's work.

**The host filesystem.** The repository is *copied into the image*, not bind-mounted. Nothing on the
host is reachable from inside the container, so a failing test cannot touch the working tree even if
it tries — which matters here, because the suite genuinely writes files (the invocation-ownership
negative control materialises a patched copy of the evaluator). The verification record is copied
*out* of the stopped container afterwards.

**The network.** `network_mode: none`. The pipeline resolves nothing and installs nothing, so the
strongest setting is also the correct one — and it is a check as much as a hardening: if a stage ever
starts needing the network, the run fails rather than quietly depending on the developer's
connectivity.

**Privileges.** The pipeline runs as the non-root `node` user. The Docker socket is not mounted;
nothing in this pipeline starts a container.

**Databases.** There are none. This repository has no database, cache, or message broker: the checks
read files, run `git`, and compare text. No developer database is touched because no database is
involved at all. The standing preference — T-SQL on `localhost` — is a preference for *if* one is
needed, and one is not; adding a SQL Server container to satisfy a template would be a service
nothing connects to. [`compose.ci.yml`](../compose.ci.yml) documents exactly how a dependency would
be added when that changes: a sibling service with a real `healthcheck`, depended on by
`condition: service_healthy`. `scripts/ci.*` already brings up every non-`ci` service with
`docker compose up --wait`, which blocks on those healthchecks and fails when one never becomes
healthy. No sleep is involved now and none would be then.

## Failures and debugging

Cleanup runs on every exit path — success, failure, and interruption — because cleanup that only
happens on success is cleanup that never happens when it matters.

To keep the container for inspection:

```bash
.\scripts\ci.ps1 -KeepOnFailure
```

It prints the exact commands, which are:

```bash
docker logs <project>-ci
```

```bash
docker compose -p <project> -f compose.ci.yml run --rm --entrypoint bash ci
```

That second one drops you into the same image, at `/work`, with the same tree CI saw. Individual
stages can be run there: `node scripts/pipeline.mjs run audit`. Remember that a partial run's record
is marked `partial` and cannot be used to submit.

Remove a kept run:

```bash
docker rm -f <project>-ci && docker compose -p <project> -f compose.ci.yml down --volumes --remove-orphans
```

## Local CI versus GitHub Actions

They are not the same thing and the documentation does not pretend otherwise.

| | Local Docker CI | GitHub Actions |
| --- | --- | --- |
| Runs | Before push, on the developer's machine | On push and pull request, if a runner is available |
| Proves | This commit passed the gating checks in a pinned container | The same, on GitHub's infrastructure |
| Required for a PR | **Yes**, by `scripts/submit-pr.ps1` | No |
| Check list | `scripts/pipeline.mjs` | `.github/workflows/ci.yml`, running the same commands |

The workflows were **not** deleted. `ci.yml` still runs the same `npm run …` commands, and a test
(`test/local-ci.test.mjs`) fails if the workflow and the pipeline manifest ever name different sets —
in either direction, so a step added to the workflow by hand is caught as readily as one removed.

### What cannot be reproduced locally

| Not reproduced | Why |
| --- | --- |
| `standards-dogfood.yml` | It exercises GitHub's `workflow_call` resolution — checking out the framework from GitHub at a pinned SHA and invoking a reusable workflow. That *is* the thing under test (ADR 0013, distribution fidelity); running it locally would test something else. Its local equivalent is the `validate` stage, which produces the verdict the distributed check must reproduce. |
| Branch protection and required-check status | A property of the GitHub repository, not of any pipeline. Note that `gh api …/branches/develop/protection` currently returns 404 — protection is not configured. |
| `actions/upload-artifact`, job summaries | Runner-hosted presentation. The equivalent evidence is `artifacts/local-ci/latest.json` and the printed summary. |
| Multi-OS or multi-Node matrices | Neither workflow declares one today. See the Node disposition below. |
| A linked `git worktree` checkout | `.git` there is a file pointing at an absolute host path outside the build context, so the copied pointer resolves to nothing and every `git` call in the container fails. Both entry points detect this and refuse by name. Supporting it would mean copying an arbitrary host path into the image — the broad host reach this environment exists to avoid — to serve a checkout shape one `cd` steps out of. |

Nothing from the existing pipeline was dropped. Every `run:` step in the required `test` job maps to
a gating stage, and the `validate` job maps to the advisory stage — asserted by test, both ways.

### Which Node this pipeline speaks for

The image pins Node 20 by digest, and Node 20 is the version this pipeline makes claims about. A
green run says the checks pass on Node 20 — not that they pass on every Node the package permits.

`package.json` declares `engines: ">=18"`, and that is a **package compatibility floor**, not a
statement that CI verified 18. The two are deliberately different things and the difference is
recorded rather than reconciled: nothing here has ever run on 18, so raising the floor to 20 would
discard a compatibility claim that may well be true, while adding an 18 stage would double the
runtime of every local run to defend a version no consumer has reported using. If a consumer ever
does, the resolution is a matrix in `scripts/pipeline.mjs` — one entry, both executors inherit it —
and not a change to how verification works.

### Supported submission entry point

Verification is cross-platform; **submission is Windows-first, and deliberately so.**

`scripts/ci.sh` is a complete equivalent of `scripts/ci.ps1`: Linux and macOS developers can run the
full pipeline and get the same record. There is no `submit-pr.sh`, so the `verified SHA → push → PR`
workflow has one supported entry point, `scripts/submit-pr.ps1`, which needs PowerShell 7 (available
on Linux and macOS, and how a POSIX developer would drive it today).

The asymmetry is not an oversight and `ci.sh` should not be read as implying parity. The decision
that matters — every refusal, in order — lives in `scripts/submit-gate.mjs`, a pure function tested
directly and executed inside the container. A second shell implementation would not add a platform;
it would add a second paraphrase of the invariant, and a paraphrase is exactly the thing that drifts
from the rule it restates. If a native POSIX submitter is ever wanted, it should call the same gate
module rather than re-derive its logic.

## Self-hosted runner, later

Nothing needs redesigning to add one. A self-hosted runner would invoke `./scripts/ci.sh` and nothing
else; the stage list, the image, the isolation and the evidence record are all already inside that
call. No runner is configured today and none is required.

## Reusing this in another repository

Copy `compose.ci.yml`, `ci/Dockerfile`, `.dockerignore`, `scripts/ci.ps1`, `scripts/ci.sh`,
`scripts/pipeline.mjs`, `scripts/submit-gate.mjs`, `scripts/submit-decide.ps1`,
`scripts/submit-pr.ps1`, and the `artifacts/local-ci/` line from `.gitignore`. Then change two
things: the `STAGES` list in `scripts/pipeline.mjs`, and the base image in `ci/Dockerfile` if the
project is not Node. Container, image, and project names are derived from the repository directory,
so nothing else is repository-specific.
