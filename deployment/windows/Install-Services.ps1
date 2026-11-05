param(
    [string]$Root,
    [string]$DownloadCache,
    [switch]$IncludeBreeze,
    [switch]$AcceptBreezeNonCommercialLicense,
    [switch]$SkipStart,
    [switch]$SkipRegister
)
. (Join-Path $PSScriptRoot 'Runtime-Common.ps1')
if (![Environment]::Is64BitOperatingSystem) { throw 'Windows x64 is required.' }
if (!$Root) {
    $Root = if (Test-Path 'D:\') { 'D:\PreachermanRuntime' } else { Join-Path $env:LOCALAPPDATA 'Preacherman\runtime' }
}
$Root = [IO.Path]::GetFullPath($Root).TrimEnd('\')
if ($Root -eq [IO.Path]::GetPathRoot($Root).TrimEnd('\')) { throw 'Choose a dedicated installation folder, not a drive root.' }
if ($IncludeBreeze -and !$AcceptBreezeNonCommercialLicense) {
    throw 'Breeze weights and self-hosted outputs have research/non-commercial terms. Review https://huggingface.co/BreezeBlue/Breeze-TTS-2/blob/main/LICENSE and explicitly pass -AcceptBreezeNonCommercialLicense to install this optional component.'
}
$docker = Get-DockerExecutable
# Validate ownership/paths before changing an existing installation.
if (Test-Path -LiteralPath $Root) {
    $links = @(Get-Item -LiteralPath $Root -Force) + @(Get-ChildItem -LiteralPath $Root -Force -Recurse)
    if (@($links | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Installation directory contains a reparse point. Choose a normal local directory.' }
}
New-Item -ItemType Directory -Force -Path $Root | Out-Null
$lock = $null
try {
    $lock = [IO.File]::Open((Join-Path $Root 'install.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    $manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime-assets.json') -Raw | ConvertFrom-Json
    $downloads = Join-Path $Root 'downloads'
    New-Item -ItemType Directory -Force -Path $downloads | Out-Null
    Write-Host '1/5 Installing the private Python runtime and speech recognition...'
    $pythonArchive = Join-Path $downloads $manifest.python.file
    Get-VerifiedDownload $manifest.python.url $manifest.python.sha256 $pythonArchive $DownloadCache
    $pythonRoot = Join-Path $Root 'python-3.12.3'
    $python = Join-Path $pythonRoot 'tools\python.exe'
    if (!(Test-Path -LiteralPath $python)) { Expand-VerifiedArchive $pythonArchive $pythonRoot }
    $speechRoot = Join-Path $Root 'speech'
    $speechPython = Join-Path $speechRoot 'venv\Scripts\python.exe'
    if (!(Test-Path -LiteralPath $speechPython)) { Invoke-Checked $python @('-m','venv',(Join-Path $speechRoot 'venv')) }
    # No user Python, PATH, global packages or system installation is modified.
    $env:PIP_CACHE_DIR = Join-Path $Root 'cache\pip'
    $env:TEMP = Join-Path $Root 'temp'; $env:TMP = $env:TEMP
    New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
    Invoke-Checked $speechPython @('-m','pip','--isolated','install','--index-url','https://pypi.org/simple','--cache-dir',(Join-Path $Root 'cache\pip'),'--disable-pip-version-check','--timeout','30','--retries','2','-r',(Join-Path $PSScriptRoot 'speech-requirements.txt'))
    foreach ($file in $manifest.whisper.files.PSObject.Properties) {
        $url = 'https://huggingface.co/' + $manifest.whisper.repository + '/resolve/' + $manifest.whisper.revision + '/' + $file.Name
        Get-VerifiedDownload $url $file.Value (Join-Path $speechRoot ('models\base\' + $file.Name)) $DownloadCache
    }
    Write-Host '2/5 Installing the motion library...'
    $motionArchive = Join-Path $downloads $manifest.motion.file
    $cachedMotion = if ($DownloadCache) { Join-Path $DownloadCache $manifest.motion.file } else { '' }
    if (!(Test-Path -LiteralPath $motionArchive) -and !($cachedMotion -and (Test-Path -LiteralPath $cachedMotion))) {
        # The upstream Google Drive archive also has a documented manual mirror.
        Invoke-Checked $speechPython @((Join-Path $PSScriptRoot 'download-motion.py'),$manifest.motion.url,($motionArchive + '.part'))
        if ((Get-FileHash -LiteralPath ($motionArchive + '.part')).Hash -ne $manifest.motion.sha256) { throw 'Motion archive checksum mismatch.' }
        Move-Item -LiteralPath ($motionArchive + '.part') -Destination $motionArchive -Force
    }
    if (!(Test-Path -LiteralPath $motionArchive)) { Get-VerifiedDownload $manifest.motion.url $manifest.motion.sha256 $motionArchive $DownloadCache }
    if ((Get-FileHash -LiteralPath $motionArchive).Hash -ne $manifest.motion.sha256) { throw 'Motion archive checksum mismatch. Replace it with the official archive.' }
    $motionRoot = Join-Path $Root 'speech2motion'
    $motionMarker = Join-Path $motionRoot 'installed-archive.sha256'
    if (!(Test-Path -LiteralPath $motionMarker) -or (Get-Content -LiteralPath $motionMarker -Raw).Trim() -ne $manifest.motion.sha256) {
        if (Test-Path -LiteralPath (Join-Path $motionRoot 'data')) { throw 'An unverified motion library already exists. Preserve it and choose an empty installation folder.' }
        Expand-VerifiedArchive $motionArchive $motionRoot
        if (!(Test-Path -LiteralPath (Join-Path $motionRoot 'data\motion_database.db'))) { throw 'Motion archive is incomplete.' }
        Set-Content -LiteralPath $motionMarker -Value $manifest.motion.sha256 -Encoding ASCII
    }
    Write-Host '3/5 Installing facial animation...'
    $faceRoot = Join-Path $Root 'audio2face'
    Get-VerifiedDownload $manifest.face.url $manifest.face.sha256 (Join-Path $faceRoot ('weights\' + $manifest.face.file)) $DownloadCache
    foreach ($component in @('speech2motion','audio2face')) {
        $destination = Join-Path $Root $component
        New-Item -ItemType Directory -Force -Path (Join-Path $destination 'logs') | Out-Null
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot "$component\compose.yaml") -Destination (Join-Path $destination 'compose.yaml') -Force
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $faceRoot 'configs') | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'audio2face\configs\preacherman_cpu.py') -Destination (Join-Path $faceRoot 'configs\preacherman_cpu.py') -Force
    Write-Host '4/5 Installing optional Breeze voice generation...'
    if ($IncludeBreeze) {
        $breezeRoot = Join-Path $Root 'breeze'
        $archive = Join-Path $downloads $manifest.breezeRuntime.file
        Get-VerifiedDownload $manifest.breezeRuntime.url $manifest.breezeRuntime.sha256 $archive $DownloadCache
        $server = Join-Path $breezeRoot 'runtime\breeze-tts-2-v0.1.3-windows-x64-vulkan\breeze-server.exe'
        if (!(Test-Path -LiteralPath $server)) { Expand-VerifiedArchive $archive (Join-Path $breezeRoot 'runtime') }
        Get-VerifiedDownload $manifest.breezeModel.url $manifest.breezeModel.sha256 (Join-Path $breezeRoot ('models\' + $manifest.breezeModel.file)) $DownloadCache
        foreach ($directory in @('voices','logs','temp')) { New-Item -ItemType Directory -Force -Path (Join-Path $breezeRoot $directory) | Out-Null }
        foreach ($script in @('Start-Breeze.ps1','Stop-Breeze.ps1')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot "breeze\$script") -Destination (Join-Path $breezeRoot $script) -Force }
    }
    Write-Host '5/5 Checking the installation...'
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'runtime-assets.json') -Destination (Join-Path $Root 'runtime-assets.json') -Force
    foreach ($script in @('Runtime-Common.ps1','Start-Services.ps1','Stop-Services.ps1','Check-Services.ps1')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $script) -Destination (Join-Path $Root $script) -Force }
    Invoke-Checked $speechPython @((Join-Path $PSScriptRoot 'check-asr.py'),(Join-Path $speechRoot 'models\base'))
    foreach ($component in @('speech2motion','audio2face')) { Invoke-Checked $docker @('compose','-f',(Join-Path $Root "$component\compose.yaml"),'config','--quiet') }
    if (!$SkipStart) { & (Join-Path $Root 'Start-Services.ps1') -Root $Root -Pull }
    if (!$SkipRegister) {
        $dataRoot = if ($env:PREACHERMAN_DATA_DIR) { $env:PREACHERMAN_DATA_DIR } else { Join-Path ([Environment]::GetFolderPath('UserProfile')) '.preacherman-demo' }
        New-Item -ItemType Directory -Force -Path $dataRoot | Out-Null
        $record = Join-Path $dataRoot 'runtime-installation.json'
        if (Test-Path -LiteralPath $record) { Copy-Item -LiteralPath $record -Destination ($record + '.previous') -Force }
        @{schemaVersion=1; root=$Root} | ConvertTo-Json | Set-Content -LiteralPath ($record + '.tmp') -Encoding UTF8
        Move-Item -LiteralPath ($record + '.tmp') -Destination $record -Force
    }
    Write-Host "Installed at $Root. Restart Preacherman, select a character and configure your own API in Asset > Settings > Execution Mode."
    if ($IncludeBreeze) { Write-Host 'Add or design your own voice at http://127.0.0.1:18760 and assign it in Appearance > Voice. Personal voice clones are never distributed.' }
} finally { if ($lock) { $lock.Dispose() } }
