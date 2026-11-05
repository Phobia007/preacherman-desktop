param([string]$Root = $PSScriptRoot, [switch]$Pull)
. (Join-Path $PSScriptRoot 'Runtime-Common.ps1')
$docker = Get-DockerExecutable
& $docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Invoke-Checked $docker @('desktop','start','--detach')
    $ready = $false
    for ($i=0; $i -lt 40; $i++) {
        & $docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready=$true; break }
        Start-Sleep -Seconds 2
    }
    if (!$ready) { throw 'Docker Desktop is not ready. Start its Linux-container backend and retry.' }
}
$services = @(@{Name='speech2motion'; Project='preacherman-speech2motion'; Port=18084}, @{Name='audio2face'; Project='preacherman-audio2face'; Port=18083})
# Refuse to replace an existing service installed elsewhere, even if its project
# name or port matches. Docker is shared with unrelated applications.
foreach ($service in $services) {
    $directory = [IO.Path]::GetFullPath((Join-Path $Root $service.Name)).TrimEnd('\')
    $ids = @(& $docker ps -aq --filter "label=com.docker.compose.project=$($service.Project)")
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect Docker service ownership.' }
    foreach ($id in $ids) {
        if (!$id) { continue }
        $labels = & $docker inspect --format '{{json .Config.Labels}}' $id | ConvertFrom-Json
        $working = $labels.'com.docker.compose.project.working_dir'.Replace('/','\').TrimEnd('\')
        if ($working -ne $directory) { throw "A $($service.Name) deployment already exists at $working. It was not replaced." }
    }
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $service.Port -ErrorAction SilentlyContinue)
    if ($listeners.Count -and !$ids.Count) { throw "Port $($service.Port) is occupied by another installation. It was not stopped." }
}
foreach ($service in $services) {
    $compose = Join-Path $Root "$($service.Name)\compose.yaml"
    if ($Pull) { Invoke-Checked $docker @('compose','-f',$compose,'pull') }
    Invoke-Checked $docker @('compose','-f',$compose,'up','-d','--no-build','--pull','never')
    Wait-Service "http://127.0.0.1:$($service.Port)/health" | Out-Null
    Write-Host "$($service.Name) ready on port $($service.Port)."
}
$breeze = Join-Path $Root 'breeze\Start-Breeze.ps1'
if (Test-Path -LiteralPath $breeze) { & $breeze -NoBrowser }
