// v33：適正データの一括取り込み（複数ステージ・monst-suitability-bundle-v1）。架空データだけを使う。
// 全ステージを1回で保存・失敗時は全体を取り消し・既存データ（別ステージの適正・所持個体・編成・貸出・実）は変えない・似た名前は結び付けない。
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
const snapshot=()=>page.evaluate(()=>JSON.parse(JSON.stringify(db)));
const sets=()=>page.evaluate(()=>window.storageAccess.filter(([m])=>m==='setItem').length);
async function seed(raw){await page.evaluate(({key,raw})=>localStorage.setItem(key,JSON.stringify(raw)),{key:KEY,raw});await page.reload()}
const stored=()=>page.evaluate(key=>JSON.parse(Object.getPrototypeOf(localStorage).getItem.call(localStorage,key)||'null'),KEY);
const storedRaw=()=>page.evaluate(key=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,key),KEY);
const txt=async l=>(await l.textContent()).replace(/\s+/g,' ').trim();
const plain=o=>JSON.parse(JSON.stringify(o));

const T1='天魔の孤城::試練の間・第1の間', T2='天魔の孤城::試練の間・第2の間', T4='天魔の孤城::試練の間・第4の間', G1='天魔の孤城::空中庭園・第1の園', H='破界の星墓::ティル・ナ・ノーグ';
const FR=[{name:'速必殺の力',grade:'特級EL',kind:''},{name:'兵命削りの力',grade:'特級EL',kind:''},{name:'将命削りの力',grade:'特級EL',kind:''},{name:'熱き友撃の力',grade:'特級EL',kind:''}];
const fm=(id,characterId,name,extra={})=>({id,characterId,name,short:'',race:'',battleType:'',shotType:'',...(name?{}:{unknownForm:true}),...extra});
// 架空ネオ（所持・ハロー）、架空スカアハ（所持・形態未確認・貸出中）、架空ラー（適正図鑑・個体なし）。第4の間と破界に既存の適正、第1の間に手動の適正
const SEED=()=>({characters:[],deviceNames:{'メイン':'架空マフティー','サブ1':'架空iPad'},
  master:{characters:[{id:'c1',name:'架空ネオ'},{id:'c2',name:'架空スカアハ'},{id:'c3',name:'架空ラー',origin:'SUIT_CATALOG'}],
    forms:[fm('f1','c1','ハロー'),fm('f2','c2',''),fm('f3','c3','真獣神化',{origin:'SUIT_CATALOG'})]},
  units:[{id:'u1',formId:'f1',device:'メイン',no:1,fruits:FR,memo:'メモ1',epithet:'',verificationStatus:'VERIFIED',importSource:'MANUAL'},
    {id:'u2',formId:'f2',device:'サブ1',no:1,fruits:FR.slice(0,2),memo:'',epithet:'古の',verificationStatus:'NEEDS_REVIEW',importSource:'MANUAL',lentTo:'メイン'}],
  suits:[{id:'s4',stageKey:T4,formId:'f3',source:'GAMEWITH',sourceUrl:'https://example.invalid/4',sourceUpdatedAt:'2026-09-09',evaluationType:'GRADE',grade:'S',verificationStatus:'VERIFIED',note:'架空 第4の間'},
    {id:'sh',stageKey:H,formId:'f2',source:'GAMEWITH',evaluationType:'GRADE',grade:'A',verificationStatus:'VERIFIED',note:'架空 破界'},
    {id:'sm',stageKey:T1,formId:'f1',source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'}],
  picks:{[H]:{'メイン':'u1'},[T1]:{'サブ1':'u2'}},useDevs:{[H]:['メイン'],[T1]:['メイン','サブ1']},
  ui:{view:'admin',quest:'天魔の孤城',stage:{}}});
const blk=(stageKey,entries,x={})=>({format:'monst-suitability-import-v1',stageKey,source:'GAMEWITH',sourceUrl:'https://example.invalid/'+encodeURIComponent(stageKey),sourceUpdatedAt:'2026-09-30',evaluationType:'GRADE',entries,...x});
const e=(characterName,formName,grade,verificationStatus='VERIFIED',note='')=>({characterName,formName,grade,verificationStatus,note});
const BLOCKS=()=>[
  blk(T1,[e('架空ネオ','獣神化改','S','NEEDS_REVIEW','架空：獣神化改≠ハロー'),e('架空スカアハα','獣神化','S'),e('架空ホムラ','獣神化','A')]),
  blk(T2,[e('架空ラー','真獣神化','A'),e('架空ホムラ','獣神化','S'),e('架空ホムラα','獣神化','A')]),
  blk(G1,[e('架空ツバキ','神化','A','UNVERIFIED')])];
const BUNDLE=(x={})=>{const blocks=x.blocks||BLOCKS();return {format:'monst-suitability-bundle-v1',title:'架空 一括取り込み',stageCount:blocks.length,entryCount:blocks.reduce((a,b)=>a+b.entries.length,0),blocks,...x}};
const PROT=d=>plain({units:d.units,picks:d.picks,useDevs:d.useDevs,deviceNames:d.deviceNames,ownershipChecks:d.ownershipChecks,
  chars:d.master.characters.filter(c=>c.origin!=='SUIT_CATALOG'||c.id==='c3'),forms:d.master.forms.filter(f=>['f1','f2','f3'].includes(f.id)),
  keep:d.suits.filter(s=>['s4','sh','sm'].includes(s.id))});
async function admin(){await click('[data-act="view"][data-view="admin"]')}
async function previewBundle(obj,{catalog=true}={}){
  await admin();
  await page.evaluate(t=>{const el=document.getElementById('imbText');el.value=t;el.dispatchEvent(new Event('input',{bubbles:true}))},typeof obj==='string'?obj:JSON.stringify(obj));
  if(catalog) await page.check('#imbCatalogOn');else await page.uncheck('#imbCatalogOn');
  await click('[data-act="imbPreview"]');
}
const res=()=>txt(page.locator('#imbResult'));
const msg=()=>txt(page.locator('#imbMsg'));
const nameOf=(d,formId)=>{const f=d.master.forms.find(x=>x.id===formId);return [d.master.characters.find(c=>c.id===f?.characterId)?.name,f?.name]};
const tenma=d=>d.suits.filter(s=>[T1,T2,G1].includes(s.stageKey)&&s.source==='GAMEWITH').map(s=>[s.stageKey,...nameOf(d,s.formId),s.grade,s.verificationStatus,s.note,s.sourceUrl,s.sourceUpdatedAt].join('|')).sort();
const issueKeys=d=>d.importIssues.map(x=>[x.stageKey,x.characterName,x.formName].join('|')).sort();

test('1. the bundle panel is separate from the 1-stage panel and fits a 390px screen (file select, paste, buttons)', async()=>{
  await seed(SEED());await admin();
  assert.match(await txt(page.locator('.panel .ptitle',{hasText:'1ステージずつ'})),/適正データの取り込み（JSON・1ステージずつ）/);
  assert.match(await txt(page.locator('#imbPanel .ptitle')),/適正データの一括取り込み（複数ステージ・ファイル）/);
  assert.equal(await page.locator('#imbFile').count(),1);assert.equal(await page.locator('#imbApply').isDisabled(),true);
  await previewBundle(BUNDLE());
  const w=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,win:innerWidth,
    boxes:['#imbFile','[data-act="imbPreview"]','#imbApply','#imbResult'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,r.left,r.right,r.height]})}));
  assert.ok(w.doc<=w.win,`no horizontal scroll (${w.doc}>${w.win})`);
  for(const [s,l,r,h] of w.boxes){assert.ok(l>=0&&r<=390,`${s} inside 390px`);if(s!=='#imbResult')assert.ok(h>=28,`${s} tappable (${h}px)`)}
});

test('2. preview: stage count, totals, add/update/hold, auto-matched characters, needs-review rows, held rows and per-stage counts; nothing is saved', async()=>{
  await seed(SEED());await admin();const noUi=async()=>{const d=await stored();delete d.ui;return d};const d0=await noUi();
  await previewBundle(BUNDLE());
  const t=await res();
  assert.match(t,/対象 3ステージ／適正 7件/);
  assert.match(t,/新規追加 5件・更新 0件・変更なし 0件・保留 2件/);
  assert.match(t,/内訳の合計 7件（ファイルの件数と一致）/);
  assert.match(t,/適正図鑑に追加：キャラ2・形態3（所持個体は作りません）/);
  assert.match(t,/登録済みのキャラに付く（自動照合 2キャラ）/);
  assert.match(t,/架空ネオ（所持個体1体）：獣神化改（新しい形態として追加）・要確認・1ステージ/);
  assert.match(t,/架空ラー（個体なし）：真獣神化・1ステージ/);
  assert.match(t,/要確認・未検証のまま入る行（2件）/);
  assert.match(t,/天魔 試練の間・第1の間：架空ネオ（獣神化改） S（要確認）/);assert.match(t,/架空ツバキ（神化） A（未検証）/);
  assert.match(t,/取り込み対象外：保留（2件/);
  assert.match(t,/架空スカアハα（獣神化） S ?未登録のキャラ（自動では作成しません）/);
  assert.match(t,/架空ホムラα（獣神化） A ?未登録のキャラ（同じファイルで追加するキャラと名前が似ているため、自動では作成しません）/);
  assert.match(t,/ステージ別の件数（3ステージ）/);
  assert.match(t,/試練の間・第1の間（GameWith・3行） ?追加 2・更新 0・変更なし 0・保留 1（うち要確認・未検証 1）/);
  assert.match(t,/試練の間・第2の間（GameWith・3行） ?追加 2・更新 0・変更なし 0・保留 1/);
  assert.equal(await page.locator('#imbApply').isDisabled(),false);
  assert.deepEqual(await noUi(),d0,'preview writes no data (only the open screen may be remembered)');
});

test('3. apply: all stages in ONE save; saved = planned (5 added, 2 held); needs-review stays; no owned unit is linked or created; existing suits/units/team/lent/fruits unchanged', async()=>{
  await seed(SEED());const d0=await snapshot();
  await previewBundle(BUNDLE());const s0=await sets();
  await click('#imbApply');
  assert.equal(await sets()-s0,1,'exactly one write for all stages');
  assert.match(await msg(),/3ステージを取り込みました（追加5件・更新0件・保留2件）。保存を確認しました。/);
  assert.match(await res(),/取り込み結果/);
  const d=await stored();
  assert.deepEqual(PROT(d),PROT(d0),'第4の間・破界・手動の適正、所持個体・編成・貸出・実・端末は不変');
  assert.deepEqual(tenma(d),[
    `${G1}|架空ツバキ|神化|A|UNVERIFIED||https://example.invalid/${encodeURIComponent(G1)}|2026-09-30`,
    `${T1}|架空ネオ|獣神化改|S|NEEDS_REVIEW|架空：獣神化改≠ハロー|https://example.invalid/${encodeURIComponent(T1)}|2026-09-30`,
    `${T1}|架空ホムラ|獣神化|A|VERIFIED||https://example.invalid/${encodeURIComponent(T1)}|2026-09-30`,
    `${T2}|架空ホムラ|獣神化|S|VERIFIED||https://example.invalid/${encodeURIComponent(T2)}|2026-09-30`,
    `${T2}|架空ラー|真獣神化|A|VERIFIED||https://example.invalid/${encodeURIComponent(T2)}|2026-09-30`]);
  assert.ok(!d.suits.some(s=>s.formId==='f1'&&s.source==='GAMEWITH'),'ネオ is not attached to the owned ハロー form');
  assert.ok(!d.suits.some(s=>s.formId==='f2'&&s.stageKey!==H),'スカアハα is not attached to the owned スカアハ');
  assert.equal(d.suits.find(s=>s.stageKey===T2&&s.formId==='f3').grade,'A','ラー (exact name) uses the existing catalog form');
  assert.deepEqual(issueKeys(d),[`${T1}|架空スカアハα|獣神化`,`${T2}|架空ホムラα|獣神化`]);
  assert.equal(d.units.length,2,'no unit created');
  const added=d.master.characters.filter(c=>!['c1','c2','c3'].includes(c.id));
  assert.deepEqual(added.map(c=>[c.name,c.origin]).sort(),[['架空ツバキ','SUIT_CATALOG'],['架空ホムラ','SUIT_CATALOG']]);
  assert.equal(d.master.forms.find(f=>f.characterId==='c1'&&f.name==='獣神化改').origin,'SUIT_CATALOG');
});

test('4. re-importing the same file creates no duplicates (all 変更なし) and no extra held records', async()=>{
  await seed(SEED());
  await previewBundle(BUNDLE());await click('#imbApply');
  const d1=await stored();
  await previewBundle(BUNDLE());
  assert.match(await res(),/新規追加 0件・更新 0件・変更なし 5件・保留 2件/);
  await click('#imbApply');
  const d2=await stored();
  assert.deepEqual(tenma(d2),tenma(d1));assert.equal(d2.suits.length,d1.suits.length);
  assert.deepEqual(issueKeys(d2),issueKeys(d1));
  assert.deepEqual(d2.master.characters.map(c=>c.id),d1.master.characters.map(c=>c.id));
  assert.deepEqual(PROT(d2),PROT(d1));
});

test('5. one broken stage, a count mismatch, a duplicated stage, or a 1-stage file → nothing is saved', async()=>{
  await seed(SEED());await admin();const noUi=async()=>{const d=await stored();delete d.ui;return d};const d0=await noUi();
  const bad=BLOCKS();bad[2].entries[0].grade='';
  const cases=[
    [BUNDLE({blocks:bad}),/3件目の1行目：evaluationType GRADE なので grade が必要です/],
    [{...BUNDLE(),entryCount:8},/件数がファイルの記載（8）と合いません（実際は7）/],
    [{...BUNDLE(),stageCount:4},/ステージ数がファイルの記載（4）と合いません/],
    [BUNDLE({blocks:[...BLOCKS(),blk(T1,[e('架空ホムラ','獣神化','B')])]}),/4件目：同じステージ・出典のデータが重複しています/],
    [BUNDLE({blocks:[{...BLOCKS()[0],format:undefined},...BLOCKS().slice(1)]}),/1件目：format が monst-suitability-import-v1 ではありません/],
    [BLOCKS()[0],/1ステージ用のデータです/],
    [JSON.stringify(BUNDLE()).slice(0,300),/JSONとして読み取れません（ファイルが途中で切れていないか/],
    [{format:'monst-suitability-bundle-v1',blocks:[]},/blocks（ステージごとのデータ）がありません/]];
  for(const [obj,re] of cases){
    await previewBundle(obj);
    const t=await res();assert.match(t,/取り込めません（何も変更していません）/);assert.match(t,re);
    assert.equal(await page.locator('#imbApply').isDisabled(),true);
    await page.evaluate(()=>document.getElementById('imbApply').click());
  }
  assert.deepEqual(await noUi(),d0,'no data written (only the open screen may be remembered)');
});

test('6. a save failure (storage full) rolls everything back: storage and the in-memory data stay at the pre-import state', async()=>{
  await seed(SEED());
  await previewBundle(BUNDLE());
  const mem0=await snapshot(),raw0=await storedRaw();
  await page.evaluate(()=>{const orig=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===localStorage&&k==='monst-character-manager-trial-v2'){Storage.prototype.setItem=orig;throw new DOMException('full','QuotaExceededError')}return orig.call(this,k,v)}});
  await click('#imbApply');
  assert.match(await msg(),/保存容量が足りないため、取り込めませんでした。取り込み前の状態のままです/);
  assert.equal(await storedRaw(),raw0,'nothing saved');
  const mem=await snapshot();
  for(const k of ['master','suits','importIssues','suitAliases','units','picks','useDevs']) assert.deepEqual(mem[k],mem0[k],k+' rolled back in memory');
  assert.doesNotMatch(await res(),/取り込み結果/);
});

test('7. another tab saved after the preview: the bundle is not written over the newer data', async()=>{
  await seed(SEED());
  await previewBundle(BUNDLE());
  const other=SEED();other.units[0].memo='別のタブで変更';
  const otherRaw=JSON.stringify(other);
  await page.evaluate(({k,v})=>localStorage.setItem(k,v),{k:KEY,v:otherRaw});
  await click('#imbApply');
  assert.match(await msg(),/別のタブでデータが更新されたため、保存を止めました/);
  assert.equal(await storedRaw(),otherRaw,'the newer data from the other tab is kept');
  assert.equal(await page.locator('#staleBar').isVisible(),true);
});

test('8. double tap on 取り込む runs once; changing the data or the text after the preview requires a new preview', async()=>{
  await seed(SEED());
  await previewBundle(BUNDLE());const s0=await sets();
  await page.evaluate(()=>{const b=document.getElementById('imbApply');b.click();b.click();});
  assert.equal(await sets()-s0,1,'one write');
  assert.match(await msg(),/3ステージを取り込みました/);
  await seed(SEED());
  await previewBundle(BUNDLE());
  await page.evaluate(()=>{db.suits.push({id:'x',stageKey:'天魔の孤城::試練の間・第3の間',formId:'f1',source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED',grade:'',rank:null,site:'',sourceUrl:'',sourceUpdatedAt:'',note:''})});
  const s1=await sets();await click('#imbApply');
  assert.match(await msg(),/確認した後にデータが変わりました。もう一度「内容を確認」を押してください/);
  assert.equal(await sets(),s1);
  await previewBundle(BUNDLE());
  await page.evaluate(()=>{const el=document.getElementById('imbText');el.value+=' ';el.dispatchEvent(new Event('input',{bubbles:true}))});
  assert.equal(await page.locator('#imbApply').isDisabled(),true);
});

test('9. a file chosen with ファイルを選ぶ is read and previewed; the catalog option is off by default and unknown characters are then held', async()=>{
  await seed(SEED());await admin();
  assert.equal(await page.locator('#imbCatalogOn').isChecked(),false);
  await page.setInputFiles('#imbFile',{name:'架空_bundle.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(BUNDLE()),'utf8')});
  await page.waitForFunction(()=>/読み込みました/.test(document.getElementById('imbMsg').textContent));
  assert.match(await msg(),/「架空_bundle.json」を読み込みました（\d+KB）。「内容を確認」を押してください/);
  await click('[data-act="imbPreview"]');
  assert.match(await res(),/新規追加 2件・更新 0件・変更なし 0件・保留 5件/,'without the catalog option only existing characters are matched');
  await page.check('#imbCatalogOn');
  assert.match(await res(),/新規追加 5件・更新 0件・変更なし 0件・保留 2件/,'toggling re-checks');
});

test('10. bundle result equals importing the same stages one by one with the 1-stage panel (which still works as before)', async()=>{
  await seed(SEED());
  for(const b of BLOCKS()){
    await admin();await page.fill('#imText',JSON.stringify(b));await click('[data-act="imPreview"]');await page.check('#imCatalogOn');
    assert.match(await txt(page.locator('#imResult')),/GameWith・ランク・\d行/);
    await click('#imApply');assert.match(await txt(page.locator('#imMsg')),/取り込みました/);
  }
  const seq=await stored();
  await seed(SEED());await previewBundle(BUNDLE());await click('#imbApply');
  const bun=await stored();
  assert.deepEqual(tenma(bun),tenma(seq),'same suits');
  assert.deepEqual(issueKeys(bun),issueKeys(seq),'same held rows');
  assert.deepEqual(bun.master.characters.map(c=>c.name).sort(),seq.master.characters.map(c=>c.name).sort());
});

test('11. backup → restore after a bundle import reproduces suits, catalog, held rows, units and team; the backup format is unchanged', async()=>{
  await seed(SEED());const bk0=JSON.parse(await page.evaluate(()=>backupJson()));
  await previewBundle(BUNDLE());await click('#imbApply');
  const d=await stored();
  const bk=await page.evaluate(()=>backupJson());
  const obj=JSON.parse(bk);
  assert.deepEqual(Object.keys(obj).sort(),Object.keys(bk0).sort(),'same backup envelope');assert.equal(obj.version,bk0.version);
  assert.deepEqual(Object.keys(obj.data).sort(),Object.keys(bk0.data).sort(),'no new fields in the backup data');
  await seed({characters:[]});await admin();
  await page.evaluate(t=>{document.getElementById('bkText').value=t},bk);await click('[data-act="restore"]');
  const r=await stored();
  for(const k of ['suits','units','picks','useDevs','importIssues']) assert.deepEqual(r[k],d[k],k);
  assert.deepEqual(r.master,d.master);
});
