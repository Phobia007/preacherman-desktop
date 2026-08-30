[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$runtimeRoot = Join-Path $repositoryRoot ".runtime-tmp\speech2motion"
$upstreamRoot = Join-Path $runtimeRoot "upstream"
$pythonPath = Join-Path $runtimeRoot ".venv\Scripts\python.exe"
$gdownPath = Join-Path $runtimeRoot ".venv\Scripts\gdown.exe"
$downloadRoot = Join-Path $runtimeRoot "downloads"
$archivePath = Join-Path $downloadRoot "motion_data.zip"
$databasePath = Join-Path $upstreamRoot "data\motion_database.db"

New-Item -ItemType Directory -Force -Path $runtimeRoot, $downloadRoot | Out-Null

if (-not (Test-Path -LiteralPath (Join-Path $upstreamRoot ".git"))) {
  git clone --depth 1 https://github.com/dlp3d-ai/speech2motion.git $upstreamRoot
}

if (-not (Test-Path -LiteralPath $pythonPath)) {
  python -m venv (Join-Path $runtimeRoot ".venv")
}

& $pythonPath -m pip install --disable-pip-version-check -e $upstreamRoot
& $pythonPath -m pip install --disable-pip-version-check gdown

if (-not (Test-Path -LiteralPath $archivePath)) {
  & $gdownPath "112pnjuIuNqADS-fAT6RUIAVPtb3VlWlq" -O $archivePath
}

if (-not (Test-Path -LiteralPath $databasePath)) {
  tar -xf $archivePath -C $upstreamRoot
}

& $pythonPath -c "import speech2motion; from speech2motion.io.protobuf import streaming_v3_pb2; print('Speech2Motion setup complete.')"
