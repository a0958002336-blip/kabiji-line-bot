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

/* ========== ④ 收款流程 ========== */
const RECVSHEET = '待收款';
function sendU(env, text, uid, quotedId) {
  const before = env.urlFetchCalls.length;
  const msg = { type: 'text', text: text, id: 'M' + (++msgSeq) }; if (quotedId) msg.quotedMessageId = quotedId;
  env.fns.handleEvent({ type: 'message', replyToken: 'RT', message: msg, source: { groupId: G, userId: uid || OWNER } });
  return env.urlFetchCalls.slice(before).filter(function (c) { return /\/message\/reply/.test(c.url); })
    .map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('\n'); } catch (e) { return ''; } }).join(' || ');
}
function recvRowsRaw(env) { return env.sheets[RECVSHEET] ? env.sheets[RECVSHEET].__rows.slice(1) : []; }
function lastBindId(env) { const r = recvRowsRaw(env); return r.length ? r[r.length - 1][20] : null; }
// 指令流
(function () {
  const env = mkEnv();
  send(env, '6986\n老人田 高山228 要收款 750');
  check('④1 建立待收款客戶=6986', recvRowsRaw(env)[0][2] === '6986', JSON.stringify(recvRowsRaw(env)[0].slice(0, 8)));
  const a = send(env, '#6986收款 阿良');
  check('④2 #6986收款 阿良 → 指定成功', /已指定收款人/.test(a) && /阿良/.test(a), a);
  check('④3 收款人欄=阿良、狀態收款中', recvRowsRaw(env)[0][9] === '阿良', JSON.stringify(recvRowsRaw(env)[0].slice(0, 11)));
  const s = send(env, '#6986');
  check('④4 #6986 → 狀態收款中', /收款中/.test(s) && /阿良/.test(s), s.slice(0, 80));
  const u = send(env, '#未收');
  check('④5 #未收 → 列出含掛天數', /未完款清單/.test(u) && /6986/.test(u) && /掛 0 天/.test(u), u.slice(0, 100));
  const c = send(env, '#已收 6986');
  check('④6 #已收 6986 → 完款結案', /已收款結案/.test(c), c);
  check('④7 完款保留收款人阿良＋記完款時間', recvRowsRaw(env)[0][9] === '阿良' && !!recvRowsRaw(env)[0][19], JSON.stringify(recvRowsRaw(env)[0].slice(7, 20)));
  const s2 = send(env, '#6986');
  check('④8 完款後 #6986 → 已完款', /已完款/.test(s2), s2.slice(0, 80));
  check('④9 完款後 #未收 → 無', /沒有未完款/.test(send(env, '#未收')), '');
})();
(function () {
  const env = mkEnv();
  send(env, '7001\n甲 蘋果 要收款 100'); send(env, '7001\n乙 香蕉 要收款 200');
  const r = send(env, '#7001收款 阿良');
  check('④10 多張未完款 → 列清單讓選', /有 2 張未完款/.test(r) && /R0001/.test(r) && /R0002/.test(r), r.slice(0, 100));
})();
(function () {
  const env = mkEnv();
  check('④11 單號不存在 → 提示', /查無/.test(send(env, '#9999收款 阿良')), '');
})();
// 回覆綁定
(function () {
  const env = mkEnv();
  env.scriptProps.setProperty('NAME_U_ALLY', '阿良'); env.scriptProps.setProperty('NAME_U_BOB', '小明');
  send(env, '6986\n老人田 高山228 要收款 750');
  const bid = lastBindId(env);
  check('④12 建立待收款有記綁定訊息ID', !!bid, String(bid));
  const b1 = sendU(env, '我收', 'U_ALLY', bid);
  check('④13 回覆綁定(無收款人)→ 由阿良收款', /由 阿良 收款/.test(b1), b1);
  check('④14 收款人欄綁定=阿良＋ID', recvRowsRaw(env)[0][9] === '阿良' && recvRowsRaw(env)[0][18] === 'U_ALLY', JSON.stringify(recvRowsRaw(env)[0].slice(9, 19)));
  const b2 = sendU(env, '+1', 'U_BOB', bid);
  check('④15 他人回覆 → 提示改人', /已由 阿良 收款中，要改為你嗎/.test(b2), b2);
  check('④16 提示改人 → 未動帳(仍阿良)', recvRowsRaw(env)[0][9] === '阿良', recvRowsRaw(env)[0][9]);
  const b3 = sendU(env, '確認', 'U_BOB', bid);
  check('④17 回確認 → 改由小明收款', /已改由 小明 收款/.test(b3) && recvRowsRaw(env)[0][9] === '小明', b3);
})();
(function () {
  const env = mkEnv();
  send(env, '6986\n老人田 高山228 要收款 750');
  const bid = lastBindId(env);
  send(env, '#已收 6986');   // 先完款
  const b = sendU(env, '我收', 'U_ALLY', bid);
  check('④18 引用已結案單 → 提示已結案', /已結案/.test(b), b);
})();
(function () {
  const env = mkEnv();
  // 引用「非待收款」訊息 → 維持唯讀，不綁定、不寫入
  send(env, '6986\n老人田 高山228 要收款 750');
  const before = JSON.stringify(recvRowsRaw(env));
  const b = sendU(env, '我收', 'U_ALLY', 'SOME_OTHER_MSG_ID');
  check('④19 引用非待收款訊息 → 唯讀不綁定', b === '' && JSON.stringify(recvRowsRaw(env)) === before, JSON.stringify(b));
})();

/* ---------- 報告 ---------- */
console.log('\n========== v3.4（去貨主名 + #備註 + 收款流程）回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
