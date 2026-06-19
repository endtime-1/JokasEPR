$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$env:DATABASE_URL = "postgresql://jokas:jokas_dev_password@localhost:15432/jokas_erp?schema=public"
$env:JWT_ACCESS_SECRET = "replace-with-32-byte-access-secret"
$env:JWT_REFRESH_SECRET = "replace-with-32-byte-refresh-secret"
$env:JWT_ACCESS_TTL = "15m"
$env:JWT_REFRESH_TTL_DAYS = "30"
$env:API_PORT = "4001"
$env:API_PREFIX = "api"
$env:API_VERSION = "1"
$env:WEB_ORIGIN = "http://localhost:3000,http://127.0.0.1:3000,http://192.168.1.101:3000"
Set-Location (Join-Path $root "apps/api")
& ".\node_modules\.bin\ts-node.CMD" --transpile-only src/main.ts *>> (Join-Path $PSScriptRoot "api.full.log")
