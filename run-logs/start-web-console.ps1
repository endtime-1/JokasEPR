$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$env:NEXT_PUBLIC_API_URL = "http://localhost:4001/api/v1"
Set-Location (Join-Path $root "apps/web")
& ".\node_modules\.bin\next.CMD" dev -p 3000
