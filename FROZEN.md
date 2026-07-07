# 🧊 FROZEN — 已封版

本 repo 為卡比集 LINE 機器人，目前 **rc-4（+安靜模式分群 +每日備份）已就緒待部署**。

**未經明確指示禁止任何修改。**

---

- 待部署版本：`develop`（deploy commit `34f56b8`；`#版本` 顯示 `19a0757`）
- 封版日期：2026/07/07（授權解凍：① 安靜模式分群獨立＋全域開關＋unknown 提示尊重安靜；② dailyBackup 每日試算表自動備份＋備份/還原/核對文件）
- 回歸測試：`node tests/golden/run_all.js` → 258/258 全綠
- 桌面部署檔已更新：`C:\Users\sqluser\Desktop\卡比集機器人-rc2.gs`（由老闆貼上 GAS 部署）
- ⚠️ 部署後需手動啟用每日備份：在 GAS 執行 `setupBackupTrigger` 一次並授權 Drive（見 `docs/備份與還原手冊.md` 第五節）
- 部署方式與回退：見 `docs/部署手冊.md`、`docs/RC_回歸測試清單_v2.58.md`
- 備份/還原/一致性核對：見 `docs/備份與還原手冊.md`、`docs/verify_sync.md`
- 決策/紀律：見 `DECISIONS.md`（本輪 D-QUIET、D-BACKUP）；未完成/延後項見 `KNOWN_ISSUES.md`
- 回滾點：tag `before-refactor` / `before-all` / `rc-1`~`rc-4`、封版前 commit `2e5c98a`、`Code.gs.backup-original`、`backups/Code.Task*.gs`
