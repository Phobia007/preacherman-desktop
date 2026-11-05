$ErrorActionPreference = 'Stop'
function Invoke-Checked([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable failed with exit code $LASTEXITCODE" }
}
function Get-VerifiedDownload([string]$Url, [string]$Sha256, [string]$Destination, [string]$CacheDirectory) {
    if ((Test-Path -LiteralPath $Destination) -and (Get-FileHash -LiteralPath $Destination).Hash -eq $Sha256) { return }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
    $cached = if ($CacheDirectory) { Join-Path $CacheDirectory (Split-Path -Leaf $Destination) } else { $null }
    $partial = $Destination + '.part'
    if ($cached -and (Test-Path -LiteralPath $cached)) {
        if ((Get-FileHash -LiteralPath $cached).Hash -ne $Sha256) { throw "Cached download failed verification: $cached" }
        Copy-Item -LiteralPath $cached -Destination $partial -Force
    } else {
        Invoke-Checked 'curl.exe' @('--fail','--location','--retry','2','--connect-timeout','20','--max-time','1800','--output',$partial,$Url)
    }
    if ((Get-FileHash -LiteralPath $partial).Hash -ne $Sha256) { throw "SHA-256 mismatch for $Destination. The download has not been installed." }
    Move-Item -LiteralPath $partial -Destination $Destination -Force
}
function Expand-VerifiedArchive([string]$Archive, [string]$Destination) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $root = [IO.Path]::GetFullPath($Destination).TrimEnd('\') + '\'
    $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
    try {
        foreach ($entry in $zip.Entries) {
            $file = [IO.Path]::GetFullPath((Join-Path $root $entry.FullName))
            if (!$file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive path escapes installation directory.' }
        }
        foreach ($entry in $zip.Entries) {
            $file = [IO.Path]::GetFullPath((Join-Path $root $entry.FullName))
            if (!$entry.Name) { New-Item -ItemType Directory -Force -Path $file | Out-Null; continue }
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $file) | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $file, $true)
        }
    } finally { $zip.Dispose() }
}
function Get-DockerExecutable {
    $command = Get-Command docker.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidate = Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe'
    if (Test-Path -LiteralPath $candidate) { return $candidate }
    throw 'Install Docker Desktop with the WSL 2 Linux-container backend, then run this installer again: https://www.docker.com/products/docker-desktop/'
}
function Wait-Service([string]$Url, [int]$Seconds = 120) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        try { $response = Invoke-RestMethod -Uri $Url -TimeoutSec 3; if ($response) { return $response } } catch {}
        Start-Sleep -Milliseconds 750
    } while ((Get-Date) -lt $deadline)
    throw "Service is not ready: $Url"
}
