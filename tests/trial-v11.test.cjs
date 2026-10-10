// Round 11: スクショ読取 Ver.2 との統合（アプリ内でスクショ → 読み取り → 確認画面 → 登録）と、ステージ編成の「所持キャラから仮選択」。
// 架空データだけを使う。読取アプリ（Apps Script）は開かず、window.open は記録だけにして、届く postMessage をテスト内で再現する。
// Gemini・外部への通信はしない（このページから外部へのリクエストが無いことも確かめる）。Same harness as trial-v10.test.cjs.
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
const unitsOf=(d,name)=>{const ids=new Set(d.master.forms.filter(f=>d.master.characters.find(c=>c.id===f.characterId)?.name===name).map(f=>f.id));return d.units.filter(u=>ids.has(u.formId))};
const val=id=>page.inputValue('#'+id);
const result=async()=>(await page.locator('#srResult').textContent()).replace(/\s+/g,' ');
// 読取アプリ（スクショ読取 Ver.2）が「管理アプリへ送る」で送る内容（架空のキャラ）
const READING={format:'monst-screenshot-reading-v1',characterName:'架空統合キャラ',formName:null,monsterNo:'90011',race:'亜人',battleType:'バランス型',shotType:'反射',
  fruit1:'撃種の絆・加命撃（特級L）',fruit2:'撃種の絆・加撃 特L',fruit3:'撃種の絆・加撃速（特級M）',confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[]};
const GAS_ORIGIN='https://n-abc123def-0lu-script.googleusercontent.com';
// window.open は記録だけ（本物の読取アプリは開かない）。__openReturn=null でポップアップのブロックを再現
async function stubOpen(){await page.evaluate(()=>{window.__opened=[];window.open=(u,t)=>{window.__opened.push([u,t]);return window.__openReturn===null?null:{closed:false}}})}
const opened=()=>page.evaluate(()=>window.__opened);
const pendingNonce=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('monst-trial-reader-pending')||'null')?.nonce||null);
const send=(data,origin=GAS_ORIGIN)=>page.evaluate(({data,origin})=>window.dispatchEvent(new MessageEvent('message',{data,origin})),{data,origin});
const K='禁忌の獄::一ノ獄';

test('reader: 「スクショから読み取る」 opens the reader with a one-time nonce; the result opens the confirm screen in this app', async()=>{
  await click('[data-act="view"][data-view="admin"]');await stubOpen();
  await click('[data-act="srReader"]');
  const [[u,target]]=await opened();
  assert.match(u,/^https:\/\/script\.google\.com\/macros\/s\/AKfycbzoEPUY[A-Za-z0-9_-]+\/exec\?return=manager&nonce=[A-Za-z0-9]{20,}$/);
  assert.equal(target,'_blank');
  assert.doesNotMatch(u,/AIza|key=|GEMINI/i,'no API key / secret in the URL');
  const nonce=new URL(u).searchParams.get('nonce');assert.equal(await pendingNonce(),nonce);
  assert.match(await page.locator('#srMsg').textContent(),/読取アプリを開きました/);
  const before=await snapshot();
  await send({type:'msr-reading',nonce,reading:READING});
  // 確認画面（貼り付けと同じ検証・同じ入力欄）。自動では登録しない
  assert.equal(await page.locator('#srEdit').isVisible(),true);
  assert.deepEqual([await val('srF_characterName'),await val('srF_monsterNo'),await val('srF_race'),await val('srF_battleType'),await val('srF_shotType')],['架空統合キャラ','90011','亜人','バランス型','反射']);
  assert.deepEqual([await val('srFr1Name'),await val('srFr1Grade'),await val('srFr2Name'),await val('srFr2Grade'),await val('srFr3Name'),await val('srFr3Grade')],
    ['撃種の絆・加命撃','特級L','撃種の絆・加撃','特級L','撃種の絆・加撃速','特級M']);
  assert.match(await page.locator('#srMsg').textContent(),/読取アプリから受け取りました/);
  const d0=await snapshot();assert.deepEqual([d0.master,d0.units],[before.master,before.units],'nothing registered automatically');
  assert.equal(await pendingNonce(),null,'the nonce is used up');
  // 登録先の端末を選んで確認 → 登録（進化形態は未確認のまま）
  await page.selectOption('#srDevice','サブ4');await click('[data-act="srCheck"]');
  assert.match(await result(),/サブ4/);
  await click('[data-act="srApply"]');
  const d=await snapshot(), u1=unitsOf(d,'架空統合キャラ');
  assert.equal(u1.length,1);assert.equal(u1[0].device,'サブ4');
  assert.deepEqual(u1[0].fruits.map(f=>[f.name,f.grade]),[['撃種の絆・加命撃','特級L'],['撃種の絆・加撃','特級L'],['撃種の絆・加撃速','特級M']]);
  const f=d.master.forms.find(x=>x.id===u1[0].formId);assert.deepEqual([f.unknownForm,f.name,f.monsterNo,f.race,f.battleType,f.shotType],[true,'','90011','亜人','バランス型','反射']);
  // 合言葉は1回だけ：同じ内容がもう一度届いても何もしない
  await page.fill('#srText','');await send({type:'msr-reading',nonce,reading:{...READING,characterName:'二度目'}});
  assert.equal(await page.inputValue('#srText'),'');
});

test('reader: messages from other origins, with a wrong nonce or type, or when nothing was requested are ignored; an invalid reading changes nothing', async()=>{
  await click('[data-act="view"][data-view="admin"]');await stubOpen();
  await send({type:'msr-reading',nonce:'x',reading:READING});assert.equal(await page.locator('#srEdit').isVisible(),false,'nothing requested');
  await click('[data-act="srReader"]');const nonce=await pendingNonce();
  for(const [data,origin] of [
    [{type:'msr-reading',nonce,reading:READING},'https://evil.example.com'],
    [{type:'msr-reading',nonce,reading:READING},'https://script.google.com'],
    [{type:'msr-reading',nonce,reading:READING},'https://n-abc-0lu-script.googleusercontent.com.evil.example'],
    [{type:'msr-reading',nonce,reading:READING},'http://n-abc-0lu-script.googleusercontent.com'],
    [{type:'msr-reading',nonce:'wrong',reading:READING},GAS_ORIGIN],
    [{type:'other',nonce,reading:READING},GAS_ORIGIN],
    ['{"type":"msr-reading"}',GAS_ORIGIN]]){
    await send(data,origin);
    assert.equal(await page.locator('#srEdit').isVisible(),false,JSON.stringify([data.type||data,origin]));
  }
  assert.equal(await pendingNonce(),nonce,'still waiting for the real result');
  // 形式の違う読み取り結果 → 貼り付けと同じく「取り込めません」、何も変更しない
  const before=await snapshot();
  await send({type:'msr-reading',nonce,reading:{...READING,format:'something-else'}});
  assert.match(await result(),/取り込めません（何も変更していません）.*format/);
  const d=await snapshot();delete d.ui;delete before.ui;assert.deepEqual(d,before);
});

test('reader from キャラ登録: 「スクショから登録」 keeps the chosen device; the result closes the dialog and opens the confirm screen', async()=>{
  await seed({characters:[],master:{characters:[],forms:[]},units:[],ui:{view:'stage',quest:'禁忌の獄',stage:{'禁忌の獄':'一ノ獄'}}});
  await stubOpen();
  await page.evaluate(()=>openQuickReg());
  assert.equal(await page.locator('[data-act="qrFromShot"]').isVisible(),true);
  await page.selectOption('#qrDevice','サブ3');
  await click('[data-act="qrFromShot"]');
  assert.match(await page.locator('#qrMsg').textContent(),/読取アプリを開きました/);
  const nonce=await pendingNonce();
  const ou=new URL((await opened())[0][0]);
  assert.deepEqual([...ou.searchParams.keys()],['return','nonce','device']);assert.equal(ou.searchParams.get('device'),'サブ3','device is passed so the reader can start with the camera');
  await send({type:'msr-reading',nonce,reading:READING});
  assert.equal(await page.locator('#qrModal.open').count(),0,'dialog closed');
  assert.equal(await page.locator('#view-admin').isVisible(),true);
  assert.equal(await val('srDevice'),'サブ3','device chosen in キャラ登録 is kept');
  assert.equal(await val('srF_characterName'),'架空統合キャラ');
  // ポップアップがブロックされたとき
  await page.evaluate(()=>{window.__openReturn=null;openQuickReg()});await click('[data-act="qrFromShot"]');
  assert.match(await page.locator('#qrMsg').textContent(),/読取アプリを開けませんでした/);
});

test('reader: the pending nonce survives a reload of this tab; an expired one is not used', async()=>{
  await click('[data-act="view"][data-view="admin"]');await stubOpen();
  await click('[data-act="srReader"]');const nonce=await pendingNonce();
  await page.reload();
  await send({type:'msr-reading',nonce,reading:READING});
  assert.equal(await val('srF_characterName'),'架空統合キャラ');
  // 1時間を過ぎた合言葉は使わない
  await page.evaluate(()=>sessionStorage.setItem('monst-trial-reader-pending',JSON.stringify({nonce:'old1',device:'',at:Date.now()-2*60*60*1000})));
  await page.reload();await click('[data-act="view"][data-view="admin"]');
  await send({type:'msr-reading',nonce:'old1',reading:READING});
  assert.match(await page.locator('#srMsg').textContent(),/時間が経ちすぎたため使いませんでした/);
  assert.equal(await page.inputValue('#srText'),'');
  assert.equal(await pendingNonce(),null);
});

test('stage: with no suitability, every owned unit on that device can be picked provisionally (仮選択・適正未確定); suits are never changed', async()=>{
  await seed({characters:[],master:{characters:[{id:'c1',name:'架空所持キャラA'},{id:'c2',name:'架空所持キャラB'}],
      forms:[{id:'fa',characterId:'c1',name:'',unknownForm:true,short:'',race:'亜人',battleType:'バランス型',shotType:'反射'},
        {id:'fb',characterId:'c2',name:'架空の形態B',short:'',race:'魔族',battleType:'パワー型',shotType:'貫通'}]},
    units:[{id:'uA',formId:'fa',device:'メイン',no:1,fruits:[{name:'撃種の絆・加命撃',grade:'特級L'},{name:'撃種の絆・加撃',grade:'特級L'},{name:'撃種の絆・加撃速',grade:'特級L'}]},
      {id:'uB',formId:'fb',device:'メイン',no:1,fruits:[]},{id:'uS',formId:'fb',device:'サブ1',no:1,fruits:[]}],
    suits:[],useDevs:{[K]:['メイン','サブ2']},ui:{view:'stage',quest:'禁忌の獄',stage:{'禁忌の獄':'一ノ獄'}}});
  const main=page.locator('.pickDev[data-dev="メイン"]'), sub2=page.locator('.pickDev[data-dev="サブ2"]');
  assert.equal(await main.locator('.pickSel').isDisabled(),false,'候補0 but owned units → selectable');
  assert.equal(await main.locator('.pickSel optgroup').getAttribute('label'),'所持キャラ（適正未登録・仮選択）');
  assert.deepEqual(await main.locator('.pickSel optgroup option').allTextContents(),['架空所持キャラA 個体1（仮）','架空所持キャラB｜架空の形態B 個体1（仮）'],'only this device');
  assert.match(await main.textContent(),/このステージの適正が未登録です（所持キャラから仮選択できます）/);
  assert.equal(await sub2.locator('.pickSel').isDisabled(),true,'a device with no units stays disabled');
  await main.locator('.pickSel').selectOption('uA');
  const card=(await main.locator('.uCard.uProv').textContent()).replace(/\s+/g,' ');
  assert.match(card,/架空所持キャラA/);assert.match(card,/仮選択・適正未確定/);assert.match(card,/亜人/);assert.match(card,/バランス/);assert.match(card,/反射/);assert.match(card,/加命撃/);
  let d=await snapshot();assert.deepEqual(d.picks,{[K]:{'メイン':'uA'}});assert.deepEqual(d.suits,[]);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal scroll at 390px');
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  await main.screenshot({path:path.join(__dirname,'artifacts','v11-stage-owned-390.png')});
  await page.reload();assert.equal(await page.locator('.pickDev[data-dev="メイン"] .uCard.uProv').count(),1,'kept after reload');
  await page.locator('.pickDev[data-dev="メイン"] .pickSel').selectOption('');
  d=await snapshot();assert.deepEqual(d.picks[K]||{},{});assert.deepEqual(d.suits,[]);
});

test('stage: candidates (exact form, then same character with 形態未確認) and other owned units; only the latter are provisional', async()=>{
  await seed({characters:[],master:{characters:[{id:'c1',name:'架空適正キャラ'},{id:'c2',name:'架空その他キャラ'}],
      forms:[{id:'f1',characterId:'c1',name:'架空の適正形態',short:'',race:'',battleType:'',shotType:''},{id:'fu',characterId:'c1',name:'',unknownForm:true,short:'',race:'',battleType:'',shotType:''},
        {id:'f2',characterId:'c2',name:'架空の他形態',short:'',race:'',battleType:'',shotType:''}]},
    units:[{id:'u1',formId:'f1',device:'メイン',no:1,fruits:[]},{id:'u2',formId:'fu',device:'メイン',no:2,fruits:[]},{id:'u3',formId:'f2',device:'メイン',no:1,fruits:[]}],
    suits:[{id:'s1',stageKey:K,formId:'f1',source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'}],
    useDevs:{[K]:['メイン']},ui:{view:'stage',quest:'禁忌の獄',stage:{'禁忌の獄':'一ノ獄'}}});
  const sel=page.locator('.pickDev[data-dev="メイン"] .pickSel');
  assert.deepEqual((await sel.locator(':scope > option').allTextContents()).slice(1),['架空適正キャラ｜架空の適正形態 個体1','架空適正キャラ 個体2（形態未確認）']);
  assert.deepEqual(await sel.locator('optgroup').evaluateAll(gs=>gs.map(g=>[g.label,[...g.children].map(o=>o.textContent)])),
    [['所持キャラ（適正未登録・仮選択）',['架空その他キャラ｜架空の他形態 個体1（仮）']]]);
  await sel.selectOption('u1');assert.equal(await page.locator('.uCard.uProv').count(),0,'confirmed candidate is not marked');
  await sel.selectOption('u2');assert.equal(await page.locator('.uCard.uProv').count(),0,'same character with unknown form is a normal candidate');assert.match(await page.locator('.pickDev .uCard').textContent(),/形態未確認/);
  await page.locator('.pickDev[data-dev="メイン"] .pickSel').selectOption('u3');assert.equal(await page.locator('.uCard.uProv').count(),1);
  assert.deepEqual((await snapshot()).suits.map(s=>s.formId),['f1']);
});

test('data compatibility: old saved data loads unchanged; new fields (unknown form, provisional pick, pending) survive backup → restore', async()=>{
  const old={characters:[],master:{characters:[{id:'c1',name:'架空旧キャラ'}],forms:[{id:'f1',characterId:'c1',name:'架空旧形態',short:'旧',race:'亜人',battleType:'バランス型',shotType:'反射'}]},
    units:[{id:'u1',formId:'f1',device:'メイン',no:1,fruits:[{name:'加撃',grade:'特級L'}],memo:'手入力'}],
    suits:[{id:'s1',stageKey:K,formId:'f1',source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'}],picks:{[K]:{'メイン':'u1'}}};
  await seed(old);
  let d=await snapshot();
  assert.deepEqual(d.units.map(u=>[u.id,u.formId,u.device,u.no,u.fruits.map(f=>f.name+f.grade).join(),u.memo]),[['u1','f1','メイン',1,'加撃特級L','手入力']]);
  assert.equal(d.master.forms[0].unknownForm,undefined);assert.equal(d.master.forms[0].short,'旧');
  assert.deepEqual(d.picks,{[K]:{'メイン':'u1'}});assert.deepEqual(d.pendingReadings,[]);
  await page.evaluate(K=>{db.master.forms.push({id:'fu',characterId:'c1',name:'',unknownForm:true,short:'',race:'',battleType:'',shotType:''});
    db.units.push({id:'u2',formId:'fu',device:'サブ1',no:1,fruits:[],memo:''});db.picks[K]['サブ1']='u2';
    db.pendingReadings.push(normPending({id:'p1',at:'2026-10-09T00:00:00.000Z',characterName:'架空保留',fruits:[{name:'加撃',grade:'特級L'}]}));persist()},K);
  await page.reload();
  const saved=await snapshot(), json=await page.evaluate(()=>backupJson());
  assert.equal(saved.master.forms.find(f=>f.id==='fu').unknownForm,true);assert.equal(saved.pendingReadings.length,1);
  await seed({characters:[],master:{characters:[],forms:[]},units:[]});
  await click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',json);await click('[data-act="restore"]');
  assert.match(await page.locator('#bkMsg').textContent(),/復元しました/);
  await page.reload();d=await snapshot();
  for(const k of ['master','units','suits','picks','pendingReadings']) assert.deepEqual(d[k],saved[k],k);
});
