param([string]$Root = $PSScriptRoot)
. (Join-Path $PSScriptRoot 'Runtime-Common.ps1')
$docker = Get-DockerExecutable
foreach ($service in @(@{Name='speech2motion'; Project='preacherman-speech2motion'}, @{Name='audio2face'; Project='preacherman-audio2face'})) {
    $directory = [IO.Path]::GetFullPath((Join-Path $Root $service.Name)).TrimEnd('\')
    $ids = @(& $docker ps -aq --filter "label=com.docker.compose.project=$($service.Project)")
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect Docker service ownership.' }
    foreach ($id in $ids) {
        if (!$id) { continue }
        $labels = & $docker inspect --format '{{json .Config.Labels}}' $id | ConvertFrom-Json
        $working = $labels.'com.docker.compose.project.working_dir'.Replace('/','\').TrimEnd('\')
        if ($working -ne $directory) { throw "Refusing to stop another installation at $working." }
    }
    if ($ids.Count) { Invoke-Checked $docker @('compose','-f',(Join-Path $directory 'compose.yaml'),'stop') }
}
$breeze = Join-Path $Root 'breeze\Stop-Breeze.ps1'
if (Test-Path -LiteralPath $breeze) { & $breeze }
Write-Host 'Stopped this installation only. Models, voices and character memories are preserved.'
