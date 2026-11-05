param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$server = Join-Path $PSScriptRoot 'runtime\breeze-tts-2-v0.1.3-windows-x64-vulkan\breeze-server.exe'
$model = Join-Path $PSScriptRoot 'models\breeze-tts-2-q8_0.gguf'
$stateFile = Join-Path $PSScriptRoot 'server-process.json'
$process = $null; $created = $false
try {
    if (!(Test-Path -LiteralPath $server) -or !(Test-Path -LiteralPath $model)) { throw 'Breeze installation is incomplete.' }
    if (Test-Path -LiteralPath $stateFile) {
        $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
        $candidate = Get-Process -Id $state.processId -ErrorAction SilentlyContinue
        if ($candidate -and $candidate.Path -eq $server -and [Math]::Abs(($candidate.StartTime.ToUniversalTime() - [datetime]$state.startTimeUtc).TotalSeconds) -lt 1) { $process = $candidate }
    }
    if (!$process) {
        if (@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in 18760,18761 }).Count) { throw 'Breeze ports are occupied by another installation. No duplicate was started.' }
        $env:TEMP = Join-Path $PSScriptRoot 'temp'; $env:TMP = $env:TEMP
        foreach ($folder in @('voices','logs','temp')) { New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot $folder) | Out-Null }
        $arguments = '"' + $model + '" --host 127.0.0.1 --port 18760 --ws-port 18761 --webui --voices-dir "' + (Join-Path $PSScriptRoot 'voices') + '"'
        $process = Start-Process -FilePath $server -ArgumentList $arguments -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'logs\server.stdout.log') -RedirectStandardError (Join-Path $PSScriptRoot 'logs\server.stderr.log') -PassThru
        $created = $true
        @{processId=$process.Id; startTimeUtc=$process.StartTime.ToUniversalTime().ToString('o'); executable=$server; port=18760} | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
    }
    $deadline = (Get-Date).AddSeconds(180)
    do {
        $process.Refresh()
        if ($process.HasExited) { throw 'Breeze exited. Check logs\server.stderr.log and your graphics driver.' }
        try { $health=Invoke-RestMethod http://127.0.0.1:18760/health -TimeoutSec 2; if ($health.status -eq 'ok') { break } } catch {}
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)
    if (!$health -or $health.status -ne 'ok') { throw 'Breeze startup timed out.' }
    if (!$NoBrowser) { Start-Process 'http://127.0.0.1:18760/' }
    Write-Host 'Breeze ready on 127.0.0.1:18760.'
} catch {
    if ($created -and $process) {
        $owned = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
        if ($owned -and $owned.Path -eq $server) { Stop-Process -Id $owned.Id }
    }
    throw
}
