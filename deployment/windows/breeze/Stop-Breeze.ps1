$ErrorActionPreference = 'Stop'
$stateFile = Join-Path $PSScriptRoot 'server-process.json'
if (!(Test-Path -LiteralPath $stateFile)) { return }
$state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
$expected = Join-Path $PSScriptRoot 'runtime\breeze-tts-2-v0.1.3-windows-x64-vulkan\breeze-server.exe'
$owned = Get-Process -Id $state.processId -ErrorAction SilentlyContinue
if (!$owned) { return }
if ($state.executable -ne $expected -or $owned.Path -ne $expected -or [Math]::Abs(($owned.StartTime.ToUniversalTime() - [datetime]$state.startTimeUtc).TotalSeconds) -ge 1) { throw 'Breeze process ownership does not match. No process was stopped.' }
Stop-Process -Id $owned.Id
