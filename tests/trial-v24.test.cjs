// Round 24: スクショ登録の確認画面。登録方法（何もしない／既存個体の形態を更新／別の個体として追加）を切り替えると、登録前の確認内容がその場で切り替わり、
// 「登録する」は画面に出ている登録方法どおりにだけ保存する。既存個体の更新では個体数・ID・実・編成・メモ・確認状態を保つ。架空データだけ。Same harness as trial-v10.test.cjs.
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
const K='破界の星墓::ラルガメンテ';
const F=(id,cid,name,x={})=>({id,characterId:cid,name,short:'',race:'',battleType:'',shotType:'',...x});
const U=(id,formId,device,no,x={})=>({id,formId,device,no,fruits:[],memo:'',...x});
const FRUITS=[{name:'熱き友撃の力',grade:'特級EL',kind:''},{name:'同族の絆・加命撃',grade:'特級L',kind:''},{name:'同族の絆・加撃',grade:'特級L',kind:''}];
// 所持：架空ミライ・架空ピースフルAI（形態未確認 No.99069・亜人/超バランス型/貫通、メイン個体1：実3つ・要確認・メモ、編成で選択中）。適正図鑑の架空ミライ（架空ピースフル）と対応付け済み
//       架空二体（形態未確認の個体がメインに2体）、架空番号違い（形態未確認 No.99001）、架空確認済み（確認済みの形態「架空進化」の個体だけ）、架空ミライ（図鑑キャラ）にも形態未確認の個体
const BASE={characters:[],deviceNames:{'メイン':'架空メイン名','サブ1':'架空タブレット'},
  master:{characters:[{id:'cM',name:'架空ミライ',origin:'SUIT_CATALOG'},{id:'cO',name:'架空ミライ・架空ピースフルAI'},{id:'cT',name:'架空二体'},{id:'cN',name:'架空番号違い'},{id:'cK',name:'架空確認済み'}],
    forms:[F('fMs','cM','架空ピースフル',{origin:'SUIT_CATALOG'}),F('fMu','cM','',{unknownForm:true}),
      F('fOu','cO','',{unknownForm:true,monsterNo:'99069',race:'亜人',battleType:'超バランス型',shotType:'貫通'}),
      F('fTu','cT','',{unknownForm:true}),F('fNu','cN','',{unknownForm:true,monsterNo:'99001'}),F('fK1','cK','架空進化',{monsterNo:'99500'})]},
  units:[U('uO1','fOu','メイン',1,{fruits:FRUITS,memo:'架空メモ',verificationStatus:'NEEDS_REVIEW',importSource:'monst-screenshot-reading-v1',epithet:'架空二つ名'}),
    U('uT1','fTu','メイン',1),U('uT2','fTu','メイン',2,{fruits:[FRUITS[0]]}),U('uN1','fNu','メイン',1),U('uK1','fK1','メイン',1,{verificationStatus:'VERIFIED'}),U('uM1','fMu','サブ1',1)],
  suits:[{id:'s1',stageKey:K,formId:'fMs',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'VERIFIED'}],
  idLinks:[{id:'l1',kind:'char',a:'cM',b:'cO',basis:'USER_SELECTED',at:'2026-10-11T00:00:00.000Z'}],
  picks:{[K]:{'メイン':'uO1'}},useDevs:{[K]:['メイン','サブ1','サブ2','サブ3']},ui:{view:'stage',quest:'破界の星墓',stage:{'破界の星墓':'ラルガメンテ'}}};
const MIRAI={format:'monst-screenshot-reading-v1',characterName:'架空ミライ・架空ピースフルAI',formName:'獣神化',monsterNo:'99069',race:'亜人',battleType:'バランス型',shotType:'貫通',
  fruit1:'熱き友撃の力 特EL',fruit2:'同族の絆・加命撃 特L',fruit3:'同族の絆・加撃 特L',confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[]};
async function preview(obj){await page.click('[data-act="view"][data-view="admin"]');await page.fill('#srText',JSON.stringify(obj));await page.click('[data-act="srPreview"]')}
async function toConfirm(device){await page.selectOption('#srDevice',device);await page.click('[data-act="srCheck"]')}
const result=()=>txt(page.locator('#srResult'));
const modes=()=>page.evaluate(()=>[...document.querySelectorAll('input[name="srDupMode"]')].map(x=>[x.value,x.checked,x.closest('label').textContent.replace(/\s+/g,' ').trim()]));
const updOpt=uid=>page.locator(`input[name="srDupMode"][value="upd:${uid}"]`);
const same=(a,b,msg)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),msg);

const plan=()=>txt(page.locator('#srPlan'));
const pick=async v=>{await page.locator(`input[name="srDupMode"][value="${v}"]`).check()};
const keep=async()=>{const d=await stored();same(d.units,BASE.units,'units unchanged');same(d.master,BASE.master,'characters and forms unchanged');same(d.picks,BASE.picks,'picks unchanged');return d};

test('choosing 既存個体の形態を更新 switches the confirm summary to the update of 個体1 (no new unit); nothing about adding 個体2 remains', async()=>{
  await seed(BASE);
  await preview(MIRAI);await toConfirm('メイン');
  await pick('upd:uO1');
  const t=await plan();
  assert.match(t,/登録方法：既存個体の進化形態を更新/);
  assert.match(t,/対象端末：架空メイン名（メイン）/);
  assert.match(t,/対象個体：個体1/);
  assert.match(t,/現在の進化形態：形態未確認/);
  assert.match(t,/更新後の進化形態：獣神化/);
  assert.match(t,/図鑑No\.99069/);
  assert.match(t,/新しい個体：追加しない/);
  assert.match(t,/個体ID・わくわくの実・編成・メモ・確認状態：維持する（確認状態：要確認のまま）/);
  const all=await result();
  assert.doesNotMatch(all,/個体2/,'no trace of the new-unit plan');
  assert.doesNotMatch(all,/新しい個体として追加）|個体2を登録|新しい個体を追加（/);
  assert.match(await page.locator('#srStatus').textContent(),/個体1の進化形態を「獣神化」に更新します/);
  await keep();
});

test('choosing 別の個体として追加 shows the 個体2 addition; 何もしない says nothing will be saved', async()=>{
  await seed(BASE);
  await preview(MIRAI);await toConfirm('メイン');
  let t=await plan();
  assert.match(t,/登録方法：何もしない/);assert.match(t,/「登録する」を押しても保存されません/);
  assert.doesNotMatch(t,/個体2/);
  await pick('add');t=await plan();
  assert.match(t,/登録方法：新しい個体として追加/);
  assert.match(t,/登録先：架空メイン名（メイン）・個体2（新しい個体として追加）/);
  assert.match(t,/既存キャラ「架空ミライ・架空ピースフルAI」に新しい個体を追加/);
  assert.match(t,/既存の個体は変更しません/);
  await pick('none');t=await plan();
  assert.match(t,/登録方法：何もしない/);
  await page.click('[data-act="srApply"]');
  await keep();
});

test('switching the choice many times keeps the summary and the saved result in step (ends on update → exactly the update is saved)', async()=>{
  await seed(BASE);
  await preview(MIRAI);await toConfirm('メイン');
  for(const v of ['add','upd:uO1','none','add','upd:uO1','add','upd:uO1']){
    await pick(v);const t=await plan();
    assert.match(t,v==='add'?/登録方法：新しい個体として追加/:v==='none'?/登録方法：何もしない/:/登録方法：既存個体の進化形態を更新/,v);
  }
  await page.click('[data-act="srApply"]');
  const d=await stored();
  assert.equal(d.units.length,BASE.units.length,'no unit added');
  const u=d.units.find(x=>x.id==='uO1');
  same({...u,formId:'*'},{...BASE.units[0],formId:'*'},'ID, fruits, memo, 二つ名, 要確認 kept');
  assert.equal(u.verificationStatus,'NEEDS_REVIEW');
  assert.equal(d.master.forms.find(f=>f.id===u.formId).name,'獣神化');
  same(d.picks,BASE.picks);
  assert.match(await page.locator('#srMsg').textContent(),/更新しました：.*個体1 の進化形態を「獣神化」に設定/);
});

test('only 別の個体として追加 increases the unit count (and leaves 個体1 untouched)', async()=>{
  await seed(BASE);
  await preview(MIRAI);await toConfirm('メイン');
  await pick('upd:uO1');await pick('add');
  await page.click('[data-act="srApply"]');
  const d=await stored();
  assert.equal(d.units.length,BASE.units.length+1);
  same(d.units.find(x=>x.id==='uO1'),BASE.units[0]);
  assert.deepEqual(d.units.filter(x=>!BASE.units.some(b=>b.id===x.id)).map(x=>[x.device,x.no]),[['メイン',2]]);
});

test('the save re-checks the shown choice: a choice that does not match the summary on screen is refused', async()=>{
  await seed(BASE);
  await preview(MIRAI);await toConfirm('メイン');
  await pick('upd:uO1');
  // 画面の表示と違う選択状態（イベントを通さずに切り替えた場合）では保存しない
  await page.evaluate(()=>{document.querySelector('input[name="srDupMode"][value="add"]').checked=true});
  await page.click('[data-act="srApply"]');
  assert.match(await page.locator('#srMsg').textContent(),/確認画面の表示と選択が一致しません/);
  await keep();
});

test('old tab and save failure: nothing is broken; reload and backup → restore after the update are consistent', async()=>{
  await seed(BASE);
  await preview(MIRAI);await toConfirm('メイン');await pick('upd:uO1');
  const other=await context.newPage();await other.goto(url);await other.click('[data-act="view"][data-view="chara"]');await other.close();
  const raw=await page.evaluate(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k),KEY);
  await page.click('[data-act="srApply"]');
  assert.doesNotMatch(await page.locator('#srMsg').textContent(),/更新しました/);
  assert.equal(await page.evaluate(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k),KEY),raw);
  await page.reload();
  await preview(MIRAI);await toConfirm('メイン');await pick('upd:uO1');
  await page.evaluate(k=>{const s=Storage.prototype.setItem;window.__restore=()=>{Storage.prototype.setItem=s};Storage.prototype.setItem=function(a,b){if(a===k)throw new Error('QuotaExceededError');return s.call(this,a,b)}},KEY);
  await page.click('[data-act="srApply"]');
  assert.match(await page.locator('#srMsg').textContent(),/戻しました/);
  assert.equal(await page.evaluate(()=>db.units.length),BASE.units.length);
  await keep();
  await page.evaluate(()=>window.__restore());
  await page.reload();
  await preview(MIRAI);await toConfirm('メイン');await pick('upd:uO1');await page.click('[data-act="srApply"]');
  const after=await page.evaluate(()=>{const d=JSON.parse(JSON.stringify(db));delete d.ui;return d});
  await page.reload();
  same(await page.evaluate(()=>{const d=JSON.parse(JSON.stringify(db));delete d.ui;return d}),after,'reload');
  const bk=await page.evaluate(()=>backupJson());
  const fresh=await context.newPage();await fresh.goto(url);
  await fresh.evaluate(()=>{db.ui.view='admin';render();window.confirm=()=>true});
  await fresh.evaluate(v=>{const t=document.querySelector('#bkText');t.value=v;t.dispatchEvent(new Event('input',{bubbles:true}))},bk);
  await fresh.click('[data-act="restore"]');
  same(await fresh.evaluate(()=>{const d=JSON.parse(JSON.stringify(db));delete d.ui;return d}),after,'restore');
  await fresh.close();
});

test('390px: the update summary is readable (no horizontal scroll, lines wrap inside the card)', async()=>{
  await seed(BASE);
  await preview(MIRAI);await toConfirm('メイン');await pick('upd:uO1');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  const b=await page.locator('#srPlan').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=390,JSON.stringify(b));
  assert.ok(await page.evaluate(()=>{const e=document.querySelector('#srPlan');return e.scrollWidth<=e.clientWidth}));
});
