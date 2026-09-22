# ============================================================
# Android build helper for dodo32 / CallNote
# (ASCII-only on purpose: avoids PowerShell encoding issues)
#
# Purpose: avoid wasting time on the recurring build lock error:
#   "Unable to delete directory" / "java.nio.file.AccessDeniedException"
# It stops the Gradle/Kotlin daemons first, then builds.
#
# Usage:
#   .\build_android.ps1              # stop daemons, then build
#   .\build_android.ps1 -Clean       # also delete build folders first
#   .\build_android.ps1 -LockOnly    # only clear the lock (no build)
#   .\build_android.ps1 -Diagnose    # show what is holding the files
#
# KEY RULE: always stop daemons BEFORE deleting build folders.
#           If a daemon is alive, even the delete will fail.
# ============================================================

param(
    [switch]$Clean,
    [switch]$LockOnly,
    [switch]$Diagnose
)

$ErrorActionPreference = 'Continue'
$ProjectDir = 'd:\dodo32\CallNote'
$JbrPath    = 'C:\Program Files\Android\Android Studio\jbr'

function Write-Step($msg) { Write-Host ""; Write-Host "=== $msg ===" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn2($msg){ Write-Host "  [!]  $msg" -ForegroundColor Yellow }

function Show-Diagnose {
    Write-Step "Diagnose: running related processes"
    $procs = Get-Process |
        Where-Object { $_.ProcessName -match 'java|kotlin|studio' } |
        Select-Object Id, ProcessName, @{n='MB';e={[math]::Round($_.WorkingSet64/1MB)}}, StartTime
    if ($procs) {
        $procs | Format-Table -AutoSize
        $javaCount = ($procs | Where-Object { $_.ProcessName -match 'java|kotlin' }).Count
        if ($javaCount -gt 0) {
            Write-Warn2 "$javaCount daemon(s) alive - likely the cause of the build lock"
        }
    } else {
        Write-Ok "no related processes (daemons cleared)"
    }

    $locked = Join-Path $ProjectDir 'app\build'
    if (Test-Path $locked) {
        $any = Get-ChildItem $locked -Recurse -Force -ErrorAction SilentlyContinue | Select-Object -First 1
        Write-Host "  app\build exists: True / empty: $(-not $any)"
        if (-not $any) { Write-Warn2 "empty but undeletable = daemon lock (NOT a code problem)" }
    } else {
        Write-Ok "app\build absent (already clean)"
    }
}

function Clear-Lock {
    Write-Step "1) Stop Gradle/Kotlin daemons"
    $gw = Join-Path $ProjectDir 'gradlew.bat'
    if (Test-Path $gw) {
        Push-Location $ProjectDir
        try {
            if (Test-Path $JbrPath) { $env:JAVA_HOME = $JbrPath }
            & .\gradlew.bat --stop 2>&1 | Out-Null
            Write-Ok "gradlew --stop done"
        } finally { Pop-Location }
    } else {
        Write-Warn2 "gradlew.bat not found - forcing process kill"
    }

    Start-Sleep -Seconds 4

    # Force-kill leftover java/kotlin daemons. Do NOT touch Android Studio.
    $left = Get-Process | Where-Object { $_.ProcessName -match '^java$|kotlin' }
    if ($left) {
        Write-Warn2 "force-killing $($left.Count) leftover daemon(s)"
        $left | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    }
    Write-Ok "daemons cleared"
}

function Remove-BuildDir {
    Write-Step "2) Delete build folders"
    $targets = @((Join-Path $ProjectDir 'app\build'), (Join-Path $ProjectDir 'build'))
    foreach ($t in $targets) {
        if (-not (Test-Path $t)) { Write-Ok "already absent: $t"; continue }

        $removed = $false
        for ($i = 1; $i -le 3; $i++) {
            Remove-Item $t -Recurse -Force -ErrorAction SilentlyContinue
            if (-not (Test-Path $t)) { $removed = $true; break }
            Write-Warn2 "delete retry $i/3 ..."
            Start-Sleep -Seconds 2
        }

        if ($removed) { Write-Ok "deleted: $t" }
        else {
            Write-Warn2 "delete FAILED: $t"
            Write-Warn2 "-> If Android Studio is open, close it and run again."
        }
    }
}

function Invoke-Build {
    Write-Step "3) Build (assembleDebug)"
    Push-Location $ProjectDir
    try {
        if (Test-Path $JbrPath) {
            $env:JAVA_HOME = $JbrPath
            Write-Ok "JAVA_HOME = $JbrPath"
        } else {
            Write-Warn2 "JBR not found: $JbrPath"
        }
        & .\gradlew.bat assembleDebug 2>&1 | Select-Object -Last 20
    } finally { Pop-Location }

    $outDir = Join-Path $ProjectDir 'app\build\outputs\apk\debug'
    $apk = Get-ChildItem $outDir -Filter *.apk -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($apk) {
        $mb = [math]::Round($apk.Length / 1MB, 2)
        Write-Ok "BUILD SUCCESSFUL - $($apk.Name) ($mb MB)"
        Write-Host "     $($apk.FullName)" -ForegroundColor Green
    } else {
        Write-Warn2 "APK not found. Check the FAILED lines above."
        Write-Host "     If the same lock error repeats, fully close Android Studio and retry." -ForegroundColor Yellow
    }
}

# ============================================================
# main
# ============================================================
Write-Host "dodo32 Android build helper" -ForegroundColor White
Write-Host "project: $ProjectDir" -ForegroundColor Gray

if ($Diagnose) {
    Show-Diagnose
    exit 0
}

Clear-Lock

if ($LockOnly) {
    Write-Ok "lock cleared only (-LockOnly)"
    exit 0
}

if ($Clean) {
    Remove-BuildDir
} else {
    Write-Host ""
    Write-Host "(build folder delete skipped - use -Clean if needed)" -ForegroundColor Gray
}

Invoke-Build
