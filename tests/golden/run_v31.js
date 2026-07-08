'use strict';
/* v3.1 修正回歸測試（整合級，驅動 handleEvent）
 * ---------------------------------------------------------------------------
 *  ① 收款人指定（收款人 名字／收款人 R編號 名字；換行版）
 *  ② #已收／#取消收款 免空格＋空指令教學
 *  ③ 鐵架代號制（出庫配代號、a*2收回/多筆/全收、超收封頂、查無警示、#鐵架轉代號、新舊混用、英文閒聊不誤觸）
 *  ④ 回歸：自動建待收款、#待收款、寄運、寄冰、打卡、收台不觸發收款
 * 跑法：node tests/golden/run_v31.js（任一 FAIL → exit 1）
 */
const { createEnv } = require('./harness');
const OWNER = 'U_OWNER', G = 'G_ADMIN';
const RACK = '鐵架庫存', RECV = '待收款';
let fails = 0; const out = []; let msgSeq = 0;
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function mkEnv() { const env = createEnv(); env.scriptProps.setProperty('OWNER_USER_ID', OWNER); env.scriptProps.setProperty('ADMIN_GROUP_IDS', G); return env; }
function send(env, text) {
  const before = env.urlFetchCalls.length;
  const ev = { type: 'message', replyToken: 'RT', message: { type: 'text', text: text, id: 'M' + (++msgSeq) }, source: { groupId: G, userId: OWNER } };
  let err = null; try { env.fns.handleEvent(ev); } catch (e) { err = String(e && e.message || e); }
  const reply = env.urlFetchCalls.slice(before).filter(function (c) { return /\/message\/reply/.test(c.url); })
    .map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('\n'); } catch (e) { return ''; } }).join(' || ');
  return { reply: reply, err: err };
}
function rackRows(env) { return env.sheets[RACK] ? env.sheets[RACK].__rows.slice(1) : []; }
function outTotal(env) { const m = send(env, '查鐵架').reply.match(/在外面共\s*(\d+)\s*支/); return m ? parseInt(m[1], 10) : 0; }

/* ==================== ① 收款人指定 ==================== */
(function () {
  const env = mkEnv();
  const c = send(env, '6986 老人田 高山228 特 8件 要收款 6800');
  check('①0 自動建立待收款', /已建立待收款/.test(c.reply), c.reply);
  const a = send(env, '收款人 林義祥');
  check('①1 收款人 林義祥 → 指定成功', /已指定收款人/.test(a.reply) && /林義祥/.test(a.reply), a.reply);
  check('①1b 不再回「讀不到金額」', !/讀不到金額/.test(a.reply), a.reply);
  const q = send(env, '#待收款');
  check('①1c #待收款 顯示收款人 林義祥', /收款人 林義祥/.test(q.reply), q.reply);
})();
(function () {
  const env = mkEnv();
  send(env, '6986 老人田 高山228 要收款 6800');
  const a = send(env, '收款人\n林義祥');   // 換行版
  check('①2 換行「收款人⏎林義祥」也指定成功', /已指定收款人/.test(a.reply) && /林義祥/.test(a.reply), a.reply);
})();
(function () {
  const env = mkEnv();
  send(env, '6986 老人田 高山228 要收款 6800');   // R0001
  const a = send(env, '收款人 R0001 阿明');
  check('①3 收款人 R0001 阿明 → 指定該筆', /已指定收款人/.test(a.reply) && /R0001/.test(a.reply) && /阿明/.test(a.reply), a.reply);
})();

/* ==================== ② #已收／#取消收款 免空格＋空指令教學 ==================== */
(function () {
  const env = mkEnv();
  send(env, '6986 老人田 高山228 要收款 6800');        // R0001
  send(env, '7001 阿華 蘋果 要收款 500');              // R0002
  send(env, '7002 小強 香蕉 要收款 300');              // R0003
  const cancel = send(env, '#取消收款R0003');
  check('②1 #取消收款R0003（無空格）→ 成功', /已取消收款/.test(cancel.reply) && /R0003/.test(cancel.reply), cancel.reply);
  const close = send(env, '#已收R0001');
  check('②2 #已收R0001（無空格）→ 成功', /已收款結案/.test(close.reply) && /R0001/.test(close.reply), close.reply);
  const t1 = send(env, '#已收');
  check('②3 #已收（無參數）→ 格式教學，不誤入收款偵測', /格式：#已收/.test(t1.reply) && !/讀不到金額/.test(t1.reply), t1.reply);
  const t2 = send(env, '#取消收款');
  check('②4 #取消收款（無參數）→ 格式教學', /格式：#已收/.test(t2.reply) && !/讀不到金額/.test(t2.reply), t2.reply);
})();

/* ==================== ③ 鐵架代號制 ==================== */
// 出庫配代號（三種格式）
(function () {
  const env = mkEnv();
  const r = send(env, '陳記 勝山鐵架*2');   // 單行 inline
  check('③1 單行出鐵架 → 回覆帶代號 [A]', /\[A\]/.test(r.reply) && /出鐵架/.test(r.reply), r.reply);
  const r2 = send(env, '陳記 旭陽鐵架*3');
  check('③2 第二筆出庫 → 代號 [B]', /\[B\]/.test(r2.reply), r2.reply);
})();
(function () {
  const env = mkEnv();
  const r = send(env, '中原食品\n旭陽鐵架*5\n勝山鐵架*1');   // 多行單
  check('③3 多行出鐵架 → 帶代號 [A][B]', /\[A\]/.test(r.reply) && /\[B\]/.test(r.reply), r.reply);
})();
(function () {
  const env = mkEnv();
  const r = send(env, '大買家\n(旭陽鐵架*2 勝山鐵架*1)');   // 括號單
  check('③4 括號出鐵架 → 帶代號', /\[A\]/.test(r.reply), r.reply);
})();
// 收回：a*2收回 / A×2 收回 / a*2 b*3收回 / a收回
(function () {
  const env = mkEnv();
  send(env, '陳記 勝山鐵架*2');   // A×2
  const r = send(env, 'a*2收回');
  check('③5 a*2收回 → 收回2、剩0', /\[A\]/.test(r.reply) && /收回 2/.test(r.reply) && /剩 0/.test(r.reply), r.reply);
})();
(function () {
  const env = mkEnv();
  send(env, '陳記 勝山鐵架*2');
  const r = send(env, 'A×2 收回');   // 大寫＋×＋空格
  check('③6 A×2 收回（大寫/×）→ 收回2', /收回 2/.test(r.reply), r.reply);
})();
(function () {
  const env = mkEnv();
  send(env, '陳記 勝山鐵架*2');   // A
  send(env, '陳記 旭陽鐵架*3');   // B
  const r = send(env, 'a*2 b*3收回');   // 多筆
  check('③7 a*2 b*3收回 → 兩代號各收', /\[A\]/.test(r.reply) && /\[B\]/.test(r.reply) && /收回 2/.test(r.reply) && /收回 3/.test(r.reply), r.reply);
})();
(function () {
  const env = mkEnv();
  send(env, '陳記 勝山鐵架*2');
  const r = send(env, 'a收回');   // 全收
  check('③8 a收回（全收）→ 收回2、剩0', /收回 2/.test(r.reply) && /剩 0/.test(r.reply), r.reply);
})();
// 超收封頂
(function () {
  const env = mkEnv();
  send(env, '陳記 勝山鐵架*2');
  const r = send(env, 'a*5收回');
  check('③9 超收 a*5（僅2）→ 只收2並警示', /只收 2/.test(r.reply) && /剩 0/.test(r.reply), r.reply);
})();
// 查無代號
(function () {
  const env = mkEnv();
  const r = send(env, 'z*2收回');
  check('③10 z*2收回（不存在）→ 警示查無', /查無未收回/.test(r.reply), r.reply);
})();
// #鐵架轉代號：舊制未收回配代號、總數不變
(function () {
  const env = mkEnv();
  send(env, '查鐵架');   // 觸發建表
  const rs = env.sheets[RACK];
  rs.__rows.push(['2026/07/01 09:00', '', '出庫', '勝山鐵架77', 3, '祐昌']);   // 舊制未收回（無代號）
  rs.__rows.push(['2026/07/01 09:00', '', '出庫', '旭陽鐵架', 2, '陳記']);
  const beforeTotal = outTotal(env);
  const mig = send(env, '#鐵架轉代號');
  check('③11 #鐵架轉代號 → 配發代號', /配發代號/.test(mig.reply) && /\[A\]/.test(mig.reply), mig.reply);
  const afterQ = send(env, '查鐵架');
  check('③11b 轉代號後 查鐵架 顯示 [代號]', /\[A\]/.test(afterQ.reply), afterQ.reply);
  check('③11c 轉換前後在外面總數不變', outTotal(env) === beforeTotal && beforeTotal === 5, 'before=' + beforeTotal + ' after=' + outTotal(env));
})();
// 新舊混用：代號出庫後用舊名稱方式收回 → 總數仍正確
(function () {
  const env = mkEnv();
  send(env, '陳記 勝山鐵架*2');   // 代號 A × 2
  check('③12 混用前總數=2', outTotal(env) === 2, String(outTotal(env)));
  send(env, '陳記\n收\n勝山鐵架*1');   // 舊名稱方式收回 1
  check('③12b 舊名稱收回後總數=1（rackNet 抵扣）', outTotal(env) === 1, String(outTotal(env)));
})();
// 英文閒聊不誤觸
(function () {
  const env = mkEnv();
  const r1 = send(env, 'ok 收到');
  check('③13 「ok 收到」不觸發代號收回、不誤回警示', !/收鐵架/.test(r1.reply) && !/查無未收回/.test(r1.reply), r1.reply);
  check('③13b 「ok 收到」無鐵架寫入', rackRows(env).length === 0, JSON.stringify(rackRows(env)));
  const r2 = send(env, 'hello');
  check('③13c 「hello」不觸發鐵架', !/收鐵架|出鐵架/.test(r2.reply) && rackRows(env).length === 0, r2.reply);
})();

/* ==================== ④ 回歸：既有行為不變 ==================== */
(function () {
  const env = mkEnv();
  const rc = send(env, '6986 老人田 高山228 特 8件 要收款 6800');
  check('④1 6986 老人田…要收款6800 → 自動建立待收款', /已建立待收款/.test(rc.reply), rc.reply);
  const q = send(env, '#待收款');
  check('④2 #待收款 顯示清單', /未收款清單/.test(q.reply) && /6800/.test(q.reply), q.reply);
  const ship = send(env, '陳老闆\n高麗菜 中 20件 寄旭陽');
  check('④3 寄運單 → 建立寄運', /已記錄寄運資料/.test(ship.reply) && env.sheets['寄運資料'] && env.sheets['寄運資料'].__rows.length === 2, ship.reply);
  const ice = send(env, '寄冰 阿明 高麗菜 5');
  check('④4 寄冰 → 冰庫寄存寫入', env.sheets['冰庫寄存'] && env.sheets['冰庫寄存'].__rows.length >= 2, ice.reply);
  const punch = send(env, '小華 上班');
  check('④5 打卡上班 → 出勤寫入', /已登記/.test(punch.reply) && env.sheets['出勤打卡'] && env.sheets['出勤打卡'].__rows.length === 2, punch.reply);
  const collect = send(env, '收台回來');
  check('④6 收台回來 → 不觸發收款（無新待收款）', !/已建立待收款|讀不到金額/.test(collect.reply), collect.reply);
})();

/* ---------- 報告 ---------- */
console.log('\n========== v3.1 修正回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
