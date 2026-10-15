// v36：同じキャラの複数個体。利用者が確認して「まとめた」キャラを、キャラ一覧・編成・端末画面で1つのキャラ名（代表名）として表示する。
// 保存するのは「まとめ」の記録（idLinks）1件だけで、キャラ・形態・所持個体（個体ID・図鑑No.・実・貸出）・編成・適正は変えない。自動ではまとめない。架空データだけを使う。
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
async function newPage(width){
  context=await browser.newContext({viewport:{width,height:844}});external=[];
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
}
beforeEach(async()=>{await newPage(390)});
afterEach(async()=>{
  assert.deepEqual(errors,[],'no console or JavaScript errors');
  assert.deepEqual(external.filter(u=>!/^data:|^blob:/.test(u)),[],'no request leaves the page');
  assert.ok(await page.evaluate(key=>window.storageAccess.every(([,k])=>k===key),KEY),'app reads/writes only trial-v2');
  const sentinels=await page.evaluate(keys=>keys.map(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k)),protectedKeys);
  assert.deepEqual(sentinels,protectedKeys.map(k=>'protected sentinel '+k));
  await context.close();
});
const click=async selector=>page.locator(selector).first().click();
async function seed(raw){await page.evaluate(({key,raw})=>localStorage.setItem(key,JSON.stringify(raw)),{key:KEY,raw});await page.reload()}
const stored=()=>page.evaluate(key=>JSON.parse(Object.getPrototypeOf(localStorage).getItem.call(localStorage,key)||'null'),KEY);
const txt=async l=>(await l.textContent()).replace(/\s+/g,' ').trim();
const plain=o=>JSON.parse(JSON.stringify(o));
const {teamView,choose}=require('./helpers/team.cjs');

const K1='天魔の孤城::試練の間・第1の間', K2='天魔の孤城::試練の間・第2の間';
const F=(id,cid,x={})=>({id,characterId:cid,name:'',short:'',race:'',battleType:'',shotType:'',unknownForm:true,...x});
const fr=(kind,names)=>names.map(([name,grade])=>({name,grade,kind}));
const FR1=fr('戦型',[['戦型の絆・加命撃','特級L'],['戦型の絆・加撃速','特級L'],['戦型の絆・加撃','特級L']]);
const FR2=fr('撃種',[['撃種の絆・加撃','特級L'],['撃種の絆・加命撃','特級L']]);
const FR3=fr('同族',[['同族の絆・加撃','特級L'],['同族の絆・加撃速','特級L'],['同族の絆・加命撃','特級L']]);
const U=(id,formId,device,no,fruits,x={})=>({id,formId,device,no,fruits,memo:'',epithet:'',verificationStatus:'VERIFIED',importSource:'MANUAL',...x});
const S=(id,stageKey,formId,verificationStatus='VERIFIED')=>({id,stageKey,formId,source:'GAMEWITH',evaluationType:'GRADE',grade:'S',verificationStatus,note:''});
// 架空ヤクモ（MV・No.8930・戦型の実3つ）と、別の登録名「架空ヤクモ大荒武装」（No.6737）2体（撃種の実2つ・同族の実3つ、1体はサブ1へ貸出中）。
// 紛らわしいキャラ：架空ヤクモα（別キャラ）、架空ヤクモ図鑑（適正図鑑のみ・個体なし）。無関係：架空ネオ。適正は架空ヤクモ（K1）と架空ネオ（K2）だけ
const WORLD=(x={})=>({characters:[],deviceNames:{'メイン':'架空メイン機'},
  master:{characters:[{id:'cY',name:'架空ヤクモ'},{id:'cO',name:'架空ヤクモ大荒武装'},{id:'cA',name:'架空ヤクモα'},{id:'cN',name:'架空ネオ'},{id:'cC',name:'架空ヤクモ図鑑',origin:'SUIT_CATALOG'}],
    forms:[F('fY','cY',{race:'神',battleType:'スピード型',shotType:'反射',monsterNo:'8930'}),F('fO','cO',{race:'魔族',battleType:'パワー型',shotType:'貫通',monsterNo:'6737'}),
      F('fA','cA',{race:'亜人',battleType:'バランス型',shotType:'反射'}),F('fN','cN',{race:'亜人',battleType:'バランス型',shotType:'貫通'}),F('fC','cC',{origin:'SUIT_CATALOG'})]},
  units:[U('uY','fY','メイン',1,FR1),U('uO1','fO','メイン',1,FR2),U('uO2','fO','メイン',2,FR3,{lentTo:'サブ1'}),U('uA','fA','メイン',1,FR2),U('uN','fN','サブ1',1,FR3)],
  suits:[S('s1',K1,'fY'),S('s2',K2,'fN'),S('s3',K1,'fC','UNVERIFIED')],
  ownershipChecks:[],idLinks:[],
  picks:{[K1]:{'メイン':'uO1'}},useDevs:{[K1]:['メイン','サブ1']},
  ui:{view:'chara',quest:'天魔の孤城',stage:{'天魔の孤城':'試練の間・第1の間'}},...x});
// 保護対象（保存時の項目の補完に影響されない形）
const PROT=d=>plain({units:d.units.map(u=>[u.id,u.formId,u.device,u.no,u.fruits,u.lentTo||null,u.verificationStatus,u.monsterNo||'',u.race||'']),
  chars:d.master.characters.map(c=>[c.id,c.name,c.origin||'']),forms:d.master.forms.map(f=>[f.id,f.characterId,f.monsterNo||'',f.race,f.battleType,f.shotType]),
  suits:d.suits.map(x=>[x.id,x.stageKey,x.formId,x.verificationStatus]),picks:d.picks,deviceNames:d.deviceNames});
const head=id=>txt(page.locator(`[data-act="charaOpen"][data-id="${id}"]`));
const heads=()=>page.locator('#charaList .cHead .cname').allTextContents();
const chara=async()=>{await page.evaluate(()=>{db.ui.view='chara';render()})};
const openCard=async id=>{await click(`[data-act="charaOpen"][data-id="${id}"]`);return txt(page.locator('#charaList .card.open'))};
async function groupVia(openId,pickId){
  await click(`.card.open [data-act="groupOpen"]`);
  await page.locator(`#grList [data-act="groupPick"][data-id="${pickId}"]`).click();
}

test('1. nothing is grouped automatically: 架空ヤクモ / 架空ヤクモ大荒武装 / 架空ヤクモα stay separate cards with 所持N体; loading writes nothing', async()=>{
  await seed(WORLD());
  const raw=await page.evaluate(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k),KEY);
  await chara();
  assert.deepEqual(await heads(),['架空ネオ','架空ヤクモ','架空ヤクモ大荒武装','架空ヤクモα']);
  assert.match(await head('cY'),/所持1体・適正1/);
  assert.match(await head('cO'),/所持2体（貸出中1）・適正0/);
  assert.match(await head('cA'),/所持1体/);
  assert.equal(await page.evaluate(k=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,k),KEY),raw,'viewing does not save');
  // 適正図鑑のみのキャラは「所持」と書かない
  await page.evaluate(()=>{charaFilter='catalog';renderChara()});
  assert.match(await head('cC'),/個体未登録・適正1/);assert.doesNotMatch(await head('cC'),/所持/);
});

test('2. grouping 架空ヤクモ大荒武装 into 架空ヤクモ: candidates are shown (not chosen), confirm screen shows the result, saving adds one link and changes nothing else', async()=>{
  await seed(WORLD());const d0=await stored();await chara();
  await openCard('cO');
  await click('.card.open [data-act="groupOpen"]');
  const list=await txt(page.locator('#grList'));
  assert.match(list,/名前・図鑑No.が近い所持キャラs*架空ヤクモ 名前の一部が一致 1体.*・No.8930/);
  assert.match(list,/架空ヤクモα/,'a similar name is only offered, never grouped');
  assert.doesNotMatch(list,/架空ヤクモ図鑑/,'catalog-only characters (no units) are not offered');
  // 絞り込み
  await page.fill('#grSearch','ネオ');assert.deepEqual(await page.locator('#grList [data-act="groupPick"] b').allTextContents(),['架空ネオ']);
  await page.fill('#grSearch','');
  assert.deepEqual(PROT(await stored()),PROT(d0),'opening the dialog saves nothing');
  await page.locator('#grList [data-act="groupPick"][data-id="cY"]').click();
  const conf=(await txt(page.locator('#grBody'))).replace(/\s+/g,'');
  assert.match(conf,/「架空ヤクモ大荒武装」（2体）と「架空ヤクモ」（1体）を、同じキャラとしてまとめます/);
  assert.equal(await page.locator('input[name="grKeep"]:checked').inputValue(),'cY','the shorter leading name is the default 代表名');
  assert.match(conf,/まとめた後の表示架空ヤクモ所持3体架空メイン機（メイン）No\.8930登録名：架空ヤクモ反射｜スピード型｜神戦型加命撃L戦型加撃速L戦型加撃L/,'the 代表名 unit first');
  assert.match(conf,/No\.6737登録名：架空ヤクモ大荒武装貫通｜パワー型｜魔族撃種加撃L撃種加命撃L/);
  assert.match(conf,/No\.6737貸出中→サブ1登録名：架空ヤクモ大荒武装貫通｜パワー型｜魔族同族加撃L同族加撃速L同族加命撃L/);
  assert.deepEqual(PROT(await stored()),PROT(d0),'the confirm screen saves nothing');
  await click('[data-act="groupSave"]');
  const d1=await stored();
  assert.deepEqual(PROT(d1),PROT(d0),'units (ids, fruits, 図鑑No., lending), characters, forms, suits and picks are unchanged');
  assert.equal(d1.idLinks.length,1);
  assert.deepEqual([d1.idLinks[0].kind,d1.idLinks[0].a,d1.idLinks[0].b,d1.idLinks[0].basis],['char','cY','cO','USER_GROUP']);
  // 一覧：1枚の「架空ヤクモ 所持3体」。架空ヤクモαは別のまま
  assert.deepEqual(await heads(),['架空ネオ','架空ヤクモ','架空ヤクモα']);
  assert.match(await head('cY'),/所持3体（貸出中1）・適正1/);
  assert.match(await page.locator('#charaCount').textContent(),/まとめ1件/);
  const card=(await txt(page.locator('#charaList .card.open'))).replace(/\s+/g,'');
  assert.match(card,/「架空ヤクモ」としてまとめました（所持3体）/);
  assert.match(card,/架空メイン機（メイン）（3体）個体1No\.8930確認済み在籍反射｜スピード型｜神1\[戦型\]戦型の絆・加命撃特級L/);
  assert.match(card,/個体2No\.6737確認済み在籍貫通｜パワー型｜魔族登録名：架空ヤクモ大荒武装1\[撃種\]撃種の絆・加撃特級L2\[撃種\]撃種の絆・加命撃特級L/);
  assert.match(card,/個体3No\.6737確認済み貸出中→サブ1貫通｜パワー型｜魔族登録名：架空ヤクモ大荒武装1\[同族\]同族の絆・加撃特級L/);
  assert.match(card,/まとめた登録名（2件）架空ヤクモ代表名1体・No\.8930まとめから外す架空ヤクモ大荒武装2体・No\.6737まとめから外す/);
  // 検索：どちらの登録名でも1件
  await page.evaluate(()=>{db.ui.view='search';render()});
  await page.fill('#searchInput','大荒');
  assert.match(await txt(page.locator('#searchResults')),/^新方式（キャラ・所持個体） 架空ヤクモ 新方式 架空メイン機（メイン）×3 計3体\s*まとめた登録名：架空ヤクモ・架空ヤクモ大荒武装 キャラ画面で見る$/);
  // 再読み込み後も同じ（保存形式の往復）
  await page.reload();await chara();
  assert.deepEqual(await heads(),['架空ネオ','架空ヤクモ','架空ヤクモα']);
  assert.deepEqual((await stored()).idLinks.map(l=>l.basis),['USER_GROUP']);
});

test('3. team picking is per unit: the grouped units become suitable candidates by unit, shown as 架空ヤクモ with each unit\'s No., 撃種｜戦型｜種族 and fruits; picks store unit ids only', async()=>{
  await seed(WORLD());
  await page.evaluate(()=>{db.ui.view='stage';render()});
  let v=await teamView(page,'メイン');
  assert.deepEqual(v.cand,['架空ヤクモ 個体1'],'before grouping only 架空ヤクモ is suitable');
  assert.deepEqual(v.groups[0][1],['架空ヤクモ大荒武装 個体1（仮）','架空ヤクモα 個体1（仮）']);
  await seed(WORLD({idLinks:[{id:'g1',kind:'char',a:'cY',b:'cO',basis:'USER_GROUP',at:''}],ui:{view:'stage',quest:'天魔の孤城',stage:{'天魔の孤城':'試練の間・第1の間'}}}));
  const d0=await stored();
  v=await teamView(page,'メイン');
  assert.deepEqual(v.cand,['架空ヤクモ 個体1','架空ヤクモ 個体2'],'after grouping the 大荒武装 unit on メイン is a candidate too (the lent one is not here)');
  assert.deepEqual(v.groups[0][1],['架空ヤクモα 個体1（仮）'],'架空ヤクモα is not merged');
  // 端末カード：選択済みの uO1 は「架空ヤクモ 個体2 No.6737」＋その個体の撃種｜戦型｜種族と実
  const card=txt(page.locator('.pickDev[data-dev="メイン"]'));
  assert.match(await card,/架空ヤクモ\s*個体2\s*No\.6737\s*貫通｜パワー型｜魔族\s*撃種加撃L\s*撃種加命撃L/);
  assert.doesNotMatch(await card,/仮選択/,'the picked 大荒武装 unit now counts as suitable');
  await page.locator('.pickDev[data-dev="メイン"] [data-act="openPicker"]').click();
  const items=await page.locator('#pkList .pkItem[data-group="cand"]').evaluateAll(bs=>bs.map(b=>b.textContent.replace(/\s+/g,' ').trim()));
  assert.match(items[0].replace(/\s+/g,''),/^架空ヤクモ個体1No\.8930反射｜スピード型｜神戦型加命撃L戦型加撃速L戦型加撃L$/);
  assert.match(items[1].replace(/\s+/g,''),/^架空ヤクモ個体2No\.6737貫通｜パワー型｜魔族選択中キャラ名で一致撃種加撃L撃種加命撃L$/,'the 大荒武装 unit matches the suit by character, not by form (v35 tag)');
  await page.locator('#pickModal [data-act="close"]').first().click();
  // サブ1：借りている大荒武装（個体3）
  v=await teamView(page,'サブ1');
  assert.deepEqual(v.cand,['架空ヤクモ 個体3（架空メイン機（メイン）から借用）']);
  await choose(page,'メイン','uY');
  await choose(page,'サブ1','uO2');
  const d1=await stored();
  assert.deepEqual(d1.picks[K1],{'メイン':'uY','サブ1':'uO2'});
  assert.deepEqual(PROT({...d1,picks:d0.picks}),PROT(d0),'only the picks changed');
  assert.deepEqual(d1.idLinks,d0.idLinks);
});

test('4. lending and returning stay per unit inside a grouped card; a new unit gets a number that does not collide', async()=>{
  await seed(WORLD({idLinks:[{id:'g1',kind:'char',a:'cY',b:'cO',basis:'USER_GROUP',at:''}]}));
  const d0=await stored();await chara();await openCard('cY');
  // 個体3（uO2）を返却 → uO2 だけ lentTo が消える
  await page.locator('#charaList [data-unit="uO2"] [data-act="unitReturn"]').click();
  let d=await stored();
  assert.equal(d.units.find(u=>u.id==='uO2').lentTo,undefined);
  assert.deepEqual(PROT({...d,units:d.units.filter(u=>u.id!=='uO2')}),PROT({...d0,units:d0.units.filter(u=>u.id!=='uO2')}));
  // 個体1（uY）をサブ2へ貸出 → uY だけ
  await page.locator('#charaList [data-unit="uY"] [data-act="unitLend"]').click();
  assert.match(await page.locator('#lendTitle').textContent(),/「架空ヤクモ 個体1 No\.8930」を貸し出す/);
  await page.selectOption('#lendTo','サブ2');await click('[data-act="saveLend"]');
  d=await stored();
  assert.equal(d.units.find(u=>u.id==='uY').lentTo,'サブ2');
  assert.deepEqual(d.units.filter(u=>u.lentTo).map(u=>u.id),['uY']);
  assert.deepEqual(d.units.map(u=>[u.id,u.no,u.fruits]),d0.units.map(u=>[u.id,u.no,u.fruits]),'numbers and fruits untouched');
  // 新しい個体（代表のキャラに登録）：まとめの中で重ならない番号
  await chara();
  await click('.card.open [data-act="unitAdd"]');
  assert.equal(await page.locator('#unNo').inputValue(),'4');
  await page.fill('#unFrName0','同族の絆・加撃');await click('[data-act="saveUnit"]');
  d=await stored();
  const nu=d.units.find(u=>!d0.units.some(o=>o.id===u.id));
  assert.equal(nu.no,4);assert.equal(d.master.forms.find(f=>f.id===nu.formId).characterId,'cY');
  assert.match(await head('cY'),/所持4体/);
  assert.deepEqual(await page.locator('#charaList .card.open [data-unit] .cname').evaluateAll(es=>es.map(e=>e.textContent.match(/個体\d+/)[0])),['個体1','個体2','個体3','個体4']);
});

test('5. まとめから外す removes only the grouping record; an existing 対応付け (USER_SELECTED) is upgraded in place and restored on removal', async()=>{
  await seed(WORLD());const d0=await stored();await chara();
  await openCard('cY');
  // 既存：架空ヤクモ ⇔ 架空ヤクモ大荒武装 が対応付け済み（表示は別カード）
  await seed(WORLD({idLinks:[{id:'L1',kind:'char',a:'cO',b:'cY',basis:'USER_SELECTED',at:'2026-10-01T00:00:00.000Z'}]}));
  await chara();
  assert.deepEqual(await heads(),['架空ネオ','架空ヤクモ','架空ヤクモ大荒武装','架空ヤクモα'],'a plain 対応付け does not change the list');
  await openCard('cY');await groupVia('cY','cO');
  assert.equal(await page.locator('input[name="grKeep"]:checked').inputValue(),'cY');
  await click('[data-act="groupSave"]');
  let d=await stored();
  assert.deepEqual(d.idLinks.map(l=>[l.id,l.a,l.b,l.basis,l.at]),[['L1','cY','cO','USER_GROUP_LINKED','2026-10-01T00:00:00.000Z']]);
  assert.deepEqual(await heads(),['架空ネオ','架空ヤクモ','架空ヤクモα']);
  await page.locator('.grMember[data-member="cO"] [data-act="ungroupChar"]').click();
  d=await stored();
  assert.deepEqual(d.idLinks.map(l=>[l.id,l.basis]),[['L1','USER_SELECTED']],'back to the original 対応付け');
  assert.deepEqual(await heads(),['架空ネオ','架空ヤクモ','架空ヤクモ大荒武装','架空ヤクモα']);
  assert.deepEqual(PROT(d),PROT(d0));
  // 新しく作ったまとめは、外すと記録ごと無くなる
  await openCard('cO');await groupVia('cO','cA');
  await page.check('input[name="grKeep"][value="cO"]');
  assert.match(await txt(page.locator('#grBody')),/架空ヤクモ大荒武装 所持3体/,'the user can choose the 代表名');
  await click('[data-act="groupSave"]');
  assert.deepEqual((await stored()).idLinks.map(l=>[l.a,l.b,l.basis]),[['cY','cO','USER_SELECTED'],['cO','cA','USER_GROUP']]);
  await page.locator('.grMember[data-member="cA"] [data-act="ungroupChar"]').click();
  assert.deepEqual((await stored()).idLinks.map(l=>[l.id,l.basis]),[['L1','USER_SELECTED']]);
  assert.deepEqual(PROT(await stored()),PROT(d0));
});

test('6. a pair recorded as 同じキャラではない cannot be grouped; a group of three keeps one card and one 代表名', async()=>{
  await seed(WORLD({idLinks:[{id:'X1',kind:'char',a:'cY',b:'cA',basis:'USER_EXCLUDED',at:''},{id:'g1',kind:'char',a:'cY',b:'cO',basis:'USER_GROUP',at:''}]}));
  await chara();await openCard('cY');
  await click('.card.open [data-act="groupOpen"]');
  const alpha=page.locator('#grList [data-act="groupPick"][data-id="cA"]');
  assert.ok(await alpha.isDisabled());assert.match(await txt(alpha),/「同じキャラではない」と記録済みのため選べません/);
  assert.equal(await page.locator('#grList [data-act="groupPick"][data-id="cO"]').count(),0,'already in the group');
  await page.locator('#grList [data-act="groupPick"][data-id="cN"]').click();
  await click('[data-act="groupSave"]');
  assert.deepEqual(await heads(),['架空ヤクモ','架空ヤクモα']);
  assert.match(await head('cY'),/所持4体（貸出中1）・適正2/,'架空ネオ\'s unit and suit join the card');
  const card=await txt(page.locator('#charaList .card.open'));
  assert.match(card.replace(/\s+/g,''),/まとめた登録名（3件）架空ヤクモ代表名1体・No\.8930まとめから外す架空ネオ1体まとめから外す架空ヤクモ大荒武装2体・No\.6737/);
});

test('7. the backup includes the grouping link; old data without it loads unchanged and ungrouped', async()=>{
  await seed(WORLD({idLinks:[{id:'g1',kind:'char',a:'cY',b:'cO',basis:'USER_GROUP',at:'2026-10-15T00:00:00.000Z'}]}));
  const backup=await page.evaluate(()=>backupJson());
  const parsed=JSON.parse(backup);
  const data=parsed.data||parsed;
  assert.deepEqual((data.idLinks||[]).map(l=>[l.a,l.b,l.basis]),[['cY','cO','USER_GROUP']]);
  // 旧形式（まとめの無いデータ）はそのまま
  await seed(WORLD());await chara();
  assert.deepEqual(await heads(),['架空ネオ','架空ヤクモ','架空ヤクモ大荒武装','架空ヤクモα']);
  assert.deepEqual((await stored()).idLinks,[]);
});

test('8. 390px / 360px: grouped card and the まとめる dialog fit without horizontal scroll; buttons stay tappable', async()=>{
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  for(const w of [390,360]){
    if(w!==390){await context.close();await newPage(w)}
    await seed(WORLD({idLinks:[{id:'g1',kind:'char',a:'cY',b:'cO',basis:'USER_GROUP',at:''}]}));
    await chara();await openCard('cY');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`no horizontal scroll at ${w}px (card)`);
    await page.screenshot({path:path.join(__dirname,'artifacts',`v36-card-${w}.png`),fullPage:true});
    await click('.card.open [data-act="groupOpen"]');
    await page.locator('#grList [data-act="groupPick"][data-id="cA"]').click();
    assert.ok(await page.evaluate(()=>{const m=document.querySelector('#groupModal .modal');return m.scrollWidth<=m.clientWidth+1}),`no horizontal scroll at ${w}px (dialog)`);
    const box=await page.locator('[data-act="groupSave"]').boundingBox();assert.ok(box.height>=32&&box.x>=0&&box.x+box.width<=w);
    await page.screenshot({path:path.join(__dirname,'artifacts',`v36-dialog-${w}.png`)});
    await page.locator('#groupModal [data-act="close"]').first().click();
    await page.evaluate(()=>{db.ui.view='stage';render()});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`no horizontal scroll at ${w}px (stage)`);
    await page.screenshot({path:path.join(__dirname,'artifacts',`v36-stage-${w}.png`)});
  }
});
