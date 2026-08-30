[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$runtimeRoot = Join-Path $repositoryRoot ".runtime-tmp\speech2motion"
$upstreamRoot = Join-Path $runtimeRoot "upstream"
$pythonPath = Join-Path $runtimeRoot ".venv\Scripts\python.exe"
$databasePath = Join-Path $upstreamRoot "data\motion_database.db"

if (-not (Test-Path -LiteralPath $pythonPath) -or -not (Test-Path -LiteralPath $databasePath)) {
  throw "Speech2Motion is not set up. Run tools/speech2motion/setup.ps1 first."
}

Push-Location $upstreamRoot
try {
  & $pythonPath main.py --config_path configs/local.py
} finally {
  Pop-Location
}
