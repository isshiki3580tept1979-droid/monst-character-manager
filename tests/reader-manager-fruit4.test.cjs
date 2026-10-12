// v30 工程1：読取アプリ（モック）→ 管理アプリ の連携で、わくわくの実4枠が最後まで届くことを、本番と同じ構造・同じホスト名で再現して確かめる（通信は一切しない）。
// reader-manager-e2e.test.cjs と同じ構成。架空データだけを使う。
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
const {sendAndWaitClose}=require('./helpers/reader-send.cjs');
const KEY='monst-character-manager-trial-v2';
// 本物の sandboxFrame と同じ sandbox 属性（2026-10-09 に本番ページで確認）
const SANDBOX='allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-top-navigation-by-user-activation allow-storage-access-by-user-activation';
const FOUR=['速必殺の力 特級EL','兵命削りの力 特級EL','将命削りの力 特級EL','熱き友撃の力 特級EL'];
// 架空キャラ（リンネ No.8929・ネオ No.8570 の報告を参考にした4個の実）。キャラ名・図鑑No.は架空
const READING4={format:'monst-screenshot-reading-v1',characterName:'架空リンネ',formName:'架空の形態',monsterNo:'99301',race:'神',battleType:'バランス型',shotType:'貫通',
  fruit1:FOUR[0],fruit2:FOUR[1],fruit3:FOUR[2],fruit4:FOUR[3],confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[]};
const {fruit4:_x,...READING3}=READING4; // 古い形（fruit4 が無い）
let CUR=READING4;
// userHtmlFrame の中の google.script（読み取りは固定の架空結果を返す。getLocation は最上位の URL のパラメータを返す＝本物と同じ働き）
const mockFor=READING=>`<script>window.__calls=[];window.google={script:{
  run:(function(){function mk(s,f){return {withSuccessHandler:h=>mk(h,f),withFailureHandler:h=>mk(s,h),msrReadScreenshot:p=>{window.__calls.push(p.images.length);setTimeout(()=>s({ok:true,reading:${JSON.stringify(READING)},model:'mock'}),20)}}}return mk(()=>{},()=>{})})(),
  url:{getLocation:cb=>{const q=new URLSearchParams(decodeURIComponent(new URLSearchParams(parent.location.search).get('q')||''));const parameter={};q.forEach((v,k)=>parameter[k]=v);setTimeout(()=>cb({parameter}),10)}}}};</script>`;
let browser,context,manager,errors,external,coop,live=[];
before(async()=>{browser=await chromium.launch({headless:true})});
after(async()=>{await browser?.close()});
beforeEach(async()=>{
  // Android Chrome 相当（スマホの画面幅・タッチ・モバイル UA）
  context=await browser.newContext({...devices['Pixel 7'],viewport:{width:390,height:844}});external=[];errors=[];coop='';CUR=READING4;
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
      return r.fulfill({contentType:'text/html; charset=utf-8',body:fs.readFileSync(READER,'utf8').replace('<script>',mockFor(CUR)+'<script>')});
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

const fruitsOfUnit=async()=>(await snapshot()).units.map(u=>u.fruits.map(f=>f.name+' '+f.grade));
async function sendFrom(selector,sel='サブ2'){
  await manager.evaluate(()=>openQuickReg());await manager.selectOption('#qrDevice',sel);
  const {pop,fr}=await openReaderFrom(selector);
  await readTwo(fr);
  return {pop,fr};
}

test('4 fruits: reader screen shows all four → send → manager confirm screen shows all four (4th row open) → register → saved with 4 → still 4 after reload', async()=>{
  await seed({characters:[],master:{characters:[],forms:[]},units:[]});
  const {pop,fr}=await sendFrom('[data-act="qrFromShot"]');
  assert.equal(await fr.inputValue('#f_fruit4'),FOUR[3],'the reader shows the 4th fruit');
  assert.deepEqual(await fr.$$eval('#fields input',els=>els.map(e=>e.id).slice(-4)),['f_fruit1','f_fruit2','f_fruit3','f_fruit4']);
  await sendAndWaitClose({pop,fr,receiver:manager,origin:SANDBOX_HOST,tap:true});
  await manager.waitForSelector('#srEdit',{state:'visible'});
  const rows=[];for(const i of [1,2,3,4])rows.push([await manager.inputValue('#srFr'+i+'Name'),await manager.inputValue('#srFr'+i+'Grade')]);
  assert.deepEqual(rows,FOUR.map(s=>s.split(' ')));
  assert.equal(await manager.locator('#srFr4Field').isVisible(),true);
  assert.ok(await manager.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal scroll at 390px');
  assert.deepEqual((await snapshot()).units,[],'nothing registered on receipt');
  await manager.locator('[data-act="srCheck"]').tap();await manager.locator('[data-act="srApply"]').tap();
  assert.deepEqual(await fruitsOfUnit(),[FOUR]);
  await manager.reload();assert.deepEqual(await fruitsOfUnit(),[FOUR],'after reload');
  await manager.screenshot({path:path.join(__dirname,'artifacts','e2e-fruit4-confirm-390.png')});
});

test('an edit of the 4th fruit in the reader arrives; the payload keys include fruit4 and nothing else is added', async()=>{
  await manager.locator('[data-act="view"][data-view="admin"]').first().tap();
  await manager.evaluate(()=>{window.__got=[];window.addEventListener('message',e=>{if(e.data&&e.data.type==='msr-reading')window.__got.push(e.data)})});
  const {pop,fr}=await openReaderFrom('[data-act="srReader"]');await readTwo(fr);
  await fr.fill('#f_fruit4','熱き友撃の力 特級M');
  await sendAndWaitClose({pop,fr,receiver:manager,origin:SANDBOX_HOST});
  const got=await manager.evaluate(()=>window.__got);assert.equal(got.length,1);
  assert.deepEqual(Object.keys(got[0].reading).sort(),['battleType','characterName','confidence','fruit1','fruit2','fruit3','fruit4','formName','monsterNo','needsReview','race','reviewNotes','shotType','uncertainFields','format'].sort());
  assert.equal(got[0].reading.fruit4,'熱き友撃の力 特級M');
  assert.doesNotMatch(JSON.stringify(got[0]),/base64|iVBOR|AIza|model|mock/i);
  await manager.waitForSelector('#srEdit',{state:'visible'});
  assert.deepEqual([await manager.inputValue('#srFr4Name'),await manager.inputValue('#srFr4Grade')],['熱き友撃の力','特級M']);
});

test('old-shape reading (no fruit4): the reader sends fruit4 as null, the manager hides the 4th row, registers 3 fruits and does not flag review', async()=>{
  CUR=READING3;
  await seed({characters:[],master:{characters:[],forms:[]},units:[]});
  const {pop,fr}=await sendFrom('[data-act="qrFromShot"]');
  assert.equal(await fr.inputValue('#f_fruit4'),'');
  await sendAndWaitClose({pop,fr,receiver:manager,origin:SANDBOX_HOST,tap:true});
  await manager.waitForSelector('#srEdit',{state:'visible'});
  assert.equal(await manager.locator('#srFr4Field').isVisible(),false);assert.equal(await manager.locator('#srFr4Btn').isVisible(),true);
  assert.equal(await manager.locator('#srNeedsReview').isChecked(),false);assert.equal(await manager.locator('#srWarn').count(),0);
  await manager.locator('[data-act="srCheck"]').tap();await manager.locator('[data-act="srApply"]').tap();
  assert.deepEqual(await fruitsOfUnit(),[FOUR.slice(0,3)]);
});
