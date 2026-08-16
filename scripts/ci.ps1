<#
.SYNOPSIS
    Run this repository's complete CI pipeline in an ephemeral Docker container.

.DESCRIPTION
    The authoritative local CI command. Exit 0 means every gating check passed on the tree in this
    working directory; anything else means it did not.

    What this script does and does not decide: it owns the *environment* — building the image,
    starting dependencies, waiting on their health, extracting the verification record, tearing
    everything down. It owns none of the *checks*. Those are listed in scripts/pipeline.mjs, which
    .github/workflows/ci.yml runs as well, so there is one statement of what CI covers rather than
    one per executor.

    Host requirements: Docker and git. Nothing else — no Node, no npm, no globally installed
    anything. The checks run against a Node baked into the image at a pinned digest, which is the
    point: a green run here says nothing about what the developer happens to have installed.

.PARAMETER KeepOnFailure
    Leave the container and network in place when the run fails, so it can be inspected. The script
    prints the exact commands to use. Without this, teardown happens on every path including failure.

.PARAMETER Verbose
    Print each stage's rationale before running it. Stage output is always shown.

.PARAMETER Project
    Override the generated compose project name. Only useful when reproducing a kept-on-failure run.

.EXAMPLE
    .\scripts\ci.ps1
.EXAMPLE
    .\scripts\ci.ps1 -KeepOnFailure
#>
[CmdletBinding()]
param(
    [switch] $KeepOnFailure,
    [string] $Project
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ComposeFile = Join-Path $RepoRoot 'compose.ci.yml'
$ReportDir = Join-Path $RepoRoot 'artifacts/local-ci'
$ReportPath = Join-Path $ReportDir 'latest.json'

# Names derived from the directory rather than hardcoded, so this file can be copied into another
# repository unchanged. The image is stable per repository (layer cache); the project is unique per
# run, so two concurrent runs — of this repository or of any other — cannot share a container, a
# network, or a teardown.
$RepoSlug = ((Split-Path -Leaf $RepoRoot) -replace '[^A-Za-z0-9]', '-').ToLowerInvariant()
$Image = "$RepoSlug-ci:local"
if (-not $Project) {
    $Project = "$RepoSlug-ci-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())-$PID"
}

$CiContainer = "$Project-ci"

$env:CI_IMAGE = $Image
$env:LOCAL_CI_VERBOSE = if ($PSBoundParameters.ContainsKey('Verbose')) { '1' } else { '0' }

# Streams the command's output to the console and returns only its exit code.
#
# `Out-Host` is load-bearing. Without it the native command's stdout becomes part of the function's
# return value, so `(Invoke-Compose build) -ne 0` compares an array of log lines against 0 and is
# always true — a successful build reported as a failed one, which is exactly what happened the
# first time this script ran.
function Invoke-Compose {
    param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $ComposeArgs)
    & docker compose -p $Project -f $ComposeFile @ComposeArgs 2>&1 | Out-Host
    return $LASTEXITCODE
}

# The reading counterpart, for commands whose output is data rather than a log.
function Get-ComposeOutput {
    param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $ComposeArgs)
    return (& docker compose -p $Project -f $ComposeFile @ComposeArgs 2>$null)
}

function Write-Stage([string] $Text) {
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

# Teardown removes exactly what this run created: containers, the run's network, and volumes
# attached to this compose project. It is scoped by the unique project name, so it can never reach a
# developer's own containers, volumes, or databases. There is no `docker system prune` here and
# there must never be one — a CI script that garbage-collects the host is a CI script that deletes
# someone's work.
function Remove-CiEnvironment {
    Write-Stage "Tearing down project '$Project'"
    # The one-off `run` container is named, so it is removed by name; `down` then removes the
    # project's network and any volumes it created. Both are scoped to this run's project.
    & docker rm --force --volumes $CiContainer 2>&1 | Out-Null
    & docker compose -p $Project -f $ComposeFile down --volumes --remove-orphans --timeout 10 2>&1 |
        Write-Host
}

$exitCode = 1
try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "docker was not found on PATH. Docker is the only required host dependency besides git."
    }
    & docker info --format '{{.ServerVersion}}' > $null 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "the Docker daemon is not reachable. Start Docker Desktop (or dockerd) and retry."
    }
    if (-not (Test-Path $ComposeFile)) { throw "compose file not found: $ComposeFile" }

    Write-Host "repository : $RepoRoot"
    Write-Host "image      : $Image"
    Write-Host "project    : $Project"

    Write-Stage "Building the CI image"
    if ((Invoke-Compose build) -ne 0) { throw "the CI image failed to build." }

    # Dependencies, if this repository ever grows any. `--wait` blocks on each service's declared
    # healthcheck and fails when one never becomes healthy; no sleep is involved. Today the list is
    # empty — there is no database, cache, or broker — so this is a no-op that costs one command and
    # means adding a service later requires no change to this script.
    $services = (Get-ComposeOutput config --services) | Where-Object { $_ -and $_.Trim() -ne 'ci' }
    if ($services) {
        Write-Stage "Starting dependencies and waiting for health: $($services -join ', ')"
        if ((Invoke-Compose up --detach --wait @services) -ne 0) {
            throw "a dependency never became healthy."
        }
    }

    Write-Stage "Running the pipeline"
    # `run --name` rather than `run --rm`: the container must outlive its own exit long enough for
    # the verification record to be copied out of it. `run` also propagates the pipeline's exit code
    # directly and leaves its output unprefixed, which `up` does not.
    $pipelineExit = Invoke-Compose run --name $CiContainer ci

    Write-Stage "Extracting the verification record"
    New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
    if (Test-Path $ReportPath) { Remove-Item $ReportPath -Force }
    # Copied out of the stopped container rather than written through a bind mount. Nothing on the
    # host was reachable from inside the container, so a failing test could not have touched the
    # developer's tree even if it tried.
    & docker cp "${CiContainer}:/work/artifacts/local-ci/latest.json" $ReportPath 2>&1 | Out-Null

    if (Test-Path $ReportPath) {
        Write-Host "record          : $ReportPath"
    }
    elseif ($pipelineExit -eq 0) {
        # A pass with no record is not a pass anyone can act on: submit-pr has nothing to check the
        # commit against, and a reader has nothing to read.
        throw "the pipeline reported success but produced no verification record."
    }

    $exitCode = $pipelineExit
}
catch {
    Write-Host ""
    Write-Host "CI could not complete: $($_.Exception.Message)" -ForegroundColor Red
    $exitCode = 2
}
finally {
    if ($KeepOnFailure -and $exitCode -ne 0) {
        Write-Host ""
        Write-Host "Containers kept for inspection (-KeepOnFailure)." -ForegroundColor Yellow
        Write-Host "  docker logs $CiContainer"
        Write-Host "  docker compose -p $Project -f compose.ci.yml run --rm --entrypoint bash ci"
        Write-Host "  docker rm -f $CiContainer; docker compose -p $Project -f compose.ci.yml down --volumes --remove-orphans"
    }
    else {
        Remove-CiEnvironment
    }
}

Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "LOCAL CI PASSED" -ForegroundColor Green
}
else {
    Write-Host "LOCAL CI FAILED (exit $exitCode)" -ForegroundColor Red
}
exit $exitCode
