// Round 12: 複数タブでの上書き防止。同じブラウザで試作版を2つのタブで開き、一方の保存をもう一方の古い内容で消さないことを確かめる。
// 架空データだけを使う。隔離ブラウザ（2タブとも同じ context＝同じ保存領域）で実行し、外部へは通信しない。Same harness as trial-v10.test.cjs.
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
// 保存領域の中身（アプリを通さずに読む）
const stored=p=>p.evaluate(key=>JSON.parse(Object.getPrototypeOf(localStorage).getItem.call(localStorage,key)||'null'),KEY);
const names=d=>d?d.master.characters.map(c=>c.name):[];
const BASE={characters:[{id:'L1',name:'架空旧キャラ',device:'メイン',count:1}],deviceNames:{'メイン':'架空端末'},
  master:{characters:[{id:'c1',name:'架空既存キャラ'}],forms:[{id:'f1',characterId:'c1',name:'架空形態',short:'',race:'',battleType:'',shotType:''}]},
  units:[{id:'u1',formId:'f1',device:'メイン',no:1,fruits:[]}],
  suits:[{id:'s1',stageKey:'禁忌の獄::一ノ獄',formId:'f1',source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'}],
  useDevs:{'禁忌の獄::一ノ獄':['メイン']},ui:{view:'stage',quest:'禁忌の獄',stage:{'禁忌の獄':'一ノ獄'}}};
const READING={format:'monst-screenshot-reading-v1',characterName:'架空スカアハα',formName:null,monsterNo:'99216',race:'神',battleType:'スピード型',shotType:'反射',
  fruit1:'撃種の絆・加撃 特L',fruit2:null,fruit3:null,confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[]};
// 2つ目のタブ（同じブラウザ・同じ保存領域）でスクショ読取から登録する
async function otherTabRegisters(name='架空スカアハα'){
  const other=await context.newPage();other.on('pageerror',e=>errors.push('other: '+e.message));
  await other.goto(url);
  await other.click('[data-act="view"][data-view="admin"]');
  await other.fill('#srText',JSON.stringify({...READING,characterName:name}));await other.click('[data-act="srPreview"]');
  await other.selectOption('#srDevice','サブ1');await other.click('[data-act="srCheck"]');await other.click('[data-act="srApply"]');
  assert.match(await other.locator('#srMsg').textContent(),new RegExp('登録しました：サブ1 '+name));
  return other;
}
const bar=()=>page.locator('#staleBar');

test('reproduce: an old tab must not erase a registration saved in another tab (screen switch only)', async()=>{
  await seed(BASE);                       // タブA（page）が古い内容のまま開いている
  const other=await otherTabRegisters();  // タブBで登録 → 保存される
  assert.deepEqual(names(await stored(page)),['架空既存キャラ','架空スカアハα']);
  // タブAで画面を切り替えるだけ（以前はここでタブAの古い内容が丸ごと保存され、タブBの登録が消えた）
  await page.click('[data-act="view"][data-view="chara"]');
  assert.deepEqual(names(await stored(page)),['架空既存キャラ','架空スカアハα'],'registration in the other tab survives');
  assert.equal(await page.locator('#view-chara').isVisible(),true,'the screen still switches');
  assert.equal(await bar().isVisible(),true,'warning is shown');
  assert.match(await bar().textContent(),/別のタブ（またはウィンドウ）で、このアプリのデータが更新されました/);
  await other.close();
});

test('an old tab cannot save data; the dialog and its input stay; nothing in storage changes', async()=>{
  await seed(BASE);
  const other=await otherTabRegisters();
  const before=JSON.stringify(await stored(page));
  // タブAでキャラを追加しようとする
  await page.click('[data-act="view"][data-view="chara"]');await page.click('[data-act="mcharAdd"]');
  await page.fill('#mcName','架空タブAのキャラ');await page.click('[data-act="saveMChar"]');
  assert.equal(JSON.stringify(await stored(page)),before,'nothing written');
  assert.equal(await page.locator('#mcharModal.open').count(),1,'dialog stays open');
  assert.equal(await page.inputValue('#mcName'),'架空タブAのキャラ','typed input is kept');
  assert.equal(await bar().isVisible(),true);
  // ステージの編成（端末ごとの個体）も保存しない
  await page.click('#mcharModal [data-act="close"]').catch(()=>{});
  await page.evaluate(()=>{closeModals();db.ui.view='stage';render()});
  await page.locator('.pickSel[data-pick-dev="メイン"]').selectOption('u1');
  assert.equal(JSON.stringify(await stored(page)),before,'pick not written');
  await other.close();
});

test('warning appears as soon as another tab saves (before trying to save); export keeps this tab\'s unsaved content; reload shows the latest', async()=>{
  await seed(BASE);
  const other=await otherTabRegisters();
  await page.waitForFunction(()=>!document.getElementById('staleBar').hidden); // storage イベントで表示
  // タブAの未保存の変更（保存は止まる）
  await page.evaluate(()=>{db.master.characters.push({id:'cx',name:'架空未保存キャラ'});try{persist()}catch(e){window.__err=e.name}});
  assert.equal(await page.evaluate(()=>window.__err),'StaleDataError');
  await page.click('[data-act="staleExport"]');
  const exported=JSON.parse(await page.inputValue('#staleText'));
  assert.equal(exported.app,await page.evaluate(()=>APP),'same format as a backup');
  assert.ok(exported.data.master.characters.some(c=>c.name==='架空未保存キャラ'),'unsaved change is in the export');
  assert.deepEqual(names(await stored(page)),['架空既存キャラ','架空スカアハα'],'storage untouched');
  await page.click('[data-act="staleReload"]');await page.waitForLoadState();
  assert.equal(await bar().isVisible(),false);
  assert.deepEqual(names(await page.evaluate(()=>db)),['架空既存キャラ','架空スカアハα'],'latest data shown');
  // 再読み込み後は普通に保存できる
  await page.click('[data-act="view"][data-view="chara"]');await page.click('[data-act="mcharAdd"]');
  await page.fill('#mcName','架空再読込後キャラ');await page.click('[data-act="saveMChar"]');
  assert.deepEqual(names(await stored(page)),['架空既存キャラ','架空スカアハα','架空再読込後キャラ']);
  await other.close();
});

test('registration paths with rollback (screenshot register / hold / restore) explain the stop and keep the input', async()=>{
  await seed(BASE);
  await page.click('[data-act="view"][data-view="admin"]');
  await page.fill('#srText',JSON.stringify({...READING,characterName:'架空タブA登録'}));await page.click('[data-act="srPreview"]');
  await page.selectOption('#srDevice','サブ2');await page.click('[data-act="srCheck"]');
  const other=await otherTabRegisters();
  const before=JSON.stringify(await stored(page));
  await page.click('[data-act="srApply"]');
  assert.match(await page.locator('#srMsg').textContent(),/別のタブでデータが更新されたため、保存を止めました/);
  assert.equal(await page.inputValue('#srF_characterName'),'架空タブA登録','confirm screen input kept');
  assert.equal(await page.evaluate(()=>db.master.characters.some(c=>c.name==='架空タブA登録')),false,'rolled back in memory');
  await page.click('[data-act="srHold"]');
  assert.match(await page.locator('#srMsg').textContent(),/別のタブでデータが更新されたため、保存を止めました/);
  // 復元も上書きしない（再読み込みしてから）
  const nb=JSON.parse(await page.evaluate(()=>backupJson()));delete nb.kind;delete nb.warning; // 通常のバックアップ（印なし）でも
  await page.fill('#bkText',JSON.stringify(nb));await page.click('[data-act="restore"]');
  assert.match(await page.locator('#bkMsg').textContent(),/別のタブでデータが更新されたため、保存を止めました/);
  assert.equal(JSON.stringify(await stored(page)),before,'nothing written by any of them');
  await other.close();
});

test('checks again when the tab comes back to the front (e.g. after using another tab on the phone)', async()=>{
  await seed(BASE);
  // ほかのタブの保存を、storage イベント無しで再現（このタブに通知が届かなかった場合）
  await page.evaluate(key=>{const d=JSON.parse(Object.getPrototypeOf(localStorage).getItem.call(localStorage,key));d.master.characters.push({id:'cz',name:'架空別タブ'});
    Object.getPrototypeOf(localStorage).setItem.call(localStorage,key,JSON.stringify(d))},KEY);
  assert.equal(await bar().isVisible(),false);
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  assert.equal(await bar().isVisible(),true);
});

test('a single tab keeps saving normally (no false warnings); the saved format is unchanged', async()=>{
  await seed(BASE);
  await page.click('[data-act="view"][data-view="chara"]');
  for(const n of ['架空一','架空二','架空三']){await page.click('[data-act="mcharAdd"]');await page.fill('#mcName',n);await page.click('[data-act="saveMChar"]')}
  await page.click('[data-act="view"][data-view="stage"]');await page.locator('.pickSel[data-pick-dev="メイン"]').selectOption('u1');
  await page.reload();
  await page.click('[data-act="view"][data-view="admin"]');
  await page.fill('#srText',JSON.stringify(READING));await page.click('[data-act="srPreview"]');
  await page.selectOption('#srDevice','サブ1');await page.click('[data-act="srCheck"]');await page.click('[data-act="srApply"]');
  assert.match(await page.locator('#srMsg').textContent(),/登録しました/);
  // 復元（同じタブ）もできる
  const bk=await page.evaluate(()=>backupJson());
  await page.fill('#bkText',bk);await page.click('[data-act="restore"]');assert.match(await page.locator('#bkMsg').textContent(),/復元しました/);
  assert.equal(await bar().isVisible(),false,'no warning in a single tab');
  const d=await stored(page);
  assert.deepEqual(names(d),['架空既存キャラ','架空一','架空二','架空三','架空スカアハα']);
  assert.deepEqual(d.picks,{'禁忌の獄::一ノ獄':{'メイン':'u1'}});
  assert.deepEqual(Object.keys(d).sort(),Object.keys(await page.evaluate(()=>blank())).sort(),'no new fields in saved data');
  assert.deepEqual(d.characters,[{id:'L1',name:'架空旧キャラ',device:'メイン',lentTo:null,count:1,memo:'',stages:[]}],'old-style data kept');
});

test('first use: a tab opened with no saved data does not overwrite data another tab saved first', async()=>{
  await page.evaluate(key=>Object.getPrototypeOf(localStorage).removeItem.call(localStorage,key),KEY);await page.reload();
  const other=await otherTabRegisters('架空最初の登録');
  await page.click('[data-act="view"][data-view="chara"]');
  assert.deepEqual(names(await stored(page)),['架空最初の登録']);
  assert.equal(await bar().isVisible(),true);
  await other.close();
});

test('every other save path is stopped in an old tab without errors: lend/return, device names, extra stage, imports, suitability, unit/form edits', async()=>{
  await seed({...BASE,characters:[{id:'L1',name:'架空旧キャラ',device:'メイン',count:1},{id:'L2',name:'架空貸出中',device:'メイン',lentTo:'サブ1',count:1}]});
  const other=await otherTabRegisters();
  const before=JSON.stringify(await stored(page));
  const ui=async(view,fn)=>{await page.evaluate(v=>{closeModals();db.ui.view=v;render()},view);await fn()};
  // 旧機能の貸出・返却（端末画面）
  await ui('device',async()=>{await page.locator('#deviceCards [data-act="lend"][data-id="L1"]').first().click();await page.selectOption('#lendTo','サブ2');await page.click('[data-act="saveLend"]')});
  await ui('device',async()=>{await page.locator('#deviceCards [data-act="return"][data-id="L2"]').first().click()});
  // 端末名・ステージ追加（管理）
  await ui('admin',async()=>{await page.fill('#nameIn1','架空新名');await page.click('[data-act="saveNames"]')});
  await ui('admin',async()=>{await page.selectOption('#exQuest','破界の星墓');await page.fill('#exName','架空追加ステージ');await page.click('[data-act="addStage"]')});
  // 適正の取り込み・所持データの取り込み
  await ui('admin',async()=>{
    await page.fill('#imText',JSON.stringify({format:'monst-suitability-import-v1',stageKey:'禁忌の獄::二ノ獄',source:'GAMEWITH',evaluationType:'GRADE',entries:[{characterName:'架空既存キャラ',formName:'架空形態',grade:'S'}]}));
    await page.click('[data-act="imPreview"]');await page.click('[data-act="imApply"]');
    assert.match(await page.locator('#imMsg').textContent(),/別のタブでデータが更新されたため、保存を止めました/);
  });
  await ui('admin',async()=>{
    await page.fill('#invText',JSON.stringify({schema:'monst-hakai-main-staging-v1',device:'サブ3',scope:'破界の星墓',ownershipChecks:[],units:[{characterName:'架空取込キャラ',formName:'架空取込形態',verificationStatus:'VERIFIED',fruits:[]}]}));
    await page.click('[data-act="invPreview"]');await page.click('[data-act="invApply"]');
    assert.match(await page.locator('#invMsg').textContent(),/別のタブでデータが更新されたため、保存を止めました/);
  });
  // 適正の確認済みにする・個体の編集（キャラ画面）
  await page.evaluate(()=>{try{verifySuit('s1')}catch(e){window.__e1=e.name}});
  assert.equal(await page.evaluate(()=>window.__e1),'StaleDataError');
  await ui('chara',async()=>{await page.evaluate(()=>{db.ui.charaOpen='c1';render()});await page.click('[data-act="unitEdit"][data-id="u1"]');
    await page.fill('#unMemo','架空メモ');await page.click('[data-act="saveUnit"]');
    assert.equal(await page.locator('#unitModal.open').count(),1,'unit dialog stays open');assert.equal(await page.inputValue('#unMemo'),'架空メモ')});
  assert.equal(JSON.stringify(await stored(page)),before,'nothing written by any path');
  assert.equal(await bar().isVisible(),true);
  await other.close();
});

test('390px: the warning fits the phone screen, stays on top while scrolling and over dialogs, and does not hide buttons', async()=>{
  await seed(BASE);
  const other=await otherTabRegisters();
  await page.waitForFunction(()=>!document.getElementById('staleBar').hidden);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal scroll');
  const h=await page.evaluate(()=>document.getElementById('staleBar').getBoundingClientRect().height);
  assert.ok(h<844*0.5,'takes less than half of the screen');
  await page.evaluate(()=>window.scrollTo(0,600));
  assert.equal(await page.evaluate(()=>Math.round(document.getElementById('staleBar').getBoundingClientRect().top)),0,'stays at the top');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.click('[data-act="view"][data-view="chara"]');await page.click('[data-act="mcharAdd"]'); // ボタンが隠れていない
  const top=await page.evaluate(()=>document.elementFromPoint(195,20)?.closest('#staleBar')!==null);
  assert.equal(top,true,'warning is above the open dialog');
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  await page.screenshot({path:path.join(__dirname,'artifacts','v12-stale-warning-390.png')});
  await other.close();
});

// ===== 古いタブの控えの扱い（復元で最新データを消さない）=====
async function staleTabWithUnsavedChanges(){
  await seed(BASE);
  const other=await otherTabRegisters();               // タブBで架空スカアハαを保存
  await page.waitForFunction(()=>!document.getElementById('staleBar').hidden);
  // タブA：キャラ追加（保存されない）と編成の変更（保存されない）
  await page.click('[data-act="view"][data-view="chara"]');await page.click('[data-act="mcharAdd"]');
  await page.fill('#mcName','架空未保存キャラ');await page.click('[data-act="saveMChar"]');
  await page.evaluate(()=>{closeModals();db.ui.view='stage';render()});
  await page.locator('.pickSel[data-pick-dev="メイン"]').selectOption('u1');
  assert.equal(await page.inputValue('.pickSel[data-pick-dev="メイン"]'),'u1','screen matches the content of this tab after the refused save');
  return other;
}

test('stale export is marked, lists the differences, and restoring it never overwrites the latest data', async()=>{
  const other=await staleTabWithUnsavedChanges();
  const latest=JSON.stringify(await stored(page));
  await page.click('[data-act="staleExport"]');
  const snap=JSON.parse(await page.inputValue('#staleText'));
  assert.equal(snap.kind,'STALE_TAB_SNAPSHOT');assert.match(snap.warning,/完全なバックアップではない/);
  const diff=await page.locator('#staleDiff').textContent();
  assert.match(diff,/キャラ追加：架空未保存キャラ/);assert.match(diff,/編成：禁忌 一ノ獄 メイン → 架空既存キャラ｜架空形態 メイン 個体1/);
  assert.match(diff,/最新の保存データにだけあるもの：キャラ1件・個体1件/);
  // 新しいタブ（最新のデータ）で、控えを「復元する」に貼り付けても復元しない
  const fresh=await context.newPage();fresh.on('pageerror',e=>errors.push('fresh: '+e.message));
  await fresh.goto(url);
  await fresh.evaluate(()=>{window.__asked=0;window.confirm=()=>{window.__asked++;return true}});
  await fresh.click('[data-act="view"][data-view="admin"]');
  await fresh.fill('#bkText',JSON.stringify(snap));await fresh.click('[data-act="restore"]');
  assert.match(await fresh.locator('#bkMsg').textContent(),/古いタブの控えで、完全なバックアップではないため復元しません/);
  assert.equal(await fresh.evaluate(()=>window.__asked),0,'stopped before the overwrite confirmation');
  const bd=await fresh.locator('#bkDiff').textContent();
  assert.match(bd,/控えにあって、今のデータと違うもの/);assert.match(bd,/キャラ追加：架空未保存キャラ/);assert.match(bd,/今のデータにだけあるもの：キャラ1件・個体1件/);
  const noUi=x=>{const y=JSON.parse(typeof x==='string'?x:JSON.stringify(x));delete y.ui;return y}; // 画面の切り替え（表示状態）は保存される
  assert.deepEqual(noUi(await stored(fresh)),noUi(latest),'latest data untouched');
  assert.deepEqual(names(await stored(fresh)),['架空既存キャラ','架空スカアハα']);
  // 種類が不明なバックアップも復元しない
  await fresh.fill('#bkText',JSON.stringify({...snap,kind:'SOMETHING_ELSE'}));await fresh.click('[data-act="restore"]');
  assert.match(await fresh.locator('#bkMsg').textContent(),/種類が不明なため復元しません/);
  assert.deepEqual(noUi(await stored(fresh)),noUi(latest));
  await fresh.close();await other.close();
});

test('「バックアップを作成」 in an old tab is also marked as a snapshot (file name and message); a normal backup keeps its format', async()=>{
  const other=await staleTabWithUnsavedChanges();
  await page.evaluate(()=>{closeModals();db.ui.view='admin';render()});
  const [dl]=await Promise.all([page.waitForEvent('download'),page.click('[data-act="backup"]')]);
  assert.match(dl.suggestedFilename(),/^monst_trial_STALE_TAB_snapshot_\d{8}\.json$/);
  assert.match(await page.locator('#bkMsg').textContent(),/完全なバックアップではなく「古いタブの控え」として書き出しました/);
  assert.equal(JSON.parse(await page.inputValue('#bkText')).kind,'STALE_TAB_SNAPSHOT');
  // 再読み込みした（最新の）タブの通常バックアップは、これまでと同じ形式（kind なし）で、そのまま復元できる
  await page.reload();
  await page.click('[data-act="view"][data-view="admin"]');
  const [dl2]=await Promise.all([page.waitForEvent('download'),page.click('[data-act="backup"]')]);
  assert.match(dl2.suggestedFilename(),/^monst_trial_backup_\d{8}\.json$/);
  const normal=JSON.parse(await page.inputValue('#bkText'));
  assert.deepEqual(Object.keys(normal),['app','version','exportedAt','data']);
  await page.click('[data-act="restore"]');assert.match(await page.locator('#bkMsg').textContent(),/復元しました/);
  assert.deepEqual(names(await stored(page)),['架空既存キャラ','架空スカアハα']);
  await other.close();
});

test('after a conflict, the unsaved input can be kept and re-entered without losing the latest data', async()=>{
  const other=await staleTabWithUnsavedChanges();
  await page.click('[data-act="staleExport"]');
  const snap=await page.inputValue('#staleText');
  await page.click('[data-act="staleReload"]');await page.waitForLoadState();
  assert.equal(await bar().isVisible(),false);
  // 控えを貼り付けて違いを確認（復元はされない）
  await page.click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',snap);await page.click('[data-act="restore"]');
  assert.match(await page.locator('#bkDiff').textContent(),/キャラ追加：架空未保存キャラ/);
  // 一覧を見ながら入力し直す
  await page.click('[data-act="view"][data-view="chara"]');await page.click('[data-act="mcharAdd"]');
  await page.fill('#mcName','架空未保存キャラ');await page.click('[data-act="saveMChar"]');
  await page.evaluate(()=>{db.ui.view='stage';render()});
  await page.locator('.pickSel[data-pick-dev="メイン"]').selectOption('u1');
  const d=await stored(page);
  assert.deepEqual(names(d),['架空既存キャラ','架空スカアハα','架空未保存キャラ'],'latest registration kept and the re-entered one added');
  assert.deepEqual(d.picks,{'禁忌の獄::一ノ獄':{'メイン':'u1'}});
  // 入力し直した後は、控えにだけある内容が無くなる（キャラは新しいIDなので「追加」として残らないよう、名前でも確認）
  await page.click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',snap);await page.click('[data-act="restore"]');
  const t=await page.locator('#bkDiff').textContent();
  assert.doesNotMatch(t,/編成：/,'pick re-entered');
  await other.close();
});

test('direct save paths: after a refused save the screen matches the content of this tab, nothing breaks, and repeated taps stay refused', async()=>{
  await seed({...BASE,characters:[{id:'L1',name:'架空旧キャラ',device:'メイン',count:1},{id:'L2',name:'架空貸出中',device:'メイン',lentTo:'サブ1',count:1}]});
  const other=await otherTabRegisters();
  const before=JSON.stringify(await stored(page));
  // 旧機能の返却：保存は止まるが、画面はこのタブの内容（返却済み）に合う
  await page.evaluate(()=>{db.ui.view='device';render()});
  await page.locator('#deviceCards [data-act="return"][data-id="L2"]').first().click();
  assert.equal(await page.evaluate(()=>db.characters.find(c=>c.id==='L2').lentTo),null);
  assert.equal(await page.locator('#deviceCards [data-act="return"][data-id="L2"]').count(),0,'screen redrawn from the content of this tab');
  // 何度押しても保存されない・エラーにならない（ダイアログは開いたまま）
  await page.locator('#deviceCards [data-act="lend"][data-id="L1"]').first().click();await page.selectOption('#lendTo','サブ2');
  for(let i=0;i<3;i++){await page.click('[data-act="saveLend"]');assert.equal(await page.locator('#lendModal.open').count(),1,'dialog stays open')}
  await page.evaluate(()=>closeModals());
  assert.equal(JSON.stringify(await stored(page)),before);
  // 書き出した控えには、このタブの内容（返却済み）が入る
  await page.click('[data-act="staleExport"]');
  assert.match(await page.locator('#staleDiff').textContent(),/旧登録キャラの変更：架空貸出中（在籍）/);
  await other.close();
});
