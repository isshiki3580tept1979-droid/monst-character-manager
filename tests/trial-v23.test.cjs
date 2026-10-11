// Round 23: v22 STEP2 スクショの進化形態で、既存の「進化形態未確認」の個体を更新する。確認画面で「何もしない（既定）／既存個体の形態を更新／新規個体として追加」を選ぶ。
// 個体ID・実・メモ・二つ名・編成・確認状態は保つ。図鑑No.の不一致・確認済みの別形態・適正図鑑の形態とは結び付けない。読取アプリは変更しない。架空データだけ。Same harness as trial-v10.test.cjs.
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

test('ミライ: the confirm screen offers 何もしない (default) / 既存個体の形態を更新 / 新規個体として追加, warns about differences; pressing 登録する with the default changes nothing', async()=>{
  await seed(BASE);
  await preview(MIRAI);await toConfirm('メイン');
  const m=await modes();
  assert.deepEqual(m.map(x=>[x[0],x[1]]),[['none',true],['upd:uO1',false],['add',false]]);
  assert.match(m[0][2],/何もしない（既存データを変更しない）/);
  assert.match(m[1][2],/既存の個体1（形態未確認）の進化形態を「獣神化」に設定する（個体・わくわくの実・編成・確認状態はそのまま）/);
  assert.match(m[2][2],/別の個体として追加する/);
  const r=await result();
  assert.match(r,/実も同じ＝同じ個体の可能性が高い/);
  assert.match(r,/戦型：形態未確認の登録は「超バランス型」、スクショは「バランス型」/);
  assert.match(r,/適正図鑑の形態（架空ピースフル）と同じかどうかは確認しません/);
  await page.click('[data-act="srApply"]');
  assert.match(await page.locator('#srMsg').textContent(),/チェックを入れてから/);
  const d=await stored();
  for(const k of ['units','picks','idLinks']) same(d[k],BASE[k],k+' unchanged');
  same(d.master,BASE.master,'characters and forms unchanged');
  assert.deepEqual(d.suits.map(s=>[s.id,s.formId,s.grade,s.verificationStatus]),[['s1','fMs','S','VERIFIED']]);
});

test('updating the existing unit keeps its ID, device, number, fruits, memo, 二つ名, picks and 要確認; only formId changes to a new 獣神化 form with the screenshot values', async()=>{
  await seed(BASE);
  await preview(MIRAI);await toConfirm('メイン');
  await updOpt('uO1').check();await page.click('[data-act="srApply"]');
  assert.match(await page.locator('#srMsg').textContent(),/更新しました：.*架空ミライ・架空ピースフルAI 個体1 の進化形態を「獣神化」に設定/);
  const d=await stored();
  const u=d.units.find(x=>x.id==='uO1'), f=d.master.forms.find(x=>x.id===u.formId);
  same({...u,formId:'*'},{...BASE.units[0],formId:'*'},'everything but formId kept (要確認 not cleared even though the reading says needsReview:false)');
  assert.equal(u.verificationStatus,'NEEDS_REVIEW');
  assert.deepEqual([f.characterId,f.name,!!f.unknownForm,f.monsterNo,f.race,f.battleType,f.shotType,f.origin||''],['cO','獣神化',false,'99069','亜人','バランス型','貫通','']);
  assert.equal(d.units.length,BASE.units.length,'no unit added');
  same(d.picks,BASE.picks);
  assert.deepEqual(d.suits.map(s=>[s.id,s.formId,s.grade,s.verificationStatus]),[['s1','fMs','S','VERIFIED']]);
  same(d.idLinks,BASE.idLinks,'no form confirmation added');
  same(d.master.forms.find(x=>x.id==='fOu'),BASE.master.forms.find(x=>x.id==='fOu'),'the 形態未確認 entry is kept as it was (not deleted, not overwritten)');
  assert.equal(await page.evaluate(()=>formStatus('fMs','メイン')),'unconfirmed','GameWith form is not treated as the in-game form');
  await page.reload();
  await page.evaluate(()=>{db.ui.view='stage';render()});
  const opt=await page.evaluate(()=>[...document.querySelectorAll('.pickSel[data-pick-dev="メイン"] option')].find(o=>o.value==='uO1')?.textContent||'');
  assert.match(opt,/架空ミライ・架空ピースフルAI.*（形態未確認）/,'still selected, still a candidate, form vs suitability unconfirmed');
});

test('several 形態未確認 units: each is offered, none is chosen automatically; only the chosen one is updated', async()=>{
  await seed(BASE);
  await preview({...MIRAI,characterName:'架空二体',monsterNo:null,fruit1:null,fruit2:null,fruit3:null});await toConfirm('メイン');
  const m=await modes();
  assert.deepEqual(m.map(x=>[x[0],x[1]]),[['none',true],['upd:uT1',false],['upd:uT2',false],['add',false]]);
  assert.match(await result(),/形態未確認の個体が2体あります。どの個体か画像で確かめてから選んでください/);
  await updOpt('uT2').check();await page.click('[data-act="srApply"]');
  const d=await stored();
  assert.equal(d.units.find(x=>x.id==='uT1').formId,'fTu');
  const f=d.master.forms.find(x=>x.id===d.units.find(x=>x.id==='uT2').formId);
  assert.deepEqual([f.characterId,f.name,!!f.unknownForm],['cT','獣神化',false]);
});

test('図鑑No. mismatch or confirmed other form only: no update option (add / nothing only); a suitability-catalog form name stops the registration', async()=>{
  await seed(BASE);
  await preview({...MIRAI,characterName:'架空番号違い',monsterNo:'99002',fruit1:null,fruit2:null,fruit3:null});await toConfirm('メイン');
  assert.deepEqual((await modes()).map(x=>x[0]),['none','add']);
  assert.match(await result(),/個体1：図鑑No.が違う（形態未確認の登録 99001／スクショ 99002）ため、形態の更新候補にしません/);
  await preview({...MIRAI,characterName:'架空確認済み',formName:'架空獣神化',monsterNo:null,fruit1:null,fruit2:null,fruit3:null});await toConfirm('メイン');
  assert.deepEqual((await modes()).map(x=>x[0]),['none','add'],'a unit with a confirmed other form is never merged');
  // 適正図鑑の形態と同じ名前：更新も新規追加もせず、登録を止める（下の追加修正のテストで詳しく確認）
  await preview({...MIRAI,characterName:'架空ミライ',formName:'架空ピースフル',monsterNo:null,fruit1:null,fruit2:null,fruit3:null});await toConfirm('サブ1');
  assert.deepEqual((await modes()).map(x=>x[0]),[]);
  assert.match(await result(),/適正図鑑の形態と同じ名前/);
  same((await stored()).units,BASE.units);
});

test('the reading without 進化形態 offers no update; 新規個体として追加 still works as before', async()=>{
  await seed(BASE);
  await preview({...MIRAI,formName:null,battleType:'超バランス型'});await toConfirm('メイン');
  assert.deepEqual((await modes()).map(x=>x[0]),['none','add']);
  await page.check('#srDupOk');await page.click('[data-act="srApply"]');
  const d=await stored();
  assert.equal(d.units.length,BASE.units.length+1);
  same(d.units.find(x=>x.id==='uO1'),BASE.units[0]);
});

test('update is refused if the data changed after the confirm screen (old tab) and rolled back on a save failure', async()=>{
  await seed(BASE);
  await preview(MIRAI);await toConfirm('メイン');await updOpt('uO1').check();
  const other=await context.newPage();await other.goto(url);await other.click('[data-act="view"][data-view="chara"]');await other.close();
  const raw=await page.evaluate(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k),KEY);
  await page.click('[data-act="srApply"]');
  assert.doesNotMatch(await page.locator('#srMsg').textContent(),/更新しました/);
  assert.equal(await page.evaluate(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k),KEY),raw,'nothing written by the old tab');
  assert.equal(await page.evaluate(()=>db.units.find(u=>u.id==='uO1').formId),'fOu','memory rolled back');
  // 保存失敗
  await page.reload();
  await preview(MIRAI);await toConfirm('メイン');await updOpt('uO1').check();
  await page.evaluate(k=>{const s=Storage.prototype.setItem;Storage.prototype.setItem=function(a,b){if(a===k)throw new Error('QuotaExceededError');return s.call(this,a,b)}},KEY);
  await page.click('[data-act="srApply"]');
  assert.match(await page.locator('#srMsg').textContent(),/元に戻しました|戻しました/);
  assert.equal(await page.evaluate(()=>db.units.find(u=>u.id==='uO1').formId),'fOu');
  assert.equal(await page.evaluate(()=>db.master.forms.length),BASE.master.forms.length);
  same((await stored()).units,BASE.units);
});

test('backup → restore after an update keeps the unit, its new form and the old 形態未確認 entry; old data without the new fields loads', async()=>{
  await seed(BASE);
  await preview(MIRAI);await toConfirm('メイン');await updOpt('uO1').check();await page.click('[data-act="srApply"]');
  const snap=await page.evaluate(()=>{const d=JSON.parse(JSON.stringify(db));delete d.ui;return d});
  const bk=await page.evaluate(()=>backupJson());
  const fresh=await context.newPage();await fresh.goto(url);
  await fresh.evaluate(()=>{db.ui.view='admin';render();window.confirm=()=>true});
  await fresh.evaluate(v=>{const t=document.querySelector('#bkText');t.value=v;t.dispatchEvent(new Event('input',{bubbles:true}))},bk);
  await fresh.click('[data-act="restore"]');
  same(await fresh.evaluate(()=>{const d=JSON.parse(JSON.stringify(db));delete d.ui;return d}),snap);
  await fresh.close();
  const {idLinks,...old}=BASE;await seed(old);
  await preview(MIRAI);await toConfirm('メイン');
  assert.deepEqual((await modes()).map(x=>x[0]),['none','upd:uO1','add']);
});

test('390px: the three choices are readable and tappable without horizontal scrolling', async()=>{
  await seed(BASE);
  await preview(MIRAI);await toConfirm('メイン');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  for(const v of ['none','upd:uO1','add']){const b=await page.locator(`input[name="srDupMode"][value="${v}"]`).locator('xpath=ancestor::label[1]').boundingBox();
    assert.ok(b.x>=0&&b.x+b.width<=390&&b.height>=24,v+JSON.stringify(b))}
});

// ---- 追加修正：新規追加でも、適正図鑑の形態と名前が同じだけでは同じ形態にしない ----
const CAT_EXTRA={id:'cZ',name:'架空無形態',origin:'SUIT_CATALOG'}, CAT_EXTRA_FORM=F('fZu','cZ','',{unknownForm:true,origin:'SUIT_CATALOG'});
const BASE2={...BASE,master:{characters:[...BASE.master.characters,CAT_EXTRA],forms:[...BASE.master.forms,CAT_EXTRA_FORM]},
  suits:[...BASE.suits,{id:'s2',stageKey:K,formId:'fZu',source:'GAMEWITH',evaluationType:'GRADE',grade:'A',verificationStatus:'VERIFIED'}]};
const unchanged=async()=>{const d=await stored();
  same(d.units,BASE2.units,'units unchanged');same(d.master,BASE2.master,'characters and forms unchanged');same(d.picks,BASE2.picks,'picks unchanged');
  assert.deepEqual(d.suits.map(s=>[s.id,s.formId]),[['s1','fMs'],['s2','fZu']])};

test('新規追加: a 進化形態 with the same name as a suitability-catalog form is not joined to it — registration stops with the reason (with or without existing units)', async()=>{
  await seed(BASE2);
  for(const dev of ['サブ1','サブ2']){
    await preview({...MIRAI,characterName:'架空ミライ',formName:'架空ピースフル',monsterNo:null,fruit1:null,fruit2:null,fruit3:null});await toConfirm(dev);
    const r=await result();
    assert.match(r,/進化形態「架空ピースフル」は適正図鑑の形態と同じ名前です/,dev);
    assert.match(r,/進化形態の欄を空にすると「形態未確認」として登録できます/,dev);
    assert.equal(await page.locator('#srApply').isDisabled(),true,dev);
    assert.equal(await page.locator('input[name="srDupMode"]').count(),0,'no choice offered while blocked');
    assert.match(await page.locator('#srStatus').textContent(),/登録できません/);
  }
  await unchanged();
  // 形態名を空にすれば、適正図鑑とは別の「形態未確認」に登録できる（サブ2・既存の個体なし）
  await preview({...MIRAI,characterName:'架空ミライ',formName:null,monsterNo:null,race:null,battleType:null,shotType:null,fruit1:null,fruit2:null,fruit3:null});await toConfirm('サブ2');
  await page.click('[data-act="srApply"]');
  const d=await stored(), u=d.units.find(x=>!BASE2.units.some(b=>b.id===x.id));
  assert.equal(u.formId,'fMu','the owned 形態未確認 entry of the character, not the catalog form');
  assert.equal(d.suits.find(s=>s.id==='s1').formId,'fMs');
});

test('新規追加: a 進化形態 with a different name creates a separate owned form; the catalog form stays unconfirmed for that unit', async()=>{
  await seed(BASE2);
  await preview({...MIRAI,characterName:'架空ミライ',formName:'獣神化',monsterNo:null,fruit1:null,fruit2:null,fruit3:null});await toConfirm('サブ2');
  await page.click('[data-act="srApply"]');
  assert.match(await page.locator('#srMsg').textContent(),/登録しました/);
  const d=await stored(), u=d.units.find(x=>!BASE2.units.some(b=>b.id===x.id)), f=d.master.forms.find(x=>x.id===u.formId);
  assert.deepEqual([f.characterId,f.name,!!f.unknownForm,f.origin||''],['cM','獣神化',false,'']);
  same(d.master.forms.find(x=>x.id==='fMs'),BASE2.master.forms.find(x=>x.id==='fMs'),'catalog form untouched');
  assert.equal(await page.evaluate(()=>formStatus('fMs','サブ2')),'unconfirmed');
  assert.equal(d.idLinks.length,1,'no form confirmation recorded');
});

test('a catalog 形態未確認 entry is not used for an owned unit, and the 所持データ取り込み（JSON） path is protected the same way', async()=>{
  await seed(BASE2);
  await preview({...MIRAI,characterName:'架空無形態',formName:null,monsterNo:null,race:null,battleType:null,shotType:null,fruit1:null,fruit2:null,fruit3:null});await toConfirm('サブ2');
  assert.match(await result(),/適正図鑑の「形態未確認」/);
  assert.equal(await page.locator('#srApply').isDisabled(),true);
  const rows=await page.evaluate(()=>planInventory({schema:'monst-hakai-main-staging-v1',device:'サブ2',scope:'',ownershipChecks:[],
    units:[{characterName:'架空ミライ',formName:'架空ピースフル',verificationStatus:'VERIFIED',fruits:[]},{characterName:'架空ミライ',formName:'獣神化',verificationStatus:'VERIFIED',fruits:[]}]}).rows.map(r=>[r.cls,r.reasons.join('|')]));
  assert.equal(rows[0][0],'conflict');assert.match(rows[0][1],/適正図鑑の形態と同じ名前/);
  assert.notEqual(rows[1][0],'conflict');
  await unchanged();
});

test('after the fix: updating an existing 形態未確認 unit still keeps ID, fruits, picks and 要確認; reload and backup → restore keep it', async()=>{
  await seed(BASE2);
  await preview(MIRAI);await toConfirm('メイン');await updOpt('uO1').check();await page.click('[data-act="srApply"]');
  let d=await stored();const u=d.units.find(x=>x.id==='uO1');
  same({...u,formId:'*'},{...BASE2.units[0],formId:'*'});assert.equal(d.master.forms.find(f=>f.id===u.formId).name,'獣神化');same(d.picks,BASE2.picks);
  await page.reload();
  const bk=await page.evaluate(()=>backupJson());
  const fresh=await context.newPage();await fresh.goto(url);
  await fresh.evaluate(()=>{db.ui.view='admin';render();window.confirm=()=>true});
  await fresh.evaluate(v=>{const t=document.querySelector('#bkText');t.value=v;t.dispatchEvent(new Event('input',{bubbles:true}))},bk);
  await fresh.click('[data-act="restore"]');
  assert.equal(await fresh.evaluate(()=>db.units.find(x=>x.id==='uO1').formId),u.formId);
  await fresh.close();
});

test('390px: the blocked confirm screen with its reason fits the phone screen', async()=>{
  await seed(BASE2);
  await preview({...MIRAI,characterName:'架空ミライ',formName:'架空ピースフル',monsterNo:null,fruit1:null,fruit2:null,fruit3:null});await toConfirm('サブ1');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  const b=await page.locator('#srResult').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=390,JSON.stringify(b));
});
