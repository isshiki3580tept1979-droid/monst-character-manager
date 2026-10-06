// Round 2 of the new structure: 4 fruit slots, suitability reliability (evaluationType / verificationStatus /
// sourceUrl / sourceUpdatedAt), and the JSON import of external suitability data.
// Same harness as trial-browser.test.cjs (NODE_PATH must contain playwright; isolated localhost origin per test).
const {test,before,after,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const source=path.resolve(process.env.TRIAL_HTML_SOURCE||path.join(__dirname,'..','monst_character_manager_trial.html'));
const KEY='monst-character-manager-trial-v2';
const protectedKeys=['monst-character-manager-v2','monst-character-manager-v1','monst-character-manager-device-names-v1','monst-character-manager-trial-v1'];
const STAGE='禁忌の獄::一ノ獄', PARAISO='破界の星墓::パライソ';
let browser,server,url,context,page,errors;
before(async()=>{
  server=http.createServer((req,res)=>{if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(source));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
beforeEach(async()=>{
  context=await browser.newContext({viewport:{width:390,height:844}});page=await context.newPage();errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
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
  assert.ok(await page.evaluate(key=>window.storageAccess.every(([,k])=>k===key),KEY),'app reads/writes only trial-v2');
  const sentinels=await page.evaluate(keys=>keys.map(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k)),protectedKeys);
  assert.deepEqual(sentinels,protectedKeys.map(k=>'protected sentinel '+k));
  await context.close();
});
const click=async selector=>page.locator(selector).first().click();
const snapshot=()=>page.evaluate(()=>JSON.parse(JSON.stringify(db)));
async function seed(raw){await page.evaluate(({key,raw})=>localStorage.setItem(key,JSON.stringify(raw)),{key:KEY,raw});await page.reload()}
const devRow=dev=>page.locator(`.pickDev[data-dev="${dev}"]`);
const FOUR=['撃種加撃','撃種加速撃','撃種加命撃','同族加撃'].map((name,i)=>({name,grade:['特級L','特級','特級EL','特級M'][i],kind:i<3?'撃種':'同族'}));
function world(extra={}){
  return {characters:[],
    master:{characters:[{id:'c-neo',name:'ネオ'},{id:'c-rinne',name:'リンネ'},{id:'c-twin',name:'双子'},{id:'c-twin2',name:'双子'}],
      forms:[{id:'f-hello',characterId:'c-neo',name:'ハローワールド・モード',short:'ハロー',race:'亜人',battleType:'スピード型',shotType:'反射'},
        {id:'f-rev',characterId:'c-neo',name:'リバース・モード',short:'リバース',race:'魔人',battleType:'パワー型',shotType:'貫通'},
        {id:'f-rinne',characterId:'c-rinne',name:'リンネ（獣神化）',short:'',race:'亜人',battleType:'砲撃型',shotType:'貫通'}]},
    units:[{id:'u4',formId:'f-hello',device:'メイン',no:1,fruits:FOUR,memo:''},
      {id:'u3',formId:'f-rev',device:'メイン',no:2,fruits:FOUR.slice(0,3),memo:''}],
    suits:[],...extra};
}
const imp=(o)=>JSON.stringify({format:'monst-suitability-import-v1',stageKey:PARAISO,source:'GAMEWITH',sourceUrl:'https://example.com/paraiso',
  sourceUpdatedAt:'2026-09-28',evaluationType:'GRADE',entries:[{characterName:'ネオ',formName:'ハローワールド・モード',grade:'S'}],...o});
async function importJson(text){
  await click('[data-act="view"][data-view="admin"]');await page.fill('#imText',text);await click('[data-act="imPreview"]');
}

// ---------- 1. わくわくの実 4枠 ----------
test('fruits: 3 slots by default, 4th slot on demand; 4 fruits save, reload, show in 全部 and 実', async()=>{
  await seed(world({useDevs:{[STAGE]:['メイン']}}));
  await click('[data-act="view"][data-view="chara"]');await click('[data-act="charaOpen"][data-id="c-rinne"]');
  await click('[data-act="unitAdd"][data-id="c-rinne"]');
  assert.equal(await page.locator('#unFruits .frRow:visible').count(),3);assert.equal(await page.locator('#unFruit4Btn').isVisible(),true);
  await click('#unFruit4Btn');assert.equal(await page.locator('#unFruits .frRow:visible').count(),4);assert.equal(await page.locator('#unFruit4Btn').isVisible(),false);
  for(let i=0;i<4;i++){await page.fill('#unFrName'+i,FOUR[i].name);await page.selectOption('#unFrGrade'+i,FOUR[i].grade);await page.selectOption('#unFrKind'+i,FOUR[i].kind)}
  await click('[data-act="saveUnit"]');await page.reload();
  const u=(await snapshot()).units.find(x=>x.formId==='f-rinne');assert.deepEqual(u.fruits,FOUR);
  // re-opening a unit that has a 4th fruit shows the 4th row immediately; a 3-fruit unit does not
  await click('[data-act="view"][data-view="chara"]');
  await click(`[data-act="unitEdit"][data-id="${u.id}"]`);assert.equal(await page.locator('#unFruits .frRow:visible').count(),4);assert.equal(await page.inputValue('#unFrName3'),'同族加撃');
  await click('#unitModal [data-act="close"]');
  await click('[data-act="charaOpen"][data-id="c-neo"]');await click('[data-act="unitEdit"][data-id="u3"]');assert.equal(await page.locator('#unFruits .frRow:visible').count(),3);
  await click('#unitModal [data-act="close"]');
  // stage: 全部 shows 実4 only for the unit that has one; 実 shows 4 chips vs 3
  await page.evaluate(()=>{db.suits.push(normSuit({id:'sx',stageKey:'禁忌の獄::一ノ獄',formId:'f-hello',source:'GAMEWITH',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'}),normSuit({id:'sy',stageKey:'禁忌の獄::一ノ獄',formId:'f-rev',source:'GAMEWITH',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'}));persist();render()});
  await click('[data-act="view"][data-view="stage"]');await page.locator('.pickSel[data-pick-dev="メイン"]').selectOption('u4');
  await click('[data-act="infoMode"][data-mode="all"]');
  assert.deepEqual(await devRow('メイン').locator('.pAll dt').allTextContents(),['キャラ','形態','種族','戦型','撃種','実1','実2','実3','実4']);
  assert.equal(await devRow('メイン').locator('.pAll dd').last().textContent(),'[同族]同族加撃 特級M');
  await page.locator('.pickSel[data-pick-dev="メイン"]').selectOption('u3');
  assert.deepEqual(await devRow('メイン').locator('.pAll dt').allTextContents(),['キャラ','形態','種族','戦型','撃種','実1','実2','実3']);
  await click('[data-act="infoMode"][data-mode="fruit"]');assert.equal(await devRow('メイン').locator('.fr').count(),3);
  await page.locator('.pickSel[data-pick-dev="メイン"]').selectOption('u4');assert.equal(await devRow('メイン').locator('.fr').count(),4);
});

test('fruits: old 4-slot ownership migrates into a unit keeping all 4; backup/restore keeps 4', async()=>{
  const old={characters:[],rankings:{[STAGE]:{entries:[{rank:5,name:'ネオ'}]}},
    ownership:{[STAGE]:{'サブ2':{ranks:{5:{status:'owned',count:1,wakuwaku:FOUR.map(({name,grade})=>({name,grade}))}}}}}};
  await seed({...world(),...old});const ownershipBefore=(await snapshot()).ownership;
  await click('[data-act="view"][data-view="admin"]');
  const id=STAGE+'#5';
  await page.selectOption(`[data-mig-form="${id}"]`,'f-hello');await page.selectOption(`[data-mig-src="${id}"]`,'GAME_CLEAR_MONSTERS');
  await click(`[data-act="migrate"][data-id="${id}"]`);
  let d=await snapshot();
  const u=d.units.find(x=>x.device==='サブ2');
  assert.deepEqual(u.fruits.map(x=>[x.name,x.grade]),FOUR.map(x=>[x.name,x.grade]));
  assert.deepEqual(d.migrated[id].pending,[]);
  assert.deepEqual(d.ownership,ownershipBefore); // old data untouched
  const json=await page.evaluate(()=>backupJson());
  await seed({characters:[]});await click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',json);await click('[data-act="restore"]');
  d=await snapshot();assert.equal(d.units.find(x=>x.device==='サブ2').fruits.length,4);assert.equal(d.units.find(x=>x.id==='u4').fruits[3].name,'同族加撃');
});

// ---------- 2. 適正の信頼性 ----------
test('suitability: verification states and evaluation types kept; missing status is UNVERIFIED; no rank/grade conversion', async()=>{
  await seed(world({suits:[
    {id:'a',stageKey:STAGE,formId:'f-hello',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'VERIFIED',sourceUrl:'https://example.com/a',sourceUpdatedAt:'2026-09-28'},
    {id:'b',stageKey:STAGE,formId:'f-hello',source:'ALTEMA',evaluationType:'RANK',rank:3,verificationStatus:'NEEDS_REVIEW'},
    {id:'c',stageKey:STAGE,formId:'f-rinne',source:'GAMEWITH',grade:'A'},
    {id:'d',stageKey:STAGE,formId:'f-rev',source:'OTHER_SITE',site:'攻略X',evaluationType:'CANDIDATE',verificationStatus:'bogus',sourceUrl:'javascript:alert(1)'}],useDevs:{[STAGE]:['メイン']}}));
  await page.reload();
  const s=Object.fromEntries((await snapshot()).suits.map(x=>[x.id,x]));
  assert.deepEqual([s.a.evaluationType,s.a.rank,s.a.grade,s.a.verificationStatus,s.a.sourceUrl,s.a.sourceUpdatedAt],['GRADE',null,'S','VERIFIED','https://example.com/a','2026-09-28']);
  assert.deepEqual([s.b.evaluationType,s.b.rank,s.b.grade,s.b.verificationStatus],['RANK',3,'','NEEDS_REVIEW']);
  assert.deepEqual([s.c.evaluationType,s.c.rank,s.c.grade,s.c.verificationStatus],['GRADE',null,'A','UNVERIFIED']); // grade stays a grade, never a rank
  assert.deepEqual([s.d.evaluationType,s.d.verificationStatus,s.d.sourceUrl],['CANDIDATE','UNVERIFIED','']);  // unsafe URL dropped
  // sources are shown separately; badges show the verification state; unverified marker on candidates
  const panel=(await page.locator('#suitPanel').textContent()).replace(/[ \n\t]+/g,'');
  assert.match(panel,/GameWith.*ネオ｜ハローランクS確認済み.*リンネ｜リンネ（獣神化）ランクA未検証/s); // S listed before A
  assert.match(panel,/アルテマ.*ネオ｜ハロー3位要確認/s);assert.match(panel,/その他サイト（攻略X）.*ネオ｜リバース候補未検証/s);
  assert.match(panel,/未検証・要確認の適正が3件/);
  assert.deepEqual(await page.locator('.pickSel[data-pick-dev="メイン"] option').allTextContents(),['— 使う個体を選ぶ —','ネオ｜ハロー 個体1','ネオ｜リバース 個体2（未検証）']);
  // confirm one with the button
  await click('[data-act="suitVerify"][data-id="d"]');assert.equal((await snapshot()).suits.find(x=>x.id==='d').verificationStatus,'VERIFIED');
  assert.deepEqual(await page.locator('.pickSel[data-pick-dev="メイン"] option').allTextContents(),['— 使う個体を選ぶ —','ネオ｜ハロー 個体1','ネオ｜リバース 個体2']);
  // modal: GRADE keeps only grade, RANK keeps only rank (the other field is not saved)
  // the 順位 field is hidden for GRADE; even a stray value in it is not saved as a rank
  await click('[data-act="suitEdit"][data-id="a"]');assert.equal(await page.locator('#stRankField').isVisible(),false);
  await page.evaluate(()=>{document.getElementById('stRank').value='1'});await click('[data-act="saveSuit"]');
  assert.deepEqual((({rank,grade})=>[rank,grade])((await snapshot()).suits.find(x=>x.id==='a')),[null,'S']);
  // backup keeps every reliability field
  const exported=JSON.parse(await page.evaluate(()=>backupJson()));
  assert.equal(exported.data.suits.find(x=>x.id==='b').verificationStatus,'NEEDS_REVIEW');
  assert.equal(exported.data.suits.find(x=>x.id==='a').sourceUrl,'https://example.com/a');
});

test('stage receivers: all 20 天魔 and 15 星墓 stages accept imports; nothing is pre-registered as VERIFIED', async()=>{
  const keys=await page.evaluate(()=>['天魔の孤城','破界の星墓'].flatMap(q=>QMAP[q].stages.map(s=>key(q,s))));
  assert.equal(keys.length,35);
  assert.ok(await page.evaluate(keys=>keys.every(k=>resolveStageKey({stageKey:k})===k),keys));
  assert.equal(await page.evaluate(()=>resolveStageKey({quest:'天魔の孤城',stage:'空中庭園・第10の園'})),'天魔の孤城::空中庭園・第10の園');
  assert.equal(await page.evaluate(()=>resolveStageKey({stageKey:'破界の星墓::存在しない星墓'})),'');
  const d=await snapshot();assert.deepEqual([d.suits,d.master.characters,d.master.forms,d.units],[[],[],[],[]]);
});

// ---------- 3〜4. JSON取り込み ----------
test('import: preview first, then UNVERIFIED by default; same import twice adds nothing; duplicates in file collapse', async()=>{
  await seed(world());
  const text=JSON.stringify([JSON.parse(imp({})),JSON.parse(imp({entries:[
    {characterName:'ネオ',formName:'リバース',grade:'A',note:'短縮名で一致'},
    {characterName:'ネオ',formName:'リバース・モード',grade:'A'}]}))]);
  await importJson(text);
  assert.match(await page.locator('#imResult').textContent(),/追加 2件／更新 0件／変更なし 0件／要確認（取り込まない） 0件.*ファイル内の重複 1件/s);
  assert.equal((await snapshot()).suits.length,0); // preview writes nothing
  await click('[data-act="imApply"]');
  let d=await snapshot();
  assert.deepEqual(d.suits.map(s=>[s.stageKey,s.formId,s.source,s.evaluationType,s.rank,s.grade,s.verificationStatus,s.sourceUrl,s.sourceUpdatedAt]).sort(),
    [[PARAISO,'f-hello','GAMEWITH','GRADE',null,'S','UNVERIFIED','https://example.com/paraiso','2026-09-28'],[PARAISO,'f-rev','GAMEWITH','GRADE',null,'A','UNVERIFIED','https://example.com/paraiso','2026-09-28']]);
  // same data again: nothing added, nothing updated
  await page.fill('#imText','');await importJson(text);
  assert.match(await page.locator('#imResult').textContent(),/追加 0件／更新 0件／変更なし 2件/);
  assert.equal(await page.locator('#imApply').isDisabled(),true);
  assert.equal((await snapshot()).suits.length,2);
  // changing the textarea after preview invalidates the plan
  await importJson(imp({entries:[{characterName:'リンネ',formName:'リンネ（獣神化）',grade:'B'}]}));
  await page.fill('#imText',imp({}));assert.equal(await page.locator('#imApply').isDisabled(),true);
  await page.evaluate(()=>confirmSuitImport());assert.match(await page.locator('#imMsg').textContent(),/先に「内容を確認」/);
  assert.equal((await snapshot()).suits.length,2);
});

test('import: unknown character, character-only match, unknown/ambiguous form are not guessed (要確認 list)', async()=>{
  await seed(world());
  await importJson(imp({entries:[
    {characterName:'未登録キャラ',formName:'獣神化',grade:'S'},
    {characterName:'ネオ',grade:'S'},
    {characterName:'ネオ',formName:'獣神化改',grade:'S'},
    {characterName:'双子',formName:'何か',grade:'S'},
    {characterName:'リンネ',formName:'リンネ（獣神化）',grade:'A'}]}));
  assert.match(await page.locator('#imResult').textContent(),/追加 1件／更新 0件／変更なし 0件／要確認（取り込まない） 4件/);
  await click('[data-act="imApply"]');
  const d=await snapshot();
  assert.deepEqual(d.master.characters.map(c=>c.name),['ネオ','リンネ','双子','双子']); // nothing created
  assert.equal(d.master.forms.length,3);
  assert.deepEqual(d.suits.map(s=>s.formId),['f-rinne']);
  assert.deepEqual(d.importIssues.map(x=>[x.characterName,x.reason]),[
    ['未登録キャラ','未登録のキャラ（自動では作成しません）'],['ネオ','進化形態の指定がありません（キャラ名だけでは紐づけません）'],
    ['ネオ','進化形態が一致しません（正式名・短縮名と完全一致のみ）'],['双子','同じ名前のキャラが複数あります']]);
  assert.match(await page.locator('#imIssues').textContent(),/取り込めなかった行（要確認・4件）/);
  // re-importing the same file does not pile up duplicate issues
  await page.fill('#imText','');await importJson(imp({entries:[{characterName:'未登録キャラ',formName:'獣神化',grade:'S'}]}));await click('[data-act="imApply"]');
  const issues=(await snapshot()).importIssues;assert.equal(issues.length,4);
  await click(`[data-act="issueDone"][data-id="${issues[0].id}"]`);assert.equal((await snapshot()).importIssues.length,3);
});

test('import: format errors (rank in GRADE, grade in RANK, bad source/stage/url, GAME_CLEAR not RANK) change nothing', async()=>{
  await seed(world({suits:[{id:'keep',stageKey:PARAISO,formId:'f-hello',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'VERIFIED'}]}));
  const before=await snapshot();
  const bad=[
    ['JSONとして読み取れません','{broken'],
    ['rank を入れられません',imp({entries:[{characterName:'ネオ',formName:'ハロー',grade:'S',rank:1}]})],
    ['grade を入れられません',imp({evaluationType:'RANK',entries:[{characterName:'ネオ',formName:'ハロー',rank:1,grade:'S'}]})],
    ['rank が必要です',imp({evaluationType:'RANK',entries:[{characterName:'ネオ',formName:'ハロー'}]})],
    ['source が不明です',imp({source:'GEMINI'})],
    ['ステージ（stageKey）が不明です',imp({stageKey:'破界の星墓::存在しない'})],
    ['sourceUrl は http',imp({sourceUrl:'javascript:alert(1)'})],
    ['evaluationType RANK（順位）だけです',imp({source:'GAME_CLEAR_MONSTERS'})],
    ['verificationStatus が不明です',imp({entries:[{characterName:'ネオ',formName:'ハロー',grade:'S',verificationStatus:'OK'}]})],
    ['rank は1〜20の整数です',imp({evaluationType:'RANK',entries:[{characterName:'ネオ',formName:'ハロー',rank:1.5}]})]];
  for(const [msg,text] of bad){
    await importJson(text);
    assert.match(await page.locator('#imResult').textContent(),new RegExp('取り込めません（何も変更していません）.*'+msg.replace(/[()（）]/g,'.'),'s'),msg);
    assert.equal(await page.locator('#imApply').isDisabled(),true);
  }
  // one bad block among good ones rejects the whole import
  await importJson(JSON.stringify([JSON.parse(imp({entries:[{characterName:'リンネ',formName:'リンネ（獣神化）',grade:'A'}]})),JSON.parse(imp({source:'GEMINI'}))]));
  assert.match(await page.locator('#imResult').textContent(),/2件目：source が不明です/);
  const after=await snapshot();delete after.ui;delete before.ui;assert.deepEqual(after,before);
});

test('import: re-import of the same source updates in place; VERIFIED value change becomes NEEDS_REVIEW; other sources kept separate', async()=>{
  await seed(world({suits:[
    {id:'v',stageKey:PARAISO,formId:'f-hello',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'VERIFIED'},
    {id:'old',stageKey:PARAISO,formId:'f-rinne',source:'GAMEWITH',evaluationType:'GRADE',grade:'B',verificationStatus:'VERIFIED'}]}));
  // GameWith now says A (not VERIFIED in the file) -> same record updated, marked NEEDS_REVIEW; リンネ not in file -> kept
  await importJson(imp({entries:[{characterName:'ネオ',formName:'ハロー',grade:'A'}]}));
  assert.match(await page.locator('#imResult').textContent(),/追加 0件／更新 1件.*含まれない同じ出典の既存適正 1件は削除しません.*「要確認」になります/s);
  await click('[data-act="imApply"]');
  let d=await snapshot();
  const v=d.suits.find(s=>s.id==='v');assert.deepEqual([v.grade,v.verificationStatus,d.suits.length],['A','NEEDS_REVIEW',2]);
  assert.equal(d.suits.find(s=>s.id==='old').grade,'B');
  // Altema and OTHER_SITE for the same form are separate records; GAME_CLEAR_MONSTERS via RANK only
  await page.fill('#imText','');await importJson(JSON.stringify([
    JSON.parse(imp({source:'ALTEMA',evaluationType:'RANK',entries:[{characterName:'ネオ',formName:'ハロー',rank:2}]})),
    JSON.parse(imp({source:'OTHER_SITE',site:'攻略X',evaluationType:'CANDIDATE',entries:[{characterName:'ネオ',formName:'ハロー'}]})),
    JSON.parse(imp({source:'OTHER_SITE',site:'攻略Y',evaluationType:'CANDIDATE',entries:[{characterName:'ネオ',formName:'ハロー'}]})),
    JSON.parse(imp({source:'GAME_CLEAR_MONSTERS',evaluationType:'RANK',sourceUrl:'',entries:[{characterName:'ネオ',formName:'ハロー',rank:7,verificationStatus:'VERIFIED'}]}))]));
  await click('[data-act="imApply"]');
  d=await snapshot();
  const hello=d.suits.filter(s=>s.formId==='f-hello').map(s=>[s.source,s.site,s.evaluationType,s.rank,s.grade,s.verificationStatus]).sort();
  assert.deepEqual(hello,[['ALTEMA','','RANK',2,'','UNVERIFIED'],['GAMEWITH','','GRADE',null,'A','NEEDS_REVIEW'],['GAME_CLEAR_MONSTERS','','RANK',7,'','VERIFIED'],
    ['OTHER_SITE','攻略X','CANDIDATE',null,'','UNVERIFIED'],['OTHER_SITE','攻略Y','CANDIDATE',null,'','UNVERIFIED']]);
  // VERIFIED re-import with the same values keeps VERIFIED and is "no change"
  await page.fill('#imText','');await importJson(imp({source:'GAME_CLEAR_MONSTERS',evaluationType:'RANK',sourceUrl:'',entries:[{characterName:'ネオ',formName:'ハロー',rank:7,verificationStatus:'VERIFIED'}]}));
  assert.match(await page.locator('#imResult').textContent(),/変更なし 1件/);
});

test('import: a failure while saving rolls back to the previous state', async()=>{
  await seed(world({suits:[{id:'keep',stageKey:PARAISO,formId:'f-rinne',source:'GAMEWITH',evaluationType:'GRADE',grade:'B',verificationStatus:'VERIFIED'}]}));
  const before=await snapshot();
  await importJson(imp({}));
  await page.evaluate(()=>{window.__origPersist=persist;persist=()=>{throw new Error('quota')}});
  await click('[data-act="imApply"]');
  await page.evaluate(()=>{persist=window.__origPersist});
  assert.match(await page.locator('#imMsg').textContent(),/取り込み前の状態に戻しました/);
  const after=await snapshot();assert.deepEqual([after.suits,after.importIssues],[before.suits,before.importIssues]);
  await page.reload();assert.deepEqual((await snapshot()).suits,before.suits);
});

test('320/390px: import panel, suitability modal and badges fit without horizontal scroll', async()=>{
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  await seed(world({suits:[
    {id:'a',stageKey:STAGE,formId:'f-hello',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'VERIFIED',sourceUrl:'https://example.com/a',sourceUpdatedAt:'2026-09-28'},
    {id:'b',stageKey:STAGE,formId:'f-rev',source:'ALTEMA',evaluationType:'RANK',rank:3,verificationStatus:'NEEDS_REVIEW'}],
    picks:{[STAGE]:{'メイン':'u4'}},ui:{infoMode:'all'}}));
  const fit=()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});
    await click('[data-act="view"][data-view="stage"]');assert.ok(await fit());
    await page.screenshot({path:path.join(__dirname,'artifacts',`v4-stage-${width}.png`),fullPage:true});
    await click('[data-act="suitEdit"][data-id="a"]');
    assert.ok(await page.evaluate(()=>{const el=document.querySelector('#suitModal .modal');return el.scrollWidth<=el.clientWidth}));
    await page.screenshot({path:path.join(__dirname,'artifacts',`v4-suit-modal-${width}.png`)});
    await click('#suitModal [data-act="close"]');
    await importJson(imp({entries:[{characterName:'未登録キャラ',formName:'とても長い進化形態名とても長い進化形態名',grade:'S'}]}));await click('[data-act="imApply"]');
    assert.ok(await fit());
    await page.screenshot({path:path.join(__dirname,'artifacts',`v4-admin-${width}.png`),fullPage:true});
    await click('[data-act="view"][data-view="chara"]');await click('[data-act="charaOpen"][data-id="c-neo"]');assert.ok(await fit());
    await click('[data-act="unitEdit"][data-id="u4"]');
    assert.ok(await page.evaluate(()=>{const el=document.querySelector('#unitModal .modal');return el.scrollWidth<=el.clientWidth}));
    for(const id of ['unFrName3','unFrGrade3','unFrKind3']){const r=await page.locator('#'+id).boundingBox();assert.ok(r.width>=40&&r.x>=0&&r.x+r.width<=width,id)}
    await page.screenshot({path:path.join(__dirname,'artifacts',`v4-unit-${width}.png`)});
    await click('#unitModal [data-act="close"]');await click('[data-act="charaOpen"][data-id="c-neo"]');
  }
});
