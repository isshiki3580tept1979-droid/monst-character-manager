// v31：同じ名前のキャラで 戦型・撃種・種族・図鑑No. が既存と違っても、別の個体として登録できる（既存の形態・個体は書き換えない）。
// 架空データだけを使う。隔離ブラウザで実行し、外部へは通信しない。保存形式は不変（違いがあるときだけ units[] に任意の項目 race/battleType/shotType/monsterNo を持つ）。
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
const {teamView}=require('./helpers/team.cjs');
const K='破界の星墓::ティル・ナ・ノーグ';
const FR3=[{name:'速必殺の力',grade:'特級EL',kind:''},{name:'兵命削りの力',grade:'特級EL',kind:''},{name:'将命削りの力',grade:'特級EL',kind:''}];
const FOUR=[['速必殺の力','特級EL'],['兵命削りの力','特級EL'],['将命削りの力','特級EL'],['熱き友撃の力','特級EL']];
const kindless=a=>a.map(([name,grade])=>({name,grade,kind:''}));
// 架空ネオ：サブ1に1体（バランス型・貫通・亜人、実3つ、確認状態・メモ・二つ名・取り込み元あり、メインへ貸出中）。適正・編成にも使われている。進化形態は名前なし（形態未確認）
const NEO=()=>({characters:[],deviceNames:{'メイン':'架空マフティー','サブ1':'架空iPad'},
  master:{characters:[{id:'c1',name:'架空ネオ'},{id:'c2',name:'架空別キャラ'}],
    forms:[{id:'f1',characterId:'c1',name:'',unknownForm:true,short:'',race:'亜人',battleType:'バランス型',shotType:'貫通'},
      {id:'f2',characterId:'c2',name:'',unknownForm:true,short:'',race:'',battleType:'',shotType:'',monsterNo:'90777'}]},
  units:[{id:'u1',formId:'f1',device:'サブ1',no:1,fruits:FR3,memo:'手入力のメモ',epithet:'架空の二つ名',verificationStatus:'NEEDS_REVIEW',importSource:'MANUAL',lentTo:'メイン'}],
  suits:[{id:'s1',stageKey:K,formId:'f1',source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'}],
  picks:{[K]:{'メイン':'u1'}},useDevs:{[K]:['メイン','サブ1']},
  ui:{view:'stage',quest:'破界の星墓',stage:{'破界の星墓':'ティル・ナ・ノーグ'}}});
const READ=(x={})=>({format:'monst-screenshot-reading-v1',characterName:'架空ネオ',formName:null,monsterNo:null,race:'亜人',battleType:'超砲撃型',shotType:'貫通',
  fruit1:FOUR[0].join(' '),fruit2:FOUR[1].join(' '),fruit3:FOUR[2].join(' '),fruit4:FOUR[3].join(' '),confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[],...x});
async function preview(r){await page.click('[data-act="view"][data-view="admin"]');await page.fill('#srText',typeof r==='string'?r:JSON.stringify(r));await page.click('[data-act="srPreview"]')}
async function toConfirm(device){await page.selectOption('#srDevice',device);await page.click('[data-act="srCheck"]')}
const result=()=>txt(page.locator('#srResult'));
const units1=d=>d.units.find(u=>u.id==='u1');
const added=d=>d.units.filter(u=>u.id!=='u1');
const basicOf=id=>page.evaluate(i=>{const u=db.units.find(x=>x.id===i);return unitBasic(u)},id);
const register=async(r,dev)=>{await preview(r);await toConfirm(dev);await click('[data-act="srApply"]')};
const plain=o=>JSON.parse(JSON.stringify(o));
// 既存データ（形態・既存の個体・適正・編成・貸出）が1つも変わらないこと
const untouched=async(msg='',base)=>{const d=await stored(),b=base||NEO();
  assert.deepEqual(d.master.forms,b.master.forms,'forms unchanged '+msg);
  assert.deepEqual(units1(d),b.units[0],'existing unit unchanged '+msg);
  assert.deepEqual(d.suits.map(s=>s.id),['s1']);assert.deepEqual(d.picks,b.picks);assert.deepEqual(d.useDevs,b.useDevs);return d};

test('1. same name, different 戦型 (超砲撃型 vs バランス型) on another device: registers as a new unit; the existing unit, form, suits, picks and lent state are untouched', async()=>{
  await seed(NEO());
  await register(READ(),'メイン');
  const d=await untouched();
  assert.equal(added(d).length,1);const n=added(d)[0];
  assert.equal(n.device,'メイン');assert.equal(n.formId,'f1','registered under the character default form (no form chosen or created)');
  assert.equal(n.battleType,'超砲撃型','this unit keeps its own 戦型');
  assert.equal(d.master.forms.length,2,'no form added');
  assert.deepEqual((await basicOf('u1')),{shotType:'貫通',battleType:'バランス型',race:'亜人'},'the existing unit still shows バランス型');
  assert.deepEqual((await basicOf(n.id)),{shotType:'貫通',battleType:'超砲撃型',race:'亜人'});
  assert.match(await page.locator('#srDone').textContent(),/登録しました/);
});

test('2. a different 撃種 (反射 vs 貫通) is also accepted as a new unit; the existing unit keeps 貫通', async()=>{
  await seed(NEO());
  await register(READ({battleType:'バランス型',shotType:'反射'}),'メイン');
  const d=await untouched();const n=added(d)[0];
  assert.equal(n.shotType,'反射');assert.equal(n.battleType,undefined,'a value equal to the form is not duplicated onto the unit');
  assert.deepEqual(await basicOf(n.id),{shotType:'反射',battleType:'バランス型',race:'亜人'});
  assert.equal((await basicOf('u1')).shotType,'貫通');
});

test('3. a different 種族 does not overwrite the existing unit or form', async()=>{
  await seed(NEO());
  await register(READ({race:'神',battleType:'バランス型'}),'サブ2');
  const d=await untouched();const n=added(d)[0];
  assert.equal(n.race,'神');assert.equal((await basicOf('u1')).race,'亜人');assert.equal((await basicOf(n.id)).race,'神');
  assert.equal(d.master.forms.find(f=>f.id==='f1').race,'亜人');
});

test('4. same name and the same 戦型: a separate unit is added (same device needs the "別の個体として追加" choice); no per-unit basic values are stored', async()=>{
  await seed(NEO());
  await preview(READ({battleType:'バランス型'}));await toConfirm('サブ1');
  assert.equal(await page.locator('#srDupNone').isChecked(),true);
  await click('#srDupOk');await click('[data-act="srApply"]');
  const d=await untouched();const n=added(d)[0];
  assert.equal(n.device,'サブ1');assert.equal(n.no,2);
  assert.deepEqual(Object.keys(n).sort(),['device','fruits','formId','id','importSource','memo','no','verificationStatus'].sort(),'identical values are inherited from the form, not copied');
});

test('5. same device + same character defaults to 何もしない even when 戦型 differs; nothing is saved and no update/replace is offered', async()=>{
  await seed(NEO());
  await preview(READ());await toConfirm('サブ1');const s0=await sets();
  assert.equal(await page.locator('#srDupNone').isChecked(),true);
  assert.equal(await page.locator('#srPlan').getAttribute('data-mode'),'none');
  const t=await result();
  assert.doesNotMatch(t,/置き換え|更新する/);assert.doesNotMatch(t,/違います/);
  assert.match(t,/すでにあります/);
  await click('[data-act="srApply"]');
  assert.match(await txt(page.locator('#srMsg')),/保存していません/);assert.equal(await sets(),s0);
  await untouched();assert.equal(added(await stored()).length,0);
});

test('6. the new unit 4 fruits are saved in order and shown again after reload (character screen)', async()=>{
  await seed(NEO());await register(READ(),'メイン');
  let d=await stored();assert.deepEqual(added(d)[0].fruits,kindless(FOUR));
  await page.reload();d=await stored();assert.deepEqual(added(d)[0].fruits,kindless(FOUR));
  await page.evaluate(()=>{db.ui.view='chara';db.ui.charaOpen='c1';render()});
  assert.match(await txt(page.locator('#charaList')),/熱き友撃の力/);
  assert.match(await txt(page.locator(`#charaList [data-unit="${added(d)[0].id}"]`)),/超砲撃型/,'a difference from the character is shown on that unit row');
  assert.doesNotMatch(await txt(page.locator('#charaList [data-unit="u1"]')),/超砲撃型/);
});

test('7/8. existing 3-fruit data stays 3 fruits; the existing unit values (戦型・撃種・種族・実) are unchanged after a 4-fruit unit is added next to it', async()=>{
  await seed(NEO());const before=plain(units1(await stored()));
  await register(READ(),'メイン');
  const d=await stored();assert.deepEqual(units1(d),before);assert.equal(units1(d).fruits.length,3);
  assert.deepEqual(await basicOf('u1'),{shotType:'貫通',battleType:'バランス型',race:'亜人'});
});

test('9. stage suits, team picks, useDevs and the lent state keep working: the existing unit stays selected and lent; the new unit appears as a candidate with its own 戦型', async()=>{
  await seed(NEO());await register(READ(),'メイン');
  const d=await untouched();
  await page.evaluate(()=>{db.ui.view='stage';render()});
  const v=await teamView(page,'メイン');
  assert.equal(v.cand.length,2,'both units (the borrowed existing one and the new one) are candidates on メイン');
  assert.equal(v.sel,'u1');
  await page.locator('.pickDev[data-dev="メイン"] [data-act="openPicker"]').click();
  const types=await page.locator('#pkList .pkItem').evaluateAll(es=>es.map(e=>({id:e.dataset.id,t:(e.querySelector('.pkType')||{}).textContent})));
  assert.match(types.find(x=>x.id==='u1').t,/バランス型/);
  const nid=added(d)[0].id;
  assert.match(types.find(x=>x.id===nid).t,/超砲撃型/);
  assert.equal((await stored()).units.find(u=>u.id==='u1').lentTo,'メイン');
});

test('10. backup → restore keeps the per-unit values, the existing unit and the links', async()=>{
  await seed(NEO());await register(READ({monsterNo:'8570'}),'メイン');
  const d0=await stored();const bk=await page.evaluate(()=>backupJson());
  await seed({characters:[]});
  await click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',bk);await click('[data-act="restore"]');
  const r=await snapshot();
  assert.deepEqual(r.units.map(plain),d0.units.map(plain));
  assert.deepEqual(r.master.forms.map(plain),d0.master.forms.map(plain));
  assert.deepEqual(r.suits.map(s=>s.id),['s1']);assert.deepEqual(r.picks,NEO().picks);
  const n=r.units.find(u=>u.id!=='u1');assert.equal(n.battleType,'超砲撃型');assert.equal(n.monsterNo,'8570');
  assert.equal(r.units.find(u=>u.id==='u1').lentTo,'メイン');
});

test('11. no 図鑑No. and no confirmed form: registration works and no form is required or created; a differing 図鑑No. is just kept on the unit', async()=>{
  await seed(NEO());
  await register(READ({monsterNo:null}),'メイン');
  let d=await stored();assert.equal(added(d).length,1);assert.equal(d.master.forms.length,2);assert.equal(added(d)[0].monsterNo,undefined);
  await seed(NEO());await register(READ({monsterNo:'8570',battleType:'バランス型'}),'メイン');
  d=await stored();assert.equal(added(d).length,1);assert.equal(added(d)[0].monsterNo,'8570');
  assert.equal(d.master.forms.length,2);
});

test('12. a 4-fruit reading from the reader registers with all four fruits and its own 戦型 next to an existing 3-fruit unit', async()=>{
  await seed(NEO());await register(READ(),'サブ3');
  const d=await untouched();const n=added(d)[0];
  assert.deepEqual(n.fruits,kindless(FOUR));assert.equal(n.battleType,'超砲撃型');assert.equal(n.device,'サブ3');assert.equal(n.verificationStatus,'VERIFIED');
});

test('13. a 図鑑No. that belongs to ANOTHER character is still refused (no change)', async()=>{
  await seed(NEO());
  await preview(READ({monsterNo:'90777'}));await toConfirm('メイン');const s0=await sets();
  assert.match(await result(),/図鑑No\.90777 が既存の「架空別キャラ/);assert.equal(await page.locator('#srApply').isDisabled(),true);
  assert.equal(await sets(),s0);await untouched();
});

test('14. editing a unit that has its own 戦型 in the unit editor keeps those values', async()=>{
  await seed(NEO());await register(READ(),'メイン');
  const nid=added(await stored())[0].id;
  await page.evaluate(()=>{db.ui.view='chara';db.ui.charaOpen='c1';render()});
  await click(`#charaList [data-act="unitEdit"][data-id="${nid}"]`);
  await page.fill('#unMemo','編集したメモ');await click('[data-act="saveUnit"]');
  const n=(await stored()).units.find(u=>u.id===nid);
  assert.equal(n.memo,'編集したメモ');assert.equal(n.battleType,'超砲撃型');assert.deepEqual(n.fruits,kindless(FOUR));
});

test('15. 所持データ取り込み（JSON）: a new unit with a different 戦型 is added without touching the form; the same JSON again changes nothing; different fruits or 戦型 for the same unit number stay conflicts', async()=>{
  const j=(unitNo,fr,bt='超砲撃型')=>JSON.stringify({schema:'monst-hakai-main-staging-v1',device:'メイン',scope:'破界の星墓',ownershipChecks:[],
    units:[{characterName:'架空ネオ',formName:'標準',unitNo,monsterNo:'',battleType:bt,verificationStatus:'VERIFIED',fruits:fr.map(([name,grade])=>({name,grade}))}]});
  const run=async text=>{await click('[data-act="view"][data-view="admin"]');await page.fill('#invText',text);await click('[data-act="invPreview"]');
    const t=await txt(page.locator('#invResult'));if(!(await page.locator('#invApply').isDisabled()))await click('#invApply');return t};
  const named=NEO();named.master.forms[0]={...named.master.forms[0],name:'標準',short:'標準'};delete named.master.forms[0].unknownForm;
  await seed(named);
  let t=await run(j(1,FOUR));
      assert.doesNotMatch(t,/違います/);assert.match(t,/この個体だけに記録します/);
      const d=await untouched('',named);assert.equal(added(d).length,1);assert.equal(added(d)[0].battleType,'超砲撃型');
  t=await run(j(1,FOUR));
  assert.match(t,/取り込む変更はありません/);assert.equal((await stored()).units.length,2);
  t=await run(j(1,FOUR.slice(0,3)));
  assert.match(t,/実が既存と違います（上書きしません）/);assert.equal((await stored()).units.length,2);
  t=await run(j(1,FOUR,'パワー型'));
  assert.match(t,/戦型が既存（超砲撃型）と違います/);assert.equal((await stored()).units.length,2);
});
