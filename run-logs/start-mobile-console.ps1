$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$env:EXPO_PUBLIC_API_URL = "http://192.168.1.101:4001/api/v1"
$env:EXPO_NO_TELEMETRY = "1"
Set-Location (Join-Path $root "apps/mobile")
& ".\node_modules\.bin\expo.CMD" start --lan --port 8081
