'use strict';
/* v3.2 修正回歸測試（整合級，驅動 handleEvent）
 *  ① 計價單日期戳（分群開關）＋含「=金額」計價單一律不進寄運/台子
 *  ② 代號收回允許客戶名前綴（彰化芬園B*1收回；客戶不符擋；b*1照常）
 *  ③ 名稱式收回不得誤吞代號紀錄（有代號→警示不動帳）
 * 跑法：node tests/golden/run_v32.js（任一 FAIL → exit 1）
 */
const { createEnv } = require('./harness');
const OWNER = 'U_OWNER', OTHER = 'U_OTHER', G = 'G_ADMIN';
const RACK = '鐵架庫存', TAIZI = '台子庫存', SHIP = '寄運資料', MSG = '群組訊息';
let fails = 0; const out = []; let msgSeq = 0;
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function mkEnv() { const env = createEnv(); env.scriptProps.setProperty('OWNER_USER_ID', OWNER); env.scriptProps.setProperty('ADMIN_GROUP_IDS', G); return env; }
function send(env, text, uid) {
  const before = env.urlFetchCalls.length;
  const ev = { type: 'message', replyToken: 'RT', message: { type: 'text', text: text, id: 'M' + (++msgSeq) }, source: { groupId: G, userId: uid || OWNER } };
  let err = null; try { env.fns.handleEvent(ev); } catch (e) { err = String(e && e.message || e); }
  const reply = env.urlFetchCalls.slice(before).filter(function (c) { return /\/message\/reply/.test(c.url); })
    .map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('\n'); } catch (e) { return ''; } }).join(' || ');
  return { reply: reply, err: err };
}
function dataRows(env, sheet) { return env.sheets[sheet] ? env.sheets[sheet].__rows.slice(1) : []; }
function outTotal(env) { const m = send(env, '查鐵架').reply.match(/在外面共\s*(\d+)\s*支/); return m ? parseInt(m[1], 10) : 0; }

const PRICE = '台北素茵\n高山初秋 特(修清) 10K 119台*700=83,300';

/* ==================== ① 計價單日期戳 ==================== */
(function () {
  const env = mkEnv();
  const on = send(env, '#開啟日期戳');
  check('①0 #開啟日期戳 回本群開啟', /本群組已開啟計價單日期戳/.test(on.reply), on.reply);
  const r = send(env, PRICE);
  check('①1 開啟後計價單 → 回 📅 當日日期', /^📅\s*\d{4}\/\d{1,2}\/\d{1,2}/.test(r.reply), JSON.stringify(r.reply));
  check('①2 計價單 → 台子零寫入', dataRows(env, TAIZI).length === 0, JSON.stringify(dataRows(env, TAIZI)));
  check('①3 計價單 → 寄運零寫入', dataRows(env, SHIP).length === 0, JSON.stringify(dataRows(env, SHIP)));
  check('①4 計價單 → 群組訊息有記錄', dataRows(env, MSG).some(function (row) { return String(row[1]).indexOf('83,300') !== -1; }), JSON.stringify(dataRows(env, MSG).map(function (r) { return r[1]; })));
  // 統整金額回歸：=83,300 仍抓得到
  const now = new Date(); const md = now.getFullYear() + '/' + (now.getMonth() + 1) + '/' + now.getDate();
  const sum = env.fns.summarizeAmount(md + '-' + md);
  check('①5 統整金額 → 抓到 83,300', /83,300/.test(sum), sum);
})();
(function () {
  const env = mkEnv();   // 未開啟
  const r = send(env, PRICE);
  check('①6 未開啟群 → 計價單靜默（無回覆）', r.reply === '', JSON.stringify(r.reply));
  check('①7 未開啟群 → 台子/寄運仍零寫入', dataRows(env, TAIZI).length === 0 && dataRows(env, SHIP).length === 0, '台子=' + dataRows(env, TAIZI).length + ' 寄運=' + dataRows(env, SHIP).length);
  check('①8 未開啟群 → 群組訊息仍有記錄', dataRows(env, MSG).some(function (row) { return String(row[1]).indexOf('83,300') !== -1; }), '');
  const denied = send(env, '#開啟日期戳', OTHER);
  check('①9 非老闆 #開啟日期戳 → 🔒', /🔒/.test(denied.reply), denied.reply);
  check('①10 非老闆未開啟成功', env.fns.dateStampOn(G) === false, String(env.fns.dateStampOn(G)));
})();

/* ==================== ①' 唯讀(unknown/market)群組也能觸發日期戳（v3.2.2 修） ==================== */
function sendTo(env, text, group, uid) {
  const before = env.urlFetchCalls.length;
  env.fns.handleEvent({ type: 'message', replyToken: 'RT', message: { type: 'text', text: text, id: 'M' + (++msgSeq) }, source: { groupId: group, userId: uid || OWNER } });
  return env.urlFetchCalls.slice(before).filter(function (c) { return /\/message\/reply/.test(c.url); })
    .map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('\n'); } catch (e) { return ''; } }).join(' || ');
}
const RO = 'G_MARKET';   // 不在 ADMIN_GROUP_IDS → 唯讀(unknown)群組
const PRICE2 = '中原開發食品\n一毛路 特 30件*300=9,000';
(function () {
  const env = mkEnv();   // ADMIN_GROUP_IDS=G_ADMIN，RO 為唯讀
  const on = sendTo(env, '#開啟日期戳', RO);   // 老闆在唯讀群開啟（ownerGate 過）
  check("①'0 唯讀群 #開啟日期戳 成功", /本群組已開啟計價單日期戳/.test(on), on);
  const r = sendTo(env, PRICE2, RO);
  check("①'1 唯讀群開啟後計價單 → 回 📅 日期（bug 修正）", /^📅\s*\d{4}\/\d{1,2}\/\d{1,2}/.test(r), JSON.stringify(r));
  check("①'2 唯讀群計價單 → 台子/寄運零寫入", dataRows(env, TAIZI).length === 0 && dataRows(env, SHIP).length === 0, '台子=' + dataRows(env, TAIZI).length + ' 寄運=' + dataRows(env, SHIP).length);
})();
(function () {
  const env = mkEnv();   // 唯讀群未開啟
  const r = sendTo(env, PRICE2, RO);
  check("①'3 唯讀群未開啟 → 計價單靜默", r === '', JSON.stringify(r));
})();

/* ==================== ② 代號收回允許客戶名前綴 ==================== */
function setupAB(env) { send(env, '陳記 勝山鐵架*1'); send(env, '彰化芬園 旭陽鐵架*1'); }   // A=陳記, B=彰化芬園
(function () {
  const env = mkEnv(); setupAB(env);
  const r = send(env, '彰化芬園B*1收回');
  check('②1 彰化芬園B*1收回 → 成功收回', /\[B\]/.test(r.reply) && /收回 1/.test(r.reply), r.reply);
})();
(function () {
  const env = mkEnv(); setupAB(env);
  const r = send(env, '陳記B*1收回');   // B 屬彰化芬園，客戶不符
  check('②2 陳記B*1收回（客戶不符）→ 警示不收', /不符/.test(r.reply) && !/收回 1/.test(r.reply), r.reply);
  check('②2b 客戶不符 → B 未被收回（仍在外）', env.fns.rackNet().coded['B'].n === 1, JSON.stringify(env.fns.rackNet().coded['B']));
})();
(function () {
  const env = mkEnv(); setupAB(env);
  const r = send(env, 'b*1收回');   // 無前綴照常
  check('②3 b*1收回（無前綴）→ 照常收回', /\[B\]/.test(r.reply) && /收回 1/.test(r.reply), r.reply);
})();

/* ==================== ③ 名稱式收回不得誤吞代號紀錄 ==================== */
(function () {
  const env = mkEnv();
  send(env, '祐昌 勝山鐵架*4');   // 代號 A：祐昌 勝山鐵架 ×4
  env.sheets[RACK].__rows.push(['2026/07/01 09:00', '', '出庫', '勝山鐵架', 2, '祐昌']);   // 舊制未收回 ×2（無代號）
  const before = outTotal(env);
  check('③0 設定：在外共 6（代號4＋舊制2）', before === 6, String(before));
  const rowsBefore = dataRows(env, RACK).length;
  const r = send(env, '祐昌\n收\n勝山鐵架*2');   // 名稱式收回
  check('③1 名稱式收回遇代號紀錄 → 警示', /已有代號紀錄/.test(r.reply) && /\[A\]/.test(r.reply), r.reply);
  check('③2 名稱式收回遇代號紀錄 → 不動帳（未新增入庫列）', dataRows(env, RACK).length === rowsBefore, '前=' + rowsBefore + ' 後=' + dataRows(env, RACK).length);
  check('③3 名稱式收回遇代號紀錄 → 在外總數不變(6)', outTotal(env) === 6, String(outTotal(env)));
})();

// rackNet 相容抵扣（歷史遺留：代號品項曾被舊制入庫）→ 自動抵扣，總數仍正確
(function () {
  const env = mkEnv();
  send(env, '陳記 勝山鐵架*3');   // 代號 A ×3
  env.sheets[RACK].__rows.push(['2026/07/01 09:00', '', '入庫', '勝山鐵架', 1, '陳記']);   // 舊制留下的無代號入庫 1（負向 legacy）
  check('③4 rackNet 相容：舊制入庫自動抵扣代號 → 在外 2', outTotal(env) === 2, String(outTotal(env)));
})();

/* ==================== ④ 回歸抽樣（v3.2 不得破壞既有） ==================== */
(function () {
  const env = mkEnv();
  const ship = send(env, '陳老闆\n高麗菜 中 20件 寄旭陽');
  check('④1 寄運單（無 =金額）→ 正常建立寄運', /已記錄寄運資料/.test(ship.reply) && dataRows(env, SHIP).length === 1, ship.reply);
  const rackOut = send(env, '陳記 勝山鐵架*2');
  check('④2 出鐵架 → 帶代號', /\[A\]/.test(rackOut.reply), rackOut.reply);
  const punch = send(env, '小明 上班');
  check('④3 打卡 → 正常', /已登記/.test(punch.reply), punch.reply);
  const anomaly = send(env, '#台子異常掃描');
  check('④4 #台子異常掃描 → 無誤記時回無異常', /沒有發現可疑/.test(anomaly.reply), anomaly.reply);
})();

/* ---------- 報告 ---------- */
console.log('\n========== v3.2 修正回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
