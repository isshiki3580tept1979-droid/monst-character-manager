// Round 3: stage screen = choose up to 4 of the 6 devices, show them as ①〜④ cards stacked vertically,
// each card always showing キャラ｜形態 個体N / 種族 戦型 撃種 / 実 (short names, 4th on its own line).
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
const card=dev=>page.locator(`.pickDev[data-dev="${dev}"]`);
const pickSel=dev=>page.locator(`.pickSel[data-pick-dev="${dev}"]`);
const shown=()=>page.locator('#stageDevices .pickDev').evaluateAll(ds=>ds.map(d=>d.querySelector('.devName').textContent));
const fr=(name,grade,kind)=>({name,grade,kind});
function world(extra={}){
  const f=(id,characterId,name,short,race,battleType,shotType)=>({id,characterId,name,short,race,battleType,shotType});
  return {characters:[],
    master:{characters:[{id:'c-neo',name:'ネオ'},{id:'c-rinne',name:'リンネ'},{id:'c-yakumo',name:'ヤクモ'},{id:'c-arthur',name:'アーサー'}],
      forms:[f('f-hello','c-neo','ハローワールド・モード','ハロー','亜人','砲撃型','貫通'),
        f('f-rev','c-neo','リバース・モード','リバース','魔人','パワー型','反射'),
        f('f-rinne','c-rinne','リンネ（獣神化）','獣神化','亜人','砲撃型','貫通'),
        f('f-yk1','c-yakumo','大荒神武装','','神','スピード型','反射'),
        f('f-yk2','c-yakumo','巫女姫霊装','','神','バランス型','貫通'),
        f('f-arthur','c-arthur','アーサー（獣神化）','','聖騎士','バランス型','貫通')]},
    units:[
      {id:'u-neo1',formId:'f-hello',device:'メイン',no:1,fruits:[fr('同族の絆・加撃','特級L','同族'),fr('同族の絆・加撃速','特級L','同族'),fr('同族の絆・加命撃','特級L','同族'),fr('撃種の絆・加撃','特級EL','撃種')],memo:''},
      {id:'u-neo2',formId:'f-rev',device:'メイン',no:2,fruits:[fr('撃種の絆・加撃','特級L','撃種'),fr('加撃','特級','戦型'),fr('将命削り','特級M','その他')],memo:''},
      {id:'u-arthur',formId:'f-arthur',device:'メイン',no:1,fruits:[],memo:''},
      {id:'u-rinne',formId:'f-rinne',device:'サブ1',no:1,fruits:[fr('撃種の絆・加撃','特級L','撃種'),fr('撃種の絆・加撃速','特級L','撃種'),fr('撃種の絆・加命撃','特級L','撃種')],memo:''},
      {id:'u-yk1',formId:'f-yk1',device:'サブ3',no:1,fruits:[],memo:''},
      {id:'u-yk2',formId:'f-yk2',device:'サブ3',no:2,fruits:[fr('戦型の絆・加撃','特級L','戦型')],memo:''},
      {id:'u-neo-s5',formId:'f-hello',device:'サブ5',no:1,fruits:[fr('同族の絆・加撃','特級','同族')],memo:''}],
    suits:[
      {id:'s1',stageKey:STAGE,formId:'f-hello',source:'GAME_CLEAR_MONSTERS',rank:1,verificationStatus:'VERIFIED'},
      {id:'s2',stageKey:STAGE,formId:'f-rev',source:'GAMEWITH',evaluationType:'GRADE',grade:'A',verificationStatus:'VERIFIED'},
      {id:'s3',stageKey:STAGE,formId:'f-rinne',source:'GAME_CLEAR_MONSTERS',rank:2,verificationStatus:'VERIFIED'},
      {id:'s4',stageKey:STAGE,formId:'f-yk1',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'VERIFIED'},
      {id:'s5',stageKey:STAGE,formId:'f-yk2',source:'ALTEMA',evaluationType:'CANDIDATE'}], // UNVERIFIED only
    ...extra};
}

test('device picker: 6 checkboxes, choose up to 4, 5th refused, chosen devices shown as ①〜④ in the order they were checked', async()=>{
  await seed(world());
  assert.equal(await page.locator('.dpBtn').count(),6);
  assert.equal(await page.locator('#stageDevices .pickDev').count(),0);
  assert.match(await page.locator('#stageDevices').textContent(),/今回使う端末を選んでください/);
  // ①〜④ follow the order the devices were checked (= this team's play order)
  for(const d of ['サブ5','メイン','サブ3','サブ1']) await click(`[data-act="useDev"][data-dev="${d}"]`);
  assert.deepEqual(await shown(),['①サブ5','②メイン','③サブ3','④サブ1']);
  assert.deepEqual(await page.locator('.dpBtn').evaluateAll(bs=>bs.map(b=>b.getAttribute('aria-checked'))),['true','true','false','true','false','true']);
  assert.deepEqual(await page.locator('.dpBtn .dpBox').allTextContents(),['②','④','','③','','①']); // slot number on each checked button
  assert.match(await page.locator('.dpHead').textContent(),/4\/4台/);
  // 5th is refused with a short message; nothing changes
  await click('[data-act="useDev"][data-dev="サブ2"]');
  assert.equal(await page.locator('#devPickMsg').textContent(),'4台まで選択できます');
  assert.deepEqual(await shown(),['①サブ5','②メイン','③サブ3','④サブ1']);
  assert.deepEqual((await snapshot()).useDevs[STAGE],['サブ5','メイン','サブ3','サブ1']);
  // uncheck one: later slots move up immediately; a newly checked device goes to the end
  await click('[data-act="useDev"][data-dev="サブ3"]');assert.deepEqual(await shown(),['①サブ5','②メイン','③サブ1']);
  await click('[data-act="useDev"][data-dev="サブ2"]');assert.deepEqual(await shown(),['①サブ5','②メイン','③サブ1','④サブ2']);
  // a single device and an empty selection also work
  for(const d of ['サブ5','メイン','サブ1']) await click(`[data-act="useDev"][data-dev="${d}"]`);
  assert.deepEqual(await shown(),['①サブ2']);
  await click('[data-act="useDev"][data-dev="サブ2"]');assert.equal(await page.locator('#stageDevices .pickDev').count(),0);
  assert.deepEqual((await snapshot()).useDevs[STAGE],[]);
  for(const d of ['メイン','サブ1','サブ2','サブ5']) await click(`[data-act="useDev"][data-dev="${d}"]`);
  // saved per stage, survives reload; another stage has its own (empty) selection
  await page.reload();assert.deepEqual(await shown(),['①メイン','②サブ1','③サブ2','④サブ5']);
  await click('[data-act="stage"][data-stage="二ノ獄"]');assert.equal(await page.locator('#stageDevices .pickDev').count(),0);
  await click('[data-act="useDev"][data-dev="サブ4"]');assert.deepEqual(await shown(),['①サブ4']);
  await click('[data-act="stage"][data-stage="一ノ獄"]');assert.deepEqual(await shown(),['①メイン','②サブ1','③サブ2','④サブ5']);
  await page.reload();await click('[data-act="stage"][data-stage="二ノ獄"]');assert.deepEqual(await shown(),['①サブ4']);
  await click('[data-act="stage"][data-stage="一ノ獄"]');
  // backup / restore keeps the selection (order included)
  const json=await page.evaluate(()=>backupJson());assert.deepEqual(JSON.parse(json).data.useDevs[STAGE],['メイン','サブ1','サブ2','サブ5']);
  await seed({characters:[]});await click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',json);await click('[data-act="restore"]');
  await click('[data-act="view"][data-view="stage"]');assert.deepEqual(await shown(),['①メイン','②サブ1','③サブ2','④サブ5']);
});

test('device picker: without a saved selection, devices that already have a pick are shown (max 4)', async()=>{
  await seed(world({picks:{[STAGE]:{'メイン':'u-neo1','サブ3':'u-yk1'}}}));
  assert.deepEqual(await shown(),['①メイン','②サブ3']);
  assert.equal((await snapshot()).useDevs[STAGE],undefined); // nothing written until the user changes it
});

test('cards: candidates per device unchanged; card always shows キャラ｜形態 個体N / 種族 戦型 撃種 / short fruits; follows unit change', async()=>{
  await seed(world({useDevs:{[STAGE]:['メイン','サブ1','サブ3','サブ5']}}));
  // owned AND suitable only (アーサー owned but not suitable; other devices' units never listed)
  assert.deepEqual(await pickSel('メイン').locator(':scope > option').allTextContents(),['— 使う個体を選ぶ —','ネオ｜ハロー 個体1','ネオ｜リバース 個体2']);
  assert.deepEqual(await pickSel('メイン').locator('optgroup option').allTextContents(),['アーサー｜アーサー（獣神化） 個体1（仮）'],'others only as provisional');
  assert.deepEqual(await pickSel('サブ3').locator(':scope > option').allTextContents(),['— 使う個体を選ぶ —','ヤクモ｜大荒神武装 個体1','ヤクモ｜巫女姫霊装 個体2（未検証）']);
  assert.match(await card('メイン').textContent(),/使う個体を選んでください/);
  await pickSel('メイン').selectOption('u-neo1');
  const lines=dev=>card(dev).locator('.uCard').evaluate(c=>({
    l1:c.querySelector('.uL1').textContent.replace(/\s+/g,' ').trim(),
    l2:[...c.querySelectorAll('.uL2 span')].map(s=>s.textContent),
    l3:[...c.querySelectorAll('.uL3:not(.uL4) .frS')].map(s=>s.textContent),
    l4:[...c.querySelectorAll('.uL4 .frS')].map(s=>s.textContent),
    none:c.querySelector('.frNone')?.textContent||'',
    titles:[...c.querySelectorAll('.frS')].map(s=>s.title)}));
  let l=await lines('メイン');
  assert.equal(l.l1,'ネオ｜ハロー 個体1');
  assert.deepEqual(l.l2,['亜人','砲撃型','貫通']);
  assert.deepEqual(l.l3,['同族加撃L','同族加撃速L','同族加命撃L']);
  assert.deepEqual(l.l4,['撃種加撃EL']); // 4th fruit on its own line
  assert.equal(l.titles[0],'[同族]同族の絆・加撃 特級L'); // full name kept (tooltip / detail)
  // the detail toggle is not needed: it is off by default
  assert.equal(await card('メイン').locator('.pInfo,.pAll').count(),0);
  // switching unit switches every line; no 4th line for a 3-fruit unit
  await pickSel('メイン').selectOption('u-neo2');l=await lines('メイン');
  assert.deepEqual([l.l1,l.l2,l.l3,l.l4],['ネオ｜リバース 個体2',['魔人','パワー型','反射'],['撃種加撃L','戦型加撃特','将命削りM'],[]]);
  // unit without fruits -> 実なし; unverified-only candidate -> marked on the card too
  await pickSel('サブ3').selectOption('u-yk1');l=await lines('サブ3');
  assert.deepEqual([l.l1,l.l3,l.none],['ヤクモ｜大荒神武装 個体1',[],'実なし']);
  await pickSel('サブ3').selectOption('u-yk2');l=await lines('サブ3');
  assert.equal(l.l1,'ヤクモ｜巫女姫霊装 個体2未検証');assert.deepEqual(l.l3,['戦型加撃L']);
  assert.equal(await card('サブ3').locator('.uL1 .vb.v-UNVERIFIED').count(),1);
  // data unchanged: stored fruit names are the official ones
  const u=(await snapshot()).units.find(x=>x.id==='u-neo1');assert.deepEqual(u.fruits.map(x=>x.name),['同族の絆・加撃','同族の絆・加撃速','同族の絆・加命撃','撃種の絆・加撃']);
  // picks persist across reload with the cards
  await pickSel('サブ1').selectOption('u-rinne');await page.reload();
  assert.deepEqual((await snapshot()).picks[STAGE],{'メイン':'u-neo2','サブ1':'u-rinne','サブ3':'u-yk2'});
  l=await lines('サブ1');assert.deepEqual([l.l1,l.l2,l.l3],['リンネ｜獣神化 個体1',['亜人','砲撃型','貫通'],['撃種加撃L','撃種加撃速L','撃種加命撃L']]);
  // unset type info is shown as such, not left blank
  await page.evaluate(()=>{const f=formOf('f-rinne');f.battleType='';persist();render()});
  l=await lines('サブ1');assert.deepEqual(l.l2,['亜人','戦型未設定','貫通']);
});

test('fruit short names: 絆 removed, kind added only when missing, grade letter appended', async()=>{
  const r=await page.evaluate(()=>[
    fruitShort({name:'同族の絆・加撃',grade:'特級L',kind:'同族'}),fruitShort({name:'同族の絆・加撃速',grade:'特級L',kind:'同族'}),
    fruitShort({name:'撃種の絆・加命撃',grade:'特級L',kind:'撃種'}),fruitShort({name:'戦型の絆・加撃',grade:'特級L',kind:'戦型'}),
    fruitShort({name:'同族加撃',grade:'特級L',kind:'同族'}),fruitShort({name:'加撃',grade:'特級EL',kind:'同族'}),
    fruitShort({name:'速必殺',grade:'',kind:'その他'}),fruitShort({name:'',grade:'特級',kind:''})]);
  assert.deepEqual(r,['同族加撃L','同族加撃速L','撃種加命撃L','戦型加撃L','同族加撃L','同族加撃EL','速必殺','名称未設定特']);
});

test('320/390px: picker, four stacked cards, fruit chips fit; no horizontal scroll; screenshots', async()=>{
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  await seed(world({useDevs:{[STAGE]:['メイン','サブ1','サブ3','サブ5']},picks:{[STAGE]:{'メイン':'u-neo1','サブ1':'u-rinne','サブ3':'u-yk2','サブ5':'u-neo-s5'}}}));
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});await page.reload();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal scroll');
    for(const b of await page.locator('.dpBtn').all()){const r=await b.boundingBox();assert.ok(r.height>=44&&r.x>=0&&r.x+r.width<=width)}
    // cards are stacked vertically in ①〜④ order, full width
    const boxes=await page.locator('#stageDevices .pickDev').evaluateAll(ds=>ds.map(d=>{const r=d.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,b:r.bottom}}));
    assert.equal(boxes.length,4);
    for(let i=1;i<4;i++){assert.ok(boxes[i].y>=boxes[i-1].b-1,'vertical stack');assert.ok(Math.abs(boxes[i].x-boxes[0].x)<1)}
    for(const d of ['メイン','サブ1','サブ3','サブ5']){
      const s=await pickSel(d).boundingBox();assert.ok(s.x>=0&&s.x+s.width<=width&&s.height>=44,d+' select inside');
      const inside=await card(d).evaluate(c=>{const cr=c.getBoundingClientRect();return [...c.querySelectorAll('.frS,.uL1,.uL2')].every(e=>{const r=e.getBoundingClientRect();return r.left>=cr.left-0.5&&r.right<=cr.right+0.5})});
      assert.ok(inside,d+' content inside card');
    }
    // three fruits on one row for typical short names
    const tops=await card('メイン').locator('.uL3:not(.uL4) .frS').evaluateAll(es=>es.map(e=>Math.round(e.getBoundingClientRect().top)));
    assert.equal(new Set(tops).size,1,'3 fruits on one row');
    await page.screenshot({path:path.join(__dirname,'artifacts',`v5-stage-${width}.png`),fullPage:true});
  }
});

test('picks are kept when a device is removed and reused when it is added back; unsuitable pick is warned', async()=>{
  await seed(world({useDevs:{[STAGE]:['メイン','サブ3']}}));
  await pickSel('サブ3').selectOption('u-yk1');
  await click('[data-act="useDev"][data-dev="サブ3"]');assert.deepEqual(await shown(),['①メイン']);
  assert.equal((await snapshot()).picks[STAGE]['サブ3'],'u-yk1'); // not deleted
  await click('[data-act="useDev"][data-dev="サブ1"]');await click('[data-act="useDev"][data-dev="サブ3"]');
  assert.deepEqual(await shown(),['①メイン','②サブ1','③サブ3']);
  assert.equal(await pickSel('サブ3').inputValue(),'u-yk1');assert.match(await card('サブ3').locator('.uL1').textContent(),/ヤクモ｜大荒神武装/);
  // the suitability for that form is removed while the device is out of the team: warned, still not deleted
  await click('[data-act="useDev"][data-dev="サブ3"]');
  await page.evaluate(()=>{db.suits=db.suits.filter(s=>s.formId!=='f-yk1');persist();render()});
  await click('[data-act="useDev"][data-dev="サブ3"]');
  assert.match(await card('サブ3').textContent(),/別形態/);assert.match(await pickSel('サブ3').locator('option:checked').textContent(),/（別形態）/);
  assert.equal((await snapshot()).picks[STAGE]['サブ3'],'u-yk1');
});

test('long character and form names stay inside the card at 320px and 390px', async()=>{
  const longChar='とても長いキャラクター名ロングロングネームテスト', longForm='非常に長い進化形態名サンプル・アナザーフォーム・オブ・ロングネーム';
  await seed(world({useDevs:{[STAGE]:['メイン']},picks:{[STAGE]:{'メイン':'u-neo1'}}}));
  await page.evaluate(({c,f})=>{charOf('c-neo').name=c;const x=formOf('f-hello');x.short='';x.name=f;persist();render()},{c:longChar,f:longForm});
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const ok=await card('メイン').evaluate(c=>{const cr=c.getBoundingClientRect();return [...c.querySelectorAll('.uL1,.uL1 *,.pickSel')].every(e=>{const r=e.getBoundingClientRect();return r.left>=cr.left-0.5&&r.right<=cr.right+0.5})});
    assert.ok(ok,'inside card at '+width);
    assert.match(await card('メイン').locator('.uL1').textContent(),new RegExp(longForm.slice(0,8)));
  }
});

test('screenshots 320/390: before selection, 4 devices with 3 fruits / 4 fruits / no fruits / unverified / long form', async()=>{
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  const shot=async name=>page.screenshot({path:path.join(__dirname,'artifacts',name),fullPage:true});
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});
    await seed(world());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(`v5-before-${width}.png`);
    await seed(world({useDevs:{[STAGE]:['メイン','サブ1','サブ3','サブ5']},picks:{[STAGE]:{'メイン':'u-neo1','サブ1':'u-rinne','サブ3':'u-yk2','サブ5':'u-neo-s5'}}}));
    await page.evaluate(()=>{formOf('f-yk2').name='巫女姫霊装・とても長い正式名称の例・アナザー';persist();render()});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(`v5-after-${width}.png`);
    await pickSel('サブ3').selectOption('u-yk1');assert.match(await card('サブ3').textContent(),/実なし/);await shot(`v5-nofruit-${width}.png`);
    // native dropdown popups cannot be captured headless; show the option list in place via size and capture the card
    await pickSel('メイン').evaluate(s=>{s.size=s.options.length});await card('メイン').screenshot({path:path.join(__dirname,'artifacts',`v5-dropdown-${width}.png`)});
  }
});
