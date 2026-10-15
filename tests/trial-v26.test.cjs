// Round 26: 進化形態管理の廃止と簡素化。所持・適正・編成候補はキャラ名（対応付け・安全な自動照合）の単位で扱い、進化形態の一致判定・表示・選択を画面から撤去する。
// 形態のデータ（master.forms・idLinks kind=form）は互換のため保持し、所持個体は削除・統合しない。新方式の個体に貸出（units[].lentTo）を追加。架空データだけ。Same harness as trial-v10.test.cjs.
const {test,before,after,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const {teamView,openTeam,closeTeam,choose}=require('./helpers/team.cjs');
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
const K='破界の星墓::ラルガメンテ', K2='破界の星墓::ニギミタマ';
const F=(id,cid,name,x={})=>({id,characterId:cid,name,short:'',race:'',battleType:'',shotType:'',...x});
const U=(id,formId,device,no,x={})=>({id,formId,device,no,fruits:[],memo:'',...x});
const FRUITS=[{name:'熱き友撃の力',grade:'特級EL',kind:''},{name:'同族の絆・加命撃',grade:'特級L',kind:''},{name:'同族の絆・加撃',grade:'特級L',kind:''}];
// 旧データ（進化形態あり）を想定：
//  架空ミライ（図鑑・架空ピースフル：ラルガメンテ S）⇔ 架空ミライ・架空ピースフルAI（所持・形態「獣神化」と名前の無い形態の個体、利用者が対応付け済み）
//  架空ネオ：ハロー（No.98001・ラルガメンテ B）とリバース（No.98002）の個体を3体（メイン2・サブ1に1）
//  架空エクス（所持）と 架空エクスカリバー（図鑑・ラルガメンテ S）：名前の一部が一致するだけ＝別キャラ
const BASE={characters:[],deviceNames:{'メイン':'架空メイン名','サブ1':'架空タブレット'},
  master:{characters:[{id:'cM',name:'架空ミライ',origin:'SUIT_CATALOG'},{id:'cO',name:'架空ミライ・架空ピースフルAI'},{id:'cN',name:'架空ネオ'},{id:'cX',name:'架空エクス'},{id:'cXc',name:'架空エクスカリバー',origin:'SUIT_CATALOG'}],
    forms:[F('fMs','cM','架空ピースフル',{origin:'SUIT_CATALOG'}),F('fOu','cO','',{unknownForm:true,monsterNo:'99069'}),F('fOg','cO','獣神化',{monsterNo:'99069',race:'亜人',battleType:'バランス型',shotType:'貫通'}),
      F('fN1','cN','ハロー',{monsterNo:'98001',race:'亜人',battleType:'バランス型',shotType:'反射'}),F('fN2','cN','リバース',{monsterNo:'98002'}),F('fXu','cX','',{unknownForm:true}),F('fXc','cXc','獣神化',{origin:'SUIT_CATALOG'})]},
  units:[U('uO1','fOg','メイン',1,{fruits:FRUITS,memo:'架空メモ',verificationStatus:'NEEDS_REVIEW',importSource:'monst-screenshot-reading-v1',epithet:'架空二つ名'}),U('uO2','fOu','サブ1',1),
    U('uN1','fN1','メイン',1,{fruits:[FRUITS[0]]}),U('uN2','fN2','メイン',2),U('uN3','fN1','サブ1',1),U('uX','fXu','サブ2',1)],
  suits:[{id:'s1',stageKey:K,formId:'fMs',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'VERIFIED',note:'GameWith表記：架空ミライ（架空ピースフル）'},
    {id:'s2',stageKey:K,formId:'fN1',source:'GAMEWITH',evaluationType:'GRADE',grade:'B',verificationStatus:'VERIFIED'},
    {id:'s3',stageKey:K,formId:'fXc',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'VERIFIED'}],
  idLinks:[{id:'l1',kind:'char',a:'cM',b:'cO',basis:'USER_SELECTED',at:'2026-10-11T00:00:00.000Z'},{id:'l2',kind:'form',a:'fMs',b:'fOg',basis:'USER_SELECTED',at:'2026-10-11T00:00:00.000Z'}],
  picks:{[K]:{'メイン':'uO1','サブ1':'uN3'}},useDevs:{[K]:['メイン','サブ1','サブ2','サブ3'],[K2]:['メイン','サブ1','サブ2','サブ3']},ui:{view:'stage',quest:'破界の星墓',stage:{'破界の星墓':'ラルガメンテ'}}};
const same=(a,b,msg)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),msg);
const picks=dev=>teamView(page,dev);
const stage=async name=>{await page.evaluate(n=>{db.ui.view='stage';db.ui.stage['破界の星墓']=n;render()},name)};
const chara=async(filter='all')=>{await page.click('[data-act="view"][data-view="chara"]');if(await page.locator('#charaFilter').isVisible())await page.click(`#charaFilter [data-f="${filter}"]`)};
const openCard=async id=>{const b=page.locator(`[data-act="charaOpen"][data-id="${id}"]`);if(await b.getAttribute('aria-expanded')!=='true')await b.click();return txt(page.locator(`.card.chara.open:has([data-act="charaOpen"][data-id="${id}"])`))};
const head=id=>txt(page.locator(`[data-act="charaOpen"][data-id="${id}"]`));
const unitsKept=(d,ids=BASE.units.map(u=>u.id))=>{for(const id of ids){const a=d.units.find(u=>u.id===id),b=BASE.units.find(u=>u.id===id);same({...a,lentTo:'*'},{...b,lentTo:'*'},id+' kept')}};
const formsKept=d=>same(d.master.forms.map(f=>[f.id,f.characterId,f.name,f.monsterNo||'',!!f.unknownForm,f.origin||'']),BASE.master.forms.map(f=>[f.id,f.characterId,f.name,f.monsterNo||'',!!f.unknownForm,f.origin||'']),'old forms preserved');

test('ミライとミライ・ピースフルAI: linked by name, every unit of the character is a stage candidate with no form marks; partial-name characters are not merged', async()=>{
  await seed(BASE);
  assert.deepEqual(await page.evaluate(()=>[[...charGroupOf('cO')].sort(),[...charGroupOf('cX')].sort(),[...charGroupOf('cXc')].sort()]),[['cM','cO'],['cX'],['cXc']]);
  const m=await picks('メイン');
  assert.deepEqual(m.cand,['架空ネオ 個体1','架空ネオ 個体2','架空ミライ・架空ピースフルAI 個体1'],m.cand.join('|'));
  assert.equal(m.sel,'uO1');
  const s1=await picks('サブ1');
  assert.deepEqual(s1.cand,['架空ネオ 個体1','架空ミライ・架空ピースフルAI 個体1']);assert.equal(s1.sel,'uN3');
  const s2=await picks('サブ2');
  assert.deepEqual(s2.cand,[],'架空エクス is not a candidate for 架空エクスカリバー');
  assert.deepEqual(s2.groups,[['所持キャラ（適正未登録・仮選択）',['架空エクス 個体1（仮）']]]);
  const all=await txt(page.locator('#stageDevices'));
  assert.doesNotMatch(all,/形態未確認|別形態|形態不明/);
  const row=page.locator('#suitPanel .sRow:has([data-act="suitEdit"][data-id="s1"])');
  assert.match(await txt(row),/架空ミライランク S.*所持：メイン×1 サブ1×1/);assert.doesNotMatch(await txt(page.locator('#suitPanel')),/表記：|（架空ピースフル）|ハロー/,'no form labels on the stage screen (auto notes are hidden)');
  assert.equal((await stored()).suits.find(s=>s.id==='s1').note,'GameWith表記：架空ミライ（架空ピースフル）','the stored note is kept');
  assert.equal(await page.locator('#suitPanel [data-act="linkForm"], #suitPanel [data-act="distinctForm"]').count(),0,'no form confirmation buttons');
  assert.match(await txt(page.locator('#suitPanel .sRow:has([data-act="suitEdit"][data-id="s2"])')),/架空ネオランク B.*所持：メイン×2 サブ1×1/);
  const d=await stored();unitsKept(d);formsKept(d);same(d.picks,BASE.picks);
});

test('character screen: one card per character with units per device, fruits, suitability stages and lending; no form rows or buttons', async()=>{
  await seed(BASE);await chara();
  assert.match(await head('cO'),/所持2体・適正1（うち対応付け先1）/);assert.doesNotMatch(await head('cO'),/形態/);
  const card=await openCard('cO');
  assert.match(card,/基本情報亜人バランス型貫通/);
  assert.match(card,/架空メイン名（メイン）（1体） 個体1要確認在籍 二つ名：架空二つ名1熱き友撃の力 特級EL2同族の絆・加命撃 特級L3同族の絆・加撃 特級L架空メモ 適正ステージ 1件（ステージ画面の候補に出ます） 貸出 編集/);
  assert.match(card,/架空タブレット（サブ1）（1体） 個体1在籍/);
  assert.match(card,/星墓 ラルガメンテ・GameWith ランク S・架空ミライとして登録/);
  assert.doesNotMatch(card,/進化形態|形態指定なし|獣神化|表記：|（架空ピースフル）/);
  assert.equal(await page.locator('.card.chara.open [data-act="formEdit"], .card.chara.open [data-act="formAdd"]').count(),0);
  assert.equal(await page.locator('.card.chara.open [data-act="unitAdd"]').count(),1);
  assert.match(await head('cN'),/所持3体・適正1 /);
  const n=await openCard('cN');
  assert.match(n,/架空メイン名（メイン）（2体） 個体1在籍.*個体2在籍.*架空タブレット（サブ1）（1体） 個体1在籍/);
  assert.match(n,/星墓 ラルガメンテ・GameWith ランク B/);assert.doesNotMatch(n,/表記：|ハロー|リバース/);
  assert.match(await head('cX'),/所持1体・適正0/);
});

test('lending a unit: only lentTo is added; the unit moves to the borrowing device on the stage and device screens; return removes it; picks untouched', async()=>{
  await seed(BASE);await chara();await openCard('cO');
  await page.locator('.card.chara.open .row[data-unit="uO1"] [data-act="unitLend"]').click();
  await page.selectOption('#lendTo','サブ3');await page.click('[data-act="saveLend"]');
  let d=await stored();
  same(d.units.find(u=>u.id==='uO1'),{...BASE.units[0],lentTo:'サブ3'});unitsKept(d);same(d.picks,BASE.picks);
  assert.match(await openCard('cO'),/個体1要確認貸出中 → サブ3/);assert.match(await head('cO'),/所持2体（貸出中1）/);
  await stage('ラルガメンテ');
  const m=await picks('メイン');
  assert.ok(!m.cand.some(t=>/架空ミライ/.test(t)&&!/候補外/.test(t)),'lent unit is not a candidate on its home device');
  assert.ok(m.cand.some(t=>/架空ミライ・架空ピースフルAI 個体1（候補外）/.test(t))&&m.sel==='uO1','the saved pick stays (shown as 候補外)');
  assert.match(await txt(page.locator('.pickDev[data-dev="メイン"]')),/この個体は今サブ3にいます（貸出中）/);
  const s3=await picks('サブ3');
  assert.deepEqual(s3.cand,['架空ミライ・架空ピースフルAI 個体1（架空メイン名（メイン）から借用）']);
  await page.click('[data-act="view"][data-view="device"]');
  assert.match(await txt(page.locator('#deviceCards .card[data-dev="サブ3"]')),/架空ミライ・架空ピースフルAI 個体1 借用中・元 架空メイン名（メイン）/);
  assert.match(await txt(page.locator('#deviceCards .card[data-dev="メイン"]')),/この端末から貸出中.*架空ミライ・架空ピースフルAI 個体1 貸出中 → サブ3/);
  await page.reload();
  assert.equal((await stored()).units.find(u=>u.id==='uO1').lentTo,'サブ3','kept after reload');
  await page.click('[data-act="view"][data-view="device"]');
  await page.locator('#deviceCards .card[data-dev="サブ3"] [data-act="unitReturn"]').click();
  d=await stored();assert.equal('lentTo' in d.units.find(u=>u.id==='uO1'),false);unitsKept(d);same(d.picks,BASE.picks);
  await stage('ラルガメンテ');assert.equal((await picks('メイン')).cand.length,3);
});

test('registration without forms: quick registration and the unit dialog add units to the character\'s default form; no form fields are shown', async()=>{
  await seed(BASE);
  await page.evaluate(()=>openQuickReg());
  assert.equal(await page.locator('#qrForm').isVisible(),false);assert.equal(await page.locator('#qrFormNameMore').isVisible(),false);
  await page.selectOption('#qrChar','cN');
  assert.equal(await page.locator('#qrFormNew').isVisible(),false,'basic info already known');
  assert.match(await txt(page.locator('#qrFormInfo')),/亜人 バランス型 反射/);
  await page.selectOption('#qrDevice','サブ2');await page.uncheck('#qrSuitOn');await page.click('[data-act="qrSave"]');
  let d=await stored();
  const nu=d.units.find(u=>!BASE.units.some(b=>b.id===u.id)), nf=d.master.forms.find(f=>f.id===nu.formId);
  assert.deepEqual([nu.device,nu.no,nf.characterId,!!nf.unknownForm],['サブ2',1,'cN',true],'a nameless form is created once for a character that only has named forms');
  assert.equal(d.master.forms.length,BASE.master.forms.length+1);unitsKept(d);
  // 新しいキャラ：種族・戦型・撃種は入力できる
  await page.evaluate(()=>openQuickReg());
  await page.fill('#qrCharName','架空新人');assert.equal(await page.locator('#qrFormNew').isVisible(),true);
  await page.selectOption('#qrRace','亜人');await page.selectOption('#qrDevice','メイン');await page.uncheck('#qrSuitOn');await page.click('[data-act="qrSave"]');
  d=await stored();const c=d.master.characters.find(x=>x.name==='架空新人'), f=d.master.forms.find(x=>x.characterId===c.id);
  assert.deepEqual([f.race,!!f.unknownForm,d.units.filter(u=>u.formId===f.id).length],['亜人',true,1]);
  // キャラ画面の「＋ 所持個体」：既定の形態（名前の無い形態）に登録
  await chara();await openCard('cO');await page.click('.card.chara.open [data-act="unitAdd"]');
  assert.equal(await page.locator('#unForm').isVisible(),false);
  await page.selectOption('#unDevice','サブ3');await page.click('[data-act="saveUnit"]');
  d=await stored();const u3=d.units.find(u=>u.device==='サブ3');
  assert.equal(u3.formId,'fOu');assert.equal(u3.no,1);
  assert.equal(d.master.forms.length,BASE.master.forms.length+2);
});

test('screenshot registration ignores the read 進化形態: the unit goes to the default form, no new form is created; duplicates still need the explicit choice', async()=>{
  await seed(BASE);
  const R={format:'monst-screenshot-reading-v1',characterName:'架空ミライ・架空ピースフルAI',formName:'獣神化',monsterNo:'99069',race:'亜人',battleType:'バランス型',shotType:'貫通',fruit1:'熱き友撃の力 特EL',fruit2:null,fruit3:null,confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[]};
  await page.click('[data-act="view"][data-view="admin"]');await page.fill('#srText',JSON.stringify(R));await page.click('[data-act="srPreview"]');
  assert.equal(await page.locator('#srF_formName').count(),0,'no 進化形態 field');assert.equal(await page.locator('#srF_monsterNo').count(),1);
  await page.selectOption('#srDevice','サブ2');await page.click('[data-act="srCheck"]');
  assert.doesNotMatch(await txt(page.locator('#srResult')),/獣神化/);
  await page.click('[data-act="srApply"]');
  assert.match(await page.locator('#srMsg').textContent(),/登録しました/);
  let d=await stored();const nu=d.units.find(u=>!BASE.units.some(b=>b.id===u.id));
  assert.equal(nu.formId,'fOu','registered to the nameless form');assert.equal(nu.device,'サブ2');
  assert.equal(d.master.forms.length,BASE.master.forms.length,'no form added');unitsKept(d);
  // 同じ端末に個体がある：何もしない（既定）／別の個体として追加 だけ（形態の更新は無い）
  await page.fill('#srText',JSON.stringify({...R,fruit1:null}));await page.click('[data-act="srPreview"]');
  await page.selectOption('#srDevice','メイン');await page.click('[data-act="srCheck"]');
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('input[name="srDupMode"]')].map(x=>x.value)),['none','add']);
  await page.click('[data-act="srApply"]');
  assert.equal((await stored()).units.length,d.units.length,'nothing saved with 何もしない');
});

test('suitability JSON import attaches a new source form to the matched character without asking about forms; the owned units become candidates', async()=>{
  await seed(BASE);
  await page.click('[data-act="view"][data-view="admin"]');
  await page.fill('#imText',JSON.stringify({format:'monst-suitability-import-v1',stageKey:K2,source:'GAMEWITH',sourceUrl:'',sourceUpdatedAt:'2026-10-11',evaluationType:'GRADE',
    entries:[{characterName:'架空ミライ',formName:'獣神化改',grade:'A',verificationStatus:'VERIFIED',note:''},{characterName:'架空ネオ',formName:'',grade:'B',verificationStatus:'VERIFIED',note:''}]}));
  await page.check('#imCatalogOn');await page.click('[data-act="imPreview"]');
  const r=await txt(page.locator('#imResult'));
  assert.match(r,/追加 2件/);assert.doesNotMatch(r,/形態の選択/);
  assert.equal(await page.locator('#imChoices select').count(),0);
  await page.click('[data-act="imApply"]');
  const d=await stored();
  assert.equal(d.suits.length,BASE.suits.length+2);
  const sM=d.suits.find(s=>s.stageKey===K2&&d.master.forms.find(f=>f.id===s.formId).characterId==='cM');
  assert.equal(d.master.forms.find(f=>f.id===sM.formId).name,'獣神化改','recorded as a form of the catalog character');
  const sN=d.suits.find(s=>s.stageKey===K2&&d.master.forms.find(f=>f.id===s.formId).characterId==='cN');
  assert.equal(d.master.forms.find(f=>f.id===sN.formId).unknownForm,true,'no form name → the character\'s nameless form');
  unitsKept(d);
  await stage('ニギミタマ');
  const m=await picks('メイン');
  assert.deepEqual(m.cand,['架空ネオ 個体1','架空ネオ 個体2','架空ミライ・架空ピースフルAI 個体1']);
});

test('old data with forms and form links loads unchanged; reload and backup → restore keep everything (including lentTo); stage counts use characters', async()=>{
  await seed({...BASE,units:BASE.units.map(u=>u.id==='uN2'?{...u,lentTo:'サブ2'}:u)});
  let d=await stored();formsKept(d);same(d.idLinks,BASE.idLinks,'form links kept in data (ignored by the UI)');
  assert.equal(d.units.find(u=>u.id==='uN2').lentTo,'サブ2');
  const snap=await page.evaluate(()=>{const x=JSON.parse(JSON.stringify(db));delete x.ui;return x});
  await page.reload();
  same(await page.evaluate(()=>{const x=JSON.parse(JSON.stringify(db));delete x.ui;return x}),snap,'reload');
  const bk=await page.evaluate(()=>backupJson());
  const fresh=await context.newPage();await fresh.goto(url);
  await fresh.evaluate(()=>{db.ui.view='admin';render();window.confirm=()=>true});
  await fresh.evaluate(v=>{const t=document.querySelector('#bkText');t.value=v;t.dispatchEvent(new Event('input',{bubbles:true}))},bk);
  await fresh.click('[data-act="restore"]');
  same(await fresh.evaluate(()=>{const x=JSON.parse(JSON.stringify(db));delete x.ui;return x}),snap,'restore');
  await fresh.close();
  assert.match(await txt(page.locator('#stageChips .chip.active')),/適3/,'3 suitability characters on ラルガメンテ');
});

test('an old tab cannot lend after another tab saved; 390px: character, stage and device screens fit the phone width', async()=>{
  await seed(BASE);await chara();await openCard('cO');
  const other=await context.newPage();await other.goto(url);await other.click('[data-act="view"][data-view="stage"]');await other.close();
  const raw=await page.evaluate(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k),KEY);
  await page.locator('.card.chara.open .row[data-unit="uO1"] [data-act="unitLend"]').click();
  await page.selectOption('#lendTo','サブ3');await page.click('[data-act="saveLend"]');
  assert.equal(await page.evaluate(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k),KEY),raw,'old tab did not write');
  assert.equal(await page.locator('#staleBar').isVisible(),true);
  await page.reload();
  const fits=()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth);
  await chara();await openCard('cO');assert.ok(await fits(),'chara');
  await stage('ラルガメンテ');assert.ok(await fits(),'stage');
  await page.click('[data-act="view"][data-view="device"]');assert.ok(await fits(),'device');
});

test('旧方式TOP10: 別形態 is shown and counted as 所持; the stored status is kept unless the user changes it; no 別形態 button or mode', async()=>{
  const ST='禁忌の獄::一ノ獄';
  const raw={characters:[],rankings:{[ST]:{entries:[{rank:1,name:'架空旧キャラA'},{rank:2,name:'架空旧キャラB'},{rank:3,name:'架空旧キャラC'}]}},
    ownership:{[ST]:{'メイン':{ranks:{1:{status:'owned',count:1},2:{status:'alt-form',count:2,wakuwaku:[{name:'架空の実',grade:'特級L'}]},3:{status:'not-owned',count:null}}}}},
    ownershipChecks:[{id:'oc1',device:'メイン',characterName:'架空旧キャラB',requestedFormName:'獣神化',scope:'禁忌の獄',stage:'一ノ獄',stageKey:ST,status:'OWNED_OTHER_FORM',checkedAt:'',importedAt:'2026-10-01T00:00:00.000Z',source:'x'}],
    ui:{view:'stage',quest:'禁忌の獄',stage:{'禁忌の獄':'一ノ獄'},rankDevice:'メイン'}};
  await seed(raw);
  const top=await txt(page.locator('#top20'));
  assert.doesNotMatch(top,/別形態|！/);
  assert.match(top,/2 架空旧キャラB 所持 ×2/);
  assert.match(top,/2s*所持s*1s*未所持s*7s*未入力/);
  assert.deepEqual(await page.locator('#top20 .tMode').allTextContents(),['詳細','所持','未所持']);
  assert.equal(await page.locator('#rStatus [data-v="alt-form"]').count(),0);
  // 所持モードで塗っても、旧データの「別形態」は書き換えない（保存値・所持数・実をそのまま保持）
  await page.click('[data-act="rankMode"][data-mode="owned"]');await page.click('[data-act="rankTile"][data-rank="2"]');
  let d=await stored();same(d.ownership[ST]['メイン'].ranks[2],raw.ownership[ST]['メイン'].ranks[2]);
  // 詳細を開くと「所持」が選ばれた状態で、所持数も設定できる
  await page.click('[data-act="rankMode"][data-mode="detail"]');await page.click('[data-act="rankTile"][data-rank="2"]');
  assert.equal(await page.locator('#rStatus .segBtn.on').textContent(),'所持');
  assert.equal(await page.locator('#rCount [data-v="2"]').isDisabled(),false);
  await page.click('#rankModal [data-act="close"]');
  d=await stored();same(d.ownershipChecks.map(o=>o.status),['OWNED_OTHER_FORM'],'the stored check is kept');
});

test('data protection kept from the removed form suites: viewing writes nothing; the catalog form guard; the shown choice is re-checked; adding adds exactly one unit', async()=>{
  await seed(BASE);
  // 画面を見るだけでは保存データは変わらない（判定は表示のたびに行い、保存しない）
  const raw0=await page.evaluate(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k),KEY);
  await page.evaluate(()=>{for(const v of ['stage','chara','device','search','admin']){db.ui.view=v;render()}});
  assert.equal(await page.evaluate(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k),KEY),raw0);
  // 所持データ取り込み（JSON）：適正図鑑の形態名と同じ形態名の行は所持個体の登録先にしない
  const rows=await page.evaluate(()=>planInventory({schema:'monst-hakai-main-staging-v1',device:'サブ2',scope:'',ownershipChecks:[],
    units:[{characterName:'架空ミライ',formName:'架空ピースフル',verificationStatus:'VERIFIED',fruits:[]}]}).rows.map(r=>[r.cls,r.reasons.join('|')]));
  assert.equal(rows[0][0],'conflict');assert.match(rows[0][1],/適正図鑑の形態の表記です/);
  // スクショ登録：適正図鑑だけのキャラに登録すると、図鑑の形態ではなく所持用の名前の無い形態ができる（図鑑の形態・適正は変えない）
  const R={format:'monst-screenshot-reading-v1',characterName:'架空エクスカリバー',formName:'獣神化',monsterNo:null,race:null,battleType:null,shotType:null,fruit1:null,fruit2:null,fruit3:null,confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[]};
  await page.click('[data-act="view"][data-view="admin"]');await page.fill('#srText',JSON.stringify(R));await page.click('[data-act="srPreview"]');
  await page.selectOption('#srDevice','サブ3');await page.click('[data-act="srCheck"]');await page.click('[data-act="srApply"]');
  let d=await stored();const nu=d.units.find(u=>!BASE.units.some(b=>b.id===u.id)), nf=d.master.forms.find(f=>f.id===nu.formId);
  assert.deepEqual([nf.characterId,!!nf.unknownForm,nf.origin||''],['cXc',true,'']);
  same(d.master.forms.find(f=>f.id==='fXc'),BASE.master.forms.find(f=>f.id==='fXc'));assert.deepEqual(d.suits.map(s=>s.formId),BASE.suits.map(s=>s.formId));
  // 同じ端末に個体がある：画面に出ている登録方法と選択が食い違えば保存しない／「別の個体として追加」で1体だけ増える
  await page.fill('#srText',JSON.stringify({...R,characterName:'架空ネオ'}));await page.click('[data-act="srPreview"]');
  await page.selectOption('#srDevice','メイン');await page.click('[data-act="srCheck"]');
  await page.evaluate(()=>{document.querySelector('input[name="srDupMode"][value="add"]').checked=true});
  await page.click('[data-act="srApply"]');
  assert.match(await page.locator('#srMsg').textContent(),/確認画面の表示と選択が一致しません/);
  assert.equal((await stored()).units.length,d.units.length);
  await page.locator('input[name="srDupMode"][value="none"]').check();await page.locator('input[name="srDupMode"][value="add"]').check();await page.click('[data-act="srApply"]');
  const d2=await stored();assert.equal(d2.units.length,d.units.length+1);
  for(const u of d.units) same(d2.units.find(x=>x.id===u.id),u,'existing units untouched');
  same(d2.picks,BASE.picks);
});
