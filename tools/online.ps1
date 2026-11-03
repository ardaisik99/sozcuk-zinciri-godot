param([ValidateSet('Login','Dev','Deploy')][string]$Action='Dev')
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskBackend=Join-Path $taskRoot 'backend'
Push-Location -LiteralPath $taskBackend
try {
    if (-not (Test-Path -LiteralPath 'node_modules\wrangler')) {
        & npm ci --no-fund --no-audit
        if ($LASTEXITCODE -ne 0) { throw 'Online geliştirme araçları kurulamadı.' }
    }
    if ($Action -eq 'Login') {
        & npx wrangler login --scopes account:read user:read workers:write workers_scripts:write
        if ($LASTEXITCODE -ne 0) { throw 'Cloudflare tarayıcı girişi tamamlanmadı.' }
        return
    }
    $taskBank=Join-Path $taskBackend 'private\chains.json'
    if (-not (Test-Path -LiteralPath $taskBank)) {
        throw 'Sunucuya özel zincir bankası backend/private/chains.json bulunamadı. Örnek zincirlerle bir banka oluştur; bu klasör GitHub’a gönderilmez.'
    }
    $taskBankJson=Get-Content -LiteralPath $taskBank -Raw -Encoding utf8
    if ($Action -eq 'Dev') {
        & node scripts/seed-local.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Yerel gizli zincir bankası hazırlanamadı.' }
        & npm run dev
        return
    }
    & npm test
    if ($LASTEXITCODE -ne 0) { throw 'Online sunucu testleri başarısız.' }
    & npx wrangler deploy
    if ($LASTEXITCODE -ne 0) { throw 'Cloudflare sunucusu yayınlanamadı.' }
    $taskCompactBank=ConvertTo-Json -InputObject (ConvertFrom-Json $taskBankJson) -Depth 10 -Compress
    $taskCompactBank | & npx wrangler secret put CHAIN_BANK
    if ($LASTEXITCODE -ne 0) { throw 'Gizli zincir bankası yüklenemedi.' }
    Write-Output 'Sunucu ve gizli zincir bankası hazır. Yazdırılan workers.dev adresini python tools/set-online-url.py ile ortak config dosyasına kaydet; ardından python tools/build_web.py çalıştır.'
} finally { Pop-Location }
