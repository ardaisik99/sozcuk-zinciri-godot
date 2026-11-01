param([int]$Port = 8060)
$ErrorActionPreference = 'Stop'
$taskProjectPath = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $taskProjectPath 'docs\index.html'))) {
    throw 'Önce tools/export-web.ps1 ile web çıktısını oluştur.'
}
Write-Output "Oyunu aç: http://localhost:$Port"
python (Join-Path $PSScriptRoot 'serve.py') --port $Port
