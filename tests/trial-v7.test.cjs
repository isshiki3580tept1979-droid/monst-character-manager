// Round 5: キャラ tab flow キャラ → 進化形態 → 所持個体（進化形態・端末・個体番号・わくわくの実 最大4・メモ）.
// Same harness as trial-browser.test.cjs, except dialogs are answered per test (dialogAnswer) so the
// "入力内容を破棄しますか？" confirmation can be tested both ways.
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
let browser,server,url,context,page,errors,dialogs,dialogAnswer;
before(async()=>{
  server=http.createServer((req,res)=>{if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(source));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
beforeEach(async()=>{
  context=await browser.newContext({viewport:{width:390,height:844}});page=await context.newPage();errors=[];dialogs=[];dialogAnswer=true;
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
  page.on('dialog',d=>{dialogs.push(d.message());dialogAnswer?d.accept():d.dismiss()});
  await page.goto(url);
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
const isOpen=id=>page.locator('#'+id).evaluate(m=>m.classList.contains('open'));
const chara=extra=>({characters:[],master:{characters:[{id:'c-neo',name:'ネオ'}],forms:[]},ui:{view:'chara',charaOpen:'c-neo'},...extra});
const hello={id:'f-hello',characterId:'c-neo',name:'ハローワールド・モード',short:'ハロー',race:'亜人',battleType:'砲撃型',shotType:'貫通'};
const rev={id:'f-rev',characterId:'c-neo',name:'リバース・モード',short:'リバース',race:'魔人',battleType:'パワー型',shotType:'反射'};
async function fill(i,name,grade){await page.fill('#unFrName'+i,name);if(grade)await page.selectOption('#unFrGrade'+i,grade)}

test('no form yet: ＋所持個体 reacts (never disabled), guides to the form screen, then continues to the unit screen', async()=>{
  await seed(chara());
  const btn=page.locator('[data-act="unitAdd"][data-id="c-neo"]');
  assert.equal(await btn.isDisabled(),false);
  assert.match(await page.locator('#charaList .guide').textContent(),/「＋ 進化形態」で進化形態を登録 → ② 「＋ 所持個体」で端末とわくわくの実を登録/);
  await btn.click();
  assert.equal(await isOpen('formModal'),true);assert.equal(await isOpen('unitModal'),false);
  assert.match(await page.locator('#fmGuide').textContent(),/先に進化形態を登録してください/);
  await page.fill('#fmName','ハローワールド・モード');await page.fill('#fmShort','ハロー');
  await click('[data-act="saveFormNext"]');
  // continues straight to the unit screen with that (only) form selected
  assert.equal(await isOpen('formModal'),false);assert.equal(await isOpen('unitModal'),true);
  assert.equal(await page.locator('#unChar').textContent(),'キャラ：ネオ');
  const fid=(await snapshot()).master.forms[0].id;
  assert.equal(await page.inputValue('#unForm'),fid);assert.equal(await page.locator('#unFormNote').textContent(),'この進化形態で登録します');
});

test('whole flow from ＋キャラ追加: キャラ → 進化形態 → 所持個体 with device, 4 fruits (name + grade), memo; back to detail with the saved unit shown', async()=>{
  await seed({characters:[],ui:{view:'chara'}});
  await click('[data-act="mcharAdd"]');await page.fill('#mcName','ヤクモ');await click('[data-act="saveMCharNext"]');
  assert.equal(await isOpen('formModal'),true);assert.match(await page.locator('#fmGuide').textContent(),/キャラ「ヤクモ」を登録しました/);
  await page.fill('#fmName','大荒神武装');await page.selectOption('#fmRace','神');await click('[data-act="saveFormNext"]');
  assert.equal(await isOpen('unitModal'),true);
  // the unit screen: キャラ名 / 進化形態 / 所持端末 / 個体番号 / 実1〜3 (実名 + 等級) / ＋4枠目 / メモ / 保存 / キャンセル / 戻る
  assert.equal(await page.locator('#unitModal .backBtn').isVisible(),true);
  assert.deepEqual(await page.locator('#unFruits .frSlot:visible .frHead').allTextContents(),['わくわくの実1','わくわくの実2','わくわくの実3']);
  assert.deepEqual(await page.locator('#unFruits .frSlot:visible').first().locator('.frLbl').allTextContents(),['実名','等級','系統（任意）']);
  await page.selectOption('#unDevice','サブ2');
  await fill(0,'同族の絆・加撃','特級L');await fill(1,'同族の絆・加撃速','特級L');await fill(2,'同族の絆・加命撃','特級EL');
  await click('#unFruit4Btn');assert.equal(await page.locator('#unFruit4Btn').isVisible(),false);
  assert.equal(await page.locator('#unFruits .frSlot:visible').count(),4);
  await fill(3,'将命削り','特級M');await page.fill('#unMemo','メイン運用');
  await click('[data-act="saveUnit"]');
  assert.equal(await isOpen('unitModal'),false);
  const d=await snapshot();
  const u=d.units[0];
  assert.deepEqual([u.device,u.no,u.memo],['サブ2',1,'メイン運用']);
  assert.deepEqual(u.fruits.map(x=>[x.name,x.grade]),[['同族の絆・加撃','特級L'],['同族の絆・加撃速','特級L'],['同族の絆・加命撃','特級EL'],['将命削り','特級M']]);
  // back on the character detail, the saved unit is highlighted and its fruits / stage status are visible
  assert.equal(d.ui.view,'chara');assert.equal(d.ui.charaOpen,d.master.characters[0].id);
  assert.match(await page.locator('#charaList .okMsg').textContent(),/所持個体を保存しました（サブ2 個体1・大荒神武装）。この進化形態のステージ適正は未登録/);
  const row=page.locator(`#charaList [data-unit="${u.id}"]`);
  assert.equal(await row.evaluate(r=>r.classList.contains('justSaved')),true);
  assert.match(await row.textContent(),/個体1.*同族の絆・加撃 特級L.*将命削り 特級M.*ステージ適正 未登録/s);
  // reload keeps everything
  await page.reload();
  assert.deepEqual((await snapshot()).units[0].fruits.length,4);
  assert.match(await page.locator(`#charaList [data-unit="${u.id}"]`).textContent(),/同族の絆・加命撃 特級EL/);
});

test('several forms: chosen in the unit screen; device selectable; unit number follows device; no fruits is fine', async()=>{
  await seed(chara({master:{characters:[{id:'c-neo',name:'ネオ'}],forms:[hello,rev]},units:[{id:'u1',formId:'f-hello',device:'メイン',no:1,fruits:[]}]}));
  await click('[data-act="unitAdd"][data-id="c-neo"]');
  assert.match(await page.locator('#unFormNote').textContent(),/2つの進化形態から選んでください/);
  assert.deepEqual(await page.locator('#unForm option').allTextContents(),['ハロー（ハローワールド・モード）','リバース（リバース・モード）']);
  await page.selectOption('#unForm','f-rev');
  await page.selectOption('#unDevice','メイン');assert.equal(await page.inputValue('#unNo'),'2');
  await page.selectOption('#unDevice','サブ5');assert.equal(await page.inputValue('#unNo'),'1');
  await click('[data-act="saveUnit"]');
  const u=(await snapshot()).units.find(x=>x.device==='サブ5');
  assert.deepEqual([u.formId,u.no,u.fruits],['f-rev',1,[]]);
  assert.match(await page.locator(`#charaList [data-unit="${u.id}"]`).textContent(),/実なし/);
});

test('cancel / back: nothing saved; with typed input a discard confirmation is shown and can keep the input', async()=>{
  await seed(chara({master:{characters:[{id:'c-neo',name:'ネオ'}],forms:[hello]}}));
  // unchanged screen closes without asking
  await click('[data-act="unitAdd"][data-id="c-neo"]');await click('#unitModal .backBtn');
  assert.equal(await isOpen('unitModal'),false);assert.deepEqual(dialogs,[]);
  // typed input: asks; answering "no" keeps the screen and the input
  await click('[data-act="unitAdd"][data-id="c-neo"]');await fill(0,'同族の絆・加撃','特級L');
  dialogAnswer=false;await click('#unitModal .btn-cancel');
  assert.deepEqual(dialogs,['入力内容を破棄しますか？']);
  assert.equal(await isOpen('unitModal'),true);assert.equal(await page.inputValue('#unFrName0'),'同族の絆・加撃');
  // tapping outside the screen also asks
  await page.mouse.click(5,5);assert.equal(dialogs.length,2);assert.equal(await isOpen('unitModal'),true);
  // answering "yes" closes without saving
  dialogAnswer=true;await click('#unitModal .backBtn');
  assert.equal(await isOpen('unitModal'),false);assert.deepEqual((await snapshot()).units,[]);
});

test('saved unit appears in the stage ①〜④ candidates when the form has suitability there', async()=>{
  await seed(chara({master:{characters:[{id:'c-neo',name:'ネオ'}],forms:[hello]},
    suits:[{id:'s1',stageKey:STAGE,formId:'f-hello',source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'}],useDevs:{[STAGE]:['サブ1']}}));
  await click('[data-act="unitAdd"][data-id="c-neo"]');await page.selectOption('#unDevice','サブ1');await fill(0,'撃種の絆・加撃','特級L');
  await click('[data-act="saveUnit"]');
  assert.match(await page.locator('#charaList .okMsg').textContent(),/所持個体を保存しました（サブ1 個体1・ハロー）$/);
  await click('[data-act="view"][data-view="stage"]');
  assert.deepEqual(await page.locator('.pickSel[data-pick-dev="サブ1"] option').allTextContents(),['— 使う個体を選ぶ —','ネオ｜ハロー 個体1']);
});

test('backup / restore keeps units with 4 fruits and grades; fruit name suggestions offered', async()=>{
  await seed(chara({master:{characters:[{id:'c-neo',name:'ネオ'}],forms:[hello]},
    units:[{id:'u1',formId:'f-hello',device:'メイン',no:1,fruits:[{name:'同族の絆・加撃',grade:'特級L'},{name:'同族の絆・加撃速',grade:'特級L'},{name:'自作の実',grade:'特級'},{name:'将命削り',grade:'特級M'}]}]}));
  await click('[data-act="unitAdd"][data-id="c-neo"]');
  const opts=await page.locator('#fruitNameList option').evaluateAll(o=>o.map(x=>x.value));
  assert.ok(opts.includes('同族の絆・加撃')&&opts.includes('戦型の絆・加命撃')&&opts.includes('自作の実'));
  assert.equal(await page.locator('#unFrName0').getAttribute('list'),'fruitNameList');
  await click('#unitModal .backBtn');
  const json=await page.evaluate(()=>backupJson());
  await seed({characters:[]});await click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',json);await click('[data-act="restore"]');
  const u=(await snapshot()).units[0];assert.deepEqual(u.fruits.map(x=>[x.name,x.grade]),[['同族の絆・加撃','特級L'],['同族の絆・加撃速','特級L'],['自作の実','特級'],['将命削り','特級M']]);
  // editing a unit that already has 4 fruits shows the 4th block immediately
  await click('[data-act="view"][data-view="chara"]');await click('[data-act="charaOpen"][data-id="c-neo"]').catch(()=>{});
  if(!(await page.locator('[data-act="unitEdit"][data-id="u1"]').count())) await click('[data-act="charaOpen"][data-id="c-neo"]');
  await click('[data-act="unitEdit"][data-id="u1"]');assert.equal(await page.locator('#unFruits .frSlot:visible').count(),4);
});

test('320/390px: unit screen with 4 fruit blocks fits, inputs and buttons are finger-sized, no horizontal scroll; screenshots', async()=>{
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  await seed(chara({master:{characters:[{id:'c-neo',name:'ネオ'}],forms:[hello,rev]}}));
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});
    await click('[data-act="unitAdd"][data-id="c-neo"]');await click('#unFruit4Btn');
    assert.ok(await page.evaluate(()=>{const el=document.querySelector('#unitModal .modal');return el.scrollWidth<=el.clientWidth}),'modal no horizontal scroll');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    for(const id of ['unForm','unDevice','unNo','unMemo',...[0,1,2,3].flatMap(i=>['unFrName'+i,'unFrGrade'+i,'unFrKind'+i])]){
      const r=await page.locator('#'+id).boundingBox();assert.ok(r&&r.height>=40&&r.x>=0&&r.x+r.width<=width,id);
    }
    const nameBox=await page.locator('#unFrName0').boundingBox();assert.ok(nameBox.width>=width*0.6,'fruit name field is wide');
    for(const sel of ['#unitModal .backBtn','#unitModal .btn-cancel','#unitModal .btn-save']){const r=await page.locator(sel).boundingBox();assert.ok(r.height>=40&&r.x+r.width<=width,sel)}
    await page.screenshot({path:path.join(__dirname,'artifacts',`v7-unit-top-${width}.png`)});
    await page.locator('#unitModal .modal').evaluate(e=>{e.scrollTop=e.scrollHeight});
    await page.screenshot({path:path.join(__dirname,'artifacts',`v7-unit-bottom-${width}.png`)});
    await click('#unitModal .backBtn');
    await click('[data-act="unitAdd"][data-id="c-neo"]');await click('#unitModal .backBtn');
  }
  // character card with the guide (no forms) at 390
  await seed(chara());await page.screenshot({path:path.join(__dirname,'artifacts','v7-chara-guide-390.png')});
});
