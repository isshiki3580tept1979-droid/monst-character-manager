// Round 20: STEP4-2追加③ 進化形態の誤判定修正。形態名・IDが違うだけでは「別形態」と断定しない。
// 別形態と確認済みにするのは、図鑑No.が両方あって違うとき、または利用者が「別の形態」と確認したときだけ。それ以外は形態未確認（通常の編成候補）。
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
const txt=async l=>(await l.textContent()).replace(/\s+/g,' ').trim();
const K='破界の星墓::ラルガメンテ';
const F=(id,cid,name,x={})=>({id,characterId:cid,name,short:'',race:'',battleType:'',shotType:'',...x});
const U=(id,formId,device,no,x={})=>({id,formId,device,no,fruits:[],memo:'',...x});
// 五条悟のケース：同じキャラIDの中に、適正図鑑の形態「真獣神化」（出典の表記・図鑑No.なし）と、スクショ登録の形態「架空領域展開」（図鑑No.あり）がある
// ニケのケース：ビクトリアス（図鑑No.98658）とグロリアス（98659）＝図鑑No.が違う別形態（確認根拠あり）
// 架空ネオ：ハロー・リバース＝名前が違うだけ（図鑑No.なし）
const BASE={characters:[],deviceNames:{'メイン':'架空メイン名'},
  master:{characters:[{id:'cG',name:'架空五条',origin:'SUIT_CATALOG'},{id:'cK',name:'架空ニケ'},{id:'cN',name:'架空ネオ'},{id:'cO',name:'架空0.2秒 架空五条'}],
    forms:[F('fGs','cG','真獣神化',{origin:'SUIT_CATALOG'}),F('fGo','cG','架空領域展開',{monsterNo:'99310',race:'亜人',battleType:'超バランス型',shotType:'貫通'}),F('fGu','cG','',{unknownForm:true}),
      F('fK1','cK','ビクトリアス・フォーム',{monsterNo:'98658'}),F('fK2','cK','グロリアス・フォーム',{monsterNo:'98659'}),
      F('fN1','cN','架空ハローワールド',{short:'ハロー'}),F('fN2','cN','架空リバース',{short:'リバース'}),
      F('fOu','cO','',{unknownForm:true})]},
  units:[U('uG1','fGo','メイン',1,{epithet:'架空0.2秒',fruits:[{name:'兵命削りの力',grade:'特級EL'},{name:'将命削りの力',grade:'特級EL'},{name:'熱き友撃の力',grade:'特級EL'}]}),
    U('uG2','fGu','サブ1',1),U('uG3','fGo','サブ1',2),
    U('uK1','fK1','メイン',1),U('uK2','fK2','サブ2',1),
    U('uN1','fN1','メイン',1),U('uN2','fN2','サブ2',1),U('uO','fOu','サブ3',1)],
  suits:[{id:'s1',stageKey:K,formId:'fGs',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'NEEDS_REVIEW',note:'編成推奨：架空トラベラーズ2体以上'},
    {id:'s2',stageKey:K,formId:'fK1',source:'GAMEWITH',evaluationType:'GRADE',grade:'A',verificationStatus:'VERIFIED'},
    {id:'s3',stageKey:K,formId:'fN1',source:'GAMEWITH',evaluationType:'GRADE',grade:'A',verificationStatus:'VERIFIED'}],
  picks:{[K]:{'メイン':'uG1'}},useDevs:{[K]:['メイン','サブ1','サブ2','サブ3']},ui:{view:'stage',quest:'破界の星墓',stage:{'破界の星墓':'ラルガメンテ'}}};
const row=id=>page.locator(`#suitPanel .sRow:has([data-act="suitEdit"][data-id="${id}"])`);
const picks=dev=>page.evaluate(d=>{const s=document.querySelector(`.pickSel[data-pick-dev="${d}"]`);return {cand:[...s.querySelectorAll(':scope > option')].slice(1).map(o=>o.textContent),sel:s.value}},dev);
const st=(f,d)=>page.evaluate(([f,d])=>formStatus(f,d),[f,d]);
const keepData=async()=>{const d=await stored();
  assert.deepEqual(d.master.characters.map(c=>c.id+':'+c.name),BASE.master.characters.map(c=>c.id+':'+c.name));
  assert.deepEqual(d.master.forms.map(f=>[f.id,f.characterId,f.name,!!f.unknownForm,f.monsterNo||'']),BASE.master.forms.map(f=>[f.id,f.characterId,f.name,!!f.unknownForm,f.monsterNo||'']),'forms untouched');
  assert.deepEqual(d.units.map(u=>[u.id,u.formId,u.device,u.no,u.epithet||'']),BASE.units.map(u=>[u.id,u.formId,u.device,u.no,u.epithet||'']));
  assert.deepEqual(d.suits.map(s=>[s.id,s.formId,s.grade,s.verificationStatus,s.note||'']),BASE.suits.map(s=>[s.id,s.formId,s.grade,s.verificationStatus,s.note||'']));
  assert.deepEqual(d.picks,BASE.picks);
};

test('五条悟: a differently named form on the same character is 形態未確認, not 別形態; still a normal candidate; S / NEEDS_REVIEW / note / pick kept', async()=>{
  await seed(BASE);
  const t=await txt(row('s1'));
  assert.match(t,/所持：メイン（所持・形態未確認） サブ1（所持・形態未確認×2）/);
  assert.doesNotMatch(t,/メイン！|別形態/);
  assert.match(t,/ランク S/);assert.match(t,/要確認/);assert.match(t,/編成推奨：架空トラベラーズ2体以上/);
  assert.deepEqual(await page.evaluate(()=>[formStatus('fGs','メイン'),formStatus('fGs','サブ1'),unitFormMatch(db.units.find(u=>u.id==='uG1'),'破界の星墓::ラルガメンテ')]),['unconfirmed','unconfirmed','unknown']);
  const p=await picks('メイン');
  assert.ok(p.cand.includes('架空五条｜架空領域展開 個体1（形態未確認）（未検証）'),JSON.stringify(p.cand));
  assert.ok(!p.cand.some(x=>/架空五条.*別形態/.test(x)));
  assert.equal(p.sel,'uG1');
  const card=await txt(page.locator('.pickDev[data-dev="メイン"] .uCard'));
  assert.match(card,/形態未確認/);assert.match(card,/同じ形態かは未確認/);assert.doesNotMatch(card,/この個体は別の形態|別形態/);
  assert.match(card,/兵命削り.*将命削り.*熱き友撃/);
  assert.equal(await page.locator('#suitPanel [data-act="linkForm"], #suitPanel [data-act="distinctForm"]').count()>0,true,'confirmation stays optional');
  await keepData();
});

test('同じ形態と確認済み: exact form, or a form the user confirmed as the same (same character or linked character)', async()=>{
  await seed(BASE);
  assert.match(await txt(row('s2')),/所持：メイン×1/);
  assert.deepEqual(await page.evaluate(()=>[formStatus('fK1','メイン'),unitFormMatch(db.units.find(u=>u.id==='uK1'),'破界の星墓::ラルガメンテ')]),['owned','exact']);
  // 同じキャラの別名の形態を「同じ形態」と確認 → 所持×1・通常候補（印なし）
  await row('s1').locator('[data-act="linkForm"][data-b="fGo"]').click();
  const t=await txt(row('s1'));assert.match(t,/所持：メイン×1 サブ1×1 サブ3（所持・形態未確認）/,'サブ1: the linked form counts as 所持; its unknown-form unit no longer shows');assert.match(t,/同じ形態として確認済み：架空五条｜架空領域展開/);
  assert.ok((await picks('メイン')).cand.includes('架空五条｜架空領域展開 個体1（未検証）'));
  const d=await stored();assert.deepEqual(d.idLinks.map(l=>[l.kind,l.basis]),[['form','USER_SELECTED']]);assert.equal(d.suits[0].verificationStatus,'NEEDS_REVIEW');
  await row('s1').locator('[data-act="unlinkForm"][data-b="fGo"]').click();
  assert.match(await txt(row('s1')),/メイン（所持・形態未確認）/);
});

test('別形態と確認済み: only with evidence — different 図鑑No. (ニケ), or the user confirming 「別の形態」 (reversible)', async()=>{
  await seed(BASE);
  // ニケ：図鑑No.が違う → 別形態（！）、候補には（別形態）と明示
  assert.match(await txt(row('s2')),/所持：メイン×1 サブ2！/);
  assert.deepEqual((await picks('サブ2')).cand.filter(x=>/ニケ/.test(x)),['架空ニケ｜グロリアス・フォーム 個体1（別形態）']);
  assert.equal(await st('fK1','サブ2'),'alt-form');
  await page.locator('.pickSel[data-pick-dev="サブ2"]').selectOption('uK2');
  assert.match(await txt(page.locator('.pickDev[data-dev="サブ2"] .uCard')),/別形態.*図鑑No\.が違う/);
  // ネオ：名前が違うだけ（図鑑No.なし）→ 形態未確認
  assert.match(await txt(row('s3')),/所持：メイン×1 サブ2（所持・形態未確認）/);
  assert.equal(await st('fN1','サブ2'),'unconfirmed');
  assert.deepEqual((await picks('サブ2')).cand.filter(x=>/ネオ/.test(x)),['架空ネオ｜リバース 個体1（形態未確認）']);
  // 利用者が「別の形態」と確認 → 別形態（根拠：利用者の確認）。取り消すと形態未確認に戻る
  await row('s3').locator('[data-act="distinctForm"][data-b="fN2"]').click();
  let t=await txt(row('s3'));assert.match(t,/所持：メイン×1 サブ2！/);assert.match(t,/別形態と確認済み：架空ネオ｜リバース/);
  assert.deepEqual((await picks('サブ2')).cand.filter(x=>/ネオ/.test(x)),['架空ネオ｜リバース 個体1（別形態）']);
  await page.locator('.pickSel[data-pick-dev="サブ2"]').selectOption('uN2');
  assert.match(await txt(page.locator('.pickDev[data-dev="サブ2"] .uCard')),/別形態.*別の形態と確認済み/);
  assert.deepEqual((await stored()).idLinks.map(l=>[l.kind,[l.a,l.b].sort().join('-'),l.basis]),[['form','fN1-fN2','USER_EXCLUDED']]);
  await row('s3').locator('[data-act="undistinctForm"][data-b="fN2"]').click();
  assert.match(await txt(row('s3')),/サブ2（所持・形態未確認）/);assert.deepEqual((await stored()).idLinks,[]);
  assert.deepEqual((await stored()).picks[K],{'メイン':'uG1','サブ2':'uN2'},'picks kept');
  await page.evaluate(()=>{db.picks['破界の星墓::ラルガメンテ']={'メイン':'uG1'};persist()});await keepData();
});

test('unknown-form units, several forms of one character, 二つ名 cross-ID units, several devices: all 形態未確認 unless evidence', async()=>{
  await seed({...BASE,suits:[...BASE.suits,{id:'s4',stageKey:K,formId:'fGo',source:'ALTEMA',evaluationType:'GRADE',grade:'A',verificationStatus:'VERIFIED'}]});
  // 同じキャラに適正が2形態（真獣神化・架空領域展開）：領域展開の個体は s4 では同じ形態（所持）、s1 では形態未確認。未確認の個体はどちらでも形態未確認
  assert.match(await txt(row('s4')),/所持：メイン×1 サブ1×1 サブ3（所持・形態未確認）/);
  assert.match(await txt(row('s1')),/所持：メイン（所持・形態未確認） サブ1（所持・形態未確認×2）/);
  assert.deepEqual((await picks('メイン')).cand.filter(x=>/五条/.test(x)),['架空五条｜架空領域展開 個体1'],'exact for s4, so no mark');
  assert.deepEqual((await picks('サブ1')).cand.filter(x=>/五条/.test(x)).sort(),['架空五条 個体1（形態未確認）','架空五条｜架空領域展開 個体2'].sort());
  // 別IDの二つ名付きキャラ（自動照合）の個体は形態未確認、「！」にはならない
  assert.equal(await st('fGs','サブ3'),'unconfirmed');assert.match(await txt(row('s1')),/サブ3（所持・形態未確認）/);
  assert.deepEqual((await picks('サブ3')).cand,['架空0.2秒 架空五条 個体1（形態未確認）'],'verified because s4 is VERIFIED for this character');
});

test('reload and backup→restore keep the 別形態 confirmation; old data without it still loads', async()=>{
  await seed(BASE);await row('s3').locator('[data-act="distinctForm"][data-b="fN2"]').click();
  await page.reload();assert.match(await txt(row('s3')),/サブ2！/);
  const bk=await page.evaluate(()=>backupJson());
  await seed({characters:[]});await page.click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',bk);await page.click('[data-act="restore"]');
  await page.evaluate(()=>{db.ui.view='stage';db.ui.quest='破界の星墓';db.ui.stage={'破界の星墓':'ラルガメンテ'};render()});
  assert.match(await txt(row('s3')),/サブ2！/);
  await seed(BASE);assert.equal(await st('fN1','サブ2'),'unconfirmed');
});

test('390px: suitability rows with form confirmation buttons and the picker fit the phone screen', async()=>{
  await seed(BASE);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  await page.locator('#suitPanel').screenshot({path:path.join(__dirname,'artifacts','v20-form-judgement-390.png')});
});
