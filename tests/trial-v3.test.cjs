// New structure (character master / forms / owned units / stage suitability / stage picks) for the trial page.
// Same harness as trial-browser.test.cjs: NODE_PATH must point to a Node installation containing playwright;
// each test uses a new browser context on an ephemeral localhost origin; no user storage is touched.
const {test,before,after,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const {teamView,optionList,openTeam,closeTeam,choose}=require('./helpers/team.cjs');
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
// 候補（このステージの適正キャラ）。「キャラを選ぶ」画面を開いて読む（仮選択は除く）
const optionTexts=dev=>optionList(page,dev);
const devRow=dev=>page.locator(`.pickDev[data-dev="${dev}"]`);

// A seeded world: ネオ has two forms; main owns two ネオ units with different forms and fruits.
function world(extra={}){
  const f=(id,characterId,name,short,race,battleType,shotType)=>({id,characterId,name,short,race,battleType,shotType});
  return {characters:[],
    master:{characters:[{id:'c-luci',name:'ルシファー'},{id:'c-neo',name:'ネオ'},{id:'c-arthur',name:'アーサー'},{id:'c-rinne',name:'リンネ'},{id:'c-el',name:'エル'}],
      forms:[f('f-luci','c-luci','ルシファー（獣神化改）','獣神化改','魔族','スピード型','反射'),
        f('f-hello','c-neo','ハローワールド・モード','ハロー','亜人','スピード型','反射'),
        f('f-rev','c-neo','リバース・モード','リバース','魔人','パワー型','貫通'),
        f('f-arthur','c-arthur','アーサー（獣神化）','','聖騎士','バランス型','貫通'),
        f('f-rinne','c-rinne','リンネ（獣神化）','','亜人','砲撃型','貫通'),
        f('f-el','c-el','エル（獣神化）','','神','スピード型','反射')]},
    units:[
      {id:'u-luci',formId:'f-luci',device:'メイン',no:1,fruits:[{name:'同族加撃',grade:'特級L',kind:'同族'}],memo:''},
      {id:'u-neo1',formId:'f-hello',device:'メイン',no:1,fruits:[{name:'撃種加撃',grade:'特級L',kind:'撃種'},{name:'撃種加速撃',grade:'特級',kind:'撃種'},{name:'撃種加命撃',grade:'特級EL',kind:'撃種'}],memo:''},
      {id:'u-neo2',formId:'f-rev',device:'メイン',no:2,fruits:[{name:'速必殺',grade:'特級',kind:'その他'},{name:'将命削り',grade:'特級L',kind:'その他'},{name:'兵命削り',grade:'特級L',kind:'その他'}],memo:''},
      {id:'u-arthur',formId:'f-arthur',device:'メイン',no:1,fruits:[],memo:''},
      {id:'u-rinne',formId:'f-rinne',device:'サブ1',no:1,fruits:[],memo:''},
      {id:'u-neo-s1',formId:'f-rev',device:'サブ1',no:1,fruits:[],memo:''}],
    suits:[
      {id:'s1',stageKey:STAGE,formId:'f-luci',source:'GAME_CLEAR_MONSTERS',rank:1,verificationStatus:'VERIFIED'},
      {id:'s2',stageKey:STAGE,formId:'f-hello',source:'GAME_CLEAR_MONSTERS',rank:2,verificationStatus:'VERIFIED'},
      {id:'s3',stageKey:STAGE,formId:'f-rinne',source:'GAME_CLEAR_MONSTERS',rank:3,verificationStatus:'VERIFIED'},
      {id:'s4',stageKey:STAGE,formId:'f-el',source:'GAMEWITH',grade:'S',verificationStatus:'VERIFIED'}],
    ...extra};
}

test('UI: register character, two forms, two units on one device, suitability; candidates and reload',async()=>{
  await click('[data-act="view"][data-view="chara"]');
  await click('[data-act="mcharAdd"]');await page.fill('#mcName','ネオ');await click('[data-act="saveMChar"]');
  // 基本情報（種族・戦型・撃種）はキャラにつき1つ。進化形態は登録しない
  await click('[data-act="basicEdit"]');await page.selectOption('#fmRace','亜人');await page.selectOption('#fmBattle','スピード型');await page.selectOption('#fmShot','反射');await click('[data-act="saveForm"]');
  const charId=await page.evaluate(()=>db.master.characters[0].id);
  const units=[[null,['撃種加撃','撃種加速撃','撃種加命撃']],[null,['速必殺','将命削り','兵命削り']]];
  for(const [,fruits] of units){
    await click('[data-act="unitAdd"]');await page.selectOption('#unDevice','メイン');
    fruits.forEach(()=>{});for(let i=0;i<3;i++){await page.fill('#unFrName'+i,fruits[i]);await page.selectOption('#unFrGrade'+i,'特級L')}
    await click('[data-act="saveUnit"]');
  }
  let d=await snapshot();
  assert.deepEqual(d.master.characters.map(c=>c.name),['ネオ']);
  assert.deepEqual(d.master.forms.map(f=>[f.name,!!f.unknownForm,f.race,f.battleType,f.shotType]),[['',true,'亜人','スピード型','反射']],'one nameless form per character');
  assert.deepEqual(d.units.map(u=>[u.device,u.no,u.fruits.map(x=>x.name)]),[['メイン',1,['撃種加撃','撃種加速撃','撃種加命撃']],['メイン',2,['速必殺','将命削り','兵命削り']]]);
  // character view: device -> units with form and fruits
  const card=await page.locator('#charaList .card.open').textContent();
  assert.match(card,/メイン（2体）/);assert.match(card,/個体1/);assert.match(card,/個体2/);assert.match(card,/撃種加命撃/);assert.match(card,/亜人.*スピード型.*反射/);
  // suitability for the ハロー form only (GAME_CLEAR_MONSTERS, rank 2)
  await click('[data-act="view"][data-view="stage"]');
  assert.equal(await page.locator('.pickDev').count(),0);await click('[data-act="useDev"][data-dev="メイン"]');
  // 適正が未登録でも、この端末の所持キャラから仮選択はできる（候補は0）
  assert.deepEqual(await optionTexts('メイン'),['— 使う個体を選ぶ —'],'no suitability yet, but owned units can be chosen provisionally');
  await click('[data-act="suitAdd"]');await page.selectOption('#stForm',charId);await page.fill('#stRank','2');await click('[data-act="saveSuit"]');
  assert.deepEqual(await optionTexts('メイン'),['— 使う個体を選ぶ —','ネオ 個体1（未検証）','ネオ 個体2（未検証）'],'every unit of the character is a candidate');
  await click('[data-act="suitVerify"]');
  assert.deepEqual(await optionTexts('メイン'),['— 使う個体を選ぶ —','ネオ 個体1','ネオ 個体2']);
  assert.equal(await page.locator('.pickDev').count(),1); // only the chosen device is shown
  await page.reload();
  assert.deepEqual(await optionTexts('メイン'),['— 使う個体を選ぶ —','ネオ 個体1','ネオ 個体2']);
  d=await snapshot();assert.deepEqual(d.suits.map(s=>[s.stageKey,s.source,s.evaluationType,s.rank,s.grade,s.verificationStatus]),[[STAGE,'GAME_CLEAR_MONSTERS','RANK',2,'','VERIFIED']]);
  // character view lists the suitable stage
  await click('[data-act="view"][data-view="chara"]');assert.match(await page.locator('#charaList').textContent(),/禁忌 一ノ獄・みんなのクリアモンスター 2位/);
});

test('candidates: only owned AND suitable units per device, per-unit (not per-character), reasons when none',async()=>{
  await seed(world({useDevs:{'禁忌の獄::一ノ獄':['メイン','サブ1','サブ2'],'禁忌の獄::二ノ獄':['メイン']}}));
  // main owns ルシファー, ネオ×2 (ハロー suitable, リバース = same character, other confirmed form → candidate marked 別形態), アーサー (not suitable). エル is suitable but unowned.
  assert.deepEqual(await optionTexts('メイン'),['— 使う個体を選ぶ —','ネオ 個体1','ネオ 個体2','ルシファー 個体1']);
  assert.deepEqual(await optionTexts('サブ1'),['— 使う個体を選ぶ —','ネオ 個体1','リンネ 個体1']);
  assert.deepEqual(await optionTexts('サブ2'),['候補なし']);
  await openTeam(page,'サブ2');assert.match(await page.locator('#pkList').textContent(),/この端末にいるキャラがいません/);await closeTeam(page);
  assert.doesNotMatch(await devRow('メイン').textContent(),/候補\d/,'no candidate count on the card');
  // When リバース also becomes suitable (other source), main can choose between ネオ 個体1 and 個体2.
  await page.evaluate(()=>{db.suits.push(normSuit({id:'s5',stageKey:'禁忌の獄::一ノ獄',formId:'f-rev',source:'GAMEWITH',evaluationType:'GRADE',grade:'A',verificationStatus:'VERIFIED'}));persist();render()});
  assert.deepEqual(await optionTexts('メイン'),['— 使う個体を選ぶ —','ネオ 個体1','ネオ 個体2','ルシファー 個体1']);
  assert.deepEqual(await optionTexts('サブ1'),['— 使う個体を選ぶ —','ネオ 個体1','リンネ 個体1']);
  // another stage with no suitability
  await click('[data-act="stage"][data-stage="二ノ獄"]');
  // 候補は0だが、所持キャラから仮選択はできる（理由も表示）
  assert.deepEqual(await optionTexts('メイン'),['— 使う個体を選ぶ —']);
  await openTeam(page,'メイン');assert.match(await page.locator('#pkList').textContent(),/このステージの適正はまだ登録されていません.*その他の所持キャラ（仮選択）/);await closeTeam(page);
  // form ownership status helper (bright / dark+！ / dark) per device
  assert.deepEqual(await page.evaluate(()=>[formStatus('f-hello','メイン'),formStatus('f-hello','サブ1'),formStatus('f-hello','サブ2'),formStatus('f-el','メイン')]),['owned','owned','not-owned','not-owned']);
});

test('team card: shows the chosen character and its fruits only (no detail toggle); switching follows the chosen unit; picks persist and can be removed',async()=>{
  await seed(world({suits:[...world().suits,{id:'s5',stageKey:STAGE,formId:'f-rev',source:'GAMEWITH',grade:'A',verificationStatus:'VERIFIED'}],useDevs:{[STAGE]:['メイン','サブ1']}}));
  assert.equal(await page.locator('[data-act="infoMode"], #infoBar').count(),0,'no detail toggle');
  await choose(page,'メイン','u-neo1');
  const cur=()=>devRow('メイン').locator('.pickCur').textContent();
  assert.match(await cur(),/ネオ\s*個体1/);assert.match(await cur(),/撃種加撃L.*撃種加速撃特.*撃種加命撃EL/);assert.doesNotMatch(await cur(),/亜人|スピード型|反射/);
  await choose(page,'メイン','u-neo2');assert.match(await cur(),/ネオ\s*個体2/);assert.match(await cur(),/速必殺特.*将命削りL.*兵命削りL/);
  await page.reload();
  assert.equal((await teamView(page,'メイン')).sel,'u-neo2');assert.equal((await teamView(page,'サブ1')).sel,'');
  assert.deepEqual((await snapshot()).picks,{[STAGE]:{'メイン':'u-neo2'}});
  await choose(page,'メイン','');assert.deepEqual((await snapshot()).picks,{});
});

test('stage suitability: sources kept separate, ranks and grades never converted, validation, duplicates rejected',async()=>{
  await seed(world());
  const panel=await page.locator('#suitPanel').textContent();
  assert.match(panel,/みんなのクリアモンスター・ゲーム内の順位.*1位.*2位.*3位/s);assert.match(panel,/GameWith.*エルランク S/s);assert.doesNotMatch(panel,/表記：/);
  // GameWith "S" stays a grade (no rank invented); GAME_CLEAR_MONSTERS requires a rank 1..20
  let s=(await snapshot()).suits.find(x=>x.id==='s4');assert.equal(s.grade,'S');assert.equal(s.rank,null);assert.equal(s.evaluationType,'GRADE');
  await click('[data-act="suitAdd"]');await page.selectOption('#stForm','c-neo');
  assert.equal(await page.locator('#stGradeField').isVisible(),false);assert.equal(await page.locator('#stEval').isDisabled(),true);
  await click('[data-act="saveSuit"]');assert.match(await page.locator('#stMsg').textContent(),/順位を入力/);
  await page.fill('#stRank','25');await click('[data-act="saveSuit"]');assert.match(await page.locator('#stMsg').textContent(),/1〜20/);
  await page.selectOption('#stSource','OTHER_SITE');assert.equal(await page.locator('#stSiteField').isVisible(),true);
  await page.selectOption('#stEval','GRADE');assert.equal(await page.locator('#stRankField').isVisible(),false);
  await page.fill('#stGrade','B+');await page.fill('#stSite','攻略サイトX');await click('[data-act="saveSuit"]');
  s=(await snapshot()).suits.find(x=>x.site==='攻略サイトX');assert.deepEqual([s.source,s.evaluationType,s.rank,s.grade,s.site],['OTHER_SITE','GRADE',null,'B+','攻略サイトX']);assert.equal((await snapshot()).master.forms.find(f=>f.id===s.formId).characterId,'c-neo');
  // duplicate (same stage, form and source) is refused
  await click('[data-act="suitAdd"]');await page.selectOption('#stForm','c-neo');await page.fill('#stRank','5');await click('[data-act="saveSuit"]');
  assert.match(await page.locator('#stMsg').textContent(),/既にあります/);await click('#suitModal [data-act="close"]');
  assert.equal((await snapshot()).suits.filter(x=>x.formId==='f-hello'&&x.source==='GAME_CLEAR_MONSTERS').length,1);
  // ownership marks per device: main owns ハロー, サブ1 owns only another ネオ form (！)
  assert.match(await page.locator('#suitPanel').textContent(),/ネオ2位.*所持：メイン×2 サブ1×1/s);
});

test('stale pick after suitability removal is shown as 候補外, not silently changed',async()=>{
  await seed(world({picks:{[STAGE]:{'メイン':'u-neo1'}}}));
  assert.equal((await teamView(page,'メイン')).sel,'u-neo1');
  await click('[data-act="suitEdit"][data-id="s2"]');await click('[data-act="deleteSuit"]');
  // 所持はしているので、自動で外さず「仮選択・適正未確定」として残す（適正は作らない）
  assert.match(await devRow('メイン').textContent(),/仮選択（このステージの適正は未登録）/);const v=await teamView(page,'メイン');assert.equal(v.sel,'u-neo1');
  assert.ok(v.groups[0][1].includes('ネオ 個体1（仮）'));
  assert.equal((await snapshot()).picks[STAGE]['メイン'],'u-neo1');assert.equal((await snapshot()).suits.some(s=>s.formId==='f-hello'),false);
  assert.deepEqual(await optionTexts('メイン'),['— 使う個体を選ぶ —','ルシファー 個体1']);
});

test('old data: read without writes, nothing auto-converted, explicit migration keeps old data and records 要確認',async()=>{
  const old={characters:[{id:'legacy',name:'旧登録',device:'サブ2',count:1,memo:'',stages:[STAGE]}],
    rankings:{[STAGE]:{entries:[{rank:2,name:'ネオ',race:'亜人'},{rank:3,name:'リンネ'},{rank:4,name:'未知キャラ'}]}},
    ownership:{[STAGE]:{
      'メイン':{ranks:{2:{status:'owned',count:3,wakuwaku:['撃種加撃','撃種加速撃','撃種加命撃','4つ目'].map(name=>({name,grade:'特級L'}))}}},
      'サブ1':{ranks:{2:{status:'alt-form',count:1}}}}}};
  await seed(old);
  assert.equal(await page.evaluate(()=>storageAccess.some(([m])=>m==='setItem')),false);
  const before=await snapshot();
  assert.deepEqual([before.master.characters,before.units,before.suits],[[],[],[]]);
  // stage screen still shows the legacy registered character inside the device row, and TOP10 still works
  assert.match(await page.locator('#legacyStage').textContent(),/サブ2.*旧登録/s);assert.equal(await page.locator('.tGrid .tile').count(),10);
  await click('[data-act="view"][data-view="admin"]');
  assert.match(await page.locator('#migCount').textContent(),/未変換・要確認 3件／全3件/);
  assert.match(await page.locator('#migList').textContent(),/「ネオ」のキャラ・進化形態が未登録です/);
  // register the form, then migrate rank 2 explicitly
  await page.evaluate(()=>{db.master.characters.push({id:'c-neo',name:'ネオ'});db.master.forms.push({id:'f-hello',characterId:'c-neo',name:'ハローワールド・モード',short:'ハロー',race:'',battleType:'',shotType:''});persist();render()});
  const id=STAGE+'#2';
  await click(`[data-act="migrate"][data-id="${id}"]`);assert.match(await page.locator('#migMsg').textContent(),/進化形態と出典を選んでください/);
  await page.selectOption(`[data-mig-form="${id}"]`,'f-hello');await page.selectOption(`[data-mig-src="${id}"]`,'GAME_CLEAR_MONSTERS');
  await click(`[data-act="migrate"][data-id="${id}"]`);
  const d=await snapshot();
  assert.deepEqual(d.suits.map(s=>[s.stageKey,s.formId,s.source,s.evaluationType,s.rank,s.verificationStatus]),[[STAGE,'f-hello','GAME_CLEAR_MONSTERS','RANK',2,'UNVERIFIED']]);
  // 進化形態は区別しない：旧データの「別形態で所持」（サブ1）も所持として個体を作る
  assert.deepEqual(d.units.map(u=>[u.device,u.formId,u.no,u.fruits.map(x=>x.name)]),[['メイン','f-hello',1,['撃種加撃','撃種加速撃','撃種加命撃','4つ目']],['サブ1','f-hello',1,[]]]);
  assert.equal(d.migrated[id].units,2);
  assert.deepEqual(d.migrated[id].pending,['メイン：旧所持数3体のうち1体だけ作成']);
  // old structures untouched; form basic info not guessed from the old rank entry
  assert.deepEqual([d.rankings,d.ownership,d.characters],[before.rankings,before.ownership,before.characters]);
  assert.equal(d.master.forms[0].race,'');
  assert.match(await page.locator('#migCount').textContent(),/未変換・要確認 2件／全3件/);
  assert.match(await page.locator('#migList').textContent(),/取り込み済み：ネオ/);
  // the migrated unit is now selectable on the stage screen
  await click('[data-act="view"][data-view="stage"]');await click('[data-act="useDev"][data-dev="メイン"]');
  assert.deepEqual(await optionTexts('メイン'),['— 使う個体を選ぶ —','ネオ 個体1（未検証）']);
});

test('backup/restore keeps the new structure; old backups restore with empty new structure; orphans kept',async()=>{
  await seed(world({picks:{[STAGE]:{'メイン':'u-neo1'}},units:[...world().units,{id:'u-orphan',formId:'f-missing',device:'サブ3',no:1,fruits:[{name:'孤立実'}]}]}));
  const json=await page.evaluate(()=>backupJson());const exported=JSON.parse(json);
  for(const f of ['master','units','suits','picks','migrated'])assert.ok(Object.hasOwn(exported.data,f),f);
  await seed({characters:[]});await click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',json);await click('[data-act="restore"]');
  const d=await snapshot();assert.equal(d.units.length,7);assert.equal(d.master.forms.length,6);assert.deepEqual(d.picks,{[STAGE]:{'メイン':'u-neo1'}});
  // orphan unit (form missing) is kept and flagged, not dropped
  await click('[data-act="view"][data-view="chara"]');assert.match(await page.locator('#charaWarn').textContent(),/参照先が見つからないデータが1件/);
  // old backup without the new fields
  for(const f of ['master','units','suits','picks','migrated'])delete exported.data[f];
  await click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',JSON.stringify(exported));await click('[data-act="restore"]');
  const o=await snapshot();assert.deepEqual([o.master,o.units,o.suits,o.picks],[{characters:[],forms:[]},[],[],{}]);
});

test('320/390px: stage team cards, character view, unit modal fit without horizontal scroll',async()=>{
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  await seed(world({picks:{[STAGE]:{'メイン':'u-neo1','サブ1':'u-rinne'}}}));
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});
    await click('[data-act="view"][data-view="stage"]');
    const fit=()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
    assert.ok(await fit());
    const sel=await devRow('メイン').locator('[data-act="openPicker"]').boundingBox();assert.ok(sel.height>=44&&sel.x+sel.width<=width);
    await page.screenshot({path:path.join(__dirname,'artifacts',`v3-stage-${width}.png`),fullPage:true});
    await click('[data-act="view"][data-view="chara"]');await click('[data-act="charaOpen"][data-id="c-neo"]');assert.ok(await fit());
    await page.screenshot({path:path.join(__dirname,'artifacts',`v3-chara-${width}.png`),fullPage:true});
    await click('[data-act="unitEdit"][data-id="u-neo1"]');
    const m=await page.evaluate(()=>{const el=document.querySelector('#unitModal .modal');return el.scrollWidth<=el.clientWidth});assert.ok(m);
    for(const id of ['unFrName0','unFrGrade0','unFrKind0']){const r=await page.locator('#'+id).boundingBox();assert.ok(r.width>=40&&r.x>=0&&r.x+r.width<=width,id)}
    await click('#unitModal [data-act="close"]');await click('[data-act="charaOpen"][data-id="c-neo"]');
  }
});

test('unit edit: fruits up to 3, kinds kept, unit number auto per device+character, form change keeps unit',async()=>{
  await seed(world());
  await click('[data-act="view"][data-view="chara"]');await click('[data-act="charaOpen"][data-id="c-neo"]');
  await click('[data-act="unitAdd"][data-id="c-neo"]');await page.selectOption('#unDevice','メイン');
  assert.equal(await page.locator('#unNo').inputValue(),'3'); // ネオ already has 個体1/2 on メイン
  await page.selectOption('#unDevice','サブ2');assert.equal(await page.locator('#unNo').inputValue(),'1');
  assert.equal(await page.locator('#unFruits .frRow').count(),4);assert.equal(await page.locator('#unFruits .frRow:visible').count(),3);
  await page.fill('#unFrName0','同族加命撃');await page.selectOption('#unFrKind0','同族');await click('[data-act="saveUnit"]');
  let u=(await snapshot()).units.at(-1);assert.deepEqual([u.device,u.no,u.fruits],['サブ2',1,[{name:'同族加命撃',grade:'',kind:'同族'}]]);
  // 個体の編集では形態を変えない（既存の形態のまま）
  await click('[data-act="unitEdit"][data-id="u-neo1"]');await page.fill('#unMemo','架空メモ');await click('[data-act="saveUnit"]');
  u=(await snapshot()).units.find(x=>x.id==='u-neo1');assert.deepEqual([u.formId,u.no,u.fruits.length,u.memo],['f-hello',1,3,'架空メモ']);
  assert.equal(await page.evaluate(()=>normFruits(Array.from({length:5},(_,i)=>({name:'実'+i}))).length),4);
});
