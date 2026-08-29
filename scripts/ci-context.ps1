<#
.SYNOPSIS
    Materialise the Docker build context for a local CI run from committed repository content.

.DESCRIPTION
    Prints one line on stdout: the absolute path of a temporary directory holding this repository at
    the exact commit HEAD names, materialised deterministically. The caller passes that path to
    Docker as the build context and deletes it when the run ends.

    ## Why this exists

    The container used to be built with `COPY . /work` over the developer's working directory, so
    what it verified was *the host's materialisation of the tree* rather than the tree. Git stores
    normalised content and materialises it per platform: `.gitattributes` here pins only the files a
    Linux shell executes, `core.autocrlf` is true on a Windows checkout, and everything else lands
    with CRLF. GitHub's `ubuntu-latest` checkout lands the same commit with LF.

    That is not a theoretical gap. It was measured on commit a373d4c, where the two materialisations
    disagreed: 273 pass / 1 fail from the CRLF checkout, 274 pass / 0 fail from the LF one, for
    identical committed content. The failing test patches evaluator source anchored on `\n`. The
    gate produced a red the runner did not — and the same mechanism runs the other way, which is the
    part that matters: a local gate that verifies host bytes can pass something the runner fails.

    The fix is not `eol=lf` on every path. That bends repository policy around the verifier and only
    closes the one transform anybody thought of; a checkout applies filters, smudge rules, and
    platform conventions, and every one of them is a way for `COPY .` to ship something the commit
    does not determine. The invariant is stated once instead:

        Local CI verifies a deterministic materialisation of the exact committed HEAD, never the
        host checkout's byte representation.

    ## Why a clone rather than `git archive`

    `git archive HEAD` would produce committed file content and nothing else, and the evaluator
    would then be lying about its own source of truth. `scripts/repository.mjs` asks git — with no
    fallback, by design — which paths are tracked, which are ignored, what blob identity a reviewed
    path has at HEAD, and whether a reviewed path is dirty. `ci/Dockerfile` already records that git
    in the image is semantic rather than incidental. An archive plus a synthesised repository would
    trade the CRLF mismatch for ADR 0008's source-of-truth defect: the audit would answer repository
    questions from something that is not the repository.

    So the context is a real clone of the real repository, with real history and real object
    identity, whose checkout attributes are pinned rather than inherited from the host.

    ## What this does not do

    It does not punch a hole through the container. There is still no bind mount, no Docker socket,
    and no host path reachable from inside the run: the context is constructed on the host, copied
    into the image, and deleted. The isolation the containerised pipeline earned is unchanged — the
    only thing that moved is where the bytes being copied come from.

.PARAMETER RepoRoot
    The main working tree to materialise. Must be a repository with a `.git` directory; a linked
    worktree is refused by the caller before this runs.

.PARAMETER Project
    The run's unique compose project name. Used to name the temporary directory, so two concurrent
    runs cannot share a context and teardown can remove exactly the one it created.

.OUTPUTS
    System.String — the absolute path of the materialised context directory.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $RepoRoot,
    [Parameter(Mandatory = $true)] [string] $Project
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# The project name is validated first, before this script does anything at all.
#
# `$Project` names the temporary directory, and this script later removes that directory with
# `-Recurse -Force`. A name carrying path components therefore chooses where that deletion lands:
# `-Project ../../work` resolves through the temp root to a sibling directory and takes the recursive
# delete with it. `--project` is an advertised option on both entry points, so the value arrives from
# outside this script. Docker Compose would reject such a name as well — but it would reject it once
# the context stage has already run, which is to say after the delete.
#
# The alphabet is Compose's own, and every name this repository derives already satisfies it
# (`ci.ps1` and `ci.sh` both reduce the directory basename to `[a-z0-9-]` before appending). It is
# also what makes the constructed path safe rather than merely conventional: a string matching this
# pattern contains no separator and no dot, so no value of `$Project` can move the target out of the
# temporary directory. Checked here rather than at the entry points, so it holds for every caller —
# `submit-decide.ps1` included — and checked before the repository is read, so a hostile name is
# refused on a dirty tree too.
if ($Project -notmatch '^[a-z0-9][a-z0-9_-]*$') {
    throw @"
'$Project' is not a usable project name.

It names a temporary directory that this script deletes recursively, so it is restricted to a plain
Compose project name: a lowercase letter or digit, then lowercase letters, digits, hyphens, or
underscores. A name containing path separators would choose what gets deleted.
"@
}

function Invoke-Git {
    param([string[]] $GitArgs, [string] $What)
    $output = & git @GitArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "$What failed: $($output | Out-String)"
    }
    return ($output | Out-String).Trim()
}

<#
    A git call run for its effect, whose output is discarded.

    Not decoration. This script's contract is that stdout is the context path and nothing else, and
    in PowerShell an un-consumed return value is stdout. Calling `Invoke-Git` bare for `clone` and
    `checkout` emitted their empty results into the output stream, so the caller received an array
    whose string form was the path with leading blanks — and handed Docker a build context that
    could not exist. Effects go through here; only the values this script actually reads are
    returned.
#>
function Invoke-GitEffect {
    param([string[]] $GitArgs, [string] $What)
    Invoke-Git -GitArgs $GitArgs -What $What | Out-Null
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "git was not found on PATH. It is required to materialise the CI context."
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
# WHERE GIT CANNOT ANSWER, THIS SAYS SO. `Invoke-Git` throws rather than returning empty, so an
# unreadable index refuses the run instead of being read as an absent conflict. Failure to know is
# never converted into a fact about the repository (ADR 0008).
$unmerged = Invoke-Git @('-C', $RepoRoot, 'ls-files', '--unmerged') 'reading unmerged index entries; whether a conflict is open is unknown'
$gitDir = Invoke-Git @('-C', $RepoRoot, 'rev-parse', '--absolute-git-dir') 'locating the git directory; whether a conflict is open is unknown'

# One entry per operation that can pause with a conflict. AUTO_MERGE is written by the merge
# machinery itself and is listed so a conflicted state mid-resolution is still named.
$operations = @()
foreach ($marker in @('MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'REBASE_HEAD', 'AUTO_MERGE')) {
    if (Test-Path (Join-Path $gitDir $marker)) { $operations += $marker }
}
foreach ($marker in @('rebase-merge', 'rebase-apply', 'sequencer')) {
    if (Test-Path (Join-Path $gitDir $marker) -PathType Container) { $operations += "$marker/" }
}

if ($unmerged -or $operations.Count -gt 0) {
    $detail = ''
    if ($operations.Count -gt 0) { $detail += "`n  operation in progress: $($operations -join ' ')" }
    if ($unmerged) {
        $paths = Invoke-Git @('-C', $RepoRoot, 'diff', '--name-only', '--diff-filter=U') 'listing unmerged paths'
        $detail += "`n  unmerged paths:`n$($paths -split "`n" | ForEach-Object { "    $_" } | Out-String)"
    }
    throw @"
this working tree has an unresolved conflict, and local CI verifies committed content at HEAD.

Nothing about this state can reach a commit: git refuses to commit an unmerged index, and staging
the files clears it. So the run is refused here rather than producing a verdict about a tree that
does not yet exist.
$detail
Finish or abort the operation, then re-run.
"@
}

$sha = Invoke-Git @('-C', $RepoRoot, 'rev-parse', 'HEAD') 'reading HEAD'
$branch = Invoke-Git @('-C', $RepoRoot, 'rev-parse', '--abbrev-ref', 'HEAD') 'reading the current branch'

# The origin URL is carried over rather than left pointing at the temporary clone. The pipeline
# records `remote.origin.url` as the repository the run describes, and a temp path in that field
# would make the record name a directory that no longer exists.
$origin = & git -C $RepoRoot config --get remote.origin.url 2>$null
if ($LASTEXITCODE -ne 0) { $origin = $null }

# The clean-tree requirement is a consequence of the invariant, not an extra rule.
#
# Once the context is committed content, an uncommitted edit is invisible to the run — the developer
# would be shown a verdict about HEAD while believing it covered what they just wrote. That is a
# false success in the exact sense `errors.no-false-success` names, so it is refused here rather
# than tolerated. Submission already refused a dirty tree; this moves the same requirement earlier,
# to the point where it first has consequences.
#
# Ignored files are not dirt: `--porcelain` excludes them, so the run's own artifacts directory does
# not block a run.
#
# `--untracked-files=normal` is passed explicitly rather than relying on the default, because the
# default is not a default — it is `status.showUntrackedFiles`, which a developer may have set to
# `no`. Under that config a brand-new source file reports nothing here, the clone omits it because it
# is not committed, and the run reports a pass over a tree missing the very file being worked on.
# That is the false success this check exists to prevent, arriving through the check itself.
$status = Invoke-Git @('-C', $RepoRoot, 'status', '--porcelain', '--untracked-files=normal') 'reading working-tree status'
if ($status) {
    throw @"
the working tree has uncommitted changes, and local CI verifies committed content at HEAD.
Anything not committed would be absent from the run, so a pass would describe a tree you are not
looking at. Commit or stash, then re-run.

$status
"@
}

$contextRoot = Join-Path ([System.IO.Path]::GetTempPath()) "$Project-context"
if (Test-Path $contextRoot) { Remove-Item $contextRoot -Recurse -Force }

# Everything from here on is wrapped, because a half-built context must not survive.
#
# The caller only learns the path if this script returns it, so a failure between the clone and the
# confirmation below would leave a directory nobody owns and nobody deletes — and, worse, a directory
# holding a partial materialisation of a commit under a name that says it is that commit. It is
# removed by the exact path this invocation created, never by a sweep of the temp directory.
try {

# `--no-checkout` first, so no file is materialised under whatever the host's defaults happen to be;
# the working tree is then created by an explicit checkout under the config pinned below.
#
# `--no-hardlinks` makes the context self-contained. Hardlinked objects would still be readable, but
# the context is about to be copied into an image as the definitive statement of what was verified,
# and a definitive statement should not share storage with a directory that can change underneath it.
#
# `core.autocrlf=false` and `core.eol=lf` are set at clone time so they are written into the context
# repository's own config. That matters twice: it decides what this checkout materialises, and it
# travels into the container, so `git status` in there compares against the same rule rather than
# re-deriving one from the container's defaults.
Invoke-GitEffect @(
    'clone', '--quiet', '--no-checkout', '--no-hardlinks',
    '-c', 'core.autocrlf=false',
    '-c', 'core.eol=lf',
    $RepoRoot, $contextRoot
) 'cloning the repository into a temporary context'

# The branch name is recreated rather than left detached, because the pipeline records it and a
# record reading `branch: HEAD` names nothing a reader can act on. A genuinely detached HEAD on the
# host stays detached here — the context reports the host's state, it does not improve it.
if ($branch -eq 'HEAD') {
    Invoke-GitEffect @('-C', $contextRoot, 'checkout', '--quiet', '--detach', $sha) 'checking out the verified commit'
}
else {
    Invoke-GitEffect @('-C', $contextRoot, 'checkout', '--quiet', '-B', $branch, $sha) 'checking out the verified commit'
}

if ($origin) {
    Invoke-GitEffect @('-C', $contextRoot, 'remote', 'set-url', 'origin', $origin) 'restoring the origin URL'
}
else {
    & git -C $contextRoot remote remove origin 2>&1 | Out-Null
}

# The materialised commit is confirmed rather than assumed. A clone that silently landed on a
# different revision would produce a record naming a commit nobody asked to verify, and the SHA
# comparison at submission would then be comparing two wrong things that agree.
$materialised = Invoke-Git @('-C', $contextRoot, 'rev-parse', 'HEAD') 'confirming the materialised commit'
if ($materialised -ne $sha) {
    throw "the CI context materialised $materialised, not the requested $sha."
}

}
catch {
    if (Test-Path $contextRoot) { Remove-Item $contextRoot -Recurse -Force -ErrorAction SilentlyContinue }
    throw
}

return $contextRoot
