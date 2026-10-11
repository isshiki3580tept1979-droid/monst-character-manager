// v30 工程1：スクショ登録の わくわくの実 4枠対応（読取JSON → 確認画面 → 登録・保留・再開・バックアップ復元）。保存形式は不変。
// 架空データだけを使う。隔離ブラウザで実行し、外部へは通信しない。Same harness as trial-v16.test.cjs.
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

// ===== v30 工程1：スクショ登録の わくわくの実 4枠対応 =====
// 架空キャラ（リンネ No.8929・ネオ No.8570 の報告を参考にした4個の実）。保存形式は不変（units[].fruits は最大4）
const FOUR=[['速必殺の力','特級EL'],['兵命削りの力','特級EL'],['将命削りの力','特級EL'],['熱き友撃の力','特級EL']];
const FOUR_TXT=FOUR.map(([n,g])=>n+' '+g);
const R4={format:'monst-screenshot-reading-v1',characterName:'架空リンネ',formName:null,monsterNo:'99301',race:'神',battleType:'バランス型',shotType:'貫通',
  fruit1:FOUR_TXT[0],fruit2:FOUR_TXT[1],fruit3:FOUR_TXT[2],fruit4:FOUR_TXT[3],confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[]};
const kindless=a=>a.map(([name,grade])=>({name,grade,kind:''}));
const EMPTY={characters:[],master:{characters:[],forms:[]},units:[]};
async function preview(r){await page.click('[data-act="view"][data-view="admin"]');await page.fill('#srText',typeof r==='string'?r:JSON.stringify(r));await page.click('[data-act="srPreview"]')}
async function toConfirm(device='サブ2'){await page.selectOption('#srDevice',device);await page.click('[data-act="srCheck"]')}
const val=id=>page.inputValue('#'+id);
const editFruits=async()=>{const o=[];for(const i of [1,2,3,4])o.push([await val('srFr'+i+'Name'),await val('srFr'+i+'Grade')]);return o};
const fr4Visible=()=>page.locator('#srFr4Field').isVisible();
const btn4Visible=()=>page.locator('#srFr4Btn').isVisible();
const unitsByName=(d,name)=>{const ids=new Set(d.master.forms.filter(f=>d.master.characters.find(c=>c.id===f.characterId)?.name===name).map(f=>f.id));return d.units.filter(u=>ids.has(u.formId))};
const pend=()=>page.evaluate(()=>JSON.parse(JSON.stringify(db.pendingReadings)));
const restoreInto=async(bk)=>{
  await seed({characters:[]});
  await click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',bk);await click('[data-act="restore"]');
  return snapshot();
};

test('a reading with 4 fruits: all four are shown in the editor in the same order, with names and grades as read; the 4th row is visible', async()=>{
  await seed(EMPTY);await preview(R4);
  assert.deepEqual(await editFruits(),FOUR);
  assert.equal(await fr4Visible(),true);assert.equal(await btn4Visible(),false);
  assert.match(await txt(page.locator('#srEdit')),/わくわくの実4/);
  assert.equal(await page.locator('#srWarn').count(),0,'no warning or conversion note for a clean 4-fruit reading');
  assert.equal(await page.locator('#srInfo').count(),0);
  assert.equal(await page.locator('#srNeedsReview').isChecked(),false,'a clean reading stays 確認済み');
});

test('4 fruits: confirmation screen lists all four; register saves all four (names, grades, order); reload and backup→restore keep them', async()=>{
  await seed(EMPTY);await preview(R4);await toConfirm('サブ2');
  assert.match(await txt(page.locator('#srResult')),/わくわくの実：速必殺の力 特級EL、兵命削りの力 特級EL、将命削りの力 特級EL、熱き友撃の力 特級EL/);
  await click('[data-act="srApply"]');
  assert.match(await page.locator('#srDone').textContent(),/登録しました（保存済み）/);
  let d=await stored();
  assert.deepEqual(unitsByName(d,'架空リンネ').map(u=>u.fruits),[kindless(FOUR)]);
  await page.reload();d=await stored();assert.deepEqual(unitsByName(d,'架空リンネ')[0].fruits,kindless(FOUR),'after reload');
  const bk=await page.evaluate(()=>backupJson());
  const r=await restoreInto(bk);
  assert.deepEqual(unitsByName(r,'架空リンネ')[0].fruits,kindless(FOUR),'after backup → restore');
});

test('game-style grade abbreviations on all four slots are converted by the existing table only (特EL → 特級EL); names untouched', async()=>{
  await seed(EMPTY);
  await preview({...R4,fruit1:'速必殺の力 特EL',fruit2:'兵命削りの力（特級EL）',fruit3:'将命削りの力 特EL',fruit4:'熱き友撃の力 特EL'});
  assert.deepEqual(await editFruits(),FOUR);
  assert.match(await txt(page.locator('#srInfo')),/わくわくの実4の等級「特EL」を「特級EL」に変換しました/);
  await toConfirm('サブ2');await click('[data-act="srApply"]');
  const d=await stored();assert.deepEqual(unitsByName(d,'架空リンネ')[0].fruits,kindless(FOUR));
});

test('old JSON (no fruit4 key), fruit4 null or blank: the 4th row stays hidden behind an add button, 3 fruits are saved, and nothing is flagged for review', async()=>{
  const {fruit4,...no4}=R4;
  for(const [label,r] of [['missing',no4],['null',{...no4,fruit4:null}],['blank',{...no4,fruit4:'  '}]]){
    await seed(EMPTY);await preview(r);
    assert.deepEqual(await editFruits(),[...FOUR.slice(0,3),['','']],label);
    assert.equal(await fr4Visible(),false,label+': 4th row hidden');assert.equal(await btn4Visible(),true,label+': add button shown');
    assert.equal(await page.locator('#srWarn').count(),0,label);assert.equal(await page.locator('#srNeedsReview').isChecked(),false,label+': not forced to 要確認');
    await toConfirm('メイン');await click('[data-act="srApply"]');
    const d=await stored();assert.deepEqual(unitsByName(d,'架空リンネ')[0].fruits,kindless(FOUR.slice(0,3)),label);
    assert.equal(unitsByName(d,'架空リンネ')[0].verificationStatus,'VERIFIED',label+': 確認済みのまま');
  }
});

test('0, 1, 2 and 3 fruits behave as before (counts, order, 確認状態), with fruit4 absent', async()=>{
  const {fruit4,...no4}=R4;
  for(const n of [0,1,2,3]){
    await seed(EMPTY);
    const r={...no4};[1,2,3].forEach(i=>{r['fruit'+i]=i<=n?FOUR_TXT[i-1]:null});
    await preview(r);
    assert.deepEqual(await editFruits(),[...FOUR.slice(0,n),...Array(4-n).fill(['',''])],n+' fruits');
    assert.equal(await fr4Visible(),false);
    await toConfirm('サブ3');await click('[data-act="srApply"]');
    assert.deepEqual(unitsByName(await stored(),'架空リンネ')[0].fruits,kindless(FOUR.slice(0,n)),n+' fruits saved');
  }
});

test('"＋ 4枠目を追加" reveals the 4th row; typing a 4th fruit there is collected and saved; leaving it empty saves nothing extra', async()=>{
  const {fruit4,...no4}=R4;
  await seed(EMPTY);await preview(no4);
  await click('#srFr4Btn');
  assert.equal(await fr4Visible(),true);assert.equal(await btn4Visible(),false);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'srFr4Name','focus moves to the new row');
  await page.fill('#srFr4Name',FOUR[3][0]);await page.selectOption('#srFr4Grade',FOUR[3][1]);
  await toConfirm('サブ2');
  assert.match(await txt(page.locator('#srResult')),/熱き友撃の力 特級EL/);
  await click('[data-act="srApply"]');
  assert.deepEqual(unitsByName(await stored(),'架空リンネ')[0].fruits,kindless(FOUR));
  // 開いても空欄なら3つのまま
  await seed(EMPTY);await preview(no4);await click('#srFr4Btn');await toConfirm('サブ2');await click('[data-act="srApply"]');
  assert.equal(unitsByName(await stored(),'架空リンネ')[0].fruits.length,3);
});

test('an uncertain fruit4 (listed in uncertainFields) opens the 4th row, is highlighted, and an empty fruit4 alone adds no warning', async()=>{
  await seed(EMPTY);await preview({...R4,fruit4:null,uncertainFields:['fruit4'],needsReview:true,reviewNotes:['4つ目の実が隠れている']});
  assert.equal(await fr4Visible(),true,'shown so the user can look at it');
  assert.match(await page.locator('#srFr4Field').getAttribute('class'),/srUnc/);
  assert.equal(await page.locator('#srNeedsReview').isChecked(),true);
});

test('hold with 4 fruits: all four are stored in the pending entry (and shown in the list); reload, resume, register and backup→restore keep all four', async()=>{
  await seed(EMPTY);await preview({...R4,needsReview:true});
  await click('[data-act="srHold"]');
  let p=await pend();assert.equal(p.length,1);
  assert.deepEqual(p[0].fruits,FOUR.map(([name,grade])=>({name,grade})),'4 fruits in the stored pending entry');
  assert.match(await txt(page.locator('#srPendingList')),/実：速必殺の力 特級EL、兵命削りの力 特級EL、将命削りの力 特級EL、熱き友撃の力 特級EL/);
  await page.reload();p=await pend();assert.equal(p[0].fruits.length,4,'after reload');
  const bk=await page.evaluate(()=>backupJson());
  const r=await restoreInto(bk);assert.deepEqual(r.pendingReadings[0].fruits,FOUR.map(([name,grade])=>({name,grade})),'pending after backup → restore');
  // 再開：4つとも入力欄に戻り、4枠目も開いている
  await click('[data-act="view"][data-view="admin"]');
  await click('[data-act="srResume"]');
  assert.deepEqual(await editFruits(),FOUR);assert.equal(await fr4Visible(),true);
  assert.equal(await page.locator('#srWarn').count(),0,'no re-conversion note on resume');
  // もう一度保留 → その保留だけを更新（4つのまま）
  await click('[data-act="srHold"]');p=await pend();assert.equal(p.length,1);assert.equal(p[0].fruits.length,4);
  await click('[data-act="srResume"]');await toConfirm('サブ2');await click('[data-act="srApply"]');
  const d=await stored();
  assert.deepEqual(unitsByName(d,'架空リンネ')[0].fruits,kindless(FOUR),'registered with 4 fruits');
  assert.deepEqual(d.pendingReadings,[],'the resumed pending entry is removed only after the successful register');
});

test('a pending entry held earlier with 3 fruits (or fewer) resumes as before: stored value untouched, 4th row hidden', async()=>{
  const P3={id:'old3',at:'2026-10-09T10:00:00.000Z',updatedAt:'',device:'メイン',characterName:'架空旧保留',formName:'',monsterNo:'',race:'',battleType:'',shotType:'',
    fruits:FOUR.slice(0,3).map(([name,grade])=>({name,grade})),needsReview:true,confidence:'MEDIUM',reviewNotes:[],uncertainFields:[]};
  await seed({...EMPTY,pendingReadings:[P3]});
  assert.deepEqual((await pend())[0],P3,'loaded as is');
  await click('[data-act="view"][data-view="admin"]');await click('[data-act="srResume"][data-id="old3"]');
  assert.deepEqual(await editFruits(),[...FOUR.slice(0,3),['','']]);assert.equal(await fr4Visible(),false);assert.equal(await btn4Visible(),true);
  assert.deepEqual((await pend())[0],P3,'stored entry untouched by resuming');
});

test('a pending entry with more than 4 fruits (hand-edited data) is cut at 4, never beyond', async()=>{
  const P5={id:'p5',at:'2026-10-09T10:00:00.000Z',updatedAt:'',device:'',characterName:'架空五つ',formName:'',monsterNo:'',race:'',battleType:'',shotType:'',
    fruits:[...FOUR,['余分の実','特級L']].map(([name,grade])=>({name,grade})),needsReview:true,confidence:'LOW',reviewNotes:[],uncertainFields:[]};
  await seed({...EMPTY,pendingReadings:[P5]});
  assert.deepEqual((await pend())[0].fruits,FOUR.map(([name,grade])=>({name,grade})));
});

test('a reading with a 5th key (fruit5) is accepted; the extra key is ignored and the 4 fruits are kept', async()=>{
  await seed(EMPTY);await preview({...R4,fruit5:'余分の実 特級L'});
  assert.deepEqual(await editFruits(),FOUR);
  await toConfirm('サブ2');await click('[data-act="srApply"]');
  assert.deepEqual(unitsByName(await stored(),'架空リンネ')[0].fruits,kindless(FOUR));
});

test('duplicate fruits: the same fruit twice in a reading is kept as read, in order (no merging, no dropping)', async()=>{
  await seed(EMPTY);await preview({...R4,fruit3:FOUR_TXT[0],fruit4:FOUR_TXT[0]});
  assert.deepEqual(await editFruits(),[FOUR[0],FOUR[1],FOUR[0],FOUR[0]]);
  await toConfirm('サブ2');await click('[data-act="srApply"]');
  assert.deepEqual(unitsByName(await stored(),'架空リンネ')[0].fruits,kindless([FOUR[0],FOUR[1],FOUR[0],FOUR[0]]));
});

test('same-device duplicate check compares all four fruits: a unit with the same 4 is "実も同じ"; a unit that differs only in the 4th is not; nothing is overwritten', async()=>{
  const base=(fr)=>({characters:[],master:{characters:[{id:'c1',name:'架空リンネ'}],forms:[{id:'f1',characterId:'c1',name:'',unknownForm:true,short:'',race:'',battleType:'',shotType:''}]},
    units:[{id:'u1',formId:'f1',device:'サブ2',no:1,fruits:fr,memo:''}]});
  await seed(base(kindless(FOUR)));await preview(R4);await toConfirm('サブ2');
  assert.match(await txt(page.locator('#srDupNote')),/実も同じ＝同じ個体の可能性が高い/);
  assert.equal(await page.locator('#srDupNone').isChecked(),true,'default: do nothing');
  await click('[data-act="srApply"]');assert.equal((await stored()).units.length,1,'nothing registered');
  const alt=kindless([...FOUR.slice(0,3),['別の実','特級L']]);
  await seed(base(alt));await preview(R4);await toConfirm('サブ2');
  assert.doesNotMatch(await txt(page.locator('#srDupNote')),/実も同じ/);
  assert.match(await txt(page.locator('#srDupNote')),/別の実 特級L/,'existing unit shows its 4th fruit');
  await click('[data-act="srApply"]');assert.deepEqual((await stored()).units.map(u=>u.fruits),[alt],'existing unit untouched');
});

test('existing data with 0〜4 fruits is not changed by this version (load → save keeps every unit exactly)', async()=>{
  const FRx=n=>kindless(FOUR.slice(0,n));
  const raw={characters:[],master:{characters:[{id:'c1',name:'架空甲'}],forms:[{id:'f1',characterId:'c1',name:'',unknownForm:true,short:'',race:'',battleType:'',shotType:''}]},
    units:[0,1,2,3,4].map(n=>({id:'u'+n,formId:'f1',device:'メイン',no:n+1,fruits:FRx(n),memo:''}))};
  await seed(raw);
  assert.deepEqual((await snapshot()).units.map(u=>u.fruits),[0,1,2,3,4].map(FRx));
  await preview({...R4,characterName:'架空乙'});await toConfirm('サブ1');await click('[data-act="srApply"]');
  assert.deepEqual((await stored()).units.slice(0,5).map(u=>u.fruits),[0,1,2,3,4].map(FRx),'earlier units untouched');
});

for(const [w,h] of [[390,844],[360,640]]) test(`${w}px: the 4-fruit editor and confirmation fit without horizontal scroll; every input stays inside the screen`, async()=>{
  await page.setViewportSize({width:w,height:h});
  await seed(EMPTY);await preview({...R4,fruit1:'同族の絆・加命撃速 特級EL',fruit4:'撃種の絆・加撃速命 特級EL'});
  const m=await page.evaluate(()=>{const ids=['srFr1Name','srFr2Name','srFr3Name','srFr4Name','srFr4Grade'];
    return {hscroll:document.documentElement.scrollWidth>innerWidth,inside:ids.every(i=>{const r=document.getElementById(i).getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>=36}),
      order:ids.slice(0,4).map(i=>Math.round(document.getElementById(i).getBoundingClientRect().top))}});
  assert.equal(m.hscroll,false);assert.equal(m.inside,true);assert.ok(m.order.every((t,i)=>!i||t>m.order[i-1]),'rows stack 1→4 top to bottom');
  await toConfirm('サブ2');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'confirmation screen: no horizontal scroll');
  await page.screenshot({path:path.join(__dirname,'artifacts',`v30-fruit4-${w}x${h}.png`)});
});

// ===== 公開前の追加安全確認：すでに実を4個持つ個体に、実3個（旧3枠の読取アプリの形）のデータを再登録したとき =====
// 守るもの：同じ個体の4個目・メモ・確認状態・二つ名・取り込み元。既存の個体は「何もしない」でも「別の個体として追加」でも一切変わらない
const OLD3={format:'monst-screenshot-reading-v1',characterName:'架空リンネ',formName:null,monsterNo:'99301',race:'神',battleType:'バランス型',shotType:'貫通',
  fruit1:FOUR_TXT[0],fruit2:FOUR_TXT[1],fruit3:FOUR_TXT[2],confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[]}; // fruit4 のキー自体が無い（旧読取アプリ）
const base4=()=>({characters:[],master:{characters:[{id:'c1',name:'架空リンネ'}],forms:[{id:'f1',characterId:'c1',name:'',unknownForm:true,short:'',race:'',battleType:'',shotType:''}]},
  units:[{id:'u1',formId:'f1',device:'サブ2',no:1,fruits:kindless(FOUR),memo:'手入力のメモ',epithet:'架空の二つ名',verificationStatus:'VERIFIED',importSource:'MANUAL'}]});
const unit1=async()=>(await snapshot()).units.find(u=>u.id==='u1');

test('existing unit with 4 fruits + an old 3-fruit reading (same first three): default "何もしない" saves nothing, the 4th fruit and every other field stay', async()=>{
  await seed(base4());const before=await unit1();
  assert.equal(before.fruits.length,4);
  await preview(OLD3);
  assert.equal(await fr4Visible(),false);
  await toConfirm('サブ2');
  const note=await txt(page.locator('#srDupNote'));
  assert.match(note,/個体1・実：速必殺の力 特級EL、兵命削りの力 特級EL、将命削りの力 特級EL、熱き友撃の力 特級EL/,'the existing unit is shown with all four fruits');
  assert.doesNotMatch(note,/実も同じ/,'3 fruits is not "the same" as 4 fruits');
  assert.equal(await page.locator('#srDupNone').isChecked(),true);
  assert.equal(await page.locator('#srPlan').getAttribute('data-mode'),'none');
  const s0=await sets();
  await click('[data-act="srApply"]');
  assert.match(await txt(page.locator('#srMsg')),/保存していません/);
  assert.equal(await sets(),s0,'no write to storage');
  assert.deepEqual(await unit1(),before);assert.equal((await snapshot()).units.length,1);
  await page.reload();assert.deepEqual(await unit1(),before,'after reload');
});

test('existing unit with 4 fruits + an old 3-fruit reading, "別の個体として追加": a new 3-fruit unit is added and the existing unit is unchanged', async()=>{
  await seed(base4());const before=await unit1();
  await preview(OLD3);await toConfirm('サブ2');
  await click('#srDupOk');
  const plan=await txt(page.locator('#srPlan'));
  assert.match(plan,/新しい個体として追加/);assert.match(plan,/既存の個体は変更しません/);
  assert.doesNotMatch(plan,/熱き友撃の力/,'the 3-fruit reading adds no 4th fruit to the plan');
  await click('[data-act="srApply"]');
  const d=await stored();
  assert.equal(d.units.length,2);
  assert.deepEqual(d.units.find(u=>u.id==='u1'),before,'existing unit unchanged (fruits, memo, epithet, status, importSource)');
  const added=d.units.find(u=>u.id!=='u1');
  assert.deepEqual(added.fruits,kindless(FOUR.slice(0,3)));assert.equal(added.no,2);assert.equal(added.device,'サブ2');
});

test('a 4-fruit reading with a different 4th fruit against an existing 4-fruit unit: both modes leave the existing unit untouched', async()=>{
  await seed(base4());const before=await unit1();
  await preview({...R4,fruit4:'別の実 特級L'});await toConfirm('サブ2');
  assert.doesNotMatch(await txt(page.locator('#srDupNote')),/実も同じ/);
  await click('[data-act="srApply"]');assert.deepEqual(await unit1(),before,'default: nothing');
  await click('#srDupOk');await click('[data-act="srApply"]');
  const d=await stored();assert.deepEqual(d.units.find(u=>u.id==='u1'),before);
  assert.deepEqual(d.units.find(u=>u.id!=='u1').fruits.map(f=>f.name),[...FOUR.slice(0,3).map(f=>f[0]),'別の実']);
});

test('hold / resume: a pending 3-fruit reading resumed against an existing 4-fruit unit never changes that unit; "何もしない" keeps the pending entry; adding removes only that entry', async()=>{
  await seed(base4());const before=await unit1();
  await preview(OLD3);await click('[data-act="srHold"]');
  assert.equal((await pend()).length,1);assert.deepEqual(await unit1(),before,'holding does not touch units');
  await page.reload();await click('[data-act="view"][data-view="admin"]');await click('[data-act="srResume"]');
  assert.equal(await fr4Visible(),false);
  await toConfirm('サブ2');await click('[data-act="srApply"]');
  assert.equal((await pend()).length,1,'"何もしない" keeps the pending entry');assert.deepEqual(await unit1(),before);
  await click('#srDupOk');await click('[data-act="srApply"]');
  const d=await stored();
  assert.deepEqual(d.pendingReadings,[],'only after the successful add');
  assert.deepEqual(d.units.find(u=>u.id==='u1'),before);assert.equal(d.units.length,2);
});

test('hold / resume of a 4-fruit reading while the same device already has the same 4-fruit unit: the existing 4 are kept, resume keeps all four, and backup→restore keeps both', async()=>{
  await seed(base4());const before=await unit1();
  await preview(R4);await click('[data-act="srHold"]');
  assert.equal((await pend())[0].fruits.length,4);
  await click('[data-act="srResume"]');assert.deepEqual(await editFruits(),FOUR);
  await toConfirm('サブ2');
  assert.match(await txt(page.locator('#srDupNote')),/実も同じ/);
  await click('[data-act="srApply"]');assert.deepEqual(await unit1(),before);assert.equal((await pend()).length,1);
  const bk=await page.evaluate(()=>backupJson());
  const r=await restoreInto(bk);
  assert.deepEqual(r.units.find(u=>u.id==='u1').fruits,kindless(FOUR),'4 fruits survive backup→restore');
  assert.equal(r.pendingReadings[0].fruits.length,4);
});

test('inventory-JSON re-import (所持データ取り込み) onto an existing 4-fruit unit: fewer fruits or a different 4th is a conflict, never an overwrite; the same 4 changes nothing', async()=>{
  const j=fr=>JSON.stringify({schema:'monst-hakai-main-staging-v1',device:'サブ2',scope:'破界の星墓',ownershipChecks:[],
    units:[{characterName:'架空リンネ',formName:'架空形態',unitNo:1,monsterNo:'',verificationStatus:'VERIFIED',fruits:fr.map(([name,grade])=>({name,grade}))}]});
  const named=base4();named.master.forms[0]={id:'f1',characterId:'c1',name:'架空形態',short:'',race:'',battleType:'',shotType:''};
  await seed(named);const before=await unit1();
  const run=async fr=>{await click('[data-act="view"][data-view="admin"]');await page.fill('#invText',j(fr));await click('[data-act="invPreview"]');
    const t=(await page.locator('#invResult').textContent()).replace(/\s+/g,' ');
    if(!(await page.locator('#invApply').isDisabled())) await click('#invApply');
    return t};
  let t=await run(FOUR.slice(0,3));
  assert.match(t,/実が既存と違います（上書きしません）/);assert.ok(await page.locator('#invApply').isDisabled());assert.deepEqual(await unit1(),before,'3 fruits do not shorten the 4');
  t=await run([...FOUR.slice(0,3),['別の実','特級L']]);
  assert.match(t,/実が既存と違います（上書きしません）/);assert.deepEqual(await unit1(),before,'a different 4th does not replace it');
  t=await run(FOUR);
  assert.doesNotMatch(t,/違います/);assert.deepEqual(await unit1(),before,'the same 4 changes nothing');
  assert.equal((await snapshot()).units.length,1);
});

test('old-shape reading (no fruit4) + an existing 4-fruit unit on ANOTHER device: that unit is not touched and the new one is registered with 3 fruits', async()=>{
  await seed(base4());const before=await unit1();
  await preview(OLD3);await toConfirm('サブ3');
  assert.equal(await page.locator('#srDupNote').count(),0,'no duplicate on a different device');
  await click('[data-act="srApply"]');
  const d=await stored();assert.deepEqual(d.units.find(u=>u.id==='u1'),before);
  assert.deepEqual(d.units.find(u=>u.id!=='u1').fruits,kindless(FOUR.slice(0,3)));
});
