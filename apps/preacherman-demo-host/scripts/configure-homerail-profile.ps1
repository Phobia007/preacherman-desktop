[CmdletBinding()]
param(
  [Parameter()]
  [ValidatePattern('^[A-Za-z0-9._-]+$')]
  [string] $Provider = 'deepseek',

  [Parameter()]
  [ValidatePattern('^[A-Za-z0-9._-]+$')]
  [string] $EndpointId,

  [Parameter()]
  [ValidatePattern('^[A-Za-z0-9._-]+$')]
  [string] $ModelName,

  [Parameter()]
  [ValidatePattern('^https?://[^\s]+$')]
  [string] $ResponsesBaseUrl,

  [Parameter()]
  [switch] $LocalNoAuth,

  [Parameter()]
  [ValidateSet('claude-sdk', 'codex_appserver', 'kimi_code')]
  [string] $AgentType = 'codex_appserver',

  [Parameter()]
  [ValidatePattern('^[A-Za-z0-9._-]+$')]
  [string] $ProfileId = 'preacherman-complex-default',

  [Parameter()]
  [string] $HomeRailRoot = 'D:\homerail'
)

$ErrorActionPreference = 'Stop'
$workflowId = 'preacherman-complex-task-v1'
$workflowRevision = '3'
$canonicalHash = 'bf7783be10cfc62b5e16154d026ef434c6990c387432401f1604c8b23e52c4ee'
$packageRoot = Split-Path -Parent $PSScriptRoot
$homeRailCli = Join-Path $HomeRailRoot 'homerail_cli\dist\cli.js'
$envFile = Join-Path $packageRoot '.env.local'
$envTemplate = Join-Path $packageRoot '.env.local.example'

function Invoke-HomeRailJson {
  param(
    [Parameter(Mandatory = $true)]
    [string[]] $Arguments,
    [Parameter()]
    [AllowNull()]
    [string] $StandardInput
  )

  $allArguments = @($homeRailCli, '--json') + $Arguments
  if ($null -eq $StandardInput) {
    $output = & node @allArguments 2>&1
  } else {
    $output = $StandardInput | & node @allArguments 2>&1
  }
  $exitCode = $LASTEXITCODE
  $text = ($output | ForEach-Object { [string] $_ }) -join [Environment]::NewLine
  if ($exitCode -ne 0) {
    throw "HomeRail CLI failed: $text"
  }
  try {
    return $text | ConvertFrom-Json
  } catch {
    throw 'HomeRail CLI returned an invalid JSON response.'
  }
}

function Set-DotEnvValue {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Content,
    [Parameter(Mandatory = $true)]
    [string] $Name,
    [Parameter(Mandatory = $true)]
    [string] $Value
  )

  $line = "$Name=$Value"
  $pattern = "(?m)^$([Regex]::Escape($Name))=.*$"
  if ([Regex]::IsMatch($Content, $pattern)) {
    return [Regex]::Replace($Content, $pattern, $line)
  }
  if ($Content.Length -gt 0 -and -not $Content.EndsWith([Environment]::NewLine)) {
    $Content += [Environment]::NewLine
  }
  return $Content + $line + [Environment]::NewLine
}

if (-not (Test-Path -LiteralPath $homeRailCli -PathType Leaf)) {
  throw "HomeRail CLI was not found at $homeRailCli"
}

if ($ResponsesBaseUrl -and -not $ModelName) {
  throw 'Custom Responses endpoints require -ModelName.'
}
if ($LocalNoAuth -and -not $ResponsesBaseUrl) {
  throw '-LocalNoAuth is only valid with a custom -ResponsesBaseUrl.'
}
if ($LocalNoAuth) {
  $responsesUri = [Uri] $ResponsesBaseUrl
  if ($responsesUri.Scheme -ne 'http' -or $responsesUri.Host -notin @('127.0.0.1', 'localhost', 'host.docker.internal')) {
    throw '-LocalNoAuth is restricted to an HTTP loopback or host.docker.internal endpoint.'
  }
  if (-not $PSBoundParameters.ContainsKey('AgentType')) {
    $AgentType = 'codex_appserver'
  }
}

$runtime = Invoke-HomeRailJson -Arguments @('runtime', 'status')
if ($runtime.managerHealthy -ne $true) {
  throw 'HomeRail Manager is not healthy. Start HomeRail before configuring the profile.'
}

Write-Host "Configuring HomeRail provider '$Provider'."
$secureKey = if ($LocalNoAuth) { $null } else { Read-Host 'Provider API key' -AsSecureString }
$keyPointer = [IntPtr]::Zero
$plainKey = $null
try {
  if ($LocalNoAuth) {
    $plainKey = 'local-no-auth'
  } else {
    $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
  }
  if ([string]::IsNullOrWhiteSpace($plainKey)) {
    throw 'Provider API key cannot be empty.'
  }

  $modelArguments = @('model', 'configure', $Provider, '--api-key-stdin')
  if ($EndpointId) { $modelArguments += @('--endpoint-id', $EndpointId) }
  if ($ModelName) { $modelArguments += @('--model-name', $ModelName) }
  if ($ResponsesBaseUrl) { $modelArguments += @('--responses-endpoint', $ResponsesBaseUrl) }
  $setting = Invoke-HomeRailJson -Arguments $modelArguments -StandardInput $plainKey
} finally {
  $plainKey = $null
  if ($keyPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
  }
}

$settingId = [string] $setting.id
if ([string]::IsNullOrWhiteSpace($settingId)) {
  throw 'HomeRail did not return the encrypted LLM setting ID.'
}

$privateRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Preacherman\HomeRail'
New-Item -ItemType Directory -Force -Path $privateRoot | Out-Null
$profilePath = Join-Path $privateRoot "$ProfileId.profile.yaml"
$profileYaml = @"
profile_id: $ProfileId
workflow_id: $workflowId
description: Model-backed runtime mapping for the fixed Preacherman complex-task workflow.

default:
  llm_setting_id: $settingId
  agent_type: $AgentType
"@
[IO.File]::WriteAllText($profilePath, $profileYaml, [Text.UTF8Encoding]::new($false))

$profile = Invoke-HomeRailJson -Arguments @('profile', 'sync', $profilePath, '--workflow', $workflowId)
$syncedProfileId = [string] $profile.data.profile.profile_id
if ($syncedProfileId -ne $ProfileId) {
  throw "HomeRail synced an unexpected profile identity: $syncedProfileId"
}

if (Test-Path -LiteralPath $envFile -PathType Leaf) {
  $envContent = [IO.File]::ReadAllText($envFile)
} elseif (Test-Path -LiteralPath $envTemplate -PathType Leaf) {
  $envContent = [IO.File]::ReadAllText($envTemplate)
} else {
  $envContent = ''
}

foreach ($entry in ([ordered]@{
  PREACHERMAN_HOMERAIL_ENABLED = 'true'
  PREACHERMAN_HOMERAIL_DEFAULT_WORKFLOW_ID = $workflowId
  PREACHERMAN_HOMERAIL_WORKFLOW_REVISION = $workflowRevision
  PREACHERMAN_HOMERAIL_CANONICAL_HASH = $canonicalHash
  PREACHERMAN_HOMERAIL_PROFILE = $ProfileId
}).GetEnumerator()) {
  $envContent = Set-DotEnvValue -Content $envContent -Name $entry.Key -Value $entry.Value
}
[IO.File]::WriteAllText($envFile, $envContent, [Text.UTF8Encoding]::new($false))

$profiles = Invoke-HomeRailJson -Arguments @('profile', 'list', '--workflow', $workflowId)
$selected = @($profiles | Where-Object { $_.profile_id -eq $ProfileId })
if ($selected.Count -ne 1) {
  throw 'The synced runtime profile could not be read back from HomeRail.'
}

Write-Host ''
Write-Host "Configured encrypted setting: $settingId"
Write-Host "Synced runtime profile: $workflowId/$ProfileId"
Write-Host "Updated local configuration: $envFile"
Write-Host 'Restart the Preacherman service, then run: npm run verify:homerail'
