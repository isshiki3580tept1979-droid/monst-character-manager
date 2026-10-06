// Round 6: inventory (所持データ) JSON import — preview → classify → import, using the real staging file
// tests/fixtures/hakai_main_staging_2026-10-07.json. Same harness as trial-browser.test.cjs.
const {test,before,after,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const source=path.resolve(process.env.TRIAL_HTML_SOURCE||path.join(__dirname,'..','monst_character_manager_trial.html'));
const STAGING=fs.readFileSync(path.join(__dirname,'fixtures','hakai_main_staging_2026-10-07.json'),'utf8');
const KEY='monst-character-manager-trial-v2';
const protectedKeys=['monst-character-manager-v2','monst-character-manager-v1','monst-character-manager-device-names-v1','monst-character-manager-trial-v1'];
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
async function preview(text=STAGING){await click('[data-act="view"][data-view="admin"]');await page.fill('#invText',text);await click('[data-act="invPreview"]')}
const counts=()=>page.locator('.invSum div b').allTextContents();
const staging=()=>JSON.parse(STAGING);
const formByName=(d,c,f)=>{const ch=d.master.characters.find(x=>x.name===c);return d.master.forms.find(x=>x.characterId===ch?.id&&x.name===f)};
const unitsOf=(d,c)=>{const ids=new Set(d.master.forms.filter(f=>d.master.characters.find(x=>x.id===f.characterId)?.name===c).map(f=>f.id));return d.units.filter(u=>ids.has(u.formId))};

test('preview of the staging file: classified, nothing saved until 取り込む', async()=>{
  assert.equal(await page.locator('#invApply').isDisabled(),true);
  await preview();
  assert.deepEqual(await counts(),['2','9','0','1']); // 取り込み可能 / 要確認 / 矛盾 / 取り込み不可
  const text=(await page.locator('#invResult').textContent()).split('\n').map(x=>x.trim()).join('');
  assert.match(text,/個体 12件・所持確認 22件（所持 11・別形態 0・未所持 11・要確認 0）/);
  assert.match(text,/このJSONから適正（ステージ適正）は作りません/);
  assert.match(text,/✅ 取り込み可能（2件）.*春野サクラ｜戦場に咲く豪拳.*自来也｜ガマ仙人.*亜人 \/ 超バランス型 \/ 反射・実3個・No\.9244/s);
  assert.match(text,/⚠ 要確認.*乙骨憂太｜現代の異能.*未取得：種族・戦型・撃種/s);
  assert.match(text,/❌ 取り込み不可（1件）チェンソーマン＆ビーム｜（進化形態なし）.*進化形態名が空/s);
  assert.equal(await page.locator('#invApply').isDisabled(),false);
  const d=await snapshot();
  assert.deepEqual([d.master.characters,d.master.forms,d.units,d.suits,d.ownershipChecks],[[],[],[],[],[]]);
});

test('import: VERIFIED and NEEDS_REVIEW units kept, missing items not guessed, ニケ 2 units, NOT_OWNED kept, no suits', async()=>{
  await preview();await click('[data-act="invApply"]');
  assert.match(await page.locator('#invMsg').textContent(),/取り込み可能 2件・要確認 9件・所持確認 22件。矛盾 0件と取り込み不可 1件は取り込んでいません/);
  const d=await snapshot();
  assert.equal(d.master.characters.length,10);assert.equal(d.master.forms.length,11);assert.equal(d.units.length,11);
  assert.equal(d.suits.length,0,'no suitability created from this JSON');
  // VERIFIED: 自来也 complete (超バランス型 kept)
  const jira=formByName(d,'自来也','ガマ仙人');
  assert.deepEqual([jira.monsterNo,jira.race,jira.battleType,jira.shotType,jira.fullDisplayName],['9244','亜人','超バランス型','反射','ガマ仙人 自来也']);
  const ju=unitsOf(d,'自来也')[0];
  assert.deepEqual([ju.device,ju.no,ju.verificationStatus,ju.importSource],['メイン',1,'VERIFIED','monst-hakai-main-staging-v1']);
  assert.deepEqual(ju.fruits.map(x=>[x.name,x.grade]),[['同族の絆・加命撃','特級EL'],['スコア稼ぎの力','特級L'],['将命削りの力','特級M']]);
  // VERIFIED with no fruits
  const sakura=unitsOf(d,'春野サクラ')[0];assert.deepEqual([sakura.fruits,sakura.verificationStatus],[[],'VERIFIED']);
  // NEEDS_REVIEW: confirmed parts kept, missing type info left blank (not guessed)
  const ok=formByName(d,'乙骨憂太','現代の異能');
  assert.deepEqual([ok.monsterNo,ok.race,ok.battleType,ok.shotType],['9317','','','']);
  const ou=unitsOf(d,'乙骨憂太')[0];
  assert.deepEqual([ou.verificationStatus,ou.fruits.map(x=>x.name+'/'+x.grade)],['NEEDS_REVIEW',['撃種の絆・加命撃/特級EL','撃種の絆・加撃速/特級EL','撃種の絆・加撃/特級EL']]);
  const kove=formByName(d,'マスター・コーヴ','死闘に挑む森羅万象流武術師範');assert.deepEqual([kove.monsterNo,kove.race],['9063','']);
  assert.deepEqual(unitsOf(d,'マスター・コーヴ')[0].fruits.map(x=>x.name),['戦型の絆・加命撃','戦型の絆・加撃速','戦型の絆・加撃']);
  // names are kept exactly as written (no merging of 表記揺れ)
  assert.ok(d.master.characters.some(c=>c.name==='sinギルティ'));assert.ok(!d.master.characters.some(c=>c.name==='ギルティ'));
  assert.ok(formByName(d,'物干し竿','巌流の斬妻を支えし大学物干し竿'));
  assert.equal(unitsOf(d,'めぐみん')[0].fruits[0].name,'撃種の絆・加速'); // kept as written
  // ニケ: two separate units of different forms
  const nike=unitsOf(d,'ニケ').sort((a,b)=>a.no-b.no);
  assert.deepEqual(nike.map(u=>[u.no,d.master.forms.find(f=>f.id===u.formId).name,d.master.forms.find(f=>f.id===u.formId).monsterNo]),[[1,'ビクトリアス・フォーム','8658'],[2,'グロリアス・フォーム','8659']]);
  // チェンソーマン＆ビーム: no unit (form empty), but its ownership check is kept
  assert.equal(d.master.characters.some(c=>c.name==='チェンソーマン＆ビーム'),false);
  // ownership checks, NOT_OWNED included
  assert.equal(d.ownershipChecks.length,22);
  assert.equal(d.ownershipChecks.filter(x=>x.status==='NOT_OWNED').length,11);
  const carone=d.ownershipChecks.find(x=>x.characterName==='キャローネ');
  assert.deepEqual([carone.device,carone.scope,carone.stage,carone.stageKey,carone.status,carone.source],['メイン','破界の星墓','パラノヴィア','破界の星墓::パラノヴィア','NOT_OWNED','monst-hakai-main-staging-v1']);
  assert.ok(d.ownershipChecks.some(x=>x.characterName==='チェンソーマン＆ビーム'&&x.status==='OWNED_EXACT'));
  // reload keeps everything
  await page.reload();const r=await snapshot();assert.equal(r.units.length,11);assert.equal(r.ownershipChecks.length,22);
});

test('re-import of the same JSON: no duplicates, nothing to apply', async()=>{
  await preview();await click('[data-act="invApply"]');
  const before=await snapshot();
  await page.fill('#invText','');await preview();
  assert.match(await page.locator('#invResult').textContent(),/取り込む変更はありません/);
  assert.match(await page.locator('#invResult').textContent(),/新しい所持確認 0件・登録済み 22件/);
  assert.equal(await page.locator('#invApply').isDisabled(),true);
  const after=await snapshot();delete after.ui;delete before.ui;assert.deepEqual(after,before);
});

test('existing data: blanks are supplemented, differences are conflicts (never overwritten)', async()=>{
  const seedData={characters:[],
    master:{characters:[{id:'c-ok',name:'乙骨憂太'},{id:'c-ji',name:'自来也'},{id:'c-ma',name:'マスター・コーヴ'},{id:'c-x',name:'別キャラ'}],
      forms:[{id:'f-ok',characterId:'c-ok',name:'現代の異能',short:'',race:'',battleType:'',shotType:''},
        {id:'f-ji',characterId:'c-ji',name:'ガマ仙人',short:'仙人',race:'亜人',battleType:'バランス型',shotType:'反射'},
        {id:'f-ma',characterId:'c-ma',name:'死闘に挑む森羅万象流武術師範',short:'',race:'',battleType:'',shotType:''},
        {id:'f-x',characterId:'c-x',name:'別形態',short:'',race:'',battleType:'',shotType:'',monsterNo:'9234'}]},
    units:[{id:'u-ok',formId:'f-ok',device:'メイン',no:1,fruits:[],memo:'手入力'},
      {id:'u-ma',formId:'f-ma',device:'メイン',no:1,fruits:[{name:'別の実',grade:'特級'}],memo:''}]};
  await seed(seedData);
  await preview();
  const text=await page.locator('#invResult').textContent();
  // 春野サクラ: monsterNo 9234 already used by another name → conflict; 自来也: 戦型 differs → conflict; コーヴ: fruits differ → conflict
  assert.deepEqual(await counts(),['0','8','3','1']);
  assert.match(text,/図鑑No\.9234 が既存の「別キャラ｜別形態」と同じです/);
  assert.match(text,/戦型が既存（バランス型）と違います（JSON：超バランス型）/);
  assert.match(text,/メインの個体1の実が既存と違います（上書きしません）/);
  assert.match(text,/空欄だった項目を補完：図鑑No\..*空だった実を補完/s);
  await click('[data-act="invApply"]');
  const d=await snapshot();
  // conflicts untouched
  assert.equal(d.master.forms.find(f=>f.id==='f-ji').battleType,'バランス型');
  assert.deepEqual(d.units.find(u=>u.id==='u-ma').fruits,[{name:'別の実',grade:'特級',kind:''}]);
  assert.equal(d.master.characters.some(c=>c.name==='春野サクラ'),false);
  // blanks supplemented in place (no duplicate unit / form)
  const ok=d.master.forms.find(f=>f.id==='f-ok');assert.equal(ok.monsterNo,'9317');assert.equal(ok.fullDisplayName,'現代の異能 乙骨憂太');
  assert.equal(d.units.filter(u=>u.formId==='f-ok').length,1);
  const u=d.units.find(x=>x.id==='u-ok');assert.equal(u.fruits.length,3);assert.equal(u.memo,'手入力');
  assert.equal(d.master.forms.filter(f=>f.characterId==='c-ok').length,1);
});

test('NOT_OWNED that contradicts existing data is reported, nothing deleted; differing check result kept as-is', async()=>{
  await seed({characters:[],master:{characters:[{id:'c-el',name:'エル'}],forms:[{id:'f-el',characterId:'c-el',name:'堕天',short:'',race:'',battleType:'',shotType:''}]},
    units:[{id:'u-el',formId:'f-el',device:'メイン',no:1,fruits:[]}],
    ownershipChecks:[{id:'oc1',device:'メイン',characterName:'ペリー',requestedFormName:'',scope:'破界の星墓',stage:'パラノヴィア',status:'OWNED_EXACT'}]});
  await preview();
  const text=await page.locator('#invResult').textContent();
  assert.match(text,/エル：今回は「未所持」ですが、既存データではメインに1体登録されています（自動では変更しません）/);
  assert.match(text,/ペリー（パラノヴィア）：既存の記録は「所持」、今回は「未所持」/);
  await click('[data-act="invApply"]');
  const d=await snapshot();
  assert.ok(d.units.some(u=>u.id==='u-el'));assert.ok(d.master.characters.some(c=>c.id==='c-el'));
  assert.equal(d.ownershipChecks.find(x=>x.characterName==='ペリー').status,'OWNED_EXACT');
  assert.equal(d.ownershipChecks.filter(x=>x.characterName==='ペリー').length,1);
  assert.equal(d.ownershipChecks.find(x=>x.characterName==='エル').status,'NOT_OWNED'); // the check itself is recorded
});

test('format errors and wrong schema change nothing', async()=>{
  const before=await snapshot();
  for(const [text,msg] of [['{broken','JSONとして読み取れません'],[JSON.stringify({...staging(),schema:'x'}),'schema が不明です'],
    [JSON.stringify({...staging(),device:'サブ9'}),'device（端末名）が不明です'],[JSON.stringify({...staging(),units:{}}),'units が配列ではありません'],
    [JSON.stringify({...staging(),ownershipChecks:[{characterName:'a',status:'MAYBE'}]}),'status が不明です']]){
    await preview(text);assert.match(await page.locator('#invResult').textContent(),new RegExp('取り込めません（何も変更していません）.*'+msg,'s'));
    assert.equal(await page.locator('#invApply').isDisabled(),true);
  }
  const after=await snapshot();delete after.ui;delete before.ui;assert.deepEqual(after,before);
  // a suitability JSON pasted here is refused too (different schema), and the suitability import refuses this file
  await page.fill('#imText',STAGING);await click('[data-act="imPreview"]');assert.match(await page.locator('#imResult').textContent(),/取り込めません/);
});

test('rollback: a failure while saving restores the previous state', async()=>{
  await seed({characters:[],master:{characters:[{id:'c1',name:'既存キャラ'}],forms:[]}});
  const before=await snapshot();
  await preview();
  await page.evaluate(()=>{window.__p=persist;persist=()=>{throw new Error('quota')}});
  await click('[data-act="invApply"]');
  await page.evaluate(()=>{persist=window.__p});
  assert.match(await page.locator('#invMsg').textContent(),/取り込み前の状態に戻しました/);
  const after=await snapshot();
  assert.deepEqual([after.master,after.units,after.ownershipChecks],[before.master,before.units,before.ownershipChecks]);
  await page.reload();assert.deepEqual((await snapshot()).units,[]);
});

test('backup / restore keeps ownership checks, 図鑑No., 表示名 and unit status; imported units are marked on screen', async()=>{
  await preview();await click('[data-act="invApply"]');
  const json=await page.evaluate(()=>backupJson());const ex=JSON.parse(json);
  assert.equal(ex.data.ownershipChecks.length,22);
  await seed({characters:[]});await click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',json);await click('[data-act="restore"]');
  const d=await snapshot();
  assert.equal(d.ownershipChecks.length,22);assert.equal(formByName(d,'ニケ','グロリアス・フォーム').monsterNo,'8659');
  assert.equal(formByName(d,'自来也','ガマ仙人').fullDisplayName,'ガマ仙人 自来也');
  assert.equal(unitsOf(d,'乙骨憂太')[0].verificationStatus,'NEEDS_REVIEW');
  // character view shows the status badge and 図鑑No.; stage card shows 個体要確認
  await click('[data-act="view"][data-view="chara"]');
  const ch=d.master.characters.find(c=>c.name==='乙骨憂太');
  await click(`[data-act="charaOpen"][data-id="${ch.id}"]`);
  assert.match(await page.locator('#charaList .card.open').textContent(),/No\.9317.*要確認/s);
  const f=formByName(d,'乙骨憂太','現代の異能'), u=unitsOf(d,'乙骨憂太')[0];
  await page.evaluate(({fid})=>{db.suits.push(normSuit({id:'s',stageKey:'破界の星墓::ニギミタマ',formId:fid,source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'}));
    db.useDevs['破界の星墓::ニギミタマ']=['メイン'];db.ui.quest='破界の星墓';db.ui.stage['破界の星墓']='ニギミタマ';db.ui.view='stage';persist();render()},{fid:f.id});
  await page.locator('.pickSel[data-pick-dev="メイン"]').selectOption(u.id);
  assert.match(await page.locator('.pickDev[data-dev="メイン"] .uL1').textContent(),/個体要確認/);
  // the form edit screen keeps 図鑑No. and offers 超戦型
  await click('[data-act="view"][data-view="chara"]');const ji=d.master.characters.find(c=>c.name==='自来也');
  await click(`[data-act="charaOpen"][data-id="${ji.id}"]`);await click(`[data-act="formEdit"][data-id="${formByName(d,'自来也','ガマ仙人').id}"]`);
  assert.equal(await page.inputValue('#fmBattle'),'超バランス型');await click('[data-act="saveForm"]');
  const j2=formByName(await snapshot(),'自来也','ガマ仙人');assert.deepEqual([j2.monsterNo,j2.battleType],['9244','超バランス型']);
});

test('320/390px: inventory preview fits without horizontal scroll; screenshots', async()=>{
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});await preview();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    for(const sel of ['[data-act="invPreview"]','#invApply','#invFile','#invText']){const r=await page.locator(sel).boundingBox();assert.ok(r.x>=0&&r.x+r.width<=width,sel)}
    await page.locator('#invResult').screenshot({path:path.join(__dirname,'artifacts',`v8-inventory-preview-${width}.png`)});
  }
});
