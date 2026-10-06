// NODE_PATH must point to a Node installation containing playwright.
// Each test uses a new browser context on an ephemeral localhost origin; no user storage is touched.
const {test,before,after,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const source=path.resolve(process.env.TRIAL_HTML_SOURCE||path.join(__dirname,'..','monst_character_manager_trial.html'));
const KEY='monst-character-manager-trial-v2';
const protectedKeys=['monst-character-manager-v2','monst-character-manager-v1','monst-character-manager-device-names-v1','monst-character-manager-trial-v1'];
const stage='禁忌の獄::一ノ獄';
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
    // Reloads retain seeded sentinel values and actual test data.
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
const click=async selector=>page.locator(selector).click();
const open=async(rank=3)=>click(`[data-act="rankTile"][data-rank="${rank}"]`);
const save=async()=>click('[data-act="saveRank"]');
const value=async id=>page.locator('#'+id).inputValue();
const snapshot=()=>page.evaluate(()=>JSON.parse(JSON.stringify(db)));
async function seed(raw){await page.evaluate(({key,raw})=>localStorage.setItem(key,JSON.stringify(raw)),{key:KEY,raw});await page.reload()}
async function preset(){await click('[data-act="importPreset"]');await click('[data-act="applyImport"]')}
async function basic(race='亜人',battle='砲撃型',shot='貫通'){
  await page.selectOption('#rRace',race);await page.selectOption('#rBattleType',battle);await page.selectOption('#rShotType',shot);
}
test('race groups: exact 15/7/24 names, 46 unique choices, unset/custom at ends',async()=>{
  await open();
  const groups=await page.locator('#rRace optgroup').evaluateAll(gs=>gs.map(g=>({label:g.label,names:[...g.children].map(o=>o.value)})));
  const expected=[
    ['よく使う種族','亜人 妖精 神 聖騎士 魔族 魔王 サムライ ロボット ドラゴン 幻獣 魔人 ユニバース コスモ 獣 鉱物'],
    ['通常・モンスト固有系','鳥 ユニオン アクシス 幻妖 闘神 神獣 聖域の狩人'],
    ['コラボ・特殊系','LINE 怪獣 ウルトラ兄弟 エヴァパイロット 使徒 ゴジエヴァ ファイター 妖怪 青銅聖闘士 黄金聖闘士 マベツム ホムンクルス 怪異 巨人 魔神 人形 キメラアント ミッキー＆フレンズ 死神 バーニッシュ ボーダー隊員 近界民 十刃 仮面の軍勢']
  ].map(([label,names])=>({label,names:names.split(' ')}));
  assert.deepEqual(groups,expected);assert.equal(new Set(groups.flatMap(g=>g.names)).size,46);
  assert.deepEqual(await page.locator('#rRace > option').allTextContents(),['未設定','その他・新規']);
  for(const name of groups.flatMap(g=>g.names)){
    await page.selectOption('#rRace',name);await save();await page.reload();await open();assert.equal(await value('rRace'),name);
  }
  await page.selectOption('#rRace','');await save();await page.reload();await open();assert.equal(await value('rRace'),'');
});
test('custom race: visible only for custom, save/reload/edit/clear/cancel',async()=>{
  await open();assert.equal(await page.locator('#rRaceCustomField').isVisible(),false);
  await page.selectOption('#rRace','__custom__');assert.equal(await page.locator('#rRaceCustomField').isVisible(),true);
  await page.fill('#rRaceCustom','未来種族');await save();await page.reload();await open();
  assert.equal(await value('rRace'),'__custom__');assert.equal(await value('rRaceCustom'),'未来種族');
  await page.fill('#rRaceCustom','新未来種族');await save();await open();assert.equal(await value('rRaceCustom'),'新未来種族');
  await page.fill('#rRaceCustom','キャンセル種族');await click('#rankModal [data-act="close"]');await open();assert.equal(await value('rRaceCustom'),'新未来種族');
  await page.selectOption('#rRace','妖精');assert.equal(await page.locator('#rRaceCustomField').isVisible(),false);await save();
  await open();await page.selectOption('#rRace','');await save();assert.equal((await snapshot()).rankings[stage].entries[2].race,'');
});
test('unknown race survives load/save/backup even with empty name, long text, or HTML punctuation',async()=>{
  const unknown='未知<&"\'種族>'+ '未来'.repeat(35);
  await seed({characters:[],rankings:{[stage]:{entries:[{rank:3,name:'',race:unknown,battleType:'砲撃型',shotType:'反射'}]}}});
  await open();assert.equal(await value('rRaceCustom'),unknown);await save();await page.reload();await open();
  assert.equal(await value('rRaceCustom'),unknown);assert.equal((await snapshot()).rankings[stage].entries[2].race,unknown);
  assert.equal(await page.evaluate(()=>JSON.parse(backupJson()).data.rankings['禁忌の獄::一ノ獄'].entries[2].race),unknown);
  assert.equal(await page.locator('#rankModal script').count(),0);
  const backup=await page.evaluate(()=>backupJson());await click('#rankModal [data-act="close"]');
  await seed({characters:[]});await click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',backup);await click('[data-act="restore"]');
  await click('[data-act="view"][data-view="stage"]');await open();assert.equal(await value('rRaceCustom'),unknown);
});
test('all five battle and three shot choices save across reloads',async()=>{
  await open();assert.deepEqual(await page.locator('#rBattleType option').allTextContents(),['未設定','バランス型','パワー型','スピード型','砲撃型']);
  assert.deepEqual(await page.locator('#rShotType option').allTextContents(),['未設定','反射','貫通']);
  for(const battle of ['','バランス型','パワー型','スピード型','砲撃型'])for(const shot of ['','反射','貫通']){
    await basic('亜人',battle,shot);await save();await page.reload();await open();
    assert.equal(await value('rBattleType'),battle);assert.equal(await value('rShotType'),shot);
  }
});
test('basic information shared by devices, four fruits and ownership remain per device',async()=>{
  await preset();await open();await basic();await click('[data-act="rCount"][data-v="4"]');
  for(let i=0;i<4;i++){await page.fill('#wkName'+i,'メイン実'+i);await page.selectOption('#wkGrade'+i,'特級EL')}
  await save();
  for(const device of ['サブ1','サブ2','サブ3','サブ4','サブ5']){
    await click(`[data-act="rankDev"][data-dev="${device}"]`);await open();
    assert.equal(await value('rRace'),'亜人');assert.equal(await value('rBattleType'),'砲撃型');assert.equal(await value('rShotType'),'貫通');
    assert.equal(await value('wkName0'),'');
    if(device==='サブ1'){await click('[data-act="rStatus"][data-v="alt-form"]');await click('[data-act="rCount"][data-v="2"]');await page.fill('#wkName0','サブ専用実');await save()}
    else await click('#rankModal [data-act="close"]');
  }
  await click('[data-act="rankDev"][data-dev="メイン"]');await open();assert.equal(await value('wkName3'),'メイン実3');
  const d=await snapshot();assert.equal(d.ownership[stage]['メイン'].ranks[3].count,4);assert.equal(d.ownership[stage]['サブ1'].ranks[3].count,2);
  assert.equal(d.ownership[stage]['サブ1'].ranks[3].wakuwaku[0].name,'サブ専用実');
  assert.equal(Object.hasOwn(d.ownership[stage]['メイン'].ranks[3],'race'),false);
});
test('name edits, empty names, and repeated TOP10 import preserve basic info and fruits',async()=>{
  await preset();await open();await basic();await page.fill('#rName','手入力リンネ');await page.fill('#wkName0','保持実');await save();
  await preset();let d=await snapshot();assert.deepEqual(d.rankings[stage].entries[2],{rank:3,name:'手入力リンネ',race:'亜人',battleType:'砲撃型',shotType:'貫通'});
  assert.equal(d.ownership[stage]['メイン'].ranks[3].wakuwaku[0].name,'保持実');
  await open();await page.fill('#rName','');await save();await page.reload();await open();assert.equal(await value('rRace'),'亜人');
  await click('#rankModal [data-act="close"]');await preset();d=await snapshot();assert.equal(d.rankings[stage].entries[2].name,'リンネ');assert.equal(d.rankings[stage].entries[2].race,'亜人');
});
test('old saved data reads as unset without load-time writes or mass adding empty fields',async()=>{
  const raw={characters:[],rankings:{[stage]:{entries:Array.from({length:20},(_,i)=>({rank:i+1,name:'旧キャラ'+i}))}}};
  await seed(raw);assert.equal(await page.evaluate(()=>storageAccess.some(([m])=>m==='setItem')),false);
  await open();for(const id of ['rRace','rBattleType','rShotType'])assert.equal(await value(id),'');await save();
  const d=await snapshot();assert.deepEqual(d.rankings[stage].entries,raw.rankings[stage].entries);
});
test('11-20 ranks and other stages/devices unchanged by edits/import/reload',async()=>{
  const raw={characters:[],rankings:{[stage]:{entries:Array.from({length:20},(_,i)=>({rank:i+1,name:'キャラ'+i,race:'未知'+i,battleType:'パワー型',shotType:'反射'}))},'禁忌の獄::二ノ獄':{entries:[{rank:3,name:'別ステージ',race:'妖精'}]}},ownership:{[stage]:{}}};
  for(const dev of ['メイン','サブ1','サブ2','サブ3','サブ4','サブ5'])raw.ownership[stage][dev]={ranks:Object.fromEntries(Array.from({length:20},(_,i)=>[i+1,{status:'alt-form',count:3,wakuwaku:[{name:'実'+i,grade:'特級L'}]}]))};
  await seed(raw);const before=await snapshot();await open();await basic();await save();await preset();await page.reload();const d=await snapshot();
  assert.deepEqual(d.rankings[stage].entries.slice(10),before.rankings[stage].entries.slice(10));
  assert.deepEqual(d.rankings['禁忌の獄::二ノ獄'],before.rankings['禁忌の獄::二ノ獄']);
  for(const dev of Object.keys(before.ownership[stage]))for(let r=11;r<=20;r++)assert.deepEqual(d.ownership[stage][dev].ranks[r],before.ownership[stage][dev].ranks[r]);
  for(const dev of ['サブ1','サブ2','サブ3','サブ4','サブ5'])assert.deepEqual(d.ownership[stage][dev],before.ownership[stage][dev]);
});
test('new and old backups restore through actual UI',async()=>{
  await preset();await open();await basic('__custom__');await page.fill('#rRaceCustom','復元新種族');await page.fill('#wkName0','復元実');await save();
  await click('[data-act="view"][data-view="admin"]');
  const download=page.waitForEvent('download');await click('[data-act="backup"]');await download;
  const json=await value('bkText');const exported=JSON.parse(json);assert.equal(exported.data.rankings[stage].entries[2].race,'復元新種族');
  await seed({characters:[]});await click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',json);await click('[data-act="restore"]');
  await click('[data-act="view"][data-view="stage"]');await open();assert.equal(await value('rRaceCustom'),'復元新種族');assert.equal(await value('wkName0'),'復元実');
  await click('#rankModal [data-act="close"]');
  for(const entry of exported.data.rankings[stage].entries)for(const field of ['race','battleType','shotType'])delete entry[field];
  await click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',JSON.stringify(exported));await click('[data-act="restore"]');
  await click('[data-act="view"][data-view="stage"]');await open();assert.equal(await value('rRace'),'');assert.equal(await value('rBattleType'),'');assert.equal(await value('rShotType'),'');assert.equal(await value('wkName0'),'復元実');
});
test('320/390px UI: no horizontal overflow, operable controls, screenshots',async()=>{
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});await open();await basic('__custom__');await page.fill('#rRaceCustom','新しい種族');
    await page.locator('#rankModal .modal').evaluate(e=>{e.scrollTop=0});
    const size=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth,modal:document.querySelector('#rankModal .modal').scrollWidth,modalWidth:document.querySelector('#rankModal .modal').clientWidth,controls:[...document.querySelectorAll('#rankModal .basicInfo select,#rRaceCustom')].map(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right}})}));
    assert.ok(size.page<=size.viewport);assert.ok(size.modal<=size.modalWidth);
    for(const c of size.controls){assert.ok(c.width>=100);assert.ok(c.height>=40);assert.ok(c.left>=0&&c.right<=width)}
    await page.screenshot({path:path.join(__dirname,'artifacts',`basic-info-${width}.png`)});await save();
    assert.equal(await page.locator('.tGrid .tile').count(),10);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
});
test('regression: 6 devices, 35/15/20 stages, TOP10 and original preset',async()=>{
  assert.deepEqual(await page.evaluate(()=>QUESTS.map(q=>q.stages.length)),[35,15,20]);
  assert.equal(await page.locator('.tDev').count(),6);assert.equal(await page.locator('.tGrid .tile').count(),10);
  await preset();const d=await snapshot();assert.equal(d.rankings[stage].entries[2].name,'リンネ');assert.equal(d.rankings[stage].entries.length,20);
  assert.equal(Object.keys(d.ownership[stage]['メイン'].ranks).length,10);
  for(const quest of ['破界の星墓','天魔の孤城','禁忌の獄'])await click(`[data-act="quest"][data-quest="${quest}"]`);
});
test('regression: ownership paint, counts, maximum 4 fruits, retained on status changes',async()=>{
  await preset();await open();for(let i=0;i<4;i++){await page.fill('#wkName'+i,'実'+i);await page.selectOption('#wkGrade'+i,'特級L')}
  await click('[data-act="rCount"][data-v="3"]');await save();
  assert.equal(await page.evaluate(()=>normWaku(Array.from({length:6},()=>({name:'実',grade:'特級L'}))).length),4);
  for(const mode of ['alt-form','not-owned','owned']){
    await click(`[data-act="rankMode"][data-mode="${mode}"]`);await click('[data-act="rankTile"][data-rank="3"]');
    const o=(await snapshot()).ownership[stage]['メイン'].ranks[3];assert.equal(o.status,mode);assert.equal(o.wakuwaku.length,4);assert.equal(o.count,mode==='alt-form'?3:null);
  }
  await click('[data-act="rankMode"][data-mode="detail"]');await open();await click('[data-act="rStatus"][data-v=""]');await save();
  assert.equal((await snapshot()).ownership[stage]['メイン'].ranks[3].status,null);
});
test('regression: registration/edit/search/lend/return/delete and device names',async()=>{
  // The stage "＋ キャラ登録" now opens the new registration flow (trial-v6). Old characters[] records are
  // still readable/editable/lendable, so this regression seeds one directly and keeps checking those features.
  await seed({characters:[{id:'legacy-reg',name:'検証キャラ',device:'メイン',count:2,memo:'検索メモ',stages:[stage]}]});
  assert.equal((await snapshot()).characters.length,1);
  await click('[data-act="view"][data-view="search"]');await page.fill('#searchInput','検索メモ');assert.equal(await page.locator('#searchResults .card').count(),1);
  await click('#searchResults [data-act="edit"]');await page.fill('#cName','編集キャラ');await click('[data-act="saveChar"]');assert.equal((await snapshot()).characters[0].name,'編集キャラ');
  await click('#searchResults [data-act="lend"]');await page.selectOption('#lendTo','サブ1');await click('[data-act="saveLend"]');assert.equal((await snapshot()).characters[0].lentTo,'サブ1');
  await click('#searchResults [data-act="return"]');assert.equal((await snapshot()).characters[0].lentTo,null);
  await click('[data-act="view"][data-view="admin"]');await page.fill('#nameIn0','メイン表示名');await click('[data-act="saveNames"]');await page.reload();assert.equal((await snapshot()).deviceNames['メイン'],'メイン表示名');
  await click('[data-act="view"][data-view="device"]');assert.equal(await page.locator('#deviceCards .card').count(),6);
  await click('[data-act="view"][data-view="search"]');await click('#searchResults [data-act="edit"]');await click('[data-act="deleteChar"]');assert.equal((await snapshot()).characters.length,0);
});
test('regression: preset validation and hand-entered name protection, backups reject wrong app',async()=>{
  await preset();await open();await page.fill('#rName','手入力キャラ');await save();await preset();assert.equal((await snapshot()).rankings[stage].entries[2].name,'手入力キャラ');
  assert.ok(await page.evaluate(()=>parseTop20({...TOP20_PRESETS[0].data,entries:[]}).errors.length>0));
  assert.ok(await page.evaluate(()=>parseTop20({...TOP20_PRESETS[0].data,device:'不明'}).errors.length>0));
  const before=await snapshot();await click('[data-act="view"][data-view="admin"]');await page.fill('#bkText','{"app":"production","data":{"characters":[]}}');await click('[data-act="restore"]');
  assert.equal(await page.locator('#bkMsg').textContent(),'この試作版のバックアップではありません');assert.deepEqual((await snapshot()).rankings,before.rankings);
});
test('regression: stage groups remember selection, extra and legacy stages retained',async()=>{
  await click('[data-act="quest"][data-quest="天魔の孤城"]');await click('[data-act="group"][data-group="空中庭園"]');
  await click('[data-act="stage"][data-stage="空中庭園・第3の園"]');await click('[data-act="group"][data-group="試練の間"]');await click('[data-act="group"][data-group="空中庭園"]');
  assert.equal((await snapshot()).ui.stage['天魔の孤城'],'空中庭園・第3の園');
  await click('[data-act="view"][data-view="admin"]');await page.selectOption('#exQuest','天魔の孤城');await page.fill('#exName','検証追加');await click('[data-act="addStage"]');
  assert.ok((await snapshot()).extraStages['天魔の孤城'].includes('検証追加'));
  await click('[data-act="removeStage"][data-stage="検証追加"]');assert.equal((await snapshot()).extraStages['天魔の孤城'].includes('検証追加'),false);
  await seed({characters:[{id:'legacy',name:'旧キャラ',device:'メイン',count:1,stages:['禁忌の獄::深淵','天魔の孤城::試練の間']}],ui:{quest:'禁忌の獄',stage:{'禁忌の獄':'深淵'}},rankings:{'禁忌の獄::深淵':{entries:[{rank:3,name:'旧キャラ'}]}}});
  assert.match(await page.locator('#stageTitle').textContent(),/旧/);await page.reload();assert.equal((await snapshot()).characters[0].stages.length,2);
  assert.equal((await snapshot()).rankings['禁忌の獄::深淵'].entries[2].name,'旧キャラ');
});
test('regression: backup file loading, clipboard copy, invalid JSON rejected',async()=>{
  await preset();await click('[data-act="view"][data-view="admin"]');
  const json=await page.evaluate(()=>backupJson());await page.locator('#bkFile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(json)});
  await page.waitForFunction(()=>document.getElementById('bkText').value.includes('リンネ'));assert.equal(await value('bkText'),json);
  await context.grantPermissions(['clipboard-read','clipboard-write']);await click('[data-act="copyBackup"]');
  assert.deepEqual(JSON.parse(await page.evaluate(()=>navigator.clipboard.readText())),JSON.parse(json));
  const before=await snapshot();await page.fill('#bkText','{broken');await click('[data-act="restore"]');
  assert.equal(await page.locator('#bkMsg').textContent(),'バックアップの形式が正しくありません');assert.deepEqual((await snapshot()).rankings,before.rankings);
});
