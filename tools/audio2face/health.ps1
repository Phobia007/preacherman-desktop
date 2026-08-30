$ErrorActionPreference = "Stop"
$response = Invoke-RestMethod -Uri "http://127.0.0.1:18083/health" -TimeoutSec 5
if ($response -ne "OK") { throw "Audio2Face health check failed: $response" }
Write-Output "Audio2Face: OK"
