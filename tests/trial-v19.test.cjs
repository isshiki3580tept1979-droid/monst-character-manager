// Round 19: STEP4-2追加② キャラ名優先の自動照合。正規化した名前の一致／二つ名を除いた名前の一致／個体の二つ名で、適正キャラと所持キャラを自動で結び付ける。
// 名前の一部一致・似た名前・α改などの接尾辞違いは自動にしない。進化形態が未確認・別形態でも編成候補にし、形態の一致状況は別に表示する。
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
// 適正図鑑：架空五条（真獣神化・要確認）、架空真キャラ（獣神化）、架空ネオ（ハロー）、架空甚爾（獣神化）
// 所持：「架空0.2秒 架空五条」（別ID・形態未確認・メイン1／サブ1 2）、「架空 真キャラ」（別ID・確認済み形態）、ネオ（同ID・ハローと別形態リバース）、
//       「架空最強架空甚爾」（空白なし・個体の二つ名「架空最強」）、「架空五条β」「架空ネオα」「架空ラム＆架空レム」（別キャラ）
const BASE={characters:[],deviceNames:{'メイン':'架空メイン名','サブ1':'架空タブレット'},
  master:{characters:[{id:'cG',name:'架空五条',origin:'SUIT_CATALOG'},{id:'cQ',name:'架空真キャラ',origin:'SUIT_CATALOG'},{id:'cN',name:'架空ネオ'},{id:'cJ',name:'架空甚爾',origin:'SUIT_CATALOG'},{id:'cL',name:'架空レム',origin:'SUIT_CATALOG'},
      {id:'cO',name:'架空0.2秒 架空五条'},{id:'cR',name:'架空 真キャラ'},{id:'cT',name:'架空最強架空甚爾'},{id:'cX',name:'架空五条β'},{id:'cA',name:'架空ネオα'},{id:'cM',name:'架空ラム＆架空レム'}],
    forms:[F('fGs','cG','真獣神化',{origin:'SUIT_CATALOG'}),F('fQs','cQ','獣神化',{origin:'SUIT_CATALOG'}),F('fN1','cN','架空ハローワールド',{short:'ハロー',monsterNo:'98001'}),F('fN2','cN','架空リバース',{short:'リバース',monsterNo:'98002'}),
      F('fJs','cJ','獣神化',{origin:'SUIT_CATALOG'}),F('fLs','cL','獣神化',{origin:'SUIT_CATALOG'}),
      F('fOu','cO','',{unknownForm:true,monsterNo:'99310',race:'亜人',battleType:'超バランス型',shotType:'貫通'}),F('fR1','cR','架空の獣神化'),
      F('fTu','cT','',{unknownForm:true}),F('fXu','cX','',{unknownForm:true}),F('fAu','cA','',{unknownForm:true}),F('fMu','cM','',{unknownForm:true})]},
  units:[U('uO1','fOu','メイン',1,{epithet:'架空0.2秒',fruits:[{name:'兵命削りの力',grade:'特級EL'},{name:'将命削りの力',grade:'特級EL'},{name:'熱き友撃の力',grade:'特級EL'}]}),U('uO2','fOu','サブ1',1),U('uO3','fOu','サブ1',2),
    U('uR1','fR1','メイン',1,{verificationStatus:'VERIFIED',importSource:'monst-screenshot-reading-v1'}),
    U('uN1','fN1','メイン',1),U('uN2','fN2','メイン',2),U('uN3','fN2','サブ2',1),
    U('uT','fTu','サブ3',1,{epithet:'架空最強'}),U('uX','fXu','サブ3',2),U('uA','fAu','サブ3',3),U('uM','fMu','サブ3',4)],
  suits:[{id:'s1',stageKey:K,formId:'fGs',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'NEEDS_REVIEW',note:'編成推奨：架空トラベラーズ2体以上'},
    {id:'s2',stageKey:K,formId:'fQs',source:'GAMEWITH',evaluationType:'GRADE',grade:'A',verificationStatus:'VERIFIED'},
    {id:'s3',stageKey:K,formId:'fN1',source:'GAMEWITH',evaluationType:'GRADE',grade:'A',verificationStatus:'VERIFIED'},
    {id:'s4',stageKey:K,formId:'fJs',source:'GAMEWITH',evaluationType:'GRADE',grade:'B',verificationStatus:'VERIFIED'},
    {id:'s5',stageKey:K,formId:'fLs',source:'GAMEWITH',evaluationType:'GRADE',grade:'B',verificationStatus:'VERIFIED'}],
  picks:{[K]:{'メイン':'uO1'}},useDevs:{[K]:['メイン','サブ1','サブ2','サブ3']},ui:{view:'stage',quest:'破界の星墓',stage:{'破界の星墓':'ラルガメンテ'}}};
const row=id=>page.locator(`#suitPanel .sRow:has([data-act="suitEdit"][data-id="${id}"])`);
const picks=dev=>page.evaluate(d=>{const s=document.querySelector(`.pickSel[data-pick-dev="${d}"]`);return {cand:[...s.querySelectorAll(':scope > option')].slice(1).map(o=>o.textContent),
  groups:[...s.querySelectorAll('optgroup')].map(g=>[g.label,[...g.children].map(o=>o.textContent)]),sel:s.value}},dev);
const keepData=async()=>{const d=await stored();
  assert.deepEqual(d.master.characters.map(c=>c.id+':'+c.name),BASE.master.characters.map(c=>c.id+':'+c.name),'no merge, no rename');
  assert.deepEqual(d.units.map(u=>[u.id,u.formId,u.device,u.no,u.epithet||'',u.verificationStatus||'']),BASE.units.map(u=>[u.id,u.formId,u.device,u.no,u.epithet||'',u.verificationStatus||'']));
  assert.deepEqual(d.suits.map(s=>[s.id,s.formId,s.grade,s.verificationStatus,s.note||'']),BASE.suits.map(s=>[s.id,s.formId,s.grade,s.verificationStatus,s.note||'']),'suitability data untouched');
  assert.deepEqual(d.master.forms.filter(f=>f.unknownForm).map(f=>f.id),['fOu','fTu','fXu','fAu','fMu'],'no form confirmed automatically');
};

test('二つ名付きの名前: 「架空0.2秒 架空五条」 is matched to 架空五条 automatically; devices and counts shown; NEEDS_REVIEW, note and picks untouched', async()=>{
  await seed(BASE);
  const t=await txt(row('s1'));
  assert.match(t,/所持：メイン（所持・形態未確認） サブ1（所持・形態未確認×2）/);
  assert.match(t,/自動照合：架空0\.2秒 架空五条（二つ名を除いた名前が一致/);
  assert.match(t,/要確認/);assert.match(t,/編成推奨：架空トラベラーズ2体以上/);
  assert.doesNotMatch(t,/所持個体の登録なし|所持キャラの候補/);
  assert.equal(await page.locator(`#suitPanel .sRow:has([data-id="s1"]) [data-act="linkChar"]`).count(),0,'no manual link needed');
  const p=await picks('メイン');
  assert.deepEqual(p.cand,['架空ネオ｜ハロー 個体1','架空 真キャラ｜架空の獣神化 個体1（形態未確認）','架空0.2秒 架空五条 個体1（形態未確認）（未検証）','架空ネオ｜リバース 個体2（別形態）'],'exact first, then 形態未確認 (by name), then 別形態');
  assert.equal(p.sel,'uO1','the existing pick is kept and is now a normal candidate');
  const card=await txt(page.locator('.pickDev[data-dev="メイン"] .uCard'));
  assert.match(card,/架空0\.2秒 架空五条 個体1/);assert.match(card,/形態未確認/);assert.match(card,/出典の形態：架空五条｜真獣神化（同じ形態かは未確認）/);
  assert.match(card,/兵命削り.*将命削り.*熱き友撃/);assert.doesNotMatch(card,/仮選択・適正未確定/);
  assert.equal(await page.locator('.pickDev[data-dev="メイン"] .uCard.uProv').count(),0);
  const s1=await picks('サブ1');assert.deepEqual(s1.cand,['架空0.2秒 架空五条 個体1（形態未確認）（未検証）','架空0.2秒 架空五条 個体2（形態未確認）（未検証）']);
  assert.deepEqual((await stored()).idLinks||[],[],'automatic matches are not written as links');
  await keepData();
});

test('normalized exact name (space only) and a unit 二つ名 without a space are matched; similar names, α/β suffixes and ＆-names are not', async()=>{
  await seed(BASE);
  assert.match(await txt(row('s2')),/所持：メイン（所持・形態未確認）.*自動照合：架空 真キャラ（名前が一致/);
  assert.match(await txt(row('s4')),/所持：サブ3（所持・形態未確認）.*自動照合：架空最強架空甚爾（二つ名を除いた名前が一致/);
  assert.match(await txt(row('s5')),/所持個体の登録なし/,'架空ラム＆架空レム is not 架空レム');
  assert.doesNotMatch(await txt(row('s1')),/架空五条β/);assert.doesNotMatch(await txt(row('s3')),/架空ネオα/);
  assert.deepEqual(await page.evaluate(()=>[formStatus('fGs','サブ3'),formStatus('fN1','サブ3'),formStatus('fLs','サブ3'),formStatus('fJs','サブ3')]),['not-owned','not-owned','not-owned','unconfirmed']);
  const p=await picks('サブ3');
  assert.deepEqual(p.cand,['架空最強架空甚爾 個体1（形態未確認）']);
  assert.equal(p.groups.length,1);assert.equal(p.groups[0][0],'所持キャラ（適正未登録・仮選択）');assert.deepEqual([...p.groups[0][1]].sort(),['架空ネオα 個体3（仮）','架空五条β 個体2（仮）','架空ラム＆架空レム 個体4（仮）'].sort());
  await keepData();
});

test('same character: exact form is 所持, a confirmed other form is still a candidate marked 別形態 (never hidden), form status unchanged', async()=>{
  await seed(BASE);
  assert.match(await txt(row('s3')),/所持：メイン×1 サブ2！/);
  const m=await picks('メイン');assert.ok(m.cand.includes('架空ネオ｜ハロー 個体1'));assert.ok(m.cand.includes('架空ネオ｜リバース 個体2（別形態）'));
  const s2=await picks('サブ2');assert.deepEqual(s2.cand,['架空ネオ｜リバース 個体1（別形態）']);
  await page.locator('.pickSel[data-pick-dev="サブ2"]').selectOption('uN3');
  const card=await txt(page.locator('.pickDev[data-dev="サブ2"] .uCard'));
  assert.match(card,/別形態/);assert.match(card,/出典の形態：架空ネオ｜ハロー/);assert.doesNotMatch(card,/仮選択/);
  assert.deepEqual((await stored()).picks[K],{'メイン':'uO1','サブ2':'uN3'});
  assert.deepEqual(await page.evaluate(()=>[formStatus('fN1','メイン'),formStatus('fN1','サブ2')]),['owned','alt-form']);
  await keepData();
});

test('a wrong automatic match can be excluded (and the exclusion undone); explicit idLinks still work; old tab is refused (STEP1)', async()=>{
  await seed(BASE);
  await row('s1').locator('[data-act="excludeChar"][data-b="cO"]').click();
  let t=await txt(row('s1'));
  assert.match(t,/所持個体の登録なし/);assert.match(t,/除外中（同じキャラではない）：架空0\.2秒 架空五条/);
  assert.deepEqual((await stored()).idLinks.map(l=>[l.kind,[l.a,l.b].sort().join('-'),l.basis]),[['char','cG-cO','USER_EXCLUDED']]);
  const p=await picks('メイン');
  assert.ok(!p.cand.some(x=>/架空0\.2秒/.test(x)));assert.ok(p.groups.some(g=>g[0]==='所持キャラ（適正未登録・仮選択）'&&g[1].includes('架空0.2秒 架空五条 個体1（仮）')));
  assert.equal(p.sel,'uO1','the pick is kept (now provisional)');
  assert.equal(await page.locator('.pickDev[data-dev="メイン"] .uCard.uProv').count(),1);
  await row('s1').locator('[data-act="unexcludeChar"][data-b="cO"]').click();
  t=await txt(row('s1'));assert.match(t,/自動照合：架空0\.2秒 架空五条/);assert.deepEqual((await stored()).idLinks,[]);
  // 明示の対応付け（名前では一致しないキャラ）はこれまでどおり
  await seed({...BASE,master:{characters:[...BASE.master.characters,{id:'cZ',name:'架空まったく別名'}],forms:[...BASE.master.forms,F('fZu','cZ','',{unknownForm:true})]},units:[...BASE.units,U('uZ','fZu','サブ2',9)],
    idLinks:[{id:'l1',kind:'char',a:'cL',b:'cZ',basis:'USER_SELECTED',at:'2026-10-11T00:00:00.000Z'}]});
  assert.match(await txt(row('s5')),/所持：サブ2（所持・形態未確認）.*同じキャラとして対応付け済み：架空まったく別名/);
  assert.ok((await picks('サブ2')).cand.includes('架空まったく別名 個体9（形態未確認）'));
  // 古いタブ
  const other=await context.newPage();await other.goto(url);await other.click('[data-act="view"][data-view="chara"]');
  const before=JSON.stringify(await stored());
  await row('s1').locator('[data-act="excludeChar"][data-b="cO"]').click();
  assert.equal(JSON.stringify(await stored()),before);assert.equal(await page.locator('#staleBar').isVisible(),true);
  await other.close();
});

test('confirming the same form on an automatically matched character makes it 所持 (×N) and a normal candidate; the suitability status stays', async()=>{
  await seed(BASE);
  await row('s2').locator('[data-act="linkForm"][data-b="fR1"]').click();
  assert.match(await txt(row('s2')),/所持：メイン×1.*同じ形態として確認済み：架空 真キャラ｜架空の獣神化/);
  assert.ok((await picks('メイン')).cand.includes('架空 真キャラ｜架空の獣神化 個体1'));
  const d=await stored();assert.equal(d.suits.find(s=>s.id==='s2').verificationStatus,'VERIFIED');assert.equal(d.idLinks.length,1);
  assert.deepEqual(d.master.characters.map(c=>c.id),BASE.master.characters.map(c=>c.id));
});

test('reload and backup→restore keep the display and the exclusion; old data without idLinks still loads', async()=>{
  await seed(BASE);await row('s1').locator('[data-act="excludeChar"][data-b="cO"]').click();
  await page.reload();assert.match(await txt(row('s1')),/除外中/);assert.match(await txt(row('s2')),/自動照合：架空 真キャラ/);
  const bk=await page.evaluate(()=>backupJson());
  await seed({characters:[]});await page.click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',bk);await page.click('[data-act="restore"]');
  await page.evaluate(()=>{db.ui.view='stage';db.ui.quest='破界の星墓';db.ui.stage={'破界の星墓':'ラルガメンテ'};render()});
  assert.match(await txt(row('s1')),/除外中/);
  const {idLinks,...rest}=BASE;await seed(rest);assert.deepEqual(await page.evaluate(()=>db.idLinks),[]);assert.match(await txt(row('s1')),/自動照合/);
});

test('registration candidates: a 二つ名-separated match is labelled so, but still needs the user to choose', async()=>{
  await seed(BASE);await page.click('[data-act="view"][data-view="admin"]');
  await page.fill('#srText',JSON.stringify({format:'monst-screenshot-reading-v1',characterName:'架空領域展開 架空五条',formName:null,monsterNo:null,race:null,battleType:null,shotType:null,fruit1:null,fruit2:null,fruit3:null,confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[]}));
  await page.click('[data-act="srPreview"]');
  const c=await txt(page.locator('#srCands'));
  assert.match(c,/架空五条 二つ名を除いた名前が一致/);assert.match(c,/候補を選ばない場合は、新しいキャラ「架空領域展開 架空五条」として登録します/);
  assert.doesNotMatch(c,/架空五条β 二つ名を除いた名前が一致/);
});

test('390px: suitability rows with automatic matches and the stage picker fit the phone screen', async()=>{
  await seed(BASE);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  await page.locator('#suitPanel').screenshot({path:path.join(__dirname,'artifacts','v19-auto-match-390.png')});
  await page.locator('.pickDev[data-dev="メイン"]').screenshot({path:path.join(__dirname,'artifacts','v19-pick-390.png')});
});
