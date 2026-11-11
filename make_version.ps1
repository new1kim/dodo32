# 앱 화면 파일 버전 매니페스트 생성기
#
# 사용법 (d:\dodo32 에서):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\make_version.ps1
#
# 하는 일:
#   앱이 쓰는 화면 파일들의 SHA-256 해시를 version.json 으로 만든다.
#   앱은 이 파일 하나만 먼저 받아 보고, 해시가 달라진 파일만 내려받는다.
#   → 매번 전체 파일을 받지 않아도 되고, 수정한 파일만 빠르게 반영된다.
#
# 주의:
#   - 파일을 수정한 뒤 이 스크립트를 실행하고 GitHub에 푸시해야 앱이 갱신을 감지한다.
#   - op_gongsi_data/ 는 용량이 커서(약 1,900개) 버전 목록에 넣지 않는다(APK 번들 전용).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

# 앱이 내려받는 파일 목록 (AssetSyncManager.FILES 와 반드시 같아야 한다)
$files = @(
    'index.html',
    'gate-auth.js',
    'Consult_Main.html',
    'Consult_calculator_logic.js',
    'Consult_calculator_ui.js',
    'Consult_style.css',
    'DSR_Main.html',
    'DSR_calculator_logic.js',
    'DSR_calculator_ui.js',
    'DSR_style.css',
    'KB시세조회.html',
    '공시가조회.html',
    'OP시세조회.html',
    'DTI.html',
    '계산기.html',
    '날짜계산기.html',
    'MCG.html',
    'IDCard.html',
    '문서스캔.html',
    '소액임차보증금.png',
    '장래예상소득증가율.png',
    '신용점수기준.png'
)

$map = [ordered]@{}
$missing = @()

# [2026-11-12 수정] 해시는 "GitHub에 올라간 그대로(LF)"를 기준으로 계산해야 한다.
#  이 저장소는 core.autocrlf=true 라서 로컬 파일은 CRLF, GitHub는 LF로 저장된다.
#  로컬(CRLF) 해시로 매니페스트를 만들면 앱이 받는 파일(LF)과 해시가 달라
#  매번 "바뀐 파일"로 판단해 불필요하게 다시 받게 된다.
#  → 텍스트 파일은 CRLF를 LF로 바꿔 해시를 계산한다(바이너리는 그대로).
$textExt = @('.html', '.js', '.css', '.json', '.md', '.txt', '.gs', '.ps1', '.py')

function Get-GitBlobHash([string]$path) {
    $ext = [System.IO.Path]::GetExtension($path).ToLower()
    if ($textExt -contains $ext) {
        $text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
        $text = $text -replace "`r`n", "`n"
        $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($text)
    } else {
        $bytes = [System.IO.File]::ReadAllBytes($path)
    }
    $sha = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
    return @{ hash = (($sha | ForEach-Object { $_.ToString('x2') }) -join ''); size = $bytes.Length }
}

foreach ($f in $files) {
    if (-not (Test-Path $f)) { $missing += $f; continue }
    $info = Get-GitBlobHash $f
    $map[$f] = [ordered]@{ sha256 = $info.hash; size = $info.size }
}

if ($missing.Count -gt 0) {
    Write-Host "[경고] 없는 파일:" -ForegroundColor Yellow
    $missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}

$manifest = [ordered]@{
    version    = (Get-Date -Format 'yyyyMMdd_HHmmss')
    generatedAt = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK')
    files      = $map
}

$json = $manifest | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText((Join-Path $root 'version.json'), $json, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "[완료] version.json 생성: $($map.Count)개 파일" -ForegroundColor Green
Write-Host "  version = $($manifest.version)"
