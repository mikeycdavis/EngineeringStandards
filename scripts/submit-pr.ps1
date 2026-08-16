<#
.SYNOPSIS
    Verify the current commit in Docker, then push exactly that commit and open a pull request.

.DESCRIPTION
    Enforces one invariant:

        A pull request may only be submitted if the exact commit SHA being pushed has successfully
        passed the repository's complete containerized CI pipeline.

    The sequence is: refuse a dirty tree or a protected branch, record HEAD, run scripts/ci.ps1,
    record HEAD again, and refuse if it moved. The push then names that SHA explicitly rather than
    pushing whatever the branch currently points at, so even a commit landing between the check and
    the push cannot be the thing that reaches the remote.

    Nothing here decides anything. The decision is scripts/submit-gate.mjs, executed inside the CI
    image so that this script needs no Node on the host, and so that the rule is one testable
    function rather than a paraphrase in each shell — see test/local-ci.test.mjs, which drives every
    refusal path.

    This script never commits, never amends, never stashes, and never pushes when verification
    failed. If CI is red the answer is to fix the code, not to change what CI checks.

    Host requirements: Docker, git, and — for the pull request itself — an authenticated `gh`. No
    token is read, stored, or written by this script; it uses the developer's existing gh session.

.PARAMETER Base
    Base branch for the pull request. Defaults to 'develop', this repository's integration branch.

.PARAMETER Title
    Pull request title. Defaults to the subject of the branch's most recent commit.

.PARAMETER Body
    Pull request body. The local-CI verification block is appended to it; it never replaces it.

.PARAMETER BodyFile
    Read the body from a file instead. Ignored when -Body is given.

.PARAMETER Draft
    Open the pull request as a draft.

.PARAMETER SkipPr
    Verify and push, but stop before creating the pull request. For when the PR already exists.

.EXAMPLE
    .\scripts\submit-pr.ps1
.EXAMPLE
    .\scripts\submit-pr.ps1 -Draft -Base develop -Title "Local Docker CI"
#>
[CmdletBinding()]
param(
    [string] $Base = 'develop',
    [string] $Title,
    [string] $Body,
    [string] $BodyFile,
    [switch] $Draft,
    [switch] $SkipPr
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ReportPath = Join-Path $RepoRoot 'artifacts/local-ci/latest.json'
Push-Location $RepoRoot

function Fail([string] $Message, [int] $Code = 1) {
    Write-Host ""
    Write-Host $Message -ForegroundColor Red
    Pop-Location
    exit $Code
}

function Git-Out {
    param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $GitArgs)
    $out = & git @GitArgs 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return ($out | Out-String).Trim()
}

try {
    # --- Facts, gathered before anything expensive runs -------------------------------------------
    $isRepo = $null -ne (Git-Out rev-parse --git-dir)
    $branch = if ($isRepo) { Git-Out rev-parse --abbrev-ref HEAD } else { $null }
    # `--untracked-files=normal` explicitly, not by default: the default is `status.showUntrackedFiles`,
    # which a developer may have set to `no`. A submission gate that consults a configurable definition
    # of "clean" refuses exactly what that config lets through.
    $dirty = if ($isRepo) { @(& git status --porcelain --untracked-files=normal) | Where-Object { $_ } } else { @() }
    $shaBefore = if ($isRepo) { Git-Out rev-parse HEAD } else { $null }

    # The pre-CI decision. Every refusal that does not depend on CI's result is made here, so a
    # developer on a dirty tree is told in the first second rather than after a full pipeline.
    $preFacts = @{
        isRepository = $isRepo
        branch       = $branch
        base         = $Base
        dirty        = @($dirty)
        shaBefore    = $shaBefore
        shaAfter     = $shaBefore
        ciExitCode   = 0
        evidence     = $null
    }
    $pre = & "$PSScriptRoot\submit-decide.ps1" -Facts $preFacts -RepoRoot $RepoRoot
    # 'no-evidence' is the only refusal expected at this point: CI has not run yet. Anything else is
    # a real refusal and stops the run before the container is even built.
    if (-not $pre.allowed -and $pre.reason -ne 'no-evidence') { Fail $pre.message }

    Write-Host "repository : $(Git-Out config --get remote.origin.url)"
    Write-Host "branch     : $branch  ->  $Base"
    Write-Host "commit     : $shaBefore"

    # --- Verification ------------------------------------------------------------------------------
    Write-Host ""
    Write-Host "==> Verifying $shaBefore in Docker" -ForegroundColor Cyan
    if (Test-Path $ReportPath) { Remove-Item $ReportPath -Force }
    & "$PSScriptRoot\ci.ps1"
    $ciExit = $LASTEXITCODE

    $shaAfter = Git-Out rev-parse HEAD
    $evidence = if (Test-Path $ReportPath) { Get-Content $ReportPath -Raw | ConvertFrom-Json } else { $null }

    $facts = @{
        isRepository = $isRepo
        branch       = $branch
        base         = $Base
        dirty        = @(@(& git status --porcelain --untracked-files=normal) | Where-Object { $_ })
        shaBefore    = $shaBefore
        shaAfter     = $shaAfter
        ciExitCode   = $ciExit
        evidence     = $evidence
    }
    $verdict = & "$PSScriptRoot\submit-decide.ps1" -Facts $facts -RepoRoot $RepoRoot
    if (-not $verdict.allowed) { Fail $verdict.message }

    Write-Host ""
    Write-Host $verdict.message -ForegroundColor Green

    # --- Push the exact verified commit ------------------------------------------------------------
    Write-Host ""
    Write-Host "==> Pushing $shaBefore to origin/$branch" -ForegroundColor Cyan
    # `<sha>:refs/heads/<branch>` rather than the branch name. Pushing by name would send whatever
    # the branch points at when git runs, and the whole point of this script is that the thing which
    # reaches the remote is the thing that was verified.
    & git push origin "${shaBefore}:refs/heads/$branch"
    if ($LASTEXITCODE -ne 0) { Fail "The push failed. No pull request was created." }
    & git branch --set-upstream-to "origin/$branch" $branch 2>&1 | Out-Null

    if ($SkipPr) {
        Write-Host ""
        Write-Host "Pushed. Pull request creation skipped (-SkipPr)." -ForegroundColor Yellow
        Pop-Location
        exit 0
    }

    # --- Pull request ------------------------------------------------------------------------------
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Host ""
        Write-Host "gh is not installed, so no pull request was created. The verified commit is pushed." -ForegroundColor Yellow
        Write-Host "Open it manually, or install GitHub CLI and re-run with the branch already pushed."
        Pop-Location
        exit 0
    }
    & gh auth status 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "gh is not authenticated, so no pull request was created. The verified commit is pushed." -ForegroundColor Yellow
        Write-Host "Run 'gh auth login' and retry. This script never stores a token."
        Pop-Location
        exit 0
    }

    if (-not $Title) { $Title = Git-Out log -1 --pretty=%s }
    if (-not $Body -and $BodyFile) { $Body = Get-Content $BodyFile -Raw }
    if (-not $Body) {
        # Not empty, and not a summary this script invented: the commits being proposed.
        $Body = "## Commits`n`n" + (Git-Out log --reverse --pretty='- %s' "origin/$Base..$shaBefore")
    }

    # The verification block is generated by the same module that made the decision, so the PR can
    # never claim something the gate did not establish. It is appended — user content is never
    # replaced — and it says "local Docker", never "CI passed", because GitHub-hosted Actions did
    # not run. Reporting otherwise would be a false success at the pull-request level.
    $block = & "$PSScriptRoot\submit-decide.ps1" -Facts $evidence -RepoRoot $RepoRoot -PrBody
    $fullBody = "$Body`n`n---`n`n$block"

    $bodyFile = New-TemporaryFile
    Set-Content -Path $bodyFile -Value $fullBody -Encoding utf8

    Write-Host ""
    Write-Host "==> Creating the pull request" -ForegroundColor Cyan
    $ghArgs = @('pr', 'create', '--base', $Base, '--head', $branch, '--title', $Title, '--body-file', $bodyFile)
    if ($Draft) { $ghArgs += '--draft' }
    & gh @ghArgs
    $ghExit = $LASTEXITCODE
    Remove-Item $bodyFile -Force -ErrorAction SilentlyContinue
    if ($ghExit -ne 0) { Fail "gh pr create failed. The verified commit is pushed; open the pull request manually." }

    Write-Host ""
    Write-Host "Submitted $shaBefore." -ForegroundColor Green
    Pop-Location
    exit 0
}
catch {
    Fail "submit-pr could not complete: $($_.Exception.Message)" 2
}
