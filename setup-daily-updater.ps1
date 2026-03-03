# ============================================================
#  Claude Code Guide — Daily Updater Setup
#  Run this ONCE as Administrator to register the Task Scheduler job.
#
#  What this does:
#    - Creates a Windows Task Scheduler task named "ClaudeCodeGuideUpdater"
#    - Runs: node.exe assets/js/updater.js   at 07:00 AM every day
#    - Working directory: this script's folder (the site root)
#    - Logs to: Desktop\claude-updater.log
#
#  Prerequisites:
#    1. Node.js installed (https://nodejs.org)
#    2. Your Netlify build hook URL set in assets/js/updater.js
#       OR passed as -NetlifyHook parameter below
#
#  Usage:
#    .\setup-daily-updater.ps1
#    .\setup-daily-updater.ps1 -NetlifyHook "https://api.netlify.com/build_hooks/YOUR_HOOK_ID"
# ============================================================

param(
  [string]$NetlifyHook = ""
)

$ErrorActionPreference = "Stop"

# ─── Paths ────────────────────────────────────────────────────────────────────
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$UpdaterJs   = Join-Path $ScriptDir "assets\js\updater.js"
$LogFile     = Join-Path $env:USERPROFILE "Desktop\claude-updater.log"
$TaskName    = "ClaudeCodeGuideUpdater"

# Find node.exe (checks PATH first, then known locations)
$NodePath = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $NodePath) {
    $candidates = @(
        "$env:LOCALAPPDATA\ms-playwright-go\1.50.1\node.exe",
        "C:\Program Files\nodejs\node.exe",
        "C:\Program Files (x86)\nodejs\node.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $NodePath = $c; break }
    }
}
if (-not $NodePath) {
    Write-Host "ERROR: node.exe not found." -ForegroundColor Red
    Write-Host "       Install Node.js from https://nodejs.org and re-run this script."
    exit 1
}

Write-Host "Found node.exe at: $NodePath" -ForegroundColor Cyan

# Verify updater.js exists
if (-not (Test-Path $UpdaterJs)) {
    Write-Host "ERROR: updater.js not found at $UpdaterJs" -ForegroundColor Red
    exit 1
}

# ─── Optionally patch the hook URL into updater.js ───────────────────────────
if ($NetlifyHook -ne "") {
    Write-Host "Patching Netlify hook URL into updater.js..." -ForegroundColor Yellow
    $content = Get-Content $UpdaterJs -Raw
    $content = $content -replace "netlifyHook: process\.env\.NETLIFY_HOOK \|\| 'YOUR_NETLIFY_HOOK_URL_HERE'",
                                  "netlifyHook: process.env.NETLIFY_HOOK || '$NetlifyHook'"
    Set-Content $UpdaterJs -Value $content -Encoding UTF8
    Write-Host "  Hook URL patched successfully." -ForegroundColor Green
}

# ─── Build Task Scheduler action ─────────────────────────────────────────────
$Action = New-ScheduledTaskAction `
    -Execute  $NodePath `
    -Argument "`"$UpdaterJs`"" `
    -WorkingDirectory $ScriptDir

# ─── Build Trigger (daily at 07:00) ──────────────────────────────────────────
$Trigger = New-ScheduledTaskTrigger `
    -Daily `
    -At "07:00AM"

# ─── Settings ────────────────────────────────────────────────────────────────
$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit   (New-TimeSpan -Minutes 10) `
    -StartWhenAvailable   $true `
    -RunOnlyIfNetworkAvailable $true `
    -WakeToRun            $false

# ─── Principal (run as current user, only when logged on) ────────────────────
$Principal = New-ScheduledTaskPrincipal `
    -UserId   $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Highest

# ─── Environment variable for Netlify hook ────────────────────────────────────
# If hook was passed as a parameter, also set it as an env variable in the task
$EnvVars = @{}
if ($NetlifyHook -ne "") {
    $EnvVars["NETLIFY_HOOK"] = $NetlifyHook
}

# ─── Remove existing task if present ─────────────────────────────────────────
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Removing existing task '$TaskName'..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# ─── Register the task ───────────────────────────────────────────────────────
Write-Host "Registering Task Scheduler job '$TaskName'..." -ForegroundColor Cyan

Register-ScheduledTask `
    -TaskName   $TaskName `
    -Action     $Action `
    -Trigger    $Trigger `
    -Settings   $Settings `
    -Principal  $Principal `
    -Description "Daily 7 AM updater for Claude Code Guide — fetches latest news and triggers Netlify rebuild." | Out-Null

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Task Scheduler job registered!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Task name  : $TaskName"
Write-Host "  Runs at    : 07:00 AM daily"
Write-Host "  Script     : $UpdaterJs"
Write-Host "  Working dir: $ScriptDir"
Write-Host "  Log file   : $LogFile"
Write-Host ""

# ─── Verify registration ─────────────────────────────────────────────────────
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "Verified: task is registered and set to '$($task.State)'" -ForegroundColor Green
} else {
    Write-Host "WARNING: Task registration could not be verified." -ForegroundColor Yellow
}

# ─── Offer to run immediately ────────────────────────────────────────────────
Write-Host ""
$runNow = Read-Host "Run the updater now to test it? (y/n)"
if ($runNow -eq 'y' -or $runNow -eq 'Y') {
    Write-Host ""
    Write-Host "Running updater.js now..." -ForegroundColor Cyan
    & $NodePath $UpdaterJs
    Write-Host ""
    Write-Host "Done! Check log at: $LogFile" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Skipped. The task will run automatically at 7:00 AM tomorrow." -ForegroundColor Cyan
    Write-Host "To run manually: node `"$UpdaterJs`""
}

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
