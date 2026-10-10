// Round 17: STEP4-1 適正の一括取り込み基盤（適正図鑑キャラ・照合の4分類・選択・対応表の記録）。
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
const K='破界の星墓::ラルガメンテ', K2='破界の星墓::パライソ';
// 架空の所持データ：乙骨（確認済み形態「架空の現代」）、二つ名付きの名前で登録されたマキマ（形態未確認）、マスター・コーヴ（形態「架空の師範」）、ネオ（形態「架空ハロー」短縮ハロー）
const BASE={characters:[],master:{characters:[{id:'cO',name:'架空乙骨'},{id:'cM',name:'架空二つ名 架空マキマ'},{id:'cK',name:'架空マスター・コーヴ'},{id:'cN',name:'架空ネオ'}],
    forms:[{id:'fO',characterId:'cO',name:'架空の現代',short:'',race:'',battleType:'',shotType:''},{id:'fM',characterId:'cM',name:'',unknownForm:true,short:'',race:'',battleType:'',shotType:''},
      {id:'fK',characterId:'cK',name:'架空の師範',short:'',race:'',battleType:'',shotType:''},{id:'fN',characterId:'cN',name:'架空ハローワールド',short:'ハロー',race:'',battleType:'',shotType:''}]},
  units:[{id:'uO',formId:'fO',device:'メイン',no:1,fruits:[],memo:'',verificationStatus:'VERIFIED',importSource:'monst-hakai-main-staging-v1'},{id:'uM',formId:'fM',device:'メイン',no:1,fruits:[],memo:'',epithet:'架空の称号'},
    {id:'uK',formId:'fK',device:'サブ1',no:1,fruits:[],memo:''},{id:'uN',formId:'fN',device:'サブ1',no:1,fruits:[],memo:''}],
  suits:[{id:'s0',stageKey:K2,formId:'fO',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'VERIFIED',sourceUrl:'https://example.invalid/old'}],
  picks:{[K2]:{'メイン':'uO'}},ownershipChecks:[{id:'oc1',device:'メイン',characterName:'架空新キャラ',stageKey:K,scope:'破界の星墓',stage:'ラルガメンテ',status:'NOT_OWNED'}]};
const IMPORT={format:'monst-suitability-import-v1',stageKey:K,source:'GAMEWITH',sourceUrl:'https://example.invalid/larga',sourceUpdatedAt:'2026-10-10',evaluationType:'GRADE',entries:[
  {characterName:'架空ネオ',formName:'ハロー',grade:'S',verificationStatus:'VERIFIED'},              // 1. 自動照合（短縮名が一致）
  {characterName:'架空乙骨',formName:'獣神化',grade:'S',verificationStatus:'VERIFIED'},            // 2. 形態の選択が必要
  {characterName:'架空マキマ',formName:'獣神化',grade:'A',verificationStatus:'NEEDS_REVIEW'},       // 3. キャラの選択が必要（二つ名付きの名前）
  {characterName:'架空マスターコーヴ',formName:'架空の師範',grade:'A',verificationStatus:'VERIFIED'},// 3. キャラの選択が必要（「・」の違いだけ。自動にしない）
  {characterName:'架空新キャラ',formName:'獣神化改',grade:'A',verificationStatus:'VERIFIED'}]};    // 4. 新しい適正図鑑キャラ
async function preview(obj=IMPORT){await page.click('[data-act="view"][data-view="admin"]');await page.fill('#imText',JSON.stringify(obj));await page.click('[data-act="imPreview"]')}
const result=async()=>txt(page.locator('#imResult'));
const keep=async()=>{const d=await stored();
  assert.deepEqual(d.units.map(u=>[u.id,u.formId,u.device,u.verificationStatus||'',u.importSource||'',u.epithet||'']),
    [['uO','fO','メイン','VERIFIED','monst-hakai-main-staging-v1',''],['uM','fM','メイン','','','架空の称号'],['uK','fK','サブ1','',''],['uN','fN','サブ1','','']].map(x=>x.length===6?x:[...x,'']));
  assert.deepEqual(d.picks,BASE.picks);
  const s0=d.suits.find(s=>s.id==='s0');assert.deepEqual([s0.formId,s0.grade,s0.verificationStatus,s0.sourceUrl],['fO','S','VERIFIED','https://example.invalid/old']);
  assert.equal(d.master.forms.find(f=>f.id==='fM').unknownForm,true);
};

test('preview classifies rows into 4 groups; defaults keep the old behaviour (only exact matches are added, others wait); nothing saved', async()=>{
  await seed(BASE);await page.click('[data-act="view"][data-view="admin"]');const before=JSON.stringify(await stored());
  await preview();
  const r=await result();
  assert.match(r,/追加 1件／更新 0件／変更なし 0件／要確認（取り込まない） 4件/,'same summary as before');
  assert.match(r,/自動照合 1件／形態の選択が必要 1件／キャラの選択が必要 2件／新しい適正図鑑キャラ 1件/);
  const ch=await txt(page.locator('#imChoices'));
  assert.match(ch,/架空乙骨｜形態「獣神化」/);assert.match(ch,/架空マキマ/);assert.match(ch,/架空マスターコーヴ/);
  assert.equal(JSON.stringify(await stored()),before,'preview saves nothing');
});

test('未登録キャラ: with the option on, it is added as a 適正図鑑キャラ (no unit, not judged 未所持); others stay 確認待ち', async()=>{
  await seed(BASE);await preview();
  await page.check('#imCatalogOn');
  assert.match(await result(),/新しい適正図鑑キャラ 1件（キャラ1・形態1を追加）/);
  assert.match(await result(),/追加 2件／更新 0件／変更なし 0件／要確認（取り込まない） 3件/);
  await page.click('[data-act="imApply"]');
  const d=await stored();
  const c=d.master.characters.find(x=>x.name==='架空新キャラ');assert.equal(c.origin,'SUIT_CATALOG');
  const f=d.master.forms.find(x=>x.characterId===c.id);assert.deepEqual([f.name,f.origin,!!f.unknownForm],['獣神化改','SUIT_CATALOG',false]);
  assert.equal(d.units.some(u=>u.formId===f.id),false,'no unit is created');
  const s=d.suits.find(x=>x.formId===f.id);assert.deepEqual([s.stageKey,s.grade,s.verificationStatus,s.evaluationType,s.rank],[K,'A','VERIFIED','GRADE',null]);
  assert.equal(d.suits.find(x=>x.formId==='fN'&&x.stageKey===K).grade,'S');
  assert.deepEqual(d.importIssues.map(x=>x.characterName).sort(),['架空マキマ','架空マスターコーヴ','架空乙骨'].sort(),'unresolved rows wait as 要確認');
  await keep();
  // ステージ画面：個体がないだけでは「未所持」と言わない／明示の所持確認は区別して出す
  await page.evaluate(()=>{db.ui.view='stage';db.ui.quest='破界の星墓';db.ui.stage={'破界の星墓':'ラルガメンテ'};render()});
  const row=await txt(page.locator(`#suitPanel .sRow:has([data-id="${s.id}"])`));
  assert.match(row,/所持個体の登録なし/);assert.doesNotMatch(row,/未所持（/);
  assert.match(row,/所持確認の記録：メイン 未所持/);
});

test('choosing a form / a character records the mapping (with source and basis) and the same JSON is matched automatically next time', async()=>{
  await seed(BASE);await preview();
  await page.selectOption('[data-im-form="cO|獣神化"]','fO');                 // 乙骨の「獣神化」→ 既存形態「架空の現代」
  await page.selectOption('[data-im-char="架空マスターコーヴ"]','cK');              // 表記ゆれ → 既存キャラ
  await page.selectOption('[data-im-char="架空マキマ"]','cM');                     // 二つ名付きの名前 → 既存キャラ
  // マキマは形態が未確認だけなので、形態の選択が出る：「獣神化」だけで既存の形態を確定しない（新しい形態として追加を選ぶ）
  assert.equal(await page.locator('[data-im-form="cM|獣神化"] option[value="fM"]').count(),0,'an unconfirmed form is never offered as the match');
  await page.selectOption('[data-im-form="cM|獣神化"]','new');
  assert.match(await result(),/追加 4件／更新 0件／変更なし 0件／要確認（取り込まない） 1件/); // 新キャラは図鑑追加がオフなので確認待ち
  await page.click('[data-act="imApply"]');
  let d=await stored();
  assert.equal(d.master.characters.length,4,'no character added or merged');
  const fNew=d.master.forms.find(f=>f.characterId==='cM'&&f.name==='獣神化');assert.equal(fNew.origin,'SUIT_CATALOG');
  assert.equal(d.master.forms.find(f=>f.id==='fM').unknownForm,true,'the user unit stays 形態未確認');
  const al=d.suitAliases.map(a=>[a.kind,a.source,a.label,a.formLabel||'',a.characterId,a.formId||'',a.basis]).sort();
  assert.deepEqual(al,[['char','GAMEWITH','架空マキマ','','cM','','USER_SELECTED'],['char','GAMEWITH','架空マスターコーヴ','','cK','','USER_SELECTED'],
    ['form','GAMEWITH','架空乙骨','獣神化','cO','fO','USER_SELECTED']].sort());
  assert.ok(d.suitAliases.every(a=>a.stageKey===K&&/^\d{4}-/.test(a.at)));
  await keep();
  // 同じJSONをもう一度：記録した対応で自動照合され、重複しない
  await page.reload();await preview();
  assert.match(await result(),/追加 0件／更新 0件／変更なし 4件／要確認（取り込まない） 1件/);
  assert.match(await result(),/自動照合 4件/);
  // 残り1件（新キャラ）は図鑑追加がオフなので確認待ち
  await page.check('#imCatalogOn');await page.click('[data-act="imApply"]');
  await preview();assert.match(await result(),/追加 0件／更新 0件／変更なし 5件／要確認（取り込まない） 0件/);
  d=await stored();assert.equal(d.suits.filter(s=>s.stageKey===K).length,5);assert.equal(d.master.characters.length,5);
});

test('a form is never fixed from an evolution label alone; 保留 keeps the row waiting; same/similar names are never merged automatically', async()=>{
  await seed({...BASE,master:{characters:[...BASE.master.characters,{id:'cA',name:'架空スカアハα'}],forms:[...BASE.master.forms,{id:'fA',characterId:'cA',name:'架空の花嫁',short:'',race:'',battleType:'',shotType:''}]}});
  await preview({...IMPORT,entries:[{characterName:'架空乙骨',formName:'獣神化',grade:'S'},{characterName:'架空スカアハβ',formName:'架空の花嫁',grade:'A'}]});
  await page.check('#imCatalogOn');
  // 似た名前（スカアハα）は候補として出るが、自動では結び付けず、図鑑追加もしない（候補があるときは選択が必要）
  assert.match(await txt(page.locator('#imChoices')),/架空スカアハβ.*架空スカアハα.*似た名前/);
  assert.match(await result(),/追加 0件／更新 0件／変更なし 0件／要確認（取り込まない） 2件/);
  await page.click('[data-act="imApply"]');
  const d=await stored();
  assert.equal(d.suits.filter(s=>s.stageKey===K).length,0);
  assert.deepEqual(d.master.characters.map(c=>c.name),['架空乙骨','架空二つ名 架空マキマ','架空マスター・コーヴ','架空ネオ','架空スカアハα']);
  assert.deepEqual(d.importIssues.map(x=>[x.characterName,x.reason]).sort(),[['架空スカアハβ','未登録のキャラ（自動では作成しません）'],['架空乙骨','進化形態が一致しません（正式名・短縮名と完全一致のみ）']].sort());
});

test('適正図鑑キャラ are separated in the character list (filter) and marked in search; registering it later by screenshot adds a unit to it (no duplicate)', async()=>{
  await seed(BASE);await preview();await page.check('#imCatalogOn');await page.click('[data-act="imApply"]');
  await page.click('[data-act="view"][data-view="chara"]');
  assert.match(await page.locator('#charaCount').textContent(),/全5キャラ・4個体（うち適正図鑑のみ1キャラ）/);
  assert.equal(await page.locator('#charaList .card.chara',{hasText:'架空新キャラ'}).count(),0,'hidden from the normal owned list');
  await page.click('[data-act="charaFilter"][data-f="catalog"]');
  assert.equal(await page.locator('#charaList .card.chara').count(),1);assert.match(await txt(page.locator('#charaList')),/架空新キャラ/);
  await page.click('[data-act="charaFilter"][data-f="all"]');assert.equal(await page.locator('#charaList .card.chara').count(),5);
  await page.click('[data-act="view"][data-view="search"]');await page.fill('#searchInput','新キャラ');
  assert.match(await txt(page.locator('#searchResults .sNew .card')),/架空新キャラ.*適正図鑑.*所持個体なし/);
  // スクショから所持登録：候補に出る → 既存キャラに個体を追加（同名の重複なし）
  await page.click('[data-act="view"][data-view="admin"]');
  await page.fill('#srText',JSON.stringify({format:'monst-screenshot-reading-v1',characterName:'架空新キャラ',formName:null,monsterNo:null,race:null,battleType:null,shotType:null,fruit1:null,fruit2:null,fruit3:null,confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[]}));
  await page.click('[data-act="srPreview"]');
  assert.match(await txt(page.locator('#srCands')),/架空新キャラ.*同じ名前.*0体/);
  await page.selectOption('#srDevice','サブ2');await page.click('[data-act="srCheck"]');
  assert.match(await txt(page.locator('#srResult')),/既存キャラ「架空新キャラ」に新しい個体を追加/);
  await page.click('[data-act="srApply"]');
  const d=await stored();assert.equal(d.master.characters.filter(c=>c.name==='架空新キャラ').length,1);
  const c=d.master.characters.find(x=>x.name==='架空新キャラ'), fs2=d.master.forms.filter(f=>f.characterId===c.id);
  assert.deepEqual(fs2.map(f=>[f.name,!!f.unknownForm]).sort(),[['',true],['獣神化改',false]].sort(),'the screenshot unit is 形態未確認; the catalog form is not confirmed by it');
  await page.evaluate(()=>{db.ui.view='stage';db.ui.quest='破界の星墓';db.ui.stage={'破界の星墓':'ラルガメンテ'};render()});
  assert.match(await txt(page.locator('#suitPanel')),/架空新キャラ.*サブ2（所持・形態未確認）/);
});

test('save failure and another tab: the whole import is rolled back (characters, forms, mappings, suits)', async()=>{
  await seed(BASE);await preview();await page.check('#imCatalogOn');await page.selectOption('[data-im-form="cO|獣神化"]','fO');
  const before=JSON.stringify(await stored());
  await page.evaluate(()=>{window.__s=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='monst-character-manager-trial-v2')throw new Error('QuotaExceededError');return window.__s.call(this,k,v)}});
  await page.click('[data-act="imApply"]');
  await page.evaluate(()=>{Storage.prototype.setItem=window.__s});
  assert.match(await page.locator('#imMsg').textContent(),/取り込みに失敗したため、取り込み前の状態に戻しました/);
  assert.equal(JSON.stringify(await stored()),before);
  assert.deepEqual(await page.evaluate(()=>[db.master.characters.length,db.master.forms.length,db.suitAliases.length,db.suits.length]),[4,4,0,1],'memory rolled back too');
  // 別のタブが保存した後（STEP1）
  await preview();await page.check('#imCatalogOn');
  const other=await context.newPage();await other.goto(url);await other.click('[data-act="view"][data-view="chara"]');
  const b2=JSON.stringify(await stored());
  await page.click('[data-act="imApply"]');
  assert.match(await page.locator('#imMsg').textContent(),/別のタブでデータが更新されたため、保存を止めました/);
  assert.equal(JSON.stringify(await stored()),b2);
  await other.close();
});

test('backup / restore keeps 適正図鑑 origin and the mappings; old data without them still loads', async()=>{
  await seed(BASE);await preview();await page.check('#imCatalogOn');await page.selectOption('[data-im-form="cO|獣神化"]','fO');await page.click('[data-act="imApply"]');
  const bk=await page.evaluate(()=>backupJson());
  await seed({characters:[]});await page.click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',bk);await page.click('[data-act="restore"]');
  const d=await stored();
  assert.equal(d.master.characters.find(c=>c.name==='架空新キャラ').origin,'SUIT_CATALOG');
  assert.equal(d.suitAliases.length,1);assert.equal(d.suitAliases[0].formId,'fO');
  await seed(BASE);assert.deepEqual(await page.evaluate(()=>[db.suitAliases.length,db.master.characters.every(c=>!('origin' in c))]),[0,true]);
});

test('390px: the import preview with selections fits the phone screen', async()=>{
  await seed(BASE);await preview();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  await page.locator('#imResult').screenshot({path:path.join(__dirname,'artifacts','v17-import-preview-390.png')});
  await page.locator('#imChoices').screenshot({path:path.join(__dirname,'artifacts','v17-import-choices-390.png')});
});
