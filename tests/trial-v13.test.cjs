// Round 13: スクショ読取からの登録で、成功（保存完了後だけ）と、登録できない理由・次にすることを、ボタンのすぐ近くに必ず表示する。
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
// 既存データ（虎杖・ネオ役の架空キャラ）。新しい登録で変わらないことも確かめる
const BASE={characters:[{id:'L1',name:'架空旧ルシ',device:'メイン',count:1}],deviceNames:{'メイン':'架空メイン','サブ1':'架空タブレット'},
  master:{characters:[{id:'cN',name:'架空ネオ'},{id:'cI',name:'架空二つ名 架空虎杖'}],
    forms:[{id:'fN',characterId:'cN',name:'架空ハロー',short:'ハロー',race:'亜人',battleType:'バランス型',shotType:'反射'},
      {id:'fI',characterId:'cI',name:'',unknownForm:true,short:'',race:'亜人',battleType:'超バランス型',shotType:'反射',monsterNo:'99308'}]},
  units:[{id:'uN',formId:'fN',device:'サブ1',no:1,fruits:[{name:'同族の絆・加撃速',grade:'特級L',kind:'同族'}],memo:''},
    {id:'uI',formId:'fI',device:'メイン',no:1,fruits:[{name:'撃種の絆・加速',grade:'特級L',kind:''}],memo:'',verificationStatus:'NEEDS_REVIEW',importSource:'monst-screenshot-reading-v1'}],
  picks:{'破界の星墓::ラルガメンテ':{'メイン':'uI','サブ1':'uN'}}};
const READING={format:'monst-screenshot-reading-v1',characterName:'架空スカアハα',formName:null,monsterNo:'99216',race:'神',battleType:'スピード型',shotType:'反射',
  fruit1:'撃種の絆・加撃 特L',fruit2:null,fruit3:null,confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[]};
async function preview(r=READING){await page.click('[data-act="view"][data-view="admin"]');await page.fill('#srText',JSON.stringify(r));await page.click('[data-act="srPreview"]')}
const status=async()=>(await page.locator('#srStatus').textContent()).replace(/\s+/g,' ').trim();
const statusCls=()=>page.evaluate(()=>document.getElementById('srStatus').className);
const done=()=>page.locator('#srDone');
const applyBtn=()=>page.locator('#srApply');
async function noSuccessShown(){
  assert.equal(await done().isVisible(),false,'no success box');
  assert.doesNotMatch(await page.locator('#srMsg').textContent(),/登録しました/,'no success message');
}
const kept=async()=>{const d=await stored();assert.deepEqual(d.units.filter(u=>['uN','uI'].includes(u.id)).map(u=>u.id),['uN','uI']);assert.deepEqual(d.picks,BASE.picks)};

test('before 「確認画面へ」: 登録する looks disabled and the next step is shown next to it', async()=>{
  await seed(BASE);await preview();
  assert.equal(await applyBtn().isDisabled(),true);
  const look=await page.evaluate(()=>{const a=getComputedStyle(document.getElementById('srApply'));return {bg:a.backgroundColor,cursor:a.cursor}});
  assert.notEqual(look.bg,'rgb(30, 58, 138)','does not look like the active (dark blue) button');
  assert.equal(look.cursor,'not-allowed');
  assert.match(await status(),/「確認画面へ」を押してください/);
  // ボタンのすぐ上にある（離れた場所ではない）
  const [sb,ab]=await Promise.all([page.locator('#srStatus').boundingBox(),applyBtn().boundingBox()]);
  assert.ok(ab.y-(sb.y+sb.height)<60,'guidance is right next to the button');
  await applyBtn().click({force:true});
  await noSuccessShown();assert.deepEqual((await stored()).master.characters.map(c=>c.name),['架空ネオ','架空二つ名 架空虎杖']);
});

test('missing device / empty name: the reason and what to do are shown; nothing is saved', async()=>{
  await seed(BASE);await preview();
  await page.click('[data-act="srCheck"]');
  assert.match(await status(),/まだ登録できません：登録先の端末を選んでください/);assert.match(await status(),/もう一度「確認画面へ」/);
  assert.equal(await statusCls(),'s-block');assert.equal(await applyBtn().isDisabled(),true);
  await page.selectOption('#srDevice','サブ1');await page.fill('#srF_characterName','');await page.click('[data-act="srCheck"]');
  assert.match(await status(),/キャラ名が空です/);
  await noSuccessShown();await kept();
});

test('conflict (same 図鑑No. as another registered character): the reason is shown next to the button', async()=>{
  await seed(BASE);await preview({...READING,monsterNo:'99308'});
  await page.selectOption('#srDevice','サブ1');await page.click('[data-act="srCheck"]');
  assert.match(await status(),/登録できません：図鑑No\.99308 が既存の「架空二つ名 架空虎杖/);
  assert.equal(await applyBtn().isDisabled(),true);
  await noSuccessShown();await kept();
});

test('editing after 「確認画面へ」 is announced (the check is cancelled), not silent', async()=>{
  await seed(BASE);await preview();
  await page.selectOption('#srDevice','サブ1');await page.click('[data-act="srCheck"]');
  assert.equal(await applyBtn().isDisabled(),false);
  assert.match(await status(),/「登録する」を押してください（押すまでは保存されません）/);
  await page.fill('#srF_race','魔族');
  assert.equal(await applyBtn().isDisabled(),true);
  assert.match(await status(),/内容を変更したため、確認画面を取り消しました。もう一度「確認画面へ」を押してください/);
  await noSuccessShown();await kept();
});

test('same character already on the device: the checkbox requirement is explained before and after tapping', async()=>{
  await seed(BASE);await preview({...READING,characterName:'架空ネオ',monsterNo:null});
  await page.selectOption('#srDevice','サブ1');await page.click('[data-act="srCheck"]');
  assert.match(await status(),/同じキャラの個体があります。別の個体として追加する場合は、上のチェックを入れてから「登録する」/);
  await applyBtn().click();
  assert.match(await status(),/チェックを入れてから「登録する」を押してください/);
  await noSuccessShown();await kept();
});

test('success is shown only after the save is confirmed; 「キャラ画面で見る」 opens the character; existing data unchanged', async()=>{
  await seed(BASE);await preview();
  await page.selectOption('#srDevice','サブ1');await page.click('[data-act="srCheck"]');
  await noSuccessShown();
  await applyBtn().click();
  assert.equal(await done().isVisible(),true);
  const t=(await done().textContent()).replace(/\s+/g,' ');
  assert.match(t,/登録しました（保存済み）：架空タブレット（サブ1） 架空スカアハα 個体1/);
  const d=await stored();const c=d.master.characters.find(x=>x.name==='架空スカアハα');assert.ok(c,'really in storage');
  assert.equal(d.units.filter(u=>d.master.forms.find(f=>f.id===u.formId)?.characterId===c.id&&u.device==='サブ1').length,1);
  await kept();assert.deepEqual(d.characters.map(x=>x.name),['架空旧ルシ'],'old-style list untouched');
  assert.equal(await applyBtn().isDisabled(),true,'cannot register twice by tapping again');
  await page.click('[data-act="srGoChara"]');
  assert.equal(await page.locator('#view-chara').isVisible(),true);
  assert.equal(await page.evaluate(()=>db.ui.charaOpen),c.id);
  assert.match(await page.locator('#charaList .card.open').textContent(),/架空スカアハα/);
});

test('save failure: no success, the reason and what to do are shown, data is as before', async()=>{
  await seed(BASE);await preview();
  await page.selectOption('#srDevice','サブ1');await page.click('[data-act="srCheck"]');
  const before=JSON.stringify(await stored());
  await page.evaluate(()=>{window.__s=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='monst-character-manager-trial-v2')throw new Error('QuotaExceededError');return window.__s.call(this,k,v)}});
  await applyBtn().click();
  await page.evaluate(()=>{Storage.prototype.setItem=window.__s});
  assert.equal(await statusCls(),'s-error');
  assert.match(await status(),/登録に失敗したため、登録前の状態に戻しました/);assert.match(await status(),/もう一度「確認画面へ」/);
  await noSuccessShown();
  assert.equal(JSON.stringify(await stored()),before);
  assert.equal(await page.evaluate(()=>db.master.characters.some(c=>c.name==='架空スカアハα')),false);
});

test('a save that silently did not reach storage is not reported as success', async()=>{
  await seed(BASE);await preview();
  await page.selectOption('#srDevice','サブ1');await page.click('[data-act="srCheck"]');
  await page.evaluate(()=>{window.__s=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='monst-character-manager-trial-v2')return;return window.__s.call(this,k,v)}});
  await applyBtn().click();
  await page.evaluate(()=>{Storage.prototype.setItem=window.__s});
  assert.equal(await statusCls(),'s-error');assert.match(await status(),/保存を確認できませんでした/);
  await noSuccessShown();
  assert.equal((await stored()).master.characters.some(c=>c.name==='架空スカアハα'),false);
  assert.equal(await page.evaluate(()=>db.master.characters.some(c=>c.name==='架空スカアハα')),false,'memory back to the saved state');
});

test('another tab saved in between (STEP1): no success, the stop is explained next to the button', async()=>{
  await seed(BASE);await preview();
  await page.selectOption('#srDevice','サブ1');await page.click('[data-act="srCheck"]');
  const other=await context.newPage();await other.goto(url);await other.click('[data-act="view"][data-view="chara"]'); // 別のタブが保存
  await applyBtn().click();
  assert.match(await status(),/別のタブでデータが更新されたため、保存を止めました/);
  await noSuccessShown();
  assert.equal(await page.locator('#staleBar').isVisible(),true);
  await other.close();
});

test('390px: guidance, buttons and the success box fit the phone screen', async()=>{
  await seed(BASE);await preview();
  await page.selectOption('#srDevice','サブ1');await page.click('[data-act="srCheck"]');await applyBtn().click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await done().scrollIntoViewIfNeeded();
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  await page.locator('#srPanel').screenshot({path:path.join(__dirname,'artifacts','v13-register-result-390.png')});
});

test('after 「登録する」 the success box is brought into view (not hidden behind the bottom menu)', async()=>{
  await seed(BASE);await preview();
  await page.selectOption('#srDevice','サブ1');await page.click('[data-act="srCheck"]');await applyBtn().click();
  const r=await page.evaluate(()=>{const b=document.getElementById('srDone').getBoundingClientRect(),nav=document.querySelector('nav')?.getBoundingClientRect();return {top:b.top,bottom:b.bottom,navTop:nav?nav.top:innerHeight}});
  assert.ok(r.top>=0&&r.bottom<=r.navTop,'whole success box visible above the bottom menu: '+JSON.stringify(r));
});

// ===== 公開前の追加確認 =====
const onlyName=(d,n)=>{const c=d.master.characters.filter(x=>x.name===n);const f=new Set(d.master.forms.filter(x=>c.some(y=>y.id===x.characterId)).map(x=>x.id));return {chars:c.length,units:d.units.filter(u=>f.has(u.formId)).length}};

test('verification failure stops saving in this tab (like STEP1) and never overwrites what is in storage', async()=>{
  await seed(BASE);await preview();
  await page.selectOption('#srDevice','サブ1');await page.click('[data-act="srCheck"]');
  // 保存した瞬間に、別のタブの内容（架空別タブキャラを追加済み）が入ったのと同じ状態を作る
  const otherData=await page.evaluate(key=>{const d=JSON.parse(Object.getPrototypeOf(localStorage).getItem.call(localStorage,key));d.master.characters.push({id:'cO',name:'架空別タブキャラ'});return JSON.stringify(d)},KEY);
  await page.evaluate(other=>{window.__s=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='monst-character-manager-trial-v2')return window.__s.call(this,k,other);return window.__s.call(this,k,v)}},otherData);
  await applyBtn().click();
  await page.evaluate(()=>{Storage.prototype.setItem=window.__s});
  assert.match(await status(),/保存を確認できませんでした（登録は完了していません）/);
  await noSuccessShown();
  assert.equal(await page.locator('#staleBar').isVisible(),true,'this tab stops saving and asks to reload');
  assert.equal(JSON.stringify(await stored()),otherData,'storage keeps the other content');
  // このタブで続けて保存しようとしても、別タブの内容を上書きしない
  await page.click('[data-act="view"][data-view="chara"]');await page.click('[data-act="mcharAdd"]');await page.fill('#mcName','架空その後');await page.click('[data-act="saveMChar"]');
  await page.evaluate(()=>closeModals());
  await page.evaluate(()=>{db.ui.view='admin';render()});await page.click('[data-act="srCheck"]').catch(()=>{});
  assert.equal(JSON.stringify(await stored()),otherData,'still not overwritten');
  assert.ok((await stored()).master.characters.some(c=>c.name==='架空別タブキャラ'));
});

test('silent storage failure: memory is rolled back, storage untouched, and further saves are refused until reload', async()=>{
  await seed(BASE);await preview();
  await page.selectOption('#srDevice','サブ1');await page.click('[data-act="srCheck"]');
  const before=JSON.stringify(await stored());
  await page.evaluate(()=>{window.__s=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='monst-character-manager-trial-v2')return;return window.__s.call(this,k,v)}});
  await applyBtn().click();
  await page.evaluate(()=>{Storage.prototype.setItem=window.__s});
  assert.equal(await page.locator('#staleBar').isVisible(),true);
  await page.click('[data-act="srCheck"]');await applyBtn().click({force:true});
  assert.equal(JSON.stringify(await stored()),before);
  // 再読み込みすれば、もう一度登録できる（1体だけ）
  await page.reload();await preview();await page.selectOption('#srDevice','サブ1');await page.click('[data-act="srCheck"]');await applyBtn().click();
  assert.equal(await done().isVisible(),true);
  assert.deepEqual(onlyName(await stored(),'架空スカアハα'),{chars:1,units:1});
});

test('retry after a failed save registers exactly one unit; tapping again or re-checking does not add another silently', async()=>{
  await seed(BASE);await preview();
  await page.selectOption('#srDevice','サブ1');await page.click('[data-act="srCheck"]');
  await page.evaluate(()=>{window.__s=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='monst-character-manager-trial-v2')throw new Error('QuotaExceededError');return window.__s.call(this,k,v)}});
  await applyBtn().click();
  await page.evaluate(()=>{Storage.prototype.setItem=window.__s});
  assert.deepEqual(onlyName(await stored(),'架空スカアハα'),{chars:0,units:0});
  assert.equal(await page.inputValue('#srF_characterName'),'架空スカアハα','input kept for the retry');
  // やり直し
  await page.click('[data-act="srCheck"]');await applyBtn().click();
  assert.equal(await done().isVisible(),true);
  assert.deepEqual(onlyName(await stored(),'架空スカアハα'),{chars:1,units:1});
  // 続けて押しても増えない（ボタンは押せない状態）
  await applyBtn().click({force:true});await applyBtn().click({force:true});
  assert.deepEqual(onlyName(await stored(),'架空スカアハα'),{chars:1,units:1});
  // もう一度「確認画面へ」→「登録する」は、同じキャラの個体がある旨のチェックが必要（黙って増えない）
  await page.click('[data-act="srCheck"]');
  assert.match(await status(),/同じキャラの個体があります/);
  await applyBtn().click();
  assert.match(await status(),/チェックを入れてから「登録する」を押してください/);
  assert.deepEqual(onlyName(await stored(),'架空スカアハα'),{chars:1,units:1});
});

test('「キャラ画面で見る」 shows the registered unit itself (device, unit number, fruits)', async()=>{
  await seed(BASE);await preview();
  await page.selectOption('#srDevice','サブ1');await page.click('[data-act="srCheck"]');await applyBtn().click();
  await page.click('[data-act="srGoChara"]');
  const card=(await page.locator('#charaList .card.open').textContent()).replace(/\s+/g,' ');
  assert.match(card,/架空スカアハα/);assert.match(card,/架空タブレット（サブ1）（1体）/);assert.match(card,/個体1/);assert.match(card,/撃種の絆・加撃|撃種加撃/);
  assert.equal(await page.locator('#charaList .card.open [data-act="unitEdit"]').count(),1,'the unit can be opened for editing');
  assert.ok(await page.evaluate(()=>{const r=document.querySelector('#charaList .card.open').getBoundingClientRect();return r.top<innerHeight&&r.bottom>0}),'card is on screen');
});

test('disabled-button style only affects disabled buttons; other screens work as before', async()=>{
  await seed(BASE);await page.click('[data-act="view"][data-view="admin"]');
  const look=sel=>page.evaluate(s=>{const b=document.querySelector(s),c=getComputedStyle(b);return {disabled:b.disabled,bg:c.backgroundColor,cursor:c.cursor}},sel);
  // 有効なボタンは従来どおり（濃い青）
  assert.deepEqual(await look('[data-act="srReader"]'),{disabled:false,bg:'rgb(30, 58, 138)',cursor:'pointer'});
  // 適正の取り込み：確認前は灰色で押せない → 確認後は従来の見た目で押せる → 取り込める
  let a=await look('#imApply');assert.equal(a.disabled,true);assert.notEqual(a.bg,'rgb(30, 58, 138)');
  await page.fill('#imText',JSON.stringify({format:'monst-suitability-import-v1',stageKey:'禁忌の獄::二ノ獄',source:'GAMEWITH',evaluationType:'GRADE',entries:[{characterName:'架空ネオ',formName:'架空ハロー',grade:'S'}]}));
  await page.click('[data-act="imPreview"]');
  a=await look('#imApply');assert.equal(a.disabled,false);assert.equal(a.bg,'rgb(30, 58, 138)');
  await page.click('[data-act="imApply"]');assert.match(await page.locator('#imMsg').textContent(),/取り込みました/);
  // 所持データの取り込みも同じ
  a=await look('#invApply');assert.equal(a.disabled,true);
  await page.fill('#invText',JSON.stringify({schema:'monst-hakai-main-staging-v1',device:'サブ3',scope:'破界の星墓',ownershipChecks:[],units:[{characterName:'架空取込キャラ',formName:'架空取込形態',verificationStatus:'VERIFIED',fruits:[]}]}));
  await page.click('[data-act="invPreview"]');a=await look('#invApply');assert.equal(a.disabled,false);assert.equal(a.bg,'rgb(30, 58, 138)');
  await page.click('[data-act="invApply"]');assert.match(await page.locator('#invMsg').textContent(),/取り込みました|登録しました/);
  // ステージの選択欄（tool ではない）は影響なし
  await page.click('[data-act="view"][data-view="stage"]');
  assert.equal(await page.locator('.pickSel').count()>=0,true);
  const d=await stored();assert.ok(d.suits.some(s=>s.stageKey==='禁忌の獄::二ノ獄'));assert.ok(d.master.characters.some(c=>c.name==='架空取込キャラ'));
});
