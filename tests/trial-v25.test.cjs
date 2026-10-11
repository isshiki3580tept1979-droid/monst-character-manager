// Round 25: キャラ画面の個体ごとの適正表示を、ステージ画面の候補判定（unitFormMatch：同じ形態／形態未確認／別形態）と同じ基準にする。
// キャラ単位の対応付けと、進化形態の適正登録は区別して表示し、同じ形態かどうかは利用者が適正一覧で確認したときだけ確定する。架空データだけ。Same harness as trial-v10.test.cjs.
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
const K='破界の星墓::ラルガメンテ', K2='破界の星墓::ニギミタマ';
const F=(id,cid,name,x={})=>({id,characterId:cid,name,short:'',race:'',battleType:'',shotType:'',...x});
const U=(id,formId,device,no,x={})=>({id,formId,device,no,fruits:[],memo:'',...x});
const FRUITS=[{name:'熱き友撃の力',grade:'特級EL',kind:''},{name:'同族の絆・加命撃',grade:'特級L',kind:''},{name:'同族の絆・加撃',grade:'特級L',kind:''}];
// 適正図鑑：架空ミライ（架空ピースフル：ラルガメンテ S）。所持：架空ミライ・架空ピースフルAI（別名・形態未確認 No.99069・利用者がキャラとして対応付け済み・編成で選択中）
// 架空ネオ：ハロー（No.98001・ニギミタマ S の適正そのもの）とリバース（No.98002）の個体を所持 → 同じ形態／別形態の表示の基準
const BASE={characters:[],deviceNames:{'メイン':'架空メイン名','サブ1':'架空タブレット'},
  master:{characters:[{id:'cM',name:'架空ミライ',origin:'SUIT_CATALOG'},{id:'cO',name:'架空ミライ・架空ピースフルAI'},{id:'cN',name:'架空ネオ'}],
    forms:[F('fMs','cM','架空ピースフル',{origin:'SUIT_CATALOG'}),F('fOu','cO','',{unknownForm:true,monsterNo:'99069',race:'亜人',battleType:'超バランス型',shotType:'貫通'}),
      F('fN1','cN','架空ハロー',{monsterNo:'98001'}),F('fN2','cN','架空リバース',{monsterNo:'98002'})]},
  units:[U('uO1','fOu','メイン',1,{fruits:FRUITS,memo:'架空メモ',verificationStatus:'NEEDS_REVIEW',importSource:'monst-screenshot-reading-v1',epithet:'架空二つ名'}),U('uN1','fN1','メイン',1),U('uN2','fN2','メイン',2)],
  suits:[{id:'s1',stageKey:K,formId:'fMs',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'VERIFIED'},
    {id:'s2',stageKey:K2,formId:'fN1',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'VERIFIED'}],
  idLinks:[{id:'l1',kind:'char',a:'cM',b:'cO',basis:'USER_SELECTED',at:'2026-10-11T00:00:00.000Z'}],
  picks:{[K]:{'メイン':'uO1'}},useDevs:{[K]:['メイン','サブ1','サブ2','サブ3'],[K2]:['メイン','サブ1','サブ2','サブ3']},ui:{view:'stage',quest:'破界の星墓',stage:{'破界の星墓':'ラルガメンテ'}}};
const MIRAI={format:'monst-screenshot-reading-v1',characterName:'架空ミライ・架空ピースフルAI',formName:'獣神化',monsterNo:'99069',race:'亜人',battleType:'バランス型',shotType:'貫通',
  fruit1:'熱き友撃の力 特EL',fruit2:'同族の絆・加命撃 特L',fruit3:'同族の絆・加撃 特L',confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[]};
const same=(a,b,msg)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),msg);
const row=id=>page.locator(`#suitPanel .sRow:has([data-act="suitEdit"][data-id="${id}"])`);
const stage=async(name)=>{await page.evaluate(n=>{db.ui.view='stage';db.ui.stage['破界の星墓']=n;render()},name)};
const option=(dev,uid)=>page.evaluate(([d,u])=>[...document.querySelectorAll(`.pickSel[data-pick-dev="${d}"] option`)].find(o=>o.value===u)?.textContent||'',[dev,uid]);
const inGroup=(dev,uid)=>page.evaluate(([d,u])=>!![...document.querySelectorAll(`.pickSel[data-pick-dev="${d}"] optgroup option`)].find(o=>o.value===u),[dev,uid]);
const unitRow=async(cid,uid)=>{await page.click('[data-act="view"][data-view="chara"]');if(await page.locator('#charaFilter').isVisible())await page.click('#charaFilter [data-f="all"]');
  const b=page.locator(`[data-act="charaOpen"][data-id="${cid}"]`);if(await b.getAttribute('aria-expanded')!=='true')await b.click();return txt(page.locator(`.card.chara.open .row[data-unit="${uid}"]`))};
async function updateToForm(){await page.click('[data-act="view"][data-view="admin"]');await page.fill('#srText',JSON.stringify(MIRAI));await page.click('[data-act="srPreview"]');
  await page.selectOption('#srDevice','メイン');await page.click('[data-act="srCheck"]');await page.locator('input[name="srDupMode"][value="upd:uO1"]').check();await page.click('[data-act="srApply"]');
  assert.match(await page.locator('#srMsg').textContent(),/更新しました/)}
const keepUnits=async(extraForms=0)=>{const d=await stored();
  assert.equal(d.units.length,BASE.units.length,'unit count');
  for(const b of BASE.units){const u=d.units.find(x=>x.id===b.id);same({...u,formId:'*'},{...b,formId:'*'},b.id+' kept (ID, device, no, fruits, memo, 二つ名, status)')}
  same(d.picks,BASE.picks,'picks');assert.deepEqual(d.suits.map(s=>[s.id,s.formId,s.grade,s.verificationStatus]),BASE.suits.map(s=>[s.id,s.formId,s.grade,s.verificationStatus]),'suits');
  assert.equal(d.master.forms.length,BASE.master.forms.length+extraForms,'forms');return d};

test('キャラ単位で対応付け済み・形態未確認: the character screen says the unit is a stage candidate with its form unconfirmed (not 未登録), and the stage picker agrees', async()=>{
  await seed(BASE);
  assert.match(await option('メイン','uO1'),/架空ミライ・架空ピースフルAI 個体1（形態未確認）/);
  assert.equal(await inGroup('メイン','uO1'),false,'a normal candidate, not 仮選択');
  const r=await unitRow('cO','uO1');
  assert.match(r,/適正キャラのステージ 1件（形態未確認：ステージ画面の候補に出ます。同じ形態かどうかは適正一覧の「同じ形態／別の形態」で確認できます）/);
  assert.doesNotMatch(r,/未登録|参考として表示/);
  await keepUnits();
});

test('after updating the unit from 形態未確認 to 獣神化 (screenshot), it stays a candidate marked 形態未確認; nothing is treated as the same form automatically', async()=>{
  await seed(BASE);await updateToForm();
  const d=await keepUnits(1);
  assert.equal(d.master.forms.find(f=>f.id===d.units.find(u=>u.id==='uO1').formId).name,'獣神化');
  assert.deepEqual(d.idLinks.map(l=>l.kind),['char'],'no form link added');
  await stage('ラルガメンテ');
  assert.match(await option('メイン','uO1'),/架空ミライ・架空ピースフルAI｜獣神化 個体1（形態未確認）/);
  assert.equal(await page.evaluate(()=>formStatus('fMs','メイン')),'unconfirmed');
  assert.equal(await page.evaluate(()=>db.picks['破界の星墓::ラルガメンテ']['メイン']),'uO1');
  const r=await unitRow('cO','uO1');
  assert.match(r,/獣神化/);assert.match(r,/適正キャラのステージ 1件（形態未確認/);assert.doesNotMatch(r,/ステージ適正 未登録/);
});

test('same form vs other form: the exact form says 適正ステージ 1件（同じ形態）, the other (図鑑No. differs) says 別形態; a unit without any suitability keeps 未登録', async()=>{
  await seed({...BASE,units:[...BASE.units,U('uN3','fN2','サブ1',1)],suits:BASE.suits.filter(s=>s.id==='s2')});
  assert.match(await unitRow('cN','uN1'),/適正ステージ 1件（同じ形態）/);
  assert.match(await unitRow('cN','uN2'),/別形態の適正 1件（ステージ画面では「別形態」と表示）/);
  assert.match(await unitRow('cO','uO1'),/ステージ適正 未登録（ステージ画面の候補には出ません。仮選択はできます）/);
  await stage('ニギミタマ');
  assert.doesNotMatch(await option('メイン','uN1'),/（形態未確認）|（別形態）/);
  assert.match(await option('メイン','uN2'),/（別形態）/);
});

test('the user confirms 同じ形態 in the suitability list: only then the unit becomes 所持 ×1 and 適正ステージ 1件（同じ形態）; 別の形態 marks it 別形態; both can be undone; data untouched', async()=>{
  await seed(BASE);await updateToForm();
  await stage('ラルガメンテ');
  const r1=row('s1');
  assert.match(await txt(r1),/所持：メイン（所持・形態未確認）/);
  assert.match(await txt(r1),/架空ミライ・架空ピースフルAI｜獣神化： 同じ形態 別の形態/);
  await r1.locator('[data-act="linkForm"]').click();
  let d=await keepUnits(1);
  assert.deepEqual(d.idLinks.filter(l=>l.kind==='form').map(l=>l.basis),['USER_SELECTED']);
  assert.match(await txt(row('s1')),/所持：メイン×1/);
  assert.doesNotMatch(await option('メイン','uO1'),/（形態未確認）/);
  assert.match(await unitRow('cO','uO1'),/適正ステージ 1件（同じ形態）/);
  await stage('ラルガメンテ');await row('s1').locator('[data-act="unlinkForm"]').click();
  assert.match(await option('メイン','uO1'),/（形態未確認）/);
  await row('s1').locator('[data-act="distinctForm"]').click();
  d=await keepUnits(1);
  assert.deepEqual(d.idLinks.filter(l=>l.kind==='form').map(l=>l.basis),['USER_EXCLUDED']);
  assert.match(await option('メイン','uO1'),/（別形態）/);
  assert.match(await txt(row('s1')),/所持：メイン！/);
  assert.match(await unitRow('cO','uO1'),/別形態の適正 1件/);
});

test('reload and backup → restore keep the confirmed form link and the display', async()=>{
  await seed(BASE);await updateToForm();await stage('ラルガメンテ');await row('s1').locator('[data-act="linkForm"]').click();
  await page.reload();
  assert.match(await option('メイン','uO1'),/架空ミライ・架空ピースフルAI｜獣神化 個体1$/);
  assert.match(await unitRow('cO','uO1'),/適正ステージ 1件（同じ形態）/);
  const after=await page.evaluate(()=>{const d=JSON.parse(JSON.stringify(db));delete d.ui;return d});
  const bk=await page.evaluate(()=>backupJson());
  const fresh=await context.newPage();await fresh.goto(url);
  await fresh.evaluate(()=>{db.ui.view='admin';render();window.confirm=()=>true});
  await fresh.evaluate(v=>{const t=document.querySelector('#bkText');t.value=v;t.dispatchEvent(new Event('input',{bubbles:true}))},bk);
  await fresh.click('[data-act="restore"]');
  same(await fresh.evaluate(()=>{const d=JSON.parse(JSON.stringify(db));delete d.ui;return d}),after);
  await fresh.close();
});

test('an old tab cannot confirm the form after another tab saved: nothing written, links unchanged', async()=>{
  await seed(BASE);await updateToForm();await stage('ラルガメンテ');
  const other=await context.newPage();await other.goto(url);await other.click('[data-act="view"][data-view="chara"]');await other.close();
  const raw=await page.evaluate(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k),KEY);
  await row('s1').locator('[data-act="linkForm"]').click();
  assert.equal(await page.evaluate(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k),KEY),raw,'old tab did not write');
  assert.equal(await page.locator('#staleBar').isVisible(),true);
  assert.deepEqual(JSON.parse(raw).idLinks.map(l=>l.kind),['char']);
});

test('390px: the character card with the new unit line fits the phone screen', async()=>{
  await seed(BASE);await updateToForm();
  await unitRow('cO','uO1');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  const b=await page.locator('.card.chara.open').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=390,JSON.stringify(b));
});
