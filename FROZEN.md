# 🧊 FROZEN — 已封版

本 repo 為卡比集 LINE 機器人，目前 **v3.1 已就緒待部署**。

**未經明確指示禁止任何修改。**

---

- 待部署版本：`develop`（deploy commit `00d5220`；`#版本` 顯示 `6048696`；`v3.1`）
- 封版日期：2026/07/08（v3.1：① 指定收款人 收款人 名字／收款人 R編號 名字；② #已收／#取消收款 免空格＋空指令教學；③ 鐵架代號制 出庫配[A][B]、a*2收回、#鐵架轉代號）
- 回歸測試：`node tests/golden/run_all.js` → 294/294 全綠
- 桌面部署檔已更新：`C:\Users\sqluser\Desktop\卡比集機器人-rc2.gs`（由老闆貼上 GAS 部署）
- ⚠️ 每日備份仍需部署後手動啟用一次：GAS 執行 `setupBackupTrigger`（見 `docs/備份與還原手冊.md` 第五節）
- 部署方式與回退：見 `docs/部署手冊.md`、`docs/RC_回歸測試清單_v2.58.md`
- 備份/還原/一致性核對：見 `docs/備份與還原手冊.md`、`docs/verify_sync.md`
- 安靜警示點調查（不改碼）：見 `docs/安靜模式警示點調查_v3.1.md`
- 決策/紀律：見 `DECISIONS.md`（D-QUIET、D-BACKUP＋.6、D-V31）；未完成/延後項見 `KNOWN_ISSUES.md`
- 回滾點：tag `before-refactor` / `before-all` / `rc-1`~`rc-4`、前一版 deploy `7bb0af2`(零權限備份)、封版前 commit `2e5c98a`、`Code.gs.backup-original`、`backups/Code.Task*.gs`
