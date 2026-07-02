# Git 分支策略、Golden Gate 與 Rollback

> 版本：v1.0　CTO。

## 1. 分支模型

```
main        ← 正式穩定版；禁止直接 push；只接受 release/hotfix 的 PR merge
develop     ← 整合分支；feature 完成後 merge 進來
feature/*   ← 每位工程師的功能/修 bug 分支（例：feature/bug1-shipping-misclassify）
release/*   ← 發版前的凍結分支
hotfix/*    ← 正式線上緊急修（從 main 開，修完 merge 回 main + develop）
```

## 2. 規則（強制）

1. **禁止直接改 main。** 所有變更走 PR。
2. 工程師只能開 `feature/*`（或 hotfix/*）。
3. Merge 前必須 **CTO Review**（對照 `docs/business_rules.md` 與 `CORE_PROTECTION.md`）。
4. Merge 前必須跑 **Golden Test 全綠**（見 `tests/golden/MANIFEST.md`），任一紅 → 禁止 merge。
5. 每個穩定版本建立 **Git Tag**（`vX.YZ-stable`）。
6. 必須能**一鍵 rollback** 回上一穩定版本。

> ⚠️ 本機 git 無法「真正」鎖 main（那是 GitHub 分支保護規則）。本機以 **pre-push hook + CTO 流程紀律**達成；若要硬鎖，需在 GitHub 設 branch protection（待授權）。

## 3. QA 流程（每完成一項 → merge 前自動跑）

```
單元測試 → 整合測試 → 回歸測試 → LINE測試 → ERP測試 → APP測試 → Merge
```
- GAS 側：以 node mock 跑（複製 .gs→.js `node --check` + 純邏輯測試）。
- ERP/APP 側：在 xuyang-line-erp repo 跑（本 repo 無法覆蓋）。
- 任一階段失敗 → 停止、不 merge、回報 CTO。

## 4. 現有 Tag（可回復點）

`v2.4-stable / v2.5-stable / v2.55-stable / v2.56-stable / v2.57-stable`（目前正式＝v2.57）。

## 5. Rollback（一鍵）

```powershell
# 列出可回復版本
scripts\rollback.ps1 -List
# 回復到指定穩定版（產生可貼上 GAS 的 .gs，並還原工作檔）
scripts\rollback.ps1 -Tag v2.57-stable
```
- 腳本會在數秒內把該 tag 的 `.gs` 還原到工作檔並輸出到桌面。
- ⚠️ **GAS 的實際生效仍需人工**：把還原出的 `.gs` 貼回 GAS 編輯器 →「管理部署作業 → 新版本 → 部署」→ 打 `#版本` 確認。CTO（本機）無 clasp/API，無法代按部署。
- 「30秒恢復」= 檔案還原是數秒；線上 webhook 生效取決於你貼上+部署那一步（約 1 分鐘內）。
