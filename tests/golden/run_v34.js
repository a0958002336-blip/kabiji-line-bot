'use strict';
/* v3.4 回歸測試（Part 1：Bug1 去貨主名 + Bug2 #備註規則）
 *  ① 去貨主名涵蓋標題/明細/備註（已登記貨主）；未登記需 #新增貨主
 *  ② #備註：# 開頭非指令 → 掛今日最近一筆寄運/收款備註；限當日；無資料提示
 *  ③ 無#閒聊：不解析/不儲存/不回應；slip 尾行純文字不再誤存為備註；括號備註仍保留
 * 跑法：node tests/golden/run_v34.js
 */
const { createEnv } = require('./harness');
const OWNER = 'U_OWNER', G = 'G_ADMIN';
const SHIP = '寄運資料', RECV = '待收款';
let fails = 0; const out = []; let msgSeq = 0;
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function mkEnv() { const env = createEnv(); env.scriptProps.setProperty('OWNER_USER_ID', OWNER); env.scriptProps.setProperty('ADMIN_GROUP_IDS', G); env.scriptProps.setProperty('VENDORS', '葉瑋宸,宜聰'); return env; }
function send(env, text) {
  const before = env.urlFetchCalls.length;
  env.fns.handleEvent({ type: 'message', replyToken: 'RT', message: { type: 'text', text: text, id: 'M' + (++msgSeq) }, source: { groupId: G, userId: OWNER } });
  return env.urlFetchCalls.slice(before).filter(function (c) { return /\/message\/reply/.test(c.url); })
    .map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('\n'); } catch (e) { return ''; } }).join(' || ');
}
function rows(env, s) { return env.sheets[s] ? env.sheets[s].__rows.slice(1) : []; }

/* ========== ① Bug1 去貨主名 ========== */
(function () {
  const env = mkEnv();
  const r = send(env, '6986\n葉瑋宸高山228 特 100件 寄旭陽');
  check('①1 明細去貨主名（黏字）', /・高山228 特 100件/.test(r) && !/葉瑋宸高山228/.test(r), r);
  const row = rows(env, SHIP)[0];
  check('①2 寄運品名欄=高山228（去名）', row && row[3] === '高山228', JSON.stringify(row));
  check('①3 貨主欄保留=葉瑋宸', row && row[2] === '葉瑋宸', JSON.stringify(row));
})();
(function () {
  const env = mkEnv();   // 未登記貨主 → 無法去名（A+B1 設計：需 #新增貨主）
  env.scriptProps.setProperty('VENDORS', '');
  const r = send(env, '6986\n王小明高山228 特 100件 寄旭陽');
  check('①4 未登記貨主黏字 → 仍留(需#新增貨主)', /王小明高山228/.test(r), r);
})();
(function () {
  const env = mkEnv();
  const scs = env.fns.shippingCleanSummary([{ customer: '6986', vendor: '葉瑋宸', name: '葉瑋宸高山228', grade: '特', qty: '100', note: '葉瑋宸交貨' }]);
  check('①5 stripVendors 涵蓋明細+備註', /高山228/.test(scs) && !/葉瑋宸/.test(scs), scs);
})();

/* ========== ② Bug2 #備註 ========== */
(function () {
  const env = mkEnv();
  send(env, '6986\n高山228 特 100件 寄旭陽');
  const r = send(env, '#可以連鐵架一起需紀錄');
  check('②1 #備註 → 掛最近寄運，回確認', /已把備註掛到今日最近一筆/.test(r) && /可以連鐵架一起需紀錄/.test(r), r);
  check('②2 #備註 → 寫入寄運備註欄', rows(env, SHIP)[0][9] === '可以連鐵架一起需紀錄', JSON.stringify(rows(env, SHIP)[0]));
})();
(function () {
  const env = mkEnv();
  const r = send(env, '#隨便記一下');
  check('②3 今日無資料 → 友善提示', /今日尚無可掛備註/.test(r), r);
})();
(function () {
  const env = mkEnv();
  send(env, '6986 老人田 高山228 要收款 6800');   // 收款較新
  const r = send(env, '#這筆現金');
  check('②4 #備註 可掛到收款', /已把備註掛到今日最近一筆（收款/.test(r), r);
  check('②5 收款備註欄寫入', rows(env, RECV)[0][6] === '這筆現金', JSON.stringify(rows(env, RECV)[0]));
})();

/* ========== ③ 無#閒聊不誤存 ========== */
(function () {
  const env = mkEnv();
  // slip 尾行純文字閒聊 → 不進備註
  send(env, '6986\n高山228 特 100件 寄旭陽\n可以連鐵架一起需紀錄');
  check('③1 slip尾行閒聊 → 備註空(不誤存)', rows(env, SHIP)[0][9] === '', JSON.stringify(rows(env, SHIP)[0]));
  // 括號備註仍保留
  const env2 = mkEnv();
  send(env2, '6986\n高山228 特 100件 寄旭陽\n（修清）');
  check('③2 括號備註仍保留', rows(env2, SHIP)[0][9] === '修清', JSON.stringify(rows(env2, SHIP)[0]));
  // 純閒聊 → 無反應、無寫入
  const env3 = mkEnv();
  const r = send(env3, '可以連鐵架一起需紀錄');
  check('③3 無#閒聊 → 無回應、無寄運', r === '' && rows(env3, SHIP).length === 0, JSON.stringify(r));
})();

/* ---------- 報告 ---------- */
console.log('\n========== v3.4 Part1（去貨主名 + #備註）回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
