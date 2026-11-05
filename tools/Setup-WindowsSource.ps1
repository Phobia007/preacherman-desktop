param()
$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot
foreach ($command in @('node.exe','npm.cmd','cargo.exe')) { Get-Command $command -ErrorAction Stop | Out-Null }
$busy = @(Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and $_.CommandLine.Contains($repository) -and $_.Name -match '^(cargo|rustc|link|node)\.exe$' -and $_.CommandLine -match 'build|vite|tauri|npm-cli'
})
if ($busy.Count) { throw 'A source install or build is already running for this checkout.' }
foreach ($name in @('preacherman-presentation-runtime','preacherman-avatar-renderer','preacherman-surface-skin')) {
    $package = Join-Path $repository "packages\$name"
    & npm.cmd --prefix $package ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "$name dependency install failed." }
    & npm.cmd --prefix $package run build
    if ($LASTEXITCODE -ne 0) { throw "$name build failed." }
}
& npm.cmd --prefix (Join-Path $repository 'apps\preacherman-demo-host') ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Desktop dependency install failed.' }
Write-Host 'Source dependencies are ready. In apps/preacherman-demo-host run npm run build:windows:installer.'
