[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$response = Invoke-RestMethod -Uri "http://127.0.0.1:18084/health" -TimeoutSec 10
if ($response -ne "OK") {
  throw "Speech2Motion returned an unexpected health response: $response"
}

[pscustomobject]@{
  service = "speech2motion"
  state = "ready"
  endpoint = "http://127.0.0.1:18084"
}
