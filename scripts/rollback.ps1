# 卡比集機器人 一鍵 Rollback
# 用法:
#   scripts\rollback.ps1 -List
#   scripts\rollback.ps1 -Tag v2.57-stable
param(
    [switch]$List,
    [string]$Tag
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
Set-Location $repo

if ($List) {
    Write-Output "可回復的穩定版本 (git tag):"
    git tag | Sort-Object
    Write-Output ""
    Write-Output "目前 HEAD:"; git log --oneline -1
    return
}

if (-not $Tag) {
    Write-Output "請指定 -Tag <版本>，或用 -List 查看。例: scripts\rollback.ps1 -Tag v2.57-stable"
    return
}

# 確認 tag 存在
$tags = git tag
if ($tags -notcontains $Tag) {
    Write-Output "找不到 tag: $Tag"; Write-Output "現有: $($tags -join ', ')"; return
}

$gsName = "卡比集機器人.gs"
$deskDir = [Environment]::GetFolderPath('Desktop')
$out = Join-Path $deskDir ("ROLLBACK_" + $Tag + "_" + $gsName)

# 從 tag 取出該版本的 .gs 到桌面 (供貼回 GAS)，並還原工作檔
git show "${Tag}:$gsName" | Out-File -FilePath $out -Encoding utf8
git checkout $Tag -- $gsName

Write-Output "已還原工作檔 $gsName 到版本 $Tag"
Write-Output "已輸出可貼上 GAS 的檔案: $out"
Write-Output ""
Write-Output "⚠️ 線上生效仍需人工: 貼回 GAS 編輯器 → 管理部署作業 → 新版本 → 部署 → 打 #版本 確認。"
Write-Output "   (CTO 本機無 clasp/API，無法代按部署。)"
