/****************************************************************************************
 * LINE 生意小幫手 v23 核心版（群組權限 + 指令防誤判 + 冰庫/台子/出貨/鐵架修正）
 * 由你的現有底稿整合而成。部署前請先備份現有版本。
 ****************************************************************************************/

/* ========================== 【設定區】 ========================== */
const SHEET_ID = '1sNavT273oD5hWdlADLscSExDcxbpcXvTGA_e-31CbuA';
const SHEET_FINANCE = '財務改價';
const SHEET_RACK     = '鐵架庫存';
const SHEET_TAIZI    = '台子庫存';
const SHEET_ATTEND   = '出勤打卡';
const SHEET_FREEZER  = '冰庫寄存';
const SHEET_MSG      = '群組訊息';
const SHEET_SHIP     = '寄運資料';
const SHEET_STOCK    = '冰庫總量';
const SHEET_PARK     = '客戶資訊';
const SHEET_HIRE     = '入職時間';
const SHEET_LOAN     = '員工借支';
const SHEET_RETURN   = '退貨紀錄';
const SHEET_TARE     = '空車重量';
const SHEET_DUTY     = '外勤補貼';
const SHEET_RECEIVABLE = '待收款';   // Task4 收款/未收款（含軟刪除稽核）
// 版本識別：交付部署前務必更新 BOT_VERSION / BOT_BUILD(最後 commit 短hash) / BOT_DATE（見 DECISIONS 開發紀律）
var BOT_VERSION = 'v3.0';
var BOT_BUILD = '19a0757';
var BOT_DATE = '2026/07/07';
function versionMessage() {
  return '📦 卡比集機器人 ' + BOT_VERSION + ' (' + BOT_BUILD + ') ' + BOT_DATE + '\n本輪重點修復：\n' +
    '【意圖判斷層】收台≠收款、聊天/填充詞不建寄運、引用(Line Quote)訊息唯讀\n' +
    '【群組權限】市場群唯讀、# 設定限老闆、#註冊老闆防搶注＋#轉移老闆\n' +
    '【收款/待收款】新模組：偵測建立→#已收→#取消收款(軟刪除留Log)；清單顯 R 編號、多筆命中需指定\n' +
    '【出勤】別名合併(良=阿良、宏欸4:07=宏欸)；出勤統計/綜合評比 新簡表＋明細版\n' +
    '【冰庫】查詢結果貼回可直接加「出N/修改N/取消」執行；純貼回仍防呆不寫入\n' +
    '【寄運定義收緊】只有「寄X物流指定」或「客戶在物流客戶名單」才記寄運；指示句/物流商不當客戶(fail-closed)\n' +
    '【安全】事件去重、高危操作 fail-closed 限老闆\n' +
    '【安靜模式】改為分群獨立：#安靜／#取消安靜 僅本群組；老闆 #全部安靜／#全部取消安靜 管全部；安靜時「無法判斷指令」提示靜默(功能回覆與寫入不受影響)\n' +
    '【每日備份】dailyBackup(零新增權限)：用試算表 copy 每日 23:30 複製整份試算表到雲端硬碟(檔名含日期)；不自動刪，每週提醒手動整理(留14份)。需部署後執行 setupBackupTrigger 啟用一次\n' +
    '你看到這行＝最新程式已生效（對照上方版本＋hash 即可確認是否新版）。';
}
const FONT_SIZE = 18;

const PROPS = PropertiesService.getScriptProperties();
const CHANNEL_ACCESS_TOKEN = PROPS.getProperty('CHANNEL_ACCESS_TOKEN');

/* ========================== 【主程式】 ========================== */
function doPost(e) {
  NAME_FETCH_COUNT = 0;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'no-data' })).setMimeType(ContentService.MimeType.JSON);
    }
    const body = JSON.parse(e.postData.contents);
    (body.events || []).forEach(function (ev) {
      try {
        // Task8 事件去重：LINE 重送 / 同一 message.id 重複 → 跳過，避免重複寫入
        if (ev && ev.deliveryContext && ev.deliveryContext.isRedelivery) return;
        if (ev && ev.message && ev.message.id) {
          const _c = CacheService.getScriptCache(); const _k = 'evt_' + ev.message.id;
          if (_c.get(_k)) return;
          _c.put(_k, '1', 21600);   // 6 小時
        }
        handleEvent(ev);
      }
      catch (e2) {
        if (String(e2 && e2.message || e2).indexOf('BUSY') !== -1) { try { if (ev && ev.replyToken) replyToLine(ev.replyToken, '⚠️ 系統忙碌，請稍後再試。'); } catch (e3) { } }
        else { console.error('handleEvent 錯誤：' + e2); }
      }
    });
  } catch (err) { console.error('doPost 錯誤：' + err); }
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

var __REQ_CACHE = {};
function handleEvent(event) {
  __REQ_CACHE = {};   // 效能：每則事件清空 request 快取（同事件內同表只掃一次；輸出不變）
  if (event.type !== 'message') return;
  const source = event.source;
  if (event.message.type !== 'text') {
    const ph = { sticker: '[貼圖]', image: '[圖片]', video: '[影片]', audio: '[語音]', file: '[檔案]', location: '[位置]' }[event.message.type] || '[其他]';
    logGroupMessage(ph, source.userId, source.groupId || source.roomId);
    return;
  }
  const text = (event.message.text || '').trim();
  const replyToken = event.replyToken;
  const chatId = source.groupId || source.roomId || source.userId;
  const isQuote = !!(event.message && event.message.quotedMessageId);   // 引用(Line Quote)訊息 → 只能當參考

  // # 控制指令（任何群組都能用）
  if (text === '#註冊老闆') {
    const cur = PROPS.getProperty('OWNER_USER_ID');
    if (cur && cur !== source.userId) { replyToLine(replyToken, '🔒 已有老闆註冊，無法搶注。若要轉移，請由現任老闆打「#轉移老闆 確定」後，新人再打「#註冊老闆」。'); return; }
    PROPS.setProperty('OWNER_USER_ID', source.userId); replyToLine(replyToken, '✅ 老闆身分註冊成功！'); return;
  }
  if (/^#轉移老闆/.test(text)) {
    if (!isAdmin(source.userId)) { replyToLine(replyToken, '🔒 僅限現任老闆轉移。'); return; }
    if (!/確定/.test(text)) { replyToLine(replyToken, '⚠️ 這會解除你的老闆身分，改由下一位打「#註冊老闆」接手。\n確定請打：#轉移老闆 確定'); return; }
    PROPS.deleteProperty('OWNER_USER_ID'); replyToLine(replyToken, '✅ 已解除老闆身分。請下一位在本群打「#註冊老闆」完成接手。'); return;
  }
  if (text === '#我的ID') { replyToLine(replyToken, '你的 userId：\n' + source.userId); return; }
  if (/^(指令表|指令|總指令|指令大全|指令查詢|查指令|幫助|#指令表|#指令|#幫助|功能表)\s*$/.test(text)) { replyToLine(replyToken, commandSheet()); return; }
  if (/^#(匯入預設客戶資訊|匯入客戶資訊|預設客戶資訊|匯入停車資訊|匯入停車)\s*$/.test(text)) { if (!ownerGate(source, replyToken)) return; const r = seedParking(); replyToLine(replyToken, '🅿️ 已匯入預設客戶資訊 ' + r.count + ' 筆：\n' + r.keys.join('、') + '\n\n打「查鳳山雅君」或「客戶停車位置查詢」試試。'); return; }
  if (/^#清理訊息紀錄/.test(text)) {
    if (!ownerGate(source, replyToken)) return;
    const sheet = getSheet(SHEET_MSG); const last = sheet.getLastRow();
    if (last > 2001) { sheet.deleteRows(2, last - 2001); replyToLine(replyToken, '🧹 已清理舊訊息紀錄，只保留最近 2000 則。'); }
    else replyToLine(replyToken, '訊息紀錄目前只有 ' + Math.max(0, last - 1) + ' 則，不需要清理。');
    return;
  }
  if (text === '#版本') { replyToLine(replyToken, versionMessage()); return; }
  if (text === '#設定工作群組') { if (!ownerGate(source, replyToken)) return; addWorkGroup(chatId); replyToLine(replyToken, '✅ 已把「這個群組」設為工作群組。\n目前工作群組數：' + getWorkGroups().length); return; }
  if (text === '#取消工作群組') { if (!ownerGate(source, replyToken)) return; removeWorkGroup(chatId); replyToLine(replyToken, '已把這個群組移出工作群組。\n目前工作群組數：' + getWorkGroups().length); return; }
  // ★ 群組權限設定（老闆限定）
  if (text === '#群組ID') { replyToLine(replyToken, '本群組 ID：\n' + chatId + '\n權限：' + getPerm(chatId).type + (getPerm(chatId).canWrite ? '（可寫入）' : '（唯讀）')); return; }
  if (text === '#設為管理群組') { if (!isAdmin(source.userId)) { replyToLine(replyToken, '🔒 僅限老闆。'); return; } addGroupId('ADMIN_GROUP_IDS', chatId); removeGroupId('MARKET_GROUP_IDS', chatId); replyToLine(replyToken, '✅ 已設為內部管理群組(可寫入)。'); return; }
  if (text === '#移除管理群組') { if (!isAdmin(source.userId)) { replyToLine(replyToken, '🔒 僅限老闆。'); return; } removeGroupId('ADMIN_GROUP_IDS', chatId); replyToLine(replyToken, '已移出管理群組(回到唯讀)。'); return; }
  if (text === '#設為市場群組') { if (!isAdmin(source.userId)) { replyToLine(replyToken, '🔒 僅限老闆。'); return; } addGroupId('MARKET_GROUP_IDS', chatId); removeGroupId('ADMIN_GROUP_IDS', chatId); replyToLine(replyToken, '✅ 已設為市場群組(唯讀、禁寫入/寄運顯示)。'); return; }
  if (text === '#移除市場群組') { if (!isAdmin(source.userId)) { replyToLine(replyToken, '🔒 僅限老闆。'); return; } removeGroupId('MARKET_GROUP_IDS', chatId); replyToLine(replyToken, '已移出市場群組。'); return; }
  if (text === '#群組權限') { replyToLine(replyToken, '🔐 管理群組：' + (listProp('ADMIN_GROUP_IDS').join('、') || '(無)') + '\n市場群組：' + (listProp('MARKET_GROUP_IDS').join('、') || '(無)') + '\n本群組：' + getPerm(chatId).type); return; }
  if (/^#設定客戶/.test(text)) {
    if (!ownerGate(source, replyToken)) return;
    const name = text.replace(/^#設定客戶/, '').trim();
    if (!name) { replyToLine(replyToken, '請在後面加客戶名稱，例如：\n#設定客戶 溪湖青農合作社-阿漢'); return; }
    setGroupCustomer(chatId, name);
    replyToLine(replyToken, '✅ 已綁定：這個群組 →「' + name + '」');
    return;
  }
  if (text === '#取消客戶') { if (!ownerGate(source, replyToken)) return; removeGroupCustomer(chatId); replyToLine(replyToken, '已取消這個群組的客戶綁定。'); return; }
  if (text === '#查客戶' || text === '#我的客戶') { const c = getGroupCustomer(chatId); replyToLine(replyToken, c ? '這個群組綁定的客戶：' + c : '這個群組還沒綁定客戶。'); return; }
  if (text === '#貨主名單') { const v = getVendors(); replyToLine(replyToken, v.length ? '📋 目前貨主名單：\n' + v.join('、') : '目前沒有貨主。'); return; }
  if (text === '#冰庫名單') { const w = getWarehouses(); replyToLine(replyToken, w.length ? '🧊 目前冰庫名單：\n' + w.join('\n') : '目前沒有冰庫。'); return; }
  if (text === '#清空冰庫名單' || text === '#清除冰庫名單') { if (!ownerGate(source, replyToken)) return; setWarehouses([]); replyToLine(replyToken, '✅ 已清空冰庫名單。'); return; }
  if (/^#新增冰庫/m.test(text)) {
    if (!ownerGate(source, replyToken)) return;
    const added = [];
    text.split('\n').forEach(function (ln) { const m = ln.trim().match(/^#新增冰庫\s*(.+)$/); if (m && m[1].trim()) { addWarehouse(m[1].trim()); added.push(m[1].trim()); } });
    if (!added.length) { replyToLine(replyToken, '請加名稱，例：#新增冰庫 旭陽2號庫'); return; }
    replyToLine(replyToken, '✅ 已新增冰庫：' + added.join('、') + '\n目前名單：\n' + getWarehouses().join('\n')); return;
  }
  if (/^#移除冰庫/m.test(text)) {
    if (!ownerGate(source, replyToken)) return;
    const removed = [];
    text.split('\n').forEach(function (ln) { const m = ln.trim().match(/^#移除冰庫\s*(.+)$/); if (m && m[1].trim()) { removeWarehouse(m[1].trim()); removed.push(m[1].trim()); } });
    replyToLine(replyToken, '✅ 已移除冰庫：' + (removed.join('、') || '（無）') + '\n目前名單：\n' + (getWarehouses().join('\n') || '（無）')); return;
  }
  if (/^#新增貨主/.test(text)) { if (!ownerGate(source, replyToken)) return; const n = text.replace(/^#新增貨主/, '').trim(); if (!n) { replyToLine(replyToken, '請加名稱，例：#新增貨主 旭陽'); return; } addVendor(n); replyToLine(replyToken, '✅ 已新增貨主：' + n + '\n目前名單：' + getVendors().join('、')); return; }
  if (/^#移除貨主/.test(text)) { if (!ownerGate(source, replyToken)) return; const n = text.replace(/^#移除貨主/, '').trim(); removeVendor(n); replyToLine(replyToken, '已移除貨主：' + n + '\n目前名單：' + getVendors().join('、')); return; }
  if (/^#物流客戶/.test(text)) { const c = text.replace(/^#物流客戶/, '').trim() || '旭陽'; const l = getCarrierCustomers(c); replyToLine(replyToken, l.length ? '🚚 ' + c + ' 的客戶名單：\n' + l.join('、') : c + ' 還沒設定客戶名單。'); return; }
  if (/^#設定物流客戶/.test(text)) {
    if (!ownerGate(source, replyToken)) return;
    const rest = text.replace(/^#設定物流客戶/, '').trim().split(/[\s,，、]+/).filter(Boolean);
    if (rest.length < 2) { replyToLine(replyToken, '格式：#設定物流客戶 旭陽 玉美加工廠 玉美供食廠 …'); return; }
    setCarrierCustomers(rest[0], rest.slice(1));
    replyToLine(replyToken, '✅ 已設定 ' + rest[0] + ' 的客戶名單（' + (rest.length - 1) + ' 位）：\n' + rest.slice(1).join('、'));
    return;
  }
  if (text === '#全部安靜') { if (!ownerGate(source, replyToken)) return; PROPS.setProperty('QUIET_ALL', '1'); replyToLine(replyToken, '🤫 已開啟全域安靜模式（所有群組的無法判斷提示皆靜默）。'); return; }
  if (text === '#全部取消安靜') { if (!ownerGate(source, replyToken)) return; PROPS.setProperty('QUIET_ALL', ''); replyToLine(replyToken, '🔊 已關閉全域安靜模式。'); return; }
  if (text === '#安靜') { if (!ownerGate(source, replyToken)) return; addQuietGroup(chatId); replyToLine(replyToken, '🤫 ✅ 本群組已開啟安靜模式。'); return; }
  if (text === '#取消安靜') { if (!ownerGate(source, replyToken)) return; removeQuietGroup(chatId); replyToLine(replyToken, '🔊 本群組已取消安靜模式。'); return; }

  // 一律記錄訊息供搜尋／統整（查詢類指令不記）
  if (!/^(#|中控總覽|中控總攬|今日總覽|今日總攬|總覽|總攬|中控|出外勤|查\s*外勤|外勤補貼|全部外勤|所有外勤|外勤全部|外勤紀錄|外勤記錄|外勤明細|外勤清單|今日送貨|當日送貨|送貨內容|送貨訊息|今日廢話|當日廢話|廢話內容|閒聊內容|今日閒聊|查廢話|發言次數|留言次數|發言統計|留言統計|發言排行|留言排行|誰發言|誰留言|查發言|查留言|客戶資訊|客戶停車|停車地點|停車位置|停車一覽|查詢|查全部停車|查所有停車|查地點|地點代號|地點清單|地點一覽|地址清單|指令表|指令|總指令|指令大全|指令查詢|查指令|幫助|功能表|搜尋|收尋|搜|件數|總件數|統整金額|統計金額|金額統整|統整|統計|冰庫庫存|冰庫總覽|查冰庫|冰庫設定|鐵架庫存|鐵架總覽|查鐵架|鐵架剩餘|查台子|台子總覽|台子剩餘|未收回台子|台子庫存|查改價|改價紀錄|改價查詢|查損耗|損耗紀錄|損耗查詢|查遲到|查請假|查上班|查下班|查員工出勤|查出勤|出勤查詢|出勤紀錄|出勤統計|查出勤統計|綜合評比|獎金評比|員工評比|評比|查\S*評比|今日鐵架|今天鐵架|鐵架記錄|今日冰庫|今天冰庫|冰庫記錄|拉出當日群組訊息|拉出群組訊息|當日群組訊息|今日群組訊息|當日訊息|今日訊息|拉訊息|拉出訊息|今日對話|當日對話)/.test(text)) logGroupMessage(text, source.userId, source.groupId || source.roomId);

  // ★★★ 群組權限閘門（取代舊 isWorkGroup）：市場/未知群組唯讀、禁止任何寫入 ★★★
  const perm = getPerm(chatId);
  if (!perm.canWrite) {
    const cmd = parseCommand(text);
    if (cmd && MARKET_READ[cmd.type]) { const reply = runReadCommand(cmd, chatId); if (reply) replyToLine(replyToken, reply); return; }
    if (looksLikeWrite(text, cmd)) auditDenied(text, source.userId, perm.type);
    return;   // 聊天/非授權查詢/寫入嘗試 → 一律不執行、不回覆
  }
  // ★ 引用(Line Quote)訊息：只能當參考，禁止直接觸發任何 ERP 寫入（P0 安全規則）
  //   —— 引用內容僅允許純查詢指令；其餘一律不執行、不寫入。
  if (isQuote) {
    const qcmd = parseCommand(text);
    if (qcmd && MARKET_READ[qcmd.type]) { const reply = runReadCommand(qcmd, chatId); if (reply) replyToLine(replyToken, reply); }
    return;
  }
  // 管理群組內：明顯閒聊且非合法指令 → 不觸發任何功能
  if (looksLikeChat(text) && !parseCommand(text)) { return; }

  // ★ 冰庫查詢結果被貼回來 — P0：純貼回不寫入；但貼回後在品項行加操作字(出N/修改N/取消)→ 執行對應動作
  if (/^\s*❄/.test(text) || (/冰庫庫存/.test(text) && /【/.test(text))) {
    const hasShip = /[：:]\s*\d+\s*出/.test(text) || /【[^】]*】\s*(?:全部出|全出|出)\s*$/m.test(text);
    const hasEdit = /修改\s*\d+|取消|清除/.test(text);
    if (hasEdit) { const c = handleFreezerCancel(text); if (c.count > 0) { replyToLine(replyToken, c.reply); return; } }
    if (hasShip) { const s = handleFreezerShip(text); if (s.count > 0) { replyToLine(replyToken, s.reply); return; } }
    if (hasShip || hasEdit) { replyToLine(replyToken, '⚠️ 冰庫貼回操作格式不符。出貨：品項：餘額 出N；改量：品項 修改N；取消：品項 取消。'); return; }
    if (!quiet(chatId)) replyToLine(replyToken, '⚠️ 此為冰庫查詢結果，不會寫入資料。');   // 純貼回 → 保留原防呆（非必要提示，尊重安靜）
    return;
  }
  // ★ 寄運查詢結果被貼回來：絕不當新單重記；可直接在單上改件數/包裝、或取消/清除
  if (isShippingPullOutput(text)) {
    // 貼回查詢結果＋「清除 確定」→ 清空全部寄運（限老闆）
    if (/清除/.test(text) && /確定/.test(text)) {
      if (!ownerOnly(source, replyToken, '清除紀錄')) return;
      const n = clearAllShipping(); replyToLine(replyToken, '🗑️ 已清除全部寄運資料，共刪除 ' + n + ' 筆。'); return;
    }
    const out = [];
    const MODRE = /修改|改\s*\d|改\s*(?:包裝|容器)|(?:改|改成|改為|→|➜)\s*[（(]?\s*(?:台子|紙箱|圓籃|袋子|箱)|清備註|清除備註|刪備註|刪除備註|改備註|備註改|取消\s*備註/;
    if (MODRE.test(text)) {                                // 行內直接改件數/包裝/容器/品名
      const m = handleShippingModify(text);
      if (m.count > 0) out.push(m.reply);
    }
    if (/取消|清除/.test(text)) {                          // 整筆/逐項刪除
      const r = cancelShipping(text);
      if (r.count > 0) out.push('🗑️ 已刪除寄運 ' + r.count + ' 筆：\n' + r.summary.join('\n'));
    }
    if (out.length) { replyToLine(replyToken, out.join('\n\n')); return; }
    if (/取消|清除/.test(text) || MODRE.test(text)) {      // 有下編輯字但找不到 → 給正確打法
      replyToLine(replyToken, '⚠️ 找不到對應的寄運資料（品名／數量要跟畫面一致）。\n直接在單上編輯：\n・改件數 → 該行尾加「修改135」(例 進口228 170包 修改135)\n・改容器 → 該行尾加「改圓籃」或「改容器 圓籃」\n・刪單品 → 該行尾加「取消」(例 進口228 170 取消)\n・刪整個客戶 →「【客戶】取消」\n・刪今天全部 →「寄運資料 清除 確定」');
    }
    return;   // 沒下任何編輯字 → 靜默結束、不重記
  }

  /* ---- 員工外勤補貼 ---- */
  if (/外勤補貼/.test(text) && /取消/.test(text) && !/清除|設定/.test(text)) {
    const dc = handleDutyCancel(text);
    if (dc.count > 0) { replyToLine(replyToken, dc.reply); return; }
    // Bug3b：外勤貼回/外勤取消格式不符 → 回外勤取消教學，不得掉到寄運取消路由
    replyToLine(replyToken, '⚠️ 找不到符合的外勤補貼可取消。請用：「員工 外勤補貼 取消」，指定月份用「員工 外勤補貼（2026/06）取消」。');
    return;
  }
  if (/^#設定外勤補貼/.test(text)) { if (!ownerGate(source, replyToken)) return; replyToLine(replyToken, setDutyConfig(text)); return; }
  if (/外勤補貼/.test(text) && /清除/.test(text) && /確定/.test(text)) { const n = clearAllRows(SHEET_DUTY); replyToLine(replyToken, '🗑️ 已清除全部外勤補貼，共 ' + n + ' 筆。'); return; }
  if (/^(查)?\s*(全部外勤|所有外勤|外勤全部|外勤紀錄|外勤記錄|外勤明細|外勤清單)\s*$/.test(text)) { replyToLine(replyToken, dutyAllDetail()); return; }
  if (/^查\s*外勤/.test(text) || /^外勤補貼\s*$/.test(text) || /^(本月|上月|這個?月|當月)外勤\s*$/.test(text) || /^(本月|上月|這個?月|當月)?外勤(補貼|合計)/.test(text)) {
    let marg = ''; if (/上個?月/.test(text)) marg = '上月'; else if (/本月|這個?月|當月/.test(text)) marg = '本月'; else { const mm = text.match(/(\d{4}\/\d{1,2}|\d{1,2}\s*月)/); if (mm) marg = mm[1]; }
    replyToLine(replyToken, dutyAll(marg)); return;
  }
  { const dq = text.match(/^查\s*(\S+?)\s*(?:外勤補貼|外勤|補貼)\s*(.*)$/); if (dq && dq[1].trim() && !/^外勤/.test(dq[1])) { replyToLine(replyToken, dutyQuery(dq[1].trim(), (dq[2] || '').trim())); return; } }
  if (/外勤/.test(text)) { const dr = handleDuty(text); if (dr.count > 0) { replyToLine(replyToken, dr.reply); return; } }

  /* ---- 地點代號 ---- */
  if (/^(查\s*地點|地點代號|地點清單|地點一覽|地址清單)\s*$/.test(text)) { replyToLine(replyToken, placeList()); return; }
  { const dm = text.match(/^(?:刪除|移除)\s*地點\s*(\S+)/); if (dm) { removePlace(dm[1].trim()); replyToLine(replyToken, '已刪除地點代號「' + dm[1].trim() + '」。'); return; } }
  { const qm = text.match(/^查?\s*(\S{1,12}?)\s*地址\s*$/); if (qm) { const p = getPlaces(); const k = qm[1].trim(); if (p[k]) { replyToLine(replyToken, '📍 ' + k + ' ➜ ' + p[k]); return; } } }
  if (/[=＝]/.test(text) && /(路|街|號|段|巷|弄|道|村|里|市|區|鄉|鎮|大樓|工業區|交流道)/.test(text)) { const pr = handlePlaceSet(text); if (pr.count > 0) { replyToLine(replyToken, pr.reply); return; } }

  /* ---- 空車重量 ---- */
  if (/空車重量/.test(text) && /清除/.test(text) && /確定/.test(text)) { const n = clearTare(); replyToLine(replyToken, '🗑️ 已清除全部空車重量，共刪除 ' + n + ' 筆。'); return; }
  if (/空車/.test(text) && /車牌\s*\d+/.test(text) && /(刪除|移除|刪掉)/.test(text)) { const pm = text.match(/車牌\s*(\d+)/); const n = tareDelete(pm[1]); replyToLine(replyToken, n > 0 ? ('🗑️ 已刪除車牌' + pm[1] + ' 的空車重量。') : ('查無車牌' + pm[1] + ' 的空車重量。')); return; }
  if (/車牌\s*\d+/.test(text) && /(修改\s*\d+|[：:]\s*\d+)/.test(text) && !/清除|刪除|移除|刪掉/.test(text)) { const r = handleTarePaste(text); if (r.count > 0) { replyToLine(replyToken, r.reply); return; } }
  if (/車牌\s*\d+\s*空車重量\s*\d+/.test(text)) { const r = tareImport(text); if (r.count > 0) { replyToLine(replyToken, '🚛 已建立/更新空車重量 ' + r.count + ' 筆：\n' + r.entries.map(function (e) { return '・' + (e.name ? e.name + ' ' : '') + '車牌' + e.plate + '：' + e.weight + 'kg'; }).join('\n')); return; } }
  if (/^查\s*空車重量\s*$/.test(text)) { replyToLine(replyToken, tareAll()); return; }
  { const tm = text.match(/^查\s*(?:空車重量)?\s*(?:車牌)?\s*(.+?)\s*(?:空車重量|空車|車重)?\s*$/); if (tm && tm[1].trim() && /空車|車重/.test(text)) { replyToLine(replyToken, tareQuery(tm[1].trim())); return; } }

  if (/^(今日送貨|當日送貨|送貨內容|送貨訊息|今日送貨內容)\s*$/.test(text)) { replyToLine(replyToken, listByKind('送貨', evalGroup(chatId))); return; }
  if (/^(今日廢話|當日廢話|廢話內容|閒聊內容|今日閒聊|查廢話)\s*$/.test(text)) { replyToLine(replyToken, listByKind('廢話', evalGroup(chatId))); return; }

  {
    const mc = text.match(/^(?:查\s*)?(?:發言次數|留言次數|發言統計|留言統計|發言排行|留言排行|誰發言|誰留言)\s*(.*)$/);
    if (mc) { const dm = (mc[1] || '').match(/(?:\d{4}\/)?\d{1,2}\/\d{1,2}/); replyToLine(replyToken, messageCount(dm ? dm[0] : '', evalGroup(chatId))); return; }
  }

  if (/^(查入職|入職查詢|員工入職|員工入職查詢|入職紀錄|入職記錄|入職時間)\s*$/.test(text)) { replyToLine(replyToken, hireQuery('')); return; }
  { const hq = text.match(/^查\s*詢?\s*(.+?)\s*入職(?:時間|紀錄|記錄)?\s*$/); if (hq && hq[1].trim()) { replyToLine(replyToken, hireQuery(hq[1].trim())); return; } }
  { const ldm = text.match(/^(?:查\s*)?借支(?:明細|清單|全部)\s*(.*)$/) || text.match(/^查\s*全部借支\s*$/); if (ldm) { const nm = (ldm[1] || '').trim(); replyToLine(replyToken, nm ? loanQuery(nm) : loanDetailAll()); return; } }
  if (/^(查借支|借支查詢|員工借支|員工借支查詢|借支紀錄|借支記錄|查未還|未還查詢)\s*$/.test(text)) { replyToLine(replyToken, loanQuery('')); return; }
  { const lq = text.match(/^查\s*詢?\s*(.+?)\s*借支(?:明細|紀錄|記錄)?\s*$/); if (lq && lq[1].trim()) { replyToLine(replyToken, loanQuery(lq[1].trim())); return; } }
  if (/^(查退貨|退貨查詢|退貨紀錄|退貨記錄|今日退貨|當日退貨)\s*$/.test(text)) { replyToLine(replyToken, returnQuery('')); return; }
  { const rq = text.match(/^查\s*詢?\s*(.+?)\s*退貨(?:紀錄|記錄)?\s*$/); if (rq && rq[1].trim()) { replyToLine(replyToken, returnQuery(rq[1].trim())); return; } }

  {
    const pk = text.match(/^查\s*詢?\s*(.+?)\s*(?:的)?\s*(停車位置|停車地點|停車場|停車|車牌|位置|資訊)\s*$/);
    if (pk && pk[1].trim()) {
      const nm = pk[1].trim();
      if (/^(停車位置|停車地點|停車場|停車|車牌|位置|資訊|客戶資訊|客戶)$/.test(nm)) { replyToLine(replyToken, parkingAll()); return; }
      if (!/庫存|台子|冰庫|鐵架|改價|損耗|出勤|員工|遲到|請假|上班|下班|貨主|物流|訊息|對話|金額|件數/.test(nm)) { replyToLine(replyToken, parkingQuery(nm)); return; }
    }
  }

  /* ---- 搜尋統整（嚴格：單一品名、無聊天語、去掉「查詢」別名）---- */
  { let _sm = text.match(/^(搜尋|收尋|搜)\s*(\S{1,16})$/); if (_sm && !CHAT_RE.test(_sm[2]) && !/[，。！？、]/.test(_sm[2])) { replyToLine(replyToken, searchToday(_sm[2].trim())); return; } }

  {
    const names = [];
    text.split('\n').forEach(function (l) { const d = extractDate(l.trim()); const m = d.rest.match(/^([^\s查搜#].*?)\s*入職\s*$/); if (m && m[1].trim()) names.push({ name: m[1].trim(), when: d.when }); });
    if (names.length) {
      const out = names.map(function (x) { const r = recordHire(x.name, x.when); return r.exists ? ('📅 ' + x.name + ' 已有入職記錄：' + r.time) : ('📅 已記錄 ' + x.name + ' 入職時間：\n' + r.time); });
      replyToLine(replyToken, out.join('\n')); return;
    }
  }

  {
    const recs = [];
    text.split('\n').forEach(function (l) {
      const d = extractDate(l.trim()); const s = d.rest;
      let m = s.match(/^([^\s查搜#]\S*?)\s*借\s*(?:支|款)?\s*(\d+)/); if (m) { recs.push({ name: m[1], type: '借', amt: parseInt(m[2], 10), when: d.when }); return; }
      m = s.match(/^([^\s查搜#]\S*?)\s*還\s*(?:款)?\s*(\d+)/); if (m) { recs.push({ name: m[1], type: '還', amt: parseInt(m[2], 10), when: d.when }); }
    });
    // Task9：借支寫入前過 isValidEmpName——非員工（代名詞/純數字/未知名如「旭陽」）一律不寫入。
    const validRecs = recs.filter(function (r) { return isValidEmpName(r.name); });
    if (validRecs.length) {
      validRecs.forEach(function (r) { recordLoan(r.name, r.type, r.amt, r.when); });
      const out = validRecs.map(function (r) { const q = loanQuery(r.name); const net = q.match(/未還：(-?\d+)/); return '💵 ' + (r.when ? r.when.slice(0, 10).replace(/^\d{4}\//, '') + ' ' : '') + normalizeEmployeeName(r.name) + ' ' + r.type + ' ' + r.amt + ' 元' + (net ? '（未還共 ' + net[1] + ' 元）' : ''); });
      replyToLine(replyToken, out.join('\n')); return;
    } else if (recs.length) {
      if (!quiet(chatId)) replyToLine(replyToken, '⚠️ 無法判斷指令，請使用指定格式（打「指令表」查看）。'); return;   // 看似借支但無合法員工名 → fail-closed（提示尊重安靜，不寫入不變）
    }
  }

  if (/^(客戶資訊|客戶停車|停車地點|停車位置一覽)/.test(text) && text.split('\n').length >= 2) {
    const pr = parkingImport(text);
    if (pr.count > 0) { replyToLine(replyToken, '🅿️ 已匯入客戶資訊 ' + pr.count + ' 筆：\n' + pr.keys.join('、')); return; }
  }
  if (/^(客戶停車位置查詢|客戶停車位置|客戶資訊總覽|客戶資訊一覽|停車位置總覽|停車一覽|客戶停車總覽|查所有停車|查全部停車)\s*$/.test(text)) { replyToLine(replyToken, parkingAll()); return; }
  {
    const pm = text.match(/^查\s*詢?\s*(.+?)\s*(?:的)?\s*(停車位置|停車地點|停車|車牌|位置|資訊)?\s*$/);
    if (pm && pm[1].trim()) {
      const nm = pm[1].trim();
      if (/^(停車位置|停車地點|停車場|停車|車牌|位置|資訊|客戶資訊|客戶)$/.test(nm)) { replyToLine(replyToken, parkingAll()); return; }
      const blocked = /庫存|台子|冰庫|鐵架|改價|損耗|出勤|員工|遲到|請假|上班|下班|貨主|物流|訊息|對話|金額|件數/.test(nm);
      if (!blocked) {
        if (pm[2]) { replyToLine(replyToken, parkingQuery(nm)); return; }
        const pl = parkingLatest();
        if (pl.order.some(function (k) { return norm(k) === norm(nm) || norm(k).indexOf(norm(nm)) !== -1 || norm(nm).indexOf(norm(k)) !== -1; })) { replyToLine(replyToken, parkingQuery(nm)); return; }
      }
    }
  }

  if (/^查冰庫總庫存\s*表?\s*$/.test(text)) { replyToLine(replyToken, stockTotalView()); return; }
  { const stm = text.match(/^查\s*(.+?)\s*庫存表\s*$/); if (stm && stm[1].trim()) { replyToLine(replyToken, stockTable(stm[1].trim())); return; } }

  if (/【\s*.+?\s*】\s*庫存/.test(text) && !/庫存總覽/.test(text)) {
    const pr = handleStockPaste(text);
    if (pr.count > 0) { replyToLine(replyToken, pr.reply); return; }
  }

  let im = text.match(/^(冰庫庫存|冰庫總覽|查冰庫)\s*(.*)$/);
  if (im) { replyToLine(replyToken, freezerOverview(im[2].trim())); return; }

  /* ---- 修改冰庫庫存（設定某客戶各品項數量；單行/客戶每行/客戶共用皆可）---- */
  if (/^(修改庫存|冰庫修改|修改冰庫庫存|冰庫修改庫存)(\s|$)/.test(text.split('\n')[0].trim())) {
    const fe = handleFreezerEdit(text);
    if (fe.count > 0) { replyToLine(replyToken, fe.reply); return; }
    replyToLine(replyToken, '⚠️ 修改庫存格式：\n・單筆：修改庫存 客戶 品名 等級 數量\n　例：修改庫存 3088 高山初秋 中 2\n・多筆（每行一個）：\n　修改庫存\n　3088 高山初秋 中 2\n　陳記蔬菜行 高山228 特 40\n・同一客戶多品項：\n　修改庫存\n　3088\n　高山初秋 中 2\n　高山228 特 122');
    return;
  }

  let dm = text.match(/^冰庫設定\s*(.+)$/);
  if (dm) {
    const parts = dm[1].trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2 || !/^\d+$/.test(parts[parts.length - 1])) {
      replyToLine(replyToken, '格式：冰庫設定 客戶 品名 數量\n例如：冰庫設定 3088 高山228中 10');
    } else {
      const amount = parseInt(parts[parts.length - 1], 10);
      const customer = parts[0];
      const product = parts.slice(1, parts.length - 1).join(' ');
      setFreezer(customer, product, amount);
      replyToLine(replyToken, '✅ 已校正冰庫：' + customer + (product ? ' ' + product : '') + ' → 設為 ' + amount);
    }
    return;
  }

  {
    const fl = text.split('\n')[0].trim();
    if (matchWarehouse(fl)) {
      const sr = handleStockSet(text, '');
      if (sr.count > 0) { replyToLine(replyToken, sr.reply); return; }
    }
  }

  if (/^(拉出當日群組訊息|拉出群組訊息|當日群組訊息|今日群組訊息|當日訊息|今日訊息|拉訊息|拉出訊息|今日對話|當日對話)\s*$/.test(text)) { replyToLine(replyToken, dailyMessages(evalGroup(chatId))); return; }

  if (/^(鐵架庫存|鐵架總覽|查鐵架|鐵架剩餘|未收回鐵架)\s*$/.test(text)) { replyToLine(replyToken, rackOutstanding()); return; }
  {
    const rcm = text.match(/^查\s*(.+?)\s*鐵架\s*$/) || text.match(/^(?:查鐵架|鐵架)\s+(.+)$/);
    if (rcm && rcm[1].trim()) { replyToLine(replyToken, rackOutstanding(rcm[1].trim())); return; }
  }

  if (/^(查台子|台子總覽|台子剩餘|未收回台子|台子庫存)\s*$/.test(text)) { replyToLine(replyToken, taiziOutstanding()); return; }

  if (/^(今日鐵架|今天鐵架|鐵架記錄)\s*$/.test(text)) { replyToLine(replyToken, todayLog(SHEET_RACK)); return; }
  if (/^(今日冰庫|今天冰庫|冰庫記錄)\s*$/.test(text)) { replyToLine(replyToken, todayLog(SHEET_FREEZER)); return; }

  if (/^台子\s*清除/.test(text.split('\n')[0].trim())) {
    if (!ownerOnly(source, replyToken, '清除紀錄')) return;
    if (/確定/.test(text)) { const n = clearAllRows(SHEET_TAIZI); replyToLine(replyToken, '🗑️ 已清除全部台子庫存，共刪除 ' + n + ' 筆。'); }
    else { const n = Math.max(0, getSheet(SHEET_TAIZI).getLastRow() - 1); replyToLine(replyToken, '⚠️ 確定要清除全部台子庫存共 ' + n + ' 筆嗎？\n確定請打：台子 清除 確定'); }
    return;
  }
  if (/^寄運(?:資料)?\s*清除/.test(text.split('\n')[0].trim())) {
    if (!ownerOnly(source, replyToken, '清除紀錄')) return;
    if (/確定/.test(text)) { const n = clearAllShipping(); replyToLine(replyToken, '🗑️ 已清除全部寄運資料，共刪除 ' + n + ' 筆。'); }
    else { const n = Math.max(0, getSheet(SHEET_SHIP).getLastRow() - 1); replyToLine(replyToken, '⚠️ 確定要清除全部寄運資料共 ' + n + ' 筆嗎？\n確定請打：寄運資料 清除 確定'); }
    return;
  }
  if (/^(?:冰庫總量|庫存表)\s*清除/.test(text.split('\n')[0].trim())) {
    if (!ownerOnly(source, replyToken, '清除紀錄')) return;
    if (/確定/.test(text)) { const n = clearAllRows(SHEET_STOCK); replyToLine(replyToken, '🗑️ 已清除全部冰庫總量，共刪除 ' + n + ' 筆。'); }
    else { const n = Math.max(0, getSheet(SHEET_STOCK).getLastRow() - 1); replyToLine(replyToken, '⚠️ 確定要清除全部冰庫總量共 ' + n + ' 筆嗎？\n確定請打：冰庫總量 清除 確定'); }
    return;
  }
  if (/^冰庫\s*清除/.test(text.split('\n')[0].trim())) {
    if (!ownerOnly(source, replyToken, '清除紀錄')) return;
    if (/確定/.test(text)) { const n = clearAllRows(SHEET_FREEZER); replyToLine(replyToken, '🗑️ 已清除全部冰庫寄存，共刪除 ' + n + ' 筆。'); }
    else { const n = Math.max(0, getSheet(SHEET_FREEZER).getLastRow() - 1); replyToLine(replyToken, '⚠️ 確定要清除全部冰庫寄存共 ' + n + ' 筆嗎？\n確定請打：冰庫 清除 確定'); }
    return;
  }
  {
    const fl = text.split('\n')[0];
    const cm = fl.match(/(遲到|上班|下班|請假|損耗|改價)\s*(?:紀錄|記錄)\s*[：:]?\s*清除/);
    if (cm) {
      if (!ownerOnly(source, replyToken, '清除紀錄')) return;
      const cat = cm[1];
      const map = { '遲到': [SHEET_ATTEND, 2, '遲到'], '上班': [SHEET_ATTEND, 2, '上班'], '下班': [SHEET_ATTEND, 2, '下班'], '請假': [SHEET_ATTEND, 2, '請假'], '損耗': [SHEET_FINANCE, 2, '損耗'], '改價': [SHEET_FINANCE, 2, '改價'] };
      const cfg = map[cat];
      if (/確定/.test(text)) { const n = clearRecords(cfg[0], cfg[1], cfg[2]); replyToLine(replyToken, '🗑️ 已清除全部「' + cat + '」紀錄，共刪除 ' + n + ' 筆。'); }
      else { const n = countRecords(cfg[0], cfg[1], cfg[2]); replyToLine(replyToken, '⚠️ 確定要清除全部「' + cat + '」紀錄共 ' + n + ' 筆嗎？\n確定請打：' + cat + '紀錄 清除 確定'); }
      return;
    }
  }
  if (/^出勤\s*清除/.test(text.split('\n')[0].trim())) {
    if (!ownerOnly(source, replyToken, '清除紀錄')) return;
    if (/確定/.test(text)) { const n = clearAllRows(SHEET_ATTEND); replyToLine(replyToken, '🗑️ 已清除全部出勤紀錄，共刪除 ' + n + ' 筆。'); }
    else { const n = Math.max(0, getSheet(SHEET_ATTEND).getLastRow() - 1); replyToLine(replyToken, '⚠️ 確定要清除全部出勤紀錄共 ' + n + ' 筆嗎？\n確定請打：出勤 清除 確定'); }
    return;
  }

  if (/(修改|改\s*\d|改\s*包裝|清備註|清除備註|刪備註|刪除備註|改備註|備註改|取消\s*備註)/.test(text) && (/【.+?】/.test(text) || /[：:]/.test(text)) && !/(上班|下班|遲到|請假|鐵架|空車|外勤|評比|借\s*\d|還\s*\d)/.test(text) && !/台子\s*[×xX*]\s*\d/.test(text) && !(/【/.test(text) && /[：:]\s*\d/.test(text))) {
    const sm = handleShippingModify(text);
    if (sm.count > 0) { replyToLine(replyToken, sm.reply); return; }
    if (/寄運資料/.test(text) || /【.+?】/.test(text)) { replyToLine(replyToken, sm.reply); return; }
  }

  /* ---- 場外寫入寄運：寄運 客戶 品名 數量／+N／-N／修改N／改N／取消（冒號可省）---- */
  {
    const _fl = text.split('\n')[0].trim();
    const _pureQuery = /^\S{1,12}\s*寄運資料\s*(?:\d{1,2}\/\d{1,2}|\d{4}\/\d{1,2}\/\d{1,2})?\s*$/.test(_fl);
    if (!_pureQuery && (/^寄運\s+\S/.test(text) || /^\S{1,12}寄運資料/.test(text))) {
      const sc = handleShippingCmd(text);
      if (sc.count > 0) { replyToLine(replyToken, sc.reply); return; }
    }
  }

  let shpm = text.match(/^(.{1,12}?)\s*寄運資料\s*(.*)$/);
  if (shpm && shpm[1].trim()) { replyToLine(replyToken, shippingPull(shpm[1].trim(), shpm[2].trim())); return; }

  let pm = text.match(/^(查改價|改價紀錄|改價查詢|查改價紀錄)\s*(.*)$/);
  if (pm) { replyToLine(replyToken, queryPriceChanges(pm[2].trim())); return; }

  let lqm = text.match(/^(查損耗|損耗紀錄|損耗查詢)\s*(.*)$/);
  if (lqm) { replyToLine(replyToken, lossQuery(lqm[2].trim())); return; }

  /* ---- 件數（嚴格：單一品名、無聊天語）---- */
  { let _qm = text.match(/^(總件數|件數)\s*(\S{1,12})$/); if (_qm && !CHAT_RE.test(_qm[2]) && !/[，。！？、]/.test(_qm[2])) { replyToLine(replyToken, countPieces(_qm[2].trim())); return; } }

  /* ---- 統整金額明細（依客戶看誰多少錢，須先比明細以免被統整金額吃掉）---- */
  { let _amd = text.match(/^(統整金額明細|金額統整明細|統計金額明細|金額明細|統整明細)\s*(.+)$/); if (_amd && /\d{1,2}\/\d{1,2}/.test(_amd[2])) { replyToLine(replyToken, summarizeAmountDetail(_amd[2].trim())); return; } }
  /* ---- 統整金額（含日期；關鍵字後空格可省）---- */
  { let _am = text.match(/^(統整金額|統計金額|金額統整|統整|統計)\s*(.+)$/); if (_am && /\d{1,2}\/\d{1,2}/.test(_am[2])) { replyToLine(replyToken, summarizeAmount(_am[2].trim())); return; } }

  if (/^(中控總覽|中控總攬|今日總覽|今日總攬|總覽|總攬|中控)\s*$/.test(text)) {
    if (!ownerOnly(source, replyToken, '中控總覽')) return;
    replyToLine(replyToken, controlOverview(evalGroup(chatId))); return;
  }

  if (/^#綁定員工/.test(text)) { if (!isAdmin(source.userId)) { replyToLine(replyToken, '🔒 此功能僅限老闆。'); return; } const m = text.match(/^#綁定員工\s+(\S+)\s*[=＝:：]?\s*(.+)$/); if (m) { setBinding(m[1].trim(), m[2].trim()); replyToLine(replyToken, '✅ 已綁定：員工「' + m[1].trim() + '」↔ LINE 暱稱「' + m[2].trim() + '」'); } else replyToLine(replyToken, '格式：#綁定員工 林義祥 = LINE暱稱'); return; }
  if (/^#(解除綁定|取消綁定)/.test(text)) { if (!isAdmin(source.userId)) { replyToLine(replyToken, '🔒 此功能僅限老闆。'); return; } const m = text.match(/^#(?:解除綁定|取消綁定)\s+(\S+)/); if (m) { removeBinding(m[1].trim()); replyToLine(replyToken, '已解除「' + m[1].trim() + '」的綁定。'); } return; }
  if (/^#(員工綁定清單|綁定清單|查綁定)/.test(text)) { const b = getBindings(); const ks = Object.keys(b); replyToLine(replyToken, ks.length ? ('👥 員工綁定：\n' + ks.map(function (k) { return '・' + k + ' ↔ ' + b[k]; }).join('\n')) : '目前沒有任何員工綁定。'); return; }
  if (/^#員工離職/.test(text)) { if (!isAdmin(source.userId)) { replyToLine(replyToken, '🔒 此功能僅限老闆。'); return; } const m = text.match(/^#員工離職\s+(\S+)/); if (m) { addResigned(m[1].trim()); replyToLine(replyToken, '✅ 已將「' + m[1].trim() + '」標記離職。'); } else replyToLine(replyToken, '格式：#員工離職 小皮'); return; }
  if (/^#員工復職/.test(text)) { if (!isAdmin(source.userId)) { replyToLine(replyToken, '🔒 此功能僅限老闆。'); return; } const m = text.match(/^#員工復職\s+(\S+)/); if (m) { removeResigned(m[1].trim()); replyToLine(replyToken, '✅ 已將「' + m[1].trim() + '」復職。'); } return; }
  if (/^#(離職清單|查離職)/.test(text)) { const a = getResigned(); replyToLine(replyToken, a.length ? ('🚪 已離職員工：\n' + a.map(function (e) { return '・' + e; }).join('\n')) : '目前沒有標記離職的員工。'); return; }
  if (/^#(員工別名|別名)\s/.test(text)) { if (!isAdmin(source.userId)) { replyToLine(replyToken, '🔒 此功能僅限老闆。'); return; } const m = text.match(/^#(?:員工別名|別名)\s+(\S+?)\s*[=＝:：]\s*(\S+)$/); if (m) { setEmpAlias(m[1].trim(), m[2].trim()); replyToLine(replyToken, '✅ 已設別名：評比時「' + m[1].trim() + '」會併入「' + m[2].trim() + '」'); } else replyToLine(replyToken, '格式：#員工別名 良=阿良（把「良」併進「阿良」）'); return; }
  if (/^#刪(?:除)?別名\s/.test(text)) { if (!isAdmin(source.userId)) { replyToLine(replyToken, '🔒 此功能僅限老闆。'); return; } const m = text.match(/^#刪(?:除)?別名\s+(\S+)/); if (m) { removeEmpAlias(m[1].trim()); replyToLine(replyToken, '已刪除別名「' + m[1].trim() + '」。'); } return; }
  if (/^#(別名清單|查別名)/.test(text)) { const a = getEmpAlias(); const ks = Object.keys(a); replyToLine(replyToken, ks.length ? ('🔗 員工別名：\n' + ks.map(function (k) { return '・' + k + ' → ' + a[k]; }).join('\n')) : '目前沒有設定別名。打「#員工別名 良=阿良」設定。'); return; }
  if (/^#刪除員工/.test(text)) { if (!isAdmin(source.userId)) { replyToLine(replyToken, '🔒 此功能僅限老闆。'); return; } const m = text.match(/^#刪除員工\s+(\S+)/); if (!m) { replyToLine(replyToken, '格式：#刪除員工 小皮 確定'); return; } const emp = m[1].trim(); if (!/確定/.test(text)) { replyToLine(replyToken, '⚠️ 這會永久刪除' + emp + ' 的所有紀錄。\n確定請打：#刪除員工 ' + emp + ' 確定'); return; } const r = deleteEmployee(emp); replyToLine(replyToken, '🗑️ 已刪除「' + emp + '」：' + (r.detail.length ? r.detail.join('、') : '無相符紀錄') + '\n共 ' + r.total + ' 筆。'); return; }
  if (/^#(設定市場群組|設定主群組|設為主群組)/.test(text)) { if (!isAdmin(source.userId)) { replyToLine(replyToken, '🔒 此功能僅限老闆。'); return; } PROPS.setProperty('MAIN_GROUP', chatId); replyToLine(replyToken, '✅ 已把「這個群組」設為主群組(市場群組)。'); return; }
  if (/^#(取消主群組|清除主群組)/.test(text)) { PROPS.deleteProperty('MAIN_GROUP'); replyToLine(replyToken, '已取消主群組設定。'); return; }
  if (/^#(新增評比群組|加入評比群組|設定鐵架群組)/.test(text)) { if (!isAdmin(source.userId)) { replyToLine(replyToken, '🔒 此功能僅限老闆。'); return; } addEvalGroup(chatId); replyToLine(replyToken, '✅ 已把「這個群組」加入評比群組。目前共 ' + getEvalGroups().length + ' 個。'); return; }
  if (/^#(移除評比群組|刪除評比群組|退出評比群組)/.test(text)) { if (!isAdmin(source.userId)) { replyToLine(replyToken, '🔒 此功能僅限老闆。'); return; } removeEvalGroup(chatId); replyToLine(replyToken, '已把這個群組移出評比群組。目前共 ' + getEvalGroups().length + ' 個。'); return; }
  if (/^#(評比群組清單|查評比群組)/.test(text)) { const gs = getEvalGroups(); const main = PROPS.getProperty('MAIN_GROUP'); replyToLine(replyToken, gs.length ? ('🏷️ 評比群組共 ' + gs.length + ' 個：\n' + gs.map(function (g, i) { return (i + 1) + '. ' + g.slice(0, 8) + '…' + (g === main ? '（主群組）' : '') + (g === chatId ? '（目前這群）' : ''); }).join('\n')) : '目前沒有設定評比群組。'); return; }

  if (/^#設定評比/.test(text)) { if (!isAdmin(source.userId)) { replyToLine(replyToken, '🔒 此功能僅限老闆。'); return; } replyToLine(replyToken, setEvalConfig(text)); return; }
  {
    const evm = text.match(/^(?:查\s*)?(\S*?)\s*(?:綜合評比|獎金評比|員工評比|評比)\s*(.*)$/);
    if (evm && /評比/.test(text)) {
      if (!ownerOnly(source, replyToken, '綜合評比')) return;
      const empF = (evm[1] || '').replace(/^(本月|上月|這個|當月|綜合|員工|獎金)/, '').trim();
      let marg = evm[2] || ''; if (/上月/.test(text)) marg = '上月'; else if (/本月|這個?月|當月/.test(text)) marg = '本月';
      const detail = !!empF || /明細/.test(text);   // 查{員工}評比 或 「綜合評比 明細」→ 明細版
      replyToLine(replyToken, evaluation(marg, empF, chatId, detail)); return;
    }
  }
  {
    const sgm = text.match(/^(?:查\s*)?(\S*?)\s*出勤統計\s*(.*)$/);
    if (sgm && /出勤統計/.test(text)) {
      if (!ownerOnly(source, replyToken, '出勤統計')) return;
      const empF = (sgm[1] || '').replace(/^(本月|上月|這個|當月|全部|所有|員工)/, '').trim();
      let marg = sgm[2] || ''; if (/上月/.test(text)) marg = '上月'; else if (/本月|這個?月|當月/.test(text)) marg = '本月';
      const detail = !!empF || /明細/.test(text);   // 查{員工}出勤統計 或 「出勤統計 明細」→ 明細版
      replyToLine(replyToken, attendanceStats(marg, empF, detail)); return;
    }
  }
  let aqm = text.match(/^(查遲到|查請假|查上班|查下班|查員工出勤|查出勤|出勤查詢|出勤紀錄)\s*(.*)$/);
  if (aqm) {
    if (!ownerOnly(source, replyToken, '出勤查詢')) return;
    let filter = '';
    if (aqm[1] === '查遲到') filter = '遲到'; else if (aqm[1] === '查請假') filter = '請假'; else if (aqm[1] === '查上班') filter = '上班'; else if (aqm[1] === '查下班') filter = '下班';
    replyToLine(replyToken, attendanceQuery(filter, aqm[2].trim()));
    return;
  }

  /* ---- 鐵架輸入防呆（涵蓋【】/多行/單行）：名稱要含「鐵架」、零售商名稱一致，不合格直接擋下教學 ---- */
  {
    const rg = rackEntryGuard(text);
    if (rg && rg.warn) { replyToLine(replyToken, rg.reply); return; }   // 警示一律回覆，不受安靜模式影響
  }

  if (/台子\s*[×xX*]\s*\d/.test(text) && (/收\s*\d/.test(text) || /取消/.test(text) || /修改\s*\d/.test(text))) {
    const tr = handleTaiziSheet(text);
    if (tr.count > 0) { replyToLine(replyToken, tr.reply); return; }
  }
  if (/【/.test(text) && /[×xX*]\s*\d/.test(text) && (/收/.test(text) || /取消/.test(text) || /修改/.test(text)) && !/台子\s*[×xX*]\s*\d/.test(text) && !/[：:]\s*\d/.test(text)) {
    const rr = handleRackReturn(text);
    if (rr.count > 0) { replyToLine(replyToken, rr.reply); return; }
  }
  if (/【/.test(text) && /[：:]\s*\d/.test(text) && (/取消/.test(text) || /清除/.test(text) || /(?:修改|改)\s*\d/.test(text) || /(?:改\s*(?:包裝|容器|成)?|改為|→|➜)\s*[（(]?\s*(?:台子|紙箱|圓籃|袋子|箱)/.test(text)) && !/\d+\s*件/.test(text) && !/[×xX*]\s*\d/.test(text) && !/收/.test(text)) {
    const fc = handleFreezerCancel(text);
    if (fc.count > 0) { replyToLine(replyToken, fc.reply); return; }
  }

  {
    const cancelLine = (text.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return /(取消|清除)\s*$/.test(l) && !/確定\s*$/.test(l); }))[0];
    if (cancelLine) {
      const isAttend = /(上班|下班|遲到|請假)/.test(cancelLine);
      const isFinance = /(?:扣除|損耗)\s*\d+|改\s*\d+\s*元|價格修正|匯款|轉帳|改價|損耗/.test(cancelLine);
      const isShipping = !isAttend && !isFinance && !/台子\s*[×xX*]\s*\d/.test(text) && !/鐵架/.test(cancelLine) && !(/【/.test(text) && /[：:]\s*\d/.test(text)) && (/【/.test(text) || /[：:]/.test(cancelLine) || /\d+\s*(件|包|箱|台)/.test(cancelLine));
      if (isAttend || isFinance || isShipping) {
        if (!ownerOnly(source, replyToken, '取消紀錄')) return;
        if (isAttend) {
          const r = cancelAttendance(cancelLine);
          if (r) replyToLine(replyToken, '🗑️ 已取消刪除：' + r.emp + ' ' + r.action + '（' + r.time + '）');
          else replyToLine(replyToken, '找不到符合的出勤紀錄，沒有刪除。');
        } else if (isFinance) {
          const r = cancelFinance(cancelLine, chatId);
          if (r) replyToLine(replyToken, '🗑️ 已取消刪除：' + r.customer + ' ' + r.type + '（' + r.desc + '・' + r.time + '）');
          else replyToLine(replyToken, '找不到符合的損耗/改價紀錄，沒有刪除。');
        } else {
          const r = cancelShipping(text);
          if (r.count > 0) replyToLine(replyToken, '🗑️ 已刪除寄運 ' + r.count + ' 筆：\n' + r.summary.join('\n'));
          else replyToLine(replyToken, '找不到符合的寄運紀錄，沒有刪除。');
        }
        return;
      }
    }
  }

  // Task9：以疑問/否定語尾（嗎/呢/？/?/沒）結尾一律視為聊天，不進打卡（例：「老闆上班了嗎」）
  if (!/^查/.test(text) && !/[嗎呢？?]\s*$/.test(text) && !/沒\s*$/.test(text)) {
    let m, action = '', status = '正常', emp = '';
    const T = '[\\s了啦囉喔嘍嗎啊呀耶ㄌ～~!！。．\\.，,、；;？?\\uD800-\\uDFFF\\uFE0F\\u2600-\\u27BF\\u2B00-\\u2BFF\\u2190-\\u21FF]*';
    if (new RegExp('^上班\\s*遲到' + T + '$').test(text)) { action = '上班'; status = '遲到'; emp = '__SELF__'; }
    else if (new RegExp('^上班' + T + '$').test(text)) { action = '上班'; emp = '__SELF__'; }
    else if (new RegExp('^下班' + T + '$').test(text)) { action = '下班'; emp = '__SELF__'; }
    else if (new RegExp('^遲到' + T + '$').test(text)) { action = '遲到'; emp = '__SELF__'; }
    else if (new RegExp('^請假' + T + '$').test(text)) { action = '請假'; emp = '__SELF__'; }
    else if (m = text.match(new RegExp('^(.{1,12}?)\\s*上班\\s*遲到' + T + '$'))) { emp = m[1]; action = '上班'; status = '遲到'; }
    else if (m = text.match(new RegExp('^(.{1,12}?)\\s*上班' + T + '$'))) { emp = m[1]; action = '上班'; }
    else if (m = text.match(new RegExp('^(.{1,12}?)\\s*下班' + T + '$'))) { emp = m[1]; action = '下班'; }
    else if (m = text.match(new RegExp('^(.{1,12}?)\\s*遲到' + T + '$'))) { emp = m[1]; action = '遲到'; }
    else if (m = text.match(new RegExp('^(.{1,12}?)\\s*請假' + T + '$'))) { emp = m[1]; action = '請假'; }
    if (emp === '__SELF__') {
      const dn = getDisplayName(chatId, source.userId);
      emp = normalizeEmployeeName(reverseBinding(dn) || dn);          // SSOT：本人打卡也正規化
    } else {
      emp = emp.trim().replace(/^員工/, '');
      if (action && emp && /(我|你|他|她|大家|老闆|準備|終於|快|想|該|誰|今天|今日|現在|可以|還沒|馬上|剛|一起|幾點|有人|有沒有|要不要|先|等等|等一下)/.test(emp)) action = '';
      emp = normalizeEmployeeName(emp);                               // SSOT：去時間(宏欸4:07→宏欸)+套別名後才寫入 ERP
    }
    if (action && emp) {
      appendAttendance(emp, action, status);
      let msg = '🕒 已登記：' + emp + ' ' + action + (status === '遲到' ? '（遲到）' : '');
      replyToLine(replyToken, msg + '\n時間：' + nowStr());
      return;
    }
  }

  if (/【.+?】/.test(text) && /[：:]\s*\d+/.test(text) && /出/.test(text) && !/收/.test(text)) {
    const sh = handleFreezerShip(text);
    if (sh.count > 0) { replyToLine(replyToken, sh.reply); return; }
  }

  if (/退\s*貨?\s*了?\s*\d+\s*(台|件|包|箱|個|顆|斤|公斤|盒)|退貨\s*了?\s*\d+/.test(text) && !/^查|^搜|^#|改\s*\d|匯款|損耗|扣除|【/.test(text)) {
    const rr = handleReturn(text);
    if (rr.count > 0) { replyToLine(replyToken, rr.reply); return; }
  }

  /* ---- 場外一行寫入冰庫：寄冰 客戶 品名[等級] 數量／+N／-N／修改N／改N／取消／容器 ---- */
  {
    const fl = text.split('\n')[0].trim();
    const hasOp = /(?:[+＋\-－]\s*\d+|修改\s*\d+|改\s*\d+|設定\s*\d+|取消\s*$|\d+(?:\s*(?:件|包|箱|台|台子|袋子|圓籃|紙箱))*\s*$)/.test(fl);
    if (/^寄冰\s+\S/.test(fl) && hasOp) {
      const fcmd = handleFreezerCmd(text);
      if (fcmd.count > 0) { replyToLine(replyToken, fcmd.reply); return; }
    }
  }

  if (isWholeIce(text) && !/出庫|入庫|【|改\s*\d|匯款|損耗|扣除/.test(text)) {
    const ice = handleFreezerIceBatch(text);
    if (ice.count > 0) { replyToLine(replyToken, ice.reply); return; }
  }

  /* ---- 待收款 / 收款追蹤（Task4）：查詢 / 結案 / 取消(軟刪) / 自動偵測建立 ---- */
  if (/^#(待收款|未收款|今日待收款|今日收款|待辦)\s*$/.test(text)) { replyToLine(replyToken, receivableQuery(/今日/.test(text))); return; }
  if (/^#收款明細\s*$/.test(text)) { replyToLine(replyToken, receivableDetail()); return; }
  if (/^#已收\s+/.test(text)) {
    let body = text.replace(/^#已收\s+/, '').trim(); let all = false;
    if (/^全部\s+/.test(body)) { all = true; body = body.replace(/^全部\s+/, '').trim(); }
    const key = body.split(/\s+/)[0];
    const r = receivableClose(key, getDisplayName(chatId, source.userId), all);
    if (r.none) replyToLine(replyToken, '查無「' + key + '」的未收款。');
    else if (r.candidates) replyToLine(replyToken, recvCandidateReply(r.candidates));
    else replyToLine(replyToken, '✅ 已收款結案 ' + r.done.length + ' 筆：\n' + r.done.map(function (x) { return x.id + '｜' + x.customer + (x.supplier ? '／' + x.supplier : '') + '｜' + x.amount + ' 元'; }).join('\n'));
    return;
  }
  if (/^#取消收款\s+/.test(text)) {
    let body = text.replace(/^#取消收款\s+/, '').trim(); let all = false;
    if (/^全部\s+/.test(body)) { all = true; body = body.replace(/^全部\s+/, '').trim(); }
    const mkey = body.match(/^(\S+)\s*(.*)$/); const key = mkey ? mkey[1] : body; const reason = mkey ? mkey[2].trim() : '';
    const r = receivableCancel(key, getDisplayName(chatId, source.userId), reason, all);
    if (r.none) replyToLine(replyToken, '查無「' + key + '」的未收款。');
    else if (r.candidates) replyToLine(replyToken, recvCandidateReply(r.candidates));
    else replyToLine(replyToken, '🗑️ 已取消收款（軟刪除）' + r.done.length + ' 筆：\n' + r.done.map(function (x) { return x.id + '｜' + x.customer + '｜' + x.amount + ' 元'; }).join('\n') + (reason ? '\n原因：' + reason : ''));
    return;
  }
  // 自動偵測：含正式收款關鍵字 + 可解析金額 → 建立【未收】（fail-closed：無金額只提示不建立）
  {
    const rd = recvDetect(text);
    if (rd) {
      if (rd.needAmount) { replyToLine(replyToken, '⚠️ 偵測到收款意圖但讀不到金額，請用格式：客戶 品項 要收款 6800（或 6800元）。'); return; }
      logIntent('收款建立', text);
      const cr = recvCreate(rd, (source.groupId || source.roomId || ''), (event.message && event.message.id) || '', getDisplayName(chatId, source.userId), text);
      if (cr.dup) { replyToLine(replyToken, '⚠️ 這筆收款已存在（24小時內同客戶同金額同品項或同訊息），未重複建立。'); return; }
      replyToLine(replyToken, '💰 已建立待收款：' + (rd.customer || '(未填客戶)') + (rd.supplier ? '／' + rd.supplier : '') + '｜' + (rd.item || '') + '｜' + rd.amount + ' 元\n（收款人待指定；收款完成請打「#已收 ' + (rd.customer || '客戶') + '」）');
      return;
    }
  }

  /* ---- 寄運出貨單（含鐵架(鐵架*N)漏記修正）---- */
  if (/\d+\s*(?:件|台(?!子)|包|箱)/.test(text) && !/扣除|損耗|入庫|出庫|匯款|改\s*\d|[（(]\s*鐵架|收\s*$|【/.test(text)) {
    const ship = parseShipping(text);
    let iceReply = '';
    if (/[(（]\s*冰\s*[)）]/.test(text)) { const ice = handleFreezerIceBatch(text); if (ice.count > 0) iceReply = ice.reply; }
    let rackReply = '';
    if (/[(（][^)）]*[*＊]\s*\d+[^)）]*[)）]/.test(text)) { const rk = handleRackParenBatch(text); if (rk.count > 0) rackReply = rk.reply; }
    // 寄運定義收緊：只有「有寄X物流指定」或「客戶在物流客戶名單」的品項才記寄運。
    const carrierSet = allCarrierCustomers();
    const shipRecs = ship.records.filter(function (r) { return isShippingRecord(r, carrierSet); });
    const hasTaizi = ship.records.some(function (r) { return r.pack === '台子' && Number(r.qty) > 0; });
    if (shipRecs.length > 0 && !intentAllowsWrite(text)) { if (!quiet(chatId)) replyToLine(replyToken, '⚠️ 無法確認指令，請重新輸入正式寄運格式（客戶＋品項＋件數＋寄物流，例：漢光⏎南瓜 特30件 寄旭陽）。'); return; }
    let taiziTotal = 0; const taiziSkip = [];
    if (shipRecs.length > 0 || hasTaizi) {
      const sh = getSheet(SHEET_SHIP); const tz = getSheet(SHEET_TAIZI);
      if (shipRecs.length > 0) logIntent('寄運建立', text);
      ship.records.forEach(function (r) {
        if (isShippingRecord(r, carrierSet)) sh.appendRow([nowStr(), r.customer, r.vendor, r.name, r.grade, r.qty, r.pack || '', r.logistics || '', '', r.note || '', r.unit || '件']);
        // 台子出庫：所有 pack=台子 品項都記（不論是否寄運；十方齋單不記寄運但台子要出庫）
        if (r.pack === '台子' && Number(r.qty) > 0) {
          if (freezerBalanceOf(r.customer, r.name) > 0) { taiziSkip.push(r.customer + ' ' + r.name); }
          else { tz.appendRow([nowStr(), '', '出庫', '台子', r.qty, r.customer]); taiziTotal += Number(r.qty); }
        }
      });
    }
    if (shipRecs.length > 0) {
      let rep = '✅ 已記錄寄運資料（' + shipRecs.length + ' 筆，已去掉貨主名）：\n' + shippingCleanSummary(shipRecs);
      if (taiziTotal > 0) rep += '\n\n🥡 同時記台子出庫 ' + taiziTotal + ' 個（查台子看得到）';
      if (taiziSkip.length > 0) rep += '\n\n⚠️ 下列品項冰庫尚有庫存，台子已於寄冰時記過，本次不重複記台子：\n・' + taiziSkip.join('\n・');
      if (iceReply) rep += '\n\n' + iceReply;
      if (rackReply) rep += '\n\n' + rackReply;
      replyToLine(replyToken, rep);
      return;
    }
    // 無寄運：只回實物記錄（台子/冰/鐵架），不回「已記錄寄運資料」
    const physical = [];
    if (taiziTotal > 0) physical.push('🥡 已記台子出庫 ' + taiziTotal + ' 個（查台子看得到）');
    if (iceReply) physical.push(iceReply);
    if (rackReply) physical.push(rackReply);
    if (physical.length) { replyToLine(replyToken, physical.join('\n\n')); return; }
    // 有件數品項行但判不出客戶（指示句/物流商/黏行）→ fail-closed 教學；其餘（如純出貨非寄運）→ 靜默(往下走)
    if (ship.unresolved > 0) { if (!quiet(chatId)) replyToLine(replyToken, '⚠️ 無法判斷指令，請使用指定格式（打「指令表」查看）。'); return; }
  }

  if (/[(（]/.test(text)) {
    const slip = [];
    if (/[(（]\s*冰\s*[)）]/.test(text)) { const r = handleFreezerIceBatch(text); if (r.count > 0) slip.push(r.reply); }
    if (/[(（]\s*台子\s*[)）]/.test(text)) { const r = handleTaiziBatch(text); if (r.count > 0) slip.push(r.reply); }
    if (/[(（][^)）]*[*＊]\s*\d+[^)）]*[)）]/.test(text)) { const r = handleRackParenBatch(text); if (r.count > 0) slip.push(r.reply); }
    if (slip.length > 0) { replyToLine(replyToken, slip.join('\n\n')); return; }
  }

  if (/入庫|出庫/.test(text)) {
    const fb = handleFreezerBatch(text);
    if (fb.count > 0) { replyToLine(replyToken, fb.reply); return; }
  }

  if (!/【/.test(text) && /台子/.test(text) && /收/.test(text)) {
    const tc = handleTaiziCollectInline(text);
    if (tc.count > 0) { replyToLine(replyToken, tc.reply); return; }
  }

  if (/(?:扣除|損耗)\s*\d+\s*件|改\s*\d+\s*元|價格修正/.test(text)) {
    const slip = scanSlip(text, chatId);
    if (slip.count > 0) {
      replyToLine(replyToken, slipSummary(slip));
      notifyOwner('📩【記錄】\n' + slipSummary(slip));
      return;
    }
  }

  /* ---- 鐵架固定格式驗證（非【】單）：格式/名稱不對直接跳警示，正確才寫入 ---- */
  {
    const rs = rackSlipStrict(text);
    if (rs.handled) { replyToLine(replyToken, rs.reply); return; }
  }

  if (/【.+?】/.test(text) && /[×xX*]\s*\d+/.test(text) && /收/.test(text)) {
    const rr = handleRackReturn(text);
    if (rr.count > 0) { replyToLine(replyToken, rr.reply); return; }
  }

  if (/^(出去|出貨|出|回收|收)/.test(text.split('\n')[0].trim())) {
    const rb = handleRackBatch(text);
    if (rb.count > 0) { replyToLine(replyToken, rb.reply); return; }
  }

  if (/[*＊×xX]\s*\d+/.test(text) && !/【/.test(text)) {
    const ri = handleRackInlineOut(text);
    if (ri.count > 0) { replyToLine(replyToken, ri.reply); return; }
  }

  /* ---- 匯款（錨定：客戶 + 關鍵字 + 金額）---- */
  { const _rm = text.match(/^(\S{1,16})\s*(匯款|轉帳)\s*([\d,]+)\s*$/); if (_rm) {
      const customer = _rm[1].trim(); const amount = _rm[3].replace(/,/g, '');
      appendFinanceRecord(customer, '匯款', amount, '');
      replyToLine(replyToken, '✅ 已收到匯款！\n客戶：' + customer + '\n金額：' + amount + '\n已通知老闆。');
      notifyOwner('💰【匯款】\n客戶：' + customer + '\n金額：' + amount + '\n' + nowStr());
      return;
  } }
  /* ---- 改價（錨定：客戶 + 改價 + 內容）---- */
  { const _pc = text.match(/^(\S{1,16})\s*改價\s+(.+)$/); if (_pc) {
      const customer = _pc[1].trim(); const content = _pc[2].trim();
      appendFinanceRecord(customer, '改價', '', content);
      replyToLine(replyToken, '✅ 已收到改價！\n客戶：' + customer + '\n內容：' + content + '\n已通知老闆。');
      notifyOwner('📝【改價】\n客戶：' + customer + '\n內容：' + content + '\n' + nowStr());
      return;
  } }
}

/* ========================== 【工作群組/權限/別名 等基礎】 ========================== */
// 安靜模式（分群獨立 + 老闆全域）：只壓 unknown/非必要提示，不壓功能回覆。
// QUIET_ALL=全域（#全部安靜）；QUIET_GROUPS=本群清單（#安靜）。舊全域 QUIET 鍵不再讀取（遷移＝乾淨起點，見 DECISIONS D-QUIET）。
function quiet(chatId) { if (PROPS.getProperty('QUIET_ALL') === '1') return true; return !!chatId && quietGroups().indexOf(chatId) !== -1; }
function quietGroups() { const raw = PROPS.getProperty('QUIET_GROUPS') || ''; return raw ? raw.split(',').filter(Boolean) : []; }
function addQuietGroup(id) { if (!id) return; const list = quietGroups(); if (list.indexOf(id) === -1) list.push(id); PROPS.setProperty('QUIET_GROUPS', list.join(',')); }
function removeQuietGroup(id) { const list = quietGroups().filter(function (x) { return x !== id; }); PROPS.setProperty('QUIET_GROUPS', list.join(',')); }
function getWorkGroups() { const raw = PROPS.getProperty('WORK_GROUPS') || ''; return raw ? raw.split(',').filter(Boolean) : []; }
function addWorkGroup(id) { const list = getWorkGroups(); if (list.indexOf(id) === -1) list.push(id); PROPS.setProperty('WORK_GROUPS', list.join(',')); }
function removeWorkGroup(id) { const list = getWorkGroups().filter(function (x) { return x !== id; }); PROPS.setProperty('WORK_GROUPS', list.join(',')); }

/* ★ 群組權限中介層 */
function isAdmin(userId) { return !!userId && userId === PROPS.getProperty('OWNER_USER_ID'); }
// Task1 安全：老闆限定閘門。回 true=通過；false=已回拒絕訊息，呼叫端應 return。
function ownerGate(source, replyToken) { if (!isAdmin(source && source.userId)) { replyToLine(replyToken, '🔒 僅限老闆。'); return false; } return true; }
// Task8 fail-closed：高危操作限老闆；未註冊老闆時一律拒絕（不再 fail-open 放行）。
function ownerOnly(source, replyToken, label) {
  if (isAdmin(source && source.userId)) return true;
  const hasOwner = !!PROPS.getProperty('OWNER_USER_ID');
  replyToLine(replyToken, hasOwner ? ('🔒 ' + (label || '此操作') + '僅限老闆使用。') : ('🔒 尚未註冊老闆，請先由老闆打「#註冊老闆」再操作（' + (label || '') + '）。'));
  return false;
}
function listProp(key) { const raw = PROPS.getProperty(key) || ''; return raw.split(/[,，\s]+/).filter(Boolean); }
function getPerm(chatId) {
  const admin = listProp('ADMIN_GROUP_IDS'), market = listProp('MARKET_GROUP_IDS');
  if (chatId && admin.indexOf(chatId) !== -1) return { type: 'admin', canWrite: true, canShipping: true, canInventory: true };
  if (chatId && market.indexOf(chatId) !== -1) return { type: 'market', canWrite: false, canShipping: false, canInventory: false };
  return { type: 'unknown', canWrite: false, canShipping: false, canInventory: false };
}
function addGroupId(key, id) { const l = listProp(key); if (l.indexOf(id) === -1) l.push(id); PROPS.setProperty(key, l.join(',')); }
function removeGroupId(key, id) { PROPS.setProperty(key, listProp(key).filter(function (x) { return x !== id; }).join(',')); }
function auditDenied(text, userId, type) { try { Logger.log('拒絕寫入 [' + type + '] ' + (userId || '') + ' : ' + String(text).slice(0, 60)); } catch (e) { } }
var MARKET_READ = { help: 1, count: 1, search: 1, freezer_all: 1, freezer_one: 1, stock_total: 1, stock_one: 1, rack_all: 1, rack_one: 1, taizi_all: 1, return_all: 1, return_one: 1 };
function runReadCommand(cmd, chatId) {
  switch (cmd.type) {
    case 'help': return commandSheet();
    case 'count': return countPieces(cmd.arg);
    case 'search': return searchToday(cmd.arg);
    case 'freezer_all': return freezerOverview('');
    case 'freezer_one': return freezerOverview(cmd.arg);
    case 'stock_total': return stockTotalView();
    case 'stock_one': return stockTable(cmd.arg);
    case 'rack_all': return rackOutstanding();
    case 'rack_one': return rackOutstanding(cmd.arg);
    case 'taizi_all': return taiziOutstanding();
    case 'return_all': return returnQuery('');
    case 'return_one': return returnQuery(cmd.arg);
  }
  return '';
}
function looksLikeWrite(text, cmd) {
  if (cmd && (cmd.type === 'pricechange' || cmd.type === 'remit')) return true;
  return /\d+\s*(件|箱|包|台(?!子))|改價|匯款|轉帳|入庫|出庫|寄運|寄冰|取消|清除|收\s*\d|×\s*\d|\*\s*\d/.test(String(text));
}
var CHAT_RE = /(還沒|沒報|報了沒|報一下|他們|我們|大概|應該|可能|好像|不知道|是不是|要不要|怎麼|為什麼|沒有|然後|可是|但是|其實|嗎$|吧$|呢$|喔$|啦$)/;
function looksLikeChat(text) { return CHAT_RE.test(String(text || '')); }
/* ==========================================================================
 * Intent 分類（第一層防呆 / 除錯可觀測性）
 * --------------------------------------------------------------------------
 * 規則式、可判定的意圖分類，輸出 { intent, confidence, reason }，用途：
 *   ① 產出 Intent/Confidence/Reason 除錯軌跡（寫入前 console.log）。
 *   ② 鎖定不變量：「收台/空籃/棧板回收 ≠ 收款」「聊天填充詞 ≠ 寄運」。
 * 原則「寧可不執行，也不能執行錯」：confidence < 95 的意圖不應建立 ERP 資料。
 * 註：實際寫入閘門仍由各功能既有的「正式格式」判斷把關（此函式不單獨改變寫入行為，
 *     以免破壞既有功能）；本函式提供分類與門檻判斷供守門與除錯使用。
 * ========================================================================== */
var PAYMENT_RE = /(收款|收到款|已收款|收現|匯款|轉帳|付款|收錢)/;         // 正式收款語意
var COLLECT_RE = /(收台|台回來|空籃|空籃回收|籃子回收|棧板回收)/;         // 容器/台子回收 → 一律非收款
var CHAT_FILLER_RE = /^(好|嗯|ok|收到|今天|用今天的|等等|回來|修改一下|改一下|了解|可以|哈+|哈哈+|沒事|算了)$/i;
function classifyIntent(text) {
  const t = String(text || '').trim();
  if (!t) return { intent: 'empty', confidence: 0, reason: '空訊息' };
  // ① 完整寄運/出貨格式（件數＋品項）優先——避免把「有備註需收台」的正式出貨單誤判為回收/收款
  if (/\d+\s*(?:件|台(?!子)|包|箱)/.test(t) && !/扣除|損耗|入庫|出庫|匯款|改\s*\d|【/.test(t)) return { intent: 'shipping', confidence: 96, reason: '含件數與品項的寄運/出貨格式' };
  // ② 收款：需正式收款字，且不得含容器/台子回收字
  if (PAYMENT_RE.test(t) && !COLLECT_RE.test(t)) return { intent: 'payment', confidence: 96, reason: '含正式收款關鍵字' };
  // ③ 容器/台子回收 → 明確非收款
  if (COLLECT_RE.test(t)) return { intent: 'collection', confidence: 92, reason: '容器/台子回收，非收款' };
  // ④ 聊天/填充詞 → 低信心，不得建立 ERP
  if (CHAT_FILLER_RE.test(t) || CHAT_RE.test(t) || t.length <= 2) return { intent: 'chat', confidence: 10, reason: '聊天/填充詞，非正式指令' };
  return { intent: 'unknown', confidence: 20, reason: '無法對應正式指令格式' };
}
// 是否達到可建立 ERP 資料的信心門檻（>=95）。
function intentAllowsWrite(text) { return classifyIntent(text).confidence >= 95; }
// 除錯：寫入 ERP 前輸出 Intent 軌跡（GAS 端進 Stackdriver；測試端由 console mock 收集）。
function logIntent(tag, text) { try { const c = classifyIntent(text); console.log('[INTENT] ' + tag + ' ' + JSON.stringify(c) + ' :: ' + String(text || '').replace(/\n/g, '⏎').slice(0, 40)); } catch (e) { } }
function parseCommand(text) {
  text = String(text || '').trim(); let m; if (!text) return null;
  if (/^(指令表|指令|幫助|功能表)$/.test(text)) return { type: 'help' };
  if (/^(中控總覽|今日總覽|總覽|中控)$/.test(text)) return { type: 'control' };
  if (/^(查冰庫|冰庫庫存|冰庫總覽)$/.test(text)) return { type: 'freezer_all' };
  if (m = text.match(/^查冰庫\s+(\S{1,16})$/)) return { type: 'freezer_one', arg: m[1] };
  if (/^查冰庫總庫存\s*表?$/.test(text)) return { type: 'stock_total' };
  if (m = text.match(/^查\s*(\S{1,16})\s*庫存表$/)) return { type: 'stock_one', arg: m[1] };
  if (/^(查鐵架|鐵架庫存|鐵架總覽|鐵架剩餘|未收回鐵架)$/.test(text)) return { type: 'rack_all' };
  if (m = text.match(/^查\s*(\S{1,16})\s*鐵架$/)) return { type: 'rack_one', arg: m[1] };
  if (/^(查台子|台子總覽|台子剩餘|未收回台子|台子庫存)$/.test(text)) return { type: 'taizi_all' };
  if (/^(查退貨|退貨查詢|退貨紀錄|今日退貨)$/.test(text)) return { type: 'return_all' };
  if (m = text.match(/^查\s*(\S{1,16})\s*退貨(紀錄|記錄)?$/)) return { type: 'return_one', arg: m[1] };
  if ((m = text.match(/^(總件數|件數)\s*(\S{1,12})$/)) && !CHAT_RE.test(m[2]) && !/[，。！？、]/.test(m[2])) return { type: 'count', arg: m[2] };
  if ((m = text.match(/^(搜尋|收尋|搜)\s*(\S{1,16})$/)) && !CHAT_RE.test(m[2]) && !/[，。！？、]/.test(m[2])) return { type: 'search', arg: m[2] };
  if ((m = text.match(/^(統整金額|統計金額|金額統整|統整|統計)\s*(.+)$/)) && /\d{1,2}\/\d{1,2}/.test(m[2])) return { type: 'amount', arg: m[2] };
  if (m = text.match(/^(\S{1,16})\s*改價\s+(.+)$/)) return { type: 'pricechange', cust: m[1], content: m[2] };
  if (m = text.match(/^(\S{1,16})\s*(匯款|轉帳)\s*([\d,]+)$/)) return { type: 'remit', cust: m[1], amount: m[3].replace(/,/g, '') };
  return null;
}

/* ---- 群組綁定客戶 ---- */
function getGroupCustomer(chatId) { try { const m = JSON.parse(PROPS.getProperty('GROUP_CUSTOMER') || '{}'); return m[chatId] || ''; } catch (e) { return ''; } }
function setGroupCustomer(chatId, name) { let m = {}; try { m = JSON.parse(PROPS.getProperty('GROUP_CUSTOMER') || '{}'); } catch (e) { } m[chatId] = name; PROPS.setProperty('GROUP_CUSTOMER', JSON.stringify(m)); }
function removeGroupCustomer(chatId) { let m = {}; try { m = JSON.parse(PROPS.getProperty('GROUP_CUSTOMER') || '{}'); } catch (e) { } delete m[chatId]; PROPS.setProperty('GROUP_CUSTOMER', JSON.stringify(m)); }

/* ---- 貨主名單 ---- */
function getVendors() { const raw = PROPS.getProperty('VENDORS'); if (raw === null) return ['黃銘宗', '宜璁', '宜聰', '旻筑']; return raw ? raw.split(',').filter(Boolean) : []; }
function setVendors(list) { PROPS.setProperty('VENDORS', list.join(',')); }
function addVendor(v) { const l = getVendors(); if (l.indexOf(v) === -1) l.push(v); setVendors(l); }
function removeVendor(v) { setVendors(getVendors().filter(function (x) { return x !== v; })); }

/* ========================== 【冰庫總量管理】 ========================== */
function getWarehouses() { const raw = PROPS.getProperty('WAREHOUSES'); return raw ? raw.split('|').filter(Boolean) : []; }
function setWarehouses(list) { PROPS.setProperty('WAREHOUSES', list.join('|')); }
function addWarehouse(w) { const l = getWarehouses(); if (l.indexOf(w) === -1) l.push(w); setWarehouses(l); }
function removeWarehouse(w) { const nw = norm(w); if (!nw) return; setWarehouses(getWarehouses().filter(function (x) { return !(norm(x) === nw || norm(x).indexOf(nw) !== -1 || nw.indexOf(norm(x)) !== -1); })); }
function matchWarehouse(firstLine) { const f = norm(firstLine); const ws = getWarehouses(); for (let i = 0; i < ws.length; i++) { if (norm(ws[i]) === f) return ws[i]; } return ''; }
function stockLatest(warehouse) {
  const data = getSheet(SHEET_STOCK).getDataRange().getValues();
  const map = {}; const order = [];
  for (let i = 1; i < data.length; i++) {
    if (norm(data[i][1]) !== norm(warehouse)) continue;
    const vendor = String(data[i][2] || ''); const product = String(data[i][3] || ''); if (!product) continue;
    const key = vendor + '' + product;
    if (!(key in map)) order.push(key);
    map[key] = { vendor: vendor, product: product, qty: Number(data[i][4]) || 0 };
  }
  return { map: map, order: order };
}
function formatStockGrouped(cur) {
  const byVendor = {}; const vorder = [];
  cur.order.forEach(function (k) { const o = cur.map[k]; if (o.qty === 0) return; if (!(o.vendor in byVendor)) { byVendor[o.vendor] = []; vorder.push(o.vendor); } byVendor[o.vendor].push(o); });
  if (!vorder.length) return '　（目前無庫存）';
  let out = '';
  vorder.forEach(function (v) {
    if (v) { out += '・' + v + '\n'; byVendor[v].forEach(function (o) { out += '　' + o.product + '：' + o.qty + '\n'; }); }
    else { byVendor[v].forEach(function (o) { out += '・' + o.product + '：' + o.qty + '\n'; }); }
  });
  return out.replace(/\n+$/, '');
}
function handleStockSet(text, reporter) {
  const lines = String(text).split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l && !/^[-—─–_=]{3,}$/.test(l); });
  if (!lines.length) return { count: 0, reply: '' };
  const warehouse = matchWarehouse(lines[0]);
  if (!warehouse) return { count: 0, reply: '' };
  const cur = stockLatest(warehouse);
  const sheet = getSheet(SHEET_STOCK); const rows = []; const now = nowStr(); let curVendor = '';
  for (let i = 1; i < lines.length; i++) {
    const m = lines[i].match(/^(.+?)\s*(?:庫存\s*)?([+\-＋－]?)\s*(\d+)\s*$/);
    if (!m) { curVendor = lines[i].trim(); continue; }
    const product0 = m[1].trim(); const sign = m[2]; const num = parseInt(m[3], 10);
    if (!product0) continue;
    let product = product0, vendor = curVendor;
    const vens = getVendors();
    for (let j = 0; j < vens.length; j++) { if (vens[j] && product.indexOf(vens[j]) === 0 && product.length > vens[j].length) { vendor = vens[j]; curVendor = vens[j]; product = product.slice(vens[j].length).trim(); break; } }
    const key = vendor + '' + product;
    const prev = cur.map[key] ? cur.map[key].qty : 0;
    let next;
    if (sign === '+' || sign === '＋') next = prev + num;
    else if (sign === '-' || sign === '－') next = Math.max(0, prev - num);
    else next = num;
    rows.push([now, warehouse, vendor, product, next, reporter || '']);
    cur.map[key] = { vendor: vendor, product: product, qty: next }; if (cur.order.indexOf(key) === -1) cur.order.push(key);
  }
  if (!rows.length) return { count: 0, reply: '' };
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  return { count: rows.length, reply: '🧊 已更新【' + warehouse + '】庫存：\n' + formatStockGrouped(cur) };
}
function stockTable(warehouse) {
  const real = getWarehouses().filter(function (w) { return norm(w).indexOf(norm(warehouse)) !== -1 || norm(warehouse).indexOf(norm(w)) !== -1; });
  const target = real.length ? real : [warehouse];
  let out = '';
  target.forEach(function (w) { out += '🧊 【' + w + '】庫存表：\n' + formatStockGrouped(stockLatest(w)) + '\n\n'; });
  return out.trim() || ('🧊 找不到「' + warehouse + '」這間冰庫，先用「#新增冰庫 名稱」登記。');
}
function stockTotalView() {
  let out = '🧊 冰庫總庫存：\n';
  const ws = getWarehouses();
  if (!ws.length) out += '\n（尚未登記任何冰庫，用「#新增冰庫 名稱」登記）\n';
  ws.forEach(function (w) { out += '\n【' + w + '】\n' + formatStockGrouped(stockLatest(w)) + '\n'; });
  out += '\n――――――\n以下為(冰)寄存：\n\n' + freezerOverview();
  return out;
}
function clearWarehouseStock(warehouse) {
  const sheet = getSheet(SHEET_STOCK); const data = sheet.getDataRange().getValues();
  const toDel = [];
  for (let i = 1; i < data.length; i++) { if (norm(data[i][1]) === norm(warehouse)) toDel.push(i + 1); }
  toDel.sort(function (a, b) { return b - a; }).forEach(function (r) { sheet.deleteRow(r); });
  return toDel.length;
}
function handleStockPaste(text) {
  const wm = text.match(/【\s*(.+?)\s*】\s*庫存/);
  if (!wm) return { count: 0, reply: '' };
  const warehouse = matchWarehouse(wm[1].trim()) || wm[1].trim();
  const headLine = text.split('\n')[0] || '';
  if (/清除/.test(headLine) && /確定/.test(text)) { const n = clearWarehouseStock(warehouse); return { count: n, reply: '🗑️ 已清除【' + warehouse + '】全部庫存，共刪除 ' + n + ' 筆。' }; }
  const cur = stockLatest(warehouse); const vens = getVendors();
  const lines = text.split('\n').map(function (l) { return l.trim(); });
  const sheet = getSheet(SHEET_STOCK); const rows = []; const now = nowStr(); let curVendor = '';
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (/庫存表|庫存\s*[：:]|已更新|^以下為|冰庫總庫存|在外面共|^📦/.test(line) || /^[-—─–_=]{3,}$/.test(line) || /^🧊/.test(line) || /看全部/.test(line)) continue;
    line = line.replace(/^[・·•　\s]+/, '').trim(); if (!line) continue;
    const isCancel = /取消\s*$/.test(line); if (isCancel) line = line.replace(/取消\s*$/, '').trim();
    line = line.replace(/\s*修改\s*$/, '').trim();
    const m = line.match(/^(.+?)\s*[：:]\s*([+\-＋－]?\d+)\s*$/) || line.match(/^(.+?)\s+([+\-＋－]?\d+)\s*$/);
    if (!m) { if (!isCancel && line) curVendor = line; continue; }
    let product = m[1].trim(), vendor = curVendor;
    for (let j = 0; j < vens.length; j++) { if (vens[j] && product.indexOf(vens[j]) === 0 && product.length > vens[j].length) { vendor = vens[j]; curVendor = vens[j]; product = product.slice(vens[j].length).trim(); break; } }
    if (!product) continue;
    const numStr = m[2]; const sign = /^[+＋]/.test(numStr) ? '+' : (/^[-－]/.test(numStr) ? '-' : ''); const num = parseInt(numStr.replace(/[+\-＋－]/, ''), 10);
    const key = vendor + '' + product; const prev = cur.map[key] ? cur.map[key].qty : 0;
    let next;
    if (isCancel) next = 0;
    else if (sign === '+') next = prev + num;
    else if (sign === '-') next = Math.max(0, prev - num);
    else next = num;
    rows.push([now, warehouse, vendor, product, next, '']);
    cur.map[key] = { vendor: vendor, product: product, qty: next }; if (cur.order.indexOf(key) === -1) cur.order.push(key);
  }
  if (!rows.length) return { count: 0, reply: '' };
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  return { count: rows.length, reply: '🧊 已更新【' + warehouse + '】庫存：\n' + formatStockGrouped(cur) };
}

/* ---- 物流商客戶名單 ---- */
function getCarrierMap() { const raw = PROPS.getProperty('CARRIER_CUST'); if (raw === null) return { '旭陽': ['玉美加工廠', '玉美供食廠', '花蓮阿植', '中壢巧巧龍', '高雄復洋', '高雄農夫'] }; try { return JSON.parse(raw) || {}; } catch (e) { return {}; } }
function getCarrierCustomers(carrier) { return getCarrierMap()[carrier] || []; }
// 寄運定義收緊：所有物流商客戶名單合集（客戶名在此→視為寄運，即使無「寄X」）。
function allCarrierCustomers() { const m = getCarrierMap(); const set = {}; Object.keys(m).forEach(function (k) { (m[k] || []).forEach(function (c) { if (c) set[String(c).trim()] = 1; }); }); return set; }
// 單筆記錄是否算「寄運」：有物流指定(寄X) 或 客戶在物流客戶名單內。
function isShippingRecord(r, carrierSet) { return !!(r && (r.logistics || (carrierSet || allCarrierCustomers())[String(r.customer).trim()])); }
function setCarrierCustomers(carrier, list) { const m = getCarrierMap(); m[carrier] = list; PROPS.setProperty('CARRIER_CUST', JSON.stringify(m)); }

/* ========================== 【寄運解析】 ========================== */
function isGrade(s) { return /^(特大|特優|特|優|良|上|中|下|大|小|甲|乙|丙|A|B|C)$/.test(s); }
function nextHasItem(lines, fromIdx) {
  for (let j = fromIdx; j < lines.length; j++) {
    const nl = lines[j];
    if (!nl || /^[-—─–_=]{3,}$/.test(nl)) continue;
    return /\d+\s*(?:件|台(?!子)|包|箱)/.test(nl);
  }
  return false;
}
// Bug5a：客戶行防呆——含指示動詞或「含空白的長句」不得當客戶（短名稱才是客戶）。
var SHIP_INSTRUCTION_RE = /(上車|上去|下車|下來|搬|扛|放到|放在|拿去|拿到|載去|載到|裝車|卸貨|卸車|回來|過來|開去|送去|拉去|搬去|收回去)/;
function looksLikeInstruction(s) {
  const t = String(s || '').trim();
  if (!t || isKnownShipCustomer(t)) return false;
  if (SHIP_INSTRUCTION_RE.test(t)) return true;
  return /\s/.test(t) && t.replace(/\s+/g, '').length >= 7;
}
function parseShipping(text) {
  const vendors = getVendors().slice().sort(function (a, b) { return b.length - a.length; });
  const lines = String(text).split('\n').map(function (l) { return l.trim(); });
  const records = []; let customer = '', logistics = '', msgLogistics = ''; let unresolvedItems = 0;
  const knownCarriers = Object.keys(getCarrierMap());
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    if (!line || /^[-—─–_=]{3,}$/.test(line)) continue;
    if (/\d+\s*(?:件|台(?!子)|包|箱)/.test(line)) {
      if (/[(（]\s*冰\s*[)）]/.test(line)) continue;
      let rest = line, vendor = '', pack = '', itemLogi = '', noteArr = [];
      rest = rest.replace(/[（(]\s*([^)）]*?)\s*[）)]/g, function (_, inner) {
        let s = String(inner).trim();
        const lg = s.match(/寄車?\s*(\S+)/);
        if (lg && /寄/.test(s)) { itemLogi = lg[1]; s = s.replace(lg[0], ' ').trim(); }
        s = s.replace(/(台子|紙箱|圓籃|袋子|箱)/g, function (p) { pack = (p === '箱' ? '紙箱' : p); return ' '; });
        s = s.replace(/\s+/g, ' ').trim();
        if (s) noteArr.push(s);
        return ' ';
      });
      if (!itemLogi) { const lg2 = rest.match(/寄車?\s*(\S+)/); if (lg2) { itemLogi = lg2[1]; rest = rest.replace(lg2[0], ' '); } }
      const qm = rest.match(/(\d+)\s*(件|台(?!子)|包|箱)/); const qty = qm ? qm[1] : ''; const unit = qm ? qm[2] : '件';
      if (qm) { if (qm[2] === '台' && !pack) pack = '台子'; rest = (rest.slice(0, qm.index) + ' ' + rest.slice(qm.index + qm[0].length)); }
      rest = rest.replace(/\s+/g, ' ').trim();
      for (let j = 0; j < vendors.length; j++) { if (vendors[j] && rest.indexOf(vendors[j]) === 0) { vendor = vendors[j]; rest = rest.slice(vendors[j].length).trim(); break; } }
      if (!itemLogi) { for (let c = 0; c < knownCarriers.length; c++) { const cr = knownCarriers[c]; if (cr && rest.indexOf(cr) === 0 && rest.length > cr.length) { itemLogi = cr; rest = rest.slice(cr.length).trim(); break; } } }
      const tk = rest.split(/\s+/).filter(Boolean);
      let grade = '', name = '';
      let gi = -1; for (let i = 0; i < tk.length; i++) { if (isGrade(tk[i])) { gi = i; break; } }
      if (gi >= 0) {
        grade = tk[gi];
        const before = tk.slice(0, gi);
        if (before.length <= 1) { name = before.join(' '); }
        else if (vendor) { name = before.join(' '); }
        else { vendor = before[0]; name = before.slice(1).join(' '); }
      } else { name = tk.join(' '); }
      if (!name) name = rest;
      if (customer) records.push({ customer: customer, vendor: vendor, name: name, grade: grade, qty: qty, pack: pack, logistics: itemLogi || logistics, note: noteArr.join(' '), unit: unit });
      else unresolvedItems++;   // Bug5c：判不出客戶 → 不亂掛到上一個客戶，計入待確認
    } else {
      // Bug5b：整行等於已知物流商/貨主名 → 視為該段物流指定，不當客戶
      const _bare = line.replace(/[（(][^)）]*[）)]/g, '').replace(/\s+/g, ' ').trim();
      if (_bare && (knownCarriers.indexOf(_bare) !== -1 || vendors.indexOf(_bare) !== -1)) { msgLogistics = _bare; continue; }
      // 「寄<物流>（備註）」獨立行：先拆出括號備註，再認物流（支援「寄旭陽（修清）」這種 寄+貨運名+備註）
      let _lgNote = '';
      const _lgLine = line.replace(/[（(]\s*([^)）]*?)\s*[）)]/g, function (_m, inner) { const t = String(inner).trim(); if (t) _lgNote = _lgNote ? _lgNote + ' ' + t : t; return ' '; }).replace(/\s+/g, ' ').trim();
      const cl = _lgLine.match(/^寄\s*[車運到去]?\s*(\S+)\s*$/);
      if (cl && (/^寄\s*[車運到去]/.test(_lgLine) || knownCarriers.indexOf(cl[1]) !== -1)) {
        msgLogistics = cl[1];
        if (_lgNote && records.length > 0) records.forEach(function (r) { if (r.customer === customer) r.note = (r.note ? r.note + ' ' : '') + _lgNote; });
        continue;
      }
      if (records.length > 0 && !nextHasItem(lines, k + 1)) {
        const noteTxt = line.replace(/[（()）]/g, '').trim();
        if (noteTxt) records.forEach(function (r) { if (r.customer === customer) r.note = (r.note ? r.note + ' ' : '') + noteTxt; });
        continue;
      }
      const wm = line.match(/寄\s*[車運]\s*([^\s)）]+)/) || line.match(/寄\s*([^\s)）]+)\s*$/);
      logistics = wm ? wm[1] : '';
      const _cand = line.replace(/[\(（]?\s*寄\s*[車運到去]?\s*[^\s)）]+\s*[）)]?/, '').replace(/自己載|自取/g, '').replace(/[\(（）\)]/g, '').trim();
      // Bug1/R1.1：純數字抬頭且該行無「寄」→ 預設不建寄運（1828 誤記防呆）；Task5：數字白名單放行。
      // Bug5a：指示句/含空白長句不得為客戶（fail-closed）。
      customer = (looksLikeInstruction(_cand) || (/^\d+$/.test(_cand) && !/寄/.test(line) && !isKnownShipCustomer(_cand))) ? '' : _cand;
    }
  }
  if (msgLogistics) records.forEach(function (r) { if (!r.logistics) r.logistics = msgLogistics; });
  return { count: records.length, records: records, unresolved: unresolvedItems };
}
function shippingCleanSummary(recs) {
  const byCust = {}; const order = [];
  recs.forEach(function (r) { const c = r.customer + (r.logistics ? '（寄車' + r.logistics + '）' : ''); if (!byCust[c]) { byCust[c] = []; order.push(c); } byCust[c].push('・' + r.name + (r.grade ? ' ' + r.grade : '') + ' ' + r.qty + (r.unit || '件') + (r.pack ? '（' + r.pack + '）' : '') + (r.note ? '（' + r.note + '）' : '')); });
  let out = '';
  order.forEach(function (c) { out += '【' + c + '】\n' + byCust[c].join('\n') + '\n'; });
  return out.trim();
}
function getMainCarrier() { const c = PROPS.getProperty('MAIN_CARRIER'); return c === null ? '旭陽' : c; }
// 判斷是否為「XX寄運資料」查詢結果被貼回來（第一行純日期 + 客戶用全形冒號「：」或含 📍）→ 不可當新單重記
function isShippingPullOutput(text) {
  const lines = String(text).split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  if (lines.length < 2) return false;
  if (!/^(?:\d{4}\/)?\d{1,2}\/\d{1,2}$/.test(lines[0])) return false;
  return /【.+?】/.test(text) || /：/.test(text) || /📍/.test(text);
}
function cancelShipping(text) {
  const lines = String(text).split('\n').map(function (l) { return l.trim(); });
  const today = parseYMD(Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd'));
  const sheet = getSheet(SHEET_SHIP); const data = sheet.getDataRange().getValues();
  const fullCustomers = []; const singleTargets = []; let curCust = '';
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k]; if (!line) continue;
    if (/確定\s*$/.test(line)) continue;
    const clr = line.match(/^([^：:【】]+?)\s*[：:].*清除\s*$/) || line.match(/^【(.+?)】\s*清除\s*$/);
    if (clr) { const c = clr[1].replace(/（.*$/, '').trim(); fullCustomers.push(c); curCust = c; continue; }
    const hmC = line.match(/^【(.+?)】\s*取消\s*$/) || line.match(/^([^：:【】]+?)\s*[：:]\s*取消\s*$/);
    if (hmC) { const c = hmC[1].replace(/（.*$/, '').trim(); fullCustomers.push(c); curCust = c; continue; }
    const nm = line.match(/^([^：:【】]+?)\s*[：:]\s*(.+)$/);
    if (nm) {
      curCust = nm[1].replace(/（.*$/, '').trim();   // ★ 記住目前客戶（不管有沒有取消）
      if (/取消/.test(nm[2])) {
        nm[2].split(/[、,，]/).forEach(function (part) { part = part.trim(); if (!/取消\s*$/.test(part) || !/\d/.test(part)) return; const it = parseShipItem(part.replace(/取消\s*$/, ''), false, []); singleTargets.push({ customer: curCust, name: it.name, grade: it.grade, qty: it.qty, pack: it.pack, unit: it.unit }); });
      }
      continue;
    }
    const hm = line.match(/^【(.+?)】/); if (hm) { curCust = hm[1].replace(/（.*$/, '').trim(); continue; }
    if (/取消\s*$/.test(line) && /\d/.test(line) && !/^📍/.test(line) && !/➜/.test(line)) {
      const it = parseShipItem(line.replace(/取消\s*$/, ''), false, []);
      singleTargets.push({ customer: curCust, name: it.name, grade: it.grade, qty: it.qty, pack: it.pack, unit: it.unit });
      continue;
    }
    // ★ 整筆刪除只在「明確指定」時才執行：該行去掉「取消」後為空或等於客戶名，且非 📍 備註行（避免 📍 行尾「取消」誤刪整筆）
    const _stripped = line.replace(/取消\s*$/, '').trim();
    if (/取消\s*$/.test(line) && curCust && !/^📍/.test(line) && (_stripped === '' || _stripped === curCust)) { fullCustomers.push(curCust); }
  }
  const toDelete = {}; const summary = [];
  fullCustomers.forEach(function (c) {
    let cnt = 0;
    for (let i = 1; i < data.length; i++) {
      if (toDelete[i]) continue;
      if (String(data[i][1]).indexOf(c) === -1) continue;
      if (ymdNum(data[i][0]) !== today) continue;
      toDelete[i] = true; cnt++;
    }
    if (cnt) summary.push('整筆刪除：' + c + '（' + cnt + ' 筆）');
  });
  singleTargets.forEach(function (t) {
    for (let i = data.length - 1; i >= 1; i--) {
      if (toDelete[i]) continue;
      if (t.customer && String(data[i][1]).indexOf(t.customer) === -1) continue;
      if (t.name && String(data[i][3]) !== t.name) continue;
      if (t.grade && String(data[i][4]) && String(data[i][4]) !== t.grade) continue;
      if (t.qty && String(data[i][5]) !== String(t.qty)) continue;
      if (t.unit && String(data[i][10]) && String(data[i][10]) !== t.unit) continue;
      if (t.pack && String(data[i][6]) && String(data[i][6]) !== t.pack) continue;
      toDelete[i] = true; summary.push('刪除：' + (data[i][1] || '') + ' ' + (data[i][3] || '') + ' ' + (data[i][5] || '') + (data[i][10] || '件')); break;
    }
  });
  const idx = Object.keys(toDelete).map(Number).sort(function (a, b) { return b - a; });
  idx.forEach(function (i) { sheet.deleteRow(i + 1); });
  return { count: idx.length, summary: summary };
}
function parseShipItem(s, stripCarrier, knownCarriers) {
  let rest = String(s).replace(/^[・·•]/, '').trim(); let pack = '';
  rest = rest.replace(/[（(]\s*([^)）]+?)\s*[）)]/g, function (_, inner) { const pm = String(inner).match(/(台子|紙箱|圓籃|袋子|箱)/); if (pm) pack = (pm[1] === '箱' ? '紙箱' : pm[1]); return ' '; });
  let qty = '', unit = '件';
  const qm = rest.match(/(\d+)\s*(件|台(?!子)|包|箱)/);
  if (qm) { qty = qm[1]; unit = qm[2]; if (qm[2] === '台' && !pack) pack = '台子'; rest = rest.slice(0, qm.index) + ' ' + rest.slice(qm.index + qm[0].length); }
  else { const qm2 = rest.match(/(?:^|\s)(\d+)\s*$/); if (qm2) { qty = qm2[1]; unit = '件'; rest = rest.replace(/\s*\d+\s*$/, ' ').trim(); } }
  rest = rest.replace(/\s+/g, ' ').trim();
  let logistics = '';
  if (stripCarrier) { for (let c = 0; c < knownCarriers.length; c++) { const cr = knownCarriers[c]; if (cr && rest.indexOf(cr) === 0 && rest.length > cr.length) { logistics = cr; rest = rest.slice(cr.length).trim(); break; } } }
  const tk = rest.split(/\s+/).filter(Boolean); let grade = '', name = '', gi = -1;
  for (let i = 0; i < tk.length; i++) { if (isGrade(tk[i])) { gi = i; break; } }
  if (gi >= 0) { grade = tk[gi]; name = tk.slice(0, gi).join(' '); } else name = tk.join(' ');
  return { name: name, grade: grade, qty: qty, pack: pack, unit: unit, logistics: logistics };
}
function handleShippingModify(text) {
  const lines = String(text).split('\n').map(function (l) { return l.trim(); });
  const sheet = getSheet(SHEET_SHIP); const data = sheet.getDataRange().getValues();
  const knownCarriers = Object.keys(getCarrierMap());
  let curCust = ''; const summary = []; let cnt = 0; const done = {}; const delRows = {};
  const findRow = function (customer, name, grade, qty, pack) {
    for (let i = data.length - 1; i >= 1; i--) {
      if (done[i]) continue;
      if (customer && String(data[i][1]).indexOf(customer) === -1) continue;
      if (name && String(data[i][3]) !== name) continue;
      if (grade && String(data[i][4]) && String(data[i][4]) !== grade) continue;
      if (qty && String(data[i][5]) !== String(qty)) continue;
      if (pack && String(data[i][6]) && String(data[i][6]) !== pack) continue;
      return i;
    }
    return -1;
  };
  const processSeg = function (cust, seg) {
    seg = seg.trim(); if (!seg) return;
    // ★ 清備註 / 改備註：只動第10欄(備註)，不刪品項、不改數量
    const ncl = seg.match(/^(.+?)\s*(?:清除|清|刪除|刪|取消)\s*備註\s*$/);
    if (ncl) {
      const o = parseShipItem(ncl[1], false, knownCarriers);
      const ri = findRow(cust, o.name, o.grade, o.qty, o.pack);
      if (ri >= 0) { sheet.getRange(ri + 1, 10).setValue(''); data[ri][9] = ''; done[ri] = true; summary.push('・' + data[ri][1] + ' ' + data[ri][3] + ' 已清除備註'); cnt++; }
      return;
    }
    const nst = seg.match(/^(.+?)\s*(?:改\s*備註|備註\s*改|設\s*定?\s*備註)\s*[:：]?\s*(\S.*?)\s*$/);
    if (nst) {
      const o = parseShipItem(nst[1], false, knownCarriers);
      const ri = findRow(cust, o.name, o.grade, o.qty, o.pack);
      if (ri >= 0) { const nb = nst[2].trim(); sheet.getRange(ri + 1, 10).setValue(nb); data[ri][9] = nb; done[ri] = true; summary.push('・' + data[ri][1] + ' ' + data[ri][3] + ' 備註 → ' + nb); cnt++; }
      return;
    }
    if (/取消\s*$/.test(seg)) {
      if (!/\d/.test(seg)) return;
      const it = parseShipItem(seg.replace(/取消\s*$/, ''), false, knownCarriers);
      const ri = findRow(cust, it.name, it.grade, it.qty, it.pack);
      if (ri >= 0) { delRows[ri] = true; done[ri] = true; summary.push('取消：' + data[ri][1] + ' ' + data[ri][3] + ' ' + data[ri][5] + (data[ri][10] || '件')); cnt++; }
      return;
    }
    const pkm = seg.match(/(.+?)\s*(?:改\s*(?:包裝|容器|成)?|改為|→|➜)\s*[（(]?\s*(台子|紙箱|圓籃|袋子|箱)\s*[）)]?\s*$/);
    if (pkm) {
      const o = parseShipItem(pkm[1], false, knownCarriers);
      const ri = findRow(cust, o.name, o.grade, o.qty, o.pack);
      if (ri >= 0) { const np = (pkm[2] === '箱' ? '紙箱' : pkm[2]); sheet.getRange(ri + 1, 7).setValue(np); data[ri][6] = np; done[ri] = true; summary.push('・' + data[ri][1] + ' ' + data[ri][3] + ' 容器 → ' + np); cnt++; }
      return;
    }
    if (!/修改|改\s*\d/.test(seg)) return;
    const qOnly = seg.match(/(?:改|修改)\s*(\d+)\s*$/);
    if (qOnly) {
      const newQty = parseInt(qOnly[1], 10);
      const o = parseShipItem(seg.replace(/(?:改|修改)\s*\d+\s*$/, ''), false, knownCarriers);
      const ri = findRow(cust, o.name, o.grade, o.qty, o.pack);
      if (ri >= 0) { sheet.getRange(ri + 1, 6).setValue(newQty); done[ri] = true; summary.push('・' + data[ri][1] + ' ' + data[ri][3] + ' ' + o.qty + (o.unit || '件') + ' → ' + newQty + (o.unit || '件')); cnt++; }
      return;
    }
    const parts = seg.split(/\s*修改\s*/);
    if (parts.length >= 2 && /\d/.test(parts[1])) {
      const o = parseShipItem(parts[0], false, knownCarriers);
      const nw = parseShipItem(parts[1], true, knownCarriers);
      const ri = findRow(cust, o.name, o.grade, o.qty, o.pack);
      if (ri >= 0) {
        if (nw.name) { sheet.getRange(ri + 1, 4).setValue(nw.name); data[ri][3] = nw.name; }
        sheet.getRange(ri + 1, 5).setValue(nw.grade || '');
        if (nw.qty) sheet.getRange(ri + 1, 6).setValue(nw.qty);
        sheet.getRange(ri + 1, 7).setValue(nw.pack || '');
        if (nw.logistics) sheet.getRange(ri + 1, 8).setValue(nw.logistics);
        done[ri] = true; cnt++;
        summary.push('・' + data[ri][1] + '：' + o.name + (o.grade ? ' ' + o.grade : '') + ' → ' + nw.name + (nw.grade ? ' ' + nw.grade : '') + ' ' + (nw.qty || o.qty) + (nw.unit || '件'));
      }
    }
  };
  const PKCHG = /(?:改\s*(?:包裝|容器|成)?|改為|→|➜)\s*[（(]?\s*(?:台子|紙箱|圓籃|袋子|箱)\s*[）)]?\s*$/;
  const NOTEOP = /(?:清除|清|刪除|刪|取消)\s*備註|改\s*備註|備註\s*改|設\s*定?\s*備註/;
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    const rn = line.match(/^【(.+?)】\s*修改\s*【(.+?)】/);
    if (rn) {
      const oldC = rn[1].replace(/（.*$/, '').trim(), newC = rn[2].replace(/（.*$/, '').trim(); let n = 0;
      for (let i = 1; i < data.length; i++) { if (String(data[i][1]).indexOf(oldC) !== -1) { sheet.getRange(i + 1, 2).setValue(newC); data[i][1] = newC; n++; } }
      if (n) { summary.push('客戶改名：' + oldC + ' → ' + newC + '（' + n + ' 筆）'); cnt += n; } curCust = newC; continue;
    }
    const hm = line.match(/^【(.+?)】\s*$/); if (hm) { curCust = hm[1].replace(/（.*$/, '').trim(); continue; }
    // ★ 貼回查詢的 📍備註行寫「清備註/取消備註/刪備註」→ 清掉目前【客戶】今天所有列的備註（📍行無品名，視為客戶層級；不刪品項）
    if (curCust && /^📍/.test(line) && /(?:清除|清|刪除|刪|取消)\s*備註/.test(line)) {
      const _td = parseYMD(Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd'));
      let n = 0;
      for (let i = 1; i < data.length; i++) { if (String(data[i][1]).indexOf(curCust) !== -1 && ymdNum(data[i][0]) === _td && data[i][9]) { sheet.getRange(i + 1, 10).setValue(''); data[i][9] = ''; done[i] = true; n++; } }
      if (n) { summary.push('・' + curCust + ' 已清除備註（' + n + ' 筆）'); cnt += n; }
      continue;
    }
    const cm = line.match(/^([^：:【】]+?)\s*[：:]\s*(.+)$/);
    if (cm && (/(修改|改\s*\d|取消)/.test(cm[2]) || PKCHG.test(cm[2]) || NOTEOP.test(cm[2]))) { const cust = cm[1].trim(); cm[2].split(/[、,，]/).forEach(function (s) { processSeg(cust, s); }); continue; }
    if (/(修改|改\s*\d|取消)/.test(line) || PKCHG.test(line) || NOTEOP.test(line)) processSeg(curCust, line.replace(/^[・·•]/, ''));
  }
  Object.keys(delRows).map(Number).sort(function (a, b) { return b - a; }).forEach(function (i) { sheet.deleteRow(i + 1); });
  if (!cnt) return { count: 0, reply: '🚚 找不到要修改/取消的寄運資料（品名/數量要跟畫面一致）。' };
  return { count: cnt, reply: '🚚 已處理寄運：\n' + summary.join('\n') };
}
function clearAllShipping() { const sheet = getSheet(SHEET_SHIP); const last = sheet.getLastRow(); const n = Math.max(0, last - 1); if (n > 0) sheet.deleteRows(2, n); return n; }
function clearAllRows(sheetName) { const sheet = getSheet(sheetName); const last = sheet.getLastRow(); const n = Math.max(0, last - 1); if (n > 0) sheet.deleteRows(2, n); return n; }
function shippingPull(key, dateArg) {
  const data = getSheet(SHEET_SHIP).getDataRange().getValues();
  const dates = String(dateArg).match(/(?:\d{4}\/)?\d{1,2}\/\d{1,2}/g) || [];
  let lo, hi, rangeLabel;
  if (dates.length) {
    const a = parseYMD(dates[0]), b = parseYMD(dates[1] || dates[0]);
    lo = Math.min(a, b); hi = Math.max(a, b);
    rangeLabel = dates[0] + (dates[1] ? '-' + dates[1] : '');
  } else { lo = hi = parseYMD(Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd')); rangeLabel = '今天'; }
  const carrierList = getCarrierCustomers(key);
  const PLACES = getPlaces();
  const byCust = {}; const byNote = {}; const order = []; let n = 0;
  for (let i = 1; i < data.length; i++) {
    const vendor = String(data[i][2]), logi = String(data[i][7] || ''), cust = String(data[i][1] || '');
    let hit;
    if (carrierList.length) { hit = (logi.indexOf(key) !== -1) || carrierList.some(function (c) { return cust.indexOf(c) !== -1 || c.indexOf(cust) !== -1; }); }
    else { hit = vendor.indexOf(key) !== -1 || logi.indexOf(key) !== -1 || cust.indexOf(key) !== -1; }
    if (!hit) continue;
    const d = ymdNum(data[i][0]); if (!d || d < lo || d > hi) continue;
    const c = cust;
    if (!byCust[c]) { byCust[c] = []; byNote[c] = []; order.push(c); }
    const _nm = (data[i][3] || ''); const _g = String(data[i][4] || '').trim(); const _q = (data[i][5] || ''); const _u = (data[i][10] && data[i][10] !== '件') ? data[i][10] : ''; const _p = data[i][6] ? '（' + data[i][6] + '）' : '';
    byCust[c].push((_nm + (_g ? ' ' + _g : '') + (_q ? ' ' + _q + _u : '') + _p).trim());
    if (data[i][9]) { const ex = expandPlace(data[i][9], PLACES); if (byNote[c].indexOf(ex) === -1) byNote[c].push(ex); }
    n++;
  }
  const headerDate = (rangeLabel === '今天') ? Utilities.formatDate(new Date(), 'Asia/Taipei', 'M/d') : rangeLabel;
  if (n === 0) return headerDate + '\n' + key + '：今天沒有寄運資料。';
  let out = headerDate;
  order.forEach(function (c) {
    out += '\n\n【' + c + '】';
    byCust[c].forEach(function (it) { out += '\n' + it; });
    if (byNote[c] && byNote[c].length) out += '\n　📍' + byNote[c].join('、');
  });
  return out;
}
// 已知寄運客戶名（今天寄運資料的客戶 + 物流商客戶名單），長的先比，供無冒號時辨識客戶
// Task5：既有數字客戶白名單（附錄B保底）+ 動態 knownShipCustomers。純數字抬頭僅白名單內放行。
var SHIP_NUM_WHITELIST = ['3088', '6986', '6959', '8887', '296', '927', '243', '918', '342', '1555', '7818', '5859', '6869', '9020'];
function isKnownShipCustomer(name) {
  const n = String(name == null ? '' : name).trim(); if (!n) return false;
  if (SHIP_NUM_WHITELIST.indexOf(n) !== -1) return true;
  try { return knownShipCustomers().indexOf(n) !== -1; } catch (e) { return false; }
}
function knownShipCustomers() {
  const set = {}; const arr = [];
  try { const d = getSheet(SHEET_SHIP).getDataRange().getValues(); for (let i = 1; i < d.length; i++) { const c = String(d[i][1] || '').trim(); if (c && !set[c]) { set[c] = 1; arr.push(c); } } } catch (e) { }
  const cm = getCarrierMap(); Object.keys(cm).forEach(function (k) { (cm[k] || []).forEach(function (c) { if (c && !set[c]) { set[c] = 1; arr.push(c); } }); });
  arr.sort(function (a, b) { return b.length - a.length; });
  return arr;
}
// 場外寫入寄運：解析品名(含等級/包裝)
function parseShipBody(body) {
  let pack = '';
  let s = String(body).replace(/[（(]\s*([^)）]+?)\s*[）)]/g, function (_, inner) { const pm = String(inner).match(/(台子|紙箱|圓籃|袋子|箱)/); if (pm) pack = (pm[1] === '箱' ? '紙箱' : pm[1]); return ' '; });
  s = s.replace(/\s+/g, ' ').trim();
  const tk = s.split(' ').filter(Boolean);
  let grade = '', name = '';
  if (tk.length >= 2 && isGrade(tk[tk.length - 1])) { grade = tk.pop(); name = tk.join(' '); }
  else {
    name = tk.join(' ');
    const gm = name.match(/(特大|特優|特|優|良|上|中|下|甲|乙|丙)$/);
    if (gm && name.length > gm[1].length) { grade = gm[1]; name = name.slice(0, name.length - gm[1].length).trim(); }
  }
  return { name: name, grade: grade, pack: pack };
}
// 指令：寄運 客戶：品名 (數量 / +N / -N / 修改N / 取消)；新舊客戶皆可
function handleShippingCmd(text) {
  const lines = String(text).split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  const ops = []; const known = knownShipCustomers();
  lines.forEach(function (raw) {
    let line = raw.replace(/^(?:\S{0,8}寄運(?:資料)?\s*(?:新增)?)\s*/, '').trim();
    if (!line) return;
    let cust = '', body = '';
    const cm2 = line.match(/^([^：:【】]+?)\s*[：:]\s*(.+)$/);   // 有冒號 → 直接分
    if (cm2) { cust = cm2[1].trim(); body = cm2[2].trim(); }
    else {                                                       // 沒冒號 → 先比已知客戶名，否則第一個詞當客戶
      for (let i = 0; i < known.length; i++) { if (line.indexOf(known[i]) === 0 && line.length > known[i].length) { cust = known[i]; body = line.slice(known[i].length).trim(); break; } }
      if (!cust) { const sp = line.split(/\s+/); if (sp.length < 2) return; cust = sp[0]; body = sp.slice(1).join(' '); }
    }
    if (!cust || !body) return;
    // 裸寫的器材名（台子／袋子／圓籃／紙箱／箱）— 數量前後皆可，例：高山228 特 +20 台子
    let barePack = '';
    body = body.replace(/(?:^|\s)(台子|袋子|圓籃|紙箱|箱)(?=\s|$)/g, function (_, p) { barePack = (p === '箱' ? '紙箱' : p); return ' '; }).replace(/\s+/g, ' ').trim();
    let mode = '', num = 0, mm;
    if (/取消\s*$/.test(body)) { mode = 'del'; body = body.replace(/取消\s*$/, '').trim(); }
    else if (mm = body.match(/(?:修改|改)\s*(\d+)\s*$/)) { mode = 'set'; num = parseInt(mm[1], 10); body = body.slice(0, mm.index).trim(); }
    else if (mm = body.match(/[+＋]\s*(\d+)\s*$/)) { mode = 'inc'; num = parseInt(mm[1], 10); body = body.slice(0, mm.index).trim(); }
    else if (mm = body.match(/[-－]\s*(\d+)\s*$/)) { mode = 'dec'; num = parseInt(mm[1], 10); body = body.slice(0, mm.index).trim(); }
    else if (mm = body.match(/(\d+)\s*$/)) { mode = 'set'; num = parseInt(mm[1], 10); body = body.slice(0, mm.index).trim(); }
    else return;
    const it = parseShipBody(body);
    if (!it.name) return;
    ops.push({ cust: cust, name: it.name, grade: it.grade, pack: it.pack || barePack, mode: mode, num: num });
  });
  if (!ops.length) return { count: 0, reply: '' };
  const sheet = getSheet(SHEET_SHIP); const data = sheet.getDataRange().getValues();
  const today = parseYMD(Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd'));
  const summary = [];
  ops.forEach(function (op) {
    let ri = -1;
    for (let i = data.length - 1; i >= 1; i--) {
      if (ymdNum(data[i][0]) !== today) continue;
      const dc = String(data[i][1]);
      if (dc.indexOf(op.cust) === -1 && op.cust.indexOf(dc) === -1) continue;
      if (norm(data[i][3]) !== norm(op.name)) continue;
      if (op.grade && String(data[i][4]) && String(data[i][4]) !== op.grade) continue;
      ri = i; break;
    }
    if (op.mode === 'del') {
      if (ri >= 0) { sheet.deleteRow(ri + 1); data.splice(ri, 1); summary.push('刪除：' + op.cust + ' ' + op.name); }
      else summary.push('找不到(未刪)：' + op.cust + ' ' + op.name);
      return;
    }
    if (ri >= 0) {
      const cur = Number(data[ri][5]) || 0;
      const nb = (op.mode === 'inc') ? cur + op.num : (op.mode === 'dec') ? Math.max(0, cur - op.num) : op.num;
      sheet.getRange(ri + 1, 6).setValue(nb); data[ri][5] = nb;
      if (op.pack && !String(data[ri][6] || '').trim()) { sheet.getRange(ri + 1, 7).setValue(op.pack); data[ri][6] = op.pack; }
      summary.push(op.cust + ' ' + op.name + (op.grade ? ' ' + op.grade : '') + (op.pack ? '（' + op.pack + '）' : '') + '：' + cur + ' → ' + nb);
    } else {
      const nb = (op.mode === 'dec') ? 0 : op.num;
      const row = [nowStr(), op.cust, '', op.name, op.grade || '', nb, op.pack || '', getMainCarrier(), '', '', '件'];
      sheet.appendRow(row); data.push(row);
      summary.push('新增：' + op.cust + ' ' + op.name + (op.grade ? ' ' + op.grade : '') + (op.pack ? '（' + op.pack + '）' : '') + ' ' + nb);
    }
  });
  return { count: summary.length, reply: '🚚 寄運已更新：\n' + summary.join('\n') };
}
function scanSlip(text, chatId) {
  const lines = String(text).split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l && !/^[-—─–_=]{3,}$/.test(l); });
  if (!lines.length) return { count: 0 };
  let customer = '';
  if (lines.length > 1 && !/[件*＊=＝]|扣除|損耗|價格修正|改\s*\d/.test(lines[0])) customer = lines[0];
  if (!customer) { const im = text.match(/^([^\n]*?)(?:扣除|損耗|價格修正|改\s*\d)/); if (im && im[1].trim()) customer = im[1].trim(); }
  if (!customer) customer = getGroupCustomer(chatId);
  if (!customer) return { count: 0 };
  const losses = [], changes = [];
  lines.forEach(function (line) {
    const lm = line.match(/(?:扣除|損耗)\s*(\d+)\s*件/);
    if (lm) losses.push({ qty: parseInt(lm[1], 10), note: line });
    if (/改\s*\d+\s*元/.test(line) || /價格修正/.test(line)) changes.push(line);
  });
  if (!losses.length && !changes.length) return { count: 0 };
  losses.forEach(function (l) { appendFinanceRecord(customer, '損耗', l.qty, l.note); });
  changes.forEach(function (c) { appendFinanceRecord(customer, '改價', '', c.replace(/^價格修正\s*/, '')); });
  const lossTotal = losses.reduce(function (s, l) { return s + l.qty; }, 0);
  return { count: losses.length + changes.length, customer: customer, lossTotal: lossTotal, lossCount: losses.length, changeCount: changes.length };
}
function slipSummary(s) {
  let t = '✅ 已記錄（' + s.customer + '）　' + nowStr() + '\n';
  if (s.lossCount) t += '📉 損耗：扣除合計 ' + s.lossTotal + ' 件（' + s.lossCount + ' 筆）\n';
  if (s.changeCount) t += '📝 改價：' + s.changeCount + ' 筆\n';
  return t.trim();
}

/* ========================== 【冰庫顯示 / 取消（精簡＋台子時序）】 ========================== */
function freezerOverview(filterCustomer) {
  const data = getSheet(SHEET_FREEZER).getDataRange().getValues();
  const latest = {}; const order = [];
  for (let i = 1; i < data.length; i++) {
    const c = data[i][1], p = data[i][2];
    if (!c && !p) continue;
    const key = norm(c) + '|' + norm(p);
    if (!(key in latest)) order.push(key);
    latest[key] = { c: c, p: p, bal: Number(data[i][5]) || 0 };
  }
  const byCust = {}; const custOrder = [];
  order.forEach(function (k) {
    const o = latest[k];
    if (o.bal <= 0) return;
    if (filterCustomer && String(o.c).indexOf(filterCustomer) === -1) return;
    if (!(o.c in byCust)) { byCust[o.c] = []; custOrder.push(o.c); }
    byCust[o.c].push(o);
  });
  if (custOrder.length === 0) return '❄️ ' + (filterCustomer ? '「' + filterCustomer + '」' : '') + '目前冰庫沒有寄存。';
  let out = '❄️ 冰庫庫存' + (filterCustomer ? '（' + filterCustomer + '）' : '') + '：';
  custOrder.forEach(function (c) {
    out += '\n\n【' + c + '】';
    byCust[c].forEach(function (o) {
      let pack = '';
      const pn = String(o.p || '(未填品名)').replace(/[(（]\s*(台子|圓籃|袋子|紙箱|箱)\s*[)）]/g, function (_, p) { pack = p; return ''; }).replace(/\s+/g, ' ').trim();
      out += '\n' + pn + '：' + o.bal + (pack ? '（' + pack + '）' : '');
    });
  });
  return out;
}
function handleFreezerCancel(text) {
  const lines = String(text).split('\n').map(function (l) { return l.trim(); });
  const data = getSheet(SHEET_FREEZER).getDataRange().getValues();
  const latest = {}; const order = [];
  for (let i = 1; i < data.length; i++) {
    const c = data[i][1], p = data[i][2]; if (!c && !p) continue;
    const key = norm(c) + '|' + norm(p);
    if (!(key in latest)) order.push(key);
    latest[key] = { c: c, p: p, bal: Number(data[i][5]) || 0 };
  }
  const custEq = function (a, b) { return norm(a) === norm(b) || stripPack(a) === stripPack(b); };
  let curCust = ''; const cancelCusts = {}; const cancelItems = []; const modItems = []; const packItems = [];
  for (let j = 0; j < lines.length; j++) {
    const line = lines[j];
    if (/冰庫庫存|在外面共|^❄️/.test(line)) continue;
    const hmC = line.match(/^【(.+?)】\s*(?:取消|清除)\s*$/);
    if (hmC) { const c = hmC[1].trim(); cancelCusts[c] = true; curCust = c; continue; }   // 整個客戶取消/清除（保留完整名，比對時去包裝）
    const hm = line.match(/^【(.+?)】\s*(.*)$/);
    if (hm) {
      curCust = hm[1].trim();
      const rest = hm[2].trim();
      if (rest) rest.split(/[、,，]/).forEach(function (seg) {
        seg = seg.trim(); if (!/取消|清除/.test(seg)) return;
        const prod = seg.replace(/(?:取消|清除)\s*$/, '').replace(/[：:].*$/, '').replace(/\s+\d+.*$/, '').trim();
        cancelItems.push({ cust: curCust, prod: prod });
      });
      continue;
    }
    if (curCust) {   // 改容器：品名 … 改圓籃／改容器 圓籃／→圓籃
      const pkm = line.match(/^(.+?)\s*(?:改\s*(?:包裝|容器|成)?|改為|→|➜)\s*[（(]?\s*(台子|紙箱|圓籃|袋子|箱)\s*[）)]?\s*$/);
      if (pkm) { const prod = pkm[1].replace(/[：:]\s*\d+.*$/, '').replace(/^[・·•　\s]+/, '').trim(); if (prod) { packItems.push({ cust: curCust, prod: prod, newPack: pkm[2] === '箱' ? '紙箱' : pkm[2] }); continue; } }
    }
    if (curCust && (/(?:修改|改)\s*\d+\s*$/.test(line) || /(?:取消|清除)\s*$/.test(line))) {
      const modM = line.match(/(?:修改|改)\s*(\d+)\s*$/);
      const prod = line.replace(/(?:修改|改)\s*\d+\s*$|(?:取消|清除)\s*$/, '').replace(/[：:]\s*\d+.*$/, '').replace(/^[・·•　\s]+/, '').trim();
      if (prod) {
        if (modM) modItems.push({ cust: curCust, prod: prod, target: parseInt(modM[1], 10) });
        else cancelItems.push({ cust: curCust, prod: prod });
      }
    }
  }
  const sheet = getSheet(SHEET_FREEZER); const summary = []; const rows = []; const now = nowStr();
  Object.keys(cancelCusts).forEach(function (cust) {
    order.forEach(function (k) { const o = latest[k]; if (custEq(o.c, cust) && o.bal > 0) { rows.push([now, o.c, o.p, '校正', 0, 0]); latest[k].bal = 0; summary.push('整筆取消：' + o.c + ' ' + (o.p || '(未填品名)')); } });
  });
  // 精確優先比對（先 norm 完全相同，再去包裝相同；不做模糊包含，避免比到別的品項）
  const findKey = function (cust, prod) {
    let exactK = null, exactKpos = null, stripK = null, stripKpos = null;
    order.forEach(function (k) {
      const o = latest[k]; if (!custEq(o.c, cust)) return;
      if (prod === '' ? !norm(o.p) : norm(o.p) === norm(prod)) { if (exactK === null) exactK = k; if (o.bal > 0 && exactKpos === null) exactKpos = k; }
      else if (prod !== '' && stripPack(o.p) === stripPack(prod)) { if (stripK === null) stripK = k; if (o.bal > 0 && stripKpos === null) stripKpos = k; }
    });
    return exactKpos !== null ? exactKpos : (exactK !== null ? exactK : (stripKpos !== null ? stripKpos : stripK));   // 優先比對餘額>0的活紀錄，避免比到改容器留下的0餘額殭屍
  };
  cancelItems.forEach(function (it) {
    const k = findKey(it.cust, it.prod);
    if (k !== null && latest[k].bal > 0) { const o = latest[k]; rows.push([now, o.c, o.p, '校正', 0, 0]); latest[k].bal = 0; summary.push('取消：' + o.c + ' ' + (o.p || '(未填品名)')); }
  });
  modItems.forEach(function (it) {
    const k = findKey(it.cust, it.prod);
    if (k !== null) { const o = latest[k]; rows.push([now, o.c, o.p, '校正', it.target, it.target]); latest[k].bal = it.target; summary.push('修改：' + o.c + ' ' + (o.p || '?') + ' → ' + it.target); }
    else { rows.push([now, it.cust, it.prod, '校正', it.target, it.target]); summary.push('設定（新品項）：' + it.cust + ' ' + it.prod + ' → ' + it.target); }
  });
  packItems.forEach(function (it) {
    const k = findKey(it.cust, it.prod);
    if (k === null) { summary.push('改容器找不到：' + it.cust + ' ' + it.prod); return; }
    const o = latest[k]; const bal = latest[k].bal;
    const base = String(o.p).replace(/[(（]\s*(台子|圓籃|袋子|紙箱|箱)\s*[)）]/g, '').replace(/\s+/g, ' ').trim();
    const newProd = base + '（' + it.newPack + '）';
    if (norm(newProd) === norm(o.p)) { summary.push('容器未變：' + o.c + ' ' + base); return; }
    rows.push([now, o.c, o.p, '校正', 0, 0]); latest[k].bal = 0;          // 舊品項（舊容器）歸0
    rows.push([now, o.c, newProd, '校正', bal, bal]);                      // 新容器品項沿用原餘額
    summary.push('改容器：' + o.c + ' ' + base + ' → ' + it.newPack + '（' + bal + '）');
  });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  return { count: rows.length, reply: rows.length ? '🧊 冰庫已更新（' + rows.length + ' 筆）：\n' + summary.join('\n') : '' };
}
/* ---- 查某客戶+品名目前冰庫餘額（台子防呆用：有庫存代表台子已於寄冰時記過）---- */
function freezerBalanceOf(customer, product) {
  try {
    const data = getSheet(SHEET_FREEZER).getDataRange().getValues();
    const ck = norm(customer), pk = stripPack(product);
    let bal = 0, found = false;
    for (let i = 1; i < data.length; i++) {
      if (norm(data[i][1]) !== ck) continue;
      if (stripPack(data[i][2]) !== pk) continue;
      bal = Number(data[i][5]) || 0; found = true;   // 取最後一筆＝最新餘額
    }
    return found ? bal : 0;
  } catch (e) { return 0; }
}
/* ---- 場外一行寫入冰庫（與寄運場外指令相同邏輯）---- */
function knownFreezerCustomers() {
  const set = {}; const arr = [];
  try { const d = getSheet(SHEET_FREEZER).getDataRange().getValues(); for (let i = 1; i < d.length; i++) { const c = String(d[i][1] || '').trim(); if (c && !set[c]) { set[c] = 1; arr.push(c); } } } catch (e) { }
  arr.sort(function (a, b) { return b.length - a.length; });
  return arr;
}
function handleFreezerCmd(text) {
  const lines = String(text).split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  const ops = []; const known = knownFreezerCustomers();
  lines.forEach(function (raw) {
    let hadPrefix = false; let line = raw;
    if (/^寄冰\s/.test(line)) { line = line.replace(/^寄冰\s*/, '').trim(); hadPrefix = true; }
    if (!line || /^冰$/.test(line)) return;
    let cust = '', body = '';
    const cm2 = line.match(/^([^：:【】]+?)\s*[：:]\s*(.+)$/);
    if (cm2) { cust = cm2[1].trim(); body = cm2[2].trim(); }
    else {
      for (let i = 0; i < known.length; i++) { if (line.indexOf(known[i]) === 0 && line.length > known[i].length) { cust = known[i]; body = line.slice(known[i].length).trim(); break; } }
      if (!cust) { if (!hadPrefix) return; const sp = line.split(/\s+/); if (sp.length < 2) return; cust = sp[0]; body = sp.slice(1).join(' '); }
    }
    if (!cust || !body) return;
    // 容器（括號或裸寫）
    let pack = '';
    body = body.replace(/[（(]\s*([^)）]*?)(台子|圓籃|袋子|紙箱|箱)\s*[)）]/g, function (_, a, p) { pack = (p === '箱' ? '紙箱' : p); return ' '; });
    body = body.replace(/(?:^|\s)(台子|袋子|圓籃|紙箱|箱)(?=\s|$)/g, function (_, p) { pack = (p === '箱' ? '紙箱' : p); return ' '; }).replace(/\s+/g, ' ').trim();
    let mode = '', num = 0, mm;
    if (/取消\s*$/.test(body)) { mode = 'del'; body = body.replace(/取消\s*$/, '').trim(); }
    else if (mm = body.match(/(?:修改|改|設定)\s*(\d+)\s*$/)) { mode = 'set'; num = parseInt(mm[1], 10); body = body.slice(0, mm.index).trim(); }
    else if (mm = body.match(/[+＋]\s*(\d+)\s*$/)) { mode = 'inc'; num = parseInt(mm[1], 10); body = body.slice(0, mm.index).trim(); }
    else if (mm = body.match(/[-－]\s*(\d+)\s*$/)) { mode = 'dec'; num = parseInt(mm[1], 10); body = body.slice(0, mm.index).trim(); }
    else if (mm = body.match(/(\d+)\s*(?:件|台(?!子)|包|箱)?\s*$/)) { mode = 'inc'; num = parseInt(mm[1], 10); body = body.slice(0, mm.index).trim(); }   // 裸數字＝入庫累加（寄冰＝寄存）
    else return;
    const prod = body.replace(/\s+/g, ' ').trim();   // 品名（含等級，原樣保留）
    if (!prod && mode !== 'del') return;
    ops.push({ cust: cust, product: prod + (pack ? '（' + pack + '）' : ''), pack: pack, mode: mode, num: num });
  });
  if (!ops.length) return { count: 0, reply: '' };
  const sheet = getSheet(SHEET_FREEZER); const summary = [];
  const lock = acquireLock(5000);
  try {
    const data = sheet.getDataRange().getValues();
    const bal = {}; const found = {};
    for (let i = 1; i < data.length; i++) { const k = norm(data[i][1]) + '|' + norm(data[i][2]); bal[k] = Number(data[i][5]) || 0; found[k] = { c: data[i][1], p: data[i][2] }; }
    const rows = [];
    ops.forEach(function (op) {
      let key = norm(op.cust) + '|' + norm(op.product); let storedProd = op.product;
      if (!(key in bal)) {   // 試以去容器比對既有品項
        const target = stripPack(op.product);
        for (const k in found) { if (norm(found[k].c) === norm(op.cust) && stripPack(found[k].p) === target) { key = k; storedProd = found[k].p; break; } }
      }
      const cur = bal[key] || 0;
      let nb, action;
      if (op.mode === 'del') { nb = 0; action = '校正'; }
      else if (op.mode === 'inc') { nb = cur + op.num; action = '入庫'; }
      else if (op.mode === 'dec') { nb = Math.max(0, cur - op.num); action = '出庫'; }
      else { nb = op.num; action = '校正'; }
      const realCust = (key in found) ? found[key].c : op.cust;
      rows.push([nowStr(), realCust, storedProd, action, (action === '入庫' || action === '出庫') ? op.num : nb, nb]);
      bal[key] = nb;
      if (op.mode === 'del') summary.push('取消歸0：' + realCust + ' ' + storedProd);
      else summary.push(realCust + ' ' + storedProd + '：' + cur + ' → ' + nb);
    });
    if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  } finally { lock.releaseLock(); }
  return { count: summary.length, reply: '🧊 冰庫已更新：\n' + summary.join('\n') };
}

/* ========================== 【鐵架/台子 未收回】 ========================== */
function rackOutstanding(filterCustomer) {
  const data = getSheet(SHEET_RACK).getDataRange().getValues();
  const net = {}; const order = [];
  for (let i = 1; i < data.length; i++) {
    const action = data[i][2], rackId = data[i][3] || '(未填編號)', qty = Number(data[i][4]) || 0, cust = data[i][5] || '(未填客戶)';
    if (!action) continue;
    const key = cust + '｜' + rackId;
    if (!(key in net)) { net[key] = { cust: cust, rackId: rackId, n: 0 }; order.push(key); }
    if (action === '出庫') net[key].n += qty;
    else if (action === '入庫') net[key].n -= qty;
  }
  const byCust = {}; const custOrder = []; let totalOut = 0;
  order.forEach(function (k) {
    const o = net[k];
    if (o.n <= 0) return;
    if (filterCustomer && String(o.cust).indexOf(filterCustomer) === -1) return;
    if (!(o.cust in byCust)) { byCust[o.cust] = []; custOrder.push(o.cust); }
    byCust[o.cust].push(o);
    totalOut += o.n;
  });
  if (custOrder.length === 0) return filterCustomer ? '🔧 「' + filterCustomer + '」目前沒有未收回的鐵架。' : '🔧 目前沒有客戶有未收回的鐵架，全部都收回來了 👍';
  let out = '🔧 鐵架未收回' + (filterCustomer ? '（' + filterCustomer + '）' : '（誰還沒還）') + '：';
  custOrder.forEach(function (c) {
    out += '\n\n【' + c + '】';
    byCust[c].forEach(function (o) { out += '\n　' + o.rackId + ' ×' + o.n; });
  });
  out += '\n\n📦 在外面共 ' + totalOut + ' 支';
  return out;
}
function taiziOutstanding() {
  const data = getSheet(SHEET_TAIZI).getDataRange().getValues();
  const net = {}; const order = [];
  for (let i = 1; i < data.length; i++) {
    const action = data[i][2], item = data[i][3] || '台子', qty = Number(data[i][4]) || 0, cust = data[i][5] || '(未填客戶)';
    if (!action) continue;
    if (/寄運資料|清除|確定|🚚|^【/.test(String(cust))) continue;
    const key = cust + '｜' + item;
    if (!(key in net)) { net[key] = { cust: cust, item: item, n: 0 }; order.push(key); }
    if (action === '出庫') net[key].n += qty;
    else if (action === '入庫') net[key].n -= qty;
  }
  const byCust = {}; const custOrder = []; let totalOut = 0;
  order.forEach(function (k) {
    const o = net[k];
    if (o.n <= 0) return;
    if (!(o.cust in byCust)) { byCust[o.cust] = []; custOrder.push(o.cust); }
    byCust[o.cust].push(o); totalOut += o.n;
  });
  if (custOrder.length === 0) return '🥡 目前沒有客戶有未收回的台子，全部都收回來了 👍';
  let out = '🥡 台子未收回（誰還沒還）：';
  custOrder.forEach(function (c) {
    out += '\n\n【' + c + '】';
    byCust[c].forEach(function (o) { out += '\n　' + o.item + ' ×' + o.n; });
  });
  out += '\n\n📦 在外面共 ' + totalOut + ' 個';
  return out;
}
function taiziLeftFor(customer) {
  const data = getSheet(SHEET_TAIZI).getDataRange().getValues();
  let n = 0;
  for (let i = 1; i < data.length; i++) {
    if (norm(data[i][5]) !== norm(customer)) continue;
    const q = Number(data[i][4]) || 0;
    if (data[i][2] === '出庫') n += q; else if (data[i][2] === '入庫') n -= q;
  }
  return n;
}
function handleTaiziSheet(text) {
  const lines = String(text).split('\n').map(function (l) { return l.trim(); });
  let curCust = ''; const collects = []; const cancels = {}; const modifies = [];
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k];
    const hmC = line.match(/^【(.+?)】\s*取消\s*$/);
    if (hmC) { const c = hmC[1].replace(/（.*$/, '').trim(); cancels[c] = true; curCust = c; continue; }
    const hm = line.match(/^【(.+?)】/);
    if (hm) { curCust = hm[1].replace(/（.*$/, '').trim(); continue; }
    if (/台子/.test(line) && /[×xX*]\s*\d/.test(line)) {
      const mm = line.match(/修改\s*(\d+)/);
      const sm = line.match(/收\s*(\d+)/);
      if (mm) modifies.push({ cust: curCust, target: parseInt(mm[1], 10) });
      else if (sm) collects.push({ cust: curCust, m: parseInt(sm[1], 10) });
      else if (/取消\s*$/.test(line) && curCust) cancels[curCust] = true;
    }
  }
  if (!collects.length && !Object.keys(cancels).length && !modifies.length) return { count: 0, reply: '' };
  const tz = getSheet(SHEET_TAIZI);
  const data = tz.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < data.length; i++) {
    const c = String(data[i][5]); const q = Number(data[i][4]) || 0;
    if (data[i][2] === '出庫') out[c] = (out[c] || 0) + q;
    else if (data[i][2] === '入庫') out[c] = (out[c] || 0) - q;
  }
  const rows = []; const summary = []; const now = nowStr();
  modifies.forEach(function (mo) {
    if (!mo.cust) return;
    const cur = out[mo.cust] || 0; const delta = mo.target - cur;
    if (delta > 0) rows.push([now, '', '出庫', '台子', delta, mo.cust]);
    else if (delta < 0) rows.push([now, '', '入庫', '台子', -delta, mo.cust]);
    out[mo.cust] = mo.target;
    summary.push('修改台子：' + mo.cust + ' → ' + mo.target + ' 個');
  });
  collects.forEach(function (c) {
    if (!c.cust || !c.m) return;
    rows.push([now, '', '入庫', '台子', c.m, c.cust]);
    out[c.cust] = (out[c.cust] || 0) - c.m;
    summary.push('收台子：' + c.cust + ' ×' + c.m + '（剩 ' + Math.max(0, out[c.cust]) + '）');
  });
  Object.keys(cancels).forEach(function (cust) {
    const left = (out[cust] || 0);
    if (left > 0) { rows.push([now, '', '入庫', '台子', left, cust]); out[cust] = 0; }
    summary.push('整筆取消：' + cust + '（台子歸 0）');
  });
  if (rows.length) tz.getRange(tz.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  return { count: collects.length + Object.keys(cancels).length + modifies.length, reply: '🥡 台子更新：\n' + summary.join('\n') };
}
function handleTaiziCollectInline(text) {
  const line = String(text).trim();
  if (line.indexOf('\n') !== -1) return { count: 0, reply: '' };
  const m = line.match(/^(\S+)\s+台子\s*[×xX*]?\s*(\d*)\s*收\s*(\d*)\s*$/);
  if (!m) return { count: 0, reply: '' };
  const customer = m[1].trim();
  const qty = parseInt(m[2] || m[3], 10);
  if (!customer || !qty || qty <= 0) return { count: 0, reply: '' };
  getSheet(SHEET_TAIZI).appendRow([nowStr(), '', '入庫', '台子', qty, customer]);
  const left = Math.max(0, taiziLeftFor(customer));
  let reply = '🥡 已收台子：' + customer + ' ×' + qty + '\n剩餘未收：' + left + ' 個';
  if (left === 0) reply += '（全部收回 👍）';
  return { count: 1, reply: reply };
}

/* ========================== 【今日記錄 / 改價 / 損耗 查詢】 ========================== */
function todayLog(sheetName) {
  const data = getSheet(sheetName).getDataRange().getValues();
  const todayNum = parseYMD(Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd'));
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    if (ymdNum(data[i][0]) !== todayNum) continue;
    if (sheetName === SHEET_RACK) {
      rows.push('・' + fmtTime(data[i][0]) + '　' + (data[i][2] || '') + ' ' + (data[i][3] || '') + ' ×' + (data[i][4] || '') + ' ' + (data[i][5] || ''));
    } else {
      rows.push('・' + fmtTime(data[i][0]) + '　' + (data[i][1] || '') + ' ' + (data[i][2] || '') + ' ' + (data[i][3] || '') + ' ' + (data[i][4] || ''));
    }
  }
  const title = (sheetName === SHEET_RACK) ? '🔧 今天的鐵架記錄' : '❄️ 今天的冰庫記錄';
  if (rows.length === 0) return title + '：今天還沒有任何記錄。';
  let out = title + '（共 ' + rows.length + ' 筆）：\n' + rows.slice(-40).join('\n');
  if (out.length > 4500) out = out.slice(0, 4500) + '\n…(太多了，只顯示一部分)';
  return out;
}
function queryPriceChanges(filterCustomer) {
  const data = getSheet(SHEET_FINANCE).getDataRange().getValues();
  const rows = [];
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][2] !== '改價') continue;
    if (filterCustomer && String(data[i][1]).indexOf(filterCustomer) === -1) continue;
    rows.push('・' + fmtTime(data[i][0]) + '　' + (data[i][1] || '(未填客戶)') + '：' + (data[i][4] || ''));
    if (rows.length >= 20) break;
  }
  if (rows.length === 0) return '📝 沒有找到' + (filterCustomer ? '「' + filterCustomer + '」的' : '') + '改價紀錄。';
  return '📝 改價紀錄' + (filterCustomer ? '（' + filterCustomer + '）' : '（最近 ' + rows.length + ' 筆）') + '：\n' + rows.join('\n');
}
function lossQuery(arg) {
  arg = String(arg).trim();
  const data = getSheet(SHEET_FINANCE).getDataRange().getValues();
  const dates = arg.match(/(?:\d{4}\/)?\d{1,2}\/\d{1,2}/g) || [];
  let lo = null, hi = null, rangeLabel = '';
  if (dates.length) {
    const a = parseYMD(dates[0]), b = parseYMD(dates[1] || dates[0]);
    lo = Math.min(a, b); hi = Math.max(a, b);
    rangeLabel = dates[0] + (dates[1] ? '-' + dates[1] : '');
  }
  let cust = arg;
  dates.forEach(function (d) { cust = cust.replace(d, ' '); });
  cust = cust.replace(/[-~～至到]+/g, ' ').replace(/\s+/g, ' ').trim();
  const rows = []; let sum = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] !== '損耗') continue;
    if (cust && String(data[i][1]).indexOf(cust) === -1) continue;
    if (lo !== null) { const d = ymdNum(data[i][0]); if (!d || d < lo || d > hi) continue; }
    const q = Number(data[i][3]) || 0; sum += q;
    rows.push('・' + fmtTime(data[i][0]) + '　' + (data[i][1] || '(未填客戶)') + ' 扣除 ' + q + ' 件');
  }
  if (rows.length === 0) return '📉 沒有找到' + (cust ? '「' + cust + '」' : '') + (rangeLabel ? '（' + rangeLabel + '）' : '') + '的損耗紀錄。';
  let out = '📉 損耗紀錄' + (cust ? '・' + cust : '') + (rangeLabel ? '（' + rangeLabel + '）' : '') + '：\n';
  out += rows.slice(-50).join('\n') + '\n――――――\n共 ' + rows.length + ' 筆，扣除合計：' + sum + ' 件';
  return out;
}
function fmtTime(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'MM/dd HH:mm');
  const m = String(v).match(/\d{4}\/(\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2})/);
  return m ? m[1] : String(v);
}

/* ========================== 【群組訊息 / 入職 / 借支】 ========================== */
function dailyMessages(currentGroupId) {
  const data = msgTail(5000);
  const today = parseYMD(Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd'));
  const items = [];
  for (let i = 1; i < data.length; i++) {
    if (ymdNum(data[i][0]) !== today) continue;
    const g = String(data[i][3] || '');
    if (currentGroupId && g !== currentGroupId) continue;
    const msg = String(data[i][1]).trim(); if (!msg) continue;
    if (isNoiseBlock(msg)) continue;
    if (/^\[(貼圖|圖片|影片|語音|檔案|位置|其他)\]$/.test(msg)) continue;
    if (/^(查\S*(鐵架|台子|冰庫|改價|損耗|出勤|客戶|庫存)|搜尋|收尋|搜\S|件數|總件數|統整|統計|金額統整|金額統計|拉出|拉訊息|今日對話|當日對話|今日訊息|當日訊息|今日群組|當日群組|#)/.test(msg)) continue;
    const tm = String(data[i][0]).match(/(\d{1,2}:\d{2})/);
    items.push('🕘 ' + (tm ? tm[1] : '') + '\n' + msg);
  }
  if (!items.length) return '📋 今天還沒有群組訊息紀錄。';
  const head = '📋 今日群組訊息（共 ' + items.length + ' 則，已濾掉機器人輸出）：\n\n';
  let out = head + items.join('\n――――――\n');
  if (out.length > 4800) out = head + '（訊息較多，顯示最近 30 則）\n\n' + items.slice(-30).join('\n――――――\n');
  return out;
}
function extractDate(s) {
  const dm = String(s).match(/(?:(\d{4})\/)?(\d{1,2})[\/月](\d{1,2})日?/);
  if (!dm) return { when: '', rest: String(s).trim() };
  const y = dm[1] ? parseInt(dm[1], 10) : (new Date()).getFullYear();
  const mo = ('0' + dm[2]).slice(-2), da = ('0' + dm[3]).slice(-2);
  const rest = String(s).replace(dm[0], ' ').replace(/[^\S\n]+/g, ' ').trim();
  return { when: y + '/' + mo + '/' + da + ' 00:00:00', rest: rest };
}
function recordHire(name, when) {
  const sheet = getSheet(SHEET_HIRE); const data = sheet.getDataRange().getValues();
  const _idx = buildAliasIndex(); name = normalizeEmployeeName(name, _idx);   // SSOT：入職寫入前正規化
  for (let i = 1; i < data.length; i++) { if (normalizeEmployeeName(data[i][0], _idx) === name) return { exists: true, time: String(data[i][1]) }; }
  const t = when || nowStr(); sheet.appendRow([name, t]); return { exists: false, time: t };
}
function hireQuery(name) {
  const data = getSheet(SHEET_HIRE).getDataRange().getValues();
  const _idx = buildAliasIndex();                                   // SSOT
  if (name) {
    const target = normalizeEmployeeName(name, _idx);
    for (let i = 1; i < data.length; i++) { if (normalizeEmployeeName(data[i][0], _idx).indexOf(target) !== -1) return '📅 ' + normalizeEmployeeName(data[i][0], _idx) + ' 入職時間：\n' + data[i][1]; }
    return '查無「' + name + '」的入職記錄。\n（打「' + name + '入職」可記錄）';
  }
  const rows = [];
  for (let i = 1; i < data.length; i++) { if (data[i][0]) rows.push('・' + normalizeEmployeeName(data[i][0], _idx) + '：' + data[i][1]); }
  return rows.length ? '📅 員工入職時間（' + rows.length + '）：\n' + rows.join('\n') : '目前沒有入職記錄。打「員工名入職」即可記錄。';
}
function recordLoan(name, type, amount, when) { getSheet(SHEET_LOAN).appendRow([when || nowStr(), normalizeEmployeeName(name), type, amount]); }   // SSOT：借支寫入前正規化
function loanQuery(name) {
  const data = getSheet(SHEET_LOAN).getDataRange().getValues();
  if (name) {
    let net = 0; const list = []; let found = '';
    const _idx = buildAliasIndex(); const target = normalizeEmployeeName(name, _idx);   // SSOT
    for (let i = 1; i < data.length; i++) {
      const _n = normalizeEmployeeName(data[i][1], _idx);
      if (_n.indexOf(target) === -1) continue;
      found = _n; const amt = Number(data[i][3]) || 0; const t = String(data[i][2]);
      const md = mdOf(data[i][0]); const ds = md ? (md + ' ') : '';
      if (t === '還') { net -= amt; list.push('　' + ds + '還 ' + amt); }
      else { net += amt; list.push('　' + ds + '借 ' + amt); }
    }
    if (!found) return '查無「' + name + '」的借支記錄。';
    return '💵 ' + found + ' 借支明細：\n' + list.join('\n') + '\n――――――\n目前未還：' + net + ' 元';
  }
  const map = {}; const order = []; const _idx = buildAliasIndex();   // SSOT：未還合計依正式姓名合併
  for (let i = 1; i < data.length; i++) { const n = normalizeEmployeeName(data[i][1], _idx); if (!n) continue; if (!(n in map)) { map[n] = 0; order.push(n); } const amt = Number(data[i][3]) || 0; map[n] += (String(data[i][2]) === '還' ? -amt : amt); }
  if (!order.length) return '目前沒有借支記錄。打「員工名借金額」即可記錄。';
  let total = 0; const lines = order.map(function (n) { total += map[n]; return '・' + n + '：' + map[n] + ' 元'; });
  return '💵 員工借支未還（' + order.length + ' 人）：\n' + lines.join('\n') + '\n――――――\n合計未還：' + total + ' 元';
}
function loanDetailAll() {
  const data = getSheet(SHEET_LOAN).getDataRange().getValues();
  const byName = {}; const order = []; const _idx = buildAliasIndex();   // SSOT：借支明細依正式姓名合併
  for (let i = 1; i < data.length; i++) {
    const n = normalizeEmployeeName(data[i][1], _idx); if (!n) continue;
    if (!(n in byName)) { byName[n] = { recs: [], net: 0, borrow: 0, repay: 0 }; order.push(n); }
    const amt = Number(data[i][3]) || 0; const t = String(data[i][2]);
    const ds = mdOf(data[i][0]) || '?';
    if (t === '還') { byName[n].net -= amt; byName[n].repay += amt; byName[n].recs.push('　' + ds + '　還 ' + amt); }
    else { byName[n].net += amt; byName[n].borrow += amt; byName[n].recs.push('　' + ds + '　借 ' + amt); }
  }
  if (!order.length) return '目前沒有借支記錄。打「員工名借金額」即可記錄。';
  let total = 0;
  const blocks = order.map(function (n) {
    const o = byName[n]; total += o.net;
    return '👤 ' + n + '（借 ' + o.borrow + '／還 ' + o.repay + '／未還 ' + o.net + '）\n' + o.recs.join('\n');
  });
  return '💵 借支明細（全部）：\n\n' + blocks.join('\n\n') + '\n――――――\n合計未還：' + total + ' 元';
}

/* ========================== 【空車重量】 ========================== */
function tareImport(text) {
  const clean = function (g) { return String(g || '').replace(/查空車重量|查空車|查/g, '').replace(/[（）()【】,，、]/g, '').replace(/\s+/g, '').trim(); };
  const raw = String(text);
  const re = /車牌\s*(\d+)\s*([^\d]*?)\s*空車重量\s*(\d+)\s*(?:kg|KG|公斤)?/g;
  const entries = []; let m; let prevEnd = 0;
  while ((m = re.exec(raw)) !== null) { entries.push({ plate: m[1], between: clean(m[2]), weight: parseInt(m[3], 10), gapBefore: raw.slice(prevEnd, m.index) }); prevEnd = re.lastIndex; }
  const tailGap = raw.slice(prevEnd);
  entries.forEach(function (e) { e.name = e.between || clean(e.gapBefore); });
  if (entries.length) { const last = entries[entries.length - 1]; if (!last.name) last.name = clean(tailGap); }
  if (!entries.length) return { count: 0, entries: [] };
  const prev = tareLatest().map;
  entries.forEach(function (e) { if (!e.name && prev[e.plate]) e.name = prev[e.plate].name; });
  const sheet = getSheet(SHEET_TARE); const now = nowStr();
  const rows = entries.map(function (e) { return [e.plate, e.weight, e.name, now]; });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
  return { count: entries.length, entries: entries };
}
function tareDelete(plate) {
  const sheet = getSheet(SHEET_TARE); const data = sheet.getDataRange().getValues(); const toDel = [];
  for (let i = 1; i < data.length; i++) { if (String(data[i][0]) === String(plate)) toDel.push(i + 1); }
  toDel.sort(function (a, b) { return b - a; }).forEach(function (r) { sheet.deleteRow(r); });
  return toDel.length;
}
function tareLatest() {
  const data = getSheet(SHEET_TARE).getDataRange().getValues(); const map = {}; const order = [];
  for (let i = 1; i < data.length; i++) { const p = String(data[i][0]); if (!p) continue; if (!(p in map)) order.push(p); map[p] = { plate: p, weight: data[i][1], name: String(data[i][2] || '') }; }
  return { map: map, order: order };
}
function tareQuery(x) {
  const t = tareLatest(); const nx = norm(x);
  const hits = t.order.filter(function (p) { const e = t.map[p]; return norm(p).indexOf(nx) !== -1 || (e.name && norm(e.name).indexOf(nx) !== -1); });
  if (!hits.length) return '🚛 查無「' + x + '」的空車重量。';
  return hits.map(function (p) { const e = t.map[p]; return '🚛 車牌 ' + e.plate + (e.name ? '（' + e.name + '）' : '') + '\n　空車重量：' + e.weight + ' kg'; }).join('\n――――――\n');
}
function tareAll() {
  const t = tareLatest();
  if (!t.order.length) return '目前沒有空車重量資料。貼上「車牌XXXX空車重量XXXXkg」即可建立。';
  return '🚛 空車重量（' + t.order.length + ' 台）：\n' + t.order.map(function (p) { const e = t.map[p]; return '・車牌 ' + p + (e.name ? '（' + e.name + '）' : '') + '：' + e.weight + ' kg'; }).join('\n');
}
function clearTare() { return clearAllRows(SHEET_TARE); }
function handleTarePaste(text) {
  const lines = String(text).split('\n'); let curPlate = ''; const byPlate = {};
  lines.forEach(function (line) {
    const pm = line.match(/車牌\s*(\d+)/); if (pm) curPlate = pm[1];
    if (!curPlate) return;
    let val = null;
    const mod = line.match(/修改\s*(\d+)/);
    if (mod) val = parseInt(mod[1], 10);
    else { const vm = line.match(/[：:]\s*(\d+)/); if (vm) val = parseInt(vm[1], 10); }
    if (val != null) byPlate[curPlate] = val;
  });
  const plates = Object.keys(byPlate); if (!plates.length) return { count: 0, reply: '' };
  const prev = tareLatest().map; const sheet = getSheet(SHEET_TARE); const now = nowStr(); const rows = []; const summary = [];
  plates.forEach(function (p) { const name = prev[p] ? prev[p].name : ''; rows.push([p, byPlate[p], name, now]); summary.push('・車牌 ' + p + (name ? '（' + name + '）' : '') + '：' + byPlate[p] + ' kg'); });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
  return { count: rows.length, reply: '🚛 已更新空車重量：\n' + summary.join('\n') };
}

/* ========================== 【外勤補貼】 ========================== */
function padTime(t) { const m = String(t).match(/(\d{1,2})[:：](\d{2})/); return m ? (('0' + m[1]).slice(-2) + ':' + m[2]) : ''; }
function dutyConfig() {
  return {
    threshold: padTime(PROPS.getProperty('DUTY_THRESHOLD') || '18:00') || '18:00',
    before: parseInt(PROPS.getProperty('DUTY_BEFORE') || '500', 10),
    after: parseInt(PROPS.getProperty('DUTY_AFTER') || '800', 10)
  };
}
function setDutyConfig(text) {
  const m = text.match(/(\d{1,2}[:：]\d{2})\D+(\d+)\D+(\d+)/);
  if (!m) return '格式：#設定外勤補貼 18:00 500 800（門檻時間、前金額、後金額）';
  PROPS.setProperty('DUTY_THRESHOLD', m[1]); PROPS.setProperty('DUTY_BEFORE', m[2]); PROPS.setProperty('DUTY_AFTER', m[3]);
  const c = dutyConfig();
  return '✅ 已設定外勤補貼：' + c.threshold + ' 前出發 ' + c.before + ' 元、' + c.threshold + ' 後出發 ' + c.after + ' 元。';
}
function ymOf(dateStr) {
  if (dateStr instanceof Date) return Utilities.formatDate(dateStr, 'Asia/Taipei', 'yyyy/MM');
  const m = String(dateStr).match(/(\d{4})\/(\d{1,2})/); return m ? (m[1] + '/' + ('0' + m[2]).slice(-2)) : '';
}
function ymdStr(d) { if (d instanceof Date) return Utilities.formatDate(d, 'Asia/Taipei', 'yyyy/MM/dd'); return String(d || '').split(' ')[0]; }
function hmOf(v) { if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'HH:mm'); return String(v || ''); }
function thisYM() { return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM'); }
function resolveYM(arg) {
  if (!arg) return '';
  if (/上個?月/.test(arg)) { const n = new Date(); const d = new Date(n.getFullYear(), n.getMonth() - 1, 1); return Utilities.formatDate(d, 'Asia/Taipei', 'yyyy/MM'); }
  if (/本月|這個?月|當月/.test(arg)) return thisYM();
  const ym = arg.match(/(\d{4})\/(\d{1,2})/); if (ym) return ym[1] + '/' + ('0' + ym[2]).slice(-2);
  const mo = arg.match(/(\d{1,2})\s*月/); if (mo) return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy') + '/' + ('0' + mo[1]).slice(-2);
  return '';
}
function dutyTotal(emp, ym) {
  const data = getSheet(SHEET_DUTY).getDataRange().getValues(); let t = 0;
  const _idx = buildAliasIndex(); const target = normalizeEmployeeName(emp, _idx);   // SSOT
  for (let i = 1; i < data.length; i++) { if (normalizeEmployeeName(data[i][1], _idx) !== target) continue; if (ym && ymOf(data[i][0]) !== ym) continue; t += Number(data[i][4]) || 0; }
  return t;
}
function handleDuty(text) {
  // Task7：地點改為可選（.*），無地點也可登記為（未填地點），不再靜默忽略。
  const m = text.match(/^(\S+?)\s*(?:出外勤|外勤)\s*(?:地點)?\s*[:：]?\s*(.*)$/);
  if (!m) return { count: 0 };
  let emp = m[1].trim(); let rest = (m[2] || '').trim();
  if (!emp || /^(查|本月|上月|這個|當月|#)/.test(emp)) return { count: 0 };
  // Bug3a：代名詞/指示詞開頭非員工，疑問或「跑哪/去哪」等聊天句 → 不登記外勤
  if (/^(你|妳|我|他|她|牠|它|大家|誰|有人|人家|這個|那個|你這個)/.test(emp)) return { count: 0 };
  if (/[嗎呢？?]\s*$/.test(text) || /(跑哪|哪去|去哪|在哪|幹嘛|幹麼|幹什麼)/.test(text)) return { count: 0 };
  emp = normalizeEmployeeName(emp);                                   // SSOT：外勤寫入前正規化姓名
  let override = null; const om = rest.match(/補貼\s*(\d+)/); if (om) { override = parseInt(om[1], 10); rest = rest.replace(om[0], '').trim(); }
  let depTime = ''; const tm = rest.match(/(\d{1,2})[:：](\d{2})/);
  if (tm) { depTime = ('0' + tm[1]).slice(-2) + ':' + tm[2]; rest = rest.replace(/\d{1,2}[:：]\d{2}\s*(?:出發|出門)?/, '').trim(); }
  else { depTime = Utilities.formatDate(new Date(), 'Asia/Taipei', 'HH:mm'); }
  const location = rest.replace(/出發|出門/g, '').replace(/^[:：]/, '').trim() || '未填地點';   // Task7：無地點登記為（未填地點）
  const cfg = dutyConfig();
  let subsidy = override; let basis = '手動指定';
  if (subsidy == null) { if (depTime < cfg.threshold) { subsidy = cfg.before; basis = cfg.threshold + ' 前出發'; } else { subsidy = cfg.after; basis = cfg.threshold + ' 後出發'; } }
  getSheet(SHEET_DUTY).appendRow([nowStr(), emp, location, depTime, subsidy, '']);
  const ym = thisYM(); const monthTotal = dutyTotal(emp, ym); const allTotal = dutyTotal(emp, '');
  return { count: 1, reply: '🚚 ' + emp + ' 出外勤【' + (location || '未填地點') + '】 出發 ' + depTime + '（' + basis + '）→ 補貼 ' + subsidy + ' 元\n本月累計 ' + monthTotal + ' 元・總累計 ' + allTotal + ' 元' };
}
function dutyQuery(emp, monthArg) {
  const ym = resolveYM(monthArg) || thisYM();
  const data = getSheet(SHEET_DUTY).getDataRange().getValues(); const rows = []; let monthTotal = 0, allTotal = 0, anyEmp = false;
  const _idx = buildAliasIndex(); const target = normalizeEmployeeName(emp, _idx);   // SSOT
  for (let i = 1; i < data.length; i++) {
    if (normalizeEmployeeName(data[i][1], _idx).indexOf(target) === -1) continue; anyEmp = true;
    const amt = Number(data[i][4]) || 0; allTotal += amt;
    if (ymOf(data[i][0]) === ym) { monthTotal += amt; rows.push('・' + ymdStr(data[i][0]) + ' ' + (data[i][2] || '') + ' 出發' + hmOf(data[i][3]) + ' → ' + amt + ' 元'); }
  }
  if (!anyEmp) return '查無「' + emp + '」的外勤補貼紀錄。';
  return '🚚 ' + emp + ' 外勤補貼（' + ym + '）：\n' + (rows.length ? rows.join('\n') : '（本月尚無）') + '\n――――――\n💪 本月累計：' + monthTotal + ' 元\n📊 總累計：' + allTotal + ' 元';
}
function dutyAll(monthArg) {
  const ym = resolveYM(monthArg) || thisYM();
  const data = getSheet(SHEET_DUTY).getDataRange().getValues(); const map = {}; const order = [];
  const _idx = buildAliasIndex();                                   // SSOT：合計依正式姓名合併同一人
  for (let i = 1; i < data.length; i++) { const e = normalizeEmployeeName(data[i][1], _idx); if (!e) continue; if (ym && ymOf(data[i][0]) !== ym) continue; if (!(e in map)) { map[e] = 0; order.push(e); } map[e] += Number(data[i][4]) || 0; }
  if (!order.length) return '🚚 ' + ym + ' 目前沒有外勤補貼紀錄。';
  order.sort(function (a, b) { return map[b] - map[a]; });
  let sum = 0; order.forEach(function (e) { sum += map[e]; });
  return '🚚 ' + ym + ' 外勤補貼合計：\n' + order.map(function (e) { return '・' + e + '：' + map[e] + ' 元'; }).join('\n') + '\n――――――\n合計 ' + sum + ' 元';
}
function dutyAllDetail() {
  const data = getSheet(SHEET_DUTY).getDataRange().getValues(); const rows = []; let total = 0;
  const _idx = buildAliasIndex();                                   // SSOT：明細姓名顯示正式名
  for (let i = 1; i < data.length; i++) {
    if (!data[i][1]) continue; const amt = Number(data[i][4]) || 0; total += amt;
    rows.push('・' + ymdStr(data[i][0]) + ' ' + normalizeEmployeeName(data[i][1], _idx) + ' ' + (data[i][2] || '') + ' 出發' + hmOf(data[i][3]) + ' → ' + amt + ' 元');
  }
  if (!rows.length) return '目前沒有外勤補貼紀錄。';
  let out = '🚚 外勤補貼 全部紀錄（' + rows.length + ' 筆）：\n' + rows.join('\n') + '\n――――――\n總計 ' + total + ' 元';
  if (out.length > 4800) out = out.slice(0, 4800) + '\n…（筆數太多，建議改用「查某員工外勤」或指定月份）';
  return out;
}
function handleDutyCancel(text) {
  const lines = String(text).split('\n').map(function (l) { return l.trim(); });
  const sheet = getSheet(SHEET_DUTY); const data = sheet.getDataRange().getValues();
  const delRows = []; const summary = [];
  const hm = text.match(/([^\s🚚]+?)\s*外勤補貼(?:（\s*([\d\/]+)\s*）)?\s*[:：]?\s*取消/);
  if (hm) {
    const emp = hm[1].trim(); const ym = hm[2] ? ymOf(hm[2] + '/01') : '';
    for (let i = 1; i < data.length; i++) { if (String(data[i][1]).indexOf(emp) === -1) continue; if (ym && ymOf(data[i][0]) !== ym) continue; delRows.push(i + 1); summary.push('・' + ymdStr(data[i][0]) + ' ' + (data[i][2] || '') + ' ' + (data[i][4] || 0) + '元'); }
  } else {
    let emp = ''; const em = text.match(/([^\s🚚]+?)\s*外勤補貼/); if (em) emp = em[1].trim();
    const used = {};
    lines.forEach(function (line) {
      if (!/取消/.test(line) || !/\d+\s*元/.test(line)) return;
      const dm = line.match(/(\d{4}\/\d{1,2}\/\d{1,2})/); const am = line.match(/(\d+)\s*元/); const lm = line.match(/[・·•]?\s*\d{4}\/\d{1,2}\/\d{1,2}\s*(.+?)\s*出發/);
      const date = dm ? dm[1] : '', amt = am ? parseInt(am[1], 10) : null, loc = lm ? lm[1].trim() : '';
      for (let i = data.length - 1; i >= 1; i--) {
        if (used[i]) continue;
        if (emp && String(data[i][1]).indexOf(emp) === -1) continue;
        if (date && ymdStr(data[i][0]) !== date) continue;
        if (loc && String(data[i][2]) !== loc) continue;
        if (amt != null && Number(data[i][4]) !== amt) continue;
        used[i] = true; delRows.push(i + 1); summary.push('・' + ymdStr(data[i][0]) + ' ' + (data[i][2] || '') + ' ' + (data[i][4] || 0) + '元'); break;
      }
    });
  }
  if (!delRows.length) return { count: 0 };
  delRows.sort(function (a, b) { return b - a; }).forEach(function (r) { sheet.deleteRow(r); });
  return { count: delRows.length, reply: '🗑️ 已取消外勤補貼 ' + delRows.length + ' 筆：\n' + summary.join('\n') + '\n（打「查外勤」確認）' };
}

/* ========================== 【退貨 / 停車資訊】 ========================== */
function handleReturn(text) {
  const dAll = extractDate(text); const when = dAll.when || nowStr();
  const lines = dAll.rest.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l && !/^[-—─–_=]{3,}$/.test(l); });
  if (!lines.length) return { count: 0, reply: '' };
  let headerCustomer = '';
  if (lines.length > 1 && !/退\s*貨?\s*了?\s*\d+/.test(lines[0])) headerCustomer = lines[0];
  const sheet = getSheet(SHEET_RETURN); const rows = []; const summary = [];
  lines.forEach(function (line) {
    if (line === headerCustomer) return;
    const m = line.match(/^(.*?)\s*退\s*貨?\s*了?\s*(\d+)\s*(台|件|包|箱|個|顆|斤|公斤|盒)?/);
    if (!m) return;
    const qty = parseInt(m[2], 10); const unit = m[3] || '台'; let before = m[1].trim();
    let customer = headerCustomer, product = before;
    if (!headerCustomer) { const parts = before.split(/\s+/); customer = parts[0] || ''; product = parts.slice(1).join(' '); }
    if (/^(我|你|妳|他|她|牠|大家|誰|有人)$/.test(String(customer).trim())) return;   // Task9：主詞為代名詞 → 不寫入退貨
    rows.push([when, customer, product, qty, unit]);
    summary.push('・' + (customer ? customer + ' ' : '') + (product ? product + ' ' : '') + '退 ' + qty + unit);
  });
  if (!rows.length) return { count: 0, reply: '' };
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  const ds = when.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/); const dstr = ds ? (ds[2] + '/' + ds[3]) : '';
  return { count: rows.length, reply: '↩️ 已記錄退貨' + (dstr ? '（' + dstr + '）' : '') + '：\n' + summary.join('\n') };
}
function returnQuery(name) {
  const data = getSheet(SHEET_RETURN).getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const cust = String(data[i][1]); if (name && norm(cust).indexOf(norm(name)) === -1) continue;
    const ds = String(data[i][0]).match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    rows.push('・' + (ds ? ds[2] + '/' + ds[3] + ' ' : '') + cust + ' ' + (data[i][2] ? data[i][2] + ' ' : '') + '退 ' + data[i][3] + (data[i][4] || ''));
  }
  if (!rows.length) return name ? ('查無「' + name + '」的退貨記錄。') : '目前沒有退貨記錄。';
  let out = '↩️ 退貨記錄' + (name ? '（' + name + '）' : '') + '（' + rows.length + ' 筆）：\n' + rows.join('\n');
  if (out.length > 4800) out = out.slice(0, 4800) + '\n…（太多，請用「查X退貨」查單一客戶）';
  return out;
}
function parkingImport(text) {
  const lines = String(text).split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  const entries = []; let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^客戶資訊|^客戶停車|^停車地點|^停車位置一覽|^停車一覽/.test(line)) continue;
    if (/^[-—─–_=]{3,}$/.test(line)) continue;
    if (/^車牌$/.test(line)) { if (cur) cur.info += (cur.info ? ' ' : '') + '車牌'; continue; }
    const parts = line.split(/\s+/);
    if (parts.length === 1) {
      if (cur) cur.info += (cur.info ? ' ' : '') + parts[0];
      else { cur = { key: parts[0], info: '' }; entries.push(cur); }
      continue;
    }
    const key = parts[0]; const info = line.slice(key.length).trim();
    cur = { key: key, info: info }; entries.push(cur);
  }
  if (!entries.length) return { count: 0 };
  const sheet = getSheet(SHEET_PARK); const now = nowStr();
  const rows = entries.map(function (e) { return [e.key, e.info, now]; });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
  return { count: entries.length, keys: entries.map(function (e) { return e.key; }) };
}
function parkingLatest() {
  const data = getSheet(SHEET_PARK).getDataRange().getValues();
  const map = {}; const order = [];
  for (let i = 1; i < data.length; i++) { const k = String(data[i][0]).trim(); if (!k) continue; if (!(k in map)) order.push(k); map[k] = String(data[i][1] || ''); }
  return { map: map, order: order };
}
function parkingQuery(name) {
  const nm = norm(name); const pl = parkingLatest();
  let hits = pl.order.filter(function (k) { return norm(k) === nm; });
  if (!hits.length) hits = pl.order.filter(function (k) { return norm(k).indexOf(nm) !== -1 || nm.indexOf(norm(k)) !== -1; });
  if (!hits.length) return '🅿️ 查無「' + name + '」的資訊。\n（確認名字，或重貼一次「客戶資訊」清單更新）';
  return hits.map(function (k) { return '🅿️ ' + k + '\n' + (pl.map[k] || '（無備註）'); }).join('\n――――――\n');
}
function seedParking() {
  const raw = [
    '客戶資訊停車地點', '中壢幸福 停車位置 舊清山', '車牌', '5859', '6869',
    '243  停車位置 苗場(俗稱 黃仔廠)', '296  停車位置 2下', '3088 停車位置 南外', '6959 停車位置 黑網', '8887 停車位置 2至3下',
    '十方齋 停車位置 旁邊三益汽車車牌706', '尚青 停車位置尚青果菜運銷合作社到了後要拿單分車下貨', '中壢阿潭 停車位置 長青7188',
    '918玉山兒子 停車位置黑網 寄車的話2下 9020', '台中文福 2下寄車阿財車牌應該是100號', '屏東義德 小羊場車牌231',
    '高雄張 寄車大五百上面要寫高雄張', '麥寮生菜村 需導航麥寮台灣生菜村', '溪湖青農合作社 正暘的廠告知溪湖青農',
    '陳記 2下一台綠色的MAN', '蔬鄉 新安合作農場上面車有貼疏鄉', '嘉義青田 黑網車牌1039', '慶裕 二齒車牌3788', '927 苗場旁邊',
    '中原開發食品 寄運信雄廠', '342 三益汽車旁', '中壢巧巧龍 寄運旭陽', '高雄復洋 寄運旭陽', '雨利廚房(小老闆) 寄運福銘',
    '莘田農產 寄運旭陽', '1555阿豪 芹菜展場', '7818太子 詠富冰庫', '花蓮阿植 寄運旭陽', '鳳山全 寄車5下100號', '鳳山雅君 寄車彭公 博登貨運'
  ].join('\n');
  clearAllRows(SHEET_PARK);
  return parkingImport(raw);
}
function parkingAll() {
  const pl = parkingLatest();
  if (!pl.order.length) return '目前沒有客戶資訊。把「客戶資訊…」清單貼上即可匯入。';
  let out = '🅿️ 客戶資訊一覽（' + pl.order.length + '）：\n';
  pl.order.forEach(function (k) { out += '\n・' + k + '：' + (pl.map[k] || ''); });
  if (out.length > 4800) out = out.slice(0, 4800) + '\n…（太多，請改用「查詢X停車位置」查單一客戶）';
  return out;
}

/* ========================== 【指令表 / 訊息統計 / 搜尋】 ========================== */
function commandSheet() {
  return [
    '📋 卡比集機器人 指令表', '',
    '【查詢】', '・搜尋 品名/客戶', '・件數 品名', '・統整金額 6/1-6/15', '・拉出當日群組訊息', '・發言次數', '・今日送貨／今日廢話', '',
    '【客戶停車/備註】', '・查 客戶名（停車）', '・查空車重量1856', '・客戶停車位置查詢', '',
    '【冰庫】', '・查冰庫　查冰庫 客戶名', '・查冰庫總庫存', '・整張寄冰：單據最後打「冰」或「寄冰」',
    '・貼查冰庫結果後，每項可加：出N(出貨)／修改N(改成N)／取消(歸0)', '・批次：第一行「修改庫存」→客戶→每行 品名 數量', '',
    '【鐵架/台子】', '・查鐵架　查台子', '・出庫：客戶 鐵架名*數量（或整張送貨單）', '・收回：客戶 鐵架名 ×N 收（或 取消）', '',
    '【寄運】', '・退貨：[日期] 客戶 品名 退N台', '・記錄：把寄運單據貼上', '・拉出：旭陽寄運資料 6/20',
    '・取消：客戶：清除(整筆)／客戶：品名 數量 取消(單項)／寄運資料 清除 確定(全部)',
    '・場外增改：寄運 客戶：品名 數量(新增/設定)／+N(增)／-N(減)／修改N／取消', '',
    '【出勤】', '・中控總覽（限老闆）', '・打卡：員工名＋上班／下班／遲到／請假', '・查員工出勤／查遲到／查請假／查上班／查下班', '・出勤統計／綜合評比（限老闆）', '・入職：員工名＋入職', '・借支：員工名＋借＋金額', '・外勤補貼：員工名＋出外勤＋地點', '',
    '【改價/損耗/匯款】', '・客戶 改價 內容', '・客戶 匯款 金額', '・對帳單貼上（扣除N件/改NNN元）', '・查改價　查損耗', '',
    '【群組權限（限老闆）】', '・#群組ID', '・#設為管理群組（這群可寫入）', '・#設為市場群組（這群唯讀）', '・#群組權限', '',
    '【設定】', '・#版本　#設定客戶 名稱　#查客戶', '・#貨主名單／#新增貨主 X', '・#冰庫名單／#新增冰庫 X', '・#安靜／#取消安靜（僅本群組）', '・#全部安靜／#全部取消安靜（全部群組・限老闆）', '',
    '【清除（限老闆，要加「確定」）】', '・出勤 清除 確定／冰庫 清除 確定／台子 清除 確定／寄運資料 清除 確定', '・改價紀錄 清除 確定／損耗紀錄 清除 確定／冰庫總量 清除 確定', '',
    '（打「指令表」隨時叫出這張）'
  ].join('\n');
}
function logGroupMessage(text, userId, groupId) {
  if (!text) return;
  if (isNoiseBlock(text)) return;
  if (matchWarehouse(String(text).split('\n')[0].trim())) return;
  const sheet = getSheet(SHEET_MSG);
  sheet.appendRow([nowStr(), text, userId || '', groupId || '']);
  if (Math.random() < 0.1) {
    const last = sheet.getLastRow();
    if (last > 8000) sheet.deleteRows(2, Math.min(3000, last - 6000));
  }
}
var NAME_FETCH_COUNT = 0;
function msgTail(maxRows) {
  const sheet = getSheet(SHEET_MSG); const last = sheet.getLastRow();
  if (last < 2) return [['時間', '內容', 'userId', 'groupId']];
  const start = Math.max(2, last - (maxRows || 5000) + 1);
  return [['時間', '內容', 'userId', 'groupId']].concat(sheet.getRange(start, 1, last - start + 1, 4).getValues());
}
function getDisplayName(groupId, userId) {
  if (!userId) return '(未知)';
  const cached = PROPS.getProperty('NAME_' + userId);
  if (cached) return cached;
  if (NAME_FETCH_COUNT >= 15) return userId.slice(-4);
  NAME_FETCH_COUNT++;
  try {
    const token = PROPS.getProperty('CHANNEL_ACCESS_TOKEN');
    const url = groupId ? ('https://api.line.me/v2/bot/group/' + groupId + '/member/' + userId) : ('https://api.line.me/v2/bot/profile/' + userId);
    const res = UrlFetchApp.fetch(url, { headers: { 'Authorization': 'Bearer ' + token }, muteHttpExceptions: true });
    if (res.getResponseCode() === 200) { const name = (JSON.parse(res.getContentText()).displayName || '').trim(); if (name) { PROPS.setProperty('NAME_' + userId, name); return name; } }
  } catch (e) { }
  return userId.slice(-4);
}
function classifyMessage(msg) {
  const s = String(msg).trim();
  if (!s) return '廢話';
  if (/^\[(貼圖|圖片|影片|語音|檔案|位置|其他)\]$/.test(s)) return '廢話';
  let score = 0;
  if (/\d+\s*(件|台|包|箱|斤|公斤|顆|盒|車|支|個|把)/.test(s)) score += 2;
  if (/[*×xX]\s*\d+|=\s*[\d,]+|\d{2,}\s*元|\$\s*\d/.test(s)) score += 2;
  if (/改\s*\d|改價|損耗|匯款|寄運|寄冰|退\s*\d+|收回|出貨|入庫|出庫|鐵架|台子|冰庫|空車重量|入職|借\s*\d|還\s*\d/.test(s)) score += 2;
  if (/(特優|特大|特|優|良|上|中|下|甲|乙|丙|高山|高麗|格藍芽|大陸妹)/.test(s) && /\d/.test(s)) score += 1;
  if (s.split('\n').length >= 2 && /\d/.test(s)) score += 1;
  return score >= 2 ? '送貨' : '廢話';
}
function listByKind(kind, currentGroupId) {
  const data = msgTail(5000);
  const today = parseYMD(Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd'));
  const items = [];
  for (let i = 1; i < data.length; i++) {
    if (ymdNum(data[i][0]) !== today) continue;
    const g = String(data[i][3] || ''); if (currentGroupId && g !== currentGroupId) continue;
    const msg = String(data[i][1]).trim(); if (!msg) continue;
    if (isNoiseBlock(msg)) continue;
    if (/^(查\S*(鐵架|台子|冰庫|改價|損耗|出勤|客戶|庫存|空車)|.{0,8}寄運(紀錄|資料)|搜尋|件數|總件數|統整|統計|拉出|拉訊息|發言|留言|今日送貨|今日廢話|#)/.test(msg)) continue;
    if (classifyMessage(msg) !== kind) continue;
    const tm = String(data[i][0]).match(/(\d{1,2}:\d{2})/);
    items.push('🕘 ' + (tm ? tm[1] : '') + '　' + msg.replace(/\n/g, ' ／ '));
  }
  if (!items.length) return '今天這個群組沒有「' + kind + '」類的訊息。';
  let out = (kind === '送貨' ? '📦 今日送貨內容（' : '💬 今日閒聊（') + items.length + ' 則）：\n' + items.join('\n');
  if (out.length > 4800) out = out.slice(0, 4800) + '\n…（太多，只顯示部分）';
  return out;
}
function messageCount(dateArg, currentGroupId) {
  const data = msgTail(5000);
  const targetNum = dateArg ? parseYMD(dateArg) : parseYMD(Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd'));
  const cnt = {}; const work = {}; const gid = {}; const order = [];
  for (let i = 1; i < data.length; i++) {
    if (ymdNum(data[i][0]) !== targetNum) continue;
    const uid = String(data[i][2] || ''); if (!uid) continue;
    const g = String(data[i][3] || '');
    if (currentGroupId && g !== currentGroupId) continue;
    if (!(uid in cnt)) { cnt[uid] = 0; work[uid] = 0; order.push(uid); gid[uid] = g; }
    cnt[uid]++;
    if (classifyMessage(data[i][1]) === '送貨') work[uid]++;
  }
  if (!order.length) return '📊 這個群組這天沒有可統計的發言。';
  order.sort(function (a, b) { return cnt[b] - cnt[a]; });
  let total = 0, totalWork = 0;
  const lines = order.map(function (uid) { total += cnt[uid]; totalWork += work[uid]; return '・' + getDisplayName(gid[uid] || currentGroupId, uid) + '：' + cnt[uid] + ' 次（送貨 ' + work[uid] + '・廢話 ' + (cnt[uid] - work[uid]) + '）'; });
  const ds = String(targetNum); const dstr = ds.slice(0, 4) + '/' + ds.slice(4, 6) + '/' + ds.slice(6, 8);
  return '📊 ' + dstr + ' 發言次數（共 ' + total + ' 則：送貨 ' + totalWork + '・廢話 ' + (total - totalWork) + ' / ' + order.length + ' 人）：\n' + lines.join('\n') + '\n\n（看內容：今日送貨／今日廢話）';
}
function splitBlocks(text) {
  const lines = String(text).split('\n');
  let blocks = [], cur = [];
  lines.forEach(function (ln) {
    const t = ln.trim();
    if (/^[\-—─–_=\s]{3,}$/.test(t)) { if (cur.length) { blocks.push(cur.join('\n')); cur = []; } }
    else if (t) { cur.push(ln.trim()); }
  });
  if (cur.length) blocks.push(cur.join('\n'));
  return blocks;
}
function isNoiseBlock(b) {
  const s = String(b).trim();
  if (/^[🚚❄🔧🥡📦🔍🗑✅⚠🔒🧊💰📋🔄📊🕒🕐⏰]/.test(s)) return true;
  if (/寄運資料\s*[（(]/.test(s)) return true;
  if (/庫存總覽|未收回|目前沒有|目前沒|沒有寄存/.test(s)) return true;
  if (/共\s*\d+\s*筆/.test(s)) return true;
  if (/清除\s*確定|清除\s*$/.test(s)) return true;
  if (/^[【].+[】]\s*取消/m.test(s) && /[・·]/.test(s)) return true;
  return false;
}
function searchToday(rawKeyword) {
  const totalOnly = /\s*(總出貨件數|總出貨|總件數|件數|總數)\s*$/.test(String(rawKeyword));
  const keyword = String(rawKeyword).replace(/\s*(總出貨件數|總出貨|總件數|件數|總數)\s*$/, '').trim();
  const data = msgTail(5000);
  const todayNum = parseYMD(Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd'));
  let blocks = [];
  for (let i = 1; i < data.length; i++) {
    if (ymdNum(data[i][0]) !== todayNum) continue;
    splitBlocks(data[i][1]).forEach(function (b) { if (b) blocks.push(b); });
  }
  const matched = blocks.filter(function (b) { return b.indexOf(keyword) !== -1 && !isNoiseBlock(b); });
  const units = {}; const order = []; let hit = 0;
  matched.forEach(function (b) {
    b.split('\n').forEach(function (line) {
      if (line.indexOf(keyword) === -1) return;
      const pm = line.match(/(\d+)\s*(件|包|台|箱|顆|盒|籃|串|把|公斤|斤)/);
      if (pm) { const u = pm[2]; if (!(u in units)) { units[u] = 0; order.push(u); } units[u] += parseInt(pm[1], 10); hit++; }
    });
  });
  const totalStr = hit > 0 ? order.map(function (u) { return units[u] + u; }).join('、') : '0';
  if (totalOnly) {
    if (matched.length === 0) return '🔍 今天沒有找到含「' + keyword + '」的單。';
    return '📊 今天「' + keyword + '」總出貨：' + totalStr + '（共 ' + hit + ' 筆）';
  }
  if (matched.length === 0) return '🔍 今天沒有找到含「' + keyword + '」的單。\n（只能搜尋今天、且機器人在群組裡之後的訊息）';
  let out = '🔍 今天含「' + keyword + '」的單（' + matched.length + ' 張）：\n\n' + matched.join('\n──────\n');
  if (hit > 0) out += '\n\n📊 「' + keyword + '」合計：' + totalStr + '（' + hit + ' 筆明細）';
  if (out.length > 4500) out = out.slice(0, 4500) + '\n…(內容過多，已截斷)';
  return out;
}
function countPieces(keyword) {
  keyword = String(keyword).replace(/\s*(總件數|件數)\s*$/, '').trim();
  const data = msgTail(5000);
  const todayNum = parseYMD(Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd'));
  const units = {}; const order = []; let hit = 0;
  for (let i = 1; i < data.length; i++) {
    if (ymdNum(data[i][0]) !== todayNum) continue;
    String(data[i][1]).split('\n').forEach(function (line) {
      if (line.indexOf(keyword) === -1) return;
      const pm = line.match(/(\d+)\s*(件|包|台|箱|顆|盒|籃|串|把|公斤|斤)/);
      if (pm) { const u = pm[2]; if (!(u in units)) { units[u] = 0; order.push(u); } units[u] += parseInt(pm[1], 10); hit++; }
    });
  }
  if (hit === 0) return '🔍 今天沒有找到含「' + keyword + '」並標有數量(件/包/台…)的單。';
  return '📊 今天「' + keyword + '」總出貨：' + order.map(function (u) { return units[u] + u; }).join('、') + '（共 ' + hit + ' 筆）';
}
function isAmountNoise(who, carriers) {   // 判斷這個「客戶名」是不是機器人回覆/指令/計算式/物流商/雜訊（統整金額排除用）
  const w = String(who || '').trim();
  if (!w) return true;
  const c0 = w.charCodeAt(0);
  if ((c0 >= 0x2600 && c0 <= 0x27BF) || c0 >= 0xD800) return true;                 // emoji/符號開頭＝機器人回覆
  if (/^@/.test(w)) return true;                                                    // @某人
  if (/[=＝]|[*＊×]\s*\d/.test(w)) return true;                                      // 計算式 12*120=1440
  if (/^\d+$/.test(w)) return true;                                                 // 純數字（如 9126）
  if (/^(?:\d{4}\/)?\d{1,2}\/\d{1,2}$/.test(w)) return true;                         // 純日期
  if (/寄運資料|冰庫庫存|庫存表|冰庫總量|綜合評比|金額統整|統整金額|借支|外勤補貼|出勤|鐵架未收回|台子未收回|清除|新增\s|設定|查\S|匯款|轉帳/.test(w)) return true;  // 指令/查詢/系統字
  if (/這次|這樣|酌扣|謝謝|麻煩|請問/.test(w)) return true;                          // 明顯閒聊句
  if (carriers && carriers.some(function (c) { return c && w.indexOf(c) === 0; })) return true;   // 物流商名開頭（旭陽…）＝非客戶
  return false;
}
function summarizeAmount(arg) {
  arg = String(arg).trim();
  const dates = arg.match(/(?:\d{4}\/)?\d{1,2}\/\d{1,2}/g) || [];
  let customer = arg;
  dates.forEach(function (d) { customer = customer.replace(d, ' '); });
  customer = customer.replace(/[-~～至到]+/g, ' ').replace(/\s+/g, ' ').trim();
  const a = parseYMD(dates[0]);
  const b = parseYMD(dates[1] || dates[0]);
  if (!a || !b) return '⚠️ 請用「統整金額 6/1-6/15」或「統整金額 陳記 6/1-6/15」這種格式。';
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const data = msgTail(5000);
  const carriers = Object.keys(getCarrierMap());
  let sum = 0, cnt = 0;
  for (let i = 1; i < data.length; i++) {
    const d = ymdNum(data[i][0]);
    if (!d || d < lo || d > hi) continue;
    splitBlocks(String(data[i][1])).forEach(function (b2) {
      const whoRaw = (b2.split('\n')[0] || '').trim();
      if (customer) { if (b2.indexOf(customer) === -1) return; }
      else if (isAmountNoise(whoRaw, carriers)) return;   // 跳過機器人回覆/指令/計算式/物流商/雜訊
      (b2.match(/=\s*([\d,]+)/g) || []).forEach(function (mt) {
        const num = mt.replace(/[^\d]/g, '');
        if (num) { sum += parseInt(num, 10); cnt++; }
      });
    });
  }
  const range = dates[0] + (dates[1] ? '-' + dates[1] : '');
  let out = '💰 ' + (customer ? customer + ' ' : '') + '金額統整（' + range + '）\n含「=金額」明細：' + cnt + ' 筆\n總金額：' + comma(sum) + ' 元';
  if (cnt === 0) out += '\n\n（這段期間沒找到' + (customer ? '「' + customer + '」的' : '') + '金額。）';
  return out;
}
function summarizeAmountDetail(arg) {
  arg = String(arg).trim();
  const dates = arg.match(/(?:\d{4}\/)?\d{1,2}\/\d{1,2}/g) || [];
  let customer = arg;
  dates.forEach(function (d) { customer = customer.replace(d, ' '); });
  customer = customer.replace(/[-~～至到]+/g, ' ').replace(/\s+/g, ' ').trim();
  const a = parseYMD(dates[0]); const b = parseYMD(dates[1] || dates[0]);
  if (!a || !b) return '⚠️ 請用「統整金額明細 6/1-6/27」或「統整金額明細 陳記 6/1-6/27」。';
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const data = msgTail(5000);
  const carriers = Object.keys(getCarrierMap());
  const byWho = {}; const order = []; const single = []; let sum = 0, cnt = 0;
  for (let i = 1; i < data.length; i++) {
    const d = ymdNum(data[i][0]); if (!d || d < lo || d > hi) continue;
    const md = mdOf(data[i][0]);
    splitBlocks(String(data[i][1])).forEach(function (blk) {
      const whoRaw = (blk.split('\n')[0] || '').trim();
      if (customer) { if (blk.indexOf(customer) === -1) return; }
      else if (isAmountNoise(whoRaw, carriers)) return;   // 跳過機器人回覆/指令/計算式/物流商/雜訊
      const amts = (blk.match(/=\s*([\d,]+)/g) || []).map(function (mt) { return parseInt(mt.replace(/[^\d]/g, ''), 10); }).filter(function (n) { return n > 0; });
      if (!amts.length) return;
      const who = customer || (whoRaw.replace(/[（(].*$/, '').slice(0, 14) || '(未標客戶)');
      const sub = amts.reduce(function (s, n) { return s + n; }, 0);
      if (!(who in byWho)) { byWho[who] = { sum: 0, cnt: 0 }; order.push(who); }
      byWho[who].sum += sub; byWho[who].cnt += amts.length;
      sum += sub; cnt += amts.length;
      single.push('・' + md + '　' + comma(sub) + ' 元');
    });
  }
  if (!cnt) return '💰 ' + (customer ? customer + ' ' : '') + '這段期間沒找到「=金額」。';
  const range = dates[0] + (dates[1] ? '-' + dates[1] : '');
  if (customer) {                                   // 指定客戶 → 逐筆列出
    let body = single.slice(0, 60).join('\n'); if (single.length > 60) body += '\n…(僅顯示前 60 筆)';
    return '💰 ' + customer + ' 金額明細（' + range + '）：\n' + body + '\n――――――\n合計：' + comma(sum) + ' 元（' + cnt + ' 筆）';
  }
  order.sort(function (x, y) { return byWho[y].sum - byWho[x].sum; });   // 未指定 → 依客戶分組
  let lines = order.map(function (w) { return '・' + w + '：' + comma(byWho[w].sum) + ' 元（' + byWho[w].cnt + ' 筆）'; });
  let note = ''; if (lines.length > 40) { lines = lines.slice(0, 40); note = '\n…(僅顯示前 40 名，查單一客戶請打「統整金額明細 客戶 ' + range + '」)'; }
  return '💰 金額統整明細（' + range + '，依客戶）：\n' + lines.join('\n') + note + '\n――――――\n合計：' + comma(sum) + ' 元（' + cnt + ' 筆）';
}
function parseYMD(s) {
  const m = String(s).match(/(?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const y = m[1] ? parseInt(m[1], 10) : new Date().getFullYear();
  return y * 10000 + parseInt(m[2], 10) * 100 + parseInt(m[3], 10);
}
function ymdNum(v) {
  const s = (v instanceof Date) ? Utilities.formatDate(v, 'Asia/Taipei', 'yyyy/MM/dd') : String(v);
  return parseYMD(s);
}
function comma(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/* ========================== 【冰庫核心】 ========================== */
function norm(s) { return String(s).replace(/\s+/g, ''); }
function stripPack(s) { return norm(String(s).replace(/[(（]\s*(台子|圓籃|袋子|紙箱|箱)\s*[)）]/g, '')); }
function appendFreezerRecord(customer, product, isIn, qty) {
  const lock = acquireLock(5000);
  try {
    const sheet = getSheet(SHEET_FREEZER);
    const data = sheet.getDataRange().getValues();
    const ck = norm(customer), pk = norm(product);
    let prev = 0;
    for (let i = data.length - 1; i >= 1; i--) {
      if (norm(data[i][1]) === ck && norm(data[i][2]) === pk) { prev = Number(data[i][5]) || 0; break; }
    }
    let newBal, warn = false;
    if (isIn) { newBal = prev + qty; }
    else { newBal = prev - qty; if (newBal < 0) { newBal = 0; warn = true; } }
    sheet.appendRow([nowStr(), customer, product, isIn ? '入庫' : '出庫', qty, newBal]);
    return { bal: newBal, warn: warn };
  } finally { lock.releaseLock(); }
}
function isWholeIce(text) {
  // Task9 收緊：僅「寄冰」字樣或（冰）標記觸發；單獨一行「冰」不再誤觸發。
  if (/寄冰/.test(text)) return true;
  return /[(（]\s*冰\s*[)）]/.test(String(text));
}
function handleFreezerIceBatch(text) {
  const ICE = /[(（]\s*冰\s*[)）]/;
  const WHOLE = isWholeIce(text);
  const lines = String(text).split('\n')
    .map(function (l) { return l.trim(); })
    .filter(function (l) { return l && !/^[-—─–_=]{3,}$/.test(l) && !/^[\s\-—─–_=]*(寄冰|冰)[\s\-—─–_=]*$/.test(l); });
  if (lines.length === 0) return { count: 0, reply: '' };
  let customer = '', custIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!ICE.test(lines[i])) { customer = lines[i].replace(/寄冰/g, '').trim(); custIdx = i; break; }
  }
  if (!customer) return { count: 0, reply: '' };
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === custIdx) continue;
    const isIce = ICE.test(lines[i]);
    if (!WHOLE && !isIce) continue;
    const noMark = lines[i].replace(/[(（]\s*冰\s*[)）]/g, '').replace(/寄冰/g, '').trim();
    if (!noMark) continue;
    let qm = noMark.match(/(\d+)\s*件/);
    if (!qm) qm = noMark.match(/(\d+)\s*$/);
    if (!qm) continue;
    const qty = parseInt(qm[1], 10);
    const prod = noMark.slice(0, qm.index).trim();
    if (qty <= 0 || !prod) continue;
    items.push({ product: prod, qty: qty });
  }
  if (items.length === 0) return { count: 0, reply: '' };
  const results = [];
  const lock = acquireLock(5000);
  try {
    const sheet = getSheet(SHEET_FREEZER);
    const data = sheet.getDataRange().getValues();
    const bal = {};
    for (let i = 1; i < data.length; i++) bal[norm(data[i][1]) + '|' + norm(data[i][2])] = Number(data[i][5]) || 0;
    const rows = [];
    items.forEach(function (it) {
      const k = norm(customer) + '|' + norm(it.product);
      const nb = (bal[k] || 0) + it.qty;
      bal[k] = nb;
      rows.push([nowStr(), customer, it.product, '入庫', it.qty, nb]);
      results.push({ product: it.product, qty: it.qty, bal: nb });
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  } finally { lock.releaseLock(); }
  if (results.length === 0) return { count: 0, reply: '' };
  // ★ 入庫當下記台子（之後冰庫出貨不再記台子）
  const tzRows = []; let tzTotal = 0;
  results.forEach(function (r) {
    if (/[(（]\s*台子\s*[)）]/.test(r.product)) { tzRows.push([nowStr(), '', '出庫', '台子', r.qty, customer]); tzTotal += r.qty; }
  });
  if (tzRows.length) { const ts = getSheet(SHEET_TAIZI); ts.getRange(ts.getLastRow() + 1, 1, tzRows.length, 6).setValues(tzRows); }
  const rows2 = results.map(function (r) { return '・' + r.product + '　入庫 ' + r.qty + ' → 剩 ' + r.bal; });
  let reply = '❄️ 冰庫入庫（' + customer + '，' + results.length + ' 筆）：\n' + rows2.join('\n');
  if (tzTotal > 0) reply += '\n🥡 同時記台子出庫 ' + tzTotal + ' 個（' + customer + '，查台子看得到）';
  return { count: results.length, reply: reply };
}
function handleFreezerBatch(text) {
  const lines = String(text).split('\n')
    .map(function (l) { return l.trim(); })
    .filter(function (l) { return l && !/^[-—─–_=]{3,}$/.test(l); });
  if (lines.length === 0) return { count: 0, reply: '' };
  const entries = [];
  let currentCustomer = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bracket = line.match(/^【(.+?)】/);
    if (bracket) { currentCustomer = bracket[1].trim(); continue; }
    let product = null, qty = 0, isIn = true, customer = currentCustomer;
    const mB = line.match(/^(.+?)[：:\s]\s*(\d+)\s*(入庫|出庫)\s*$/);
    const mA = line.match(/^(.+?)(入庫|出庫)\s*(\d+)/);
    if (mB && currentCustomer) {
      product = mB[1].trim(); qty = parseInt(mB[2], 10); isIn = (mB[3] === '入庫');
    } else if (mA && !/入庫|出庫/.test(mA[1])) {
      isIn = (mA[2] === '入庫'); qty = parseInt(mA[3], 10);
      const before = mA[1].trim();
      if (currentCustomer) { product = before; }
      else {
        const tk = before.split(/\s+/).filter(Boolean);
        if (tk.length <= 1) { customer = before; product = ''; }
        else { customer = tk[0]; product = tk.slice(1).join(' '); }
      }
    } else {
      if (!currentCustomer && !/入庫|出庫/.test(line)) currentCustomer = line;
      continue;
    }
    if (qty <= 0 || product === null) continue;
    entries.push({ customer: customer, product: product, isIn: isIn, qty: qty });
  }
  if (entries.length === 0) return { count: 0, reply: '' };
  const results = [];
  const lock = acquireLock(5000);
  try {
    const sheet = getSheet(SHEET_FREEZER);
    const data = sheet.getDataRange().getValues();
    const bal = {};
    for (let i = 1; i < data.length; i++) bal[norm(data[i][1]) + '|' + norm(data[i][2])] = Number(data[i][5]) || 0;
    const rows = [];
    entries.forEach(function (e) {
      const k = norm(e.customer) + '|' + norm(e.product);
      const prev = (k in bal) ? bal[k] : 0;
      let nb, warn = false;
      if (e.isIn) nb = prev + e.qty;
      else { nb = prev - e.qty; if (nb < 0) { nb = 0; warn = true; } }
      bal[k] = nb;
      rows.push([nowStr(), e.customer, e.product, e.isIn ? '入庫' : '出庫', e.qty, nb]);
      results.push({ customer: e.customer, product: e.product, isIn: e.isIn, qty: e.qty, bal: nb, warn: warn });
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  } finally { lock.releaseLock(); }
  const lst = results.map(function (r) { return '・' + r.customer + ' ' + (r.product || '') + ' ' + (r.isIn ? '入庫' : '出庫') + ' ' + r.qty + ' → 剩 ' + r.bal + (r.warn ? ' ⚠️' : ''); });
  let reply = '❄️ 冰庫登記（' + results.length + ' 筆）：\n' + lst.join('\n');
  if (results.some(function (r) { return r.warn; })) reply += '\n⚠️ 有品項庫存不足、已記為 0。請確認客戶/品名是否一致、或是否漏打入庫。';
  return { count: results.length, reply: reply };
}
function handleFreezerShip(text) {
  const lines = String(text).split('\n')
    .map(function (l) { return l.trim(); })
    .filter(function (l) { return l && !/^[-—─–_=]{3,}$/.test(l); });
  const items = [];
  let cur = '', shipAll = false;
  function pushSeg(customer, seg) {
    const sm = seg.trim().match(/^(.+?)[：:]\s*(\d+)\s*(?:[（(][^）)]*[）)])?\s*(出\s*\d*)?\s*$/);
    if (!sm) return;
    const product = sm[1].trim(), balance = parseInt(sm[2], 10), ot = sm[3] || '';
    if (!/出/.test(ot) || balance <= 0 || !product) return;
    const on = ot.match(/\d+/); const q = on ? parseInt(on[0], 10) : balance;
    if (q > 0) items.push({ customer: customer, product: product, qty: q, target: Math.max(0, balance - q) });
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^❄️|冰庫庫存|冰庫總覽|目前.*沒有/.test(line)) continue;
    const bm = line.match(/^【(.+?)】\s*(.*)$/);
    if (bm) {
      cur = bm[1].trim(); const rest = bm[2].trim();
      shipAll = /^(全部出|全出|出)$/.test(rest);
      if (rest && !shipAll) rest.split(/[、,，]/).forEach(function (s) { pushSeg(cur, s); });
      continue;
    }
    if (!cur) continue;
    const m = line.match(/^(.+?)[：:]\s*(\d+)\s*(.*)$/);
    if (!m) continue;
    const product = m[1].trim(), balance = parseInt(m[2], 10), tail = m[3] || '';
    if (balance <= 0 || !product) continue;
    const on = tail.match(/出\s*(\d+)/); let q;
    if (on) q = parseInt(on[1], 10);
    else if (shipAll || /出/.test(tail)) q = balance;
    else continue;
    if (q > 0) items.push({ customer: cur, product: product, qty: q, target: Math.max(0, balance - q) });
  }
  if (items.length === 0) return { count: 0, reply: '' };
  const fz = []; const notFound = [];
  const lock = acquireLock(5000);
  try {
    const sheet = getSheet(SHEET_FREEZER);
    const data = sheet.getDataRange().getValues();
    const exact = {}, strip = {};
    for (let i = 1; i < data.length; i++) {
      const v = { name: data[i][2], bal: Number(data[i][5]) || 0 };
      exact[norm(data[i][1]) + '|' + norm(data[i][2])] = v;
      strip[norm(data[i][1]) + '|' + stripPack(data[i][2])] = v;
    }
    const rows = [];
    items.forEach(function (it) {
      let rec = exact[norm(it.customer) + '|' + norm(it.product)];
      if (!rec) rec = strip[norm(it.customer) + '|' + stripPack(it.product)];
      if (!rec) { notFound.push(it); return; }
      const prev = rec.bal; let nb = it.target; if (nb < 0) nb = 0; rec.bal = nb;
      if (nb < prev) { rows.push([nowStr(), it.customer, rec.name, '出庫', prev - nb, nb]); fz.push({ customer: it.customer, product: rec.name, bal: nb, kind: 'out', n: prev - nb }); }
      else if (nb > prev) { rows.push([nowStr(), it.customer, rec.name, '入庫', nb - prev, nb]); fz.push({ customer: it.customer, product: rec.name, bal: nb, kind: 'add', n: nb - prev }); }
      else fz.push({ customer: it.customer, product: rec.name, bal: nb, kind: 'same' });
    });
    if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  } finally { lock.releaseLock(); }
  let reply = '📦 冰庫出貨結果：';
  fz.forEach(function (r) {
    if (r.kind === 'out') reply += '\n・' + r.customer + ' ' + r.product + ' 出' + r.n + ' → 冰庫剩 ' + r.bal;
    else if (r.kind === 'add') reply += '\n・' + r.customer + ' ' + r.product + ' 補回 → 冰庫剩 ' + r.bal;
    else reply += '\n・' + r.customer + ' ' + r.product + ' 已是 ' + r.bal + '（沒有重複扣）';
  });
  notFound.forEach(function (it) { reply += '\n・' + it.customer + ' ' + it.product + ' ⚠️找不到這筆（品名要跟查冰庫一致）'; });
  return { count: items.length, reply: reply };
}
function setFreezer(customer, product, amount) {
  const lock = acquireLock(5000);
  try { getSheet(SHEET_FREEZER).appendRow([nowStr(), customer, product, '校正', amount, amount]); } finally { lock.releaseLock(); }
}
// 批次修改冰庫庫存：第一行「修改庫存」、第二行客戶、之後每行「品名 數量」→ 把各品項設成該數字
function handleFreezerEdit(text) {
  let lines = String(text).split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l && !/^[-—─–_=]{3,}$/.test(l); });
  if (!lines.length) return { count: 0, reply: '' };
  const kw = /^(修改庫存|冰庫修改|修改冰庫庫存|冰庫修改庫存)\s*/;
  if (!kw.test(lines[0])) return { count: 0, reply: '' };
  const firstRest = lines[0].replace(kw, '').trim();
  if (firstRest) lines[0] = firstRest; else lines = lines.slice(1);   // 第一行帶內容＝單行模式，否則丟掉關鍵字行
  if (!lines.length) return { count: 0, reply: '' };
  const known = knownFreezerCustomers();
  const ops = []; let sharedCustomer = '';
  lines.forEach(function (raw) {
    let line = raw.replace(/^[・·•　\s]+/, '').replace(/[【】]/g, '').trim();
    if (!line) return;
    const qm = line.match(/(?:[：:]\s*)?(\d+)\s*$/);
    if (!qm) { sharedCustomer = line.replace(/（.*$/, '').trim(); return; }   // 沒有尾數 → 當「客戶行」(共用客戶)
    const qty = parseInt(qm[1], 10);
    let body = line.slice(0, qm.index).replace(/[：:]\s*$/, '').trim();
    if (!body) { sharedCustomer = line.trim(); return; }   // 整行就是數字/代號（如客戶編號 3088）→ 當客戶行
    let customer = '', product = '';
    for (let i = 0; i < known.length; i++) { if (body.indexOf(known[i]) === 0 && body.length > known[i].length) { customer = known[i]; product = body.slice(known[i].length).trim(); break; } }
    if (!customer) {
      if (sharedCustomer) { customer = sharedCustomer; product = body; }            // 共用客戶模式：整段是品名
      else { const sp = body.split(/\s+/); if (sp.length < 2) return; customer = sp[0]; product = sp.slice(1).join(' '); }   // 客戶每行：第一詞當客戶
    }
    if (!customer || !product) return;
    ops.push({ customer: customer.replace(/（.*$/, '').trim(), product: product, qty: qty });
  });
  if (!ops.length) return { count: 0, reply: '' };
  const data = getSheet(SHEET_FREEZER).getDataRange().getValues();
  const exist = {};   // 客戶|去包裝品名 → 最新原始品名（對應現有品項，避免建重複）
  for (let i = 1; i < data.length; i++) { if (data[i][2]) exist[norm(data[i][1]) + '|' + stripPack(data[i][2])] = data[i][2]; }
  const rows = []; const summary = []; const now = nowStr();
  ops.forEach(function (op) {
    let product = op.product;
    const k = norm(op.customer) + '|' + stripPack(product);
    if (exist[k]) product = exist[k];
    rows.push([now, op.customer, product, '校正', op.qty, op.qty]);
    summary.push('・' + op.customer + ' ' + product + '：' + op.qty);
  });
  const sheet = getSheet(SHEET_FREEZER);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  return { count: rows.length, reply: '🧊 已修改冰庫庫存（' + rows.length + ' 筆）：\n' + summary.join('\n') };
}

/* ========================== 【鐵架 / 台子 寫入】 ========================== */
function handleTaiziBatch(text) {
  const TAIZI = /[(（]\s*台子\s*[)）]/;
  const lines = String(text).split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l && !/^[-—─–_=]{3,}$/.test(l); });
  if (lines.length === 0) return { count: 0, reply: '' };
  let customer = '', custIdx = -1;
  for (let i = 0; i < lines.length; i++) { if (!TAIZI.test(lines[i])) { customer = lines[i]; custIdx = i; break; } }
  if (!customer) return { count: 0, reply: '' };
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === custIdx || !TAIZI.test(lines[i])) continue;
    if (/[(（]\s*冰\s*[)）]/.test(lines[i])) continue;
    const qm = lines[i].match(/(\d+)\s*件/);
    if (!qm) continue;
    const qty = parseInt(qm[1], 10);
    if (qty > 0) entries.push({ qty: qty });
  }
  if (entries.length === 0) return { count: 0, reply: '' };
  const sheet = getSheet(SHEET_TAIZI);
  const rows = entries.map(function (e) { return [nowStr(), '', '出庫', '台子', e.qty, customer]; });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  const total = entries.reduce(function (s, e) { return s + e.qty; }, 0);
  const lst = entries.map(function (e) { return '・台子 ×' + e.qty; });
  return { count: entries.length, reply: '🥡 出台子（' + customer + '，共 ' + total + ' 個）：\n' + lst.join('\n') };
}
function handleRackParenBatch(text) {
  const RACKPAREN = /[(（]([^)）]*[*＊]\s*\d+[^)）]*)[)）]/;
  const lines = String(text).split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l && !/^[-—─–_=]{3,}$/.test(l); });
  if (lines.length === 0) return { count: 0, reply: '' };
  let customer = '', custIdx = -1;
  for (let i = 0; i < lines.length; i++) { if (!RACKPAREN.test(lines[i])) { customer = lines[i]; custIdx = i; break; } }
  if (!customer) return { count: 0, reply: '' };
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === custIdx) continue;
    if (/[(（]\s*冰\s*[)）]/.test(lines[i])) continue;
    const parens = lines[i].match(/[(（][^)）]*[)）]/g) || [];
    parens.forEach(function (p) {
      const inside = p.replace(/^[(（]/, '').replace(/[)）]$/, '');
      if (inside.indexOf('*') === -1 && inside.indexOf('＊') === -1) return;
      inside.split(/\s+/).filter(Boolean).forEach(function (tok) {
        const tm = tok.match(/^(.+?)[*＊](\d+)$/);
        if (!tm) return;
        const rackId = tm[1].trim(), qty = parseInt(tm[2], 10);
        if (rackId && qty > 0) entries.push({ rackId: rackId, qty: qty });
      });
    });
  }
  if (entries.length === 0) return { count: 0, reply: '' };
  const sheet = getSheet(SHEET_RACK);
  const rows = entries.map(function (e) { return [nowStr(), '', '出庫', e.rackId, e.qty, customer]; });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  const lst = entries.map(function (e) { return '・' + e.rackId + ' ×' + e.qty; });
  return { count: entries.length, reply: '🔧 出鐵架（' + customer + '，' + entries.length + ' 筆）：\n' + lst.join('\n') };
}
function handleRackInlineOut(text) {
  const lines = String(text).split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l && !/^[-—─–_=]{3,}$/.test(l); });
  const entries = []; let curCustomer = '';
  lines.forEach(function (line) {
    const starCount = (line.match(/[*＊×xX]\s*\d+/g) || []).length;
    if (starCount === 0) {
      if (/\d+\s*(件|包|箱|斤|公斤|顆|盒)/.test(line)) { curCustomer = ''; return; }
      curCustomer = line.trim(); return;
    }
    if (starCount === 1) {
      const m = line.match(/^(\S+)\s+(.+?)\s*[*＊×xX]\s*(\d+)\s*$/);
      if (m) { const q = parseInt(m[3], 10); if (m[2].trim() && q > 0) { entries.push({ customer: m[1].trim(), rackId: m[2].trim(), qty: q }); curCustomer = m[1].trim(); } }
      else { const m2 = line.match(/^(.+?)\s*[*＊×xX]\s*(\d+)\s*$/); if (m2 && curCustomer) { const q = parseInt(m2[2], 10); if (m2[1].trim() && q > 0) entries.push({ customer: curCustomer, rackId: m2[1].trim(), qty: q }); } }
    } else {
      const tokens = line.split(/[\s/]+/).filter(Boolean);
      let startIdx = 0, customer = curCustomer;
      if (!/[*＊×xX]\d+$/.test(tokens[0])) { customer = tokens[0]; curCustomer = tokens[0]; startIdx = 1; }
      for (let i = startIdx; i < tokens.length; i++) {
        const tm = tokens[i].match(/^(.+?)[*＊×xX](\d+)$/);
        if (tm && customer) { const q = parseInt(tm[2], 10); if (tm[1].trim() && q > 0) entries.push({ customer: customer, rackId: tm[1].trim(), qty: q }); }
      }
    }
  });
  if (entries.length === 0) return { count: 0, reply: '' };
  const sheet = getSheet(SHEET_RACK);
  const rows = entries.map(function (e) { return [nowStr(), '', '出庫', e.rackId, e.qty, e.customer]; });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  const lst = entries.map(function (e) { return '・' + e.customer + ' ' + e.rackId + ' ×' + e.qty; });
  return { count: entries.length, reply: '🔧 出鐵架（' + entries.length + ' 筆）：\n' + lst.join('\n') };
}
function handleRackReturn(text) {
  const lines = String(text).split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  const cancelCustomers = {}; const ops = [];
  let currentCustomer = '', collectAll = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/鐵架未收回|在外面共|目前沒有客戶/.test(line)) continue;
    const bm = line.match(/^【(.+?)】\s*(.*)$/);
    if (bm) { currentCustomer = bm[1].trim(); collectAll = /收|取消/.test(bm[2]); if (collectAll) cancelCustomers[currentCustomer] = true; continue; }
    if (!currentCustomer || collectAll) continue;
    const rm = line.match(/^(.+?)\s*[×xX*]\s*(\d+)\s*(.*)$/);
    if (!rm) continue;
    const rackId = rm[1].trim(), tail = (rm[3] || '').trim();
    if (!rackId) continue;
    const renameM = tail.match(/修改\s*(.+?)\s*[×xX*]\s*(\d+)\s*$/);
    const setM = tail.match(/^修改\s*(\d+)\s*$/);
    const collectM = tail.match(/收\s*(\d+)/);
    if (renameM) ops.push({ customer: currentCustomer, mode: 'rename', rackId: rackId, newRackId: renameM[1].trim(), newQty: parseInt(renameM[2], 10) });
    else if (setM) ops.push({ customer: currentCustomer, mode: 'set', rackId: rackId, amount: parseInt(setM[1], 10) });
    else if (collectM) ops.push({ customer: currentCustomer, mode: 'collect', rackId: rackId, amount: parseInt(collectM[1], 10) });
    else if (/收|取消/.test(tail)) ops.push({ customer: currentCustomer, mode: 'collect', rackId: rackId, amount: null });
    else continue;
  }
  if (!Object.keys(cancelCustomers).length && ops.length === 0) return { count: 0, reply: '' };
  const sheet = getSheet(SHEET_RACK);
  const data = sheet.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < data.length; i++) {
    const c = String(data[i][5]); const r = String(data[i][3]); const q = Number(data[i][4]) || 0;
    if (!out[c]) out[c] = {};
    if (data[i][2] === '出庫') out[c][r] = (out[c][r] || 0) + q;
    else if (data[i][2] === '入庫') out[c][r] = (out[c][r] || 0) - q;
  }
  const taiziRows = [], rackRows = [], lst = []; let cnt = 0;
  const addRow = function (action, rackId, qty, customer) { const row = [nowStr(), '', action, rackId, qty, customer]; if (norm(rackId) === '台子') taiziRows.push(row); else rackRows.push(row); };
  // 客戶／品項比對：完全相同優先，找不到再退而求其次用「互相包含」容錯（與查詢一致，避免查得到卻收不到）
  const custKeys = Object.keys(out);
  const matchCust = function (c) { if (out[c]) return c; const hit = custKeys.filter(function (k) { return k.indexOf(c) !== -1 || c.indexOf(k) !== -1; }); return hit.length === 1 ? hit[0] : c; };
  const matchRack = function (cmap, r) { if (!cmap) return r; if (r in cmap) return r; const hit = Object.keys(cmap).filter(function (k) { return k.indexOf(r) !== -1 || r.indexOf(k) !== -1; }); return hit.length === 1 ? hit[0] : r; };
  Object.keys(cancelCustomers).forEach(function (c) {
    const realC = matchCust(c);
    const m = out[realC] || {};
    Object.keys(m).forEach(function (r) { if (m[r] > 0) { addRow('入庫', r, m[r], realC); lst.push('・' + realC + ' ' + r + ' ×' + m[r] + '（整筆取消）'); cnt++; } });
  });
  ops.forEach(function (op) {
    const realC = matchCust(op.customer);
    const cmap = out[realC] || {};
    const realR = matchRack(cmap, op.rackId);
    const cur = cmap[realR] || 0;
    if (op.mode === 'collect') {
      const amt = (op.amount == null) ? cur : Math.min(op.amount, cur);
      if (amt > 0) { addRow('入庫', realR, amt, realC); lst.push('・' + realC + ' ' + realR + ' 收回 ' + amt + (op.amount == null ? '（全部）' : '') + '，剩 ' + (cur - amt)); cnt++; }
    } else if (op.mode === 'set') {
      const delta = op.amount - cur;
      if (delta > 0) addRow('出庫', realR, delta, realC); else if (delta < 0) addRow('入庫', realR, -delta, realC);
      if (delta !== 0) { lst.push('・' + realC + ' ' + realR + '：' + cur + ' → ' + op.amount); cnt++; }
    } else if (op.mode === 'rename') {
      if (cur > 0) addRow('入庫', realR, cur, realC);
      const nq = op.newQty || cur; addRow('出庫', op.newRackId, nq, realC);
      lst.push('・' + realC + '：' + realR + ' 改名為 ' + op.newRackId + ' ×' + nq); cnt++;
    }
  });
  if (!rackRows.length && !taiziRows.length) return { count: 0, reply: '🔧 沒有可處理的鐵架（可能該客戶目前沒有未收回，或格式對不上）。' };
  if (rackRows.length) { const rs = getSheet(SHEET_RACK); rs.getRange(rs.getLastRow() + 1, 1, rackRows.length, 6).setValues(rackRows); }
  if (taiziRows.length) { const ts = getSheet(SHEET_TAIZI); ts.getRange(ts.getLastRow() + 1, 1, taiziRows.length, 6).setValues(taiziRows); }
  const what = (rackRows.length && taiziRows.length) ? '鐵架／台子' : (taiziRows.length ? '台子' : '鐵架');
  const look = (taiziRows.length && !rackRows.length) ? '查台子' : '查鐵架';
  return { count: cnt, reply: '🔧 已處理' + what + '（' + cnt + ' 項）：\n' + lst.join('\n') + '\n（打「' + look + '」看最新狀況）' };
}
function handleRackBatch(text) {
  const lines = String(text).split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  const entries = [];
  let sharedCustomer = '';
  let defaultIsOut = null;
  lines.forEach(function (line) {
    let isOut, rest;
    let mm = line.match(/^(出去|出貨|出)\s*(.*)$/);
    if (mm) { isOut = true; rest = mm[2]; }
    else {
      mm = line.match(/^(回收|收)\s*(.*)$/);
      if (mm) { isOut = false; rest = mm[2]; }
      else {
        if (defaultIsOut === null) return;
        isOut = defaultIsOut; rest = line;
      }
    }
    if (defaultIsOut === null) defaultIsOut = isOut;
    const p = parseRack(rest);
    if (!p.rackId || p.qty <= 0) return;
    if (p.customer && !sharedCustomer) sharedCustomer = p.customer;
    entries.push({ isOut: isOut, p: p });
  });
  if (entries.length === 0) return { count: 0, reply: '' };
  entries.forEach(function (e) { if (!e.p.customer && sharedCustomer) e.p.customer = sharedCustomer; });
  const rows = [];
  entries.forEach(function (e) {
    const action = e.isOut ? '出庫' : '入庫';
    appendRackRecord(action, e.p.rackId, e.p.qty, e.p.customer, !e.isOut);
    rows.push('・' + (e.isOut ? '出' : '收') + ' ' + (e.p.rackId || '') + ' ×' + e.p.qty + ' ' + (e.p.customer || '(未填客戶)'));
  });
  return { count: entries.length, reply: '✅ 已登記 ' + entries.length + ' 筆鐵架：\n' + rows.join('\n') };
}
function parseRack(rest) {
  rest = (rest || '').trim().replace(/＊/g, '*');
  let rackId = '', qty = 0, customer = '';
  if (rest.indexOf('*') !== -1) {
    const parts = rest.split('*'); rackId = parts[0].trim();
    const after = (parts[1] || '').trim(); const mm = after.match(/^(\d+)\s*(.*)$/);
    if (mm) { qty = parseInt(mm[1], 10); customer = mm[2].trim(); } else { customer = after; }
  } else {
    const tokens = rest.split(/\s+/).filter(Boolean); let qi = -1;
    for (let i = 0; i < tokens.length; i++) { if (/^\d+(\.\d+)?(支|個|根|台|片|組|隻|捆)?$/.test(tokens[i])) { qty = parseInt(tokens[i].match(/\d+/)[0], 10); qi = i; break; } }
    if (qi >= 0) { rackId = tokens.slice(0, qi).join(' '); customer = tokens.slice(qi + 1).join(' '); } else { rackId = tokens.join(' '); }
  }
  customer = customer.replace(/^客戶/, '').trim();
  return { qty: qty, rackId: rackId, customer: customer };
}
/* ---- 已知零售商名單（鐵架/寄運/冰庫客戶彙整），用於名稱防呆 ---- */
function knownRetailers() {
  if (typeof __REQ_CACHE !== 'undefined' && __REQ_CACHE.knownRetailers) return __REQ_CACHE.knownRetailers;
  const set = {}; const arr = [];
  function add(name) { const c = String(name || '').trim(); if (c && !set[c]) { set[c] = 1; arr.push(c); } }
  try { const d = getSheet(SHEET_RACK).getDataRange().getValues(); for (let i = 1; i < d.length; i++) add(d[i][5]); } catch (e) { }
  try { const d = getSheet(SHEET_SHIP).getDataRange().getValues(); for (let i = 1; i < d.length; i++) add(d[i][1]); } catch (e) { }
  try { const d = getSheet(SHEET_FREEZER).getDataRange().getValues(); for (let i = 1; i < d.length; i++) add(d[i][1]); } catch (e) { }
  if (typeof __REQ_CACHE !== 'undefined') __REQ_CACHE.knownRetailers = arr;
  return arr;
}
/* ---- 鐵架前置驗證閘：涵蓋【】/多行/單行所有格式，名稱要含「鐵架」、零售商要一致 ---- */
function rackEntryGuard(text) {
  const t = String(text);
  if (/\d+\s*(?:件|包|箱)/.test(t)) return null;                       // 出貨單
  if (/[（(]\s*(?:冰|台子|鐵架)\s*[)）]/.test(t)) return null;          // 括號標記單
  if (/(匯款|轉帳|改價|損耗|扣除|上班|下班|遲到|請假|入庫|出庫|寄運|寄冰|外勤|借\s*\d|還\s*\d)/.test(t)) return null;
  if (/鐵架未收回|在外面共|台子未收回|目前沒有/.test(t)) return null;   // 查詢/輸出貼回
  if (/^(查|搜|統|拉)/.test(t.trim())) return null;
  if (!/鐵/.test(t)) return null;   // 完全不含「鐵」→ 非鐵架訊息(冰庫/品項內容等不誤判) — P0
  const lines = t.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  if (!lines.length) return null;
  const itemRe = /^(.+?)\s*(?:[*＊×xX:：]\s*|\s+)\d+\s*(?:收\s*\d*|取消|修改\s*\S*)?\s*$/;
  const retailers = []; const badNames = []; let hasItem = false, hasTaizi = false; let curRetailer = '';
  const processItem = function (s, retailerKnown) {
    const im = s.match(itemRe); if (!im) return false;
    hasItem = true; let nm = im[1].trim();
    if (!retailerKnown && /\s/.test(nm)) { const sp = nm.split(/\s+/); retailers.push(sp[0]); curRetailer = sp[0]; nm = sp.slice(1).join(' ').trim() || sp[0]; }
    if (/^台子$/.test(nm)) { hasTaizi = true; return true; }
    if (!/鐵/.test(nm)) badNames.push(s);
    return true;
  };
  lines.forEach(function (line) {
    if (/^(收|回收|收回|出|出借|出去|出貨)\s*$/.test(line)) return;
    const bm = line.match(/^【(.+?)】\s*(.*)$/);
    if (bm) { curRetailer = bm[1].trim(); retailers.push(curRetailer); const rest = bm[2].trim(); if (rest) processItem(rest, true); return; }
    if (itemRe.test(line)) { processItem(line, !!curRetailer); return; }
    // 純零售商行：剝掉同一行的「收／收回／出借」尾綴，避免「尚青收」被當成新客戶
    const sfx = line.match(/^(.+?)\s*(?:收回|回收|收|出借|出貨|出去|出)\s*$/);
    const rname = (sfx && sfx[1].trim()) ? sfx[1].trim() : line;
    curRetailer = rname; retailers.push(rname);
  });
  if (!hasItem || hasTaizi) return null;          // 不是鐵架單 / 含台子 → 交給其他handler
  if (badNames.length) return { warn: true, reply: rackFormatWarning(badNames) };
  const knownC = knownRetailers();
  for (let i = 0; i < retailers.length; i++) {
    const cu = retailers[i]; if (!cu || knownC.indexOf(cu) !== -1) continue;
    const sim = knownC.filter(function (c) { return c !== cu && (c.indexOf(cu) !== -1 || cu.indexOf(c) !== -1); });
    if (sim.length) return { warn: true, reply: '⚠️ 零售商名稱可能不一致，已暫停記錄。\n你打的是「' + cu + '」，請問是不是指：\n・' + sim.join('\n・') + '\n\n請改用完整正確的名稱再送一次（統計名稱要固定才不會亂）。' };
  }
  return null;   // 全部合格 → 放行給原handler記錄
}
/* ---- 鐵架固定格式：零售商 + 品牌鐵架*數量（收回多一行「收」）；不合格跳警示教學 ---- */
function rackFormatWarning(badLines) {
  let w = '⚠️ 鐵架輸入格式錯誤，已暫停記錄，請修正後重新輸入。\n（為了統計一致，鐵架名稱一定要含「鐵」字、一張單只填一個零售商）';
  if (badLines && badLines.length) w += '\n\n❌ 下列不符合：\n・' + badLines.join('\n・');
  w += '\n\n✅ 正確格式：\n〔出借〕\n零售商名稱\n品牌鐵架*數量\n例：\n中原食品\n旭陽鐵架*5\n勝山鐵架*1\n'
    + '\n〔收回〕\n零售商名稱\n收\n品牌鐵架*數量\n例：\n陳記\n收\n旭陽鐵架*4\n勝山鐵架*1';
  return w;
}
function rackSlipStrict(text) {
  const rawLines = String(text).split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  if (rawLines.length < 2) return { handled: false };
  if (/\d+\s*(?:件|包|箱)/.test(text)) return { handled: false };
  if (/[（(]\s*(?:冰|台子|鐵架)\s*[)）]/.test(text)) return { handled: false };
  if (/【/.test(text)) return { handled: false };
  if (/(匯款|轉帳|改價|損耗|扣除|上班|下班|遲到|請假|入庫|出庫|寄運|寄冰|外勤|借\s*\d|還\s*\d)/.test(text)) return { handled: false };
  // 數量分隔符全支援：* ＊ × x X ： : 半形空格／全形空格（鐵架 1 / 鐵架*1 / 鐵架：1 都認）
  const itemRe = /^(.+?)\s*(?:[*＊×xX:：]\s*|\s+)(\d+)\s*$/;
  let customer = '', collect = false, sawItem = false, sawOther = false; const items = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (/^(收|回收|收回)\s*$/.test(line)) { collect = true; continue; }
    if (/^(出|出借|出去|出貨)\s*$/.test(line)) { continue; }
    const m = line.match(itemRe);
    if (m) { sawItem = true; items.push({ raw: line, name: m[1].trim(), qty: parseInt(m[2], 10) }); continue; }
    if (!customer) {
      // 「客戶名收」同一行＝收回登記；「客戶名出借」＝借出；否則純客戶名
      const cm = line.match(/^(.+?)\s*(收回|回收|收)\s*$/);
      if (cm && cm[1].trim()) { customer = cm[1].trim(); collect = true; continue; }
      const om = line.match(/^(.+?)\s*(出借|出貨|出去|出)\s*$/);
      if (om && om[1].trim()) { customer = om[1].trim(); continue; }
      customer = line; continue;
    }
    sawOther = true;
  }
  if (!sawItem || !customer) return { handled: false };
  if (items.every(function (it) { return /^台子$/.test(it.name); })) return { handled: false };   // 純台子交給台子處理
  const bad = items.filter(function (it) { return !/鐵/.test(it.name); });
  if (bad.length || sawOther) return { handled: true, reply: rackFormatWarning(bad.map(function (b) { return b.raw; })) };
  // 零售商名稱防呆：打了一個「不完全相同、但很像既有客戶」的名稱 → 跳警示請確認
  const knownC = knownRetailers();
  if (knownC.indexOf(customer) === -1) {
    const sim = knownC.filter(function (c) { return c !== customer && (c.indexOf(customer) !== -1 || customer.indexOf(c) !== -1); });
    if (sim.length) return { handled: true, reply: '⚠️ 零售商名稱可能不一致，已暫停記錄。\n你打的是「' + customer + '」，請問是不是指：\n・' + sim.join('\n・') + '\n\n請改用完整正確的名稱再送一次（統計名稱要固定才不會亂）。' };
  }
  const sheet = getSheet(SHEET_RACK);
  if (!collect) {
    const rows = items.map(function (it) { return [nowStr(), '', '出庫', it.name, it.qty, customer]; });
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
    return { handled: true, reply: '🔧 出鐵架（' + customer + '，' + items.length + ' 筆）：\n' + items.map(function (it) { return '・' + it.name + ' ×' + it.qty; }).join('\n') + '\n（打「查' + customer + '鐵架」看狀況）' };
  }
  const data = sheet.getDataRange().getValues(); const out = {};
  for (let i = 1; i < data.length; i++) {
    const dc = String(data[i][5]); if (dc.indexOf(customer) === -1 && customer.indexOf(dc) === -1) continue;
    const r = String(data[i][3]); const q = Number(data[i][4]) || 0;
    if (data[i][2] === '出庫') out[r] = (out[r] || 0) + q; else if (data[i][2] === '入庫') out[r] = (out[r] || 0) - q;
  }
  const rows = [], lst = [];
  items.forEach(function (it) {
    const cur = out[it.name] || 0; const amt = Math.min(it.qty, cur);   // 收回不可超過未收回，避免扣成負數
    if (amt > 0) {
      const over = (it.qty > cur) ? '（⚠️要求收 ' + it.qty + ' 超過未收回 ' + cur + '，只收 ' + amt + '）' : '';
      rows.push([nowStr(), '', '入庫', it.name, amt, customer]);
      lst.push('・' + it.name + ' 收回 ' + amt + over + '，剩 ' + (cur - amt));
    }
    else lst.push('・' + it.name + ' ⚠️查無未收回，無法收回（目前剩 ' + cur + '）');
  });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  return { handled: true, reply: '🔧 收鐵架（' + customer + '）：\n' + lst.join('\n') + '\n（打「查' + customer + '鐵架」看狀況）' };
}
function buildRackReply(action, p, remain) {
  let msg = '✅ 已登記：' + action + '鐵架 ' + p.qty + ' 支';
  if (p.rackId) msg += '\n編號：' + p.rackId;
  if (p.customer) msg += '\n客戶：' + p.customer;
  return msg + '\n📦 目前剩餘總數：' + remain + ' 支';
}
function appendRackRecord(action, rackId, qty, customer, isIn) {
  getSheet(SHEET_RACK).appendRow([nowStr(), '', action, rackId, qty, customer]);
}
function appendFinanceRecord(customer, type, amount, content) { getSheet(SHEET_FINANCE).appendRow([nowStr(), customer, type, amount, content, '']); }

/* ==========================================================================
 * 待收款 / 收款追蹤（Task4）— 於 卡比集機器人_repo 全新實作（未搬 kabiji-bot 程式碼）
 * 欄位(0-based)：0建立時間 1日期 2客戶 3供應商 4品項 5金額 6備註 7狀態 8建立者
 *   9收款人 10收款時間 11結案時間 12來源群組 13來源訊息ID 14原文 15刪除時間 16刪除者 17取消原因
 * 狀態：未收 / 已收 / 取消 / 異常。取消＝軟刪除（不刪列，填 15/16/17）。
 * ========================================================================== */
var RECV_KW = /(要收錢|要收款|收款|代收|請收|需收)/;                 // 移除裸「要收」「收」
var RECV_EQUIP = /(收台|台回來|空籃|空籃回收|籃子回收|棧板回收)/;    // 器材回收，永不進收款
function recvSheet() { return getSheet(SHEET_RECEIVABLE); }
function recvNowMs() { try { return new Date().getTime(); } catch (e) { return 0; } }
function recvAgeHours(createdAt) { try { const d = new Date(String(createdAt).replace(/-/g, '/')); const ms = recvNowMs() - d.getTime(); return isNaN(ms) ? null : ms / 3600000; } catch (e) { return null; } }
function recvParseAmount(text) {
  const t = String(text);
  let m = t.match(/(?:要收錢|要收款|收款|代收|請收|需收)\s*([\d,]+)/);
  if (m && /\d/.test(m[1])) return parseInt(m[1].replace(/,/g, ''), 10);
  m = t.match(/([\d,]+)\s*元/);
  if (m) return parseInt(m[1].replace(/,/g, ''), 10);
  return null;
}
// 偵測收款意圖；回 null=非收款；{needAmount:true}=有關鍵字無金額（提示不建立）；否則回解析結構。
function recvDetect(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (RECV_EQUIP.test(t)) return null;   // P0-1：含收台/空籃/棧板回收 → 器材收回，永不進收款（即使含「需收」等字）
  if (!RECV_KW.test(t)) return null;
  const amount = recvParseAmount(t);
  if (!(amount > 0)) return { needAmount: true };
  const lines = t.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  let customer = '', rest = [];
  lines.forEach(function (ln, i) { if (i === 0 && /^\d{2,}$/.test(ln)) customer = ln; else rest.push(ln); });
  let body = rest.join(' ');
  let note = ''; const nm = body.match(/[（(]([^)）]*)[)）]/); if (nm) { note = nm[1].trim(); body = body.replace(nm[0], ' '); }
  let supplier = ''; const sm = body.match(/^\s*([一-龥]{2,6})(?=\s|$|\d)/); if (sm) { supplier = sm[1]; body = body.slice(body.indexOf(sm[1]) + sm[1].length); }
  const item = body.replace(/(?:要收錢|要收款|收款|代收|請收|需收)\s*[\d,]*\s*元?/g, ' ').replace(/[\d,]+\s*元/g, ' ').replace(/\s+/g, ' ').trim();
  if (!customer && supplier) customer = supplier;   // 無數字客戶 → 開頭中文名當客戶
  return { customer: customer, supplier: supplier, item: item, amount: amount, note: note };
}
// 建立【未收】；去重：① 同 sourceMessageId ② 同客戶+同金額+同品項且非取消且 24h 內。
function recvCreate(p, groupId, messageId, byUser, rawText) {
  const sheet = recvSheet(); const data = sheet.getDataRange().getValues();
  if (messageId) { for (let i = 1; i < data.length; i++) { if (String(data[i][13]) && String(data[i][13]) === String(messageId)) return { dup: true }; } }
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][7]) === '取消' || data[i][15]) continue;
    if (String(data[i][2]) === String(p.customer) && (Number(data[i][5]) || 0) === p.amount && String(data[i][4]) === String(p.item)) {
      const age = recvAgeHours(data[i][0]);
      if (age !== null && age <= 24) return { dup: true };   // 僅 24h 內視為重複，避免漏掉隔日真實重複交易
    }
  }
  const lock = acquireLock(5000);
  try { sheet.appendRow([nowStr(), todayYMD(), p.customer, p.supplier, p.item, p.amount, p.note, '未收', normalizeEmployeeName(byUser || ''), '', '', '', groupId || '', messageId || '', rawText || '', '', '', '']); }
  finally { lock.releaseLock(); }
  return { created: true, p: p };
}
function todayYMD() { return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd'); }
// R 編號＝資料列索引 data[i]（軟刪除不移列，故 ID 穩定，清單顯示與 #取消/#已收 接受的 ID 一致）。
function recvRowId(i) { return 'R' + ('0000' + i).slice(-4); }
function recvParseId(key) { const m = String(key).trim().match(/^[Rr]0*(\d+)$/); return m ? parseInt(m[1], 10) : -1; }
function recvUpdateRow(rowNum, arr) { recvSheet().getRange(rowNum, 1, 1, arr.length).setValues([arr]); }
// 命中所有「未收且未軟刪」且 客戶/供應商 含 key 的資料列索引。
function recvMatchAll(key) {
  const data = recvSheet().getDataRange().getValues(); const k = String(key).trim(); const hits = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][7]) !== '未收' || data[i][15]) continue;
    if (String(data[i][2]) === k || String(data[i][3]) === k || String(data[i][2]).indexOf(k) !== -1 || String(data[i][3]).indexOf(k) !== -1) hits.push(i);
  }
  return hits;
}
// 解析目標：R編號→單列；關鍵字→單列命中即用、多列命中回候選、無命中 null。all=true 則多列全取。
function recvResolve(key, all) {
  const data = recvSheet().getDataRange().getValues();
  const id = recvParseId(key);
  if (id > 0) { if (id < data.length && String(data[id][7]) === '未收' && !data[id][15]) return { rows: [id] }; return null; }
  const hits = recvMatchAll(key);
  if (!hits.length) return null;
  if (all || hits.length === 1) return { rows: hits };
  return { candidates: hits };
}
function recvRowBrief(i) { const d = recvSheet().getDataRange().getValues()[i]; return recvRowId(i) + '｜' + (d[2] || '') + (d[3] ? '／' + d[3] : '') + '｜' + (d[4] || '') + '｜' + (Number(d[5]) || 0) + ' 元'; }
function recvCandidateReply(hits) {
  return '⚠️ 找到 ' + hits.length + ' 筆未收，請指定 ID（例：' + recvRowId(hits[0]) + '），或用「全部 <關鍵字>」一次處理：\n' + hits.map(function (i) { return recvRowBrief(i); }).join('\n');
}
function receivableClose(key, byUser, all) {
  const res = recvResolve(key, all); if (!res) return { none: true };
  if (res.candidates) return { candidates: res.candidates };
  const done = res.rows.map(function (i) {
    const arr = recvSheet().getRange(i + 1, 1, 1, 18).getValues()[0];
    arr[7] = '已收'; arr[9] = normalizeEmployeeName(byUser || arr[9] || ''); arr[10] = nowStr(); arr[11] = nowStr();
    recvUpdateRow(i + 1, arr);
    return { id: recvRowId(i), customer: arr[2], supplier: arr[3], item: arr[4], amount: arr[5] };
  });
  return { done: done };
}
function receivableCancel(key, byUser, reason, all) {
  const res = recvResolve(key, all); if (!res) return { none: true };
  if (res.candidates) return { candidates: res.candidates };   // 多筆命中 → 回候選，不自行挑一筆刪
  const done = res.rows.map(function (i) {
    const arr = recvSheet().getRange(i + 1, 1, 1, 18).getValues()[0];
    arr[7] = '取消'; arr[15] = nowStr(); arr[16] = normalizeEmployeeName(byUser || ''); arr[17] = String(reason || '').trim();   // 軟刪除
    recvUpdateRow(i + 1, arr);
    return { id: recvRowId(i), customer: arr[2], supplier: arr[3], item: arr[4], amount: arr[5] };
  });
  return { done: done };
}
function receivableQuery(todayOnly) {
  const data = recvSheet().getDataRange().getValues(); const rows = []; let total = 0; const today = todayYMD();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][7]) !== '未收' || data[i][15]) continue;
    if (todayOnly && ymdStr(data[i][0]) !== today) continue;
    const amt = Number(data[i][5]) || 0; total += amt;
    // Bug6：保留「收款人」欄；未指定收款人時顯示「建立人 X」（沿用原規格）
    const who = data[i][9] ? ('收款人 ' + data[i][9]) : ('建立人 ' + (data[i][8] || '未填'));
    rows.push(recvRowId(i) + '｜' + (data[i][2] || '') + (data[i][3] ? '／' + data[i][3] : '') + '｜' + (data[i][4] || '') + '｜' + amt + ' 元｜' + who);
  }
  if (!rows.length) return '📋 目前沒有未收款。';
  return '📋 未收款清單' + (todayOnly ? '（今日）' : '') + '（' + rows.length + ' 筆）：\nID｜客戶／供應商｜品項｜金額｜收款人\n' + rows.join('\n') + '\n――――――\n合計未收：' + total + ' 元\n（結案：#已收 R編號｜取消：#取消收款 R編號）';
}
function receivableDetail() {
  const data = recvSheet().getDataRange().getValues(); const rows = [];
  for (let i = 1; i < data.length; i++) {
    const st = String(data[i][7]); const tag = st === '取消' ? '❌取消' : (st === '已收' ? '✅已收' : '🔵未收');
    rows.push(recvRowId(i) + '｜' + tag + '｜' + (data[i][2] || '') + '｜' + (data[i][4] || '') + '｜' + (Number(data[i][5]) || 0) + ' 元' + (st === '已收' && data[i][9] ? '｜收款人 ' + data[i][9] : '') + (st === '取消' && data[i][17] ? '｜原因 ' + data[i][17] : ''));
  }
  if (!rows.length) return '📋 目前沒有收款紀錄。';
  return '📋 收款明細（全部 ' + rows.length + ' 筆）：\n' + rows.join('\n');
}
// 一次性清理（手動執行）：修欄位對調(客戶=數字代號/供應商=中文名) + 軟刪除重複。dryRun 預設 true 只 log 預覽。
function recvCleanup(dryRun) {
  if (dryRun === undefined) dryRun = true;
  const sheet = recvSheet(); const data = sheet.getDataRange().getValues();
  const preview = []; const seen = {};
  for (let i = 1; i < data.length; i++) {
    if (data[i][15]) continue;   // 已軟刪跳過
    let cust = String(data[i][2] || '').trim(), sup = String(data[i][3] || '').trim(); let swapped = false;
    if (/[一-龥]/.test(cust) && /^\d+$/.test(sup)) { const t = cust; cust = sup; sup = t; swapped = true; }   // 欄位對調修正
    const key = cust + '|' + sup + '|' + (Number(data[i][5]) || 0) + '|' + String(data[i][4] || '');
    let dupe = false;
    if (String(data[i][7]) === '未收') { if (seen[key]) dupe = true; else seen[key] = i; }
    const acts = []; if (swapped) acts.push('修正欄位對調'); if (dupe) acts.push('軟刪除(重複)');
    if (!acts.length) continue;
    preview.push(recvRowId(i) + ' ' + acts.join('+') + '：客戶=' + cust + ' 供應商=' + sup + ' 金額=' + (Number(data[i][5]) || 0));
    if (!dryRun) {
      const arr = sheet.getRange(i + 1, 1, 1, 18).getValues()[0];
      arr[2] = cust; arr[3] = sup;
      if (dupe) { arr[7] = '取消'; arr[15] = nowStr(); arr[16] = 'system'; arr[17] = '系統清理:欄位對調重複'; }
      recvUpdateRow(i + 1, arr);
    }
  }
  const head = (dryRun ? '【預覽 dryRun，未實際變更】' : '【已執行清理】') + ' 收款髒資料：' + preview.length + ' 項';
  try { Logger.log(head + (preview.length ? '\n' + preview.join('\n') : '')); } catch (e) { }
  return { count: preview.length, preview: preview, dryRun: dryRun };
}

/* ========================== 【綁定 / 地點 / 離職 / 評比】 ========================== */
function getBindings() { try { return JSON.parse(PROPS.getProperty('EMP_BINDINGS') || '{}'); } catch (e) { return {}; } }
function setBinding(emp, name) { const b = getBindings(); b[emp] = name; PROPS.setProperty('EMP_BINDINGS', JSON.stringify(b)); }
function removeBinding(emp) { const b = getBindings(); delete b[emp]; PROPS.setProperty('EMP_BINDINGS', JSON.stringify(b)); }
function reverseBinding(displayName) { const b = getBindings(); const ks = Object.keys(b); for (let i = 0; i < ks.length; i++) { if (b[ks[i]] === displayName) return ks[i]; } return null; }
function getPlaces() { try { return JSON.parse(PROPS.getProperty('PLACE_ALIAS') || '{}'); } catch (e) { return {}; } }
function setPlace(name, addr) { const p = getPlaces(); p[name] = addr; PROPS.setProperty('PLACE_ALIAS', JSON.stringify(p)); }
function removePlace(name) { const p = getPlaces(); delete p[name]; PROPS.setProperty('PLACE_ALIAS', JSON.stringify(p)); }
function expandPlace(note, places) { if (!note) return ''; const p = places || getPlaces(); const ks = Object.keys(p); for (let i = 0; i < ks.length; i++) { if (String(note).indexOf(ks[i]) !== -1) return note + ' ➜ ' + p[ks[i]]; } return note; }
function handlePlaceSet(text) {
  const lines = String(text).split('\n'); const done = [];
  lines.forEach(function (line) {
    const m = line.trim().match(/^(\S{1,12})\s*[=＝]\s*(.{2,40})$/); if (!m) return;
    if (!/(路|街|號|段|巷|弄|道|村|里|市|區|鄉|鎮|大樓|工業區|交流道)/.test(m[2])) return;
    setPlace(m[1].trim(), m[2].trim()); done.push(m[1].trim() + ' ➜ ' + m[2].trim());
  });
  if (!done.length) return { count: 0 };
  return { count: done.length, reply: '📍 已設定地點代號：\n' + done.map(function (d) { return '・' + d; }).join('\n') + '\n（寄運備註寫到這代號，查詢會自動帶出地址）' };
}
function placeList() { const p = getPlaces(); const ks = Object.keys(p); return ks.length ? ('📍 地點代號：\n' + ks.map(function (k) { return '・' + k + ' ➜ ' + p[k]; }).join('\n')) : '目前沒有地點代號。\n設定方式：新廠=新中北路二段73號'; }
function getResigned() { try { return JSON.parse(PROPS.getProperty('RESIGNED') || '[]'); } catch (e) { return []; } }
function addResigned(emp) { emp = normalizeEmployeeName(emp); const a = getResigned(); if (a.indexOf(emp) === -1) a.push(emp); PROPS.setProperty('RESIGNED', JSON.stringify(a)); }   // SSOT
function removeResigned(emp) { const n = normalizeEmployeeName(emp); let a = getResigned(); a = a.filter(function (x) { return normalizeEmployeeName(x) !== n; }); PROPS.setProperty('RESIGNED', JSON.stringify(a)); }   // SSOT
function isResigned(emp) { const n = normalizeEmployeeName(emp); return getResigned().some(function (x) { return normalizeEmployeeName(x) === n; }); }   // SSOT
function deleteEmployee(emp) {
  const targets = [['出勤打卡', SHEET_ATTEND, 1], ['外勤補貼', SHEET_DUTY, 1], ['借支', SHEET_LOAN, 1], ['入職', SHEET_HIRE, 0]];
  const detail = []; let total = 0;
  targets.forEach(function (t) {
    let c = 0;
    try { const sheet = getSheet(t[1]); const data = sheet.getDataRange().getValues(); for (let i = data.length - 1; i >= 1; i--) { if (String(data[i][t[2]]).trim() === emp) { sheet.deleteRow(i + 1); c++; } } } catch (e) { }
    if (c) { detail.push(t[0] + ' ' + c + ' 筆'); total += c; }
  });
  removeBinding(emp); removeResigned(emp);
  return { total: total, detail: detail };
}
function evalGroup(chatId) { return PROPS.getProperty('MAIN_GROUP') || chatId; }
function getEvalGroups() {
  let arr = []; try { arr = JSON.parse(PROPS.getProperty('EVAL_GROUPS') || '[]'); } catch (e) { arr = []; }
  const main = PROPS.getProperty('MAIN_GROUP'); if (main && arr.indexOf(main) === -1) arr.push(main);
  return arr;
}
function addEvalGroup(gid) { let arr = []; try { arr = JSON.parse(PROPS.getProperty('EVAL_GROUPS') || '[]'); } catch (e) { } if (arr.indexOf(gid) === -1) arr.push(gid); PROPS.setProperty('EVAL_GROUPS', JSON.stringify(arr)); }
function removeEvalGroup(gid) { let arr = []; try { arr = JSON.parse(PROPS.getProperty('EVAL_GROUPS') || '[]'); } catch (e) { } arr = arr.filter(function (g) { return g !== gid; }); PROPS.setProperty('EVAL_GROUPS', JSON.stringify(arr)); }
function evalConfig() {
  return {
    day: parseFloat(PROPS.getProperty('EVAL_DAY') || '10'),
    duty: parseFloat(PROPS.getProperty('EVAL_DUTY') || '8'),
    work: parseFloat(PROPS.getProperty('EVAL_WORK') || PROPS.getProperty('EVAL_SPEECH') || '0.5'),
    chatter: parseFloat(PROPS.getProperty('EVAL_CHATTER') || '0'),
    late: parseFloat(PROPS.getProperty('EVAL_LATE') || '-10'),
    leave: parseFloat(PROPS.getProperty('EVAL_LEAVE') || '-5'),
    offlate: parseFloat(PROPS.getProperty('EVAL_OFFLATE') || '2'),   // 每晚下班 1 小時加幾分
    offbase: parseFloat(PROPS.getProperty('EVAL_OFFBASE') || '18')   // 下班基準時間（之後才算加班加分）
  };
}
function setEvalConfig(text) {
  const map = { '出勤': 'EVAL_DAY', '外勤': 'EVAL_DUTY', '工作': 'EVAL_WORK', '廢話': 'EVAL_CHATTER', '發言': 'EVAL_WORK', '遲到': 'EVAL_LATE', '請假': 'EVAL_LEAVE', '晚下班': 'EVAL_OFFLATE', '下班基準': 'EVAL_OFFBASE' };
  const set = [];
  Object.keys(map).forEach(function (k) { const m = text.match(new RegExp(k + '\\s*(-?\\d+(?:\\.\\d+)?)')); if (m) { PROPS.setProperty(map[k], m[1]); set.push(k + '×' + m[1]); } });
  if (!set.length) return '格式：#設定評比 出勤10 外勤8 工作0.5 廢話-0.2 遲到-10 請假-5 晚下班2 下班基準18（只填要改的也可以）';
  const c = evalConfig();
  return '✅ 已更新評比權重：\n出勤×' + c.day + '、外勤×' + c.duty + '、工作留言×' + c.work + '、廢話×' + c.chatter + '、遲到×' + c.late + '、請假×' + c.leave + '、晚下班×' + c.offlate + '（基準' + c.offbase + '點後）';
}
/* ==========================================================================
 * 員工姓名正規化 — 全系統唯一入口（Single Source of Truth）
 * --------------------------------------------------------------------------
 * 任何模組（出勤/下班/外勤/借支/入職/離職/收款/出貨/進貨/庫存/薪資/統計/查詢/
 * AI解析/ERP寫入）在處理員工姓名前，一律先呼叫 normalizeEmployeeName()。
 * 禁止各功能自行解析姓名，避免「良 / 阿良」「宏欸 / 宏欸4:07」被拆成多筆。
 * 正規化步驟：① 去除被誤吃進姓名的時間（宏欸4:07 / 宏欸 4:07 → 宏欸）
 *            ② 收斂空白  ③ 套用別名管理表（良 → 阿良）
 * ========================================================================== */
// ① 去時間 + 收斂空白（純字串處理，不碰別名表）
function stripEmpTime(s) { return String(s == null ? '' : s).replace(/\s*\d{1,2}\s*[:：]\s*\d{2}\s*/g, ' ').replace(/\s+/g, ' ').trim(); }
// 舊：扁平別名表 alias -> canonical（相容既有 #員工別名 指令與資料）
function getEmpAlias() { try { return JSON.parse(PROPS.getProperty('EMP_ALIAS') || '{}'); } catch (e) { return {}; } }
function setEmpAlias(alias, canonical) { const a = getEmpAlias(); a[alias] = canonical; PROPS.setProperty('EMP_ALIAS', JSON.stringify(a)); }
function removeEmpAlias(alias) { const a = getEmpAlias(); delete a[alias]; PROPS.setProperty('EMP_ALIAS', JSON.stringify(a)); }
// 新：員工別名管理表 canonical -> [aliases]，例：{ "阿良":["良","阿良"], "宏欸":["宏欸","宏欸4:07"] }
function getEmployeeAliases() { try { return JSON.parse(PROPS.getProperty('EMPLOYEE_ALIASES') || '{}'); } catch (e) { return {}; } }
function setEmployeeAliases(map) { PROPS.setProperty('EMPLOYEE_ALIASES', JSON.stringify(map || {})); }
// 反查索引（normalized-alias -> canonical）：合併「新管理表」與「舊扁平表」。
// 效能：每次查詢建立一次即可；迴圈內請 hoist 後以第二參數傳入 normalizeEmployeeName。
function buildAliasIndex() {
  const idx = {};
  const legacy = getEmpAlias();
  Object.keys(legacy).forEach(function (a) { const k = stripEmpTime(a); if (k) idx[k] = String(legacy[a]).trim(); });
  const table = getEmployeeAliases();
  Object.keys(table).forEach(function (canon) {
    const c = String(canon).trim(); if (!c) return;
    idx[stripEmpTime(c)] = c;
    (table[canon] || []).forEach(function (a) { const k = stripEmpTime(a); if (k) idx[k] = c; });
  });
  return idx;
}
// ★ 全系統唯一姓名正規化入口。idx 可選：迴圈內先 buildAliasIndex() 再逐筆傳入以維持效能。
function normalizeEmployeeName(raw, idx) {
  const n = stripEmpTime(raw);
  if (!n) return n;
  const map = idx || buildAliasIndex();
  return map[n] || n;
}
// 相容既有呼叫點（speechCountMonth / evaluation 等）：一律改走 SSOT。
function empAlias(name, idx) { return normalizeEmployeeName(name, idx); }
// Task9：已知員工名集合（出勤表 + 綁定 + 別名表/管理表），供借支等寫入前驗證真人。
function knownEmpNames() {
  const set = Object.create(null); const idx = buildAliasIndex();
  try { const d = getSheet(SHEET_ATTEND).getDataRange().getValues(); for (let i = 1; i < d.length; i++) { const n = normalizeEmployeeName(d[i][1], idx); if (n) set[n] = 1; } } catch (e) { }
  try { const b = getBindings(); Object.keys(b).forEach(function (k) { const a = normalizeEmployeeName(k, idx), c = normalizeEmployeeName(b[k], idx); if (a) set[a] = 1; if (c) set[c] = 1; }); } catch (e) { }
  try { const a = getEmpAlias(); Object.keys(a).forEach(function (k) { const x = normalizeEmployeeName(k, idx), y = normalizeEmployeeName(a[k], idx); if (x) set[x] = 1; if (y) set[y] = 1; }); } catch (e) { }
  try { const t = getEmployeeAliases(); Object.keys(t).forEach(function (c) { set[normalizeEmployeeName(c, idx)] = 1; (t[c] || []).forEach(function (x) { const n = normalizeEmployeeName(x, idx); if (n) set[n] = 1; }); }); } catch (e) { }
  return set;
}
// Task9：是否為合法員工名（排除代名詞/純數字/未知名；借支等寫入前檢查）。
function isValidEmpName(name) {
  const n = normalizeEmployeeName(name);
  if (!n || /^\d+$/.test(n)) return false;
  if (/^(我|你|妳|他|她|牠|大家|誰|有人|老闆|旭陽)$/.test(n)) return false;
  return !!knownEmpNames()[n];
}
function hourOf(v) {   // 取時:分的小時數（可吃 Date 物件或字串）
  let s = (v instanceof Date) ? Utilities.formatDate(v, 'Asia/Taipei', 'HH:mm') : String(v);
  let m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
  try { const d = new Date(String(v)); if (!isNaN(d.getTime())) return Number(Utilities.formatDate(d, 'Asia/Taipei', 'HH')) + Number(Utilities.formatDate(d, 'Asia/Taipei', 'mm')) / 60; } catch (e) { }
  return null;
}
function speechCountMonth(ym, groups) {
  const data = getSheet(SHEET_MSG).getDataRange().getValues();
  const agg = {}, gid = {}; const useFilter = groups && groups.length > 0;
  for (let i = 1; i < data.length; i++) {
    if (ymOf(data[i][0]) !== ym) continue;
    const uid = String(data[i][2] || ''); if (!uid) continue;
    const g = String(data[i][3] || '');
    if (useFilter && groups.indexOf(g) === -1) continue;
    const t = String(data[i][1] || '');
    if (/^\[(貼圖|圖片|影片|語音|檔案|位置|其他)\]$/.test(t)) continue;
    if (!(uid in agg)) { agg[uid] = { work: 0, chatter: 0 }; gid[uid] = g; }
    if (classifyMessage(t) === '送貨') agg[uid].work++; else agg[uid].chatter++;
  }
  const byName = {}; const _idx = buildAliasIndex();
  Object.keys(agg).forEach(function (uid) { const nm = normalizeEmployeeName(getDisplayName(gid[uid] || (groups && groups[0]) || '', uid), _idx); if (!byName[nm]) byName[nm] = { work: 0, chatter: 0 }; byName[nm].work += agg[uid].work; byName[nm].chatter += agg[uid].chatter; });
  return byName;
}
function evaluation(monthArg, empFilter, groupId, detail) {
  // Task12：評分公式/離職過濾/群組範圍/綁定別名歸戶全部不動，只改渲染與明細/簡表分流。
  const ym = resolveYM(monthArg) || thisYM();
  const cf = evalConfig();
  const _idx = buildAliasIndex();                                   // SSOT：hoist 一次供整個評比使用
  const emp = {}; const order = [];
  const ensure = function (e) { if (!(e in emp)) { emp[e] = { days: {}, on: 0, off: 0, late: 0, leave: 0, dutyCnt: 0, dutyAmt: 0, work: 0, chatter: 0, offLate: 0 }; order.push(e); } };
  const att = getSheet(SHEET_ATTEND).getDataRange().getValues();
  for (let i = 1; i < att.length; i++) {
    const e = normalizeEmployeeName(att[i][1], _idx); if (!e) continue; if (ymOf(att[i][0]) !== ym) continue; ensure(e);
    const act = String(att[i][2]).trim(), st = String(att[i][3]).trim();
    if (act === '上班') { emp[e].on++; emp[e].days[ymdStr(att[i][0])] = 1; }
    else if (act === '下班') { emp[e].off++; emp[e].days[ymdStr(att[i][0])] = 1; const h = hourOf(att[i][0]); if (h !== null && h > cf.offbase) emp[e].offLate += (h - cf.offbase); }
    else if (act === '遲到') emp[e].late++;
    else if (act === '請假') emp[e].leave++;
    if (st === '遲到' && act !== '遲到') emp[e].late++;
  }
  const duty = getSheet(SHEET_DUTY).getDataRange().getValues();
  for (let i = 1; i < duty.length; i++) { const e = normalizeEmployeeName(duty[i][1], _idx); if (!e) continue; if (ymOf(duty[i][0]) !== ym) continue; ensure(e); emp[e].dutyCnt++; emp[e].dutyAmt += Number(duty[i][4]) || 0; }
  let groups = getEvalGroups();
  if (!groups.length && groupId) groups = [groupId];
  const byName = speechCountMonth(ym, groups);
  const bindings = getBindings();
  order.forEach(function (e) {
    let w = 0, c = 0;
    const pick = function (nm) { if (byName[nm]) { w += byName[nm].work; c += byName[nm].chatter; } };
    if (bindings[e] && byName[bindings[e]]) { pick(bindings[e]); }
    else { Object.keys(byName).forEach(function (nm) { if (nm === e || nm.indexOf(e) !== -1 || e.indexOf(nm) !== -1) pick(nm); }); }
    emp[e].work = w; emp[e].chatter = c;
  });
  let list = order.filter(function (e) { return !isResigned(e); });
  if (empFilter) { const ef = normalizeEmployeeName(empFilter, _idx); list = list.filter(function (e) { return e.indexOf(ef) !== -1 || ef.indexOf(e) !== -1; }); }
  if (!list.length) return '🏆 ' + ym + ' 沒有可統計的資料。';
  const scored = list.map(function (e) { const x = emp[e]; const d = Object.keys(x.days).length; const score = d * cf.day + x.dutyCnt * cf.duty + x.work * cf.work + x.chatter * cf.chatter + x.late * cf.late + x.leave * cf.leave + x.offLate * cf.offlate; return { e: e, d: d, x: x, score: score }; });
  scored.sort(function (a, b) { return b.score - a.score; });
  const weightLine = '權重:出勤×' + cf.day + ' 外勤×' + cf.duty + ' 工作×' + cf.work + ' 廢話×' + cf.chatter + ' 遲到×' + cf.late + ' 請假×' + cf.leave + ' 晚下班×' + cf.offlate + '(基準' + cf.offbase + '點)';
  if (detail) {
    const medals = ['🥇', '🥈', '🥉'];
    const cards = scored.map(function (r, idx) {
      const x = r.x; const rank = idx + 1;
      let card = (medals[idx] || '🏅') + ' 第' + rank + '名【' + r.e + '】評分 ' + Math.round(r.score) +
        '\n✔ 出勤:' + r.d + ' 天（上' + x.on + '/下' + x.off + '）' +
        '\n🟡 遲到:' + x.late + '｜⚪ 請假:' + x.leave +
        '\n🔵 外勤:' + x.dutyCnt + ' 次・加給 ' + x.dutyAmt + ' 元' +
        '\n💬 工作留言:' + x.work + '｜廢話:' + x.chatter;
      if (x.offLate > 0) card += '\n🌙 晚下班加時:' + (Math.round(x.offLate * 10) / 10) + '小時（+' + Math.round(x.offLate * cf.offlate) + '）';
      return card;
    });
    return '🏆 ' + ym + ' 綜合評比（結算獎金）\n' + cards.join('\n――――――\n') + '\n――――――\n' + weightLine;
  }
  const rows = scored.map(function (r, idx) { const x = r.x; return (idx + 1) + '｜' + r.e + '｜' + Math.round(r.score) + '｜' + r.d + '天｜' + x.dutyCnt + '次｜' + x.late; });
  return '🏆 ' + ym + ' 綜合評比（結算獎金）\n名次｜姓名｜評分｜出勤｜外勤｜遲到\n' + rows.join('\n') + '\n――――――\n' + weightLine;
}
function appendAttendance(emp, action, status) { getSheet(SHEET_ATTEND).appendRow([nowStr(), emp, action, status, '']); }
function controlOverview(groupId) {
  const todayStr = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd');
  const L = ['📊 中控總覽　' + todayStr + '\n――――――――――'];
  const _idx = buildAliasIndex();                                   // SSOT：中控每日出勤/外勤名單合併同一人
  try { const d = getSheet(SHEET_SHIP).getDataRange().getValues(); let c = 0, q = 0; for (let i = 1; i < d.length; i++) { if (ymdStr(d[i][0]) === todayStr) { c++; q += Number(d[i][5]) || 0; } } L.push('🚚 今日寄運：' + c + ' 筆／' + q + ' 件'); } catch (e) { }
  try { const d = getSheet(SHEET_RACK).getDataRange().getValues(); const net = {}; for (let i = 1; i < d.length; i++) { const k = String(d[i][5]) + '｜' + String(d[i][3]); const qq = Number(d[i][4]) || 0; net[k] = (net[k] || 0) + (String(d[i][2]) === '出庫' ? qq : -qq); } let t = 0, p = 0; Object.keys(net).forEach(function (k) { if (net[k] > 0) { t += net[k]; p++; } }); L.push('🔧 鐵架在外：' + t + ' 支（' + p + ' 處未收）'); } catch (e) { }
  try { const d = getSheet(SHEET_TAIZI).getDataRange().getValues(); const net = {}; for (let i = 1; i < d.length; i++) { const k = String(d[i][5]) + '｜' + String(d[i][3]); const qq = Number(d[i][4]) || 0; net[k] = (net[k] || 0) + (String(d[i][2]) === '出庫' ? qq : -qq); } let t = 0; Object.keys(net).forEach(function (k) { if (net[k] > 0) t += net[k]; }); L.push('🥡 台子在外：' + t + ' 個'); } catch (e) { }
  try { const d = getSheet(SHEET_RETURN).getDataRange().getValues(); let c = 0; for (let i = 1; i < d.length; i++) if (ymdStr(d[i][0]) === todayStr) c++; L.push('↩️ 今日退貨：' + c + ' 筆'); } catch (e) { }
  try { const d = getSheet(SHEET_FINANCE).getDataRange().getValues(); let chg = 0, loss = 0, remit = 0; for (let i = 1; i < d.length; i++) { if (ymdStr(d[i][0]) !== todayStr) continue; const ty = String(d[i][2]); if (ty === '改價') chg++; else if (ty === '損耗') loss++; else if (ty === '匯款') remit++; } L.push('💰 今日 改價 ' + chg + '／損耗 ' + loss + '／匯款 ' + remit); } catch (e) { }
  try { const d = getSheet(SHEET_ATTEND).getDataRange().getValues(); const onSet = {}; const on = [], leave = [], late = []; for (let i = 1; i < d.length; i++) { if (ymdStr(d[i][0]) !== todayStr) continue; const e = normalizeEmployeeName(d[i][1], _idx); const act = String(d[i][2]).trim(), st = String(d[i][3]).trim(); if (act === '上班' && !onSet[e]) { onSet[e] = 1; on.push(e); } if (act === '請假') leave.push(e); if (act === '遲到' || st === '遲到') late.push(e); } let s = '🕒 出勤：上班 ' + on.length + ' 人'; if (late.length) s += '｜遲到 ' + late.join('、'); if (leave.length) s += '｜請假 ' + leave.join('、'); L.push(s); } catch (e) { }
  try { const d = getSheet(SHEET_DUTY).getDataRange().getValues(); const rows = []; let amt = 0; for (let i = 1; i < d.length; i++) { if (ymdStr(d[i][0]) !== todayStr) continue; rows.push(normalizeEmployeeName(d[i][1], _idx) + '(' + (d[i][2] || '') + ')'); amt += Number(d[i][4]) || 0; } L.push(rows.length ? ('📍 今日外勤：' + rows.join('、') + '　加給 ' + amt + ' 元') : '📍 今日外勤：無'); } catch (e) { }
  try { const d = msgTail(5000); let c = 0; const ppl = {}; for (let i = 1; i < d.length; i++) { if (ymdStr(d[i][0]) !== todayStr) continue; if (groupId && String(d[i][3]) !== groupId) continue; const t = String(d[i][1]); if (/^\[(貼圖|圖片|影片|語音|檔案|位置)\]$/.test(t)) continue; c++; ppl[String(d[i][2])] = 1; } L.push('💬 今日發言：' + c + ' 則（' + Object.keys(ppl).length + ' 人）'); } catch (e) { }
  L.push('――――――――――\n（綜合評比→打「綜合評比」；明細→各別查詢指令）');
  return L.join('\n');
}
function attendanceStats(monthArg, empFilter, detail) {
  // Task11：統計邏輯/資料來源/別名合併(SSOT)/權限全部不動，只改輸出格式與明細/簡表分流。
  const ym = resolveYM(monthArg) || thisYM();
  const data = getSheet(SHEET_ATTEND).getDataRange().getValues();
  const stat = {}; const order = []; const days = {};
  const _idx = buildAliasIndex();
  const _filter = empFilter ? normalizeEmployeeName(empFilter, _idx) : '';
  for (let i = 1; i < data.length; i++) {
    const emp = normalizeEmployeeName(data[i][1], _idx); if (!emp) continue;
    if (_filter && emp.indexOf(_filter) === -1) continue;
    if (ym && ymOf(data[i][0]) !== ym) continue;
    if (!(emp in stat)) { stat[emp] = { on: 0, off: 0, late: 0, leave: 0 }; order.push(emp); days[emp] = {}; }
    const act = String(data[i][2]).trim(); const st = String(data[i][3]).trim(); const dk = ymdStr(data[i][0]);
    if (act === '上班') { stat[emp].on++; days[emp][dk] = days[emp][dk] || {}; days[emp][dk].on = 1; }
    else if (act === '下班') { stat[emp].off++; days[emp][dk] = days[emp][dk] || {}; days[emp][dk].off = 1; }
    else if (act === '遲到') stat[emp].late++;
    else if (act === '請假') stat[emp].leave++;
    if (st === '遲到' && act !== '遲到') stat[emp].late++;
  }
  // 外勤次數（同資料源 SHEET_DUTY、員工名過 empAlias）
  const dutyCnt = {};
  try { const dd = getSheet(SHEET_DUTY).getDataRange().getValues(); for (let i = 1; i < dd.length; i++) { const e = normalizeEmployeeName(dd[i][1], _idx); if (!e) continue; if (ym && ymOf(dd[i][0]) !== ym) continue; dutyCnt[e] = (dutyCnt[e] || 0) + 1; } } catch (e) { }
  const filtered = order.filter(function (e) { return !isResigned(e); });
  if (!filtered.length) return '🕒 ' + ym + ' 沒有可統計的資料。';
  const dayCount = function (e) { return Object.keys(days[e]).length; };
  const normalCount = function (e) { return Object.keys(days[e]).filter(function (k) { return days[e][k].on && days[e][k].off; }).length; };
  const isPerfect = function (e) { return stat[e].late === 0 && stat[e].leave === 0; };
  filtered.sort(function (a, b) { return dayCount(b) - dayCount(a); });   // 出勤天數多→少
  if (detail) {
    const cards = filtered.map(function (e) {
      const s = stat[e];
      return '👤 ' + e +
        '\n✔ 出勤天數:' + dayCount(e) + ' 天' +
        '\n🟢 正常打卡:' + normalCount(e) + ' 天' +
        '\n🟡 遲到:' + s.late + ' 次' +
        '\n🔵 外勤:' + (dutyCnt[e] || 0) + ' 次' +
        '\n⚪ 請假:' + s.leave + ' 天' +
        '\n🏅 全勤資格:' + (isPerfect(e) ? '符合' : '不符合');
    });
    return '📊 ' + ym + ' 出勤統計（獎金結算）\n' + cards.join('\n――――――\n');
  }
  const rows = filtered.map(function (e) { const s = stat[e]; return e + '｜' + dayCount(e) + '天｜' + s.late + '｜' + s.leave + '｜' + (isPerfect(e) ? '✅' : '❌'); });
  const perfectN = filtered.filter(isPerfect).length;
  return '📊 ' + ym + ' 出勤統計（獎金結算）\n姓名｜出勤｜遲到｜請假｜全勤\n' + rows.join('\n') + '\n――――――\n共 ' + filtered.length + ' 人｜全勤 ' + perfectN + ' 人';
}
function countRecords(sheetName, colIndex, value) {
  const data = getSheet(sheetName).getDataRange().getValues();
  let c = 0;
  for (let i = 1; i < data.length; i++) if (String(data[i][colIndex]).trim() === value) c++;
  return c;
}
function clearRecords(sheetName, colIndex, value) {
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  let count = 0;
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][colIndex]).trim() === value) { sheet.deleteRow(i + 1); count++; }
  }
  return count;
}
function cancelAttendance(text) {
  let t = text.replace(/取消\s*$/, '').replace(/^[・·•]+/, '').trim();
  const tm = t.match(/(\d{1,2}\/\d{1,2})\s+(\d{1,2}:\d{2})/);
  const timeStr = tm ? (tm[1] + ' ' + tm[2]) : '';
  if (tm) t = t.replace(tm[0], ' ').trim();
  const am = t.match(/(上班|下班|遲到|請假)/);
  if (!am) return null;
  const action = am[1];
  let emp = t.slice(0, t.indexOf(action)).replace(/[（(].*$/, '').trim();
  if (!emp) return null;
  const sheet = getSheet(SHEET_ATTEND);
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]).trim() !== emp) continue;
    if (data[i][2] !== action) continue;
    if (timeStr && fmtTime(data[i][0]) !== timeStr) continue;
    const when = fmtTime(data[i][0]);
    sheet.deleteRow(i + 1);
    return { emp: emp, action: action, time: when };
  }
  return null;
}
function cancelFinance(text, chatId) {
  let t = text.replace(/取消\s*$/, '').replace(/^[・·•]+/, '').trim();
  const tm = t.match(/(\d{1,2}\/\d{1,2})\s+(\d{1,2}:\d{2})/);
  const timeStr = tm ? (tm[1] + ' ' + tm[2]) : '';
  if (tm) t = t.replace(tm[0], ' ').trim();
  let type, customer;
  if (/(?:扣除|損耗)\s*\d+\s*件/.test(t)) {
    type = '損耗';
    customer = t.slice(0, t.search(/扣除|損耗/)).trim();
  } else {
    type = '改價';
    const ci = t.search(/[：:]/);
    customer = ci >= 0 ? t.slice(0, ci).trim() : t.replace(/改\s*\d+\s*元.*$|價格修正.*$/, '').trim();
  }
  if (!customer) customer = getGroupCustomer(chatId);
  if (!customer) return null;
  const sheet = getSheet(SHEET_FINANCE);
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][2] !== type) continue;
    if (String(data[i][1]).trim().indexOf(customer) === -1) continue;
    if (timeStr && fmtTime(data[i][0]) !== timeStr) continue;
    const when = fmtTime(data[i][0]);
    const desc = (type === '損耗') ? ('扣除 ' + data[i][3] + ' 件') : (String(data[i][4] || '改價').slice(0, 20));
    sheet.deleteRow(i + 1);
    return { type: type, customer: String(data[i][1]).trim(), time: when, desc: desc };
  }
  return null;
}
function attendanceQuery(actionFilter, arg) {
  arg = String(arg).trim();
  const data = getSheet(SHEET_ATTEND).getDataRange().getValues();
  const dates = arg.match(/(?:\d{4}\/)?\d{1,2}\/\d{1,2}/g) || [];
  let lo = null, hi = null, rangeLabel = '';
  if (dates.length) {
    const a = parseYMD(dates[0]), b = parseYMD(dates[1] || dates[0]);
    lo = Math.min(a, b); hi = Math.max(a, b);
    rangeLabel = dates[0] + (dates[1] ? '-' + dates[1] : '');
  }
  let emp = arg;
  dates.forEach(function (d) { emp = emp.replace(d, ' '); });
  emp = emp.replace(/紀錄|記錄|查詢/g, ' ');
  emp = emp.replace(/[-~～至到]+/g, ' ').replace(/\s+/g, ' ').trim();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const act = data[i][2];
    if (actionFilter && act !== actionFilter) continue;
    if (emp && String(data[i][1]).indexOf(emp) === -1) continue;
    if (lo !== null) { const d = ymdNum(data[i][0]); if (!d || d < lo || d > hi) continue; }
    const st = (data[i][3] && data[i][3] !== '正常') ? '（' + data[i][3] + '）' : '';
    rows.push('・' + fmtTime(data[i][0]) + '　' + (data[i][1] || '(未填)') + ' ' + act + st);
  }
  const title = actionFilter ? ('🕒 ' + actionFilter + '紀錄') : '🕒 員工出勤紀錄';
  const head = title + (emp ? '・' + emp : '') + (rangeLabel ? '（' + rangeLabel + '）' : '');
  if (rows.length === 0) return head + '：目前沒有紀錄。';
  let out = head + '：\n' + rows.slice(-60).join('\n') + '\n――――――\n共 ' + rows.length + ' 筆';
  if (out.length > 4500) out = out.slice(0, 4500) + '\n…(太多了，只顯示一部分)';
  return out;
}

/* ========================== 【建立/排版工作表】 ========================== */
// ★ 速度優化：試算表與分頁一次執行只開一次、快取重用（資料越多越有感）
var __SS = null; var __SHEETS = {};
function getSpreadsheet() { if (!__SS) __SS = SpreadsheetApp.openById(SHEET_ID); return __SS; }
function getSheet(name) {
  if (__SHEETS[name]) return __SHEETS[name];
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); sheet.appendRow(headerFor(name)); formatSheet(sheet, headerFor(name).length); }
  __SHEETS[name] = sheet;
  return sheet;
}
function headerFor(name) {
  if (name === SHEET_RACK)    return ['時間', '回報人', '動作', '鐵架編號', '數量', '客戶'];
  if (name === SHEET_TAIZI)   return ['時間', '回報人', '動作', '品項', '數量', '客戶'];
  if (name === SHEET_ATTEND)  return ['時間', '員工', '動作', '狀態', '回報人'];
  if (name === SHEET_FREEZER) return ['時間', '客戶', '品名', '動作', '數量', '該品項剩餘'];
  if (name === SHEET_MSG)     return ['時間', '群組訊息內容', '發言人ID', '群組ID'];
  if (name === SHEET_SHIP)    return ['時間', '客戶', '貨主', '品名', '等級', '件數', '包裝', '物流', '回報人', '備註', '單位'];
  if (name === SHEET_STOCK)   return ['時間', '冰庫', '貨主', '品名', '數量', '更新人'];
  if (name === SHEET_PARK)    return ['客戶', '資訊', '更新時間'];
  if (name === SHEET_HIRE)    return ['員工', '入職時間'];
  if (name === SHEET_LOAN)    return ['時間', '員工', '類型', '金額'];
  if (name === SHEET_RETURN)  return ['時間', '客戶', '品名', '數量', '單位'];
  if (name === SHEET_TARE)    return ['車牌', '空車重量', '名稱', '更新時間'];
  if (name === SHEET_DUTY)    return ['時間', '員工', '地點', '出發時間', '補貼', '備註'];
  if (name === SHEET_RECEIVABLE) return ['建立時間', '日期', '客戶', '供應商', '品項', '金額', '備註', '狀態', '建立者', '收款人', '收款時間', '結案時間', '來源群組', '來源訊息ID', '原文', '刪除時間', '刪除者', '取消原因'];
  return ['時間', '客戶', '類型', '金額', '內容', '回報人'];
}
function formatSheet(sheet, numCols) {
  const all = sheet.getRange(1, 1, sheet.getMaxRows(), numCols);
  all.setFontSize(FONT_SIZE).setVerticalAlignment('middle').setHorizontalAlignment('center');
  sheet.getRange(1, 1, 1, numCols).setFontWeight('bold').setBackground('#d9ead3');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 230);
  for (let c = 2; c <= numCols; c++) sheet.setColumnWidth(c, 170);
}

/* ========================== 【LINE API / 工具】 ========================== */
// Task7：超長回覆優先分多則（單次最多5則），仍超長則截斷加提示。
function splitForLine(text) {
  const MAX = 4800, MAXMSG = 5;
  let s = String(text == null ? '' : text);
  const msgs = [];
  while (s.length > MAX && msgs.length < MAXMSG - 1) { msgs.push({ type: 'text', text: s.slice(0, MAX) }); s = s.slice(MAX); }
  if (s.length > MAX) s = s.slice(0, MAX - 30) + '\n…（內容過長已截斷，請縮小查詢範圍）';
  msgs.push({ type: 'text', text: s });
  return msgs;
}
function replyToLine(replyToken, text) {
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + CHANNEL_ACCESS_TOKEN },
    payload: JSON.stringify({ replyToken: replyToken, messages: splitForLine(text) }),
    muteHttpExceptions: true
  });
  try { const code = res.getResponseCode(); if (code !== 200) console.error('LINE reply ' + code + ': ' + String(res.getContentText()).slice(0, 100)); } catch (e) { }
}
// Task7：safeReply 與 replyToLine 同義（規格別名），供明確語意呼叫。
function safeReply(replyToken, text) { return replyToLine(replyToken, text); }
function notifyOwner(text) {
  const ownerId = PROPS.getProperty('OWNER_USER_ID'); if (!ownerId) return;
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + CHANNEL_ACCESS_TOKEN },
    payload: JSON.stringify({ to: ownerId, messages: [{ type: 'text', text: '🔔🔔🔔 重要通知 🔔🔔🔔\n' + text }] }),
    muteHttpExceptions: true
  });
}
// 寫入專用鎖：縮短等待（預設 5s），搶不到就丟 BUSY → 由 doPost 回「系統忙碌」。查詢類一律不呼叫此函式。
function acquireLock(ms) { var lock = LockService.getScriptLock(); if (!lock.tryLock(ms || 5000)) throw new Error('BUSY_系統忙碌'); return lock; }
function nowStr() { return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm'); }
function mdOf(v) {   // 取月/日，可吃 Date 物件或字串
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'M/d');
  const s = String(v);
  let m = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/); if (m) return m[2] + '/' + m[3];
  m = s.match(/(\d{1,2})\/(\d{1,2})/); if (m) return m[1] + '/' + m[2];
  try { const d = new Date(s); if (!isNaN(d.getTime())) return Utilities.formatDate(d, 'Asia/Taipei', 'M/d'); } catch (e) { }
  return '';
}
function setupAll() {
  [SHEET_FINANCE, SHEET_RACK, SHEET_TAIZI, SHEET_ATTEND, SHEET_FREEZER, SHEET_MSG, SHEET_SHIP].forEach(function (name) {
    getSheet(name);
    const s = SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
    if (s) formatSheet(s, headerFor(name).length);
  });
  Logger.log('setupAll 完成！');
}

/* ========================== 【每日試算表自動備份（零新增權限版）】 ==========================
 * dailyBackup()：用 SpreadsheetApp.openById(SHEET_ID).copy(檔名) 複製整份試算表——僅需既有「試算表」
 *   權限，**不使用 DriveApp、不需任何新授權**。複本落在「我的雲端硬碟」根目錄，檔名含日期。
 * 保留份數：自動刪舊檔需 DriveApp（會要新授權），故本版**不自動刪**；改為每週一次 notifyOwner
 *   提醒老闆到 Drive 手動整理（建議保留最近 14 份）。清理提醒獨立 try，**絕不影響備份本身**。
 * setupBackupTrigger()：手動執行一次，建立每日觸發器（約 23:30）。已存在則不重複建立。
 * 純函式（backupFileName / isBackupFileName / shouldRemindCleanup）已納入 golden tests；實際複製部署後手動驗證。
 */
const BACKUP_PREFIX = '卡比集總管_backup_';
const BACKUP_KEEP = 14;   // 建議手動保留份數（提醒文案用；本版不自動刪）

function backupFileName(d) { return BACKUP_PREFIX + Utilities.formatDate(d || new Date(), 'Asia/Taipei', 'yyyy-MM-dd'); }
function isBackupFileName(name) { return new RegExp('^' + BACKUP_PREFIX + '\\d{4}-\\d{2}-\\d{2}$').test(String(name || '')); }

// 純函式：是否該送「手動清理」每週提醒。lastYmd 空、無法解析、或距今 ≥ 7 天 → true。
function shouldRemindCleanup(lastYmd, todayYmd) {
  if (!lastYmd) return true;
  const a = Date.parse(lastYmd), b = Date.parse(todayYmd);
  if (isNaN(a) || isNaN(b)) return true;
  return (b - a) >= 7 * 24 * 60 * 60 * 1000;
}

function dailyBackup() {
  let name;
  try {
    name = backupFileName(new Date());
    SpreadsheetApp.openById(SHEET_ID).copy(name);   // 僅用既有試算表權限複製整份試算表（不碰 DriveApp）
    Logger.log('✅ dailyBackup 完成：已複製整份試算表為「' + name + '」（我的雲端硬碟根目錄）。');
  } catch (e) {
    const msg = (e && e.message) || e;
    Logger.log('❌ dailyBackup 失敗：' + msg);
    try { notifyOwner('⚠️ 今日試算表備份失敗：' + msg + '\n請檢查試算表是否存在／雲端空間是否足夠（手冊：docs/備份與還原手冊.md）。'); } catch (err) { }
    return { ok: false, error: String(msg) };
  }
  // 每週一次提醒老闆手動清理舊備份——獨立 try，絕不因提醒失敗而讓備份被判失敗。
  let reminded = false;
  try {
    const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
    if (shouldRemindCleanup(PROPS.getProperty('BACKUP_CLEAN_REMINDER'), today)) {
      notifyOwner('🗂️ 每週備份提醒：系統每天自動備份試算表（檔名「' + BACKUP_PREFIX + '日期」），但不會自動刪舊檔。\n請到 Google 雲端硬碟搜尋「' + BACKUP_PREFIX + '」整理，建議保留最近 ' + BACKUP_KEEP + ' 份即可。');
      PROPS.setProperty('BACKUP_CLEAN_REMINDER', today);
      reminded = true;
    }
  } catch (err) { Logger.log('清理提醒發送失敗（不影響備份）：' + err); }
  return { ok: true, name: name, reminded: reminded };
}

// 手動執行一次即可：建立每日備份觸發器（約 23:30，避開整點尖峰）。已存在同 handler 則不重複建立。
function setupBackupTrigger() {
  const exists = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'dailyBackup'; });
  if (exists) { Logger.log('已存在 dailyBackup 觸發器，不重複建立。'); return { created: false }; }
  ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(23).nearMinute(30).create();
  Logger.log('✅ 已建立每日 dailyBackup 觸發器（約 23:30）。');
  return { created: true };
}
