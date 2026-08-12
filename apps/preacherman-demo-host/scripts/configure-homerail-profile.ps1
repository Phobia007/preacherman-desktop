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

function Test-HomeRailModelRuntime {
  param(
    [Parameter(Mandatory = $true)]
    [string] $ManagerUrl,
    [Parameter(Mandatory = $true)]
    [string] $SettingId
  )

  $origin = ([Uri] $ManagerUrl).GetLeftPart([UriPartial]::Authority).TrimEnd('/')
  $body = @{ setting_id = $SettingId } | ConvertTo-Json -Compress
  try {
    $response = Invoke-RestMethod `
      -Method Post `
      -Uri "$origin/api/llm/models/detect-runtime" `
      -ContentType 'application/json' `
      -Body $body `
      -TimeoutSec 30
  } catch {
    throw 'HomeRail could not complete the live model runtime probe.'
  }

  $responses = $response.data.endpoints.responses
  if ($response.success -ne $true -or $response.data.available -ne $true -or $responses.available -ne $true) {
    if ($responses.status -eq 401) {
      throw 'The provider rejected the API key. Verify the credential and endpoint before activating this profile.'
    }
    throw 'The configured model did not pass a live Responses API probe.'
  }
}

function Resolve-GatewayModelName {
  param(
    [Parameter(Mandatory = $true)]
    [string] $BaseUrl,
    [Parameter(Mandatory = $true)]
    [string] $ApiKey
  )

  $modelsUrl = $BaseUrl.TrimEnd('/') + '/v1/models'
  try {
    $response = Invoke-RestMethod `
      -Method Get `
      -Uri $modelsUrl `
      -Headers @{ Authorization = "Bearer $ApiKey" } `
      -TimeoutSec 30
  } catch {
    throw 'The company gateway model catalog is unavailable. Connect its private network or VPN, then retry.'
  }

  $models = @($response.data) |
    ForEach-Object { [string] $_.id } |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
    Sort-Object -Unique
  if ($models.Count -eq 0) {
    throw 'The company gateway returned no usable model IDs.'
  }
  if ($models.Count -eq 1) {
    Write-Host "Discovered model: $($models[0])"
    return $models[0]
  }

  Write-Host 'Available company gateway models:'
  for ($index = 0; $index -lt $models.Count; $index += 1) {
    Write-Host "  $($index + 1). $($models[$index])"
  }
  $selection = Read-Host "Select model [1-$($models.Count)]"
  $selectedIndex = 0
  if (-not [int]::TryParse($selection, [ref] $selectedIndex) -or $selectedIndex -lt 1 -or $selectedIndex -gt $models.Count) {
    throw 'Model selection was invalid.'
  }
  return $models[$selectedIndex - 1]
}

if (-not (Test-Path -LiteralPath $homeRailCli -PathType Leaf)) {
  throw "HomeRail CLI was not found at $homeRailCli"
}

if ($ResponsesBaseUrl -and $EndpointId) {
  throw 'Custom Responses endpoints cannot use a catalog EndpointId.'
}
if ($ResponsesBaseUrl -and $Provider -eq 'deepseek') {
  throw 'Custom Responses endpoints require a custom -Provider ID so a company gateway key is never sent to the DeepSeek preset.'
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

  if ($ResponsesBaseUrl -and -not $ModelName) {
    $ModelName = Resolve-GatewayModelName -BaseUrl $ResponsesBaseUrl -ApiKey $plainKey
  }

  if ($ResponsesBaseUrl) {
    Invoke-HomeRailJson -Arguments @(
      'provider', 'upsert',
      '--id', $Provider,
      '--name', "$Provider company gateway",
      '--default-model', $ModelName,
      '--provider-base-url', $ResponsesBaseUrl,
      '--responses-base-url', $ResponsesBaseUrl,
      '--status', 'active'
    ) | Out-Null
  }

  $modelArguments = @('model', 'configure', $Provider, '--api-key-stdin')
  if ($EndpointId) { $modelArguments += @('--endpoint-id', $EndpointId) }
  if ($ModelName) { $modelArguments += @('--model-name', $ModelName) }
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

try {
  Test-HomeRailModelRuntime -ManagerUrl ([string] $runtime.managerUrl) -SettingId $settingId
} catch {
  try {
    Invoke-HomeRailJson -Arguments @('llm-settings', 'delete', $settingId) | Out-Null
  } catch {
    # The runtime probe remains authoritative even if cleanup is unavailable.
  }
  throw
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
Write-Host 'Verified provider Responses runtime: ready'
Write-Host "Synced runtime profile: $workflowId/$ProfileId"
Write-Host "Updated local configuration: $envFile"
Write-Host 'Restart the Preacherman service, then run: npm run verify:homerail'
