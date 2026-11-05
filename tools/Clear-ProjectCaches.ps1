param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
# Only disposable caches. Never delete output, assets, user data, Git objects,
# Docker volumes, node_modules or the verified Cargo release cache.
$relativePaths = @('.remotion', '.playwright-cli', '.cache\npm', '.cache\tmp',
    '.runtime-tmp\audio2face\.venv', '.runtime-tmp\speech2motion\.venv')
$processes = @(Get-CimInstance Win32_Process)
$busy = @($processes | Where-Object {
    $_.CommandLine -and $_.CommandLine.Contains($repository) -and
    $_.Name -match '^(node|python|chrome-headless-shell|cargo|rustc|link)\.exe$'
})
if ($busy.Count) { throw ('Project tools are running; inspect PIDs before cleanup: ' + ($busy.ProcessId -join ', ')) }
$tracked = @(git -C $repository ls-files)
if ($LASTEXITCODE -ne 0) { throw 'Cannot verify tracked files.' }
$report = @()
foreach ($relative in $relativePaths) {
    $target = [IO.Path]::GetFullPath((Join-Path $repository $relative))
    if (!$target.StartsWith($repository + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Target escapes workspace.' }
    if (!(Test-Path -LiteralPath $target)) { continue }
    $prefix = $relative.Replace('\', '/') + '/'
    if (@($tracked | Where-Object { $_.StartsWith($prefix) }).Count) { throw "Tracked content in $relative" }
    $items = @((Get-Item -LiteralPath $target -Force)) + @(Get-ChildItem -LiteralPath $target -Recurse -Force)
    if (@($items | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw "Reparse point in $relative" }
    $bytes = ($items | Where-Object { !$_.PSIsContainer } | Measure-Object Length -Sum).Sum
    if ($Apply) { Remove-Item -LiteralPath $target -Recurse -Force }
    $report += [pscustomobject]@{Path=$target; Bytes=$bytes; Removed=[bool]$Apply}
}
$report | ConvertTo-Json
