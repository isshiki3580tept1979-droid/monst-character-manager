// Round 15: STEP3-2 進化形態未確認の個体を「別形態で所持（！）」と断定しない所持判定（適正一覧の所持表示）。
// 架空データだけを使う。隔離ブラウザで実行し、外部へは通信しない。Same harness as trial-v10.test.cjs.
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
const noUi=d=>{const x=JSON.parse(JSON.stringify(d));delete x.ui;return x};
const K='破界の星墓::パライソ';
const F=(id,cid,name,extra={})=>({id,characterId:cid,name,short:'',race:'',battleType:'',shotType:'',...extra});
const U=(id,formId,device,no)=>({id,formId,device,no,fruits:[],memo:''});
// 架空キャラ：X（確認済み形態 fX1・fX2、未確認 fXu）、似た名前の別キャラ Xα（未確認 fYu）、適正は fX1 に1件
function world(units,extraSuits=[]){
  return {characters:[],master:{characters:[{id:'cX',name:'架空スカアハ'},{id:'cY',name:'架空スカアハα'},{id:'cZ',name:'架空別キャラ'}],
    forms:[F('fX1','cX','架空の形態一'),F('fX2','cX','架空の形態二'),F('fXu','cX','',{unknownForm:true,monsterNo:'99216'}),F('fYu','cY','',{unknownForm:true}),F('fZu','cZ','',{unknownForm:true})]},
    units,suits:[{id:'s1',stageKey:K,formId:'fX1',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'VERIFIED'},...extraSuits],
    ui:{view:'stage',quest:'破界の星墓',stage:{'破界の星墓':'パライソ'}}};
}
const st=(formId,dev)=>page.evaluate(([f,d])=>formStatus(f,d),[formId,dev]);
const row=async(id='s1')=>(await page.locator(`#suitPanel .sRow:has([data-id="${id}"])`).textContent()).replace(/\s+/g,' ');

test('進化形態未確認 only: shown as 所持・形態未確認, never as 別形態（！） or 未所持', async()=>{
  await seed(world([U('u1','fXu','サブ1',1)]));
  assert.equal(await st('fX1','サブ1'),'unconfirmed');
  const t=await row();
  assert.match(t,/所持：サブ1（所持・形態未確認）/);assert.doesNotMatch(t,/サブ1！/);assert.doesNotMatch(t,/所持なし/);
});

test('confirmed exact form: 所持; confirmed other form only: 別形態（！）; nothing: 所持なし', async()=>{
  await seed(world([U('u1','fX1','メイン',1),U('u2','fX2','サブ2',1)]));
  assert.equal(await st('fX1','メイン'),'owned');assert.equal(await st('fX1','サブ2'),'alt-form');assert.equal(await st('fX1','サブ3'),'not-owned');
  const t=await row();assert.match(t,/所持：メイン×1 サブ2！/);
  await seed(world([]));assert.match(await row(),/所持なし/);assert.equal(await st('fX1','メイン'),'not-owned');
});

test('mixed on one device: a confirmed exact form wins; other form + unconfirmed is ambiguous → 所持・形態未確認', async()=>{
  await seed(world([U('u1','fX1','メイン',1),U('u2','fXu','メイン',2),U('u3','fX2','サブ1',1),U('u4','fXu','サブ1',2)]));
  assert.equal(await st('fX1','メイン'),'owned','unconfirmed unit does not take away the confirmed ownership');
  assert.equal(await st('fX1','サブ1'),'unconfirmed','not decided as 別形態 when an unconfirmed unit could be the form');
  const t=await row();assert.match(t,/メイン×1/);assert.match(t,/サブ1（所持・形態未確認）/);assert.doesNotMatch(t,/サブ1！/);
});

test('a similarly named but different character is never counted (matched by character, not by name)', async()=>{
  await seed(world([U('u1','fYu','メイン',1),U('u2','fZu','サブ1',1)]));
  assert.equal(await st('fX1','メイン'),'not-owned');assert.equal(await st('fX1','サブ1'),'not-owned');
  assert.match(await row(),/所持なし/);
});

test('several devices at once; the count after ×N is confirmed exact units only; 2 unconfirmed units are shown as ×2', async()=>{
  await seed(world([U('u1','fX1','メイン',1),U('u2','fX1','メイン',2),U('u3','fXu','サブ1',1),U('u4','fXu','サブ1',2),U('u5','fX2','サブ2',1)]));
  const t=await row();
  assert.match(t,/所持：メイン×2 サブ1（所持・形態未確認×2） サブ2！/);
  assert.match(await page.locator('#suitPanel').textContent(),/「所持・形態未確認」は、その端末に同じキャラがいるものの進化形態が未確認であることを表します/);
});

test('a suitability on an unconfirmed form itself is not shown as a confirmed 所持', async()=>{
  await seed(world([U('u1','fXu','メイン',1)],[{id:'s2',stageKey:K,formId:'fXu',source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'UNVERIFIED'}]));
  assert.equal(await st('fXu','メイン'),'unconfirmed');
  assert.match(await row('s2'),/メイン（所持・形態未確認）/);
});

test('viewing does not change saved data; after reload the judgement is the same; forms stay unconfirmed', async()=>{
  await seed(world([U('u1','fXu','サブ1',1),U('u2','fX1','メイン',1)]));
  await page.click('[data-act="view"][data-view="stage"]');const before=noUi(await stored());
  const t1=await row();await page.reload();const t2=await row();
  assert.equal(t1,t2);assert.deepEqual(noUi(await stored()),before);
  const d=await stored();assert.equal(d.master.forms.find(f=>f.id==='fXu').unknownForm,true,'not filled in from 図鑑No.');
  assert.equal(d.master.forms.find(f=>f.id==='fXu').name,'');
  assert.deepEqual(d.suits.map(s=>[s.id,s.formId,s.grade]),[['s1','fX1','S']],'suitability data untouched');
});

test('manual TOP20 ownership (所持／別形態／未所持) is unchanged and still shown as entered', async()=>{
  const k='禁忌の獄::一ノ獄';
  await seed({...world([U('u1','fXu','メイン',1)]),rankings:{[k]:{entries:[{rank:1,name:'架空スカアハ'},{rank:2,name:'架空別キャラ'}]}},
    ownership:{[k]:{'メイン':{ranks:{1:{status:'alt-form'},2:{status:'not-owned'}}}}},ui:{view:'stage',quest:'禁忌の獄',stage:{'禁忌の獄':'一ノ獄'}}});
  const d=await stored();
  assert.deepEqual(d.ownership[k]['メイン'].ranks,{1:{status:'alt-form'},2:{status:'not-owned'}});
  const n=await page.evaluate(k=>[ownOf(k,'メイン',1)?.status,ownOf(k,'メイン',2)?.status],k);
  assert.deepEqual(n,['alt-form','not-owned'],'manual records are read as they are');
});
