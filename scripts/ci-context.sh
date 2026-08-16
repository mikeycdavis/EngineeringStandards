#!/usr/bin/env bash
# Materialise the Docker build context for a local CI run from committed repository content.
#
# The POSIX twin of scripts/ci-context.ps1, which carries the full rationale. In short:
#
#   Local CI verifies a deterministic materialisation of the exact committed HEAD, never the host
#   checkout's byte representation.
#
# `COPY . /work` over the working directory verifies what one platform's checkout happened to
# materialise. Git stores normalised content and materialises it per platform, so the same commit is
# CRLF on a Windows checkout and LF on `ubuntu-latest`. Measured on a373d4c: 273 pass / 1 fail from
# one, 274 pass / 0 fail from the other, identical committed content. A local gate that verifies host
# bytes can fail what the runner passes, and pass what the runner fails.
#
# A clone rather than `git archive`, because scripts/repository.mjs asks git — with no fallback, by
# design — which paths are tracked and ignored, what blob identity a reviewed path has at HEAD, and
# whether a reviewed path is dirty. An archive plus a synthesised repository would trade the CRLF
# mismatch for ADR 0008's source-of-truth defect.
#
# No bind mount, no Docker socket, no host path reachable from the run: the context is built on the
# host, copied into the image, and deleted. Isolation is unchanged; only the origin of the bytes moved.
#
# Usage:
#   scripts/ci-context.sh <repo-root> <project>   # prints the context path on stdout
set -euo pipefail

repo_root="${1:?usage: ci-context.sh <repo-root> <project>}"
project="${2:?usage: ci-context.sh <repo-root> <project>}"

command -v git >/dev/null 2>&1 || {
  echo "git was not found on PATH. It is required to materialise the CI context." >&2
  exit 2
}

sha="$(git -C "$repo_root" rev-parse HEAD)"
branch="$(git -C "$repo_root" rev-parse --abbrev-ref HEAD)"
# Carried over rather than left pointing at the temporary clone: the pipeline records
# `remote.origin.url` as the repository the run describes.
origin="$(git -C "$repo_root" config --get remote.origin.url 2>/dev/null || true)"

# A consequence of the invariant rather than an extra rule. Once the context is committed content, an
# uncommitted edit is invisible to the run, so a pass would describe a tree the developer is not
# looking at — a false success in the sense `errors.no-false-success` names. `--porcelain` excludes
# ignored files, so the run's own artifacts directory does not block a run.
status="$(git -C "$repo_root" status --porcelain)"
if [ -n "$status" ]; then
  cat >&2 <<EOF
the working tree has uncommitted changes, and local CI verifies committed content at HEAD.
Anything not committed would be absent from the run, so a pass would describe a tree you are not
looking at. Commit or stash, then re-run.

$status
EOF
  exit 2
fi

context_root="${TMPDIR:-/tmp}/${project}-context"
rm -rf "$context_root"

# A half-built context must not survive. The caller only learns the path if this script prints it, so
# a failure between the clone and the confirmation below would leave a directory nobody owns and
# nobody deletes — and, worse, one holding a partial materialisation of a commit under a name that
# says it is that commit. Removed by the exact path this invocation created, never by a sweep.
cleanup_partial() { rm -rf "$context_root"; }
trap cleanup_partial ERR

# `--no-checkout` so nothing is materialised under the host's defaults; the working tree is created
# by the explicit checkout below, under the config pinned here. `--no-hardlinks` makes the context
# self-contained rather than sharing storage with a directory that can change underneath it. The two
# `core.*` settings are written into the context repository's own config, so they decide both what
# this checkout materialises and what `git status` compares against inside the container.
git clone --quiet --no-checkout --no-hardlinks \
  -c core.autocrlf=false \
  -c core.eol=lf \
  "$repo_root" "$context_root"

# The branch name is recreated rather than left detached, because the pipeline records it and
# `branch: HEAD` names nothing a reader can act on. A genuinely detached host HEAD stays detached:
# the context reports the host's state, it does not improve it.
if [ "$branch" = "HEAD" ]; then
  git -C "$context_root" checkout --quiet --detach "$sha"
else
  git -C "$context_root" checkout --quiet -B "$branch" "$sha"
fi

if [ -n "$origin" ]; then
  git -C "$context_root" remote set-url origin "$origin"
else
  git -C "$context_root" remote remove origin >/dev/null 2>&1 || true
fi

# Confirmed rather than assumed. A context that landed on another revision would produce a record
# naming a commit nobody asked to verify, and the submission SHA comparison would then be comparing
# two wrong things that agree.
materialised="$(git -C "$context_root" rev-parse HEAD)"
if [ "$materialised" != "$sha" ]; then
  echo "the CI context materialised $materialised, not the requested $sha." >&2
  # `exit` does not fire the ERR trap, so this path removes the partial context itself.
  cleanup_partial
  exit 2
fi

trap - ERR
printf '%s\n' "$context_root"
