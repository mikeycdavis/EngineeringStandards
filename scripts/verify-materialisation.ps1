<#
.SYNOPSIS
    Prove that local CI's result depends on the commit and not on how a checkout materialised it.

.DESCRIPTION
    The acceptance test for the build-context invariant:

        Local CI verifies a deterministic materialisation of the exact committed HEAD, never the
        host checkout's byte representation.

    It is adversarial by construction. Rather than asserting the property from the implementation's
    shape, it creates the disagreement the old implementation actually produced and requires the
    pipeline to be blind to it.

      1. Materialise one commit into two clean checkouts — one forced to LF, one forced to CRLF.
      2. Confirm their working-tree bytes really do differ. A test that skipped this could pass
         because the difference never existed, which is the failure mode of every "identical inputs
         produce identical outputs" check ever written.
      3. Run the complete local Docker pipeline from each.
      4. Require the verified SHA, every stage outcome and exit code, the compliance verdict, and the
         repository's own freshness and tracked/ignored answers to be identical.

    Step 5 is `-Mutate`, and it is the reason the other four mean anything. It reverts the
    implementation to the defect — the raw `COPY .` host-context behaviour, reproduced by pointing
    the build context at each working directory — and requires the comparison to FAIL. A falsifier
    that cannot be made to fail is decoration.

    Windows-only, deliberately. CRLF materialisation is the transform this defends against and it is
    the Windows checkout that performs it; `scripts/ci.sh` exists for Linux and macOS developers, but
    the asymmetry documented in docs/local-ci.md applies here too. Running the pipeline twice takes
    a few minutes.

    Host requirements: Docker, git, PowerShell. No Node.

.PARAMETER Mutate
    Reproduce the pre-fix behaviour — build each run's image from its own working directory instead
    of from committed content — and require the equivalence check to fail. Exit 0 means the
    falsifier worked: the check is capable of detecting the defect. Exit 1 means the check passed
    under the defect, which would mean it establishes nothing.

.PARAMETER KeepCheckouts
    Leave the two temporary checkouts and their captured logs in place for inspection.

.EXAMPLE
    .\scripts\verify-materialisation.ps1
.EXAMPLE
    .\scripts\verify-materialisation.ps1 -Mutate
#>
[CmdletBinding()]
param(
    [switch] $Mutate,
    [switch] $KeepCheckouts
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$WorkRoot = Join-Path ([System.IO.Path]::GetTempPath()) "materialisation-$Stamp-$PID"

function Write-Step([string] $Text) {
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

function Invoke-Git {
    param([string[]] $GitArgs, [string] $What)
    $out = & git @GitArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw "$What failed: $($out | Out-String)" }
    return ($out | Out-String).Trim()
}

<#
    The working-tree byte identity of a checkout: a hash over the raw bytes of every tracked file.

    Raw bytes on purpose. Reading as text would let PowerShell normalise line endings on the way in
    and this whole comparison would report two identical checkouts that are not identical — the
    measurement destroying the thing it measures.
#>
function Get-WorkingTreeBytes([string] $Root) {
    $files = (Invoke-Git @('-C', $Root, 'ls-files') 'listing tracked files') -split "`r?`n" | Where-Object { $_ }
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        foreach ($rel in ($files | Sort-Object)) {
            $full = Join-Path $Root $rel
            if (-not (Test-Path $full -PathType Leaf)) { continue }
            $bytes = [System.IO.File]::ReadAllBytes($full)
            $sha.TransformBlock($bytes, 0, $bytes.Length, $null, 0) | Out-Null
        }
        $sha.TransformFinalBlock([byte[]]::new(0), 0, 0) | Out-Null
        return ($sha.Hash | ForEach-Object { $_.ToString('x2') }) -join ''
    }
    finally { $sha.Dispose() }
}

<#
    One stage's captured output, with everything that legitimately varies between runs removed.

    What is stripped is per-run identity — timestamps, the unique project and image names, temp
    paths — and nothing else. Stripping anything a check actually decided would be manufacturing the
    agreement this script exists to test for.
#>
function Get-StageOutput([string] $LogPath, [string] $StageId) {
    $text = Get-Content -Raw -LiteralPath $LogPath
    $start = $text.IndexOf("=== $StageId ::")
    if ($start -lt 0) { return "" }
    $endMarker = "--- ${StageId}: "
    $end = $text.IndexOf($endMarker, $start)
    if ($end -lt 0) { return $text.Substring($start) }
    $endLine = $text.IndexOf("`n", $end)
    $slice = if ($endLine -lt 0) { $text.Substring($start) } else { $text.Substring($start, $endLine - $start) }
    return ($slice `
        -replace '\d{4}-\d{2}-\d{2}T[\d:.]+Z', '<timestamp>' `
        -replace '(?i)[a-z0-9-]+-ci-\d+-\d+(-context)?', '<run>' `
        -replace '(?i)[a-z]:\\[^\s"]*', '<path>' `
        -replace '\s+$', '' `
        -replace "`r`n", "`n")
}

<#
    Materialise the commit into a checkout whose line-ending conversion is forced.

    `origin` is set to the source repository's own origin so both checkouts describe the same
    repository; otherwise each would name its own temp path and the records would differ for a
    reason that has nothing to do with the property under test.
#>
function New-Checkout([string] $Name, [string] $Autocrlf, [string] $Eol, [string] $Sha, [string] $Origin) {
    $dir = Join-Path $WorkRoot $Name
    # `| Out-Null` on every call made for its effect. In PowerShell an un-consumed return value is
    # output, so a bare call here would prepend blank lines to this function's return value and the
    # caller would receive a path with leading whitespace. That trap cost a run of this very change.
    Invoke-Git @(
        'clone', '--quiet', '--no-checkout', '--no-hardlinks',
        '-c', "core.autocrlf=$Autocrlf",
        '-c', "core.eol=$Eol",
        $RepoRoot, $dir
    ) "cloning the $Name checkout" | Out-Null
    Invoke-Git @('-C', $dir, 'checkout', '--quiet', '--detach', $Sha) "checking out $Sha in the $Name checkout" | Out-Null
    if ($Origin) { Invoke-Git @('-C', $dir, 'remote', 'set-url', 'origin', $Origin) 'setting the origin URL' | Out-Null }
    return $dir
}

<#
    Run the complete pipeline from one checkout and return everything the comparison looks at.

    Under `-Mutate` the context is forced to the checkout's own working directory before ci.ps1
    runs, which is exactly the pre-fix `COPY .`. ci.ps1 overwrites `CI_CONTEXT` itself, so the
    mutation cannot be performed by setting an environment variable — it patches the one line in the
    copied script that decides what Docker is given. The patch is applied to the temporary
    checkout's copy, never to the repository.
#>
function Invoke-PipelineIn([string] $Dir, [string] $Label) {
    if ($Mutate) {
        $ciScript = Join-Path $Dir 'scripts/ci.ps1'
        $text = Get-Content -Raw -LiteralPath $ciScript
        $patched = $text -replace
            '\$ContextRoot = & \(Join-Path \$PSScriptRoot ''ci-context\.ps1''\)[^\r\n]*',
            '$ContextRoot = $null; $env:CI_CONTEXT = $RepoRoot'
        if ($patched -eq $text) {
            throw "the mutation found nothing to patch in ci.ps1; if that line moved, fix this falsifier rather than deleting it."
        }
        Set-Content -LiteralPath $ciScript -Value $patched -NoNewline
    }

    $log = Join-Path $WorkRoot "$Label.log"
    Write-Host "    running the pipeline in $Label ..."
    Push-Location $Dir
    try {
        & pwsh -NoProfile -File (Join-Path $Dir 'scripts/ci.ps1') *>&1 | Out-File -LiteralPath $log -Encoding utf8
    }
    finally { Pop-Location }

    $recordPath = Join-Path $Dir 'artifacts/local-ci/latest.json'
    if (-not (Test-Path $recordPath)) {
        throw "$Label produced no verification record. Its log is at $log"
    }
    $record = Get-Content -Raw -LiteralPath $recordPath | ConvertFrom-Json

    return [pscustomobject]@{
        label   = $Label
        log     = $log
        commit  = $record.commit
        result  = $record.result
        failed  = $record.failedStage
        scope   = $record.scope
        # Stage identity: what ran, in what order, with what outcome. Durations and timestamps are
        # not part of it — they vary between two runs of the same commit for reasons nobody claims
        # otherwise.
        stages  = ($record.checks | ForEach-Object { "$($_.id)=$($_.outcome)/$($_.exitCode)" }) -join ' '
        # The compliance verdict and, with it, every attestation freshness answer the validator
        # printed. This is the part `git archive` alone would have quietly broken: freshness is
        # computed from committed blob identity through git, so a context without a real repository
        # would answer it differently — or not at all.
        validate = Get-StageOutput $log 'validate'
        # The self-audit, which is where the repository's tracked/ignored seam shows up in output.
        audit    = Get-StageOutput $log 'audit'
    }
}

$failures = @()
function Compare-Field([string] $Name, $A, $B) {
    if ($A -eq $B) {
        Write-Host ("  {0,-22} identical" -f $Name) -ForegroundColor Green
    }
    else {
        Write-Host ("  {0,-22} DIFFERS" -f $Name) -ForegroundColor Red
        Write-Host "      lf   : $A"
        Write-Host "      crlf : $B"
        $script:failures += $Name
    }
}

$exitCode = 1
try {
    New-Item -ItemType Directory -Force -Path $WorkRoot | Out-Null

    $sha = Invoke-Git @('-C', $RepoRoot, 'rev-parse', 'HEAD') 'reading HEAD'
    $origin = & git -C $RepoRoot config --get remote.origin.url 2>$null
    if ($LASTEXITCODE -ne 0) { $origin = $null }

    Write-Host "commit  : $sha"
    Write-Host "work    : $WorkRoot"
    Write-Host "mode    : $(if ($Mutate) { 'MUTATED — host context, failure expected' } else { 'normal' })"

    Write-Step "Materialising $sha into two checkouts with opposite line-ending conversion"
    $lfDir = New-Checkout 'lf' 'false' 'lf' $sha $origin
    $crlfDir = New-Checkout 'crlf' 'true' 'crlf' $sha $origin

    Write-Step "Confirming the two checkouts genuinely differ on disk"
    $lfBytes = Get-WorkingTreeBytes $lfDir
    $crlfBytes = Get-WorkingTreeBytes $crlfDir
    Write-Host "  lf   working-tree bytes : $lfBytes"
    Write-Host "  crlf working-tree bytes : $crlfBytes"
    if ($lfBytes -eq $crlfBytes) {
        # Not a pass. If the two materialisations are identical there is nothing for the pipeline to
        # be blind to, and continuing would report a green that establishes nothing.
        throw @"
the two checkouts materialised identical bytes, so this run cannot establish anything.
Check that .gitattributes has not been changed to pin every path to one line ending — that would
make this test vacuous rather than satisfied.
"@
    }
    # Both checkouts must nonetheless be clean, or the difference is a working-tree edit rather than
    # a materialisation difference, and the pipeline would refuse them for an unrelated reason.
    foreach ($d in @($lfDir, $crlfDir)) {
        $dirty = Invoke-Git @('-C', $d, 'status', '--porcelain') 'checking the checkout is clean'
        if ($dirty) { throw "the checkout at $d is not clean:`n$dirty" }
    }
    Write-Host "  the same commit is on disk as different bytes, and git considers both unmodified" -ForegroundColor Yellow

    Write-Step "Running the complete local Docker pipeline from each checkout"
    $lf = Invoke-PipelineIn $lfDir 'lf'
    $crlf = Invoke-PipelineIn $crlfDir 'crlf'

    Write-Step "Comparing what the two runs established"
    Compare-Field 'verified commit' $lf.commit $crlf.commit
    Compare-Field 'result' $lf.result $crlf.result
    Compare-Field 'failed stage' "$($lf.failed)" "$($crlf.failed)"
    Compare-Field 'scope' $lf.scope $crlf.scope
    Compare-Field 'stage outcomes' $lf.stages $crlf.stages

    foreach ($name in @('validate', 'audit')) {
        if ($lf.$name -eq $crlf.$name) {
            Write-Host ("  {0,-22} identical" -f "$name output") -ForegroundColor Green
        }
        else {
            Write-Host ("  {0,-22} DIFFERS" -f "$name output") -ForegroundColor Red
            Write-Host "      lf   log: $($lf.log)"
            Write-Host "      crlf log: $($crlf.log)"
            $failures += "$name output"
        }
    }
    if ($lf.commit -ne $sha) { $failures += "the runs verified $($lf.commit), not the requested $sha" }

    Write-Host ""
    if ($Mutate) {
        # Inverted on purpose. Under the defect the comparison must fail; a mutated run that agrees
        # would mean the comparison above cannot see the thing it was written to see.
        if ($failures.Count -gt 0) {
            Write-Host "FALSIFIER WORKED: with the host-context defect restored, the runs disagreed on:" -ForegroundColor Green
            foreach ($f in $failures) { Write-Host "  - $f" }
            Write-Host "The equivalence check is capable of failing, so passing it means something."
            $exitCode = 0
        }
        else {
            Write-Host "FALSIFIER FAILED: the defect was restored and the runs still agreed." -ForegroundColor Red
            Write-Host "The equivalence check cannot detect the defect it exists to detect."
            $exitCode = 1
        }
    }
    elseif ($failures.Count -gt 0) {
        Write-Host "MATERIALISATION EQUIVALENCE FAILED" -ForegroundColor Red
        Write-Host "Two checkouts of $sha produced different results. Local CI is verifying the checkout,"
        Write-Host "not the commit. Differing: $($failures -join ', ')"
        $exitCode = 1
    }
    else {
        Write-Host "MATERIALISATION EQUIVALENCE HELD" -ForegroundColor Green
        Write-Host "Two checkouts of $sha with demonstrably different bytes on disk produced the same"
        Write-Host "verified SHA, the same stage outcomes, the same verdict, and the same repository answers."
        $exitCode = 0
    }
}
catch {
    Write-Host ""
    Write-Host "could not complete: $($_.Exception.Message)" -ForegroundColor Red
    $exitCode = 2
}
finally {
    if ($KeepCheckouts) {
        Write-Host ""
        Write-Host "Checkouts and logs kept at $WorkRoot" -ForegroundColor Yellow
    }
    elseif (Test-Path $WorkRoot) {
        # Scoped to the directory this invocation created under the system temp directory, by exact
        # path. Never a wildcard sweep.
        Remove-Item $WorkRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

exit $exitCode
