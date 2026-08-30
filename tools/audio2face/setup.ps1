param(
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$repository = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$runtime = Join-Path $repository ".runtime-tmp\audio2face"
$archive = Join-Path $runtime "audio2face-main.zip"
$sourceParent = Join-Path $runtime "source"
$source = Join-Path $sourceParent "audio2face-main"
$weight = Join-Path $runtime "unitalker_v0.4.0_base.onnx"
$environment = Join-Path $runtime ".venv"

New-Item -ItemType Directory -Force $runtime | Out-Null
if (-not (Test-Path -LiteralPath $source)) {
  & curl.exe -L --retry 5 --connect-timeout 30 -o $archive "https://codeload.github.com/dlp3d-ai/audio2face/zip/refs/heads/main"
  if ($LASTEXITCODE -ne 0) { throw "Audio2Face source download failed." }
  Expand-Archive -LiteralPath $archive -DestinationPath $sourceParent -Force
}
if (-not (Test-Path -LiteralPath $weight)) {
  & curl.exe -L --retry 5 --connect-timeout 30 -o $weight "https://github.com/LazyBusyYang/CatStream/releases/download/a2f_cicd_files/unitalker_v0.4.0_base.onnx"
  if ($LASTEXITCODE -ne 0) { throw "Unitalker weight download failed." }
}
if (-not (Test-Path -LiteralPath $environment)) {
  & $Python -m venv --system-site-packages $environment
}
$venvPython = Join-Path $environment "Scripts\python.exe"
& $venvPython -m pip install -e $source
if ($LASTEXITCODE -ne 0) { throw "Audio2Face dependency installation failed." }
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
  & $venvPython -m pip install --upgrade "onnxruntime-gpu[cuda,cudnn]==1.22.0"
  if ($LASTEXITCODE -ne 0) { throw "Audio2Face GPU runtime installation failed." }
}
New-Item -ItemType Directory -Force (Join-Path $source "weights") | Out-Null
Copy-Item -LiteralPath $weight -Destination (Join-Path $source "weights\unitalker_v0.4.0_base.onnx") -Force
& $venvPython -c "import audio2face, onnxruntime, torch, transformers; print('Audio2Face runtime ready:', onnxruntime.get_available_providers())"
