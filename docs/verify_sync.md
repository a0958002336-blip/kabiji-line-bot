# verify_sync — GAS 線上碼 vs git 最新碼 一致性核對

> 目的：防止「有人直接在 GAS 編輯器改程式」而沒有回寫 git，造成**線上跑的**和**倉庫存的**兩邊分岔（divergence）。
> 時機：**每次部署後**做一次；平時建議每週一次。
> 原則：git（GitHub `develop`）是唯一正式來源（single source of truth）。GAS 只能是它的忠實副本。

---

## 方法 A：#版本 hash 核對（最快，非工程師 30 秒）

每次交付都會把「本次**版本 commit** 的短 hash」寫進程式的 `BOT_BUILD`，並顯示在 `#版本` 第一行。
（⚠️ 是版本 commit，不是部署 commit、不是 HEAD——見上方寫死定義。）

1. 在 LINE（老闆帳號）打 `#版本`，看第一行：
   ```
   📦 卡比集機器人 v3.4.8 (f638800) 2026/08/10
   ```
   括號內就是**線上碼的 build hash**。
2. 打開 git 最新的 `卡比集機器人.gs`（或 GitHub 上該檔），找到最上方：
   ```js
   var BOT_BUILD = 'f638800';
   ```
3. **兩個 hash 一樣 → 一致 ✅**；**不一樣 → 兩邊分岔，見下方〈發現分岔怎麼辦〉**。

> ⚠️ 侷限：若有人改了 GAS 程式但**沒動** `BOT_BUILD`，hash 會「看起來一樣」卻其實內容不同。所以**部署後**用方法 A 快篩，**定期**再用方法 B 做內容級核對。

---

## 方法 B：內容 checksum 核對（工程級，抓「偷改沒改 hash」）

比對「GAS 線上全文」與「git 最新 .gs」的內容指紋。

### B-1 取得 git 端指紋（在 `卡比集機器人_repo`）
```bash
# git 物件 blob hash（最穩定、跨行尾一致；建議以此為準）
git rev-parse HEAD:卡比集機器人.gs

# LF 正規化後的 sha256（與上面二選一）
git show HEAD:卡比集機器人.gs | sha256sum

# 位元組數 / 行數（粗略快篩）
git show HEAD:卡比集機器人.gs | wc -c
git show HEAD:卡比集機器人.gs | wc -l
```

### B-2 取得 GAS 端指紋
1. Apps Script 編輯器打開對應檔（通常 `Code.gs`）→ 全選(Ctrl+A)→複製。
2. 貼進一個純文字檔，例如桌面 `gas_online.gs`（用 VS Code 或記事本存成 UTF-8）。
3. 在 Git Bash：
   ```bash
   # 先把行尾統一成 LF 再算，才能和 git 端公平比對
   sed 's/\r$//' ~/Desktop/gas_online.gs | sha256sum
   sed 's/\r$//' ~/Desktop/gas_online.gs | wc -c
   ```
4. 把 B-2 的 sha256 和 **B-1 的 `git show ... | sha256sum`** 相比：**相同 → 一致 ✅**。
   - 行數/位元組數也可先粗比；不同就一定分岔。

> 說明：GAS 貼上時可能吃掉結尾換行或改行尾，導致 sha256 差一點點但功能相同。若 sha256 不同，先用 `git diff` 概念人工看差在哪（或用下方 B-3），不要只看數字就恐慌。

### B-3 直接比對差異（要看「差在哪一行」時）
```bash
# 把 GAS 線上碼存成 gas_online.gs 後：
diff <(git show HEAD:卡比集機器人.gs) <(sed 's/\r$//' ~/Desktop/gas_online.gs)
```
沒有輸出 = 完全一致。有輸出 = 那幾行就是被人偷改／或 git 較新未部署。

---

## 目前基準（每次交付更新這一塊）

### ⚠️ 先讀：`BOT_BUILD` 到底該對哪個 commit（寫死，勿再解讀）

> **`#版本` 顯示的 hash ＝ 該版的「版本 commit」短 hash，不是 HEAD、不是 `chore(版本)` 回填後的 commit、
> 也不是封版 commit。**
>
> 本版即為 **`f638800`**（`[v3.4.8] …`），**不是** `91d8b1c`（chore 回填）。
> 交付流程固定四步：① 版本 commit（此時 BOT_BUILD 仍是上一版）→ ② 取該 commit 短 hash
> → ③ 回填並另開 `chore(版本)` commit → ④ 封版 commit。
> 所以 **BOT_BUILD 一定比 HEAD 少一到兩格，這是刻意的，不是忘了更新**。
>
> 做方法 A 核對時：拿 `#版本` 括號內的值 比對 **下表的「版本 commit」列**，
> ❌ 不要拿 `git rev-parse --short HEAD` 比（一定對不上）。
> ❌ 禁止用 `git commit --amend` 回填 hash（amend 會改掉 commit hash，填進去的值當場失效）。

| 項目 | 值 |
|------|-----|
| 版本 | `v3.4.8`（2026/08/11 封版，**尚未部署**；貼一次即含未部署的 v3.4.7） |
| **版本 commit（＝`#版本` 顯示 / `BOT_BUILD`）** | **`f638800`** ← 方法 A 對這個 |
| 部署 commit（.gs 最後變更，即 chore 回填那筆） | `91d8b1c` |
| git blob hash（`git rev-parse HEAD:卡比集機器人.gs`） | `06622578eae353a48981460d6fe6763751e9bdcc` |
| sha256（LF 正規化） | `ffff09133dc594bd0c12ef05073bf6dbe18b1cc15fe6ae80072de726ca66a118` |
| 位元組數 / 行數 | `329230` / `4392` |
| 回歸測試 | 552/552 |

> **v3.4.7（已封版、未部署）**：版本 commit `565b1c4`、部署 commit `c3d2a34`、
> sha256 `ffdcadf5275a7f714d428517a2e1af205f4b73c26fe4cdc5e90abfe43e10abd6`、`325875` / `4356`。
>
> **v3.4.6（目前線上實際跑的）**：版本 commit（`#版本`）`888a515`、部署 commit `72b1b52`、
> blob `5bb0b1df0165faabe6081a270a4b261ef3e4b45e`、
> sha256 `fb667cf3e469839be4d7e49be5c60937a3d3e0eb6d93e9abf2c3236ab3f452f9`、`323287` / `4329`。
>
> 部署 v3.4.8 之前，方法 A 打 `#版本` 應顯示 **`888a515`**；
> 若顯示 `f638800` 或 `565b1c4` 代表已被部署，須回報。
> 再上一版 v3.4.5：`#版本` `95fde8a`、部署 commit `a8d08f1`、sha256 `1da17aa2…`、`318920` / `4278`。

> 對照時以「當下 git HEAD 實算值」為準；上表是交付當時的快照，方便一眼確認。

---

## 發現分岔怎麼辦

情境判斷：
1. **GAS 比較新（有人在 GAS 改了東西）**：
   - 先在 GAS 全選複製、貼進 `卡比集機器人.gs`，跑 `node tests/golden/run_all.js` 確認沒破壞；
   - 若正當，補寫測試、正常 commit/push 回 git，並回填 `BOT_BUILD`；
   - 若是誤改，改用〈備份與還原手冊〉把 GAS 貼回 git 版並重新部署。
2. **git 比較新（改了但忘記部署）**：照〈部署手冊〉把最新 `.gs` 貼上 GAS 重新部署。
3. 無論哪種，處理完再跑一次方法 A + B 確認回到一致。

> 鐵律：正式修改一律走 git（測試→commit→push→部署→回填 hash）。**不要**只在 GAS 線上改而不回寫，否則下次交付會覆蓋掉、且無法追蹤。
