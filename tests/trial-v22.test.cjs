// Round 22: v22 STEP1 名前照合の改善。区切り記号（・｜／：空白・括弧）の前の名前が一致するキャラを「対応付け候補」として上位に示し、
// ステージ画面の仮選択から直接「同じキャラとして対応付ける／別のキャラ」を選べるようにする。自動照合のルールは変えない（候補のみ）。
// 除外したペアは、別のキャラを経由した自動照合でも復活させない。同一キャラと同一進化形態は区別する。架空データだけを使う。Same harness as trial-v10.test.cjs.
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
const K='破界の星墓::ラルガメンテ', K2='破界の星墓::ニギミタマ';
const F=(id,cid,name,x={})=>({id,characterId:cid,name,short:'',race:'',battleType:'',shotType:'',...x});
const U=(id,formId,device,no,x={})=>({id,formId,device,no,fruits:[],memo:'',...x});
const FRUITS=[{name:'熱き友撃の力',grade:'特級EL',kind:''},{name:'同族の絆・加命撃',grade:'特級L',kind:''},{name:'同族の絆・加撃',grade:'特級L',kind:''}];
// 適正図鑑：架空ミライ（架空ピースフル S）、架空ミライ｜架空ピースフル（別出典で形態込みの名前・A、ニギミタマ）、架空ジャヒーα（A）、架空エクス（B）、架空 エクス（空白違い・A、ニギミタマ）
// 所持：架空ミライ・架空ピースフルAI（形態未確認・図鑑No.99069・実3つ）、架空ジャヒー（αなし＝別キャラの可能性）、架空エクス（架空エクス[cX] とは除外済み）
const BASE={characters:[],deviceNames:{'メイン':'架空メイン名','サブ1':'架空タブレット'},
  master:{characters:[{id:'cM',name:'架空ミライ',origin:'SUIT_CATALOG'},{id:'cMb',name:'架空ミライ｜架空ピースフル',origin:'SUIT_CATALOG'},{id:'cJ',name:'架空ジャヒーα',origin:'SUIT_CATALOG'},
      {id:'cX',name:'架空エクス',origin:'SUIT_CATALOG'},{id:'cX2',name:'架空 エクス',origin:'SUIT_CATALOG'},
      {id:'cO',name:'架空ミライ・架空ピースフルAI'},{id:'cJo',name:'架空ジャヒー'},{id:'cXo',name:'架空エクス'}],
    forms:[F('fMs','cM','架空ピースフル',{origin:'SUIT_CATALOG'}),F('fMb','cMb','獣神化',{origin:'SUIT_CATALOG'}),F('fJs','cJ','獣神化',{origin:'SUIT_CATALOG'}),
      F('fXs','cX','獣神化',{origin:'SUIT_CATALOG'}),F('fX2','cX2','獣神化',{origin:'SUIT_CATALOG'}),
      F('fOu','cO','',{unknownForm:true,monsterNo:'99069',race:'亜人',battleType:'バランス型',shotType:'貫通'}),F('fJu','cJo','',{unknownForm:true}),F('fXu','cXo','',{unknownForm:true})]},
  units:[U('uO1','fOu','メイン',1,{fruits:FRUITS,verificationStatus:'NEEDS_REVIEW',importSource:'monst-screenshot-reading-v1'}),U('uJ','fJu','メイン',1),U('uX','fXu','サブ1',1)],
  suits:[{id:'s1',stageKey:K,formId:'fMs',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'VERIFIED'},
    {id:'s2',stageKey:K2,formId:'fMb',source:'ALTEMA',evaluationType:'GRADE',grade:'A',verificationStatus:'VERIFIED'},
    {id:'s3',stageKey:K,formId:'fJs',source:'GAMEWITH',evaluationType:'GRADE',grade:'A',verificationStatus:'VERIFIED'},
    {id:'s4',stageKey:K,formId:'fXs',source:'GAMEWITH',evaluationType:'GRADE',grade:'B',verificationStatus:'VERIFIED'},
    {id:'s5',stageKey:K2,formId:'fX2',source:'GAMEWITH',evaluationType:'GRADE',grade:'A',verificationStatus:'VERIFIED'}],
  idLinks:[{id:'lx',kind:'char',a:'cX',b:'cXo',basis:'USER_EXCLUDED',at:'2026-10-11T00:00:00.000Z'}],
  picks:{[K]:{'メイン':'uO1'}},useDevs:{[K]:['メイン','サブ1','サブ2','サブ3'],[K2]:['メイン','サブ1','サブ2','サブ3'],'破界の星墓::コキュートス':['メイン','サブ1','サブ2','サブ3']},
  ui:{view:'stage',quest:'破界の星墓',stage:{'破界の星墓':'ラルガメンテ'}}};
const row=id=>page.locator(`#suitPanel .sRow:has([data-act="suitEdit"][data-id="${id}"])`);
const picks=dev=>page.evaluate(d=>{const s=document.querySelector(`.pickSel[data-pick-dev="${d}"]`);return {cand:[...s.querySelectorAll(':scope > option')].slice(1).map(o=>o.textContent),
  groups:[...s.querySelectorAll('optgroup')].map(g=>[g.label,[...g.children].map(o=>o.textContent)]),sel:s.value}},dev);
const sug=dev=>page.locator(`.pickDev[data-dev="${dev}"] .pickSuggest`);
const group=id=>page.evaluate(id=>[...charGroupOf(id)].sort(),id);
const keepData=async()=>{const d=await stored();
  assert.deepEqual(d.master.characters.map(c=>c.id+':'+c.name),BASE.master.characters.map(c=>c.id+':'+c.name),'no merge, no rename');
  assert.deepEqual(d.master.forms.map(f=>[f.id,f.characterId,f.name,f.unknownForm||false,f.monsterNo||'']),BASE.master.forms.map(f=>[f.id,f.characterId,f.name,f.unknownForm||false,f.monsterNo||'']),'forms untouched');
  assert.deepEqual(d.units.map(u=>[u.id,u.formId,u.device,u.no,u.verificationStatus||'',JSON.stringify(u.fruits)]),BASE.units.map(u=>[u.id,u.formId,u.device,u.no,u.verificationStatus||'',JSON.stringify(u.fruits)]),'units and fruits untouched');
  assert.deepEqual(d.suits.map(x=>[x.id,x.stageKey,x.formId,x.grade,x.verificationStatus]),BASE.suits.map(x=>[x.id,x.stageKey,x.formId,x.grade,x.verificationStatus]),'suitability untouched');
  assert.deepEqual(d.picks,BASE.picks,'picks untouched');
  return d;};

test('区切り（・｜）の前の名前が一致: shown as a strong candidate (not 名前の一部), but never matched automatically', async()=>{
  await seed(BASE);
  const c=await page.evaluate(()=>charCandidates('架空ミライ・架空ピースフルAI','99069').map(x=>x.c.id+':'+x.why));
  assert.deepEqual(c.slice(0,3),['cO:同じ名前','cM:区切りの前の名前が一致','cMb:区切りの前の名前が一致'],c.join('|'));
  const c2=await page.evaluate(()=>charCandidates('架空ミライ｜架空ピースフル','').map(x=>x.c.id+':'+x.why));
  assert.ok(c2.includes('cM:区切りの前の名前が一致')&&c2.includes('cO:区切りの前の名前が一致'),c2.join('|'));
  assert.deepEqual(await group('cO'),['cO'],'no automatic match by the part before a separator');
  assert.deepEqual(await group('cJo'),['cJo'],'α suffix is still a different character');
  // 登録画面（名前入力）でも同じ理由で出る
  await page.evaluate(()=>openQuickReg());await page.fill('#qrCharName','架空ミライ｜架空ピースフル');
  assert.match(await txt(page.locator('#qrCands')),/架空ミライ 区切りの前の名前が一致/);
  await page.evaluate(()=>closeModals());
  // 適正一覧の所持キャラ候補でも同じ理由
  assert.match(await txt(row('s1')),/所持キャラの候補：架空ミライ・架空ピースフルAI（区切りの前の名前が一致/);
  await keepData();
});

test('stage picker suggests linking the provisional unit to the suitability character (strong matches only); linking makes it a normal candidate, form unconfirmed', async()=>{
  await seed(BASE);
  const s=sug('メイン');
  assert.equal(await s.count(),1,'only the strong match (架空ミライ), not 架空ジャヒー↔架空ジャヒーα');
  assert.match(await txt(s),/「架空ミライ・架空ピースフルAI」は適正の「架空ミライ」と同じキャラかもしれません（区切りの前の名前が一致）/);
  await s.locator('[data-act="linkChar"]').click();
  const d=await keepData();
  assert.deepEqual(d.idLinks.filter(l=>l.basis==='USER_SELECTED').map(l=>[l.kind,l.a,l.b]),[['char','cM','cO']]);
  assert.equal(d.idLinks.filter(l=>l.kind==='form').length,0,'same character only — no form confirmation');
  const p=await picks('メイン');
  assert.ok(p.cand.some(t=>/架空ミライ・架空ピースフルAI.*（形態未確認）/.test(t)),p.cand.join('|'));
  assert.equal(p.sel,'uO1');
  assert.equal(await sug('メイン').count(),0);
  assert.equal(await page.evaluate(()=>formStatus('fMs','メイン')),'unconfirmed','form stays unconfirmed');
  assert.equal(d.master.forms.find(f=>f.id==='fOu').unknownForm,true);
});

test('「別のキャラ」 from the suggestion records an exclusion; it is not suggested again, not listed as a candidate, and can be undone', async()=>{
  await seed(BASE);
  await sug('メイン').locator('[data-act="excludeChar"]').click();
  let d=await keepData();
  assert.ok(d.idLinks.some(l=>l.kind==='char'&&l.basis==='USER_EXCLUDED'&&[l.a,l.b].includes('cM')&&[l.a,l.b].includes('cO')));
  assert.equal(await sug('メイン').count(),0);
  const r=await txt(row('s1'));
  assert.doesNotMatch(r,/所持キャラの候補：架空ミライ・架空ピースフルAI/,'an excluded pair is not offered again');
  assert.match(r,/除外中（同じキャラではない）：架空ミライ・架空ピースフルAI/);
  assert.ok((await picks('メイン')).groups.length,'still a provisional pick');
  await row('s1').locator('[data-act="unexcludeChar"]').click();
  assert.equal(await sug('メイン').count(),1);
  d=await stored();assert.equal(d.idLinks.length,1,'only the seeded exclusion remains');
});

test('an exclusion is not revived through a third character (架空エクス ⇔ 架空 エクス ⇔ 架空エクス)', async()=>{
  await seed(BASE);
  assert.deepEqual(await group('cXo'),['cX2','cXo'],'cX is excluded even though cX2 matches both');
  assert.deepEqual(await group('cX'),['cX','cX2']);
  await page.click('[data-act="view"][data-view="chara"]');await page.click('#charaFilter [data-f="all"]');
  assert.match(await txt(page.locator('[data-act="charaOpen"][data-id="cXo"]')),/適正1（うち対応付け先1）/);
  await page.click('[data-act="charaOpen"][data-id="cXo"]');
  const card=await txt(page.locator('.card.chara.open'));
  assert.match(card,/対応付け先：架空 エクス｜.*ニギミタマ/);assert.doesNotMatch(card,/対応付け先：架空エクス｜/);
  await page.click('[data-act="view"][data-view="stage"]');
  const p=await picks('サブ1');
  assert.ok(!p.cand.some(t=>/架空エクス/.test(t)),'not a candidate on ラルガメンテ (only the excluded 架空エクス has suitability there)');
  await keepData();
});

test('a confirmed link is reused: a later import for another stage with the same suitability name reaches the owned unit without linking again', async()=>{
  await seed(BASE);
  await sug('メイン').locator('[data-act="linkChar"]').click();
  await page.click('[data-act="view"][data-view="admin"]');
  await page.fill('#imText',JSON.stringify({format:'monst-suitability-import-v1',stageKey:'破界の星墓::コキュートス',source:'GAMEWITH',sourceUrl:'',sourceUpdatedAt:'2026-10-11',evaluationType:'GRADE',
    entries:[{characterName:'架空ミライ',formName:'架空ピースフル',grade:'A',verificationStatus:'VERIFIED',note:''}]}));
  await page.check('#imCatalogOn');
  await page.click('[data-act="imPreview"]');await page.click('[data-act="imApply"]');
  const d=await stored();
  assert.equal(d.idLinks.filter(l=>l.basis==='USER_SELECTED').length,1,'no new link needed');
  assert.equal(d.suits.find(s=>s.stageKey==='破界の星墓::コキュートス').formId,'fMs','attached to the existing catalog form');
  await page.evaluate(()=>{db.ui.view='stage';db.ui.stage['破界の星墓']='コキュートス';render()});
  const p=await picks('メイン');
  assert.ok(p.cand.some(t=>/架空ミライ・架空ピースフルAI.*（形態未確認）/.test(t)),p.cand.join('|'));
});

test('reload and backup → restore keep links and exclusions; old data without idLinks loads and still suggests', async()=>{
  await seed(BASE);
  await sug('メイン').locator('[data-act="linkChar"]').click();
  await page.reload();
  assert.equal(await sug('メイン').count(),0);assert.equal((await picks('メイン')).sel,'uO1');
  const bk=await page.evaluate(()=>backupJson());
  const fresh=await context.newPage();await fresh.goto(url);
  await fresh.evaluate(()=>{db.ui.view='admin';render();window.confirm=()=>true});
  await fresh.evaluate(v=>{const t=document.querySelector('#bkText');t.value=v;t.dispatchEvent(new Event('input',{bubbles:true}))},bk);
  await fresh.click('[data-act="restore"]');
  assert.match((await fresh.locator('#bkMsg').textContent()).trim(),/復元しました/);
  assert.deepEqual(await fresh.evaluate(()=>[[...charGroupOf('cO')].sort(),[...charGroupOf('cXo')].sort()]),[['cM','cO'],['cX2','cXo']]);
  await fresh.close();
  const {idLinks,...old}=BASE;await seed(old);
  assert.equal(await sug('メイン').count(),1);
  assert.deepEqual(await group('cXo'),['cX','cX2','cXo'],'without the exclusion the same-name match applies as before');
});

test('390px: the suggestion with its buttons fits the phone screen', async()=>{
  await seed(BASE);
  assert.equal(await sug('メイン').count(),1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  const box=await sug('メイン').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390,JSON.stringify(box));
});
