$ErrorActionPreference = "Stop"
$repository = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$runtime = Join-Path $repository ".runtime-tmp\audio2face"
$source = Join-Path $runtime "source\audio2face-main"
$python = Join-Path $runtime ".venv\Scripts\python.exe"
$weight = Join-Path $runtime "unitalker_v0.4.0_base.onnx"
$launcher = Join-Path $repository "tools\audio2face\preacherman_server.py"
if (-not (Test-Path -LiteralPath $python) -or -not (Test-Path -LiteralPath $source) -or -not (Test-Path -LiteralPath $weight)) {
  throw "Audio2Face is not installed. Run tools/audio2face/setup.ps1 first."
}
New-Item -ItemType Directory -Force (Join-Path $source "weights") | Out-Null
Copy-Item -LiteralPath $weight -Destination (Join-Path $source "weights\unitalker_v0.4.0_base.onnx") -Force
Push-Location $source
try {
  $providers = & $python -c "import json, onnxruntime as ort; print(json.dumps(ort.get_available_providers()))"
  $config = if ($providers -match 'CUDAExecutionProvider') { "configs/cuda.py" } else { "configs/cpu.py" }
  Write-Host "Audio2Face provider config: $config"
  & $python $launcher --config $config
} finally {
  Pop-Location
}
