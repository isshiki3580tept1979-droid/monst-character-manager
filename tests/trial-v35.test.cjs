// v35：ステージ画面の編成カードに、端末ごとの適正所持状況（適正あり／貸出中／該当なし／未確認／適正未登録）を出す。
// 根拠は所持個体と所持確認の記録だけ。適正図鑑キャラ（個体なし）・名前の一致だけでは所持にしない。表示だけで何も保存しない。架空データだけを使う。
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
  assert.deepEqual(external.filter(u=>!/^data:|^blob:/.test(u)),[],'no request leaves the page');
  assert.ok(await page.evaluate(key=>window.storageAccess.every(([,k])=>k===key),KEY),'app reads/writes only trial-v2');
  const sentinels=await page.evaluate(keys=>keys.map(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k)),protectedKeys);
  assert.deepEqual(sentinels,protectedKeys.map(k=>'protected sentinel '+k));
  await context.close();
});
const click=async selector=>page.locator(selector).first().click();
async function seed(raw){await page.evaluate(({key,raw})=>localStorage.setItem(key,JSON.stringify(raw)),{key:KEY,raw});await page.reload()}
const stored=()=>page.evaluate(key=>JSON.parse(Object.getPrototypeOf(localStorage).getItem.call(localStorage,key)||'null'),KEY);
const txt=async l=>(await l.textContent()).replace(/\s+/g,' ').trim();
const plain=o=>JSON.parse(JSON.stringify(o));
const {teamView,choose}=require('./helpers/team.cjs');

const K1='天魔の孤城::試練の間・第1の間', K2='天魔の孤城::試練の間・第2の間', K3='天魔の孤城::試練の間・第3の間';
const F=(id,cid,x={})=>({id,characterId:cid,name:'',short:'',race:'',battleType:'',shotType:'',unknownForm:true,...x});
const FR=[{name:'熱き友撃の力',grade:'特級EL',kind:''},{name:'同族の絆・加命撃',grade:'特級L',kind:''}];
const U=(id,formId,device,no,x={})=>({id,formId,device,no,fruits:FR,memo:'',epithet:'',verificationStatus:'VERIFIED',importSource:'MANUAL',...x});
const S=(id,stageKey,formId,verificationStatus='VERIFIED')=>({id,stageKey,formId,source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus,note:''});
const OC=(id,device,characterName,status)=>({id,device,characterName,requestedFormName:'',scope:'天魔の孤城',stage:'試練の間・第1の間',stageKey:K1,status,checkedAt:'',importedAt:'',source:'test'});
// 架空ネオ（メイン1体・サブ1に2体）、架空リムル（メイン・適正は未検証だけ）、架空ヤクモ（サブ2所持 → サブ3へ貸出中）、架空図鑑キャラ（適正図鑑のみ・個体なし）、架空ネオα（サブ1・別キャラ・適正なし）
const WORLD=()=>({characters:[],deviceNames:{'メイン':'架空マフティー','サブ1':'架空iPad'},
  master:{characters:[{id:'c1',name:'架空ネオ'},{id:'c2',name:'架空リムル'},{id:'c3',name:'架空ヤクモ'},{id:'c4',name:'架空図鑑キャラ',origin:'SUIT_CATALOG'},{id:'c5',name:'架空ネオα'}],
    forms:[F('f1','c1',{race:'亜人',battleType:'バランス型',shotType:'貫通'}),F('f2','c2',{race:'魔族',battleType:'砲撃型',shotType:'反射'}),F('f3','c3',{race:'神',battleType:'スピード型',shotType:'反射'}),
      F('f4','c4',{name:'獣神化改',unknownForm:false,origin:'SUIT_CATALOG'}),F('f5','c5',{race:'亜人',battleType:'パワー型',shotType:'貫通'})]},
  units:[U('u1','f1','メイン',1),U('u2','f1','サブ1',1),U('u3','f1','サブ1',2),U('u4','f2','メイン',1,{verificationStatus:'NEEDS_REVIEW'}),U('u5','f3','サブ2',1,{lentTo:'サブ3'}),U('u6','f5','サブ1',1)],
  suits:[S('s1',K1,'f1'),S('s2',K1,'f2','UNVERIFIED'),S('s3',K1,'f3'),S('s4',K1,'f4'),S('s5',K3,'f4'),S('s6',K3,'f2','NEEDS_REVIEW')],
  ownershipChecks:[OC('o1','サブ4','架空ネオ','NOT_OWNED'),OC('o2','サブ4','架空リムル','NOT_OWNED'),OC('o3','サブ4','架空ヤクモ','NOT_OWNED'),OC('o4','サブ4','架空図鑑キャラ','NOT_OWNED'),
    OC('o5','サブ5','架空ネオ','OWNED_EXACT'),OC('o6','サブ5','架空リムル','NEEDS_REVIEW')],
  picks:{[K1]:{'メイン':'u1'},[K2]:{'メイン':'u4'}},useDevs:{[K1]:['メイン','サブ1','サブ2','サブ3'],[K2]:['メイン','サブ1','サブ2','サブ3'],[K3]:['メイン','サブ1','サブ4','サブ5']},
  ui:{view:'stage',quest:'天魔の孤城',stage:{'天魔の孤城':'試練の間・第1の間'}}});
// 保存時の正規化（項目の補完）に影響されない形で、保護対象を比べる
const PROT=d=>plain({units:d.units.map(u=>[u.id,u.formId,u.device,u.no,u.fruits,u.lentTo||null,u.verificationStatus,u.memo||'',u.epithet||'']),suits:d.suits.map(x=>[x.id,x.stageKey,x.formId,x.verificationStatus,x.grade]),
  ownershipChecks:d.ownershipChecks.map(o=>[o.device,o.characterName,o.status]),idLinks:(d.idLinks||[]).length,suitAliases:(d.suitAliases||[]).length,chars:d.master.characters.map(c=>[c.id,c.name,c.origin||'']),forms:d.master.forms.map(x=>[x.id,x.characterId,x.name]),deviceNames:d.deviceNames,picks:d.picks});
const card=d=>page.locator(`.pickDev[data-dev="${d}"]`);
const chips=d=>card(d).locator('.sChip').allTextContents();
const kind=d=>card(d).getAttribute('data-suit');
const hint=d=>card(d).locator('.suitHint');
const badges=()=>page.locator('.dpBtn').evaluateAll(bs=>bs.map(b=>[b.dataset.dev,b.querySelector('.dpSuit')?.textContent||'']));
const stage=async s=>{await click(`[data-act="stage"][data-stage="${s}"]`)};

test('1. each device card says whether a suitable unit is there: 適正あり with the unit count (never counting the catalog-only character or a same-name different character), 貸出中, 借用; the heading counts stage characters separately', async()=>{
  await seed(WORLD());const d0=await stored();
  assert.deepEqual(await chips('メイン'),['適正候補あり 2体'],'ネオ (verified suit) + リムル (unverified suit only)');
  assert.deepEqual(await chips('サブ1'),['適正候補あり 2体'],'two units of ネオ; 架空ネオα is a different character and is not counted');
  assert.deepEqual(await chips('サブ2'),['貸出中 1体'],'ヤクモ is owned by サブ2 but lent to サブ3');
  assert.deepEqual(await chips('サブ3'),['適正候補あり 1体','借用1']);
  assert.deepEqual([await kind('メイン'),await kind('サブ1'),await kind('サブ2'),await kind('サブ3')],['has','has','lent','has']);
  assert.equal(await txt(page.locator('#teamHead')),'今回の編成 ステージの適正 4キャラ（確認済み3）','stage-level count: 4 characters incl. the catalog-only one, 3 with a verified suit');
  assert.deepEqual(await badges(),[['メイン','候補2'],['サブ1','候補2'],['サブ2','貸出中'],['サブ3','候補1'],['サブ4','なし'],['サブ5','未確認']],'the device toggles show the state for all 6 devices');
  assert.deepEqual(await stored(),d0,'display only: nothing written');
});

test('2. 該当なし only when every suitable character has a 未所持 record for that device; a device with no records or with records that do not settle it is 未確認', async()=>{
  await seed(WORLD());
  await click('[data-act="useDev"][data-dev="サブ2"]');await click('[data-act="useDev"][data-dev="サブ4"]'); // サブ2 を外してサブ4 を入れる（4/4台のまま）
  assert.deepEqual(await chips('サブ4'),['該当なし']);assert.equal(await kind('サブ4'),'none');
  assert.equal(await txt(hint('サブ4')),'所持確認で未所持：4キャラ');
  await click('[data-act="useDev"][data-dev="サブ3"]');await click('[data-act="useDev"][data-dev="サブ5"]');
  assert.deepEqual(await chips('サブ5'),['未確認']);assert.equal(await kind('サブ5'),'unknown');
  assert.equal(await txt(hint('サブ5')),'所持の記録なし 2キャラ・所持確認のみ（個体未登録） 1・所持確認が要確認 1','an OWNED record without a unit and a NEEDS_REVIEW record never become 適正あり or 該当なし');
  // 所持確認の記録が1件も無い端末（ownershipChecks を空にする）→ 未確認（該当なしとは言わない）
  const w=WORLD();w.ownershipChecks=[];w.useDevs[K1]=['メイン','サブ4'];await seed(w);
  assert.deepEqual(await chips('サブ4'),['未確認']);assert.equal(await txt(hint('サブ4')),'所持の記録なし 4キャラ');
  const d=await stored();assert.deepEqual(d.units,w.units);assert.deepEqual(d.ownershipChecks,[]);assert.deepEqual(d.idLinks||[],[],'no ownership or link record is created from a name match');
});

test('3. a stage whose suitability is only on catalog characters (no owned unit anywhere) is 未確認 everywhere except where 未所持 is recorded; a stage with no suitability says 適正未登録', async()=>{
  await seed(WORLD());await stage('試練の間・第3の間');
  assert.deepEqual([await kind('メイン'),await kind('サブ1'),await kind('サブ4'),await kind('サブ5')],['has','unknown','none','unknown'],'メイン owns リムル (suit NEEDS_REVIEW) → 適正あり but unverified; the catalog character never counts as owned; サブ4 has 未所持 records for both (ownership records are per device, whatever stage they were checked on)');
  assert.deepEqual(await chips('メイン'),['適正候補あり 1体']);
  assert.deepEqual(await chips('サブ1'),['未確認']);
  assert.equal(await txt(hint('サブ1')),'所持の記録なし 2キャラ');
  assert.equal(await txt(hint('サブ4')),'所持確認で未所持：2キャラ');
  assert.equal(await txt(page.locator('#teamHead')),'今回の編成 ステージの適正 2キャラ（確認済み1）');
  await stage('試練の間・第2の間');
  for(const d of ['メイン','サブ1','サブ2','サブ3']){assert.deepEqual(await chips(d),['適正未登録']);assert.equal(await kind(d),'nostage')}
  assert.equal(await txt(hint('サブ1')),'このステージの適正はまだ登録されていません');
  assert.equal(await txt(page.locator('#teamHead')),'今回の編成 適正 未登録');
  assert.deepEqual(await badges(),[['メイン',''],['サブ1',''],['サブ2',''],['サブ3',''],['サブ4',''],['サブ5','']]);
});

test('4. unverified suitability is shown as such and never promoted: the card chip, the unselected hint and the choose list all say 未検証; nothing changes the stored status', async()=>{
  const w=WORLD();w.suits=[S('s2',K1,'f2','UNVERIFIED')];w.picks={};await seed(w);
  assert.deepEqual(await chips('メイン'),['適正候補あり 1体']);
  assert.equal(await txt(hint('メイン')),'候補：架空リムル選ぶ ›');
  const v=await teamView(page,'メイン');assert.deepEqual(v.cand,['架空リムル 個体1（未検証）']);
  assert.equal((await stored()).suits[0].verificationStatus,'UNVERIFIED');
});

test('5. an unselected device shows its candidates (each character once, up to 3 then ほかN) and the hint opens the choose list with the suitable units first; choosing keeps units, fruits, lending and the other picks', async()=>{
  const w=WORLD();w.picks={[K2]:{'メイン':'u4'}};
  [['c6','架空甲'],['c7','架空乙'],['c8','架空丙']].forEach(([id,n],i)=>{w.master.characters.push({id,name:n});w.master.forms.push(F('f'+(6+i),id));w.units.push(U('u'+(7+i),'f'+(6+i),'サブ1',1));w.suits.push(S('s'+(7+i),K1,'f'+(6+i)))});
  await seed(w);const d0=await stored();
  assert.equal(await txt(hint('メイン')),'候補：架空ネオ、架空リムル選ぶ ›');
  assert.equal(await txt(hint('サブ1')),'候補：架空ネオ、架空乙、架空甲 ほか1選ぶ ›','2 units of ネオ count once in the names; 4 characters → 3 + ほか1');
  assert.deepEqual(await chips('サブ1'),['適正候補あり 5体']);
  assert.equal(await card('サブ1').locator('button.suitHint').count(),1);assert.equal(await card('サブ2').locator('button.suitHint').count(),0,'only 適正あり is a button');
  await card('サブ1').locator('[data-act="pickHint"]').click();
  assert.ok(await page.locator('#pickModal').evaluate(m=>m.classList.contains('open')));
  assert.equal(await txt(page.locator('#pkTitle')),'② 架空iPad（サブ1）で使うキャラ');
  assert.deepEqual(await page.locator('#pkList .pkItem[data-group="cand"]').evaluateAll(es=>es.map(e=>e.dataset.id)),['u2','u3','u8','u7','u9'],'suitable units first (name order: ネオ, 乙, 甲, 丙); 架空ネオα stays in 仮選択');
  await page.locator('#pkList .pkItem[data-id="u3"]').click();
  assert.equal(await card('サブ1').locator('.suitHint').count(),0,'the hint goes away once a unit is chosen');
  assert.match(await txt(card('サブ1')),/適正候補あり 5体.*キャラを変更.*架空ネオ.*個体2.*貫通｜バランス型｜亜人.*熱き友撃EL.*同族加命撃L/,'chip in the head row with the button, then name → 撃種｜戦型｜種族 → fruits as before');
  const d=await stored();
  assert.deepEqual(d.picks,{[K2]:{'メイン':'u4'},[K1]:{'サブ1':'u3'}});
  assert.deepEqual(PROT({...d,picks:null}),PROT({...d0,picks:null}),'units, suits, records, master and device names untouched');
});

test('6. picks are kept across stage switches and device toggles; the status never changes a pick by itself; a stale pick keeps its note and the device still shows its status', async()=>{
  await seed(WORLD());const d0=await stored();
  await stage('試練の間・第2の間');assert.match(await txt(card('メイン')),/適正未登録.*キャラを変更.*架空リムル/);
  await stage('試練の間・第1の間');assert.match(await txt(card('メイン')),/適正候補あり 2体.*キャラを変更.*架空ネオ/);
  await click('[data-act="useDev"][data-dev="メイン"]');await click('[data-act="useDev"][data-dev="メイン"]');
  assert.deepEqual((await stored()).picks,d0.picks);
  const w=WORLD();w.picks[K1]={'サブ1':'u5'};await seed(w); // サブ1 に、今はサブ3にいる貸出中の個体を選んでいた
  const c=await txt(card('サブ1'));
  assert.match(c,/適正候補あり 2体/);assert.match(c,/この個体は今サブ3にいます（貸出中）。選び直してください/);
  assert.deepEqual((await stored()).picks,w.picks,'the stale pick is kept, not replaced by a candidate');
  assert.deepEqual((await stored()).useDevs[K1],['メイン','サブ1','サブ2','サブ3'],'今回使う端末 is kept (4/4)');
});

test('7. the choose list explains why there is no suitable unit (lent out / 未所持 / no record) without changing the existing messages otherwise', async()=>{
  await seed(WORLD());
  await card('サブ2').locator('[data-act="openPicker"]').click();
  assert.match(await txt(page.locator('#pkList')),/この端末にいるキャラがいません。（この端末の適正キャラは貸出中：架空ヤクモ→サブ3）キャラ画面の/);
  await page.click('#pickModal [data-act="close"]');
  const w=WORLD();w.units.push(U('u9','f5','サブ4',1));w.useDevs[K1]=['メイン','サブ4','サブ5'];w.units.push(U('u10','f5','サブ5',1));await seed(w);
  await card('サブ4').locator('[data-act="openPicker"]').click();
  assert.match(await txt(page.locator('#pkList')),/適正キャラはいません（所持確認で未所持）/);await page.click('#pickModal [data-act="close"]');
  await card('サブ5').locator('[data-act="openPicker"]').click();
  assert.match(await txt(page.locator('#pkList')),/適正キャラはいません（所持の記録なし。該当なしとは限りません）/);await page.click('#pickModal [data-act="close"]');
});

test('8. 390px (and 360px): chips sit in the head row so selected cards keep their v29 height; an unselected card is one row plus the candidate line; everything stays inside the card and tappable; no horizontal scroll', async()=>{
  for(const width of [390,360]){
    await page.setViewportSize({width,height:844});
    const w=WORLD();w.picks={[K1]:{'メイン':'u1','サブ3':'u5'}};await seed(w);
    const m=await page.evaluate(()=>{const cs=[...document.querySelectorAll('#stageDevices .pickDev')];return {hscroll:document.documentElement.scrollWidth>innerWidth,
      heights:cs.map(c=>Math.round(c.getBoundingClientRect().height)),heads:cs.map(c=>Math.round(c.querySelector('.devHead').getBoundingClientRect().height)),
      inside:cs.every(c=>{const cr=c.getBoundingClientRect();return [...c.querySelectorAll('.sChip,.suitHint,.pkName,.frS,.devName,.pickBtn')].every(e=>{const r=e.getBoundingClientRect();return r.left>=cr.left-0.5&&r.right<=cr.right+0.5})}),
      hintH:[...document.querySelectorAll('button.suitHint')].map(b=>Math.round(b.getBoundingClientRect().height)),
      rightSide:cs.every(c=>c.querySelector('.pickBtn').getBoundingClientRect().left>c.querySelector('.devName').getBoundingClientRect().right-0.5)}});
    assert.equal(m.hscroll,false,width+'px');
    assert.ok(m.inside&&m.rightSide,width+'px: chips and hint inside the card, button on the right');
    assert.ok(m.heights[0]<=160&&m.heights[3]<=176,'selected cards stay compact: '+m.heights);
    assert.ok(m.heights[1]<=100&&m.heights[2]<=100,'unselected card = head + one candidate/status line: '+m.heights);
    assert.ok(m.hintH.every(h=>h>=32),'hint button tappable');
    for(const d of ['メイン','サブ1','サブ2','サブ3']){const b=await card(d).locator('[data-act="openPicker"]').boundingBox();assert.ok(b.height>=44&&b.x+b.width<=width)}
    for(const b of await page.locator('.dpBtn').all()){const r=await b.boundingBox();assert.ok(r.height>=44&&r.x>=0&&r.x+r.width<=width,'device toggle with badge fits')}
    fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
    await page.evaluate(()=>window.scrollTo(0,document.getElementById('devPick').getBoundingClientRect().top+scrollY-8));
    await page.screenshot({path:path.join(__dirname,'artifacts',`v35-team-${width}.png`)});
  }
});

test('9. 6 devices: a device outside 今回使う端末 still has its state on the toggle; adding it shows its card with the same state; the team order and 4-device limit are unchanged', async()=>{
  await seed(WORLD());
  await click('[data-act="useDev"][data-dev="サブ5"]');
  assert.match(await txt(page.locator('#devPickMsg')),/4台まで/);
  await click('[data-act="useDev"][data-dev="サブ1"]');await click('[data-act="useDev"][data-dev="サブ5"]');
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#stageDevices .pickDev')].map(x=>x.dataset.dev+':'+x.dataset.suit)),['メイン:has','サブ2:lent','サブ3:has','サブ5:unknown']);
  assert.deepEqual((await badges()).find(b=>b[0]==='サブ1'),['サブ1','候補2'],'the toggle keeps the state of the device that was taken out');
});

// ---- 公開前の改善：キャラ名だけで一致した適正の表示、旧登録（従来方式）の所持記録 ----
// 架空ネオ：所持個体の形態は f1（形態未確認）、適正は図鑑の形態 fX（獣神化改）にだけある → キャラ名で一致
const NAMEONLY=()=>{const w=WORLD();w.master.forms.push(F('fX','c1',{name:'獣神化改',unknownForm:false,origin:'SUIT_CATALOG'}));
  w.suits=[S('sX',K1,'fX'),S('s1',K1,'f1')];w.picks={};w.useDevs[K1]=['メイン','サブ1','サブ2','サブ3'];return w};
test('10. a name-only match is not shown as confirmed: the card has one 適正候補あり chip (light blue, no extra キャラ名一致 badge) with the breakdown in its title; the choose list marks キャラ名で一致; green only when every unit is on the suited form and the suit is verified; nothing is linked or saved', async()=>{
  const cls=d=>card(d).locator('.sChip').first().getAttribute('class');
  const title=d=>card(d).locator('.sChip').first().getAttribute('title');
  const w=NAMEONLY();w.suits=[S('sX',K1,'fX')];await seed(w);const d0=await stored();
  assert.deepEqual(await chips('サブ1'),['適正候補あり 2体'],'one chip, no キャラ名一致 badge');
  assert.equal(await cls('サブ1'),'sChip cd','light blue: not confirmed');
  assert.equal(await title('サブ1'),'この端末にいる、このステージの適正キャラの個体：架空ネオ。キャラ名で一致 2体（進化形態まで同じとは限りません）。詳しくは「キャラを選ぶ」で確認できます');
  assert.equal(await txt(hint('サブ1')),'候補：架空ネオ選ぶ ›');
  assert.equal(await page.locator('#stageDevices').getByText('キャラ名一致').count(),0,'the cards never list キャラ名一致 badges');
  await card('サブ1').locator('[data-act="pickHint"]').click();
  assert.deepEqual(await page.locator('#pkList .pkItem[data-group="cand"]').evaluateAll(es=>es.map(e=>[e.dataset.id,[...e.querySelectorAll('.pTag')].map(t=>t.textContent)])),[['u2',['キャラ名で一致']],['u3',['キャラ名で一致']]],'the detail is in the choose list');
  await page.click('#pickModal [data-act="close"]');
  assert.deepEqual(await stored(),d0,'display only');
  // 全員が適正の形態と同じ形態・適正も確認済み → 緑（ネオの個体は f1 の適正 s1 と同じ形態）
  await seed(NAMEONLY());
  assert.deepEqual(await chips('サブ1'),['適正候補あり 2体']);assert.equal(await cls('サブ1'),'sChip ok');
  assert.match(await title('サブ1'),/（進化形態・適正とも確認済み）$/);
  // 形態は同じでも適正が未検証 → 青（メイン：リムルの適正 s2 は未検証）
  const w2=NAMEONLY();w2.suits.push(S('s2',K1,'f2','UNVERIFIED'));await seed(w2);
  assert.deepEqual(await chips('メイン'),['適正候補あり 2体']);assert.equal(await cls('メイン'),'sChip cd');assert.match(await title('メイン'),/適正が未検証・要確認 1体/);assert.doesNotMatch(await title('メイン'),/キャラ名で一致/);
  // 混在：リムルは同じ形態・確認済み、ネオはキャラ名だけ → 青
  const w3=NAMEONLY();w3.suits=[S('sX',K1,'fX'),S('s2',K1,'f2')];await seed(w3);
  assert.deepEqual(await chips('メイン'),['適正候補あり 2体']);assert.equal(await cls('メイン'),'sChip cd');assert.match(await title('メイン'),/キャラ名で一致 1体/);
  assert.equal(await txt(hint('メイン')),'候補：架空ネオ、架空リムル選ぶ ›');
  assert.doesNotMatch(await txt(page.locator('#stageDevices')),/形態|獣神化/,'no form name is shown on the cards');
  assert.deepEqual((await stored()).idLinks||[],[],'no link is created');
});

// 旧登録キャラ（db.characters）・旧TOP20（rankings＋ownership）は読むだけ
const LEGACY=()=>{const w=WORLD();w.useDevs[K1]=['メイン','サブ4','サブ5','サブ3'];w.picks={};
  w.characters=[{id:'L1',name:'架空ネオ',device:'サブ5',lentTo:null,count:1,memo:'旧メモ',stages:[K1]},
    {id:'L2',name:'架空ヤクモ',device:'サブ4',lentTo:'メイン',count:1,memo:'',stages:[]},
    {id:'L3',name:'架空ネオン',device:'サブ5',lentTo:null,count:1,memo:'',stages:[K1]}];
  const K9='破界の星墓::ティル・ナ・ノーグ';
  w.rankings={[K9]:{updatedAt:null,entries:Array.from({length:20},(_,i)=>({rank:i+1,name:i===0?'架空リムル':i===1?'架空図鑑キャラ':''}))}};
  w.ownership={[K9]:{'サブ4':{updatedAt:null,ranks:{'1':{status:'alt-form',count:1},'2':{status:'not-owned',count:0}}},'サブ5':{updatedAt:null,ranks:{'2':{status:'owned',count:1}}}}};
  return w};
test('11. legacy ownership records (old registered characters, old TOP20 owned / alt-form) give 旧登録あり・要確認 — never 適正あり or 該当なし; exact names only; nothing is converted or created', async()=>{
  const w=LEGACY();await seed(w);const d0=await stored();
  assert.equal(await kind('サブ4'),'legacy','サブ4 has 未所持 records for every character, but the old TOP20 says リムル is owned (別形態) → not 該当なし');
  assert.deepEqual(await chips('サブ4'),['旧登録あり・要確認']);
  assert.equal(await txt(hint('サブ4')),'旧登録に所持記録あり・要確認：架空ヤクモ（貸出中）、架空リムル');
  assert.equal(await kind('サブ5'),'legacy');
  assert.equal(await txt(hint('サブ5')),'旧登録に所持記録あり・要確認：架空ネオ、架空図鑑キャラ','架空ネオン (similar name) is ignored; the catalog character appears only because the old TOP20 records it as owned');
  assert.deepEqual(await chips('メイン'),['適正候補あり 2体'],'new-method units win; the legacy character lent to メイン does not change it');
  assert.deepEqual((await badges()).filter(b=>['サブ4','サブ5'].includes(b[0])),[['サブ4','旧登録'],['サブ5','旧登録']]);
  await card('サブ4').locator('[data-act="openPicker"]').click();
  assert.match(await txt(page.locator('#pkList')),/（この端末の適正キャラは旧登録に所持記録あり・要確認：架空ヤクモ、架空リムル）/);
  assert.equal(await page.locator('#pkList .pkItem').count(),0,'legacy characters are not offered as units');
  await page.click('#pickModal [data-act="close"]');
  const d=await stored();
  for(const k of ['characters','rankings','ownership','units','picks','ownershipChecks','suits']) assert.deepEqual(d[k],d0[k],k+' unchanged');
  assert.equal(d.units.length,w.units.length,'no unit created');
});

test('12. 390px / 360px with several states at once (適正あり＋キャラ名一致, 貸出中, 該当なし, 旧登録): chips wrap inside the card, buttons stay tappable, no horizontal scroll', async()=>{
  const w=LEGACY();w.master.forms.push(F('fX','c1',{name:'獣神化改',unknownForm:false,origin:'SUIT_CATALOG'}));w.suits.push(S('sX',K1,'fX'));
  w.characters=[{id:'L9',name:'架空リムル',device:'サブ5',lentTo:null,count:1,memo:'',stages:[]}];w.ownership={};w.picks={[K1]:{'メイン':'u1'}};w.useDevs[K1]=['メイン','サブ2','サブ4','サブ5'];
  for(const width of [390,360]){
    await page.setViewportSize({width,height:844});await seed(w);
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#stageDevices .pickDev')].map(x=>x.dataset.dev+':'+x.dataset.suit)),['メイン:has','サブ2:lent','サブ4:none','サブ5:legacy']);
    const m=await page.evaluate(()=>{const cs=[...document.querySelectorAll('#stageDevices .pickDev')];return {hscroll:document.documentElement.scrollWidth>innerWidth,heights:cs.map(c=>Math.round(c.getBoundingClientRect().height)),
      inside:cs.every(c=>{const cr=c.getBoundingClientRect();return [...c.querySelectorAll('.sChip,.suitHint,.pkName,.frS,.devName,.pickBtn')].every(e=>{const r=e.getBoundingClientRect();return r.left>=cr.left-0.5&&r.right<=cr.right+0.5})})}});
    assert.equal(m.hscroll,false);assert.ok(m.inside,'inside the card');assert.ok(m.heights.every(h=>h<=176),'compact: '+m.heights);
    for(const d of ['メイン','サブ2','サブ4','サブ5']){const b=await card(d).locator('[data-act="openPicker"]').boundingBox();assert.ok(b.height>=44&&b.x+b.width<=width)}
    await page.evaluate(()=>window.scrollTo(0,document.getElementById('devPick').getBoundingClientRect().top+scrollY-8));
    await page.screenshot({path:path.join(__dirname,'artifacts',`v35-states-${width}.png`)});
  }
});
