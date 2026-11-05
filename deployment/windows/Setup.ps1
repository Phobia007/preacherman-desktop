$ErrorActionPreference = 'Stop'
Write-Host 'Preacherman local services - Windows x64'
Write-Host 'Install Docker Desktop with Linux containers first. Downloads need about 15 GB free space.'
$defaultRoot = if (Test-Path 'D:\') { 'D:\PreachermanRuntime' } else { Join-Path $env:LOCALAPPDATA 'Preacherman\runtime' }
$root = Read-Host "Installation folder (Enter for $defaultRoot)"
if (!$root) { $root = $defaultRoot }
Write-Host 'Optional Breeze TTS 2: research and non-commercial use only, including self-hosted outputs.'
Write-Host 'Terms: https://huggingface.co/BreezeBlue/Breeze-TTS-2/blob/main/LICENSE'
$breeze = (Read-Host 'Install Breeze and accept these terms? [y/N]') -match '^[Yy]$'
& (Join-Path $PSScriptRoot 'Install-Services.ps1') -Root $root -IncludeBreeze:$breeze -AcceptBreezeNonCommercialLicense:$breeze
