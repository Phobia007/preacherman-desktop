$ErrorActionPreference = "Stop"

$packageRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $packageRoot "..\..")).Path
$dataDirectory = Join-Path $workspaceRoot ".runtime-tmp\preacherman-data"
$nodePath = (Get-Command node -ErrorAction Stop).Source
$uiPort = 1422
$servicePort = 8789
$uiOrigin = "http://127.0.0.1:$uiPort"
$uiUrl = "$uiOrigin/__surfaces/test"
$uiProbe = "$uiOrigin/src/App.tsx"
$serviceProbe = "http://127.0.0.1:$servicePort/api/health"
$providerProbe = "http://127.0.0.1:$servicePort/api/execution/providers/status"

function Test-Endpoint([string]$Uri, [hashtable]$Headers = @{}) {
  try {
    $response = Invoke-WebRequest -Uri $Uri -Headers $Headers -UseBasicParsing -TimeoutSec 3
    return $response.StatusCode -eq 200
  }
  catch {
    return $false
  }
}

function Wait-Endpoint([string]$Uri, [string]$Label, [hashtable]$Headers = @{}) {
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    if (Test-Endpoint $Uri $Headers) { return }
    Start-Sleep -Milliseconds 250
  }
  throw "$Label did not become ready at $Uri"
}

New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
$originHeaders = @{ Origin = $uiOrigin }

if (-not (Test-Endpoint $serviceProbe $originHeaders)) {
  $previousServicePort = $env:PREACHERMAN_SERVICE_PORT
  $previousDataDirectory = $env:PREACHERMAN_DATA_DIR
  $previousPreviewOrigins = $env:PREACHERMAN_PREVIEW_ORIGINS
  try {
    $env:PREACHERMAN_SERVICE_PORT = [string]$servicePort
    $env:PREACHERMAN_DATA_DIR = $dataDirectory
    $env:PREACHERMAN_PREVIEW_ORIGINS = $uiOrigin
    Start-Process -FilePath $nodePath -ArgumentList @("--env-file-if-exists=.env.local", "server/index.mjs") -WorkingDirectory $packageRoot -WindowStyle Hidden
  }
  finally {
    if ($null -eq $previousServicePort) { Remove-Item Env:PREACHERMAN_SERVICE_PORT -ErrorAction SilentlyContinue } else { $env:PREACHERMAN_SERVICE_PORT = $previousServicePort }
    if ($null -eq $previousDataDirectory) { Remove-Item Env:PREACHERMAN_DATA_DIR -ErrorAction SilentlyContinue } else { $env:PREACHERMAN_DATA_DIR = $previousDataDirectory }
    if ($null -eq $previousPreviewOrigins) { Remove-Item Env:PREACHERMAN_PREVIEW_ORIGINS -ErrorAction SilentlyContinue } else { $env:PREACHERMAN_PREVIEW_ORIGINS = $previousPreviewOrigins }
  }
}

Wait-Endpoint $serviceProbe "Preacherman fusion service" $originHeaders
Wait-Endpoint $providerProbe "HomeRail provider status" $originHeaders

if (-not (Test-Endpoint $uiProbe)) {
  $previousUiServicePort = $env:VITE_PREACHERMAN_SERVICE_PORT
  try {
    $env:VITE_PREACHERMAN_SERVICE_PORT = [string]$servicePort
    Start-Process -FilePath $nodePath -ArgumentList @("node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", [string]$uiPort, "--strictPort") -WorkingDirectory $packageRoot -WindowStyle Hidden
  }
  finally {
    if ($null -eq $previousUiServicePort) { Remove-Item Env:VITE_PREACHERMAN_SERVICE_PORT -ErrorAction SilentlyContinue } else { $env:VITE_PREACHERMAN_SERVICE_PORT = $previousUiServicePort }
  }
}

Wait-Endpoint $uiProbe "Preacherman fusion interface"
$appSource = (Invoke-WebRequest -Uri $uiProbe -UseBasicParsing -TimeoutSec 5).Content
if ($appSource -notmatch "HomeRailFusionPanel") {
  throw "Port $uiPort is not serving the HomeRail fusion worktree."
}

Start-Process -FilePath $uiUrl
