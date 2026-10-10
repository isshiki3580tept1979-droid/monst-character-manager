// Round 14: STEP3-1 新方式の個体を、端末画面・検索画面・ステージ画面にも表示する（表示だけ。保存データは変えない）。
// 架空データだけを使う。隔離ブラウザで実行し、外部へは通信しない。Same harness as trial-v10.test.cjs.
const {test,before,after,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const source=path.resolve(process.env.TRIAL_HTML_SOURCE||path.join(__dirname,'..','monst_character_manager_trial.html'));
const KEY='monst-character-manager-trial-v2';
const protectedKeys=['monst-character-manager-v2','monst-character-manager-v1','monst-character-manager-device-names-v1','monst-character-manager-trial-v1'];
let browser,server,url,context,page,errors,external;
before(async()=>{
  server=http.createServer((req,res)=>{if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(source));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
beforeEach(async()=>{
  context=await browser.newContext({viewport:{width:390,height:844}});external=[];
  await context.route('**/*',r=>{if(r.request().url().startsWith(url))return r.continue();external.push(r.request().url());return r.abort()});
  page=await context.newPage();errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|net::/.test(m.text()))errors.push(m.text())});
  await page.addInitScript(({keys})=>{
    const originalGet=Storage.prototype.getItem,originalSet=Storage.prototype.setItem,originalRemove=Storage.prototype.removeItem;
    for(const key of keys)if(originalGet.call(localStorage,key)===null)originalSet.call(localStorage,key,'protected sentinel '+key);
    window.storageAccess=[];
    for(const [method,original] of [['getItem',originalGet],['setItem',originalSet],['removeItem',originalRemove]]){
      Storage.prototype[method]=function(...args){if(this===localStorage)window.storageAccess.push([method,args[0]]);return original.apply(this,args)};
    }
  },{keys:protectedKeys});
  await page.goto(url);
  page.on('dialog',d=>d.accept());
});
afterEach(async()=>{
  assert.deepEqual(errors,[],'no console or JavaScript errors');
  assert.deepEqual(external.filter(u=>!/^data:|^blob:/.test(u)),[],'no request leaves the page (no Gemini / external API)');
  assert.ok(await page.evaluate(key=>window.storageAccess.every(([,k])=>k===key),KEY),'app reads/writes only trial-v2');
  const sentinels=await page.evaluate(keys=>keys.map(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k)),protectedKeys);
  assert.deepEqual(sentinels,protectedKeys.map(k=>'protected sentinel '+k));
  await context.close();
});
const click=async selector=>page.locator(selector).first().click();
const snapshot=()=>page.evaluate(()=>JSON.parse(JSON.stringify(db)));
const sets=()=>page.evaluate(()=>window.storageAccess.filter(([m])=>m==='setItem').length);
async function seed(raw){await page.evaluate(({key,raw})=>localStorage.setItem(key,JSON.stringify(raw)),{key:KEY,raw});await page.reload()}
const stored=()=>page.evaluate(key=>JSON.parse(Object.getPrototypeOf(localStorage).getItem.call(localStorage,key)||'null'),KEY);
const noUi=d=>{const x=JSON.parse(JSON.stringify(d));delete x.ui;return x};
const K1='禁忌の獄::一ノ獄', K2='破界の星墓::ラルガメンテ';
// 新方式：二つ名付き・進化形態未確認（メイン）、同じキャラ2体（サブ1）、形態未確認（サブ1）、新旧両方にあるキャラ（メイン）
// 旧登録：新方式と同名のキャラ（メイン）、貸出中のキャラ（メイン→サブ2）
const BASE={deviceNames:{'メイン':'架空メイン名','サブ1':'架空タブレット'},
  characters:[{id:'L1',name:'架空ルシ',device:'メイン',count:1,memo:'旧メモ',stages:[K1]},{id:'L2',name:'架空貸出キャラ',device:'メイン',lentTo:'サブ2',count:2,stages:[]}],
  master:{characters:[{id:'cI',name:'架空二つ名 架空虎杖'},{id:'cN',name:'架空ネオ'},{id:'cS',name:'架空スカアハα'},{id:'cL',name:'架空ルシ'},{id:'cZ',name:'架空所持なし'}],
    forms:[{id:'fI',characterId:'cI',name:'',unknownForm:true,short:'',race:'亜人',battleType:'超バランス型',shotType:'反射',monsterNo:'99308'},
      {id:'fN',characterId:'cN',name:'架空ハローワールド',short:'ハロー',race:'亜人',battleType:'バランス型',shotType:'反射'},
      {id:'fS',characterId:'cS',name:'',unknownForm:true,short:'',race:'神',battleType:'スピード型',shotType:'反射'},
      {id:'fL',characterId:'cL',name:'架空堕天',short:'',race:'',battleType:'',shotType:''}]},
  units:[{id:'uI',formId:'fI',device:'メイン',no:1,fruits:[{name:'撃種の絆・加速',grade:'特級L'},{name:'撃種の絆・加命撃',grade:'特級L'}],memo:''},
    {id:'uN1',formId:'fN',device:'サブ1',no:1,fruits:[{name:'同族の絆・加撃',grade:'特級L'},{name:'同族の絆・加撃速',grade:'特級L'},{name:'同族の絆・加命撃',grade:'特級L'}],memo:''},
    {id:'uN2',formId:'fN',device:'サブ1',no:2,fruits:[],memo:''},
    {id:'uS',formId:'fS',device:'サブ1',no:1,fruits:[{name:'撃種の絆・加撃',grade:'特級L'}],memo:''},
    {id:'uL',formId:'fL',device:'メイン',no:1,fruits:[],memo:''}],
  suits:[{id:'s1',stageKey:K1,formId:'fL',source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'}],
  picks:{[K2]:{'サブ1':'uN1','メイン':'uI'},'破界の星墓::パライソ':{'サブ1':'uN1'}},
  ui:{view:'stage',quest:'禁忌の獄',stage:{'禁忌の獄':'一ノ獄'}}};
const card=dev=>page.locator(`#deviceCards .card[data-dev="${dev}"]`);
const txt=async l=>(await l.textContent()).replace(/\s+/g,' ').trim();
async function search(q){await page.fill('#searchInput',q);}

test('device screen: new-method units are listed per device above the old registrations, with all details', async()=>{
  await seed(BASE);await page.click('[data-act="view"][data-view="device"]');
  assert.equal(await page.locator('#deviceCards .card').count(),6,'still one card per device');
  const main=card('メイン');
  // 新方式が上、旧登録が下
  const order=await main.evaluate(c=>[...c.querySelectorAll('.devNew,.devOld')].map(x=>x.className.includes('devNew')?'new':'old'));
  assert.deepEqual(order,['new','old']);
  // 見出しの件数は新旧別（合算しない）
  const head=await txt(main.locator('.devHead'));
  assert.match(head,/新方式2体/);assert.match(head,/旧登録1体/);assert.doesNotMatch(head,/3体/);
  const units=main.locator('.devNew .uCard');
  assert.equal(await units.count(),2);
  const tora=await txt(main.locator('.devNew .uCard[data-unit="uI"]'));
  assert.match(tora,/架空二つ名 架空虎杖/,'the stored name is shown as is');
  assert.match(tora,/進化形態未確認/);assert.match(tora,/個体1/);assert.match(tora,/亜人.*超バランス型.*反射/);
  assert.match(tora,/編成で使用 1件/);
  // わくわくの実は3枠（足りない枠は空き表示）
  assert.equal(await main.locator('.devNew .uCard[data-unit="uI"] .uL3 > span').count(),3);
  assert.equal(await main.locator('.devNew .uCard[data-unit="uI"] .frEmpty').count(),1);
  const ru=await txt(main.locator('.devNew .uCard[data-unit="uL"]'));
  assert.match(ru,/架空ルシ｜架空堕天/);assert.match(ru,/種族未設定/);assert.equal(await main.locator('.devNew .uCard[data-unit="uL"] .frEmpty').count(),3);
  // サブ1：同じキャラ2体と形態未確認
  const sub1=card('サブ1');
  assert.match(await txt(sub1.locator('.devHead')),/新方式3体/);
  assert.match(await txt(sub1.locator('.devNew .uCard[data-unit="uN1"]')),/架空ネオ｜ハロー 個体1.*編成で使用 2件/);
  assert.match(await txt(sub1.locator('.devNew .uCard[data-unit="uN2"]')),/架空ネオ｜ハロー 個体2/);
  assert.doesNotMatch(await txt(sub1.locator('.devNew .uCard[data-unit="uN2"]')),/編成で使用/);
  assert.match(await txt(sub1.locator('.devNew .uCard[data-unit="uS"]')),/架空スカアハα.*進化形態未確認/);
  // 旧登録：貸出中のキャラはサブ2で「借用中」、メインで「貸出中」
  assert.match(await txt(main.locator('.devOld')),/架空ルシ.*架空貸出キャラ|架空貸出キャラ.*架空ルシ/);
  assert.match(await txt(card('サブ2').locator('.devOld')),/借用中/);
  assert.match(await txt(card('サブ2').locator('.devNew')),/新方式の所持個体はありません/);
  // 個体からキャラ画面へ
  await sub1.locator('.devNew .uCard[data-unit="uS"] [data-act="goChara"]').click();
  assert.equal(await page.locator('#view-chara').isVisible(),true);assert.equal(await page.evaluate(()=>db.ui.charaOpen),'cS');
});

test('device screen: lend and return of old registrations work as before', async()=>{
  await seed(BASE);await page.click('[data-act="view"][data-view="device"]');
  await card('メイン').locator('.devOld [data-act="lend"][data-id="L1"]').click();
  await page.selectOption('#lendTo','サブ3');await page.click('[data-act="saveLend"]');
  assert.equal((await stored()).characters.find(c=>c.id==='L1').lentTo,'サブ3');
  assert.match(await txt(card('サブ3').locator('.devOld')),/架空ルシ.*借用中/);
  await card('サブ3').locator('.devOld [data-act="return"][data-id="L1"]').click();
  assert.equal((await stored()).characters.find(c=>c.id==='L1').lentTo,null);
  assert.deepEqual((await stored()).units.map(u=>u.id),BASE.units.map(u=>u.id),'new-method units untouched');
});

test('search: both new and old are searched, full/half width absorbed, kept separate with per-device counts', async()=>{
  await seed(BASE);await page.click('[data-act="view"][data-view="search"]');
  const neu=()=>page.locator('#searchResults .sNew .card'), old=()=>page.locator('#searchResults .sOld .card');
  await search('虎杖');
  assert.equal(await neu().count(),1);assert.equal(await old().count(),0);
  assert.match(await txt(neu().first()),/架空二つ名 架空虎杖.*新方式.*架空メイン名（メイン）×1/);
  await search('ｽｶ'); // 半角カタカナ
  assert.equal(await neu().count(),1);assert.match(await txt(neu().first()),/架空スカアハα/);
  await search('Α'); // 大文字のアルファ
  assert.equal(await neu().count(),1);
  await search('ネオ');
  assert.match(await txt(neu().first()),/架空タブレット（サブ1）×2/);assert.match(await txt(neu().first()),/計2体/);
  await search('ハロー'); // 形態名でも見つかる
  assert.equal(await neu().count(),1);
  await search('ルシ'); // 新旧両方にあるキャラは別々に出す（合算しない）
  assert.equal(await neu().count(),1);assert.equal(await old().count(),1);
  assert.match(await txt(page.locator('#searchResults .sNew')),/新方式/);assert.match(await txt(page.locator('#searchResults .sOld')),/旧登録/);
  assert.match(await txt(neu().first()),/×1/);assert.match(await txt(old().first()),/所持数 1/);
  assert.match(await page.locator('#searchCount').textContent(),/新方式 1キャラ（1体）・旧登録 1件/);
  await search('所持なし');assert.match(await txt(neu().first()),/所持個体なし/);
  await search('ＸＹＺ存在しない');assert.match(await txt(page.locator('#searchResults')),/該当するキャラがいません/);
  // 保存されている名前は変わらない
  assert.deepEqual((await stored()).master.characters.map(c=>c.name),BASE.master.characters.map(c=>c.name));
  // 新方式の結果からキャラ画面へ
  await search('ネオ');await neu().first().locator('[data-act="goChara"]').click();
  assert.equal(await page.locator('#view-chara').isVisible(),true);assert.equal(await page.evaluate(()=>db.ui.charaOpen),'cN');
  assert.match(await page.locator('#charaList .card.open').textContent(),/架空ネオ/);
});

test('search: old registrations keep their operations (edit / lend / return) and memo search', async()=>{
  await seed(BASE);await page.click('[data-act="view"][data-view="search"]');
  await search('旧メモ');
  assert.equal(await page.locator('#searchResults .sOld .card').count(),1);assert.equal(await page.locator('#searchResults .sNew .card').count(),0);
  await page.click('#searchResults .sOld [data-act="lend"]');await page.selectOption('#lendTo','サブ1');await page.click('[data-act="saveLend"]');
  assert.equal((await stored()).characters.find(c=>c.id==='L1').lentTo,'サブ1');
  await page.click('#searchResults .sOld [data-act="return"]');assert.equal((await stored()).characters.find(c=>c.id==='L1').lentTo,null);
  await page.click('#searchResults .sOld [data-act="edit"]');assert.equal(await page.locator('#charModal.open').count(),1);
});

test('stage chips: new-method suitability and old registrations are counted separately (never added up)', async()=>{
  await seed(BASE);
  const chip=page.locator('#stageChips .chip[data-stage="一ノ獄"]');
  assert.equal(await chip.locator('.nS').textContent(),'適1');assert.equal(await chip.locator('.nL').textContent(),'旧1');
  assert.doesNotMatch(await chip.textContent(),/2/);
  assert.match(await page.locator('#chipLegend').textContent(),/適＝新方式で適正を登録した進化形態の数.*旧＝旧登録のキャラ数/);
  assert.equal(await page.locator('#stageChips .chip[data-stage="二ノ獄"] .n').count(),0,'no badge when nothing is registered');
});

test('viewing and searching never change the saved data', async()=>{
  await seed(BASE);await page.click('[data-act="view"][data-view="stage"]'); // 最初の保存で形式が整うので、その後を基準にする
  const before=noUi(await stored());
  for(const v of ['device','search','chara','stage','device']) await page.click(`[data-act="view"][data-view="${v}"]`);
  await page.click('[data-act="view"][data-view="search"]');for(const q of ['虎','ｽｶ','ルシ','']) await search(q);
  assert.deepEqual(noUi(await stored()),before);
});

test('390px: device and search screens have no horizontal scroll', async()=>{
  await seed(BASE);
  for(const v of ['device','search']){
    await page.click(`[data-act="view"][data-view="${v}"]`);if(v==='search') await search('ル');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),v);
  }
  await page.click('[data-act="view"][data-view="device"]');
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  await card('サブ1').screenshot({path:path.join(__dirname,'artifacts','v14-device-390.png')});
});

test('about 200 units: device and search screens render quickly and count correctly', async()=>{
  const chars=[], forms=[], units=[];
  for(let i=0;i<40;i++){chars.push({id:'c'+i,name:'架空大量キャラ'+i});forms.push({id:'f'+i,characterId:'c'+i,name:'',unknownForm:true,short:'',race:'',battleType:'',shotType:''})}
  for(let i=0;i<200;i++) units.push({id:'u'+i,formId:'f'+(i%40),device:['メイン','サブ1','サブ2','サブ3','サブ4','サブ5'][i%6],no:Math.floor(i/40)+1,fruits:[],memo:''});
  await seed({characters:[],master:{characters:chars,forms},units});
  const t0=Date.now();await page.click('[data-act="view"][data-view="device"]');const t1=Date.now();
  assert.equal(await page.locator('#deviceCards .devNew .uCard').count(),200);
  assert.match(await txt(card('メイン').locator('.devHead')),/新方式34体/);
  await page.click('[data-act="view"][data-view="search"]');const t2=Date.now();await search('大量');const t3=Date.now();
  assert.equal(await page.locator('#searchResults .sNew .card').count(),40);
  assert.ok(t1-t0<2000&&t3-t2<2000,`fast enough: device ${t1-t0}ms, search ${t3-t2}ms`);
});
