$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $PSScriptRoot
$uiUrl = "http://127.0.0.1:1420"
$serviceHealthUrl = "http://127.0.0.1:8787/api/health"
$logDir = Join-Path $appRoot ".launcher-logs"

function Test-Endpoint {
    param([Parameter(Mandatory = $true)][string]$Uri)

    try {
        $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    }
    catch {
        return $false
    }
}

function Start-HiddenNodeProcess {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$LogName
    )

    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    $stdoutPath = Join-Path $logDir "$LogName-stdout.log"
    $stderrPath = Join-Path $logDir "$LogName-stderr.log"

    Start-Process `
        -FilePath $nodePath `
        -ArgumentList $Arguments `
        -WorkingDirectory $appRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath
}

function Open-AppWindow {
    param([Parameter(Mandatory = $true)][string]$Url)

    $edgePath = @(
        (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
        (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

    if ($edgePath) {
        Start-Process -FilePath $edgePath -ArgumentList "--app=$Url", "--start-maximized"
        return
    }

    Start-Process $Url
}

try {
    $Host.UI.RawUI.WindowTitle = "Starting Preacherman Demo"
    Write-Host "Starting Preacherman Demo..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null

    if (-not (Test-Endpoint -Uri $serviceHealthUrl)) {
        Write-Host "Starting local service..."
        Start-HiddenNodeProcess `
            -Arguments @("--env-file-if-exists=.env.local", "server/index.mjs") `
            -LogName "service"
    }

    if (-not (Test-Endpoint -Uri $uiUrl)) {
        Write-Host "Starting interface..."
        Start-HiddenNodeProcess `
            -Arguments @(
                "node_modules/vite/bin/vite.js",
                "--host", "127.0.0.1",
                "--port", "1420",
                "--strictPort"
            ) `
            -LogName "ui"
    }

    $deadline = (Get-Date).AddSeconds(45)
    do {
        $serviceReady = Test-Endpoint -Uri $serviceHealthUrl
        $uiReady = Test-Endpoint -Uri $uiUrl

        if ($serviceReady -and $uiReady) {
            Write-Host "Ready. Opening the app..." -ForegroundColor Green
            Open-AppWindow -Url $uiUrl
            exit 0
        }

        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)

    throw "The local service or interface did not become ready within 45 seconds."
}
catch {
    Write-Host ""
    Write-Host "Preacherman Demo could not start." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Logs: $logDir"
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}
