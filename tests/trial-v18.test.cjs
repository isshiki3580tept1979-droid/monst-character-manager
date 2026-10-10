// Round 18: STEP4-2追加 適正図鑑キャラと所持キャラ（別ID）の対応付け。利用者が確認したときだけ「同じキャラ」「同じ形態」として結び付ける（統合しない）。
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
// 適正図鑑：架空五条（真獣神化・要確認）、架空真キャラ（獣神化・確認済み）。所持：二つ名付きの別IDの五条（形態未確認・3体）、空白入りの別IDの真キャラ（確認済み形態2つ）、似た名前の別キャラ
const BASE={characters:[],deviceNames:{'メイン':'架空メイン名','サブ1':'架空タブレット'},
  master:{characters:[{id:'cG',name:'架空五条',origin:'SUIT_CATALOG'},{id:'cQ',name:'架空真キャラ',origin:'SUIT_CATALOG'},
      {id:'cO',name:'架空0.2秒 架空五条'},{id:'cR',name:'架空 真キャラ'},{id:'cX',name:'架空五条β'}],
    forms:[F('fGs','cG','真獣神化',{origin:'SUIT_CATALOG'}),F('fQs','cQ','獣神化',{origin:'SUIT_CATALOG'}),
      F('fOu','cO','',{unknownForm:true,monsterNo:'99310',race:'亜人',battleType:'超バランス型',shotType:'貫通'}),
      F('fR1','cR','架空の獣神化'),F('fR2','cR','架空の進化'),F('fXu','cX','',{unknownForm:true})]},
  units:[U('uO1','fOu','メイン',1,{epithet:'架空0.2秒',fruits:[{name:'兵命削りの力',grade:'特級EL'}]}),U('uO2','fOu','サブ1',1),U('uO3','fOu','サブ1',2),
    U('uR1','fR1','メイン',1,{verificationStatus:'VERIFIED',importSource:'monst-screenshot-reading-v1'}),U('uR2','fR2','サブ2',1),U('uX','fXu','サブ3',1)],
  suits:[{id:'s1',stageKey:K,formId:'fGs',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'NEEDS_REVIEW',note:'編成推奨あり'},
    {id:'s2',stageKey:K,formId:'fQs',source:'GAMEWITH',evaluationType:'GRADE',grade:'A',verificationStatus:'VERIFIED'}],
  picks:{[K]:{'メイン':'uO1'}},useDevs:{[K]:['メイン','サブ1','サブ2']},ui:{view:'stage',quest:'破界の星墓',stage:{'破界の星墓':'ラルガメンテ'}}};
const row=id=>page.locator(`#suitPanel .sRow:has([data-act="suitEdit"][data-id="${id}"])`);
const groups=dev=>page.evaluate(d=>{const s=document.querySelector(`.pickSel[data-pick-dev="${d}"]`);return {cand:[...s.querySelectorAll(':scope > option')].slice(1).map(o=>o.textContent),
  groups:[...s.querySelectorAll('optgroup')].map(g=>[g.label,[...g.children].map(o=>o.textContent)])}},dev);
const keepData=async()=>{const d=await stored();
  assert.deepEqual(d.master.characters.map(c=>c.id+':'+c.name),BASE.master.characters.map(c=>c.id+':'+c.name),'no merge, no rename');
  assert.deepEqual(d.units.map(u=>[u.id,u.formId,u.device,u.no,u.epithet||'',u.verificationStatus||'']),BASE.units.map(u=>[u.id,u.formId,u.device,u.no,u.epithet||'',u.verificationStatus||'']));
  assert.deepEqual(d.suits.map(s=>[s.id,s.formId,s.grade,s.verificationStatus]),[['s1','fGs','S','NEEDS_REVIEW'],['s2','fQs','A','VERIFIED']],'suitability data untouched');
  assert.deepEqual(d.picks,BASE.picks,'picks untouched');
};

// 名前が一致しない所持キャラ（明示の対応付けでしか結び付かない）
const ZED={id:'cZ',name:'架空まったく別名'}, ZF={id:'fZu',characterId:'cZ',name:'',unknownForm:true,short:'',race:'',battleType:'',shotType:''}, ZF2={id:'fZ1',characterId:'cZ',name:'架空の別名形態',short:'',race:'',battleType:'',shotType:''};
const WITHZ={...BASE,master:{characters:[...BASE.master.characters,ZED],forms:[...BASE.master.forms,ZF,ZF2]},units:[...BASE.units,U('uZ','fZu','サブ2',1),U('uZ2','fZ1','サブ3',1)]};

test('name matches are automatic now (二つ名 / notation); a character with a different name is offered as a manual candidate only when nothing matched', async()=>{
  await seed(WITHZ);
  assert.match(await txt(row('s1')),/所持：メイン（所持・形態未確認） サブ1（所持・形態未確認×2）.*自動照合：架空0\.2秒 架空五条（二つ名を除いた名前が一致/);
  assert.match(await txt(row('s2')),/所持：メイン（所持・形態未確認）.*自動照合：架空 真キャラ（名前が一致/);
  assert.doesNotMatch(await txt(row('s1')),/所持キャラの候補|架空五条β/,'similar names are not offered once the character has units');
  assert.equal(await page.locator('#suitPanel [data-act="linkChar"]').count(),0);
  assert.deepEqual((await groups('サブ2')).groups,[['所持キャラ（適正未登録・仮選択）',['架空まったく別名 個体1（仮）']]],'a different name stays provisional');
  assert.deepEqual((await stored()).idLinks||[],[],'automatic matches are not written');assert.equal((await stored()).master.characters.length,WITHZ.master.characters.length,'no merge');
});

test('manual link for a different name: ownership shows 所持・形態未確認; the unit becomes a candidate; NEEDS_REVIEW, picks and data stay', async()=>{
  await seed({...WITHZ,suits:[...WITHZ.suits,{id:'s3',stageKey:K,formId:'fGs',source:'ALTEMA',evaluationType:'GRADE',grade:'A',verificationStatus:'NEEDS_REVIEW'}]});
  // 架空五条 には既に自動照合の個体があるので、別名キャラは候補に出ない（自動では結び付けない）。候補の表示は個体が無いキャラだけ
  await seed({...WITHZ,master:{characters:[{id:'cG',name:'架空五条',origin:'SUIT_CATALOG'},ZED],forms:[F('fGs','cG','真獣神化',{origin:'SUIT_CATALOG'}),ZF]},units:[U('uZ','fZu','サブ2',1)],picks:{},
    suits:[{id:'s1',stageKey:K,formId:'fGs',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'NEEDS_REVIEW',note:'編成推奨あり'}]});
  assert.match(await txt(row('s1')),/所持個体の登録なし/);
  assert.equal(await row('s1').locator('[data-act="linkChar"][data-b="cZ"]').count(),0,'a completely different name is not even a candidate');
  // 名前の一部が一致する別名なら候補に出る（押したときだけ対応付け）
  await seed({...WITHZ,master:{characters:[{id:'cG',name:'架空五条',origin:'SUIT_CATALOG'},{id:'cY',name:'架空五条の弟子'}],forms:[F('fGs','cG','真獣神化',{origin:'SUIT_CATALOG'}),F('fYu','cY','',{unknownForm:true})]},units:[U('uY','fYu','サブ2',1)],picks:{},
    suits:[{id:'s1',stageKey:K,formId:'fGs',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'NEEDS_REVIEW',note:'編成推奨あり'}]});
  assert.match(await txt(row('s1')),/所持個体の登録なし.*所持キャラの候補：架空五条の弟子（名前の一部が一致/);
  assert.deepEqual((await groups('サブ2')).groups.map(g=>g[0]),['所持キャラ（適正未登録・仮選択）']);
  await row('s1').locator('[data-act="linkChar"][data-b="cY"]').click();
  const t=await txt(row('s1'));
  assert.match(t,/所持：サブ2（所持・形態未確認）/);assert.match(t,/同じキャラとして対応付け済み：架空五条の弟子/);assert.match(t,/要確認/);
  assert.deepEqual((await groups('サブ2')).cand,['架空五条の弟子 個体1（形態未確認）（未検証）']);
  const d=await stored();assert.deepEqual(d.idLinks.map(l=>[l.kind,[l.a,l.b].sort().join('-'),l.basis]),[['char','cG-cY','USER_SELECTED']]);
  assert.deepEqual(d.master.characters.map(c=>c.name),['架空五条','架空五条の弟子']);assert.equal(d.suits[0].verificationStatus,'NEEDS_REVIEW');
  await row('s1').locator('[data-act="unlinkChar"][data-b="cY"]').click();
  assert.match(await txt(row('s1')),/所持個体の登録なし/);assert.deepEqual((await stored()).idLinks,[]);
});

test('confirmed forms on an automatically matched character: not judged 別形態 until the user confirms the same form; then it is a normal candidate', async()=>{
  await seed(BASE);
  let t=await txt(row('s2'));
  assert.match(t,/メイン（所持・形態未確認）/);assert.match(t,/サブ2（所持・形態未確認）/);assert.doesNotMatch(t,/！/);
  assert.equal(await row('s2').locator('[data-act="linkForm"]').count(),2);
  await row('s2').locator('[data-act="linkForm"][data-b="fR1"]').click();
  t=await txt(row('s2'));
  assert.match(t,/所持：メイン×1/);assert.match(t,/サブ2（所持・形態未確認）/);
  assert.match(t,/同じ形態として確認済み：架空 真キャラ｜架空の獣神化/);
  const g=await groups('メイン');
  assert.ok(g.cand.includes('架空 真キャラ｜架空の獣神化 個体1'),'a normal candidate without 形態未確認 mark');
  assert.deepEqual((await groups('サブ2')).cand,['架空 真キャラ｜架空の進化 個体1（形態未確認）'],'the other confirmed form: same character but form not confirmed');
  assert.equal((await stored()).idLinks.filter(l=>l.kind==='form').length,1);
  await row('s2').locator('[data-act="unlinkForm"][data-b="fR1"]').click();
  assert.match(await txt(row('s2')),/メイン（所持・形態未確認）/);assert.deepEqual((await stored()).idLinks,[]);
  await keepData();
});

test('old tab cannot link or exclude (STEP1); links survive reload and backup/restore; old data without links still loads; the character screen shows the link', async()=>{
  await seed({...WITHZ,master:{characters:[{id:'cG',name:'架空五条',origin:'SUIT_CATALOG'},{id:'cY',name:'架空五条の弟子'}],forms:[F('fGs','cG','真獣神化',{origin:'SUIT_CATALOG'}),F('fYu','cY','',{unknownForm:true})]},units:[U('uY','fYu','サブ2',1)],picks:{},
    suits:[{id:'s1',stageKey:K,formId:'fGs',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'NEEDS_REVIEW'}]});
  const other=await context.newPage();await other.goto(url);await other.click('[data-act="view"][data-view="chara"]');
  const before=JSON.stringify(await stored());
  await row('s1').locator('[data-act="linkChar"][data-b="cY"]').click();
  assert.equal(JSON.stringify(await stored()),before,'nothing written in an old tab');assert.equal(await page.locator('#staleBar').isVisible(),true);
  await other.close();
  await page.reload();await page.evaluate(()=>{db.ui.view='stage';render()}); // 別のタブが「キャラ」画面の表示状態を保存していたため
  await row('s1').locator('[data-act="linkChar"][data-b="cY"]').click();
  await page.reload();assert.match(await txt(row('s1')),/所持：サブ2/);
  await page.evaluate(()=>{db.ui.view='chara';db.ui.charaOpen='cY';render()});
  assert.match(await txt(page.locator('#charaList .card.open')),/同じキャラとして対応付け：架空五条/);
  const bk=await page.evaluate(()=>backupJson());
  await seed({characters:[]});await page.click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',bk);await page.click('[data-act="restore"]');
  assert.equal((await stored()).idLinks.length,1);
  await seed(BASE);assert.deepEqual(await page.evaluate(()=>db.idLinks),[]);
});

test('screenshot registration: a name differing only by a space is a candidate, and the message matches what really happens', async()=>{
  await seed({...BASE,master:{characters:[{id:'cG',name:'架空五条',origin:'SUIT_CATALOG'}],forms:[F('fGs','cG','真獣神化',{origin:'SUIT_CATALOG'})]},units:[],picks:{}});
  await page.click('[data-act="view"][data-view="admin"]');
  await page.fill('#srText',JSON.stringify({format:'monst-screenshot-reading-v1',characterName:'架空 五条',formName:null,monsterNo:null,race:null,battleType:null,shotType:null,fruit1:null,fruit2:null,fruit3:null,confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[]}));
  await page.click('[data-act="srPreview"]');
  const c=await txt(page.locator('#srCands'));
  assert.match(c,/架空五条 .*表記ゆれ（空白・記号・全角半角）だけが違う.*適正図鑑/);
  assert.match(c,/候補を選ばない場合は、新しいキャラ「架空 五条」として登録します/);
  assert.doesNotMatch(c,/同じ名前のキャラが登録済みのため/);
  await page.selectOption('#srDevice','メイン');await page.click('[data-act="srCheck"]');
  assert.match(await txt(page.locator('#srResult')),/新しいキャラ「架空 五条」を登録/);
  await page.locator('#srCands [data-act="srCand"]').first().click();await page.click('[data-act="srCheck"]');
  assert.match(await txt(page.locator('#srResult')),/既存キャラ「架空五条」に新しい個体を追加/);
});

test('390px: candidate and link lines in the suitability list fit the phone screen', async()=>{
  await seed(BASE); // 自動照合の行・形態の確認ボタンが表示された状態
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  await page.locator('#suitPanel').screenshot({path:path.join(__dirname,'artifacts','v18-links-390.png')});
});
