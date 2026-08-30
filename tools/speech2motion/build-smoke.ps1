[CmdletBinding()]
param(
  [string]$Text = "I understand. Let me think about it.",
  [double]$Duration = 3.2,
  [string]$ActionId = "speech-motion-smoke-001"
)

$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$runtimeRoot = Join-Path $repositoryRoot ".runtime-tmp\speech2motion"
$pythonPath = Join-Path $runtimeRoot ".venv\Scripts\python.exe"
$upstreamRoot = Join-Path $runtimeRoot "upstream"
$capturePath = Join-Path $runtimeRoot "captures\$ActionId.npz"
$previewRoot = Join-Path $runtimeRoot "previews"
$blenderPath = "D:\blender.exe"
$retargetScript = Join-Path $repositoryRoot "tools\blender\retarget_speech2motion_capture.py"
$speechBoneMap = Join-Path $repositoryRoot "tools\speech2motion\dlp3d-to-preacherman-rig.json"
$restpose = Join-Path $upstreamRoot "data\restpose_npz\KQ_default_0326_skeleton.npz"
$classifiedActions = Join-Path $repositoryRoot "asset-library\digital-humans\assets\classified-actions\v1"

if (-not (Test-Path -LiteralPath $pythonPath) -or -not (Test-Path -LiteralPath $restpose)) {
  throw "Speech2Motion is not set up. Run tools/speech2motion/setup.ps1 first."
}
if (-not (Test-Path -LiteralPath $blenderPath)) {
  throw "Blender was not found at $blenderPath"
}

& (Join-Path $PSScriptRoot "health.ps1") | Out-Host
& $pythonPath (Join-Path $PSScriptRoot "smoke_v3.py") `
  --app-name python_backend `
  --text $Text `
  --duration $Duration `
  --output $capturePath

$targets = @(
  @{
    Id = "cortana"
    Model = Join-Path $repositoryRoot "asset-library\digital-humans\assets\cortana\v1\runtime\model\cortana-runtime.glb"
    BoneMap = Join-Path $classifiedActions "bindings\cortana\bone-map.json"
  },
  @{
    Id = "zima"
    Model = Join-Path $repositoryRoot "asset-library\digital-humans\assets\zima\v1\source\model\zima.fbx"
    BoneMap = Join-Path $classifiedActions "bindings\zima\bone-map.json"
  }
)

foreach ($target in $targets) {
  $outputGlb = Join-Path $previewRoot "$($target.Id)-$ActionId.glb"
  $outputManifest = Join-Path $previewRoot "$($target.Id)-$ActionId.json"
  & $blenderPath --factory-startup -b `
    --python $retargetScript -- `
    --capture $capturePath `
    --restpose $restpose `
    --target $target.Model `
    --speech-bone-map $speechBoneMap `
    --target-bone-map $target.BoneMap `
    --action-id $ActionId `
    --output-glb $outputGlb `
    --output-manifest $outputManifest
}

[pscustomobject]@{
  actionId = $ActionId
  capture = $capturePath
  cortana = Join-Path $previewRoot "cortana-$ActionId.glb"
  zima = Join-Path $previewRoot "zima-$ActionId.glb"
}
