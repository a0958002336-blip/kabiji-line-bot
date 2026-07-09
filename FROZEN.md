# 🧊 FROZEN — 已封版

本 repo 為卡比集 LINE 機器人，目前 **v3.2 已就緒待部署**。

**未經明確指示禁止任何修改。**

---

- 待部署版本：`develop`（deploy commit `528c323`；`#版本` 顯示 `09b150a`；`v3.2`）
- 封版日期：2026/07/09（v3.2：① 計價單日期戳分群開關＋計價單不進寄運/台子；② 代號收回客戶名前綴；③ 名稱式收回擋代號紀錄）
- 回歸測試：`node tests/golden/run_all.js` → 363/363 全綠
- 桌面部署檔：`C:\Users\sqluser\Desktop\卡比集機器人-rc3.gs`（本次；rc2 為 v3.1 舊檔）；sha256 已對齊 HEAD
- ⚠️ 每日備份仍需部署後手動啟用一次：GAS 執行 `setupBackupTrigger`（見 `docs/備份與還原手冊.md` 第五節）
- 過夜工作：全路由回歸網 `tests/golden/run_routes.js`；路由衝突清單 `docs/路由衝突掃描_v3.2.md`（3 項待決策，未改碼）；晨間報告 `docs/晨間報告_2026-07-09.md`
- 部署方式與回退：見 `docs/部署手冊.md`；備份/還原/核對：`docs/備份與還原手冊.md`、`docs/verify_sync.md`
- 決策/紀律：見 `DECISIONS.md`（D-QUIET、D-BACKUP、D-V31、D-V32）；未完成/延後見 `KNOWN_ISSUES.md`
- 回滾點：tag `before-refactor`/`before-all`/`rc-1`~`rc-4`、前一版 deploy `00d5220`(v3.1)、封版前 `2e5c98a`、`Code.gs.backup-original`、`backups/Code.Task*.gs`
