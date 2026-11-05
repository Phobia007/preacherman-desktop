$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Runtime-Common.ps1')
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('preacherman-installer-' + [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
try {
    $cache = Join-Path $testRoot 'cache'; New-Item -ItemType Directory -Path $cache | Out-Null
    $fixture = Join-Path $cache 'fixture.bin'; [IO.File]::WriteAllText($fixture,'verified fixture')
    $hash = (Get-FileHash -LiteralPath $fixture).Hash
    $target = Join-Path $testRoot 'installed\fixture.bin'
    Get-VerifiedDownload 'https://invalid.invalid/never-contact' $hash $target $cache
    if ((Get-FileHash -LiteralPath $target).Hash -ne $hash) { throw 'Valid cached file did not install.' }
    $rejected = $false
    try { Get-VerifiedDownload 'https://invalid.invalid/never-contact' ('0'*64) $target $cache } catch { $rejected=$true }
    if (!$rejected -or (Get-FileHash -LiteralPath $target).Hash -ne $hash) { throw 'Bad cache replaced the verified installation.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = Join-Path $testRoot 'unsafe.zip'
    $zip = [IO.Compression.ZipFile]::Open($archive, 'Create')
    try { $entry=$zip.CreateEntry('../escape.txt'); $stream=$entry.Open(); $stream.Dispose() } finally { $zip.Dispose() }
    $rejected=$false
    try { Expand-VerifiedArchive $archive (Join-Path $testRoot 'extract') } catch { $rejected=$true }
    if (!$rejected -or (Test-Path -LiteralPath (Join-Path $testRoot 'escape.txt'))) { throw 'Unsafe archive was not rejected.' }
    foreach ($file in Get-ChildItem -LiteralPath $PSScriptRoot -Recurse -Filter *.ps1) {
        $tokens=$null; $errors=$null
        [System.Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors) | Out-Null
        if ($errors.Count) { throw "PowerShell syntax error in $($file.Name): $errors" }
    }
    Write-Host 'PASS: cached downloads, checksum rejection, archive containment and script syntax.'
} finally {
    $resolved=[IO.Path]::GetFullPath($testRoot)
    $tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
    if (!$resolved.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or !(Split-Path -Leaf $resolved).StartsWith('preacherman-installer-')) { throw 'Unexpected test cleanup path.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
