// Round 27: ステージ編成画面の簡素化。端末カードは「端末名・選んだキャラ・わくわくの実・ボタン1つ」だけ。キャラは選ぶ画面（候補一覧）で選ぶ。
// 候補はキャラ名単位の適正判定（v26）。仮選択・借用中・この端末にいない個体は誤解のない印で示す。保存は従来どおり picks に個体IDだけ。架空データだけ。Same harness as trial-v10.test.cjs.
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
async function seed(raw){await page.evaluate(({key,raw})=>localStorage.setItem(key,JSON.stringify(raw)),{key:KEY,raw});await page.reload()}
const stored=()=>page.evaluate(key=>JSON.parse(Object.getPrototypeOf(localStorage).getItem.call(localStorage,key)||'null'),KEY);
const txt=async l=>(await l.textContent()).replace(/\s+/g,' ').trim();
const K='破界の星墓::ティル・ナ・ノーグ';
const F=(id,cid,name,x={})=>({id,characterId:cid,name,short:'',race:'',battleType:'',shotType:'',...x});
const U=(id,formId,device,no,x={})=>({id,formId,device,no,fruits:[],memo:'',...x});
const FR3=[{name:'熱き友撃の力',grade:'特級EL',kind:''},{name:'同族の絆・加命撃',grade:'特級L',kind:''},{name:'同族の絆・加撃',grade:'特級L',kind:''}];
const FR4=[...FR3,{name:'将命削りの力',grade:'特級M',kind:''}];
// 適正：架空ミライ（図鑑・S確認済み）⇔ 所持「架空ミライ・架空ピースフルAI」（対応付け済み・メイン個体1 要確認・実3）／架空ネオ（A・未検証、メインに2体：実4と実なし）
// 適正なし：架空アーサー（メイン・仮選択の対象）。架空借用キャラ（サブ1の個体をメインへ貸出中）。架空貸出キャラ（メインの個体をサブ2へ貸出中）
const BASE={characters:[],deviceNames:{'メイン':'架空マフティー','サブ1':'架空iPad'},
  master:{characters:[{id:'cM',name:'架空ミライ',origin:'SUIT_CATALOG'},{id:'cO',name:'架空ミライ・架空ピースフルAI'},{id:'cN',name:'架空ネオ'},{id:'cA',name:'架空アーサー'},{id:'cB',name:'架空借用キャラ'},{id:'cL',name:'架空貸出キャラ'}],
    forms:[F('fMs','cM','架空ピースフル',{origin:'SUIT_CATALOG'}),F('fO','cO','',{unknownForm:true,race:'亜人',battleType:'バランス型',shotType:'貫通'}),F('fN','cN','',{unknownForm:true,race:'亜人'}),
      F('fA','cA','',{unknownForm:true}),F('fB','cB','',{unknownForm:true}),F('fL','cL','',{unknownForm:true})]},
  units:[U('uO1','fO','メイン',1,{fruits:FR3,memo:'架空メモ',verificationStatus:'NEEDS_REVIEW',importSource:'monst-screenshot-reading-v1'}),U('uN1','fN','メイン',1,{fruits:FR4}),U('uN2','fN','メイン',2),
    U('uA1','fA','メイン',1),U('uB1','fB','サブ1',1,{lentTo:'メイン'}),U('uL1','fL','メイン',1,{lentTo:'サブ2'})],
  suits:[{id:'s1',stageKey:K,formId:'fMs',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'VERIFIED',note:'GameWith表記：架空ミライ（架空ピースフル）'},
    {id:'s2',stageKey:K,formId:'fN',source:'GAMEWITH',evaluationType:'GRADE',grade:'A',verificationStatus:'NEEDS_REVIEW'},
    {id:'s3',stageKey:K,formId:'fB',source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'},
    {id:'s4',stageKey:K,formId:'fL',source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'}],
  idLinks:[{id:'l1',kind:'char',a:'cM',b:'cO',basis:'USER_SELECTED',at:'2026-10-11T00:00:00.000Z'}],
  picks:{[K]:{'メイン':'uO1'}},useDevs:{[K]:['メイン','サブ1','サブ3','サブ2']},
  ui:{view:'stage',quest:'破界の星墓',stage:{'破界の星墓':'ティル・ナ・ノーグ'},infoMode:'all'}};
const same=(a,b,msg)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),msg);
const card=d=>page.locator(`.pickDev[data-dev="${d}"]`);
const open=async d=>{await card(d).locator('[data-act="openPicker"]').click();assert.equal(await page.locator('#pickModal').evaluate(m=>m.classList.contains('open')),true)};
const items=()=>page.evaluate(()=>[...document.querySelectorAll('#pkList .pkItem')].map(b=>b.getAttribute('aria-label')));
const sections=()=>page.evaluate(()=>[...document.querySelectorAll('#pkList .pkSec')].map(x=>x.dataset.group));
const choose=async(d,id)=>{await open(d);await page.locator(`#pkList .pkItem[data-id="${id}"]`).click()};
const keep=async()=>{const d=await stored();
  same(d.units,BASE.units,'units, IDs, fruits, lending kept');same(d.master,BASE.master,'characters and forms kept');
  const sv=x=>[x.id,x.formId,x.grade||'',x.verificationStatus,x.note||''];assert.deepEqual(d.suits.map(sv),BASE.suits.map(sv),'suitability kept');
  same(d.idLinks,BASE.idLinks,'links kept');same(d.deviceNames,BASE.deviceNames);return d};

test('stage screen shows only the team: device name, chosen character, 撃種｜戦型｜種族, all fruits and one button per device (no counts, no detail toggle)', async()=>{
  await seed(BASE);
  assert.match(await txt(page.locator('#view-stage')),/今回の編成/);
  const c1=await txt(card('メイン'));
  assert.match(c1,/①\s*架空マフティー（メイン）/);
  assert.match(c1,/架空ミライ・架空ピースフルAI/);
  assert.match(c1,/架空ミライ・架空ピースフルAI.*貫通.*バランス型.*亜人.*熱き友撃EL.*同族加命撃L.*同族加撃L/,'name → 撃種｜戦型｜種族 → fruits');
  assert.match(c1,/キャラを変更/);
  assert.doesNotMatch(c1,/候補\d|個体要確認|使う個体を選んでください|適正図鑑に同じキャラ|適正キャラの所持個体はありません/);
  // v35：未選択の端末は「端末名＋適正所持の印＋［＋ キャラを選ぶ］」と、候補（または理由）の1行
  assert.equal(await txt(card('サブ1')),'②架空iPad（サブ1）貸出中 1体＋ キャラを選ぶ 貸出中：架空借用キャラ→架空マフティー（メイン）');
  assert.equal(await txt(card('サブ3')),'③サブ3未確認＋ キャラを選ぶ 所持の記録なし 4キャラ');
  assert.equal(await txt(card('サブ2')),'④サブ2適正候補あり 1体借用1＋ キャラを選ぶ 候補：架空貸出キャラ選ぶ ›');
  assert.equal(await page.locator('#infoBar, [data-act="infoMode"], .pickSel').count(),0,'no detail toggle and no select box');
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#stageDevices .pickDev')].map(x=>x.dataset.dev)),['メイン','サブ1','サブ3','サブ2'],'only the chosen devices, in team order');
  await keep();
});

test('choosing: the list shows suitability characters first (name, unit number, fruits, borrowed / review marks), then other owned characters as 仮選択; choosing goes back to the team', async()=>{
  await seed(BASE);
  await open('メイン');
  assert.deepEqual(await sections(),['cand','own']);
  assert.deepEqual(await items(),['架空ネオ 個体1（未検証）','架空ネオ 個体2（未検証）','架空ミライ・架空ピースフルAI 個体1','架空借用キャラ 個体1（架空iPad（サブ1）から借用）','架空アーサー 個体1（仮）']);
  const neo=await txt(page.locator('#pkList .pkItem[data-id="uN1"]'));
  assert.match(neo,/架空ネオ\s*個体1\s*未登録｜未登録｜亜人\s*適正は未検証\s*熱き友撃EL\s*同族加命撃L\s*同族加撃L\s*将命削りM/,'all four fruits');
  assert.match(await txt(page.locator('#pkList .pkItem[data-id="uO1"]')),/選択中.*個体は要確認/);
  assert.match(await txt(page.locator('#pkList .pkItem[data-id="uB1"]')),/借用中・元 架空iPad（サブ1）/);
  assert.equal(await page.locator('#pkList .pkItem[data-id="uL1"]').count(),0,'a unit lent to another device is not offered here');
  await page.locator('#pkList .pkItem[data-id="uN2"]').click();
  assert.equal(await page.locator('#pickModal').evaluate(m=>m.classList.contains('open')),false);
  const c=await txt(card('メイン'));
  assert.match(c,/架空ネオs*個体2/,'unit number shown because two 架空ネオ are on this device');assert.match(c,/実なし/);
  const d=await keep();assert.deepEqual(d.picks,{[K]:{'メイン':'uN2'}});
  // 4つ目の実も省略しない
  await choose('メイン','uN1');assert.match(await txt(card('メイン')),/熱き友撃EL.*同族加命撃L.*同族加撃L.*将命削りM/);
});

test('仮選択 and borrowed units are marked on the card; choosing again never changes units or fruits; the choice can be removed', async()=>{
  // サブ1 の個体はメインへ貸出中：サブ1 には選べるキャラがいない
  await seed(BASE);
  await open('サブ1');assert.match(await txt(page.locator('#pkList')),/この端末にいるキャラがいません/);await page.click('#pickModal [data-act="close"]');
  await choose('メイン','uA1');
  assert.match(await txt(card('メイン')),/架空アーサー.*仮選択｜適正未登録/);
  await choose('メイン','uB1');
  assert.match(await txt(card('メイン')),/架空借用キャラ.*借用中・元 架空iPad（サブ1）/);
  await open('メイン');await page.click('[data-act="pickClear"]');
  assert.equal(await txt(card('メイン')),'①架空マフティー（メイン）適正候補あり 4体借用1貸出中1＋ キャラを選ぶ 候補：架空ネオ、架空ミライ・架空ピースフルAI、架空借用キャラ選ぶ ›','v35: the device keeps its suitability status after the pick is removed');
  const d=await keep();assert.deepEqual(d.picks,{});
});

test('a saved pick that is no longer on the device (lent away) is kept and shown with a clear note; nothing is changed automatically', async()=>{
  await seed({...BASE,picks:{[K]:{'メイン':'uL1'}}});
  const c=await txt(card('メイン'));
  assert.match(c,/架空貸出キャラ/);assert.match(c,/この個体は今サブ2にいます（貸出中）。選び直してください/);
  const d=await stored();assert.deepEqual(d.picks,{[K]:{'メイン':'uL1'}});
});

test('device toggle: adding / removing devices keeps picks; reload and backup → restore keep the team', async()=>{
  await seed(BASE);
  await page.click('[data-act="useDev"][data-dev="メイン"]');
  assert.equal(await card('メイン').count(),0);assert.deepEqual((await stored()).picks,BASE.picks,'pick kept while the device is out');
  await page.click('[data-act="useDev"][data-dev="メイン"]');
  assert.match(await txt(card('メイン')),/架空ミライ・架空ピースフルAI/);
  await page.reload();
  assert.match(await txt(card('メイン')),/架空ミライ・架空ピースフルAI/);
  const snap=await page.evaluate(()=>{const d=JSON.parse(JSON.stringify(db));delete d.ui;return d});
  const bk=await page.evaluate(()=>backupJson());
  const fresh=await context.newPage();await fresh.goto(url);
  await fresh.evaluate(()=>{db.ui.view='admin';render();window.confirm=()=>true});
  await fresh.evaluate(v=>{const t=document.querySelector('#bkText');t.value=v;t.dispatchEvent(new Event('input',{bubbles:true}))},bk);
  await fresh.click('[data-act="restore"]');
  same(await fresh.evaluate(()=>{const d=JSON.parse(JSON.stringify(db));delete d.ui;return d}),snap);
  await fresh.close();
  await keep();
});

test('an old tab cannot save a choice after another tab saved', async()=>{
  await seed(BASE);
  await open('メイン');
  const other=await context.newPage();await other.goto(url);await other.click('[data-act="view"][data-view="chara"]');await other.close();
  const raw=await page.evaluate(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k),KEY);
  // 警告バーが画面の上に出る（既存の動き）。見えている候補を押す
  await page.locator('#pkList .pkItem[data-id="uA1"]').click();
  assert.equal(await page.evaluate(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k),KEY),raw,'nothing written');
  assert.equal(await page.locator('#staleBar').isVisible(),true);
});

test('registration and suitability list still work from the stage screen; the registered unit can be chosen', async()=>{
  await seed(BASE);
  await page.evaluate(()=>openQuickReg());await page.fill('#qrCharName','架空新人');await page.selectOption('#qrDevice','サブ3');
  await page.selectOption('#qrSource','MANUAL');await page.click('[data-act="qrSave"]');
  const nu=(await stored()).units.find(u=>!BASE.units.some(b=>b.id===u.id));
  await open('サブ3');assert.deepEqual(await items(),['架空新人 個体1']);await page.locator(`#pkList .pkItem[data-id="${nu.id}"]`).click();
  assert.match(await txt(card('サブ3')),/架空新人/);
  assert.match(await txt(page.locator('#suitPanel')),/架空ミライランク S.*所持：メイン×1/);
});

test('390px: team cards and the choose list fit the phone width; buttons are large enough', async()=>{
  await seed(BASE);
  const fits=()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth);
  assert.ok(await fits());
  for(const d of ['メイン','サブ1']){const b=await card(d).locator('[data-act="openPicker"]').boundingBox();assert.ok(b.height>=44&&b.x>=0&&b.x+b.width<=390,d+JSON.stringify(b))}
  await open('メイン');assert.ok(await fits());
  const m=await page.evaluate(()=>{const e=document.querySelector('#pickModal .modal');return e.scrollWidth<=e.clientWidth});assert.ok(m,'modal');
  for(const b of await page.locator('#pkList .pkItem').all()){const r=await b.boundingBox();assert.ok(r.height>=48&&r.x+r.width<=390)}
});

test('a pick that belongs to another device (not lent) is not called 貸出中; an empty device shows a single message', async()=>{
  await seed({...BASE,picks:{[K]:{'サブ1':'uO1'}}});
  const c=await txt(card('サブ1'));
  assert.match(c,/この個体は今架空マフティー（メイン）にいます。選び直してください/);assert.doesNotMatch(await txt(card('サブ1').locator('.pickCur')),/貸出中/);
  await open('サブ3');
  assert.equal(await txt(page.locator('#pkList')),'この端末にいるキャラがいません。（この端末の適正キャラは所持の記録なし。該当なしとは限りません）キャラ画面の「＋ 所持個体」で登録できます。','v35: the reason is added; nothing else changes');
  await page.click('#pickModal [data-act="close"]');
  await keep();
});

test('「選択をやめる」 is a neutral button and only removes the pick; units, fruits, suitability and lending stay', async()=>{
  await seed(BASE);
  await open('メイン');
  const cls=await page.locator('#pkClear').getAttribute('class');
  assert.ok(!/btn-del/.test(cls),'not styled as a delete button: '+cls);
  await page.click('[data-act="pickClear"]');
  const d=await keep();assert.deepEqual(d.picks,{});
});

test('old tab: when the warning appears over the choose list, its 「最新のデータを読み込む」 button is visible and reloads safely without writing', async()=>{
  await seed(BASE);
  await open('メイン');
  const other=await context.newPage();await other.goto(url);await other.click('[data-act="view"][data-view="chara"]');await other.close();
  await page.waitForFunction(()=>!document.getElementById('staleBar').hidden);
  const raw=await page.evaluate(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k),KEY);
  const btn=page.locator('#staleBar [data-act="staleReload"]');
  assert.equal(await btn.isVisible(),true);
  const box=await btn.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=844&&box.x+box.width<=390,'reload button is on screen above the list');
  await Promise.all([page.waitForEvent('load'),btn.click()]);
  assert.equal(await page.evaluate(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k),KEY),raw,'reloading writes nothing');
  assert.equal(await page.locator('#staleBar').isVisible(),false);
  assert.match(await txt(card('メイン')),/架空ミライ・架空ピースフルAI/,'the team is shown from the latest data');
});
