param([string]$BuildCache='E:\CodexStorage\build-cache\preacherman-integration-01a01e57\target')
$ErrorActionPreference='Stop'
$repository=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if($repository -ne 'D:\preacherman'){throw 'The canonical desktop source is D:\preacherman. Build there.'}
$app=Join-Path $repository 'apps\preacherman-demo-host'
$manifest=Get-Content -LiteralPath (Join-Path $app 'desktop-build-manifest.json') -Raw | ConvertFrom-Json
if(-not (Test-Path -LiteralPath (Join-Path $BuildCache 'release'))){throw 'Reuse an existing verified Cargo release cache.'}
$processes=@(Get-CimInstance Win32_Process)
if(@($processes | Where-Object {$_.Name -match '^(cargo|rustc|rust-lld|link|node)\.exe$' -and $_.CommandLine -match '(?i)preacherman.*(build|vite)|tauri.*build|cargo.*build|rustc.*preacherman'}).Count){throw 'An overlapping desktop build may be running.'}
git -C $repository diff --quiet HEAD -- apps/preacherman-demo-host packages tools/Build-DesktopRelease.ps1
if($LASTEXITCODE -ne 0){throw 'Commit the verified source before building a desktop release.'}
$sourceCommit=(git -C $repository rev-parse HEAD).Trim()
git -C $repository diff --quiet $manifest.sourceCommit $sourceCommit -- apps/preacherman-demo-host/server apps/preacherman-demo-host/scripts/build-windows-sidecar.mjs apps/preacherman-demo-host/package-lock.json
$serviceChanged=$LASTEXITCODE -ne 0
$node=(Get-Command node.exe -ErrorAction Stop).Source
$savedTarget=$env:CARGO_TARGET_DIR
$savedLocation=Get-Location
try {
 Set-Location -LiteralPath $app
 $env:CARGO_TARGET_DIR=[IO.Path]::GetFullPath($BuildCache)
 if($serviceChanged){
  & $node scripts/build-windows-sidecar.mjs
  if($LASTEXITCODE -ne 0){throw 'Sidecar build failed.'}
 } else {
  if((Get-FileHash -LiteralPath $manifest.sidecarPath -Algorithm SHA256).Hash -ne $manifest.sidecarSha256){throw 'Verified sidecar changed.'}
  Copy-Item -LiteralPath $manifest.sidecarPath -Destination (Join-Path $app 'src-tauri\binaries\preacherman-service-x86_64-pc-windows-msvc.exe') -Force
 }
 & $node node_modules/@tauri-apps/cli/tauri.js build --no-bundle
 if($LASTEXITCODE -ne 0){throw 'Desktop production build failed.'}
 $artifact=Get-Item -LiteralPath (Join-Path $BuildCache 'release\preacherman-demo-host.exe')
 [pscustomobject]@{Status='built-awaiting-deployment-and-native-verification';SourceWorkspace=$repository;SourceCommit=$sourceCommit;BuildCache=$BuildCache;Executable=$artifact.FullName;Bytes=$artifact.Length;SHA256=(Get-FileHash -LiteralPath $artifact.FullName -Algorithm SHA256).Hash;SidecarRebuilt=$serviceChanged;Sidecar=(Join-Path $app 'src-tauri\binaries\preacherman-service-x86_64-pc-windows-msvc.exe')} | ConvertTo-Json
} finally {
 Set-Location -LiteralPath $savedLocation.Path
 if($null -eq $savedTarget){Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue}else{$env:CARGO_TARGET_DIR=$savedTarget}
}
