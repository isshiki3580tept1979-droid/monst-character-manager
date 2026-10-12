// v34：適正データの更新（更新元から受け取り → 整合性・形式・件数の検証 → 内容確認とバックアップ確認のあと「更新する」で保存）。
// 更新元は架空（別ポート＝別オリジンのページ）。架空データだけを使う。実際の更新元（Apps Script）・Googleドライブには接続しない。
const {test,before,after,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {chromium}=require('playwright');
const source=path.resolve(process.env.TRIAL_HTML_SOURCE||path.join(__dirname,'..','monst_character_manager_trial.html'));
const KEY='monst-character-manager-trial-v2';
const protectedKeys=['monst-character-manager-v2','monst-character-manager-v1','monst-character-manager-device-names-v1','monst-character-manager-trial-v1'];
let browser,server,url,upServer,upUrl,context,page,errors,external,payloads;
// 架空の更新元：/u/<case> を開くと、決めておいた内容を opener に postMessage する（実際の更新元と同じ送り方）
before(async()=>{
  server=http.createServer((req,res)=>{if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(source));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}`;
  upServer=http.createServer((req,res)=>{
    const u=new URL(req.url,'http://x');const c=u.pathname.replace(/^\/u\//,'');
    if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return}
    const p=payloads[c]||{status:'error',message:'架空：不明なケース'};
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(`<!doctype html><meta charset="utf-8"><body>架空の更新元<script>
      const nonce=new URLSearchParams(location.search).get('nonce');
      const p=${JSON.stringify(p).replace(/</g,'\\u003c')};
      const msg=Object.assign({type:'msu-update',nonce:p.nonce===undefined?nonce:p.nonce},p);delete msg.target;
      window.opener.postMessage(msg,p.target||${JSON.stringify(url)});document.body.append(' 送りました');
    </script>`);
  });
  await new Promise(resolve=>upServer.listen(0,'127.0.0.1',resolve));
  upUrl=`http://127.0.0.1:${upServer.address().port}`;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));await new Promise(r=>upServer?.close(r));});
beforeEach(async()=>{
  context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});external=[];payloads={};
  await context.route('**/*',r=>{const u=r.request().url();if(u.startsWith(url)||u.startsWith(upUrl))return r.continue();external.push(u);return r.abort()});
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
  assert.deepEqual(external.filter(u=>!/^data:|^blob:/.test(u)),[],'no request leaves the test (no Google / no Drive)');
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
const noUi=async()=>{const d=await stored();delete d.ui;return d};
const txt=async l=>(await l.textContent()).replace(/\s+/g,' ').trim();
const plain=o=>JSON.parse(JSON.stringify(o));

const T1='天魔の孤城::試練の間・第1の間', T2='天魔の孤城::試練の間・第2の間', T4='天魔の孤城::試練の間・第4の間', G1='天魔の孤城::空中庭園・第1の園', H='破界の星墓::ティル・ナ・ノーグ';
const FR=[{name:'速必殺の力',grade:'特級EL',kind:''},{name:'兵命削りの力',grade:'特級EL',kind:''},{name:'将命削りの力',grade:'特級EL',kind:''},{name:'熱き友撃の力',grade:'特級EL',kind:''}];
const fm=(id,characterId,name,extra={})=>({id,characterId,name,short:'',race:'',battleType:'',shotType:'',...(name?{}:{unknownForm:true}),...extra});
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
const blk=(stageKey,entries)=>({format:'monst-suitability-import-v1',stageKey,source:'GAMEWITH',sourceUrl:'https://example.invalid/'+encodeURIComponent(stageKey),sourceUpdatedAt:'2026-09-30',evaluationType:'GRADE',entries});
const e=(characterName,formName,grade,verificationStatus='VERIFIED',note='')=>({characterName,formName,grade,verificationStatus,note});
const BLOCKS=()=>[
  blk(T1,[e('架空ネオ','獣神化改','S','NEEDS_REVIEW','架空：獣神化改≠ハロー'),e('架空スカアハα','獣神化','S'),e('架空ホムラ','獣神化','A')]),
  blk(T2,[e('架空ラー','真獣神化','A'),e('架空ホムラ','獣神化','S'),e('架空ホムラα','獣神化','A')]),
  blk(G1,[e('架空ツバキ','神化','A','UNVERIFIED')])];
const BUNDLE=(x={})=>{const blocks=x.blocks||BLOCKS();return {format:'monst-suitability-bundle-v1',title:'架空 更新データ',stageCount:blocks.length,entryCount:blocks.reduce((a,b)=>a+b.entries.length,0),blocks,...x}};
const sha=t=>crypto.createHash('sha256').update(t,'utf8').digest('hex');
// 更新元が送る内容（実際の更新元と同じ形）
const OK=(obj=BUNDLE(),x={})=>{const text=typeof obj==='string'?obj:JSON.stringify(obj,null,1);const j=(()=>{try{return JSON.parse(text)}catch{return {}}})();
  return {status:'ok',file:{name:'架空_bundle.json',modifiedTime:'2026-10-12T09:00:00Z',size:Buffer.byteLength(text),sha256:sha(text),stageCount:j.stageCount,entryCount:j.entryCount,...(x.file||{})},text:x.text??text}};
const PROT=d=>plain({units:d.units,picks:d.picks,useDevs:d.useDevs,deviceNames:d.deviceNames,ownershipChecks:d.ownershipChecks,
  chars:d.master.characters.filter(c=>['c1','c2','c3'].includes(c.id)),forms:d.master.forms.filter(f=>['f1','f2','f3'].includes(f.id)),
  keep:d.suits.filter(s=>['s4','sh','sm'].includes(s.id))});
async function admin(){await click('[data-act="view"][data-view="admin"]')}
async function setSource(){await page.evaluate(({u,o})=>{SUIT_UPDATE.url=u;SUIT_UPDATE.origin=new RegExp('^'+o.replace(/[.]/g,'\\.')+'$');updInit();$('updMsg').textContent=''},{u:upUrl+'/u/main',o:upUrl})}
// 「更新を確認」→ 更新元のタブが開き、送ってくる → このタブで受け取る
async function check(payload,{wait=true}={}){
  payloads.main=payload;
  await admin();await setSource();
  const popup=context.waitForEvent('page');
  await click('#updCheck');
  const w=await popup;await w.waitForLoadState();
  if(wait) await page.waitForFunction(()=>!updWait);
  await page.waitForTimeout(50);
  await w.close();
}
const msg=()=>txt(page.locator('#updMsg'));
const head=()=>txt(page.locator('#updHead'));
async function confirmAndBackup(){
  await click('#updShow');
  const dl=page.waitForEvent('download');
  await click('#updBackup');
  const d=await dl;const p=await d.path();
  await page.check('#updBkOk');
  return {name:d.suggestedFilename(),text:fs.readFileSync(p,'utf8')};
}

test('1. without an update source the panel only says it is not set up; nothing opens or changes; the manual imports stay', async()=>{
  await seed(SEED());await admin();const d0=await noUi();
  // 公開版では更新元のURLが設定されるため、ここでは明示的に未設定にしてから確かめる
  await page.evaluate(()=>{SUIT_UPDATE.url='';updInit()});
  assert.match(await txt(page.locator('#updPanel .ptitle')),/適正データの更新/);
  assert.equal(await page.locator('#updCheck').isDisabled(),true);
  assert.match(await msg(),/更新元はまだ設定されていません（準備中）/);
  assert.equal(await page.locator('#imbPanel').count(),1,'bundle import still there');
  assert.match(await txt(page.locator('.panel .ptitle',{hasText:'1ステージずつ'})),/1ステージずつ/);
  assert.deepEqual(await noUi(),d0);
});

test('2. a new update: notice with stage/entry counts; nothing saved until 内容を確認 + backup + check + 更新する; then one save with existing data protected', async()=>{
  await seed(SEED());await admin();const d0=await noUi(),mem0=await snapshot();
  await check(OK());
  assert.match(await head(),/新しい適正データがあります ?対象：3ステージ／7件 追加 5件・更新 0件・保留 2件/);
  assert.match(await head(),/架空_bundle.json（2026-10-12T09:00:00Z）・整合性を確認済み。まだ保存していません/);
  assert.equal(await page.locator('#updApply').isDisabled(),true,'not before 内容を確認');
  assert.deepEqual(await noUi(),d0,'receiving saves nothing');
  await click('#updShow');
  assert.match(await txt(page.locator('#updDetail')),/登録済みのキャラに付く（自動照合 2キャラ）.*取り込み対象外：保留（2件/);
  assert.equal(await page.locator('#updApply').isDisabled(),true,'not before the backup');
  assert.equal(await page.locator('#updBkOk').isDisabled(),true,'the check box needs a backup first');
  const dl=page.waitForEvent('download');await click('#updBackup');const d=await dl;
  assert.match(d.suggestedFilename(),/^monst_trial_backup_\d{8}\.json$/);
  const bk=JSON.parse(fs.readFileSync(await d.path(),'utf8'));
  assert.deepEqual(plain(bk.data.suits),plain(mem0.suits),'the backup is the pre-update state');
  assert.equal(await page.locator('#updApply').isDisabled(),true,'not before confirming the file was saved');
  await page.check('#updBkOk');
  assert.equal(await page.locator('#updApply').isDisabled(),false);
  assert.deepEqual(await noUi(),d0,'still nothing saved');
  const s0=await sets();await click('#updApply');
  assert.equal(await sets()-s0,1,'one write');
  assert.match(await msg(),/適正データを更新しました（3ステージ：追加5件・更新0件・保留2件）。保存を確認しました。/);
  assert.match(await txt(page.locator('#updResult')),/取り込み結果/);
  assert.equal(await page.locator('#updBox').isHidden(),true);
  const a=await stored();
  assert.deepEqual(PROT(a),PROT(mem0),'第4の間・破界・手動の適正・所持個体・編成・貸出・実・端末は不変');
  assert.equal(a.units.length,2);
  assert.ok(!a.suits.some(s=>s.formId==='f1'&&s.source==='GAMEWITH'),'ネオ is not attached to the owned form');
  const neo=a.suits.find(s=>s.stageKey===T1&&a.master.forms.find(f=>f.id===s.formId)?.name==='獣神化改');
  assert.equal(neo.verificationStatus,'NEEDS_REVIEW');
  assert.deepEqual(a.importIssues.map(i=>i.characterName).sort(),['架空スカアハα','架空ホムラα']);
});

test('3. the same update again (or a repeated tap) changes nothing: 新しい適正データはありません, no write, no duplicates', async()=>{
  await seed(SEED());
  await check(OK());await confirmAndBackup();
  await page.evaluate(()=>{const b=document.getElementById('updApply');b.click();b.click();});
  const d1=await noUi();
  await check(OK());
  assert.match(await msg(),/新しい適正データはありません（「架空_bundle.json」は登録済みと同じ内容です。保留2件は要確認の一覧にあります）。何も変更していません/);
  assert.equal(await page.locator('#updBox').isHidden(),true);
  const d2=await noUi();assert.deepEqual(d2,d1,'no data written');
  assert.equal(new Set(d2.suits.map(s=>[s.stageKey,s.formId,s.source].join('|'))).size,d2.suits.length,'no duplicates');
});

test('4. communication failures: an error from the source, a blocked window, an expired request → message only, nothing changes', async()=>{
  await seed(SEED());await admin();const d0=await noUi();
  await check({status:'error',message:'架空：ファイルが見つかりません'});
  assert.match(await msg(),/更新元からデータを受け取れませんでした：架空：ファイルが見つかりません（何も変更していません）/);
  await setSource();
  await page.evaluate(()=>{window.__open=window.open;window.open=()=>null});
  await click('#updCheck');
  assert.match(await msg(),/更新元を開けませんでした（ポップアップがブロックされた可能性があります）/);
  await page.evaluate(()=>{window.open=window.__open});
  payloads.main=OK();
  await context.route(upUrl+'/u/main*',r=>new Promise(res=>setTimeout(()=>res(r.continue()),500)));
  const popup=context.waitForEvent('page');await click('#updCheck');
  await page.evaluate(()=>{updWait.at-=2*60*60*1000});
  const w=await popup;await w.waitForLoadState();await page.waitForFunction(()=>!updWait);await w.close();
  assert.match(await msg(),/時間が経ちすぎたため使いませんでした/);
  assert.equal(await page.locator('#updBox').isHidden(),true);
  assert.deepEqual(await noUi(),d0);
});

test('5. incomplete or broken data is never saved: cut in transfer (hash mismatch), broken JSON, wrong counts, a broken stage, the wrong format', async()=>{
  await seed(SEED());await admin();const d0=await noUi();
  const full=JSON.stringify(BUNDLE(),null,1);
  const cases=[
    [OK(BUNDLE(),{text:full.slice(0,full.length-40)}),/途中で欠けているか、更新元の記録と一致しません/],
    [OK(full.slice(0,500)),/内容に誤りがあるため、更新しません/],
    [OK({...BUNDLE(),entryCount:8}),/内容に誤りがあるため、更新しません/],
    [OK(BUNDLE(),{file:{entryCount:157}}),/件数が更新元の記録と合いません（更新元：3ステージ／157件、実際：3ステージ／7件）/],
    [OK(BUNDLE({blocks:[...BLOCKS().slice(0,2),blk(G1,[e('架空ツバキ','神化','')])]})),/内容に誤りがあるため、更新しません/],
    [OK(BLOCKS()[0]),/内容に誤りがあるため、更新しません/],
    [{status:'ok',file:{name:'x',sha256:sha('')},text:''},/受け取ったデータが空でした/]];
  for(const [p,re] of cases){
    await check(p);
    assert.match(await msg(),re);
    assert.equal(await page.locator('#updBox').isHidden(),true);
    if(/内容に誤り/.test(re.source)) assert.match(await txt(page.locator('#updResult')),/取り込めません（何も変更していません）/);
  }
  assert.deepEqual(await noUi(),d0);
});

test('6. only the update source with the right one-time nonce is accepted (other origins, wrong or reused nonces are ignored)', async()=>{
  await seed(SEED());await admin();const d0=await noUi();
  await check({...OK(),nonce:'架空の別の合言葉'},{wait:false});
  assert.equal(await page.evaluate(()=>!!updWait),true,'still waiting; the message was ignored');
  assert.equal(await page.locator('#updBox').isHidden(),true);
  // 別のオリジン（このアプリ自身）から送られたものは受け取らない
  const n=await page.evaluate(()=>updWait.nonce);
  await page.evaluate(([n,t])=>window.postMessage({type:'msu-update',nonce:n,status:'ok',file:{name:'x',sha256:'0'.repeat(64)},text:t},'*'),[n,JSON.stringify(BUNDLE())]);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>!!updWait),true);assert.equal(await page.locator('#updBox').isHidden(),true);
  // 正しい合言葉は1回だけ
  await check(OK());assert.match(await head(),/新しい適正データがあります/);
  assert.deepEqual(await noUi(),d0);
});

test('7. save failure (storage full) keeps the original data; the result is not shown as done', async()=>{
  await seed(SEED());await check(OK());await confirmAndBackup();
  const mem0=await snapshot(),raw0=await storedRaw();
  await page.evaluate(()=>{const orig=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(this===localStorage&&k==='monst-character-manager-trial-v2'){Storage.prototype.setItem=orig;throw new DOMException('full','QuotaExceededError')}return orig.call(this,k,v)}});
  await click('#updApply');
  assert.match(await msg(),/保存容量が足りないため、更新できませんでした。更新前の状態のままです（何も変更していません）/);
  assert.equal(await storedRaw(),raw0);
  const mem=await snapshot();for(const k of ['master','suits','importIssues','suitAliases','units','picks','useDevs']) assert.deepEqual(mem[k],mem0[k],k);
  assert.equal(await txt(page.locator('#updResult')),'');
});

test('8. backup guard: data changed after the backup (or after the check) → 更新する is refused; another tab saved → nothing is overwritten', async()=>{
  await seed(SEED());await check(OK());await confirmAndBackup();
  await page.evaluate(()=>{db.suits.push({id:'x',stageKey:'天魔の孤城::試練の間・第3の間',formId:'f1',source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED',grade:'',rank:null,site:'',sourceUrl:'',sourceUpdatedAt:'',note:''});updGate()});
  assert.equal(await page.locator('#updApply').isDisabled(),true,'the backup no longer matches the data');
  const s0=await sets();
  await page.evaluate(()=>applyUpdate());
  assert.match(await msg(),/もう一度「更新を確認」を押してください（何も変更していません）/);
  assert.equal(await sets(),s0);
  await seed(SEED());await check(OK());await confirmAndBackup();
  const other=SEED();other.units[0].memo='別のタブで変更';const otherRaw=JSON.stringify(other);
  await page.evaluate(({k,v})=>localStorage.setItem(k,v),{k:KEY,v:otherRaw});
  await click('#updApply');
  assert.match(await msg(),/別のタブでデータが更新されたため、保存を止めました/);
  assert.equal(await storedRaw(),otherRaw,'the other tab’s newer data is kept');
});

test('9. the backup taken before the update restores the pre-update state; the backup format is unchanged', async()=>{
  await seed(SEED());const bk0=JSON.parse(await page.evaluate(()=>backupJson()));
  await check(OK());const b=await confirmAndBackup();await click('#updApply');
  const after=await stored();assert.ok(after.suits.length>3);
  const bk=JSON.parse(b.text);
  assert.deepEqual(Object.keys(bk).sort(),Object.keys(bk0).sort());assert.deepEqual(Object.keys(bk.data).sort(),Object.keys(bk0.data).sort());
  await admin();await page.evaluate(t=>{document.getElementById('bkText').value=t},b.text);await click('[data-act="restore"]');
  const r=await stored();
  assert.deepEqual(r.suits,bk.data.suits);assert.deepEqual(r.units,bk.data.units);assert.deepEqual(r.master,bk.data.master);
  assert.equal(r.suits.length,3,'back to the 3 suits before the update');
});

test('10. 390px: the update notice, details and buttons fit without horizontal scrolling and are tappable', async()=>{
  await seed(SEED());await check(OK());await click('#updShow');
  const w=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,win:innerWidth,
    boxes:['#updCheck','#updShow','#updBackup','#updApply','#updDetail'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,r.left,r.right,r.height]})}));
  assert.ok(w.doc<=w.win,`no horizontal scroll (${w.doc}>${w.win})`);
  for(const [s,l,r,h] of w.boxes){assert.ok(l>=0&&r<=390,`${s} inside 390px`);if(s!=='#updDetail')assert.ok(h>=28,`${s} tappable`)}
});

test('11. an older file is refused (it would overwrite a newer registered grade); the one-time nonce is 128-bit random', async()=>{
  const sd=SEED();sd.suits.push({id:'s2',stageKey:T2,formId:'f3',source:'GAMEWITH',sourceUrl:'https://example.invalid/2',sourceUpdatedAt:'2026-10-05',evaluationType:'GRADE',grade:'S',verificationStatus:'VERIFIED',note:'架空 新しい評価'});
  await seed(sd);await admin();const d0=await noUi();
  payloads.main=OK();await setSource();
  await context.route(upUrl+'/u/main*',r=>new Promise(res=>setTimeout(()=>res(r.continue()),500)));
  const popup=context.waitForEvent('page');await click('#updCheck');
  const n=await page.evaluate(()=>updWait.nonce);
  assert.match(n,/^[0-9a-f]{32}$/);
  const w=await popup;assert.equal(new URL(w.url()).searchParams.get('nonce'),n);
  await w.waitForLoadState();await page.waitForFunction(()=>!updWait);await w.close();
  assert.match(await msg(),/登録済みより古い出典日の行が1件あります（天魔 試練の間・第2の間（登録済み 2026-10-05／受け取り 2026-09-30））。古いファイルの可能性があるため更新しません（何も変更していません）/);
  assert.equal(await page.locator('#updBox').isHidden(),true);
  assert.deepEqual(await noUi(),d0);
});

test('12. a message with the right origin and nonce but from a window this tab did not open is ignored (source check)', async()=>{
  await seed(SEED());await admin();const d0=await noUi();
  payloads.main=OK();await setSource();
  // 同じ送り元の、このタブが開いた更新元ではない窓
  const op=context.waitForEvent('page');await page.evaluate(u=>{window.open(u,'_blank')},upUrl+'/x/other');const other=await op;await other.waitForLoadState();
  // 更新元の読み込みを遅らせ、その間に別の窓から正しい合言葉で送らせる
  await context.route(upUrl+'/u/main*',r=>new Promise(res=>setTimeout(()=>res(r.continue()),800)));
  const pop=context.waitForEvent('page');await click('#updCheck');
  const nonce=await page.evaluate(()=>updWait.nonce);
  await other.evaluate(([n,t,app])=>window.opener.postMessage({type:'msu-update',nonce:n,status:'error',message:'偽物',text:t},app),[nonce,'{}',url]);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>!!updWait),true,'the message from the other window was ignored');
  assert.doesNotMatch(await msg(),/偽物/);
  const w=await pop;await w.waitForLoadState();await page.waitForFunction(()=>!updWait);
  assert.match(await head(),/新しい適正データがあります/,'the real updater window is accepted');
  await w.close();await other.close();
  assert.deepEqual(await noUi(),d0);
});

const state=()=>page.evaluate(()=>[document.getElementById('updState').dataset.state,document.getElementById('updState').textContent]);
test('13. status display follows the real state: 未設定 → 設定済み (no stale 準備中 text after the URL is set) → 取得中 → 更新あり → 更新済み → 更新なし; errors show 取得エラー', async()=>{
  await seed(SEED());await admin();
  await page.evaluate(()=>{SUIT_UPDATE.url='';updInit()});
  assert.deepEqual(await state(),['unset','状態：未設定（準備中）']);
  assert.match(await msg(),/更新元はまだ設定されていません/);
  // ローカル検証サーバーと同じ順番：起動後に URL を設定して updInit() を呼ぶ
  await page.evaluate(({u,o})=>{SUIT_UPDATE.url=u;SUIT_UPDATE.origin=new RegExp('^'+o.replace(/[.]/g,'\.')+'$');updInit()},{u:upUrl+'/u/main',o:upUrl});
  assert.deepEqual(await state(),['ready','状態：更新元を設定済み（「更新を確認」で確かめます）']);
  assert.equal(await msg(),'','the 準備中 message is gone once the URL is set');
  payloads.main=OK();
  await context.route(upUrl+'/u/main*',r=>new Promise(res=>setTimeout(()=>res(r.continue()),500)));
  const pop=context.waitForEvent('page');await click('#updCheck');
  assert.deepEqual((await state())[0],'waiting');assert.match((await state())[1],/取得中/);
  const w=await pop;await w.waitForLoadState();await page.waitForFunction(()=>!updWait);await w.close();
  assert.deepEqual(await state(),['available','状態：更新あり（まだ保存していません）']);
  await confirmAndBackup();await click('#updApply');
  assert.deepEqual(await state(),['done','状態：更新済み']);
  await context.unroute(upUrl+'/u/main*');
  await check(OK());
  assert.deepEqual(await state(),['none','状態：更新なし']);
  await check({status:'error',message:'架空：エラー'});
  assert.deepEqual(await state(),['error','状態：取得エラー（何も変更していません）']);
  await page.evaluate(()=>{window.__open=window.open;window.open=()=>null});await click('#updCheck');
  assert.equal((await state())[0],'error');assert.match(await msg(),/ポップアップがブロック/);
  await page.evaluate(()=>{window.open=window.__open});
});

test('14. security matrix: forged messages (other origin, other window, bad / wrong nonce) are ignored and the request keeps waiting; expired, tampered JSON and count mismatch are refused; nothing is saved in any case', async()=>{
  await seed(SEED());await admin();const d0=await noUi();
  payloads.main=OK();await setSource();
  const op=context.waitForEvent('page');await page.evaluate(u=>{window.open(u,'_blank')},upUrl+'/x/other');const other=await op;await other.waitForLoadState();
  await context.route(upUrl+'/u/main*',r=>new Promise(res=>setTimeout(()=>res(r.continue()),1500)));
  const pop=context.waitForEvent('page');await click('#updCheck');
  const nonce=await page.evaluate(()=>updWait.nonce);
  const good={type:'msu-update',status:'ok',...OK()};
  // a) 送り元のオリジンが違う（このアプリ自身から）
  await page.evaluate(m=>window.postMessage(m,'*'),{...good,nonce});
  // b) 同じ送り元オリジンだが、このタブが開いた更新元ではない窓から
  await other.evaluate(([m,app])=>window.opener.postMessage(m,app),[{...good,nonce},url]);
  // c) 不正な合言葉（形が違う／値が違う）
  await other.evaluate(([m,app])=>window.opener.postMessage(m,app),[{...good,nonce:nonce.toUpperCase()},url]);
  await other.evaluate(([m,app])=>window.opener.postMessage(m,app),[{...good,nonce:'0'.repeat(32)},url]);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>!!updWait),true,'all forged messages were ignored');
  assert.equal((await state())[0],'waiting');assert.equal(await page.locator('#updBox').isHidden(),true);
  const w=await pop;await w.waitForLoadState();await page.waitForFunction(()=>!updWait);await w.close();await other.close();
  assert.equal((await state())[0],'available','the genuine message is still accepted afterwards');
  await context.unroute(upUrl+'/u/main*');
  // d) 期限切れの合言葉
  payloads.main=OK();
  await context.route(upUrl+'/u/main*',r=>new Promise(res=>setTimeout(()=>res(r.continue()),500)));
  const p2=context.waitForEvent('page');await click('#updCheck');await page.evaluate(()=>{updWait.at-=2*60*60*1000});
  const w2=await p2;await w2.waitForLoadState();await page.waitForFunction(()=>!updWait);await w2.close();
  assert.equal((await state())[0],'error');assert.match(await msg(),/時間が経ちすぎた/);
  await context.unroute(upUrl+'/u/main*');
  // e) 改ざんされたJSON（SHA-256 が更新元の記録と合わない）
  const t=JSON.stringify(BUNDLE(),null,1);
  await check({...OK(),text:t.replace('"grade": "A"','"grade": "S"')});
  assert.equal((await state())[0],'error');assert.match(await msg(),/更新元の記録と一致しません/);
  // f) 件数の不一致（更新元の記録／ファイル内の記載）
  await check(OK(BUNDLE(),{file:{stageCount:19,entryCount:157}}));
  assert.equal((await state())[0],'error');assert.match(await msg(),/件数が更新元の記録と合いません/);
  await check(OK({...BUNDLE(),entryCount:6}));
  assert.equal((await state())[0],'error');assert.match(await msg(),/内容に誤りがあるため、更新しません/);
  assert.deepEqual(await noUi(),d0,'nothing saved in any case');
});
