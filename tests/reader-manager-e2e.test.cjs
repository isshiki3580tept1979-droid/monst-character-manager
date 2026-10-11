// 管理アプリ（試作版）⇔ スクショ読取 Ver.2 の連携を、本番と同じ構造・同じホスト名で再現して確かめる（通信は一切しない）。
//  ・管理アプリ  https://isshiki3580tept1979-droid.github.io/monst-character-manager/monst_character_manager_trial.html
//  ・読取アプリ  https://script.google.com/macros/s/…/exec（最上位。COOP ヘッダーなし＝本物と同じ）
//      └ iframe#sandboxFrame  https://n-…-0lu-script.googleusercontent.com/userCodeAppPanel（本物と同じ sandbox 属性）
//          └ iframe#userHtmlFrame  同じオリジンの /blank に Index.html を入れる（google.script はモック。Gemini は呼ばない）
// 架空データだけを使う。ページの通信はすべて context.route で受け、外へは出さない。
const {test,before,after,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,devices}=require('playwright');
const TRIAL=path.join(__dirname,'..','monst_character_manager_trial.html');
const READER=path.join(__dirname,'..','モンスト スクショ読取','Index.html');
const MANAGER_URL='https://isshiki3580tept1979-droid.github.io/monst-character-manager/monst_character_manager_trial.html';
const GAS_HOST='https://script.google.com';
const SANDBOX_HOST='https://n-test0e2e0sandbox0host0-0lu-script.googleusercontent.com';
const KEY='monst-character-manager-trial-v2';
// 本物の sandboxFrame と同じ sandbox 属性（2026-10-09 に本番ページで確認）
const SANDBOX='allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-top-navigation-by-user-activation allow-storage-access-by-user-activation';
const READING={format:'monst-screenshot-reading-v1',characterName:'架空連携キャラ',formName:null,monsterNo:'90021',race:'亜人',battleType:'バランス型',shotType:'反射',
  fruit1:'撃種の絆・加命撃（特級L）',fruit2:'撃種の絆・加撃 特L',fruit3:null,confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[]};
// userHtmlFrame の中の google.script（読み取りは固定の架空結果を返す。getLocation は最上位の URL のパラメータを返す＝本物と同じ働き）
const MOCK=`<script>window.__calls=[];window.google={script:{
  run:(function(){function mk(s,f){return {withSuccessHandler:h=>mk(h,f),withFailureHandler:h=>mk(s,h),msrReadScreenshot:p=>{window.__calls.push(p.images.length);setTimeout(()=>s({ok:true,reading:${JSON.stringify(READING)},model:'mock'}),20)}}}return mk(()=>{},()=>{})})(),
  url:{getLocation:cb=>{const q=new URLSearchParams(decodeURIComponent(new URLSearchParams(parent.location.search).get('q')||''));const parameter={};q.forEach((v,k)=>parameter[k]=v);setTimeout(()=>cb({parameter}),10)}}}};</script>`;
let browser,context,manager,errors,external,coop,live=[];
before(async()=>{browser=await chromium.launch({headless:true})});
after(async()=>{await browser?.close()});
beforeEach(async()=>{
  // Android Chrome 相当（スマホの画面幅・タッチ・モバイル UA）
  context=await browser.newContext({...devices['Pixel 7'],viewport:{width:390,height:844}});external=[];errors=[];coop='';
  await context.route('**/*',async r=>{
    const u=new URL(r.request().url());
    // LIVE_MANAGER=1：公開中の GitHub Pages の管理アプリをそのまま使う（公開後の確認用）
    if(u.href.split('?')[0]===MANAGER_URL) return process.env.LIVE_MANAGER?(live.push(u.href),r.continue()):r.fulfill({contentType:'text/html; charset=utf-8',body:fs.readFileSync(TRIAL)});
    if(u.origin===GAS_HOST&&u.pathname.startsWith('/macros/s/')&&u.pathname.endsWith('/exec'))
      return r.fulfill({contentType:'text/html; charset=utf-8',headers:coop?{'Cross-Origin-Opener-Policy':coop}:{},
        body:`<!doctype html><title>GAS</title><body style="margin:0"><iframe id="sandboxFrame" style="width:100%;height:100vh;border:0" sandbox="${SANDBOX}" src="${SANDBOX_HOST}/userCodeAppPanel?q=${encodeURIComponent(u.search.slice(1))}"></iframe></body>`});
    if(u.origin===SANDBOX_HOST&&u.pathname==='/userCodeAppPanel')
      return r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><style>html,body,iframe{border:0;margin:0;width:100%;height:100%}</style><iframe id="userHtmlFrame" src="/blank"></iframe>`});
    if(u.origin===SANDBOX_HOST&&u.pathname==='/blank')
      return r.fulfill({contentType:'text/html; charset=utf-8',body:fs.readFileSync(READER,'utf8').replace('<script>',MOCK+'<script>')});
    if(u.pathname==='/favicon.ico') return r.fulfill({status:204,body:''});
    external.push(u.href);return r.abort();
  });
  context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message))});
  manager=await context.newPage();
  manager.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|net::/.test(m.text()))errors.push(m.text())});
  await manager.goto(MANAGER_URL);
});
afterEach(async()=>{
  assert.deepEqual(errors,[],'no JavaScript errors');
  assert.deepEqual(external,[],'nothing leaves the browser');
  await context.close();
});
const seed=async raw=>{await manager.evaluate(({k,raw})=>localStorage.setItem(k,JSON.stringify(raw)),{k:KEY,raw});await manager.reload()};
const snapshot=()=>manager.evaluate(()=>JSON.parse(JSON.stringify(db)));
const png=()=>({name:'s.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64')});
// 管理アプリのボタンから読取アプリを開き、読取アプリの「中身のフレーム」を返す
async function openReaderFrom(selector){
  const [pop]=await Promise.all([context.waitForEvent('page'),manager.locator(selector).first().click()]);
  await pop.waitForLoadState();
  let fr=null;
  for(let i=0;i<100&&!fr;i++){fr=pop.frames().find(f=>f.url().startsWith(SANDBOX_HOST+'/blank'));if(!fr)await pop.waitForTimeout(50)}
  await fr.waitForSelector('#file',{state:'attached'});
  return {pop,fr};
}
async function readTwo(fr){
  await fr.setInputFiles('#file',[png(),{...png(),name:'t.png'}]);
  await fr.waitForFunction(()=>!document.getElementById('readBtn').disabled);
  await fr.click('#readBtn');await fr.waitForSelector('#result:not(.hidden)');
}

test('whole flow on a phone-sized screen: device → reader → check/edit → send back → confirm → register → usable on the stage', async()=>{
  await seed({characters:[],master:{characters:[],forms:[]},units:[],useDevs:{'禁忌の獄::一ノ獄':['サブ2']},ui:{view:'stage',quest:'禁忌の獄',stage:{'禁忌の獄':'一ノ獄'}}});
  // ① キャラ登録を開いて端末を選ぶ → ②「スクショから登録」
  await manager.evaluate(()=>openQuickReg());await manager.selectOption('#qrDevice','サブ2');
  const {pop,fr}=await openReaderFrom('[data-act="qrFromShot"]');
  // 読取アプリ側：管理アプリから開かれたことが分かる（本物と同じ iframe 構造で window.top.opener が見える）
  assert.equal(await fr.evaluate(()=>!!window.top.opener),true,'window.top.opener reachable from the sandboxed user frame');
  assert.equal(await fr.evaluate(()=>location.origin),SANDBOX_HOST);
  // ③④ 画像2枚 → 読み取り（モック）→ ⑤ 確認・修正
  await readTwo(fr);
  assert.equal(await fr.locator('#sendBtn').isVisible(),true);assert.equal(await fr.locator('#copyBtn').isVisible(),true,'copy is still available');
  await fr.fill('#f_fruit3','撃種の絆・加撃速 特M');
  const closing=pop.waitForEvent('close',{timeout:5000});
  await fr.locator('#sendBtn').tap();
  await closing; // 送ったら読取アプリのタブを閉じる（管理アプリのタブに戻る）
  // 管理アプリ：確認画面に入る（まだ登録しない）。端末はキャラ登録で選んだもの
  await manager.waitForSelector('#srEdit',{state:'visible'});
  assert.equal(await manager.inputValue('#srF_characterName'),'架空連携キャラ');assert.equal(await manager.inputValue('#srDevice'),'サブ2');
  assert.deepEqual([await manager.inputValue('#srFr3Name'),await manager.inputValue('#srFr3Grade')],['撃種の絆・加撃速','特級M'],'edit made in the reader arrives');
  assert.deepEqual((await snapshot()).units,[],'nothing registered on receipt');
  assert.ok(await manager.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal scroll at 390px');
  await manager.screenshot({path:path.join(__dirname,'artifacts','e2e-confirm-390.png')});
  // ⑥⑦ 登録確認 → 登録する ⑧ 所持キャラ
  await manager.locator('[data-act="srCheck"]').tap();await manager.locator('[data-act="srApply"]').tap();
  const d=await snapshot();assert.equal(d.units.length,1);assert.equal(d.units[0].device,'サブ2');
  // ステージ編成：適正未登録でも、所持キャラから仮選択できる
  await manager.locator('[data-act="view"][data-view="stage"]').first().tap();
  await manager.locator('.pickDev[data-dev="サブ2"] [data-act="openPicker"]').tap();
  await manager.locator(`#pkList .pkItem[data-id="${d.units[0].id}"]`).tap();
  assert.match(await manager.locator('.pickDev[data-dev="サブ2"] .pickCur.prov').textContent(),/仮選択｜適正未登録/);
  assert.deepEqual((await snapshot()).suits,[]);
  await manager.screenshot({path:path.join(__dirname,'artifacts','e2e-stage-390.png')});
});

test('reader opened directly (not from the manager): no send button; copy works as before', async()=>{
  const pop=await context.newPage();await pop.goto(`${GAS_HOST}/macros/s/AKfycbzTEST/exec`);
  const fr=await (async()=>{for(;;){const f=pop.frames().find(f=>f.url().startsWith(SANDBOX_HOST+'/blank'));if(f)return f;await pop.waitForTimeout(50)}})();
  await fr.waitForSelector('#file',{state:'attached'});await readTwo(fr);
  assert.equal(await fr.locator('#sendBtn').isVisible(),false);assert.equal(await fr.locator('#copyBtn').isVisible(),true);
  // nonce の形が違う（長すぎる・記号入り）ときも出さない
  for(const n of ['short','a'.repeat(81),'abc<def>ghijklmnopqrstu']){
    await pop.goto(`${GAS_HOST}/macros/s/AKfycbzTEST/exec?return=manager&nonce=${encodeURIComponent(n)}`);
    const f2=await (async()=>{for(;;){const f=pop.frames().find(f=>f.url().startsWith(SANDBOX_HOST+'/blank'));if(f)return f;await pop.waitForTimeout(50)}})();
    await f2.waitForSelector('#file',{state:'attached'});await readTwo(f2);
    assert.equal(await f2.locator('#sendBtn').isVisible(),false,n);
  }
});

test('send payload: only the reading (no image / base64 / model / key), to the fixed manager origin, once', async()=>{
  await manager.locator('[data-act="view"][data-view="admin"]').first().tap();
  await manager.evaluate(()=>{window.__got=[];window.addEventListener('message',e=>window.__got.push({origin:e.origin,data:e.data}))});
  const {pop,fr}=await openReaderFrom('[data-act="srReader"]');
  await readTwo(fr);
  const closed=pop.waitForEvent('close',{timeout:5000}).catch(()=>null);
  await fr.click('#sendBtn');await closed;
  const got=await manager.evaluate(()=>window.__got.filter(x=>x.data&&x.data.type==='msr-reading'));
  assert.equal(got.length,1);
  assert.equal(got[0].origin,SANDBOX_HOST,'origin seen by the manager is the Apps Script sandbox host');
  assert.deepEqual(Object.keys(got[0].data).sort(),['nonce','reading','type']);
  assert.deepEqual(Object.keys(got[0].data.reading).sort(),['battleType','characterName','confidence','fruit1','fruit2','fruit3','fruit4','formName','monsterNo','needsReview','race','reviewNotes','shotType','uncertainFields','format'].sort());
  assert.doesNotMatch(JSON.stringify(got[0].data),/base64|iVBOR|AIza|model|mock/i);
});

test('if the opener link is cut (e.g. a COOP header or the manager tab was closed), the reader says so and the copy fallback stays', async()=>{
  // (a) 読取アプリの最上位ページに COOP があった場合（本物には無いが、将来 Google が付けた場合の動き）
  coop='same-origin';
  await manager.locator('[data-act="view"][data-view="admin"]').first().tap();
  let {pop,fr}=await openReaderFrom('[data-act="srReader"]');
  assert.equal(await fr.evaluate(()=>window.top.opener),null,'COOP severs the opener');
  await readTwo(fr);await fr.click('#sendBtn');
  assert.match(await fr.locator('#copyMsg').textContent(),/管理アプリのタブが見つかりません。「JSONをコピー」して/);
  assert.equal(pop.isClosed(),false);assert.equal(await manager.locator('#srEdit').isVisible(),false);
  await pop.close();
  // (b) 管理アプリのタブを先に閉じた場合
  coop='';
  ({pop,fr}=await openReaderFrom('[data-act="srReader"]'));
  await readTwo(fr);await manager.close();
  await fr.click('#sendBtn');
  assert.match(await fr.locator('#copyMsg').textContent(),/管理アプリのタブが見つかりません/);
  assert.equal(pop.isClosed(),false);
  manager=await context.newPage();await manager.goto(MANAGER_URL); // afterEach 用
});

test('manager reload while the reader is open (phone discarded the tab): the result is still accepted once', async()=>{
  await manager.locator('[data-act="view"][data-view="admin"]').first().tap();
  const {pop,fr}=await openReaderFrom('[data-act="srReader"]');
  await manager.reload();
  await readTwo(fr);
  const closing=pop.waitForEvent('close',{timeout:5000});
  await fr.click('#sendBtn');await closing;
  await manager.waitForSelector('#srEdit',{state:'visible'});
  assert.equal(await manager.inputValue('#srF_characterName'),'架空連携キャラ');
  assert.deepEqual((await snapshot()).units,[]);
});

test('popup blocked: the manager explains it and keeps the paste route', async()=>{
  await manager.locator('[data-act="view"][data-view="admin"]').first().tap();
  await manager.evaluate(()=>{window.open=()=>null});
  await manager.locator('[data-act="srReader"]').tap();
  assert.match(await manager.locator('#srMsg').textContent(),/読取アプリを開けませんでした/);
  assert.equal(await manager.locator('#srText').isVisible(),true);
});

test('target origin is fixed: a manager page on another origin never receives the reading', async()=>{
  const OTHER='https://other-site.example/monst_character_manager_trial.html';
  await context.route(OTHER,r=>r.fulfill({contentType:'text/html; charset=utf-8',body:fs.readFileSync(TRIAL)}));
  const other=await context.newPage();await other.goto(OTHER);
  await other.locator('[data-act="view"][data-view="admin"]').first().tap();
  await other.evaluate(()=>{window.__got=0;window.addEventListener('message',e=>{if(e.data&&e.data.type==='msr-reading')window.__got++})});
  const [pop]=await Promise.all([context.waitForEvent('page'),other.locator('[data-act="srReader"]').tap()]);
  let fr=null;for(let i=0;i<100&&!fr;i++){fr=pop.frames().find(f=>f.url().startsWith(SANDBOX_HOST+'/blank'));if(!fr)await pop.waitForTimeout(50)}
  await fr.waitForSelector('#file',{state:'attached'});await readTwo(fr);
  const closing=pop.waitForEvent('close',{timeout:5000}).catch(()=>null);
  await fr.click('#sendBtn');await closing;await other.waitForTimeout(300);
  assert.equal(await other.evaluate(()=>window.__got),0,'browser drops the message (targetOrigin mismatch)');
  assert.equal(await other.locator('#srEdit').isVisible(),false);
  await other.close();
});

test('camera route: opened for サブ2 the reader starts with the camera; two photos → send back → confirm screen (not registered)', async()=>{
  await seed({characters:[],master:{characters:[],forms:[]},units:[],ui:{view:'stage',quest:'禁忌の獄',stage:{'禁忌の獄':'一ノ獄'}}});
  await manager.evaluate(()=>openQuickReg());await manager.selectOption('#qrDevice','サブ2');
  const {pop,fr}=await openReaderFrom('[data-act="qrFromShot"]');
  await fr.waitForFunction(()=>document.getElementById('modeCam').getAttribute('aria-pressed')==='true');
  assert.match(await fr.locator('#modeHint').textContent(),/登録先：サブ2/);
  assert.equal(await fr.locator('#cam1').getAttribute('capture'),'environment');
  for(const n of [1,2]){
    await fr.setInputFiles('#cam'+n,{...png(),name:'IMG_'+n+'.jpg'});
    await fr.waitForFunction(n=>/撮影済み/.test(document.getElementById('slotState'+n).textContent),n);
  }
  await fr.click('#readBtn');await fr.waitForSelector('#result:not(.hidden)');
  assert.deepEqual(await fr.evaluate(()=>window.__calls),[2],'both photos in one reader call');
  const closing=pop.waitForEvent('close',{timeout:5000});
  await fr.locator('#sendBtn').tap();await closing;
  await manager.waitForSelector('#srEdit',{state:'visible'});
  assert.equal(await manager.inputValue('#srF_characterName'),'架空連携キャラ');assert.equal(await manager.inputValue('#srDevice'),'サブ2');
  assert.deepEqual((await snapshot()).units,[],'nothing registered on receipt');
});

test('メイン keeps the screenshot route first (camera still selectable)', async()=>{
  await manager.evaluate(()=>openQuickReg());await manager.selectOption('#qrDevice','メイン');
  const {pop,fr}=await openReaderFrom('[data-act="qrFromShot"]');
  await fr.waitForFunction(()=>/登録先：メイン/.test(document.getElementById('modeHint').textContent));
  assert.equal(await fr.locator('#modeShot').getAttribute('aria-pressed'),'true');
  await fr.click('#modeCam');assert.equal(await fr.locator('#camPane').isVisible(),true);
  await pop.close();
});

test('every device: メイン starts with スクショ, サブ1〜サブ5 with カメラ; switching works; camera photos are never forwarded', async()=>{
  await manager.evaluate(()=>{window.__got=[];window.addEventListener('message',e=>{if(e.data&&e.data.type==='msr-reading')window.__got.push(e.data)})});
  for(const dev of ['メイン','サブ1','サブ2','サブ3','サブ4','サブ5']){
    await manager.evaluate(()=>openQuickReg());await manager.selectOption('#qrDevice',dev);
    const {pop,fr}=await openReaderFrom('[data-act="qrFromShot"]');
    await fr.waitForFunction(d=>document.getElementById('modeHint').textContent.includes('登録先：'+d),dev);
    const want=dev==='メイン'?'modeShot':'modeCam', other=want==='modeShot'?'modeCam':'modeShot';
    assert.equal(await fr.locator('#'+want).getAttribute('aria-pressed'),'true',dev);
    await fr.click('#'+other);assert.equal(await fr.locator('#'+other).getAttribute('aria-pressed'),'true',dev+' switch');
    await fr.click('#'+want);
    if(dev==='サブ4'){ // カメラで撮影して送る：送られるのは読み取り結果だけ
      for(const n of [1,2]){await fr.setInputFiles('#cam'+n,{...png(),name:'IMG_'+n+'.jpg'});await fr.waitForFunction(n=>/撮影済み/.test(document.getElementById('slotState'+n).textContent),n)}
      await fr.click('#readBtn');await fr.waitForSelector('#result:not(.hidden)');
      const closing=pop.waitForEvent('close',{timeout:5000});await fr.click('#sendBtn');await closing;
      await manager.waitForSelector('#srEdit',{state:'visible'});
    } else await pop.close();
  }
  const got=await manager.evaluate(()=>window.__got);
  assert.equal(got.length,1);
  assert.deepEqual(Object.keys(got[0]).sort(),['nonce','reading','type']);
  assert.doesNotMatch(JSON.stringify(got[0]),/base64|iVBOR|\/9j\/|image\/|IMG_/,'no photo data reaches the manager');
  assert.deepEqual((await snapshot()).units,[],'nothing registered on receipt');
});
