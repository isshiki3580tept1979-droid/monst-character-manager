// Round 28: 撃種・戦型・種族の表示復活。ステージの端末カードと「キャラを選ぶ」候補に、キャラ名の下へ「撃種｜戦型｜種族」を出す。
// 値は個体の形態の基本情報。無ければ同じキャラの形態で1つに決まる値だけ使い、食い違い・未登録は「未登録」（推測しない）。進化形態の管理は復活させない。架空データだけ。Same harness as trial-v10.test.cjs.
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
const F=(id,cid,name,x={})=>({id,characterId:cid,name,short:'',race:'',battleType:'',shotType:'',...x});
const U=(id,formId,device,no,x={})=>({id,formId,device,no,fruits:[],memo:'',...x});
const FR4=[{name:'熱き友撃の力',grade:'特級EL',kind:''},{name:'同族の絆・加命撃',grade:'特級L',kind:''},{name:'同族の絆・加撃',grade:'特級L',kind:''},{name:'将命削りの力',grade:'特級M',kind:''}];
// 架空アルファ：基本情報あり（貫通・バランス型・亜人）、メインに2体
// 架空ベータ：個体の形態は空欄だが、同じキャラの旧形態「ハロー」に値がある（1つに決まる → その値）
// 架空ガンマ：旧形態2つで種族・撃種が食い違う（判断できない → 未登録）、戦型だけ一致（パワー型）。個体2は値のある形態そのもの
// 架空デルタ：何も登録なし（すべて未登録）。サブ1の個体をメインへ貸出中
const BASE={characters:[],deviceNames:{'メイン':'架空マフティー','サブ1':'架空iPad'},
  master:{characters:[{id:'cA',name:'架空アルファ'},{id:'cB',name:'架空ベータ'},{id:'cC',name:'架空ガンマ'},{id:'cD',name:'架空デルタ'}],
    forms:[F('fA1','cA','',{unknownForm:true,race:'亜人',battleType:'バランス型',shotType:'貫通'}),
      F('fB1','cB','ハロー',{race:'妖精',battleType:'スピード型',shotType:'反射'}),F('fB2','cB','リバース'),
      F('fC1','cC','形態一',{race:'魔族',battleType:'パワー型',shotType:'貫通'}),F('fC2','cC','形態二',{race:'神',battleType:'パワー型',shotType:'反射'}),F('fC3','cC','',{unknownForm:true}),
      F('fD1','cD','',{unknownForm:true})]},
  units:[U('uA1','fA1','メイン',1,{fruits:FR4,verificationStatus:'NEEDS_REVIEW'}),U('uA2','fA1','メイン',2),U('uB1','fB2','メイン',1),U('uC1','fC3','メイン',1),U('uC2','fC1','メイン',2),U('uD1','fD1','サブ1',1,{lentTo:'メイン'})],
  suits:['fA1','fB1','fC1','fD1'].map((f,i)=>({id:'s'+i,stageKey:K,formId:f,source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'})),
  picks:{[K]:{'メイン':'uA1'}},useDevs:{[K]:['メイン','サブ1']},ui:{view:'stage',quest:'破界の星墓',stage:{'破界の星墓':'ティル・ナ・ノーグ'}}};
const same=(a,b,msg)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),msg);
const card=d=>page.locator(`.pickDev[data-dev="${d}"]`);
const typeOf=l=>l.locator('.pkType').evaluate(e=>[...e.querySelectorAll('span:not(.sep)')].map(s=>s.textContent));
const open=async d=>{await card(d).locator('[data-act="openPicker"]').click()};
const choose=async(d,id)=>{await open(d);await page.locator(`#pkList .pkItem[data-id="${id}"]`).click()};
const keep=async()=>{const d=await stored();same(d.units,BASE.units,'units untouched');same(d.master,BASE.master,'forms untouched (values not changed or filled in)');
  assert.deepEqual(d.suits.map(s=>[s.id,s.formId]),BASE.suits.map(s=>[s.id,s.formId]));return d};

test('team card: 撃種｜戦型｜種族 is shown right under the character name, before the fruits, from the unit\'s own basic info', async()=>{
  await seed(BASE);
  const c=card('メイン');
  assert.deepEqual(await typeOf(c.locator('.pickCur')),['貫通','バランス型','亜人']);
  const order=await c.locator('.pickCur').evaluate(e=>[...e.children].map(x=>x.className.split(' ')[0]));
  assert.deepEqual(order.slice(0,3),['pkName','pkType','pkFr'],'name → types → fruits');
  assert.match(await txt(c),/キャラを変更.*架空アルファ.*貫通.*バランス型.*亜人.*熱き友撃EL.*将命削りM/);
  assert.doesNotMatch(await txt(c),/形態|獣神化|ハロー/);
  await keep();
});

test('choose list: every candidate shows the three items; values come from the character\'s basic info, disagreements and blanks are 未登録 (never guessed)', async()=>{
  await seed(BASE);
  await open('メイン');
  const t=async id=>typeOf(page.locator(`#pkList .pkItem[data-id="${id}"]`));
  assert.deepEqual(await t('uA1'),['貫通','バランス型','亜人']);
  assert.deepEqual(await t('uA2'),['貫通','バランス型','亜人'],'second unit of the same character');
  assert.deepEqual(await t('uB1'),['反射','スピード型','妖精'],'unit form is blank, the character\'s only known values are used');
  assert.deepEqual(await t('uC1'),['未登録','パワー型','未登録'],'two old forms disagree on 種族/撃種 → 未登録; 戦型 agrees');
  assert.deepEqual(await t('uC2'),['貫通','パワー型','魔族'],'the unit\'s own form wins');
  assert.deepEqual(await t('uD1'),['未登録','未登録','未登録']);
  assert.match(await txt(page.locator('#pkList .pkItem[data-id="uD1"]')),/借用中・元 架空iPad（サブ1）/);
  assert.equal(await page.locator('#pkList .pkType .unset').count(),5,'未登録 is marked as unset, not invented');
  await page.click('#pickModal .btns [data-act="close"]');
  await keep();
});

test('consistent with the character screen basic info; choosing another unit updates the card; fruits and picks kept', async()=>{
  await seed(BASE);
  await page.click('[data-act="view"][data-view="chara"]');await page.click('[data-act="charaOpen"][data-id="cB"]');
  assert.match(await txt(page.locator('.card.chara.open')),/基本情報.*妖精.*スピード型.*反射/);
  assert.equal(await page.locator('.card.chara.open [data-act="formEdit"], .card.chara.open [data-act="formAdd"]').count(),0,'no form management');
  await page.click('[data-act="view"][data-view="stage"]');
  await choose('メイン','uB1');
  assert.deepEqual(await typeOf(card('メイン').locator('.pickCur')),['反射','スピード型','妖精']);
  await choose('メイン','uC1');
  assert.deepEqual(await typeOf(card('メイン').locator('.pickCur')),['未登録','パワー型','未登録']);
  assert.match(await txt(card('メイン')),/実なし/);
  await choose('メイン','uD1');
  assert.match(await txt(card('メイン')),/架空デルタ.*未登録｜未登録｜未登録.*借用中・元 架空iPad（サブ1）/);
  await choose('メイン','uA2');
  assert.match(await txt(card('メイン')),/架空アルファ\s*個体2/);
  const d=await keep();assert.deepEqual(d.picks,{[K]:{'メイン':'uA2'}});
  await page.reload();assert.deepEqual(await typeOf(card('メイン').locator('.pickCur')),['貫通','バランス型','亜人']);
});

test('old data: forms with blank values load and show 未登録; backup → restore keeps everything; the device screen still shows the items once', async()=>{
  await seed(BASE);
  const snap=await page.evaluate(()=>{const d=JSON.parse(JSON.stringify(db));delete d.ui;return d});
  const bk=await page.evaluate(()=>backupJson());
  const fresh=await context.newPage();await fresh.goto(url);
  await fresh.evaluate(()=>{db.ui.view='admin';render();window.confirm=()=>true});
  await fresh.evaluate(v=>{const t=document.querySelector('#bkText');t.value=v;t.dispatchEvent(new Event('input',{bubbles:true}))},bk);
  await fresh.click('[data-act="restore"]');
  same(await fresh.evaluate(()=>{const d=JSON.parse(JSON.stringify(db));delete d.ui;return d}),snap);
  await fresh.close();
  await page.click('[data-act="view"][data-view="device"]');
  const dev=await txt(page.locator('#deviceCards .card[data-dev="メイン"] .uCard[data-unit="uA1"]'));
  assert.match(dev,/亜人.*バランス型.*貫通/);assert.equal((dev.match(/バランス型/g)||[]).length,1,'shown once');
  await keep();
});

test('390px: the type line stays inside the team card and the choose list; no horizontal scroll', async()=>{
  await seed(BASE);
  const fits=()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth);
  assert.ok(await fits());
  const inside=await card('メイン').evaluate(c=>{const cr=c.getBoundingClientRect();return [...c.querySelectorAll('.pkType span')].every(e=>{const r=e.getBoundingClientRect();return r.left>=cr.left-0.5&&r.right<=cr.right+0.5})});
  assert.ok(inside);
  await open('メイン');assert.ok(await fits());
  assert.ok(await page.evaluate(()=>{const e=document.querySelector('#pickModal .modal');return e.scrollWidth<=e.clientWidth}));
});
