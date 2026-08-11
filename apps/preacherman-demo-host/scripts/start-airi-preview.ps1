$ErrorActionPreference = "Stop"

$packageRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $packageRoot "..\..")).Path
$dataDirectory = Join-Path $workspaceRoot ".runtime-tmp\preacherman-airi-data"
$nodePath = (Get-Command node -ErrorAction Stop).Source
$uiPort = 1421
$servicePort = 8788
$uiUrl = "http://127.0.0.1:$uiPort/__surfaces/home"
$uiProbe = "http://127.0.0.1:$uiPort/src/App.tsx"
$serviceProbe = "http://127.0.0.1:$servicePort/api/health"

function Test-PreviewEndpoint([string]$Uri) {
  try {
    $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  }
  catch {
    return $false
  }
}

function Wait-PreviewEndpoint([string]$Uri, [string]$Label) {
  for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
    if (Test-PreviewEndpoint $Uri) {
      return
    }
    Start-Sleep -Milliseconds 250
  }
  throw "$Label did not become ready at $Uri"
}

New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null

if (-not (Test-PreviewEndpoint $serviceProbe)) {
  $previousServicePort = $env:PREACHERMAN_SERVICE_PORT
  $previousDataDirectory = $env:PREACHERMAN_DATA_DIR
  try {
    $env:PREACHERMAN_SERVICE_PORT = [string]$servicePort
    $env:PREACHERMAN_DATA_DIR = $dataDirectory
    Start-Process -FilePath $nodePath -ArgumentList @("--env-file-if-exists=.env.local", "server/index.mjs") -WorkingDirectory $packageRoot -WindowStyle Hidden
  }
  finally {
    if ($null -eq $previousServicePort) { Remove-Item Env:PREACHERMAN_SERVICE_PORT -ErrorAction SilentlyContinue } else { $env:PREACHERMAN_SERVICE_PORT = $previousServicePort }
    if ($null -eq $previousDataDirectory) { Remove-Item Env:PREACHERMAN_DATA_DIR -ErrorAction SilentlyContinue } else { $env:PREACHERMAN_DATA_DIR = $previousDataDirectory }
  }
}

if (-not (Test-PreviewEndpoint $uiProbe)) {
  $previousUiServicePort = $env:VITE_PREACHERMAN_SERVICE_PORT
  try {
    $env:VITE_PREACHERMAN_SERVICE_PORT = [string]$servicePort
    Start-Process -FilePath $nodePath -ArgumentList @("node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", [string]$uiPort, "--strictPort") -WorkingDirectory $packageRoot -WindowStyle Hidden
  }
  finally {
    if ($null -eq $previousUiServicePort) { Remove-Item Env:VITE_PREACHERMAN_SERVICE_PORT -ErrorAction SilentlyContinue } else { $env:VITE_PREACHERMAN_SERVICE_PORT = $previousUiServicePort }
  }
}

Wait-PreviewEndpoint $serviceProbe "Preacherman AIRI service"
Wait-PreviewEndpoint $uiProbe "Preacherman AIRI interface"

$appSource = (Invoke-WebRequest -Uri $uiProbe -UseBasicParsing -TimeoutSec 5).Content
if ($appSource -notmatch "SurfaceToolbar" -or $appSource -notmatch "D:/preacherman") {
  throw "Port $uiPort is not serving the D:\preacherman AIRI interface."
}

Start-Process -FilePath $uiUrl
