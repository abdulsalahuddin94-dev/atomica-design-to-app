# One-click machine setup for Windows (started by Setup-Windows.cmd in the Root).
# Installs everything in tools/dependencies.json that this computer is missing, with winget
# (built into Windows 10 and 11). No winget: opens each download page instead.
# Written for Windows PowerShell 5.1 (the one every Windows has), so no PowerShell 7 syntax.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$deps = (Get-Content -Raw -Encoding UTF8 (Join-Path $root 'tools\dependencies.json') | ConvertFrom-Json).dependencies

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Test-Version($text, $min) {
  if (-not $min) { return $true }
  $m = [regex]::Match($text, '\d+(\.\d+)*')
  if (-not $m.Success) { return $false }
  $a = $m.Value.Split('.') | ForEach-Object { [int]$_ }
  $b = "$min".Split('.') | ForEach-Object { [int]$_ }
  for ($i = 0; $i -lt $b.Count; $i++) {
    $x = 0; if ($i -lt $a.Count) { $x = $a[$i] }
    if ($x -ne $b[$i]) { return ($x -gt $b[$i]) }
  }
  return $true
}

function Test-Dep($dep) {
  foreach ($c in @($dep.check.commands)) {
    if (-not $c) { continue }
    $cmd = $c[0]; $cmdArgs = @($c | Select-Object -Skip 1)
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { continue }
    try {
      $out = (& $cmd @cmdArgs 2>&1 | Out-String).Trim()
      # The Microsoft Store "python" shortcut fails and prints no version, so it never counts.
      if ($LASTEXITCODE -eq 0 -and $out -match '\d+\.\d+' -and (Test-Version $out $dep.min_version)) { return $true }
    } catch { }
  }
  if ($dep.check.paths -and $dep.check.paths.win32) {
    foreach ($p in $dep.check.paths.win32) {
      if (Test-Path ([Environment]::ExpandEnvironmentVariables($p))) { return $true }
    }
  }
  return $false
}

Write-Host ''
Write-Host 'Atomica Studio - machine setup' -ForegroundColor Cyan
Write-Host 'Checking what this computer needs...'
Write-Host ''
$missing = @()
foreach ($d in $deps) {
  if (Test-Dep $d) { Write-Host ('  OK       ' + $d.name) -ForegroundColor Green }
  else { Write-Host ('  MISSING  ' + $d.name + '  (' + $d.why + ')') -ForegroundColor Yellow; $missing += $d }
}

if ($missing.Count -eq 0) {
  Write-Host ''
  Write-Host 'Everything is installed. Open Claude Code in this folder and start.' -ForegroundColor Green
  Read-Host 'Press Enter to close'
  exit 0
}

$winget = Get-Command winget -ErrorAction SilentlyContinue
Write-Host ''
if ($winget) {
  Write-Host 'Installing the missing tools. If Windows asks "Do you want to allow this app to make changes", click Yes.' -ForegroundColor Cyan
  foreach ($d in $missing) {
    Write-Host ''
    Write-Host ('Installing ' + $d.name + '...') -ForegroundColor Cyan
    # Run the exact command line from dependencies.json through a temp .cmd file, so its quotes
    # (Python's --override "...") reach winget unchanged.
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('ds-setup-' + $d.id + '.cmd')
    Set-Content -Path $tmp -Value ('@echo off' + [Environment]::NewLine + $d.install.win32) -Encoding ASCII
    cmd /c $tmp
    Remove-Item $tmp -ErrorAction SilentlyContinue
    Refresh-Path
  }
} else {
  Write-Host 'This Windows has no winget, so the download pages will open. Run each installer and click Next until it finishes.' -ForegroundColor Cyan
  Write-Host 'Python: tick "Add python.exe to PATH" on the first screen.' -ForegroundColor Cyan
  foreach ($d in $missing) {
    $url = [regex]::Match($d.install.manual, 'https?://\S+').Value
    if ($url) { Start-Process $url }
  }
  Read-Host 'When all installers are done, press Enter to check again'
  Refresh-Path
}

Write-Host ''
Write-Host 'Checking again...'
$still = @()
foreach ($d in $missing) {
  if (Test-Dep $d) { Write-Host ('  OK       ' + $d.name) -ForegroundColor Green }
  else { Write-Host ('  MISSING  ' + $d.name + '  ->  ' + $d.install.manual) -ForegroundColor Red; $still += $d }
}
Write-Host ''
if ($still.Count -eq 0) {
  Write-Host 'Done. Open Claude Code in this folder (close it first if it was open) and start.' -ForegroundColor Green
} else {
  Write-Host 'Some tools are still missing. Restart the computer and double-click Setup-Windows.cmd again,' -ForegroundColor Yellow
  Write-Host 'or open Claude Code in this folder and Claude will help.' -ForegroundColor Yellow
  foreach ($d in $still) { if ($d.note_win32) { Write-Host $d.note_win32 } }
}
Read-Host 'Press Enter to close'
