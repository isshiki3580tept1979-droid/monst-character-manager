// Round 4: the stage screen's "＋ キャラ登録" opens the new registration flow
// (master.characters -> master.forms -> units -> suits) with the current stage as context.
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
const STAGE='禁忌の獄::一ノ獄';
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
const pickSel=dev=>page.locator(`.pickSel[data-pick-dev="${dev}"]`);
const legacy={id:'legacy-1',name:'旧キャラ',device:'サブ2',count:1,memo:'旧メモ',stages:[STAGE]};
const neo={characters:[{id:'c-neo',name:'ネオ'}],forms:[{id:'f-hello',characterId:'c-neo',name:'ハローワールド・モード',short:'ハロー',race:'亜人',battleType:'砲撃型',shotType:'貫通'}]};
// 進化形態名は折りたたみ（任意）になったので、このファイルの入力テストでは開いてから入力する
async function openReg(){await click('[data-act="quickReg"]');await page.locator('#qrModal.open').waitFor();await page.evaluate(()=>{document.getElementById('qrFormNameMore').open=true})}
async function fillFruits(list){for(let i=0;i<list.length;i++){const [n,g,k]=list[i];await page.fill('#qrFrName'+i,n);if(g)await page.selectOption('#qrFrGrade'+i,g);if(k)await page.selectOption('#qrFrKind'+i,k)}}

test('stage "＋ キャラ登録" opens the new flow (not the old characters[] form) with the stage as context', async()=>{
  await seed({characters:[legacy],useDevs:{[STAGE]:['メイン','サブ1']}});
  assert.equal(await page.locator('[data-act="add"]').count(),0);
  await openReg();
  assert.equal(await page.locator('#charModal').evaluate(m=>m.classList.contains('open')),false);
  assert.match(await page.locator('#qrStageNote').textContent(),/禁忌の獄・一ノ獄/);
  assert.match(await page.locator('#qrSuitLabel').textContent(),/一ノ獄の適正として登録する/);
  // sections in order: キャラ → 進化形態 → 所持端末 → わくわくの実（4 rows） → このステージの適正
  assert.deepEqual(await page.locator('#qrModal legend').allTextContents(),['1. キャラ','2. 種族・戦型・撃種（進化形態は任意）','3. 所持端末','4. わくわくの実（最大4つ）','5. このステージの適正']);
  assert.equal(await page.locator('#qrFruits .frRow:visible').count(),4);
  // defaults: new character, first chosen device without a pick, own-judgment suitability (MANUAL / 候補 / 確認済み)
  assert.deepEqual([await page.inputValue('#qrChar'),await page.inputValue('#qrDevice'),await page.inputValue('#qrSource'),await page.inputValue('#qrEval'),await page.inputValue('#qrVerify')],
    ['__new__','メイン','MANUAL','CANDIDATE','VERIFIED']);
  // cancel writes nothing
  const before=await snapshot();await click('#qrModal [data-act="close"]');
  const after=await snapshot();assert.deepEqual([after.master,after.units,after.suits,after.characters],[before.master,before.units,before.suits,before.characters]);
});

test('new character + new form + unit with 4 fruits + this stage suitability, then candidate appears immediately', async()=>{
  await seed({characters:[legacy],useDevs:{[STAGE]:['メイン','サブ1']}});
  assert.equal(await pickSel('サブ1').isDisabled(),true);
  const legacyBefore=(await snapshot()).characters;
  await openReg();
  await page.fill('#qrCharName','ネオ');
  await page.fill('#qrFormName','ハローワールド・モード');await page.fill('#qrFormShort','ハロー');
  await page.selectOption('#qrRace','亜人');await page.selectOption('#qrBattle','砲撃型');await page.selectOption('#qrShot','貫通');
  await page.selectOption('#qrDevice','サブ1');assert.equal(await page.inputValue('#qrNo'),'1');
  await fillFruits([['同族の絆・加撃','特級L','同族'],['同族の絆・加撃速','特級L','同族'],['同族の絆・加命撃','特級EL','同族'],['将命削り','特級M','その他']]);
  await click('[data-act="qrSave"]');
  assert.equal(await page.locator('#qrModal').evaluate(m=>m.classList.contains('open')),false);
  const d=await snapshot();
  assert.deepEqual(d.master.characters.map(c=>c.name),['ネオ']);
  assert.deepEqual(d.master.forms.map(f=>[f.name,f.short,f.race,f.battleType,f.shotType]),[['ハローワールド・モード','ハロー','亜人','砲撃型','貫通']]);
  assert.deepEqual(d.units.map(u=>[u.device,u.no,u.fruits.map(x=>x.name)]),[['サブ1',1,['同族の絆・加撃','同族の絆・加撃速','同族の絆・加命撃','将命削り']]]);
  assert.deepEqual(d.suits.map(s=>[s.stageKey,s.source,s.evaluationType,s.rank,s.grade,s.verificationStatus]),[[STAGE,'MANUAL','CANDIDATE',null,'','VERIFIED']]);
  assert.deepEqual(d.characters,legacyBefore); // old characters[] untouched, nothing added there
  // immediately selectable in ② サブ1, without the 未検証 marker (own judgment = 確認済み)
  assert.deepEqual(await pickSel('サブ1').locator('option').allTextContents(),['— 使う個体を選ぶ —','ネオ｜ハロー 個体1']);
  assert.match(await page.locator('#devPickMsg').textContent(),/ネオ｜ハロー 個体1を登録しました。② サブ1の候補に追加されました/);
  await pickSel('サブ1').selectOption({index:1});
  const card=page.locator('.pickDev[data-dev="サブ1"] .uCard');
  assert.deepEqual(await card.locator('.uL3:not(.uL4) .frS').allTextContents(),['同族加撃L','同族加撃速L','同族加命撃EL']);
  assert.deepEqual(await card.locator('.uL4 .frS').allTextContents(),['将命削りM']);
  // the suitability is listed under its own source, apart from game / site data
  assert.match(await page.locator('#suitPanel').textContent(),/自分で登録/);
  await page.reload();assert.equal((await snapshot()).units.length,1);
});

test('existing character: existing form adds another unit (number auto), new form also possible; no duplicates', async()=>{
  await seed({characters:[],master:neo,units:[{id:'u1',formId:'f-hello',device:'メイン',no:1,fruits:[]}],
    suits:[{id:'s1',stageKey:STAGE,formId:'f-hello',source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'}],useDevs:{[STAGE]:['メイン']}});
  await openReg();
  await page.selectOption('#qrChar','c-neo');
  assert.equal(await page.inputValue('#qrForm'),'f-hello');assert.equal(await page.locator('#qrFormNew').isVisible(),false);
  assert.match(await page.locator('#qrFormInfo').textContent(),/亜人　砲撃型　貫通/);
  await page.selectOption('#qrDevice','メイン');assert.equal(await page.inputValue('#qrNo'),'2');
  await click('[data-act="qrSave"]');
  let d=await snapshot();
  assert.equal(d.master.characters.length,1);assert.equal(d.master.forms.length,1);assert.equal(d.suits.length,1); // same MANUAL suitability reused
  assert.deepEqual(d.units.map(u=>[u.device,u.no]),[['メイン',1],['メイン',2]]);
  assert.deepEqual(await pickSel('メイン').locator('option').allTextContents(),['— 使う個体を選ぶ —','ネオ｜ハロー 個体1','ネオ｜ハロー 個体2']);
  assert.match(await page.locator('#devPickMsg').textContent(),/登録済みのため、そのまま使います/);
  // new form for the same character on another device; unit number continues per device + character
  await openReg();await page.selectOption('#qrChar','c-neo');await page.selectOption('#qrForm','__new__');
  await page.fill('#qrFormName','リバース・モード');await page.fill('#qrFormShort','リバース');await page.selectOption('#qrDevice','メイン');
  assert.equal(await page.inputValue('#qrNo'),'3');
  await click('[data-act="qrSave"]');
  d=await snapshot();
  assert.deepEqual(d.master.forms.map(f=>f.name),['ハローワールド・モード','リバース・モード']);
  assert.equal(d.units.at(-1).no,3);
  // a duplicate form name for the same character is refused
  await openReg();await page.selectOption('#qrChar','c-neo');await page.selectOption('#qrForm','__new__');await page.fill('#qrFormName','リバース・モード');
  const before=await snapshot();await click('[data-act="qrSave"]');
  assert.match(await page.locator('#qrMsg').textContent(),/同じ名前の進化形態が既にあります/);assert.deepEqual(await snapshot(),before);
});

test('validation errors write nothing: missing names, duplicate character, rank/grade rules per source', async()=>{
  await seed({characters:[],master:neo,useDevs:{[STAGE]:['メイン']}});
  const before=await snapshot();
  const tryErr=async(prep,msg)=>{await openReg();await prep();await click('[data-act="qrSave"]');
    assert.match(await page.locator('#qrMsg').textContent(),msg);await click('#qrModal [data-act="close"]');assert.deepEqual(await snapshot(),before)};
  await tryErr(async()=>{},/キャラ名を入力してください/);
  await tryErr(async()=>{await page.fill('#qrCharName','ネオ')},/同じ名前のキャラが既にあります/);
  // 進化形態名は任意（空欄なら「進化形態未確認」）になったので、空欄はエラーにならず次の検証へ進む
  await tryErr(async()=>{await page.fill('#qrCharName','新キャラ');await page.selectOption('#qrSource','OTHER_SITE')},/サイト名を入力してください/);
  await tryErr(async()=>{await page.fill('#qrCharName','新キャラ');await page.fill('#qrFormName','獣神化');await page.selectOption('#qrSource','GAME_CLEAR_MONSTERS')},/順位を入力してください/);
  await tryErr(async()=>{await page.fill('#qrCharName','新キャラ');await page.fill('#qrFormName','獣神化');await page.selectOption('#qrSource','GAMEWITH');await page.selectOption('#qrEval','GRADE')},/ランク（S\/A\/B など）を入力してください/);
  await tryErr(async()=>{await page.fill('#qrCharName','新キャラ');await page.fill('#qrFormName','獣神化');await page.selectOption('#qrSource','OTHER_SITE')},/サイト名を入力してください/);
  // GAME_CLEAR_MONSTERS is RANK only (the evaluation select is locked)
  await openReg();await page.selectOption('#qrSource','GAME_CLEAR_MONSTERS');
  assert.equal(await page.inputValue('#qrEval'),'RANK');assert.equal(await page.locator('#qrEval').isDisabled(),true);
  assert.equal(await page.locator('#qrRankField').isVisible(),true);assert.equal(await page.locator('#qrGradeField').isVisible(),false);
});

test('source / rank / grade / verification kept as entered; unverified shows （未検証）; without suitability it is not a candidate', async()=>{
  await seed({characters:[],master:neo,useDevs:{[STAGE]:['メイン','サブ1']}});
  // GameWith grade S, left unverified
  await openReg();await page.selectOption('#qrChar','c-neo');await page.selectOption('#qrDevice','メイン');
  await page.selectOption('#qrSource','GAMEWITH');await page.selectOption('#qrEval','GRADE');await page.fill('#qrGrade','S');await page.selectOption('#qrVerify','UNVERIFIED');
  await click('[data-act="qrSave"]');
  let s=(await snapshot()).suits[0];assert.deepEqual([s.source,s.evaluationType,s.rank,s.grade,s.verificationStatus],['GAMEWITH','GRADE',null,'S','UNVERIFIED']);
  assert.deepEqual(await pickSel('メイン').locator('option').allTextContents(),['— 使う個体を選ぶ —','ネオ｜ハロー 個体1（未検証）']);
  // GAME_CLEAR_MONSTERS rank 3 for another character: the rank is stored as a rank
  await openReg();await page.fill('#qrCharName','リンネ');await page.fill('#qrFormName','リンネ（獣神化）');await page.selectOption('#qrDevice','サブ1');
  await page.selectOption('#qrSource','GAME_CLEAR_MONSTERS');await page.fill('#qrRank','3');await click('[data-act="qrSave"]');
  s=(await snapshot()).suits.find(x=>x.source==='GAME_CLEAR_MONSTERS');assert.deepEqual([s.evaluationType,s.rank,s.grade],['RANK',3,'']);
  // without the stage suitability: unit saved, not a candidate, message says why
  await openReg();await page.fill('#qrCharName','ヤクモ');await page.fill('#qrFormName','大荒神武装');await page.selectOption('#qrDevice','サブ1');
  await page.uncheck('#qrSuitOn');assert.equal(await page.locator('#qrSuitFields').isVisible(),false);await click('[data-act="qrSave"]');
  const d=await snapshot();assert.equal(d.units.length,3);assert.equal(d.suits.length,2);
  assert.match(await page.locator('#devPickMsg').textContent(),/このステージの適正が無いため、候補には出ません（「所持キャラ」から仮選択はできます）/);
  assert.equal((await pickSel('サブ1').locator(':scope > option').allTextContents()).some(t=>t.includes('ヤクモ')),false);
  assert.deepEqual((await pickSel('サブ1').locator('optgroup option').allTextContents()).filter(t=>t.includes('ヤクモ')),['ヤクモ｜大荒神武装 個体1（仮）']);
  // device not among this stage's chosen devices: saved, message points to the checkbox
  await openReg();await page.selectOption('#qrChar',{label:'リンネ'});await page.selectOption('#qrDevice','サブ4');await page.selectOption('#qrSource','MANUAL');await click('[data-act="qrSave"]');
  assert.match(await page.locator('#devPickMsg').textContent(),/サブ4は今回使う端末に入っていません/);
  await click('[data-act="useDev"][data-dev="サブ4"]');
  assert.deepEqual(await pickSel('サブ4').locator('option').allTextContents(),['— 使う個体を選ぶ —','リンネ｜リンネ（獣神化） 個体1']);
});

test('old characters[] stay readable/editable in their own places and are never converted', async()=>{
  await seed({characters:[legacy],useDevs:{[STAGE]:['メイン']}});
  assert.match(await page.locator('#legacyStage').textContent(),/旧キャラ/);
  await click('[data-act="view"][data-view="search"]');await page.fill('#searchInput','旧メモ');assert.equal(await page.locator('#searchResults .card').count(),1);
  await click('#searchResults [data-act="edit"]');await page.fill('#cName','旧キャラ改');await click('[data-act="saveChar"]');
  const d=await snapshot();assert.equal(d.characters[0].name,'旧キャラ改');assert.deepEqual([d.master.characters,d.units,d.suits],[[],[],[]]);
  // the import of external data still refuses the MANUAL source
  await click('[data-act="view"][data-view="admin"]');
  await page.fill('#imText',JSON.stringify({stageKey:STAGE,source:'MANUAL',evaluationType:'CANDIDATE',entries:[{characterName:'x',formName:'y'}]}));
  await click('[data-act="imPreview"]');assert.match(await page.locator('#imResult').textContent(),/source が不明です/);
});

test('320/390px: registration screen fits, controls are usable, no horizontal scroll; screenshots', async()=>{
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  await seed({characters:[],master:neo,useDevs:{[STAGE]:['メイン','サブ1']}});
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});await openReg();
    const m=await page.evaluate(()=>{const el=document.querySelector('#qrModal .modal');return el.scrollWidth<=el.clientWidth});assert.ok(m,'modal no horizontal scroll');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    for(const id of ['qrChar','qrCharName','qrFormName','qrDevice','qrNo','qrFrName3','qrFrGrade3','qrFrKind3','qrSource','qrEval','qrVerify']){
      const r=await page.locator('#'+id).boundingBox();assert.ok(r&&r.width>=40&&r.x>=0&&r.x+r.width<=width,id);
    }
    const cb=await page.locator('#qrSuitOn').boundingBox();assert.ok(cb.width>=20&&cb.height>=20);
    await page.screenshot({path:path.join(__dirname,'artifacts',`v6-register-${width}.png`)});
    await page.locator('#qrModal .modal').evaluate(e=>{e.scrollTop=e.scrollHeight});
    await page.screenshot({path:path.join(__dirname,'artifacts',`v6-register-bottom-${width}.png`)});
    await click('#qrModal [data-act="close"]');
  }
});
