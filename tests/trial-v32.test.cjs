// v32：スクショ登録で、読み取った名前（例「ネオ：レゾナンス・モード」）が登録済みキャラ（「ネオ」）と同じキャラかもしれないとき、確認画面でも候補を示し、1回の操作でそのキャラへの追加に切り替えられる。
// 自動では結び付けない・名前も変えない・既存データを書き換えない。架空データだけを使う。
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
const register=async(r,dev)=>{await preview(r);await toConfirm(dev);await click('[data-act="srApply"]')};
const plain=o=>JSON.parse(JSON.stringify(o));
const RN='架空ネオ：レゾナンス・モード';
const sug=()=>page.locator('#srSuggest');
const pickSug=id=>page.locator(`#srSuggest [data-act="srSuggestPick"][data-id="${id}"]`);

test('1. the existing character is already offered as a candidate while editing (区切りの前の名前が一致), and nothing is merged automatically', async()=>{
  const data=async()=>{const d=await snapshot();return plain({master:d.master,units:d.units,suits:d.suits,picks:d.picks,useDevs:d.useDevs})};
  await seed(NEO());const s0=await data();
  await preview(READ({characterName:RN,monsterNo:'8570'}));
  const t=await txt(page.locator('#srCands'));
  assert.match(t,/架空ネオ 区切りの前の名前が一致/);
  assert.equal(await page.inputValue('#srF_characterName'),RN,'the typed/read name is never changed by itself');
  assert.deepEqual(await data(),s0,'preview changes no data');
});

test('2. the confirmation screen also says that an existing character may be the same one, with a button for it (reproduction: before v32 it only said 新しいキャラ…を登録)', async()=>{
  await seed(NEO());
  await preview(READ({characterName:RN,monsterNo:'8570'}));await toConfirm('メイン');
  assert.match(await result(),/新しいキャラ「架空ネオ：レゾナンス・モード」を登録/);
  assert.equal(await sug().count(),1,'suggestion block is shown');
  const t=await txt(sug());
  assert.match(t,/同じキャラかもしれない登録済みのキャラがあります/);
  assert.match(t,/架空ネオ/);assert.match(t,/1体（架空iPad（サブ1）×1）/);
  assert.match(t,/選ばない場合は、新しいキャラ「架空ネオ：レゾナンス・モード」として登録します/);
  assert.equal(await pickSug('c1').count(),1);
  assert.equal(await pickSug('c2').count(),0,'an unrelated character is not suggested');
  assert.equal(await page.locator('#srApply').isDisabled(),false,'registering as a new character stays possible');
});

test('3. choosing the suggested character switches the confirmation to 既存キャラへ追加; nothing is saved until 登録する; the existing character is not renamed', async()=>{
  await seed(NEO());
  await preview(READ({characterName:RN,monsterNo:'8570'}));await toConfirm('メイン');
  const s0=await sets();const before=await stored();
  await click('#srSuggest [data-act="srSuggestPick"][data-id="c1"]');
  const t=await result();
  assert.match(t,/既存キャラ「架空ネオ」に新しい個体を追加（登録済み：1体（架空iPad（サブ1）×1））/);
  assert.match(t,/登録先：架空マフティー（メイン）・個体1/);
  assert.match(t,/戦型が既存（バランス型）と違うため、この個体だけに記録します/);
  assert.doesNotMatch(t,/新しいキャラ「/);
  assert.equal(await sug().count(),0,'no suggestion once an existing character is chosen');
  assert.equal(await page.locator('#srApply').isDisabled(),false);
  assert.equal(await sets(),s0,'switching only re-checks; nothing is written');
  assert.deepEqual(await stored(),before);
  assert.equal(await page.inputValue('#srDevice'),'メイン','the chosen device is kept');
});

test('4. register on the existing character: a new unit with 超砲撃型 and 4 fruits; the existing unit, form, character, suits, picks and lent state are unchanged; survives reload and backup→restore', async()=>{
  await seed(NEO());
  await preview(READ({characterName:RN,monsterNo:'8570'}));await toConfirm('メイン');
  await click('#srSuggest [data-act="srSuggestPick"][data-id="c1"]');
  await click('[data-act="srApply"]');
  const d=await stored();
  assert.deepEqual(d.master.characters,NEO().master.characters,'no character added or renamed');
  assert.equal(d.master.forms.length,2,'no form added');
  assert.deepEqual(d.master.forms.find(f=>f.id==='f1'),{...NEO().master.forms[0]},'the form is unchanged');
  assert.deepEqual(d.units.find(u=>u.id==='u1'),NEO().units[0],'the existing unit is unchanged (fruits, memo, epithet, status, lent)');
  assert.deepEqual(d.suits.map(s=>s.id),['s1']);assert.deepEqual(d.picks,NEO().picks);assert.deepEqual(d.useDevs,NEO().useDevs);
  const n=d.units.find(u=>u.id!=='u1');
  assert.deepEqual([d.units.length,n.device,n.no,n.formId,n.battleType,n.monsterNo],[2,'メイン',1,'f1','超砲撃型','8570']);
  assert.deepEqual(n.fruits,kindless(FOUR));
  await page.reload();
  assert.deepEqual((await stored()).units.find(u=>u.id===n.id),n,'after reload');
  const bk=await page.evaluate(()=>backupJson());
  await seed({characters:[]});
  await click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',bk);await click('[data-act="restore"]');
  const r=await snapshot();
  assert.deepEqual(r.units.map(plain),d.units.map(plain),'after backup→restore');
  assert.deepEqual(r.master.characters,NEO().master.characters);
  assert.deepEqual(r.picks,NEO().picks);
});

test('5. not choosing the suggestion still registers a new character under the read name (nothing is merged by itself); the existing character is untouched', async()=>{
  await seed(NEO());
  await register(READ({characterName:RN,monsterNo:'8570'}),'メイン');
  const d=await stored();
  assert.equal(d.master.characters.length,3);assert.ok(d.master.characters.some(c=>c.name===RN));
  assert.deepEqual(d.units.find(u=>u.id==='u1'),NEO().units[0]);
  assert.deepEqual(d.master.forms.find(f=>f.id==='f1'),NEO().master.forms[0]);
  const n=d.units.find(u=>u.id!=='u1');assert.deepEqual(n.fruits,kindless(FOUR));assert.equal(n.device,'メイン');
});

const withNeon=()=>{const base=NEO();base.master.characters.push({id:'c3',name:'架空ネオン'});base.master.forms.push({id:'f3',characterId:'c3',name:'',unknownForm:true,short:'',race:'',battleType:'',shotType:''});return base};

test('6a. (existing behavior) a longer or similar name, or an unrelated character, shows no suggestion and is registered as a new character on its own', async()=>{
  await seed(withNeon());
  for(const name of ['架空ネオス','架空ネ','全く別の架空キャラ：形態','架空別キャラクター']){
    await preview(READ({characterName:name}));await toConfirm('メイン');
    assert.equal(await sug().count(),0,name+' → no suggestion');
    assert.match(await result(),/新しいキャラ「/);
  }
});

test('6b. (new) a name whose part before the separator equals a registered character suggests only that character, not a character whose name merely starts the same', async()=>{
  await seed(withNeon());
  await preview(READ({characterName:'架空ネオン：形態'}));await toConfirm('メイン');
  assert.equal(await pickSug('c3').count(),1);assert.equal(await pickSug('c1').count(),0,'架空ネオン is not 架空ネオ');
});

test('7. a character with an epithet prefix is suggested (二つ名を除いた名前が一致); choosing it moves the prefix to the epithet and does not touch other characters', async()=>{
  await seed(NEO());
  await preview(READ({characterName:'古の 架空ネオ'}));await toConfirm('メイン');
  assert.equal(await pickSug('c1').count(),1);
  assert.match(await txt(sug()),/二つ名を除いた名前が一致/);
  await click('#srSuggest [data-act="srSuggestPick"][data-id="c1"]');
  assert.equal(await page.inputValue('#srF_characterName'),'架空ネオ');assert.equal(await page.inputValue('#srF_epithet'),'古の');
  assert.match(await result(),/既存キャラ「架空ネオ」に新しい個体を追加/);
  await click('[data-act="srApply"]');
  const d=await stored();assert.equal(d.master.characters.length,2);
  const n=d.units.find(u=>u.id!=='u1');assert.equal(n.epithet,'古の');assert.deepEqual(d.units.find(u=>u.id==='u1'),NEO().units[0]);
});

test('8. same device as the existing unit: after choosing the suggestion the duplicate guard applies (default 何もしない) and the existing unit never changes', async()=>{
  await seed(NEO());
  await preview(READ({characterName:RN}));await toConfirm('サブ1');
  await click('#srSuggest [data-act="srSuggestPick"][data-id="c1"]');
  assert.equal(await page.locator('#srDupNone').isChecked(),true);
  const s0=await sets();await click('[data-act="srApply"]');
  assert.equal(await sets(),s0);assert.deepEqual((await stored()).units,NEO().units);
  await click('#srDupOk');await click('[data-act="srApply"]');
  const d=await stored();assert.equal(d.units.length,2);assert.deepEqual(d.units.find(u=>u.id==='u1'),NEO().units[0]);
  assert.equal(d.units.find(u=>u.id!=='u1').no,2);
});

test('9a. (existing behavior) JSON import of a "name：form" name makes no automatic link to the existing character', async()=>{
  await seed(NEO());
  await click('[data-act="view"][data-view="admin"]');
  await page.fill('#invText',JSON.stringify({schema:'monst-hakai-main-staging-v1',device:'メイン',scope:'破界の星墓',ownershipChecks:[],
    units:[{characterName:RN,formName:'標準',unitNo:1,monsterNo:'',verificationStatus:'VERIFIED',fruits:[]}]}));
  await click('[data-act="invPreview"]');
  assert.doesNotMatch(await txt(page.locator('#invResult')),/既存キャラ/);
  assert.deepEqual((await stored()).units.map(u=>u.id),['u1'],'a preview registers nothing');
});

test('9b. (new) a held reading shows the same suggestion after resuming, and nothing is registered', async()=>{
  await seed(NEO());
  await preview(READ({characterName:RN}));await click('[data-act="srHold"]');
  await page.reload();await click('[data-act="view"][data-view="admin"]');await click('[data-act="srResume"]');
  await toConfirm('メイン');
  assert.equal(await pickSug('c1').count(),1,'after resuming a held reading');
  assert.deepEqual((await stored()).units.map(u=>u.id),['u1'],'nothing was registered');
});

test('10. a reading whose name already equals a registered name has no suggestion (it already adds to that character)', async()=>{
  await seed(NEO());
  await preview(READ({characterName:'架空ネオ'}));await toConfirm('メイン');
  assert.equal(await sug().count(),0);assert.match(await result(),/既存キャラ「架空ネオ」に新しい個体を追加/);
});
