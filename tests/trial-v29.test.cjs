// Round 29: ステージ編成カードのコンパクト化。情報（端末名・キャラ名・撃種｜戦型｜種族・わくわくの実4つまで・貸出/借用・仮選択・変更ボタン）は減らさず、
// 余白・ボタン高さ・実のチップを詰めて4端末を1画面に収める。表示だけの変更（保存データ・選択処理は不変）。架空データだけ。Same harness as trial-v10.test.cjs.
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
async function seed(raw){await page.evaluate(({key,raw})=>localStorage.setItem(key,JSON.stringify(raw)),{key:KEY,raw});await page.reload()}
const stored=()=>page.evaluate(key=>JSON.parse(Object.getPrototypeOf(localStorage).getItem.call(localStorage,key)||'null'),KEY);
const txt=async l=>(await l.textContent()).replace(/\s+/g,' ').trim();
const K='破界の星墓::ティル・ナ・ノーグ';
const F=(id,cid,x={})=>({id,characterId:cid,name:'',short:'',race:'',battleType:'',shotType:'',unknownForm:true,...x});
const FR=n=>[{name:'熱き友撃の力',grade:'特級EL',kind:''},{name:'同族の絆・加命撃',grade:'特級L',kind:''},{name:'同族の絆・加撃',grade:'特級L',kind:''},{name:'将命削りの力',grade:'特級M',kind:''}].slice(0,n);
// 4端末すべて選択済み：①実4・②実3・③仮選択（適正なし）・④借用中（サブ4の個体をサブ3へ貸出）で種族など未登録。長い端末名・キャラ名を含む
const BASE={characters:[],deviceNames:{'メイン':'架空とても長い端末名のマフティー','サブ1':'架空iPad'},
  master:{characters:[{id:'c1',name:'架空ミライ・架空ピースフルAI'},{id:'c2',name:'架空ネオ'},{id:'c3',name:'架空ルシファー'},{id:'c4',name:'架空とても長いキャラクター名ロングロングネーム'}],
    forms:[F('f1','c1',{race:'亜人',battleType:'バランス型',shotType:'貫通'}),F('f2','c2',{race:'魔人',battleType:'パワー型',shotType:'反射'}),F('f3','c3',{race:'妖精',battleType:'砲撃型',shotType:'反射'}),F('f4','c4')]},
  units:[{id:'u1',formId:'f1',device:'メイン',no:1,fruits:FR(4),memo:'',verificationStatus:'NEEDS_REVIEW'},{id:'u2',formId:'f2',device:'サブ1',no:1,fruits:FR(3),memo:''},
    {id:'u3',formId:'f3',device:'サブ2',no:1,fruits:FR(3),memo:''},{id:'u4',formId:'f4',device:'サブ4',no:1,fruits:FR(3),memo:'',lentTo:'サブ3'}],
  suits:['f1','f2','f4'].map((f,i)=>({id:'s'+i,stageKey:K,formId:f,source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'})),
  picks:{[K]:{'メイン':'u1','サブ1':'u2','サブ2':'u3','サブ3':'u4'}},useDevs:{[K]:['メイン','サブ1','サブ2','サブ3']},
  ui:{view:'stage',quest:'破界の星墓',stage:{'破界の星墓':'ティル・ナ・ノーグ'}}};
const same=(a,b,msg)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),msg);
const card=d=>page.locator(`.pickDev[data-dev="${d}"]`);
const keep=async()=>{const d=await stored();same(d.units,BASE.units,'units, fruits and lending untouched');same(d.master,BASE.master);
  assert.deepEqual(d.suits.map(s=>[s.id,s.formId]),BASE.suits.map(s=>[s.id,s.formId]));return d};
const measure=()=>page.evaluate(()=>{const cs=[...document.querySelectorAll('#stageDevices .pickDev')], r=cs.map(c=>c.getBoundingClientRect());
  return {heights:r.map(x=>Math.round(x.height)),block:Math.round(r.at(-1).bottom-r[0].top),nav:Math.round(document.getElementById('nav').getBoundingClientRect().height),hscroll:document.documentElement.scrollWidth>innerWidth,
    stacked:r.every((x,i)=>!i||x.top>=r[i-1].bottom-0.5),sameX:r.every(x=>Math.abs(x.left-r[0].left)<1)}});

for(const width of [390,360]) test(`${width}px: four team cards are compact, stacked in one column, fit above the bottom navigation, with no horizontal scroll`, async()=>{
  await page.setViewportSize({width,height:844});
  await seed(BASE);
  const m=await measure();
  assert.equal(m.hscroll,false);assert.ok(m.stacked&&m.sameX,'one column, ①〜④ order');
  assert.ok(m.heights.every(h=>h<=160),'each card is at most 160px: '+m.heights);
  assert.ok(m.block<=844-m.nav,`the four cards (${m.block}px) fit in one screen above the navigation (${844-m.nav}px)`);
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#stageDevices .pickDev')].map(x=>x.dataset.dev)),['メイン','サブ1','サブ2','サブ3']);
  for(const d of ['メイン','サブ1','サブ2','サブ3']){
    const b=await card(d).locator('[data-act="openPicker"]').boundingBox();assert.ok(b.height>=44&&b.x>=0&&b.x+b.width<=width,d+' button stays tappable: '+JSON.stringify(b));
    const hd=await card(d).evaluate(c=>{const n=c.querySelector('.devName').getBoundingClientRect(),bt=c.querySelector('.pickBtn').getBoundingClientRect(),h=c.querySelector('.devHead');return {inHead:h.contains(c.querySelector('.pickBtn')),noOverlap:n.right<=bt.left+0.5,rightSide:bt.left>n.left}});
    assert.deepEqual(hd,{inHead:true,noOverlap:true,rightSide:true},d+' button is on the right of the device name, not overlapping');
    const inside=await card(d).evaluate(c=>{const cr=c.getBoundingClientRect();return [...c.querySelectorAll('.pkName,.pkType span,.frS,.pTag,.devName')].every(e=>{const r=e.getBoundingClientRect();return r.left>=cr.left-0.5&&r.right<=cr.right+0.5})});
    assert.ok(inside,d+' content inside the card');
  }
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  await page.evaluate(()=>window.scrollTo(0,document.querySelector('#stageDevices').getBoundingClientRect().top+scrollY-8));
  await page.screenshot({path:path.join(__dirname,'artifacts',`v29-team-${width}.png`)});
});

test('nothing is dropped: names in full, 撃種｜戦型｜種族 (未登録 when unknown), all fruits incl. a 4th, 仮選択｜適正未登録, 借用中', async()=>{
  await seed(BASE);
  const c1=await txt(card('メイン'));
  assert.match(c1,/架空とても長い端末名のマフティー.*キャラを変更.*架空ミライ・架空ピースフルAI.*貫通｜バランス型｜亜人.*熱き友撃EL.*同族加命撃L.*同族加撃L.*将命削りM/);
  assert.equal(await card('メイン').locator('.pkFr .frS').count(),4);
  assert.deepEqual(await card('メイン').locator('.pkFr .frS').evaluateAll(es=>es.map(e=>e.title)),['熱き友撃の力 特級EL','同族の絆・加命撃 特級L','同族の絆・加撃 特級L','将命削りの力 特級M'],'full names kept, order kept');
  assert.equal(await card('サブ1').locator('.pkFr .frS').count(),3);
  const prov=card('サブ2').locator('.pTag.prov');
  assert.equal(await txt(prov),'仮選択｜適正未登録');assert.equal(await prov.getAttribute('title'),'仮選択：このステージの適正は未登録');
  assert.match(await txt(card('サブ2')),/架空ルシファー.*反射｜砲撃型｜妖精.*仮選択｜適正未登録/);
  assert.match(await txt(card('サブ3')),/架空とても長いキャラクター名ロングロングネーム.*未登録｜未登録｜未登録.*借用中・元 サブ4/);
  assert.doesNotMatch(await txt(page.locator('#stageDevices')),/形態|獣神化|個体要確認/,'no form display; review status stays off the card');
  await keep();
});

test('change / choose buttons still work; picks, units and fruits are kept; backup → restore and reload unchanged', async()=>{
  await seed(BASE);
  await card('サブ2').locator('[data-act="openPicker"]').click();
  assert.equal(await page.locator('#pickModal').evaluate(m=>m.classList.contains('open')),true);
  await page.locator('#pkList .pkItem[data-id="u3"]').click();
  let d=await keep();same(d.picks,BASE.picks,'choosing the same unit again keeps the team');
  await card('メイン').locator('[data-act="openPicker"]').click();await page.click('[data-act="pickClear"]');
  assert.equal(await txt(card('メイン')),'①架空とても長い端末名のマフティー（メイン）適正あり 1体＋ キャラを選ぶ 候補：架空ミライ・架空ピースフルAI選ぶ ›');
  const b=await card('メイン').locator('[data-act="openPicker"]').boundingBox();assert.ok(b.height>=44);
  await card('メイン').locator('[data-act="openPicker"]').click();await page.locator('#pkList .pkItem[data-id="u1"]').click();
  d=await keep();same(d.picks,BASE.picks);
  const snap=await page.evaluate(()=>{const x=JSON.parse(JSON.stringify(db));delete x.ui;return x});
  await page.reload();same(await page.evaluate(()=>{const x=JSON.parse(JSON.stringify(db));delete x.ui;return x}),snap,'reload');
  const bk=await page.evaluate(()=>backupJson());
  const fresh=await context.newPage();await fresh.goto(url);
  await fresh.evaluate(()=>{db.ui.view='admin';render();window.confirm=()=>true});
  await fresh.evaluate(v=>{const t=document.querySelector('#bkText');t.value=v;t.dispatchEvent(new Event('input',{bubbles:true}))},bk);
  await fresh.click('[data-act="restore"]');
  same(await fresh.evaluate(()=>{const x=JSON.parse(JSON.stringify(db));delete x.ui;return x}),snap,'restore');
  await fresh.close();
});

test('the compact style only applies to team cards: device screen cards and the old-tab warning are unchanged', async()=>{
  await seed(BASE);
  await page.click('[data-act="view"][data-view="device"]');
  const fs2=await page.locator('#deviceCards .uCard .frS').first().evaluate(e=>getComputedStyle(e).fontSize);
  assert.equal(fs2,'12.5px','device screen fruit chips keep their size');
  await page.click('[data-act="view"][data-view="stage"]');
  const other=await context.newPage();await other.goto(url);await other.click('[data-act="view"][data-view="chara"]');await other.close();
  await page.waitForFunction(()=>!document.getElementById('staleBar').hidden);
  const raw=await page.evaluate(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k),KEY);
  await card('メイン').locator('[data-act="openPicker"]').dispatchEvent('click');await page.locator('#pkList .pkItem[data-id="u1"]').dispatchEvent('click');
  assert.equal(await page.evaluate(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k),KEY),raw,'old tab still cannot save');
  assert.equal(await page.locator('#staleBar [data-act="staleReload"]').isVisible(),true);
});

for(const [w,h] of [[390,664],[360,640]]) test(`${w}x${h}: with the heading 今回の編成 at the top, four plain team cards fit above the bottom navigation; an unselected device is one compact row`, async()=>{
  await page.setViewportSize({width:w,height:h});
  const plain=JSON.parse(JSON.stringify(BASE));plain.suits.push({id:'s9',stageKey:K,formId:'f3',source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'});plain.units[3].device='サブ3';delete plain.units[3].lentTo;
  await seed(plain);
  const r=await page.evaluate(()=>{const hd=document.querySelector('.teamHead');window.scrollTo(0,hd.getBoundingClientRect().top+scrollY-4);
    const cs=[...document.querySelectorAll('#stageDevices .pickDev')], nav=document.getElementById('nav').getBoundingClientRect().top;
    return {headVisible:hd.getBoundingClientRect().top>=0,fully:cs.filter(c=>c.getBoundingClientRect().bottom<=nav+0.5).length,hscroll:document.documentElement.scrollWidth>innerWidth}});
  assert.deepEqual(r,{headVisible:true,fully:4,hscroll:false});
  await page.screenshot({path:path.join(__dirname,'artifacts',`v29-fit-${w}x${h}.png`)});
  // 未選択の端末は「端末名＋［＋ キャラを選ぶ］」の1行だけ
  await card('サブ1').locator('[data-act="openPicker"]').click();await page.click('[data-act="pickClear"]');
  const c=await card('サブ1').boundingBox();assert.ok(c.height<=100,'unselected card is one row plus the v35 candidate line: '+c.height);
  assert.equal(await txt(card('サブ1')),'②架空iPad（サブ1）適正あり 1体＋ キャラを選ぶ 候補：架空ネオ選ぶ ›');
  await card('サブ1').locator('[data-act="openPicker"]').click();assert.equal(await page.locator('#pickModal').evaluate(m=>m.classList.contains('open')),true,'choosing still works');
});
