'use strict';
/* Bug 3/4 回歸測試：外勤誤登記/外勤貼回取消路由、冰庫貼回操作路由
 * 跑法：node tests/golden/run_route_fix.js
 */
const { createEnv } = require('./harness');
const G = 'G_ADMIN', OWNER = 'U_OWNER';
let fails = 0; const out = [];
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function rows(env, s) { return env.sheets[s] ? env.sheets[s].__rows.slice(1) : []; }
function mkEnv() { const env = createEnv(); env.scriptProps.setProperty('OWNER_USER_ID', OWNER); env.scriptProps.setProperty('ADMIN_GROUP_IDS', G); return env; }
function send(env, text) { env.fns.handleEvent({ type: 'message', replyToken: 'RT', message: { type: 'text', text: text }, source: { groupId: G, userId: OWNER } }); const rs = env.urlFetchCalls.map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('\n'); } catch (e) { return ''; } }); return rs[rs.length - 1] || ''; }

/* ---------- Bug3a：外勤代名詞/聊天句不登記 ---------- */
(function () {
  check('3a-1 handleDuty「你這個外勤跑哪去了」count=0', mkEnv().fns.handleDuty('你這個外勤跑哪去了').count === 0, '');
  const e = mkEnv(); send(e, '你這個外勤跑哪去了');
  check('3a-2 端到端不寫外勤', rows(e, '外勤補貼').length === 0, JSON.stringify(rows(e, '外勤補貼')));
  check('3a-3 正常「阿良外勤 台北」照登記', mkEnv().fns.handleDuty('阿良外勤 台北').count === 1, '');
})();

/* ---------- Bug3b：外勤合計貼回+取消 → 回外勤教學，不路由到寄運 ---------- */
(function () {
  const e = mkEnv();
  const r = send(e, '🚚 2026/06 外勤補貼合計：\n・林義祥：500元\n取消');
  check('3b-1 回外勤取消教學(含外勤補貼)', /外勤補貼/.test(r), r);
  check('3b-2 不得回「寄運紀錄」', !/寄運/.test(r), r);
})();

/* ---------- Bug4：冰庫貼回 ---------- */
(function () {
  // 純貼回 → 擋
  const e1 = mkEnv();
  const r1 = send(e1, '❄️ 冰庫庫存（忠慶）：\n【忠慶】\n青椒：10');
  check('4a 純貼回→擋、不寫入', /此為冰庫查詢結果/.test(r1) && rows(e1, '冰庫寄存').filter(function (x) { return String(x[3]) === '出庫'; }).length === 0, r1);
  // 貼回 + 出N → 扣庫存
  const e2 = mkEnv();
  e2.fns.handleFreezerCmd('寄冰 忠慶 青椒 10');
  send(e2, '❄️ 冰庫庫存\n【忠慶】\n青椒：10 出3');
  check('4b 貼回+出3→餘額7', e2.fns.freezerBalanceOf('忠慶', '青椒') === 7, String(e2.fns.freezerBalanceOf('忠慶', '青椒')));
  // 貼回 + 修改N → 改餘額
  const e3 = mkEnv();
  e3.fns.handleFreezerCmd('寄冰 忠慶 青椒 10');
  send(e3, '❄️ 冰庫庫存\n【忠慶】\n青椒：10 修改5');
  check('4c 貼回+修改5→餘額5', e3.fns.freezerBalanceOf('忠慶', '青椒') === 5, String(e3.fns.freezerBalanceOf('忠慶', '青椒')));
})();

console.log('\n========== Bug 3/4 路由/防呆 回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
