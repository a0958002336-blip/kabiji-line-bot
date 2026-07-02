# 效能稽核報告（Performance Audit）— v2.57

> 唯讀靜態分析，未修改任何程式。日期：2026-07-02　CTO。
> 目標：一般文字指令 1–3s、查詢 3–5s、>5s 列為異常。

## 0. 前提校正（清單中不成立/不適用項）
- **鎖非瓶頸**：6 處皆 `acquireLock(5000)`（行1396/2245/2294/2356/2417/2449），查詢不上鎖；無 20 秒長鎖。
- **第3項（Log變慢）/第10項（v2.58）不成立**：`.gs` 未改、無 v2.58，變慢與我方改動無關。
- **第4項（Plugin攔截）不成立**：Plugin/OCR/AI 尚未實作。
- **第9項（PWA/service-worker）不適用**：在 ERP 側，不經 GAS webhook。
- **外部 API**：僅 LINE reply/push（行3134/3143）與 `getDisplayName`（行2021，快取＋單次上限15）。

## 1. 每個 LINE event 被處理幾次
- `doPost`（行35）：每 event → `handleEvent` **一次**，無內部重複派發。
- ⚠️ **無 event-id/message-id 去重**：GAS 回應慢時 LINE 會重送 webhook → **重複處理＋重複寫入**。目前無防護（idempotency）。

## 2. 每則訊息「基礎成本」（所有指令都會付）
低。主要為：`logGroupMessage`（行117，append 1 列＋noise 過濾）、`getPerm→listProp`（ScriptProperties，便宜）、`rackEntryGuard`（多數訊息在行2711/2716 便宜退出）、fall-through regex 測試。
→ **一般交易/查詢/收款/打卡/寄運不會觸發鐵架的 3 表掃描**，基礎成本不高。

## 3. 最慢熱點排名（靜態複雜度，實測需 instrumentation）

| 名次 | 函式/位置 | 複雜度 | 觸發指令 |
|---|---|---|---|
| 1 | `freezerBalanceOf`（行1346）**在出貨迴圈行549內** | **O(台子品項數 × 冰庫列數)** | 一般出貨（最常用） |
| 2 | `knownRetailers`（行2700，掃 RACK+SHIP+FREEZER）× `rackEntryGuard`(2741)+`rackSlipStrict`(2788) | **最多 6 × 全表** | 鐵架出/收 |
| 3 | `controlOverview`（行2961–2967） | 7 × 全表 | 中控總覽 |
| 4 | `summarizeAmount/Detail`（行2168 msgTail 5000 + 逐塊 regex） | O(5000 塊) | 統整金額 |
| 5 | `evaluation`（行2905/2926/2936） | 3 × 全表 | 綜合評比 |
| 6 | `knownFreezerCustomers`（行1360，掃 FREEZER） | 1 × 全表/次 | 寄冰/冰庫指令 |
| 7 | 各查詢 `shippingPull`/`lossQuery`/`attendanceQuery`… | 1 × 全表 | 各查詢（可接受） |

## 4. 重複寫入 / 無限迴圈
- **單次處理內無重複寫入、無無限迴圈**（所有迴圈由 `data.length` 界定）。
- 重複寫入的唯一來源＝**LINE webhook 重送**（見 §1，無去重）。

## 5. 靜默錯誤（第8項）
大量 `catch (e) { }` 空吞：行1124、1360、2703–2705、2858、2961–2967 等。
→ 掃表/寫入偶發失敗被吞、無 log，慢與錯都難察覺。建議改為「記錄後再處理」。

## 6. 「這兩天變慢」判定
程式碼未變 → 最可能為**資料量成長**使 §3 的 O(N) 全表掃描逐日變慢，主要受害：
- 出貨（熱點#1，冰庫列數↑）
- 鐵架（熱點#2，3 表列數↑）
- 統整金額/評比（群組訊息列數↑）

## 7. 修正建議（皆走 feature branch，不新增功能）

**P0（最高 CP 值，低風險）**
1. **消除迴圈內掃冰庫**：出貨前**一次**把冰庫餘額讀成 map，迴圈內查 map（行546–551 重構）。N 次掃 → 1 次。
2. **request 內記憶化 `knownRetailers`/`knownFreezerCustomers`**：同一次請求只掃一次（快取到全域，doPost 開頭清）。鐵架 6 掃 → 3 掃。

**P1**
3. **Webhook 去重**：用 `event.message.id`/`webhookEventId` 記最近已處理 id（Cache/Properties），重送直接略過。防重複寫入。
4. **限縮掃描範圍**：熱表（寄運/冰庫/群組訊息）加「近 N 天/近 N 列」界定，或定期歸檔舊資料到封存分頁。根治資料成長。
5. **空 catch 補 log**：至少 `console.error` 記錄，避免靜默。

**量測（取得真實數字）**
6. 無 instrumentation 無法給「平均耗時/最慢前10」實測值。二選一：
   - (a) 你到 Apps Script 主控台看「執行紀錄」，每次 doPost 有實際耗時；或
   - (b) 我在 feature branch 加**輕量計時 log**（各 handler 進出時間戳，暫時性），部署後即可回報真實 per-command 耗時。

## 8. 目標達成評估（估計，待實測校正）
- 簡單查詢（1 表）：應 <3s ✅
- 出貨（多台子 + 大冰庫）/鐵架/中控/統整：**可能逼近或超過 5s ⚠️**（熱點#1#2#3#4）
- 修完 P0（#1#2）預期最常用的出貨/鐵架顯著改善。
