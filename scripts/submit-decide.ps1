<#
.SYNOPSIS
    Ask scripts/submit-gate.mjs for a verdict, or for the pull request's verification block.

.DESCRIPTION
    A shim, and deliberately nothing more. It serialises the facts, runs the gate inside the CI
    image, and returns what the gate said.

    The gate runs in the container rather than on the host for two reasons. It removes Node from
    this workflow's host requirements — Docker and git are enough — and it means the rule that
    decides whether a pull request may be opened is evaluated in the same pinned environment that
    decided whether the code passes. There is no network: the decision reads nothing but its input.

    The image is built if it is not already present, because the first decision happens before the
    CI run that would otherwise have built it. The build is layer-cached and costs seconds.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] $Facts,
    [Parameter(Mandatory = $true)] [string] $RepoRoot,
    [switch] $PrBody
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Derived exactly as scripts/ci.ps1 derives it, so both refer to the same image.
$RepoSlug = ((Split-Path -Leaf $RepoRoot) -replace '[^A-Za-z0-9]', '-').ToLowerInvariant()
$Image = "$RepoSlug-ci:local"

& docker image inspect $Image > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    $env:CI_IMAGE = $Image
    & docker compose -p "$RepoSlug-ci-gate" -f (Join-Path $RepoRoot 'compose.ci.yml') build 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "could not build the CI image, so no decision can be made." }
}

$mode = if ($PrBody) { 'pr-body' } else { 'decide' }
$json = $Facts | ConvertTo-Json -Depth 12 -Compress

# stdin carries the facts; stdout carries the answer. Nothing is written anywhere.
$output = $json | & docker run --rm --interactive --network none $Image node scripts/submit-gate.mjs $mode
$code = $LASTEXITCODE

if ($PrBody) {
    if ($code -ne 0) { throw "the gate could not render the verification block (exit $code)." }
    return ($output | Out-String)
}

# Exit 2 means the question was malformed, which is not the same as a refusal and must not be
# reported as one.
if ($code -eq 2) { throw "the gate could not evaluate the submission (exit 2): $($output | Out-String)" }
return ($output | Out-String | ConvertFrom-Json)
