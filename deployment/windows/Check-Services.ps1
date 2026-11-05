param([string]$Root = $PSScriptRoot)
$results = @()
foreach ($service in @(@{Name='Speech2Motion'; Port=18084}, @{Name='Audio2Face'; Port=18083}, @{Name='Breeze'; Port=18760})) {
    $ready = $false
    try { $health=Invoke-RestMethod -Uri "http://127.0.0.1:$($service.Port)/health" -TimeoutSec 3; $ready=[bool]$health } catch {}
    $results += [pscustomobject]@{Service=$service.Name; Port=$service.Port; Ready=$ready}
}
$results | Format-Table -AutoSize
$python = Join-Path $Root 'speech\venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $python)) { throw 'Speech recognition is not installed.' }
& $python -c "import faster_whisper; print('Speech recognition runtime available')"
if ($LASTEXITCODE -ne 0) { throw 'Speech recognition packages are unavailable.' }
Write-Host 'DeepSeek API keys are configured in Asset > Settings > Execution Mode.'
Write-Host 'Voice selection is configured in Asset > Appearance > Voice.'
