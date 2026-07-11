'use strict';
/* v3.3 輸入失敗追蹤 回歸測試
 *  ① 各格式錯誤警示點 → 寫入『輸入失敗紀錄』一筆（含類型/輸入者/原文）
 *  ② 安靜模式被靜默的也照樣寫入（不回覆但留檔）
 *  ③ 防灌表：同一人同一分鐘同原文只記一筆
 *  ④ 查詢（限老闆）：查輸入失敗／今日輸入失敗／區間；含失敗次數排行；非老闆 🔒
 * 跑法：node tests/golden/run_v33.js
 */
const { createEnv } = require('./harness');
const OWNER = 'U_OWNER', OTHER = 'U_OTHER', G = 'G_ADMIN';
const FAIL = '輸入失敗紀錄';
let fails = 0; const out = []; let msgSeq = 0;
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function mkEnv() { const env = createEnv(); env.scriptProps.setProperty('OWNER_USER_ID', OWNER); env.scriptProps.setProperty('ADMIN_GROUP_IDS', G); return env; }
function send(env, text, uid) {
  const before = env.urlFetchCalls.length;
  env.fns.handleEvent({ type: 'message', replyToken: 'RT', message: { type: 'text', text: text, id: 'M' + (++msgSeq) }, source: { groupId: G, userId: uid || OWNER } });
  return env.urlFetchCalls.slice(before).filter(function (c) { return /\/message\/reply/.test(c.url); })
    .map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('\n'); } catch (e) { return ''; } }).join(' || ');
}
function failRows(env) { return env.sheets[FAIL] ? env.sheets[FAIL].__rows.slice(1) : []; }

/* ---------- ① 各警示點寫入一筆 ---------- */
(function () {
  const env = mkEnv();
  send(env, '1828\n50件');   // ship.unresolved → 無法判斷
  const r = failRows(env);
  check('①1 寄運無法判斷 → 寫入 1 筆', r.length === 1, JSON.stringify(r));
  check('①2 類型=寄運無法判斷', r[0] && r[0][1] === '寄運無法判斷', JSON.stringify(r[0]));
  check('①3 原文欄=原輸入', r[0] && r[0][3] === '1828\n50件', JSON.stringify(r[0]));
  check('①4 有輸入者欄', r[0] && !!r[0][2], JSON.stringify(r[0]));
})();
(function () {
  const env = mkEnv();
  send(env, '陳記\n收\n蘋果箱*2');   // 鐵架名稱不含「鐵」→ rackSlipStrict/Guard 格式警示
  const r = failRows(env);
  check('①5 鐵架格式警示 → 寫入', r.length >= 1 && r.some(function (x) { return x[1] === '鐵架格式'; }), JSON.stringify(r));
})();
(function () {
  const env = mkEnv();
  const rep = send(env, '阿明 要收款');   // 收款關鍵字無金額
  check('①6 收款無金額 → 回提示', /讀不到金額/.test(rep), rep);
  const r = failRows(env);
  check('①7 收款無金額 → 寫入 類型=收款無金額', r.some(function (x) { return x[1] === '收款無金額'; }), JSON.stringify(r));
})();

/* ---------- ② 安靜模式被靜默也照樣寫入 ---------- */
(function () {
  const env = mkEnv();
  send(env, '#安靜');
  const rep = send(env, '1828\n50件');
  check('②1 安靜群 → 提示被靜默(無回覆)', rep === '', JSON.stringify(rep));
  check('②2 安靜群 → 仍寫入輸入失敗 1 筆', failRows(env).length === 1, JSON.stringify(failRows(env)));
})();

/* ---------- ③ 防灌表：同一人同分鐘同原文只記一筆 ---------- */
(function () {
  const env = mkEnv();
  send(env, '1828\n50件');
  send(env, '1828\n50件');
  send(env, '1828\n50件');
  check('③1 同人同分鐘同原文重複 → 只記 1 筆', failRows(env).length === 1, '筆數=' + failRows(env).length);
  send(env, '9999\n77件');   // 不同原文 → 另記
  check('③2 不同原文 → 另記一筆(共2)', failRows(env).length === 2, '筆數=' + failRows(env).length);
})();

/* ---------- ④ 查詢（限老闆） ---------- */
(function () {
  const env = mkEnv();
  send(env, '1828\n50件');            // 失敗1（OWNER）
  send(env, '3030\n12件', OTHER);     // 失敗2（OTHER）
  send(env, '4040\n33件', OTHER);     // 失敗3（OTHER）
  const q = send(env, '查輸入失敗');
  check('④1 查輸入失敗 → 列出紀錄', /輸入失敗紀錄/.test(q) && /1828/.test(q), q.slice(0, 120));
  check('④2 查輸入失敗 → 含失敗次數排行', /失敗次數排行/.test(q), q);
  const today = send(env, '今日輸入失敗');
  check('④3 今日輸入失敗 → 今日標籤', /今日/.test(today) && /1828/.test(today), today.slice(0, 80));
  const denied = send(env, '查輸入失敗', OTHER);
  check('④4 非老闆查輸入失敗 → 🔒', /🔒/.test(denied), denied);
})();
(function () {
  const env = mkEnv();
  const empty = send(env, '查輸入失敗');
  check('④5 無紀錄 → 友善回覆', /沒有輸入失敗紀錄/.test(empty), empty);
})();

/* ---------- 報告 ---------- */
console.log('\n========== v3.3 輸入失敗追蹤 回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
