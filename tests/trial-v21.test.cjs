// Round 21: STEP4-3追加改善。キャラ画面の適正件数・一覧は、自動照合／利用者の対応付け先の適正も含める（除外は含めない・重複計上しない）。
// 登録画面の候補に、適正図鑑キャラの適正ステージ・評価・出典を表示する。ステージ画面の仮選択グループに、適正一覧から対応付けできる案内を出す。
// 自動照合のルールは変えない（部分一致は候補表示のみ）。架空データだけを使う。隔離ブラウザで実行し、外部へは通信しない。Same harness as trial-v10.test.cjs.
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
// 適正図鑑（取り込み済み・所持個体なし）：架空ミライ（架空ピースフル：ラルガメンテS・ニギミタマA）、架空ジャヒーα（獣神化A）、架空エクス（獣神化B）、架空リンネ改（架空六道：S・S）
// 所持：「架空ミライ・架空ピースフルAI」（別ID・形態未確認・図鑑No.99069。ミライと同じキャラだと利用者が確認した想定。「・」区切りは自動照合しない）、
//       「架空ジャヒーα」（同名・自動照合）、「架空エクス」（同名・自動照合 → 除外する想定）、「架空リンネ」（自分の適正1件あり。架空リンネ改とは接尾辞違いで自動にしない）
const BASE={characters:[],deviceNames:{'メイン':'架空メイン名','サブ1':'架空タブレット'},
  master:{characters:[{id:'cM',name:'架空ミライ',origin:'SUIT_CATALOG'},{id:'cJ',name:'架空ジャヒーα',origin:'SUIT_CATALOG'},{id:'cX',name:'架空エクス',origin:'SUIT_CATALOG'},{id:'cRc',name:'架空リンネ改',origin:'SUIT_CATALOG'},
      {id:'cO',name:'架空ミライ・架空ピースフルAI'},{id:'cJo',name:'架空ジャヒーα'},{id:'cXo',name:'架空エクス'},{id:'cR',name:'架空リンネ'}],
    forms:[F('fMs','cM','架空ピースフル',{origin:'SUIT_CATALOG'}),F('fJs','cJ','獣神化',{origin:'SUIT_CATALOG'}),F('fXs','cX','獣神化',{origin:'SUIT_CATALOG'}),F('fRs','cRc','架空六道',{origin:'SUIT_CATALOG'}),
      F('fOu','cO','',{unknownForm:true,monsterNo:'99069',race:'亜人',battleType:'超バランス型',shotType:'貫通'}),F('fJu','cJo','',{unknownForm:true}),F('fXu','cXo','',{unknownForm:true}),F('fR1','cR','架空降魔')]},
  units:[U('uO1','fOu','メイン',1,{fruits:FRUITS,verificationStatus:'NEEDS_REVIEW',importSource:'monst-screenshot-reading-v1'}),U('uJ','fJu','メイン',1),U('uX','fXu','サブ1',1),U('uR','fR1','メイン',1)],
  suits:[{id:'s1',stageKey:K,formId:'fMs',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'VERIFIED',note:'GameWith表記：架空ミライ（架空ピースフル）'},
    {id:'s2',stageKey:K2,formId:'fMs',source:'GAMEWITH',evaluationType:'GRADE',grade:'A',verificationStatus:'VERIFIED'},
    {id:'s3',stageKey:K,formId:'fJs',source:'GAMEWITH',evaluationType:'GRADE',grade:'A',verificationStatus:'VERIFIED'},
    {id:'s4',stageKey:K,formId:'fXs',source:'GAMEWITH',evaluationType:'GRADE',grade:'B',verificationStatus:'VERIFIED'},
    {id:'s5',stageKey:K,formId:'fR1',source:'MANUAL',evaluationType:'GRADE',grade:'A',verificationStatus:'VERIFIED'},
    {id:'s6',stageKey:K,formId:'fRs',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'VERIFIED'},
    {id:'s7',stageKey:K2,formId:'fRs',source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus:'NEEDS_REVIEW'}],
  picks:{[K]:{'メイン':'uO1'}},useDevs:{[K]:['メイン','サブ1','サブ2','サブ3']},ui:{view:'stage',quest:'破界の星墓',stage:{'破界の星墓':'ラルガメンテ'}}};
// 登録画面のテスト用：所持の「架空ミライ・架空ピースフルAI」がまだ無い状態
const NO_O={...BASE,master:{characters:BASE.master.characters.filter(c=>c.id!=='cO'),forms:BASE.master.forms.filter(f=>f.id!=='fOu')},units:BASE.units.filter(u=>u.id!=='uO1'),picks:{}};
const row=id=>page.locator(`#suitPanel .sRow:has([data-act="suitEdit"][data-id="${id}"])`);
const picks=dev=>page.evaluate(d=>{const s=document.querySelector(`.pickSel[data-pick-dev="${d}"]`);return {cand:[...s.querySelectorAll(':scope > option')].slice(1).map(o=>o.textContent),
  groups:[...s.querySelectorAll('optgroup')].map(g=>[g.label,[...g.children].map(o=>o.textContent)]),sel:s.value}},dev);
const chara=async(filter='all')=>{await page.click('[data-act="view"][data-view="chara"]');if(await page.locator('#charaFilter').isVisible())await page.click(`#charaFilter [data-f="${filter}"]`)};
const head=async id=>txt(page.locator(`[data-act="charaOpen"][data-id="${id}"]`));
const openCard=async id=>{const b=page.locator(`[data-act="charaOpen"][data-id="${id}"]`);if(await b.getAttribute('aria-expanded')!=='true')await b.click();return txt(page.locator(`.card.chara.open:has([data-act="charaOpen"][data-id="${id}"])`))};
const keepData=async()=>{const d=await stored();
  assert.deepEqual(d.master.characters.map(c=>c.id+':'+c.name),BASE.master.characters.map(c=>c.id+':'+c.name),'no merge, no rename');
  assert.deepEqual(d.master.forms.map(f=>[f.id,f.characterId,f.name,f.unknownForm||false,f.monsterNo||'']),BASE.master.forms.map(f=>[f.id,f.characterId,f.name,f.unknownForm||false,f.monsterNo||'']),'forms untouched');
  assert.deepEqual(d.units.map(u=>[u.id,u.formId,u.device,u.no,u.verificationStatus||'',JSON.stringify(u.fruits)]),BASE.units.map(u=>[u.id,u.formId,u.device,u.no,u.verificationStatus||'',JSON.stringify(u.fruits)]),'units and fruits untouched');
  assert.deepEqual(d.suits.map(x=>[x.id,x.stageKey,x.formId,x.source,x.grade,x.verificationStatus,x.note||'']),BASE.suits.map(x=>[x.id,x.stageKey,x.formId,x.source,x.grade,x.verificationStatus,x.note||'']),'suitability records untouched');
  assert.deepEqual(d.picks,BASE.picks,'picks untouched');
  return d;};

test('「・」区切りの名前は自動照合しない: the unit stays in the 仮選択 group with a hint to link it from the suitability list; 適正0 on the character screen', async()=>{
  await seed(BASE);
  assert.deepEqual(await page.evaluate(()=>[...charGroupOf('cO')]),['cO'],'partial match is not an automatic match');
  const p=await picks('メイン');
  assert.ok(!p.cand.some(t=>/架空ミライ・架空ピースフルAI/.test(t)),'not a normal candidate');
  assert.deepEqual(p.groups.map(g=>g[0]),['所持キャラ（適正未登録・仮選択）']);assert.equal(p.sel,'uO1','the provisional pick is kept');
  const hint=page.locator('.pickHint');
  assert.equal(await hint.count(),1);
  assert.match(await txt(hint),/適正図鑑に同じキャラが登録されている場合は、下の適正一覧から対応付けできます/);
  // 候補が無い端末（所持個体なし）には案内を出さない
  assert.equal(await page.locator(`.pickSel[data-pick-dev="サブ2"]`).count(),1);
  await chara();
  assert.match(await head('cO'),/適正0/);
  assert.doesNotMatch(await head('cO'),/対応付け/);
  await keepData();
});

test('user links the character from the suitability list: becomes a normal candidate (形態未確認), picks kept, no merge; the hint disappears', async()=>{
  await seed(BASE);
  const r=row('s1');
  assert.match(await txt(r),/所持キャラの候補：架空ミライ・架空ピースフルAI（名前の一部が一致/);
  await r.locator('[data-act="linkChar"][data-b="cO"]').click();
  const d=await keepData();
  assert.deepEqual(d.idLinks.map(l=>[l.kind,l.a,l.b,l.basis]),[['char','cM','cO','USER_SELECTED']]);
  const p=await picks('メイン');
  assert.ok(p.cand.some(t=>/架空ミライ・架空ピースフルAI.*（形態未確認）/.test(t)),'now a normal candidate, form still unconfirmed: '+p.cand.join('|'));
  assert.equal(p.sel,'uO1');assert.deepEqual(p.groups,[]);
  assert.equal(await page.locator('.pickHint').count(),0,'no hint once linked');
  assert.doesNotMatch(await txt(page.locator('.pickSel[data-pick-dev="メイン"] option[value="uO1"]')),/（仮）/);
  assert.match(await txt(r),/同じキャラとして対応付け済み：架空ミライ・架空ピースフルAI/);
  assert.equal((await stored()).master.forms.find(f=>f.id==='fOu').unknownForm,true,'the form is still unconfirmed (only the character identity was confirmed)');
});

test('character screen counts and lists the linked suitability (stage, grade, source), marked as referenced through the link; own and linked are distinguished', async()=>{
  await seed({...BASE,idLinks:[{id:'l1',kind:'char',a:'cM',b:'cO',basis:'USER_SELECTED',at:'2026-10-11T00:00:00.000Z'}]});
  await chara();
  assert.match(await head('cO'),/適正2（うち対応付け先2）/);
  const card=await openCard('cO');
  assert.match(card,/対応付け先：架空ミライ.*ラルガメンテ.*架空ピースフル.*GameWith.*S/);
  assert.match(card,/対応付け先：架空ミライ.*ニギミタマ.*架空ピースフル.*GameWith.*A/);
  assert.doesNotMatch(card,/適正ステージは未登録です/);
  assert.equal(await page.locator('.card.chara.open .bLink').count(),2,'both rows are marked as linked');
  // 図鑑キャラ側：自分の適正2件（対応付け先からは増えない）
  assert.match(await head('cM'),/適正2 /);
  assert.doesNotMatch(await head('cM'),/うち対応付け先/);
  // 自分の適正を持つキャラ：自分の分は印なし
  assert.match(await head('cR'),/適正1 /);
  assert.match(await openCard('cR'),/ラルガメンテ.*架空降魔.*自分で登録.*A/);
  assert.equal(await page.locator('.card.chara.open .bLink').count(),0);
  await keepData();
});

test('automatic matches (same name) are counted too; an excluded match is neither counted nor listed; undo restores it', async()=>{
  await seed(BASE);
  await chara();
  assert.match(await head('cJo'),/適正1（うち対応付け先1）/);
  assert.match(await openCard('cJo'),/対応付け先：架空ジャヒーα.*ラルガメンテ.*獣神化.*GameWith.*A/);
  assert.match(await head('cXo'),/適正1（うち対応付け先1）/);
  await page.click('[data-act="view"][data-view="stage"]');
  await row('s4').locator('[data-act="excludeChar"][data-b="cXo"]').click();
  await chara();
  assert.match(await head('cXo'),/適正0/);
  assert.doesNotMatch(await head('cXo'),/対応付け/);
  assert.match(await openCard('cXo'),/適正ステージは未登録です/);
  assert.doesNotMatch(await openCard('cXo'),/対応付け先：架空エクス/);
  await page.click('[data-act="view"][data-view="stage"]');
  await row('s4').locator('[data-act="unexcludeChar"][data-b="cXo"]').click();
  await chara();
  assert.match(await head('cXo'),/適正1（うち対応付け先1）/);
  const d=await keepData();
  assert.deepEqual(d.idLinks,[],'exclusion undone leaves nothing behind');
});

test('no double counting: own suitability plus a linked catalog character with two stages = 3, each record once (both directions)', async()=>{
  await seed(BASE);
  await row('s6').locator('[data-act="linkChar"][data-b="cR"]').click();
  await chara();
  assert.match(await head('cR'),/適正3（うち対応付け先2）/);
  const card=await openCard('cR');
  assert.equal((card.match(/ラルガメンテ/g)||[]).length,2,'s5 (own) and s6 (linked) once each');
  assert.equal((card.match(/ニギミタマ/g)||[]).length,1,'s7 once');
  assert.match(card,/対応付け先：架空リンネ改.*ニギミタマ.*架空六道.*GameWith.*S.*要確認/);
  assert.match(await head('cRc'),/適正3（うち対応付け先1）/);
  assert.equal(await page.evaluate(()=>db.suits.length),7,'no suitability record added or duplicated');
  await keepData();
});

test('registration candidates show the catalog character\'s suitability (stage, grade, source form) and what choosing it means; not choosing warns about linking', async()=>{
  await seed(NO_O);
  await page.evaluate(()=>openQuickReg());
  await page.fill('#qrCharName','架空ミライ・架空ピースフルAI');
  const list=await txt(page.locator('#qrCands'));
  assert.match(list,/架空ミライ.*名前の一部が一致/);
  assert.match(list,/適正：.*ラルガメンテ：ランク S（GameWith・架空ピースフル）/);
  assert.match(list,/ニギミタマ：ランク A（GameWith・架空ピースフル）/);
  assert.match(list,/この候補を選ぶと登録済みの適正情報につながります/);
  assert.match(list,/候補を選ばない場合は、新しいキャラ「架空ミライ・架空ピースフルAI」として登録します/);
  assert.match(list,/適正とは自動ではつながらない場合があります/);
  assert.match(list,/適正一覧から対応付けできます/);
  // 所持キャラ自身の適正（自分で登録）も、図鑑キャラの適正も同じ形で出る
  await page.fill('#qrCharName','架空リンネ');
  const l2=await txt(page.locator('#qrCands'));
  assert.match(l2,/架空リンネ 同じ名前.*適正：.*ラルガメンテ：ランク A（自分で登録・架空降魔）/);assert.match(l2,/架空リンネ改 名前の一部が一致.*適正：.*ラルガメンテ：ランク S（GameWith・架空六道）/);assert.match(l2,/架空リンネ改 名前の一部が一致.*適正：.*ニギミタマ：ランク S（GameWith・架空六道）/);
  // スクショ読み取りの登録画面でも同じ候補表示
  await page.evaluate(()=>closeModals());
  await page.click('[data-act="view"][data-view="admin"]');
  await page.fill('#srText',JSON.stringify({format:'monst-screenshot-reading-v1',characterName:'架空ミライ・架空ピースフルAI',formName:null,monsterNo:'99069',race:'亜人',battleType:'超バランス型',shotType:'貫通',fruit1:null,fruit2:null,fruit3:null,confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[]}));
  await page.click('[data-act="srPreview"]');
  const sr=await txt(page.locator('#srCands'));
  assert.match(sr,/架空ミライ.*名前の一部が一致.*適正：.*ラルガメンテ：ランク S（GameWith・架空ピースフル）/);
  assert.match(sr,/この候補を選ぶと登録済みの適正情報につながります/);
  const d=await stored();assert.deepEqual(d.master.characters.map(c=>c.id),NO_O.master.characters.map(c=>c.id));assert.deepEqual(d.units.map(u=>u.id),NO_O.units.map(u=>u.id));
});

test('only choosing the candidate adds the unit to the catalog character (form stays optional); otherwise a new character is created and nothing is merged', async()=>{
  await seed(NO_O);
  await page.evaluate(()=>openQuickReg());
  await page.fill('#qrCharName','架空ミライ・架空ピースフルAI');
  await page.locator('#qrCands [data-act="qrCand"]').filter({hasText:'架空ミライ'}).first().click();
  assert.equal(await page.inputValue('#qrChar'),'cM');
  await page.selectOption('#qrDevice','サブ1');await page.uncheck('#qrSuitOn');
  await page.click('[data-act="qrSave"]');
  let d=await stored();
  assert.deepEqual(d.master.characters.map(c=>c.id),NO_O.master.characters.map(c=>c.id),'no new character');
  const nf=d.master.forms.find(f=>f.characterId==='cM'&&f.unknownForm);
  assert.ok(nf,'unit registered without a form name → 進化形態未確認 under the catalog character');
  assert.deepEqual(d.units.filter(u=>u.formId===nf.id).map(u=>[u.device,u.no]),[['サブ1',1]]);
  assert.deepEqual(d.suits.map(x=>x.id+x.grade),BASE.suits.map(x=>x.id+x.grade));assert.deepEqual(d.picks,{});
  await chara();
  assert.match(await head('cM'),/個体1・適正2 /);
  // 候補を選ばない → 新しいキャラ（適正0・自動照合なし）
  await page.evaluate(()=>{db.ui.view='stage';render();openQuickReg()});
  await page.fill('#qrCharName','架空ミライ・別の個体AI');await page.selectOption('#qrDevice','メイン');await page.uncheck('#qrSuitOn');
  await page.click('[data-act="qrSave"]');
  d=await stored();
  const c=d.master.characters.find(x=>x.name==='架空ミライ・別の個体AI');
  assert.ok(c&&!c.origin,'a new owned character');
  assert.deepEqual(await page.evaluate(id=>[...charGroupOf(id)],c.id),[c.id],'not linked automatically');
  await chara();
  assert.match(await head(c.id),/適正0/);
});

test('reload, backup → restore keep links, counts, picks and fruits; old data without idLinks still loads', async()=>{
  await seed(BASE);
  await row('s1').locator('[data-act="linkChar"][data-b="cO"]').click();
  await page.reload();
  assert.equal((await picks('メイン')).sel,'uO1');
  await chara();assert.match(await head('cO'),/適正2（うち対応付け先2）/);
  const bk=await page.evaluate(()=>backupJson());
  const fresh=await context.newPage();await fresh.goto(url);
  await fresh.evaluate(()=>{db.ui.view='admin';render();window.confirm=()=>true});
  await fresh.evaluate(v=>{const t=document.querySelector('#bkText');t.value=v;t.dispatchEvent(new Event('input',{bubbles:true}))},bk);
  await fresh.click('[data-act="restore"]');
  assert.match(await (await fresh.locator('#bkMsg').textContent()).trim(),/復元しました/);
  const d=await fresh.evaluate(()=>JSON.parse(JSON.stringify({units:db.units,picks:db.picks,idLinks:db.idLinks,suits:db.suits})));
  assert.deepEqual(d.units.map(u=>[u.id,JSON.stringify(u.fruits)]),BASE.units.map(u=>[u.id,JSON.stringify(u.fruits)]));
  assert.deepEqual(d.picks,BASE.picks);assert.equal(d.idLinks.length,1);assert.deepEqual(d.suits.map(x=>x.id+x.grade+x.verificationStatus),BASE.suits.map(x=>x.id+x.grade+x.verificationStatus));
  await fresh.close();
  const {idLinks,...old}=BASE;await seed(old);
  await chara();assert.match(await head('cJo'),/適正1（うち対応付け先1）/);
});

test('390px: character screen with linked rows, registration candidates with suitability lines, and the stage hint fit the phone screen', async()=>{
  await seed({...BASE,idLinks:[{id:'l1',kind:'char',a:'cM',b:'cO',basis:'USER_SELECTED',at:'2026-10-11T00:00:00.000Z'}]});
  const fits=async()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth);
  assert.ok(await fits(),'stage');
  await chara();await openCard('cO');assert.ok(await fits(),'character screen');
  await page.evaluate(()=>{db.ui.view='stage';render();openQuickReg()});await page.fill('#qrCharName','架空ミライ・架空ピースフルAI');
  assert.ok(await page.evaluate(()=>document.querySelector('#qrModal .modal').scrollWidth<=document.querySelector('#qrModal .modal').clientWidth),'dialog');
  assert.ok(await fits(),'page with dialog');
});
