param([string]$Godot = "")
$ErrorActionPreference = 'Stop'
$taskProjectPath = Split-Path -Parent $PSScriptRoot
if (-not $Godot) { $Godot = $env:GODOT_BIN }
if (-not $Godot) {
    $taskCachedGodot = Join-Path $env:USERPROFILE '.codex\tools\godot-4.7.2\Godot_v4.7.2-stable_win64_console.exe'
    if (Test-Path -LiteralPath $taskCachedGodot) { $Godot = $taskCachedGodot }
    else {
        $taskGodotCommand = Get-Command godot -ErrorAction SilentlyContinue
        if ($taskGodotCommand) { $Godot = $taskGodotCommand.Source }
    }
}
if (-not $Godot) { throw 'Godot 4.7.2 yolunu -Godot parametresiyle belirt veya GODOT_BIN değişkenini ayarla.' }
New-Item -ItemType Directory -Path (Join-Path $taskProjectPath 'docs') -Force | Out-Null
& $Godot --headless --path $taskProjectPath --editor --import
if ($LASTEXITCODE -ne 0) { throw "Godot içe aktarma başarısız: $LASTEXITCODE" }
& $Godot --headless --path $taskProjectPath --export-release Web (Join-Path $taskProjectPath 'docs\index.html')
if ($LASTEXITCODE -ne 0) { throw "Web dışa aktarma başarısız: $LASTEXITCODE" }
New-Item -ItemType File -Path (Join-Path $taskProjectPath 'docs\.nojekyll') -Force | Out-Null
Write-Output 'Web çıktısı hazır: docs/index.html. Yerelde açmak için ./tools/serve.ps1'
