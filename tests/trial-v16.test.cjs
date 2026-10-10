// Round 16: STEP3-3 登録済みキャラの候補表示と二つ名（任意）。候補は参考で、選んだときだけ既存キャラへ個体を追加する。自動統合しない。
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
const txt=async l=>(await l.textContent()).replace(/\s+/g,' ').trim();
// 架空データ：スカアハα（形態未確認・図鑑No.99216・サブ1に1体）、スカアハ（確認済み形態・メイン）、ネオ（確認済み・サブ1）
const BASE={characters:[],deviceNames:{'サブ1':'架空タブレット'},
  master:{characters:[{id:'cA',name:'架空スカアハα'},{id:'cS',name:'架空スカアハ'},{id:'cN',name:'架空ネオ'}],
    forms:[{id:'fA',characterId:'cA',name:'',unknownForm:true,short:'',race:'神',battleType:'スピード型',shotType:'反射',monsterNo:'99216'},
      {id:'fS',characterId:'cS',name:'架空の形態',short:'',race:'',battleType:'',shotType:''},
      {id:'fN',characterId:'cN',name:'架空ハロー',short:'ハロー',race:'亜人',battleType:'バランス型',shotType:'反射'}]},
  units:[{id:'uA',formId:'fA',device:'サブ1',no:1,fruits:[{name:'撃種の絆・加撃',grade:'特級L'}],memo:''},
    {id:'uS',formId:'fS',device:'メイン',no:1,fruits:[],memo:''},{id:'uN',formId:'fN',device:'サブ1',no:2,fruits:[],memo:''}],
  picks:{'破界の星墓::パライソ':{'サブ1':'uA'}}};
const READING={format:'monst-screenshot-reading-v1',characterName:'架空影炎の花嫁 架空スカアハα',formName:null,monsterNo:'99216',race:'神',battleType:'スピード型',shotType:'反射',
  fruit1:'撃種の絆・加命撃 特L',fruit2:null,fruit3:null,confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[]};
async function preview(r=READING){await page.click('[data-act="view"][data-view="admin"]');await page.fill('#srText',JSON.stringify(r));await page.click('[data-act="srPreview"]')}
const cands=()=>page.locator('#srCands [data-act="srCand"]');
const result=async()=>txt(page.locator('#srResult'));
const charIds=d=>d.master.characters.map(c=>c.id+':'+c.name);

test('screenshot: candidates for a name with 二つ名 (part match / same 図鑑No.), with unit count, devices and form status; nothing chosen automatically', async()=>{
  await seed(BASE);await preview();
  assert.equal(await page.inputValue('#srF_epithet'),'','二つ名 is not filled in automatically');
  const list=await txt(page.locator('#srCands'));
  assert.match(list,/架空スカアハα.*図鑑No\.が一致.*1体.*架空タブレット（サブ1）×1.*進化形態：未確認/);
  assert.match(list,/架空スカアハ（?.*名前の一部が一致/);
  assert.match(list,/候補を選ばない場合は、新しいキャラ「架空影炎の花嫁 架空スカアハα」として登録します/);
  assert.equal(await page.locator('#srSplit').isVisible(),true,'split is offered but not applied');
  assert.equal(await page.inputValue('#srF_characterName'),'架空影炎の花嫁 架空スカアハα');
});

test('choosing a candidate adds a new unit to that character (same device is fine); 二つ名 is kept separately; form stays 未確認', async()=>{
  await seed(BASE);await preview();
  await cands().filter({hasText:'架空スカアハα'}).first().click();
  assert.equal(await page.inputValue('#srF_characterName'),'架空スカアハα');
  assert.equal(await page.inputValue('#srF_epithet'),'架空影炎の花嫁','the rest becomes the 二つ名 (only because the user chose the candidate)');
  await page.selectOption('#srDevice','サブ1');await page.click('[data-act="srCheck"]');
  const r=await result();
  assert.match(r,/既存キャラ「架空スカアハα」に新しい個体を追加/);assert.match(r,/二つ名：架空影炎の花嫁/);
  assert.match(r,/進化形態：未確認/);assert.match(r,/図鑑No\.99216/);assert.match(r,/撃種の絆・加命撃 特級L/);
  await page.check('#srDupOk');await page.click('[data-act="srApply"]'); // 同じ端末に2体目（正常なケース）
  assert.match(await page.locator('#srDone').textContent(),/登録しました（保存済み）/);
  const d=await stored();
  assert.deepEqual(charIds(d),charIds(BASE),'no character created, renamed or merged');
  const us=d.units.filter(u=>u.formId==='fA');
  assert.deepEqual(us.map(u=>[u.device,u.no,u.epithet||'']),[['サブ1',1,''],['サブ1',2,'架空影炎の花嫁']]);
  assert.equal(d.master.forms.find(f=>f.id==='fA').unknownForm,true);assert.equal(d.master.forms.find(f=>f.id==='fA').name,'');
  assert.deepEqual(d.picks,BASE.picks);
});

test('partial input shows the exact match first; an exact name goes to that character (as before)', async()=>{
  await seed(BASE);await preview({...READING,characterName:'架空スカアハ',monsterNo:null});
  const items=await cands().allTextContents();
  assert.match(items[0],/架空スカアハ.*同じ名前/);assert.ok(items.some(t=>/架空スカアハα.*名前の一部が一致/.test(t)));
  assert.match(await txt(page.locator('#srCands')),/同じ名前のキャラが登録済みのため、「架空スカアハ」に個体を追加します/);
  await page.selectOption('#srDevice','サブ2');await page.click('[data-act="srCheck"]');
  assert.match(await result(),/既存キャラ「架空スカアハ」に新しい個体を追加/);
});

test('a similar but different name is only a suggestion: without choosing, a new character is registered and others are untouched', async()=>{
  await seed(BASE);await preview({...READING,characterName:'架空スカアハβ',monsterNo:'99999'});
  assert.match(await txt(page.locator('#srCands')),/架空スカアハα.*似た名前/);
  await page.selectOption('#srDevice','サブ3');await page.click('[data-act="srCheck"]');
  assert.match(await result(),/新しいキャラ「架空スカアハβ」を登録/);
  await page.click('[data-act="srApply"]');
  const d=await stored();
  assert.deepEqual(d.master.characters.map(c=>c.name),['架空スカアハα','架空スカアハ','架空ネオ','架空スカアハβ']);
  assert.deepEqual(d.units.filter(u=>['uA','uS','uN'].includes(u.id)),BASE.units.map(u=>({...u,fruits:u.fruits.map(f=>({...f,kind:''}))})),'existing units unchanged');
});

test('split button: 二つ名 and name are split only when tapped; a new character keeps 進化形態未確認; registering without 二つ名 also works', async()=>{
  await seed(BASE);await preview({...READING,characterName:'架空二つ名ことば 架空新キャラ',monsterNo:null});
  await page.click('#srSplit');
  assert.equal(await page.inputValue('#srF_characterName'),'架空新キャラ');assert.equal(await page.inputValue('#srF_epithet'),'架空二つ名ことば');
  await page.selectOption('#srDevice','サブ2');await page.click('[data-act="srCheck"]');
  assert.match(await result(),/新しいキャラ「架空新キャラ」を登録/);assert.match(await result(),/二つ名：架空二つ名ことば/);
  await page.click('[data-act="srApply"]');
  let d=await stored();const c=d.master.characters.find(x=>x.name==='架空新キャラ');const f=d.master.forms.find(x=>x.characterId===c.id);
  assert.equal(f.unknownForm,true,'二つ名 does not confirm the form');assert.equal(f.name,'');
  assert.equal(d.units.find(u=>u.formId===f.id).epithet,'架空二つ名ことば');
  // 二つ名なし
  await preview({...READING,characterName:'架空無二つ名',monsterNo:null});
  await page.selectOption('#srDevice','サブ2');await page.click('[data-act="srCheck"]');
  assert.doesNotMatch(await result(),/二つ名：/);
  await page.click('[data-act="srApply"]');
  d=await stored();const c2=d.master.characters.find(x=>x.name==='架空無二つ名');
  const u2=d.units.find(u=>d.master.forms.find(f=>f.id===u.formId)?.characterId===c2.id);
  assert.equal('epithet' in u2,false,'no empty field added');
});

test('キャラ登録 dialog: name input shows candidates; choosing one adds a unit to that character; 二つ名 field is optional', async()=>{
  await seed({...BASE,ui:{view:'stage',quest:'禁忌の獄',stage:{'禁忌の獄':'一ノ獄'}}});
  await page.evaluate(()=>openQuickReg());
  assert.equal(await page.locator('#qrEpithet').isVisible(),true);
  await page.fill('#qrCharName','架空スカア');
  const list=await txt(page.locator('#qrCands'));
  assert.match(list,/架空スカアハα.*名前の一部が一致/);assert.match(list,/架空スカアハ.*名前の一部が一致/);
  await page.locator('#qrCands [data-act="qrCand"]').filter({hasText:'架空スカアハα'}).first().click();
  assert.equal(await page.inputValue('#qrChar'),'cA');assert.equal(await page.locator('#qrCharNameField').isVisible(),false);
  await page.fill('#qrEpithet','架空別の二つ名');await page.selectOption('#qrDevice','サブ1');await page.uncheck('#qrSuitOn');
  await page.click('[data-act="qrSave"]');
  const d=await stored();
  assert.deepEqual(charIds(d),charIds(BASE));
  assert.deepEqual(d.units.filter(u=>u.formId==='fA').map(u=>[u.device,u.no,u.epithet||'']),[['サブ1',1,''],['サブ1',2,'架空別の二つ名']]);
  // 新しいキャラ・二つ名あり・進化形態なし
  await page.evaluate(()=>openQuickReg());
  await page.fill('#qrCharName','架空まったく新しい');await page.fill('#qrEpithet','架空の称号');await page.selectOption('#qrDevice','メイン');await page.uncheck('#qrSuitOn');
  assert.match(await txt(page.locator("#qrCands")),/新しいキャラ「架空まったく新しい」として登録します/);
  await page.click('[data-act="qrSave"]');
  const d2=await stored();const c=d2.master.characters.find(x=>x.name==='架空まったく新しい');const f=d2.master.forms.find(x=>x.characterId===c.id);
  assert.equal(f.unknownForm,true);assert.equal(d2.units.find(u=>u.formId===f.id).epithet,'架空の称号');
});

test('二つ名 is shown on the device / character screens, is searchable, can be edited, survives reload and backup/restore', async()=>{
  await seed({...BASE,units:BASE.units.map(u=>u.id==='uA'?{...u,epithet:'架空影炎の花嫁'}:u)});
  await page.click('[data-act="view"][data-view="device"]');
  assert.match(await txt(page.locator('#deviceCards .card[data-dev="サブ1"] .uCard[data-unit="uA"]')),/架空スカアハα.*二つ名：架空影炎の花嫁/);
  await page.click('[data-act="view"][data-view="search"]');await page.fill('#searchInput','影炎');
  assert.equal(await page.locator('#searchResults .sNew .card').count(),1);
  await page.click('#searchResults .sNew [data-act="goChara"]');
  assert.match(await txt(page.locator('#charaList .card.open')),/二つ名：架空影炎の花嫁/);
  await page.click('#charaList .card.open [data-act="unitEdit"][data-id="uA"]');
  assert.equal(await page.inputValue('#unEpithet'),'架空影炎の花嫁');
  await page.fill('#unEpithet','架空直した二つ名');await page.click('[data-act="saveUnit"]');
  assert.equal((await stored()).units.find(u=>u.id==='uA').epithet,'架空直した二つ名');
  await page.reload();assert.equal((await page.evaluate(()=>db.units.find(u=>u.id==='uA').epithet)),'架空直した二つ名');
  const bk=await page.evaluate(()=>backupJson());
  await seed({characters:[]});await page.click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',bk);await page.click('[data-act="restore"]');
  assert.equal((await stored()).units.find(u=>u.id==='uA').epithet,'架空直した二つ名');
  // 古い形式（二つ名の項目がない）も従来どおり読める
  await seed(BASE);assert.equal(await page.evaluate(()=>db.units.every(u=>!('epithet' in u))),true);
});

test('390px: candidates, split button and 二つ名 fields fit without horizontal scroll', async()=>{
  await seed(BASE);await preview();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'screenshot register');
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  await page.locator('#srEdit').screenshot({path:path.join(__dirname,'artifacts','v16-candidates-390.png')});
  await page.evaluate(()=>{db.ui.view='stage';render();openQuickReg()});await page.fill('#qrCharName','架空スカアハ');
  assert.ok(await page.evaluate(()=>document.querySelector('#qrModal .modal').scrollWidth<=document.querySelector('#qrModal .modal').clientWidth),'dialog');
});

// ===== 個体の編集で、確認状態（verificationStatus）と取り込み元（importSource）を消さない =====
const EDIT_BASE={characters:[],master:{characters:[{id:'cA',name:'架空スカアハα'}],forms:[{id:'fA',characterId:'cA',name:'',unknownForm:true,short:'',race:'',battleType:'',shotType:''},
    {id:'fB',characterId:'cA',name:'架空の別形態',short:'',race:'',battleType:'',shotType:''}]},
  units:[{id:'uR',formId:'fA',device:'サブ1',no:1,fruits:[{name:'撃種の絆・加撃',grade:'特級L'}],memo:'',verificationStatus:'NEEDS_REVIEW',importSource:'monst-screenshot-reading-v1',epithet:'架空の二つ名'},
    {id:'uV',formId:'fA',device:'メイン',no:1,fruits:[],memo:'',verificationStatus:'VERIFIED',importSource:'monst-hakai-main-staging-v1'},
    {id:'uP',formId:'fA',device:'サブ2',no:1,fruits:[],memo:''}]};
async function editUnit(id,fn){
  await page.evaluate(()=>{db.ui.view='chara';db.ui.charaOpen='cA';render()});
  await page.click(`#charaList .card.open [data-act="unitEdit"][data-id="${id}"]`);
  await fn();await page.click('[data-act="saveUnit"]');
}
const unitOf=async id=>(await stored()).units.find(u=>u.id===id);

test('editing a unit (二つ名・実・メモ) keeps its 確認状態 and 取り込み元', async()=>{
  await seed(EDIT_BASE);
  await editUnit('uR',async()=>{await page.fill('#unEpithet','架空の直した二つ名');await page.fill('#unFrName1','撃種の絆・加命撃');await page.selectOption('#unFrGrade1','特級M');await page.fill('#unMemo','架空メモ')});
  let u=await unitOf('uR');
  assert.equal(u.verificationStatus,'NEEDS_REVIEW');assert.equal(u.importSource,'monst-screenshot-reading-v1');
  assert.equal(u.epithet,'架空の直した二つ名');assert.equal(u.memo,'架空メモ');assert.deepEqual(u.fruits.map(f=>f.name),['撃種の絆・加撃','撃種の絆・加命撃']);
  assert.match(await page.locator('#charaList .card.open [data-unit="uR"]').textContent(),/要確認/,'status badge still shown');
  await editUnit('uV',async()=>{await page.fill('#unMemo','架空メモ2');await page.selectOption('#unDevice','サブ3')});
  u=await unitOf('uV');assert.equal(u.verificationStatus,'VERIFIED');assert.equal(u.importSource,'monst-hakai-main-staging-v1');assert.equal(u.device,'サブ3');
  // 進化形態を選び直しても、確認状態・取り込み元は勝手に変えない
  await editUnit('uR',async()=>{await page.selectOption('#unForm','fB')});
  u=await unitOf('uR');assert.equal(u.formId,'fB');assert.equal(u.verificationStatus,'NEEDS_REVIEW');assert.equal(u.importSource,'monst-screenshot-reading-v1');
});

test('clearing 二つ名 removes only 二つ名; a unit without 確認状態／取り込み元 stays without them', async()=>{
  await seed(EDIT_BASE);
  await editUnit('uR',async()=>{await page.fill('#unEpithet','')});
  let u=await unitOf('uR');assert.equal('epithet' in u,false);assert.equal(u.verificationStatus,'NEEDS_REVIEW');assert.equal(u.importSource,'monst-screenshot-reading-v1');
  await editUnit('uP',async()=>{await page.fill('#unMemo','架空メモ3')});
  u=await unitOf('uP');assert.deepEqual(Object.keys(u).sort(),['device','formId','fruits','id','memo','no']);assert.equal(u.memo,'架空メモ3');
  // 新しく登録した個体にも付かない
  await page.evaluate(()=>{db.ui.view='chara';db.ui.charaOpen='cA';render()});
  await page.click('#charaList .card.open [data-act="unitAdd"]');await page.selectOption('#unDevice','サブ4');await page.click('[data-act="saveUnit"]');
  const added=(await stored()).units.find(x=>x.device==='サブ4');
  assert.equal('verificationStatus' in added,false);assert.equal('importSource' in added,false);
});

test('edited unit keeps 確認状態・取り込み元・二つ名 after reload and backup → restore', async()=>{
  await seed(EDIT_BASE);
  await editUnit('uR',async()=>{await page.fill('#unMemo','架空メモ4')});
  await page.reload();
  let u=await page.evaluate(()=>db.units.find(x=>x.id==='uR'));
  assert.deepEqual([u.verificationStatus,u.importSource,u.epithet,u.memo],['NEEDS_REVIEW','monst-screenshot-reading-v1','架空の二つ名','架空メモ4']);
  const bk=await page.evaluate(()=>backupJson());
  await seed({characters:[]});await page.click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',bk);await page.click('[data-act="restore"]');
  u=await unitOf('uR');
  assert.deepEqual([u.verificationStatus,u.importSource,u.epithet,u.memo],['NEEDS_REVIEW','monst-screenshot-reading-v1','架空の二つ名','架空メモ4']);
});

test('in an old tab (STEP1), editing a unit is refused and nothing is lost', async()=>{
  await seed(EDIT_BASE);
  const other=await context.newPage();await other.goto(url);await other.click('[data-act="view"][data-view="device"]'); // 別のタブが保存
  const before=JSON.stringify(await stored());
  await editUnit('uR',async()=>{await page.fill('#unMemo','架空メモ5')});
  assert.equal(JSON.stringify(await stored()),before);
  assert.equal(await page.locator('#staleBar').isVisible(),true);
  await other.close();
});
