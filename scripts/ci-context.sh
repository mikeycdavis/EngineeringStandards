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

# The project name is validated first, before this script does anything at all.
#
# `$project` names the temporary directory, and this script later removes that directory with
# `rm -rf`. A name carrying path components therefore chooses where that deletion lands —
# `--project ../../work` resolves through the temp root to a sibling directory. `--project` is an
# advertised option on both entry points, so the value arrives from outside this script; Compose
# would reject it as well, but only once the context stage has run, which is after the delete.
#
# The alphabet is Compose's own, and every name this repository derives already satisfies it. It is
# also what makes the constructed path safe rather than merely conventional: a string matching this
# pattern contains no separator and no dot, so no value can move the target out of the temporary
# directory. Checked here rather than at the entry points, so it holds for every caller, and checked
# before the repository is even read, so a hostile name is refused on a dirty tree too.
case "$project" in
  "" | [!a-z0-9]* | *[!a-z0-9_-]*)
    cat >&2 <<EOF
'$project' is not a usable project name.

It names a temporary directory that this script deletes recursively, so it is restricted to a plain
Compose project name: a lowercase letter or digit, then lowercase letters, digits, hyphens, or
underscores. A name containing path separators would choose what gets deleted.
EOF
    exit 2
    ;;
esac

command -v git >/dev/null 2>&1 || {
  echo "git was not found on PATH. It is required to materialise the CI context." >&2
  exit 2
}

# An unresolved conflict is refused BEFORE the generic dirty-tree check, and by name.
#
# It would already be refused below: a conflicted tree is a dirty tree. But "the working tree has
# uncommitted changes" sends a developer looking for an edit they forgot to commit, when what is
# actually true is that a merge, cherry-pick, rebase or revert is still open. Issue #21's specimen
# reached `develop` because three cherry-pick markers were committed while every gate reported
# clean; this is the half of that defect that never gets to be committed, and naming it is the whole
# value of checking it separately.
#
# TWO SIGNALS, because neither implies the other. `ls-files --unmerged` reports index stages, which
# a delete/modify conflict produces over a file whose content holds no markers at all. The operation
# metadata reports a paused operation, which survives even where every path has been staged. The
# metadata list is deliberately not just MERGE_HEAD: the incident was a CHERRY-PICK, which writes
# CHERRY_PICK_HEAD and no MERGE_HEAD, so a check written for merges alone would have missed the
# specimen this exists for.
#
# WHERE GIT CANNOT ANSWER, THIS SAYS SO. An unreadable index is not an absent conflict. Reporting
# `unknown` and refusing is the ADR 0008 seam's rule applied here: failure to know is never
# converted into a fact about the repository.
if ! unmerged="$(git -C "$repo_root" ls-files --unmerged 2>/dev/null)"; then
  echo "whether this working tree holds an unresolved conflict is unknown: the index could not be read," >&2
  echo "or this directory is not a git work tree." >&2
  echo "That is not the same as a clean tree, so the run is refused rather than started." >&2
  exit 2
fi
if ! git_dir="$(git -C "$repo_root" rev-parse --absolute-git-dir 2>/dev/null)"; then
  echo "whether this working tree holds an unresolved conflict is unknown: the git directory could not be located." >&2
  echo "That is not the same as a clean tree, so the run is refused rather than started." >&2
  exit 2
fi

operations=""
# One entry per operation that can pause with a conflict. AUTO_MERGE is written by the merge
# machinery itself and is listed so a conflicted state mid-resolution is still named.
for marker in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD REBASE_HEAD AUTO_MERGE; do
  if [ -e "$git_dir/$marker" ]; then operations="$operations $marker"; fi
done
for marker in rebase-merge rebase-apply sequencer; do
  if [ -d "$git_dir/$marker" ]; then operations="$operations $marker/"; fi
done

if [ -n "$unmerged" ] || [ -n "$operations" ]; then
  cat >&2 <<EOF
this working tree has an unresolved conflict, and local CI verifies committed content at HEAD.

Nothing about this state can reach a commit: git refuses to commit an unmerged index, and staging
the files clears it. So the run is refused here rather than producing a verdict about a tree that
does not yet exist.
EOF
  [ -n "$operations" ] && printf '\n  operation in progress:%s\n' "$operations" >&2
  if [ -n "$unmerged" ]; then
    printf '\n  unmerged paths:\n' >&2
    git -C "$repo_root" diff --name-only --diff-filter=U 2>/dev/null | sed 's/^/    /' >&2 || true
  fi
  printf '\nFinish or abort the operation, then re-run.\n' >&2
  exit 2
fi

sha="$(git -C "$repo_root" rev-parse HEAD)"
branch="$(git -C "$repo_root" rev-parse --abbrev-ref HEAD)"
# Carried over rather than left pointing at the temporary clone: the pipeline records
# `remote.origin.url` as the repository the run describes.
origin="$(git -C "$repo_root" config --get remote.origin.url 2>/dev/null || true)"

# A consequence of the invariant rather than an extra rule. Once the context is committed content, an
# uncommitted edit is invisible to the run, so a pass would describe a tree the developer is not
# looking at — a false success in the sense `errors.no-false-success` names. `--porcelain` excludes
# ignored files, so the run's own artifacts directory does not block a run.
#
# `--untracked-files=normal` is explicit because the default is `status.showUntrackedFiles`, which a
# developer may have set to `no`. Under that config a new source file reports nothing here, the clone
# omits it because it is not committed, and the run passes over a tree missing the file being worked
# on — the false success this check exists to prevent, arriving through the check itself.
status="$(git -C "$repo_root" status --porcelain --untracked-files=normal)"
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
