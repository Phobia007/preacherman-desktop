param([switch]$Apply, [ValidateRange(3,10)][int]$Keep = 3, [string]$ReportPath)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$release = 'D:\preacherman\apps\preacherman-demo-host\src-tauri\target\release'
$manifestPath = 'D:\preacherman\apps\preacherman-demo-host\desktop-build-manifest.json'
$roots = @((Join-Path $release 'deployment-backups'), (Join-Path $release 'backups'))
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.verification.status -notlike 'passed*') { throw 'Current desktop release has not passed verification.' }
if (@(Get-Process -Name cargo,rustc,rust-lld,link -ErrorAction SilentlyContinue).Count) { throw 'Build in progress; defer backup cleanup.' }
foreach ($entry in @(@('preacherman-demo-host.exe', $manifest.sha256), @('preacherman-service.exe', $manifest.sidecarSha256))) {
    if ((Get-FileHash -LiteralPath (Join-Path $release $entry[0]) -Algorithm SHA256).Hash -ne $entry[1]) { throw "Current executable differs from manifest: $($entry[0])" }
}
foreach ($root in $roots) {
    $item = Get-Item -LiteralPath $root -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Backup root is a reparse point: $root" }
}
$directories = @($roots | ForEach-Object { Get-ChildItem -LiteralPath $_ -Directory -Force })
$complete = @($directories | Where-Object {
    (Test-Path -LiteralPath (Join-Path $_.FullName 'preacherman-demo-host.exe')) -and
    (Test-Path -LiteralPath (Join-Path $_.FullName 'preacherman-service.exe')) -and
    (Test-Path -LiteralPath (Join-Path $_.FullName 'desktop-build-manifest.json'))
} | Sort-Object LastWriteTime -Descending)
if ($complete.Count -lt $Keep) { throw "Fewer than $Keep complete rollback pairs; refusing to prune." }
$retained = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($dir in ($complete | Select-Object -First $Keep)) { [void]$retained.Add($dir.FullName) }
$pinned = [IO.Path]::GetFullPath($manifest.backupPath.Replace('/','\'))
$pinnedParent = Split-Path -Parent $pinned
if (-not ($roots | Where-Object { $pinnedParent.StartsWith($_+'\', [StringComparison]::OrdinalIgnoreCase) })) { throw 'Pinned rollback is outside the known backup roots.' }
[void]$retained.Add($pinnedParent)
$verified = @()
foreach ($path in $retained) {
    $saved = Get-Content -LiteralPath (Join-Path $path 'desktop-build-manifest.json') -Raw | ConvertFrom-Json
    $hostHash = (Get-FileHash -LiteralPath (Join-Path $path 'preacherman-demo-host.exe') -Algorithm SHA256).Hash
    $sidecarHash = (Get-FileHash -LiteralPath (Join-Path $path 'preacherman-service.exe') -Algorithm SHA256).Hash
    if ($hostHash -ne $saved.sha256 -or $sidecarHash -ne $saved.sidecarSha256) { throw "Retained rollback hash mismatch: $path" }
    $verified += [pscustomobject]@{Path=$path;HostSHA256=$hostHash;SidecarSHA256=$sidecarHash}
}
$cutoff = (Get-Date).AddHours(-1)
$candidates = @()
foreach ($root in $roots) {
    foreach ($item in (Get-ChildItem -LiteralPath $root -Force)) {
        if ($retained.Contains($item.FullName) -or $item.LastWriteTime -gt $cutoff) { continue }
        if (-not $item.PSIsContainer -and $item.Extension -notin @('.exe','.pdb')) { continue }
        $absolute = [IO.Path]::GetFullPath($item.FullName)
        if ((Split-Path -Parent $absolute) -ne $root -or -not $absolute.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe deletion path.' }
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing to follow a backup link.' }
        $contents = if ($item.PSIsContainer) { @(Get-ChildItem -LiteralPath $absolute -Recurse -Force) } else { @($item) }
        if (@($contents | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw "Nested link in $absolute" }
        $size = 0L
        foreach ($file in ($contents | Where-Object { -not $_.PSIsContainer })) { $size += $file.Length }
        $candidates += [pscustomobject]@{Path=$absolute;Bytes=[long]$size;Directory=$item.PSIsContainer}
    }
}
$running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path } | Select-Object -ExpandProperty Path)
foreach ($candidate in $candidates) {
    if (@($running | Where-Object { $_ -eq $candidate.Path -or $_.StartsWith($candidate.Path+'\',[StringComparison]::OrdinalIgnoreCase) }).Count) { throw 'A backup executable is running; refusing cleanup.' }
}
$before = [IO.DriveInfo]::new('D:\').AvailableFreeSpace
if ($Apply) {
    # The allowlisted roots and every resolved child were checked above.
    foreach ($candidate in $candidates) {
        $item = Get-Item -LiteralPath $candidate.Path -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Candidate changed to a link.' }
        if ($candidate.Directory) { Remove-Item -LiteralPath $candidate.Path -Recurse -Force }
        else { Remove-Item -LiteralPath $candidate.Path -Force }
    }
}
$candidateBytes = 0L
foreach ($candidate in $candidates) { $candidateBytes += $candidate.Bytes }
$report = [pscustomobject]@{Applied=[bool]$Apply;Keep=$Keep;Retained=$verified;CandidateCount=$candidates.Count;CandidateBytes=$candidateBytes;FreeBytesBefore=$before;FreeBytesAfter=[IO.DriveInfo]::new('D:\').AvailableFreeSpace;Candidates=$candidates;Timestamp=(Get-Date).ToString('o')}
if ($ReportPath) { $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ReportPath -Encoding utf8 }
[pscustomobject]@{Applied=[bool]$Apply;BackupsKept=$retained.Count;ItemsToRemove=$candidates.Count;GiB=[math]::Round($report.CandidateBytes/1GB,2);D_FreeGiB=[math]::Round($report.FreeBytesAfter/1GB,2)} | Format-List
