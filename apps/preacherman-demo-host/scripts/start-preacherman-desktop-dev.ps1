$ErrorActionPreference = "Stop"

$packageRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source

Set-Location -LiteralPath $packageRoot
& $npmPath run tauri -- dev --config src-tauri/tauri.desktop-dev.conf.json
exit $LASTEXITCODE
