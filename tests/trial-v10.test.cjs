// Round 10: スクショ読取（monst-screenshot-reading-v1）の取り込み — 1キャラ分を1端末の所持個体として登録する。
// 架空データだけを使う。Gemini・外部への通信はしない（このページから外部へのリクエストが無いことも確かめる）。
// Same harness as trial-v8.test.cjs.
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
// スクショ読取 Ver.2 がコピーする JSON と同じ形（架空のキャラ）
const READING={format:'monst-screenshot-reading-v1',characterName:'架空キャラ壱',formName:'架空の形態・真',monsterNo:'90001',race:'亜人',battleType:'バランス型',shotType:'反射',
  fruit1:'同族の絆・加撃 特級L',fruit2:'将命削り 特L',fruit3:null,confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[]};
async function preview(obj=READING){
  await click('[data-act="view"][data-view="admin"]');
  await page.fill('#srText',typeof obj==='string'?obj:JSON.stringify(obj));
  await click('[data-act="srPreview"]');
}
const val=id=>page.inputValue('#'+id);
// 進化形態・図鑑No.は折りたたみ（任意）。入力するときは開く
const openMore=()=>page.evaluate(()=>{const d=document.getElementById('srMore');if(d)d.open=true});
const result=async()=>(await page.locator('#srResult').textContent()).replace(/\s+/g,' ');
async function toConfirm(device='サブ2'){await page.selectOption('#srDevice',device);await click('[data-act="srCheck"]')}
const unitsOf=(d,name)=>{const ids=new Set(d.master.forms.filter(f=>d.master.characters.find(c=>c.id===f.characterId)?.name===name).map(f=>f.id));return d.units.filter(u=>ids.has(u.formId))};

test('preview: fields are shown for checking, the 特L shorthand is converted, nothing is saved', async()=>{
  await click('[data-act="view"][data-view="admin"]'); // 画面の切り替え自体は表示状態を保存するので、その後から数える
  const before=await sets();
  await page.fill('#srText',JSON.stringify(READING));await click('[data-act="srPreview"]');
  assert.equal(await page.locator('#srEdit').isVisible(),true);
  assert.equal(await val('srF_characterName'),'架空キャラ壱');assert.equal(await val('srF_formName'),'架空の形態・真');
  assert.equal(await val('srF_monsterNo'),'90001');assert.equal(await val('srF_race'),'亜人');
  assert.equal(await val('srF_battleType'),'バランス型');assert.equal(await val('srF_shotType'),'反射');
  // 等級が登録済み表記 → そのまま／略記「特L」は対応表どおり「特級L」に変換して名前と分ける
  assert.equal(await val('srFr1Name'),'同族の絆・加撃');assert.equal(await val('srFr1Grade'),'特級L');
  assert.equal(await val('srFr2Name'),'将命削り');assert.equal(await val('srFr2Grade'),'特級L');
  assert.equal(await val('srFr3Name'),'');
  assert.equal(await page.locator('#srInfo').textContent(),'わくわくの実2の等級「特L」を「特級L」に変換しました');
  assert.equal(await page.locator('#srWarn').count(),0,'nothing left to check by hand');
  // 登録先の端末は自動で選ばない（6台＋未選択）
  assert.deepEqual(await page.locator('#srDevice option').allTextContents(),['選んでください','メイン','サブ1','サブ2','サブ3','サブ4','サブ5']);
  assert.equal(await val('srDevice'),'');
  assert.equal(await page.locator('#srNeedsReview').isChecked(),false,'HIGH and not needsReview');
  assert.equal(await page.locator('#srApply').isDisabled(),true);
  assert.equal(await sets(),before,'preview writes nothing');
});

test('grade notation: 特L/特M/特EL are converted, 特級○ kept, anything unclear is left blank for a manual check', async()=>{
  await preview({...READING,fruit1:'加撃の実 特L',fruit2:'速必殺の実 特M',fruit3:'熱き友撃の実 特EL'});
  assert.deepEqual([await val('srFr1Name'),await val('srFr1Grade'),await val('srFr2Name'),await val('srFr2Grade'),await val('srFr3Name'),await val('srFr3Grade')],
    ['加撃の実','特級L','速必殺の実','特級M','熱き友撃の実','特級EL']);
  assert.equal((await page.locator('#srInfo').innerText()).trim(),
    'わくわくの実1の等級「特L」を「特級L」に変換しました\nわくわくの実2の等級「特M」を「特級M」に変換しました\nわくわくの実3の等級「特EL」を「特級EL」に変換しました');
  assert.equal(await page.locator('#srWarn').count(),0);
  // そのままの表記・全角の略記
  await preview({...READING,fruit1:'加撃の実 特級L',fruit2:'速必殺の実 特級EL',fruit3:'熱き友撃の実 特Ｍ'});
  assert.deepEqual([await val('srFr1Grade'),await val('srFr2Grade'),await val('srFr3Name'),await val('srFr3Grade')],['特級L','特級EL','熱き友撃の実','特級M']);
  assert.equal((await page.locator('#srInfo').innerText()).trim(),'わくわくの実3の等級「特Ｍ」を「特級M」に変換しました','特級○ is not reported as converted');
  // 分からない表記は推測しない（「特」「特S」「特級X」「L」・等級なし）
  await preview({...READING,fruit1:'加撃の実 特',fruit2:'速必殺の実 特S',fruit3:'熱き友撃の実 特級X'});
  for(const i of [1,2,3]) assert.equal(await val('srFr'+i+'Grade'),'','fruit '+i+' grade left blank');
  assert.deepEqual([await val('srFr1Name'),await val('srFr2Name'),await val('srFr3Name')],['加撃の実 特','速必殺の実 特S','熱き友撃の実 特級X'],'the original text is kept for the manual check');
  const w=await page.locator('#srWarn').textContent();
  for(const i of [1,2,3]) assert.match(w,new RegExp(`わくわくの実${i}「[^」]+」の等級が分からない表記のため、等級は空欄です（推測で変換しません）`));
  assert.equal(await page.locator('#srInfo').count(),0);
  await preview({...READING,fruit1:'加撃の実 L',fruit2:'等級の無い実',fruit3:null});
  assert.deepEqual([await val('srFr1Name'),await val('srFr1Grade'),await val('srFr2Name'),await val('srFr2Grade')],['加撃の実 L','','等級の無い実','']);
});

test('grade in brackets (as Screenshot Reader Ver.2 returns it on a real phone): 「撃種の絆・加速命（特級L）」 is split into name + 特級L', async()=>{
  // スマホ実機でスクショ読取 Ver.2 が返した文字列そのまま（等級が全角かっこで囲まれ、空白なし）
  await preview({...READING,fruit1:'撃種の絆・加速命（特級L）',fruit2:'撃種の絆・加速（特級L）',fruit3:'撃種の絆・加命撃（特級L）'});
  assert.deepEqual([await val('srFr1Name'),await val('srFr1Grade'),await val('srFr2Name'),await val('srFr2Grade'),await val('srFr3Name'),await val('srFr3Grade')],
    ['撃種の絆・加速命','特級L','撃種の絆・加速','特級L','撃種の絆・加命撃','特級L']);
  assert.equal(await page.locator('#srWarn').count(),0,'no manual grade check needed');
  assert.equal(await page.locator('#srInfo').count(),0,'特級L is already the app notation (not reported as converted)');
  // かっこ内の略記は対応表どおり変換／半角かっこ・かっこ前の空白も同じ扱い
  await preview({...READING,fruit1:'加撃の実（特L）',fruit2:'速必殺の実 (特級M)',fruit3:'熱き友撃の実(特ＥＬ)'});
  assert.deepEqual([await val('srFr1Name'),await val('srFr1Grade'),await val('srFr2Name'),await val('srFr2Grade'),await val('srFr3Name'),await val('srFr3Grade')],
    ['加撃の実','特級L','速必殺の実','特級M','熱き友撃の実','特級EL']);
  assert.equal((await page.locator('#srInfo').innerText()).trim(),
    'わくわくの実1の等級「特L」を「特級L」に変換しました\nわくわくの実3の等級「特ＥＬ」を「特級EL」に変換しました');
  // かっこの中が等級として分からないもの・閉じていないものは推測しない（元の文字列のまま名前欄、等級は空欄）
  await preview({...READING,fruit1:'加撃の実（特S）',fruit2:'加撃の実（特級L',fruit3:'加撃の実（同族）'});
  assert.deepEqual([await val('srFr1Name'),await val('srFr1Grade'),await val('srFr2Name'),await val('srFr2Grade'),await val('srFr3Name'),await val('srFr3Grade')],
    ['加撃の実（特S）','','加撃の実（特級L','','加撃の実（同族）','']);
  for(const i of [1,2,3]) assert.match(await page.locator('#srWarn').textContent(),new RegExp(`わくわくの実${i}「[^」]+」の等級が分からない表記`));
  // 確認画面・登録でも名前と等級が別々に入る
  await preview({...READING,characterName:'架空キャラ捌',fruit1:'撃種の絆・加速命（特級L）',fruit2:'撃種の絆・加速（特級L）',fruit3:'撃種の絆・加命撃（特級L）'});
  await toConfirm('サブ2');
  assert.match(await result(),/わくわくの実：撃種の絆・加速命 特級L、撃種の絆・加速 特級L、撃種の絆・加命撃 特級L/);
  await click('[data-act="srApply"]');
  assert.deepEqual(unitsOf(await snapshot(),'架空キャラ捌')[0].fruits,
    [{name:'撃種の絆・加速命',grade:'特級L',kind:''},{name:'撃種の絆・加速',grade:'特級L',kind:''},{name:'撃種の絆・加命撃',grade:'特級L',kind:''}]);
});

test('a pending entry held before the fix keeps its fruits exactly as held (no re-conversion on resume)', async()=>{
  // 修正前に保留された形（名前に「（特級L）」が残り、等級は空欄）
  const old={id:'old1',at:'2026-10-09T11:00:00.000Z',updatedAt:'',device:'メイン',characterName:'架空保留キャラ',formName:'',monsterNo:'',race:'',battleType:'',shotType:'',
    fruits:[{name:'撃種の絆・加速命（特級L）',grade:''}],needsReview:true,confidence:'MEDIUM',reviewNotes:[],uncertainFields:[]};
  await seed({characters:[],master:{characters:[],forms:[]},units:[],pendingReadings:[old]});
  await click('[data-act="view"][data-view="admin"]');
  await click('[data-act="srResume"][data-id="old1"]');
  assert.deepEqual([await val('srFr1Name'),await val('srFr1Grade')],['撃種の絆・加速命（特級L）',''],'shown as held; the user edits it by hand');
  assert.deepEqual((await page.evaluate(()=>JSON.parse(JSON.stringify(db.pendingReadings))))[0],old,'stored entry untouched');
});

test('converted grades are what gets registered; existing units with old notation are not changed', async()=>{
  await seed({characters:[],master:{characters:[{id:'c1',name:'架空キャラ伍'}],forms:[{id:'f1',characterId:'c1',name:'架空形態',short:'',race:'',battleType:'',shotType:''}]},
    units:[{id:'old',formId:'f1',device:'サブ4',no:1,fruits:[{name:'旧表記の実 特L',grade:''}],memo:'手入力'}]});
  const before=await snapshot();
  await preview({...READING,characterName:'架空キャラ陸',fruit1:'加撃の実 特L',fruit2:'速必殺の実 特M',fruit3:'熱き友撃の実 特EL'});
  await toConfirm('サブ4');
  assert.match(await result(),/わくわくの実：加撃の実 特級L、速必殺の実 特級M、熱き友撃の実 特級EL/);
  await click('[data-act="srApply"]');
  const d=await snapshot();
  assert.deepEqual(unitsOf(d,'架空キャラ陸')[0].fruits,[{name:'加撃の実',grade:'特級L',kind:''},{name:'速必殺の実',grade:'特級M',kind:''},{name:'熱き友撃の実',grade:'特級EL',kind:''}]);
  assert.deepEqual(d.units.find(u=>u.id==='old'),before.units.find(u=>u.id==='old'),'existing unit keeps its old notation as-is');
  assert.deepEqual(d.master.forms.find(f=>f.id==='f1'),before.master.forms.find(f=>f.id==='f1'));
});

test('uncertain fields are highlighted; unknown 戦型/撃種 stay blank; MEDIUM / needsReview → 要確認 by default', async()=>{
  await preview({...READING,battleType:'バランス',shotType:'反射型',confidence:'MEDIUM',needsReview:true,reviewNotes:['実の等級がかすれている'],uncertainFields:['race','fruit2','bogus']});
  assert.equal(await val('srF_battleType'),'');assert.equal(await val('srF_shotType'),'');
  const w=await page.locator('#srWarn').textContent();
  assert.match(w,/戦型「バランス」は登録済みの表記と違うため空欄（未確認）/);assert.match(w,/撃種「反射型」/);
  assert.match(await page.locator('#srEdit').textContent(),/実の等級がかすれている/);
  const unc=await page.$$eval('#srEdit .srUnc input,#srEdit .srUnc select',els=>els.map(e=>e.id));
  assert.deepEqual(unc,['srF_race','srFr2Name','srFr2Grade']);
  assert.equal(await page.locator('#srNeedsReview').isChecked(),true);
});

test('invalid JSON / wrong format / wrong types are refused and change nothing', async()=>{
  const before=await snapshot();
  for(const [text,msg] of [['{broken','JSONとして読み取れません'],['[1,2]','データの形式が正しくありません'],
    [JSON.stringify({...READING,format:'monst-suitability-import-v1'}),'format が「monst-screenshot-reading-v1」ではありません'],
    [JSON.stringify({...READING,confidence:'SURE'}),'confidence が HIGH'],[JSON.stringify({...READING,needsReview:'no'}),'needsReview が true'],
    [JSON.stringify({...READING,characterName:['x']}),'キャラ名（characterName）の形式'],[JSON.stringify({...READING,reviewNotes:'x'}),'reviewNotes が文字列の配列'],
    [JSON.stringify({...READING,uncertainFields:{}}),'uncertainFields が配列'],['x'.repeat(20001),'JSONが長すぎます']]){
    await preview(text);
    assert.match(await result(),new RegExp('取り込めません（何も変更していません）.*'+msg),msg);
    assert.equal(await page.locator('#srEdit').isVisible(),false);assert.equal(await page.locator('#srTools').isVisible(),false);
  }
  const after=await snapshot();delete after.ui;delete before.ui;assert.deepEqual(after,before);
});

test('register: confirm screen first, then the unit is added to the chosen device; blanks stay blank', async()=>{
  await preview({...READING,race:null,monsterNo:null});
  // 端末未選択では進めない
  await click('[data-act="srCheck"]');assert.match(await result(),/登録先の端末を選んでください/);
  assert.equal(await page.locator('#srApply').isDisabled(),true);
  await page.selectOption('#srFr2Grade','特級M');await page.fill('#srFr2Name','将命削り');
  await toConfirm('サブ2');
  const r=await result();
  assert.match(r,/登録前の確認 .*架空キャラ壱｜架空の形態・真/);
  assert.match(r,/登録先：サブ2・個体1（新しい個体として追加）/);
  assert.match(r,/図鑑No\.未確認・未確認 \/ バランス型 \/ 反射/);
  assert.match(r,/わくわくの実：同族の絆・加撃 特級L、将命削り 特級M/);
  assert.match(r,/確認状態：確認済み/);assert.match(r,/キャラを新規登録.*進化形態を新規登録/);
  assert.doesNotMatch(r,/unitNo/);
  assert.deepEqual((await snapshot()).units,[],'nothing saved before 登録する');
  await click('[data-act="srApply"]');
  assert.match(await page.locator('#srMsg').textContent(),/登録しました：サブ2 架空キャラ壱｜架空の形態・真 個体1（確認済み）/);
  const d=await snapshot();
  const f=d.master.forms.find(x=>x.name==='架空の形態・真');
  assert.equal(f.race,'');assert.equal(f.monsterNo,undefined,'blank 図鑑No. is not invented');
  assert.equal(f.battleType,'バランス型');assert.equal(f.shotType,'反射');
  const u=unitsOf(d,'架空キャラ壱');assert.equal(u.length,1);
  assert.equal(u[0].device,'サブ2');assert.equal(u[0].no,1);assert.equal(u[0].verificationStatus,'VERIFIED');assert.equal(u[0].importSource,'monst-screenshot-reading-v1');
  assert.deepEqual(u[0].fruits,[{name:'同族の絆・加撃',grade:'特級L',kind:''},{name:'将命削り',grade:'特級M',kind:''}]);
  assert.equal(d.suits.length,0,'no stage suitability is created');
  assert.equal(await page.locator('#srApply').isDisabled(),true,'cannot register twice by tapping again');
  // 保存されている（再読み込みしても残る）
  await page.reload();assert.equal(unitsOf(await snapshot(),'架空キャラ壱').length,1);
});

// ===== 進化形態は任意（未確認のまま正式登録できる）=====
const NARA={format:'monst-screenshot-reading-v1',characterName:'奈良シカマル',formName:null,monsterNo:'9252',race:null,battleType:null,shotType:null,
  fruit1:'撃種の絆・加速命（特級L）',fruit2:'撃種の絆・加速（特級L）',fruit3:'撃種の絆・加命撃（特級L）',confidence:'MEDIUM',needsReview:true,reviewNotes:[],uncertainFields:[]};

test('進化形態 null: 奈良シカマル is registered on マフティー（メイン） with 図鑑No. and three 特級L fruits; nothing is guessed', async()=>{
  await seed({characters:[],deviceNames:{'メイン':'マフティー'},master:{characters:[],forms:[]},units:[]});
  await preview(NARA);
  // 進化形態・図鑑No.は通常は畳んだ欄の中（任意）。進化形態が空でも注意は出さない
  assert.equal(await page.locator('#srMore').getAttribute('open'),null,'進化形態・図鑑No. are folded away');
  assert.equal(await page.locator('#srF_formName').isVisible(),false);
  assert.equal(await val('srF_monsterNo'),'9252','読み取れた図鑑No.は保持');
  assert.equal(await page.locator('#srWarn').count(),0,'no warning only because 進化形態 is unknown');
  await page.selectOption('#srDevice','メイン');await click('[data-act="srCheck"]');
  const r=await result();
  assert.match(r,/登録前の確認 奈良シカマル 登録先/);assert.doesNotMatch(r,/進化形態未確認/,"キャラ名中心の表示");
  assert.match(r,/登録先：マフティー（メイン）・個体1（新しい個体として追加）/);
  assert.match(r,/図鑑No\.9252/);
  assert.match(r,/わくわくの実：撃種の絆・加速命 特級L、撃種の絆・加速 特級L、撃種の絆・加命撃 特級L/);
  assert.doesNotMatch(r,/登録できません|進化形態が未確認です。/);
  assert.equal(await page.locator('#srApply').isDisabled(),false);
  await click('[data-act="srApply"]');
  assert.match(await page.locator('#srMsg').textContent(),/登録しました：マフティー（メイン） 奈良シカマル 個体1（要確認）/);
  const check=async()=>{
    const d=await snapshot();
    assert.equal(d.master.characters.filter(c=>c.name==='奈良シカマル').length,1);
    const f=d.master.forms.filter(x=>x.characterId===d.master.characters[0].id);
    assert.equal(f.length,1);assert.equal(f[0].unknownForm,true);assert.equal(f[0].name,'','進化形態名は推測しない');assert.equal(f[0].monsterNo,'9252');
    assert.deepEqual([f[0].race,f[0].battleType,f[0].shotType],['','','']);
    const u=unitsOf(d,'奈良シカマル');assert.equal(u.length,1);assert.equal(u[0].device,'メイン');
    assert.deepEqual(u[0].fruits,[{name:'撃種の絆・加速命',grade:'特級L',kind:''},{name:'撃種の絆・加速',grade:'特級L',kind:''},{name:'撃種の絆・加命撃',grade:'特級L',kind:''}]);
    assert.deepEqual(d.suits,[],'no stage suitability is guessed');
  };
  await check();
  await page.reload();await check(); // 再読み込みで進化形態未確認の形態が消えない（個体が宙に浮かない）
  // キャラ画面：キャラ名中心（「進化形態未確認」は出さない）。端末・実・図鑑No.は見え、形態の編集ボタンは残る
  await click('[data-act="view"][data-view="chara"]');
  const cid=(await snapshot()).master.characters[0].id;
  await click(`[data-act="charaOpen"][data-id="${cid}"]`);
  const t=(await page.locator('#view-chara').textContent()).replace(/\s+/g,' ');
  assert.match(t,/奈良シカマル/);assert.match(t,/マフティー（メイン）（1体）/);assert.match(t,/No\.9252/);
  assert.doesNotMatch(t,/進化形態未確認/);
  assert.equal(await page.locator('#view-chara [data-act="formEdit"]').count(),1,'形態の編集はそのまま使える');
});

test('same character again with 進化形態 unknown: the one 進化形態未確認 entry is reused, units are never merged', async()=>{
  await preview(NARA);await toConfirm('メイン');await click('[data-act="srApply"]');
  await preview({...NARA,fruit3:null});await toConfirm('メイン');
  assert.match(await result(),/メインには「奈良シカマル」の個体がすでにあります/);
  assert.match(await result(),/個体1・実：撃種の絆・加速命 特級L/);
  await click('[data-act="srApply"]');assert.match(await page.locator('#srMsg').textContent(),/チェックを入れてから/);
  await page.check('#srDupOk');await click('[data-act="srApply"]');
  await preview({...NARA,fruit1:null});await toConfirm('サブ1');await click('[data-act="srApply"]');
  const d=await snapshot();
  assert.equal(d.master.forms.length,1,'one 進化形態未確認 per character');
  const u=unitsOf(d,'奈良シカマル');assert.deepEqual(u.map(x=>[x.device,x.no,x.fruits.length]),[['メイン',1,3],['メイン',2,2],['サブ1',1,2]]);
});

test('known 進化形態 in JSON still works (compatibility) and stays separate from 進化形態未確認; 図鑑No. is not a conflict within the same character', async()=>{
  await preview(NARA);await toConfirm('メイン');await click('[data-act="srApply"]');
  await preview({...NARA,formName:'架空の既知形態',fruit1:'加撃の実（特級M）',fruit2:null,fruit3:null});
  assert.equal(await page.locator('#srMore').getAttribute('open'),'','folded section opens when the JSON has 進化形態');
  assert.equal(await val('srF_formName'),'架空の既知形態');
  await toConfirm('メイン');
  assert.doesNotMatch(await result(),/図鑑No\.9252 が既存/);
  assert.match(await result(),/奈良シカマル｜架空の既知形態/);
  await page.check('#srDupOk');await click('[data-act="srApply"]');
  const d=await snapshot();
  const forms=d.master.forms.map(f=>[f.name,!!f.unknownForm,f.monsterNo||'']).sort();
  assert.deepEqual(forms,[['',true,'9252'],['架空の既知形態',false,'9252']]);
  assert.equal(unitsOf(d,'奈良シカマル').length,2);
});

test('stage: units of 進化形態未確認 are not treated as suitable; suitability import never attaches to it', async()=>{
  const K='禁忌の獄::一ノ獄';
  await seed({characters:[],master:{characters:[{id:'c1',name:'架空キャラ玖'}],forms:[{id:'f1',characterId:'c1',name:'架空の既知形態',short:'',race:'',battleType:'',shotType:''},
      {id:'fu',characterId:'c1',name:'',unknownForm:true,short:'',race:'',battleType:'',shotType:''}]},
    units:[{id:'u1',formId:'fu',device:'メイン',no:1,fruits:[]}],
    suits:[{id:'s1',stageKey:K,formId:'f1',source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'}]});
  assert.deepEqual(await page.evaluate(k=>candidatesFor(k,'メイン').map(u=>u.id),K),[],'not a candidate (form unknown)');
  assert.equal(await page.evaluate(()=>formStatus('f1','メイン')),'alt-form','shown as 別形態 for the known suitable form');
  assert.equal(await page.evaluate(()=>formLabel(formOf('fu'))),'架空キャラ玖');
  // 適正データの取り込み：キャラ名だけ・形態名が空の行は紐づけない（未確認の形態へ付かない）
  await click('[data-act="view"][data-view="admin"]');
  await page.fill('#imText',JSON.stringify({format:'monst-suitability-import-v1',stageKey:K,source:'GAMEWITH',evaluationType:'CANDIDATE',
    entries:[{characterName:'架空キャラ玖',formName:''},{characterName:'架空キャラ玖',formName:'進化形態未確認'}]}));
  await click('[data-act="imPreview"]');
  const s=await page.locator('#imResult').textContent();
  assert.doesNotMatch(s,/取り込み可能（[1-9]/);
  assert.deepEqual((await snapshot()).suits.map(x=>x.formId),['f1']);
});

test('stage cards: a same-name unit of 進化形態未確認 is shown as 参考 and can be picked provisionally (never a confirmed candidate); exact-form units stay normal', async()=>{
  const K='禁忌の獄::一ノ獄';
  await seed({characters:[],master:{characters:[{id:'c1',name:'架空キャラ玖'},{id:'c2',name:'架空キャラ拾壱'},{id:'c3',name:'適正なしの架空キャラ'}],
      forms:[{id:'f1',characterId:'c1',name:'架空の既知形態',short:'',race:'',battleType:'',shotType:''},
        {id:'fu',characterId:'c1',name:'',unknownForm:true,short:'',race:'亜人',battleType:'バランス型',shotType:'反射'},
        {id:'f2',characterId:'c2',name:'架空の形態B',short:'',race:'魔族',battleType:'パワー型',shotType:'貫通'},
        {id:'fu3',characterId:'c3',name:'',unknownForm:true,short:'',race:'',battleType:'',shotType:''}]},
    units:[{id:'uRef',formId:'fu',device:'メイン',no:1,fruits:[{name:'撃種の絆・加命撃',grade:'特級L'}]},
      {id:'uOk',formId:'f2',device:'メイン',no:1,fruits:[]},
      {id:'uNo',formId:'fu3',device:'メイン',no:1,fruits:[]},
      {id:'uRef2',formId:'fu',device:'サブ1',no:1,fruits:[]}],
    suits:[{id:'s1',stageKey:K,formId:'f1',source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'},
      {id:'s2',stageKey:K,formId:'f2',source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'}],
    useDevs:{[K]:['メイン','サブ1']},ui:{view:'stage',quest:'禁忌の獄',stage:{'禁忌の獄':'一ノ獄'}}});
  const main=page.locator('.pickDev[data-dev="メイン"]'), sub=page.locator('.pickDev[data-dev="サブ1"]');
  // 選択肢：進化形態まで一致する候補の下に、参考（進化形態未確認）を「（仮）」として別グループで出す
  // （その下に、適正の無い所持キャラも「所持キャラ」グループとして出る：trial-v11）
  assert.deepEqual(await main.locator('.pickSel option').allTextContents(),['— 使う個体を選ぶ —','架空キャラ拾壱｜架空の形態B 個体1','架空キャラ玖 個体1（仮）','適正なしの架空キャラ 個体1（仮）']);
  assert.equal(await main.locator('.pickSel optgroup').first().getAttribute('label'),'参考（進化形態未確認・仮選択）');
  assert.match(await main.locator('.devHead').textContent(),/候補1/);assert.match(await main.locator('.devHead').textContent(),/参考1/);
  // 参考：同名キャラ（進化形態未確認）。キャラ名・種族・戦型・撃種・実を表示し、点線の別枠＋「参考」で区別
  const ref=main.locator('.pRef');
  assert.equal(await ref.count(),1);
  const rt=(await ref.textContent()).replace(/\s+/g,' ');
  assert.match(rt,/参考：適正キャラと同名（進化形態未確認・適正は未確定）/);
  assert.match(rt,/架空キャラ玖 個体1/);assert.match(rt,/亜人.*バランス型.*反射/);assert.match(rt,/撃種加命撃L/);
  assert.doesNotMatch(rt,/適正なしの架空キャラ/,'名前が適正キャラと一致しない個体は出さない');
  assert.equal(await ref.locator('.uCard.uRef').count(),1);
  // 候補が無い端末でも、参考があれば仮選択できる（選択欄は有効）
  assert.equal(await sub.locator('.pickSel').isDisabled(),false);
  assert.match(await sub.textContent(),/進化形態まで一致する所持個体はありません（参考から仮選択できます）/);
  assert.match((await sub.locator('.pRef').textContent()).replace(/\s+/g,' '),/架空キャラ玖 個体1/);
  // 通常の候補を選んだカードは従来どおり（参考・仮選択の印は付かない）
  await main.locator('.pickSel').selectOption('uOk');
  const okCard=main.locator('.uCard:not(.uRef)');
  assert.equal(await okCard.count(),1);assert.doesNotMatch(await okCard.textContent(),/参考|仮選択/);
  // 参考の個体を仮選択：保存されるのは個体IDだけ（従来の picks と同じ形）。カードは点線＋「仮選択・適正未確定」で区別し、種族・戦型・撃種・実を表示
  await sub.locator('.pickSel').selectOption('uRef2');
  await main.locator('.pickSel').selectOption('uRef');
  let d=await snapshot();
  assert.deepEqual(d.picks,{'禁忌の獄::一ノ獄':{'メイン':'uRef','サブ1':'uRef2'}});
  const prov=main.locator('.uCard.uProv');
  assert.equal(await prov.count(),1);
  const pt=(await prov.textContent()).replace(/\s+/g,' ');
  assert.match(pt,/架空キャラ玖 個体1/);assert.match(pt,/仮選択・適正未確定/);assert.match(pt,/亜人.*バランス型.*反射/);assert.match(pt,/撃種加命撃L/);
  assert.doesNotMatch(await main.textContent(),/候補外/,'a provisional pick is not reported as stale');
  assert.equal(await main.locator('.pRef .uCard').count(),0,'the picked one is not repeated in the 参考 list');
  // 詳細表示（3モード）も使える
  await click('[data-act="infoMode"][data-mode="all"]');
  assert.match(await main.locator('.pAll').textContent(),/架空キャラ玖/);
  await click('[data-act="infoMode"][data-mode="all"]');
  // スマホ幅（390px）で横にはみ出さない（仮選択のカード・参考のカードとも）
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal scroll at 390px');
  await page.screenshot({path:path.join(__dirname,'artifacts','v10-stage-provisional-390.png'),fullPage:true});
  // 再読み込みしても仮選択のまま。適正・形態のデータは何も変わらない（推測で作らない・確定しない）
  await page.reload();
  assert.equal(await page.locator('.pickDev[data-dev="メイン"] .uCard.uProv').count(),1);
  d=await snapshot();assert.deepEqual(d.suits.map(s=>s.formId),['f1','f2']);assert.equal(d.master.forms.find(f=>f.id==='fu').unknownForm,true);
  // 仮選択は解除できる
  await page.locator('.pickDev[data-dev="メイン"] .pickSel').selectOption('');
  assert.deepEqual((await snapshot()).picks,{'禁忌の獄::一ノ獄':{'サブ1':'uRef2'}});
});

test('a provisional pick stays provisional (所持キャラ) if the unit is no longer a 参考 (e.g. its form was named later); nothing is auto-confirmed', async()=>{
  const K='禁忌の獄::一ノ獄';
  await seed({characters:[],master:{characters:[{id:'c1',name:'架空キャラ玖'}],
      forms:[{id:'f1',characterId:'c1',name:'架空の既知形態',short:'',race:'',battleType:'',shotType:''},{id:'fu',characterId:'c1',name:'',unknownForm:true,short:'',race:'',battleType:'',shotType:''}]},
    units:[{id:'uRef',formId:'fu',device:'メイン',no:1,fruits:[]}],
    suits:[{id:'s1',stageKey:K,formId:'f1',source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'}],
    picks:{[K]:{'メイン':'uRef'}},useDevs:{[K]:['メイン']},ui:{view:'stage',quest:'禁忌の獄',stage:{'禁忌の獄':'一ノ獄'}}});
  assert.equal(await page.locator('.uCard.uProv').count(),1);
  // 形態に別の名前を付けると、その形態には適正が無いので参考でも候補でもなくなる → 所持キャラからの仮選択として残す（自動で確定しない）
  await page.evaluate(()=>{const f=formOf('fu');f.name='架空の別形態';delete f.unknownForm;persist();render()});
  const t=await page.locator('.pickDev[data-dev="メイン"]').textContent();
  assert.match(t,/仮選択・適正未確定/);assert.doesNotMatch(t,/候補外/);
  assert.deepEqual((await snapshot()).picks,{[K]:{'メイン':'uRef'}});
  assert.deepEqual((await snapshot()).suits.map(s=>s.formId),['f1']);
});

test('naming 進化形態未確認 later in the form editor turns it into a normal form; units stay attached; backup/restore keeps the mark', async()=>{
  await preview(NARA);await toConfirm('メイン');await click('[data-act="srApply"]');
  const json=await page.evaluate(()=>backupJson());
  assert.equal(JSON.parse(json).data.master.forms[0].unknownForm,true);
  await seed({characters:[]});await click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',json);await click('[data-act="restore"]');
  let d=await snapshot();assert.equal(d.master.forms[0].unknownForm,true);assert.equal(unitsOf(d,'奈良シカマル').length,1);
  const fid=d.master.forms[0].id;
  await page.evaluate(id=>openForm(formOf(id).characterId,formOf(id)),fid);
  assert.equal(await page.inputValue('#fmName'),'');
  await page.fill('#fmName','架空の判明形態');await page.evaluate(()=>saveForm());
  d=await snapshot();
  assert.deepEqual([d.master.forms[0].id,d.master.forms[0].name,d.master.forms[0].unknownForm,d.master.forms[0].monsterNo],[fid,'架空の判明形態',undefined,'9252']);
  assert.equal(unitsOf(d,'奈良シカマル').length,1);
});

test('quick registration from the stage: an empty 進化形態名 registers under 進化形態未確認 (reused, not duplicated)', async()=>{
  await page.evaluate(()=>{db.ui.quest='禁忌の獄';db.ui.stage['禁忌の獄']='一ノ獄';persist();render()});
  for(const fr of ['架空の実A','架空の実B']){
    await page.evaluate(()=>openQuickReg());
    await page.selectOption('#qrChar',await page.evaluate(()=>db.master.characters.find(c=>c.name==='架空キャラ拾')?.id||'__new__'));
    if(await page.locator('#qrCharNameField').isVisible()) await page.fill('#qrCharName','架空キャラ拾');
    assert.equal(await page.locator('#qrFormName').isVisible(),false,'進化形態名は折りたたみ（任意）');
    await page.selectOption('#qrDevice','サブ2');await page.fill('#qrFrName0',fr);
    await page.uncheck('#qrSuitOn');
    await page.evaluate(()=>saveQuickReg());
    assert.equal(await page.locator('#qrMsg').textContent(),'',fr);
  }
  const d=await snapshot();
  const f=d.master.forms.filter(x=>x.characterId===d.master.characters.find(c=>c.name==='架空キャラ拾').id);
  assert.equal(f.length,1);assert.equal(f[0].unknownForm,true);
  assert.deepEqual(unitsOf(d,'架空キャラ拾').map(u=>[u.device,u.no,u.fruits[0].name]),[['サブ2',1,'架空の実A'],['サブ2',2,'架空の実B']]);
});

test('duplicate on the same device: never merged automatically; adding needs an explicit choice', async()=>{
  await seed({characters:[],master:{characters:[{id:'c1',name:'架空キャラ壱'}],
    forms:[{id:'f1',characterId:'c1',name:'架空の形態・真',short:'',race:'亜人',battleType:'バランス型',shotType:'反射',monsterNo:'90001'},
      {id:'f0',characterId:'c1',name:'架空の形態・進化',short:'',race:'',battleType:'',shotType:''}]},
    units:[{id:'u1',formId:'f1',device:'メイン',no:1,fruits:[{name:'同族の絆・加撃',grade:'特級L'},{name:'将命削り',grade:'特級L'}],memo:'手入力'},
      {id:'u0',formId:'f0',device:'メイン',no:2,fruits:[],memo:''},
      {id:'u9',formId:'f1',device:'サブ1',no:1,fruits:[],memo:''}]});
  const before=await snapshot();
  await preview();await toConfirm('メイン');
  const r=await result();
  assert.match(r,/メインには「架空キャラ壱」の個体がすでにあります（自動では上書き・統合しません）/);
  assert.match(r,/個体1｜架空の形態・真.*（同じ進化形態）（実も同じ＝同じ個体の可能性が高い）/);
  assert.match(r,/個体2｜架空の形態・進化/);
  assert.match(r,/登録先：メイン・個体3/);
  await click('[data-act="srApply"]');
  assert.match(await page.locator('#srMsg').textContent(),/チェックを入れてから/);
  let d=await snapshot();assert.deepEqual(d.units,before.units,'nothing added without the explicit choice');
  await page.check('#srDupOk');await click('[data-act="srApply"]');
  d=await snapshot();
  assert.equal(d.units.length,4);
  for(const u of before.units) assert.deepEqual(d.units.find(x=>x.id===u.id),u,'existing units untouched');
  assert.deepEqual(d.master.forms,before.master.forms,'existing forms untouched (all values already equal)');
  // サブ1 に登録するときは、メインの個体は重複扱いしない（端末ごと）
  await preview({...READING,fruit1:null,fruit2:null});await toConfirm('サブ3');
  assert.doesNotMatch(await result(),/すでにあります/);
});

test('existing form values are never overwritten: differences block; blanks are supplemented', async()=>{
  await seed({characters:[],master:{characters:[{id:'c1',name:'架空キャラ壱'},{id:'c2',name:'架空キャラ弐'}],
    forms:[{id:'f1',characterId:'c1',name:'架空の形態・真',short:'',race:'',battleType:'パワー型',shotType:'',monsterNo:''},
      {id:'f2',characterId:'c2',name:'別の架空形態',short:'',race:'',battleType:'',shotType:'',monsterNo:'90002'}]},units:[]});
  const before=await snapshot();
  await preview();await toConfirm('メイン');
  assert.match(await result(),/戦型が既存（パワー型）と違います（JSON：バランス型）/);
  assert.match(await result(),/登録できません（既存データは変更しません）/);
  assert.equal(await page.locator('#srApply').isDisabled(),true);
  // 図鑑No.が別キャラの形態と同じ → 登録できない
  await page.selectOption('#srF_battleType','パワー型');await page.fill('#srF_monsterNo','90002');await click('[data-act="srCheck"]');
  assert.match(await result(),/図鑑No\.90002 が既存の「架空キャラ弐｜別の架空形態」と同じです/);
  assert.equal(await page.locator('#srApply').isDisabled(),true);
  let d=await snapshot();delete d.ui;delete before.ui;assert.deepEqual(d,before);
  // 一致する値にすれば、空欄（種族・撃種・図鑑No.）だけ補完して登録できる
  await page.fill('#srF_monsterNo','90001');await click('[data-act="srCheck"]');
  assert.match(await result(),/空欄だった項目を補完：図鑑No\.・種族・撃種/);
  await click('[data-act="srApply"]');
  d=await snapshot();const f=d.master.forms.find(x=>x.id==='f1');
  assert.deepEqual([f.battleType,f.race,f.shotType,f.monsterNo],['パワー型','亜人','反射','90001']);
  assert.equal(d.master.forms.length,2,'no new form');
});

test('stale confirmation: editing a field or the JSON after 確認画面へ requires checking again', async()=>{
  await preview();await toConfirm('メイン');
  assert.equal(await page.locator('#srApply').isDisabled(),false);
  await page.fill('#srF_race','架空族');
  assert.equal(await page.locator('#srApply').isDisabled(),true);
  await click('[data-act="srCheck"]');assert.equal(await page.locator('#srApply').isDisabled(),false);
  await page.selectOption('#srDevice','サブ4');
  assert.equal(await page.locator('#srApply').isDisabled(),true,'changing the device also needs a new check');
  await click('[data-act="srCheck"]');
  await page.fill('#srText',JSON.stringify({...READING,characterName:'架空キャラ参'}));
  assert.equal(await page.locator('#srEdit').isVisible(),false);assert.equal(await page.locator('#srTools').isVisible(),false);
  await page.evaluate(()=>applyScreenshot());
  assert.match(await page.locator('#srMsg').textContent(),/もう一度「確認画面へ」/);
  assert.deepEqual((await snapshot()).units,[]);
});

test('rollback: a failure while saving restores the previous state', async()=>{
  await seed({characters:[],master:{characters:[{id:'c9',name:'既存の架空キャラ'}],forms:[]}});
  const before=await snapshot();
  await preview();await toConfirm('サブ5');
  await page.evaluate(()=>{window.__p=persist;persist=()=>{throw new Error('quota')}});
  await click('[data-act="srApply"]');
  await page.evaluate(()=>{persist=window.__p});
  assert.match(await page.locator('#srMsg').textContent(),/登録前の状態に戻しました/);
  const d=await snapshot();assert.deepEqual([d.master,d.units],[before.master,before.units]);
  await page.reload();assert.deepEqual((await snapshot()).units,[]);
});

test('Gemini text is shown as text only, and the registered unit appears on the character screen', async()=>{
  await preview({...READING,characterName:'<img src=x onerror="window.__x=1">',reviewNotes:['<b>注意</b>'],needsReview:true});
  assert.equal(await page.evaluate(()=>window.__x),undefined);
  assert.equal(await page.locator('#srEdit img,#srEdit b:has-text("注意")').count(),0);
  await page.fill('#srF_characterName','架空キャラ肆');await toConfirm('サブ1');
  assert.equal(await page.locator('#srResult img').count(),0);
  await click('[data-act="srApply"]');
  await click('[data-act="view"][data-view="chara"]');
  await page.fill('#charaSearch','架空キャラ肆');
  const t=await page.locator('#view-chara, main').first().textContent();
  assert.match(t,/架空キャラ肆/);
});

test('390px: the screenshot import panel fits without horizontal scroll', async()=>{
  await preview();await toConfirm('メイン');
  const w=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,vw:window.innerWidth}));
  assert.ok(w.doc<=w.vw,'no horizontal scroll: '+JSON.stringify(w));
});

// ===== 保留（pendingReadings）=====
const pend=()=>page.evaluate(()=>JSON.parse(JSON.stringify(db.pendingReadings)));
const msg=()=>page.locator('#srMsg').textContent();
const pendRows=()=>page.locator('#srPendingList .pendRow');
const P=(i,extra={})=>({id:'p'+i,at:'2026-10-09T10:00:00.000Z',updatedAt:'',device:'',characterName:'架空保留'+i,formName:'',monsterNo:'',race:'',battleType:'',shotType:'',
  fruits:[],needsReview:true,confidence:'MEDIUM',reviewNotes:[],uncertainFields:[],...extra});

test('hold: 進化形態 null can be held without a device; nothing is registered, editor is cleared', async()=>{
  await preview({...READING,formName:null,needsReview:true,reviewNotes:['進化形態の欄が画像の外'],uncertainFields:['race']});
  await click('[data-act="srHold"]');
  assert.match(await msg(),/保留しました：架空キャラ壱（1／200件）/);
  const p=await pend();assert.equal(p.length,1);
  assert.deepEqual({...p[0],id:'',at:''},{id:'',at:'',updatedAt:'',device:'',characterName:'架空キャラ壱',formName:'',monsterNo:'90001',race:'亜人',
    battleType:'バランス型',shotType:'反射',fruits:[{name:'同族の絆・加撃',grade:'特級L'},{name:'将命削り',grade:'特級L'}],
    needsReview:true,confidence:'HIGH',reviewNotes:['進化形態の欄が画像の外'],uncertainFields:['race']});
  assert.ok(/^\d{4}-\d\d-\d\dT/.test(p[0].at));
  const d=await snapshot();
  assert.deepEqual([d.master.characters,d.master.forms,d.units,d.suits],[[],[],[],[]],'not counted as owned anywhere');
  assert.equal(await page.inputValue('#srText'),'');assert.equal(await page.locator('#srEdit').isVisible(),false);
  assert.equal(await pendRows().count(),1);
  const row=(await pendRows().first().textContent()).replace(/\s+/g,' ');
  assert.match(row,/架空キャラ壱.*端末未選択・実：同族の絆・加撃 特級L、将命削り 特級L・要確認/);
  assert.match(await page.locator('#srPendingList').textContent(),/所持数やステージの所持判定には入りません/);
  await page.reload();assert.equal((await pend()).length,1,'kept after reload');
});

test('resume → choose device + type 進化形態 → register: the pending entry is removed only on success', async()=>{
  await seed({characters:[],master:{characters:[],forms:[]},units:[],pendingReadings:[P(1,{characterName:'架空キャラ漆',fruits:[{name:'加撃の実',grade:'特級M'}],needsReview:false,confidence:'HIGH'}),P(2)]});
  await click('[data-act="view"][data-view="admin"]');
  assert.equal(await pendRows().count(),2);
  await click('[data-act="srResume"][data-id="p1"]');
  assert.match(await msg(),/保留から再開しました：架空キャラ漆。/);
  assert.equal(await page.locator('#srResumeNote').isVisible(),true);
  assert.equal(await val('srF_characterName'),'架空キャラ漆');assert.equal(await val('srDevice'),'');
  assert.deepEqual([await val('srFr1Name'),await val('srFr1Grade')],['加撃の実','特級M'],'held fruits come back as they were');
  assert.equal(await page.locator('#srNeedsReview').isChecked(),false);
  assert.equal(await page.locator('.pendRow.cur').getAttribute('data-pend'),'p1');
  // 確認画面を出しただけでは保留は消えない（進化形態は任意。ここでは分かったので入れて登録する）
  await toConfirm('サブ3');assert.match(await result(),/登録前の確認 架空キャラ漆 登録先/);
  assert.equal((await pend()).length,2);
  await openMore();await page.fill('#srF_formName','架空の形態・極');await click('[data-act="srCheck"]');
  assert.match(await result(),/登録先：サブ3・個体1/);
  await click('[data-act="srApply"]');
  assert.match(await msg(),/登録しました：サブ3 架空キャラ漆｜架空の形態・極 個体1（確認済み）。この読み取りの保留を一覧から消しました/);
  assert.deepEqual((await pend()).map(x=>x.id),['p2'],'only the resumed entry is removed');
  const u=unitsOf(await snapshot(),'架空キャラ漆');assert.equal(u.length,1);assert.equal(u[0].device,'サブ3');
  assert.deepEqual(u[0].fruits,[{name:'加撃の実',grade:'特級M',kind:''}]);
  assert.equal(await page.locator('#srEdit').isVisible(),false);
});

test('registration failure keeps the pending entry (blocked conflict and save failure)', async()=>{
  await seed({characters:[],master:{characters:[{id:'c1',name:'架空保留1'}],forms:[{id:'f1',characterId:'c1',name:'架空形態',short:'',race:'',battleType:'パワー型',shotType:''}]},
    units:[],pendingReadings:[P(1,{battleType:'バランス型'})]});
  await click('[data-act="view"][data-view="admin"]');
  await click('[data-act="srResume"][data-id="p1"]');
  await openMore();await page.fill('#srF_formName','架空形態');await toConfirm('メイン');
  assert.match(await result(),/戦型が既存（パワー型）と違います/);assert.equal(await page.locator('#srApply').isDisabled(),true);
  assert.equal((await pend()).length,1);
  // 一致させて登録 → 保存に失敗 → 個体も保留も元のまま
  await page.selectOption('#srF_battleType','パワー型');await click('[data-act="srCheck"]');
  const before=await snapshot();
  await page.evaluate(()=>{window.__p=persist;persist=()=>{throw new Error('quota')}});
  await click('[data-act="srApply"]');
  await page.evaluate(()=>{persist=window.__p});
  assert.match(await msg(),/登録前の状態に戻しました（保留はそのまま残っています）/);
  const d=await snapshot();assert.deepEqual([d.master,d.units,d.pendingReadings],[before.master,before.units,before.pendingReadings]);
  await page.reload();assert.deepEqual((await pend()).map(x=>x.id),['p1']);assert.deepEqual((await snapshot()).units,[]);
});

test('re-edit: holding a resumed entry updates that entry only (no new entry)', async()=>{
  await seed({characters:[],master:{characters:[],forms:[]},units:[],pendingReadings:[P(1),P(2)]});
  await click('[data-act="view"][data-view="admin"]');
  await click('[data-act="srResume"][data-id="p2"]');
  await page.selectOption('#srDevice','サブ5');await page.fill('#srF_race','架空族');await page.fill('#srFr1Name','後から入れた実');await page.selectOption('#srFr1Grade','特級');
  await click('[data-act="srHold"]');
  assert.match(await msg(),/保留を更新しました：架空保留2（2／200件）/);
  const p=await pend();assert.deepEqual(p.map(x=>x.id),['p1','p2']);
  assert.equal(p[1].device,'サブ5');assert.equal(p[1].race,'架空族');assert.deepEqual(p[1].fruits,[{name:'後から入れた実',grade:'特級'}]);
  assert.equal(p[1].at,'2026-10-09T10:00:00.000Z','original hold time kept');assert.ok(p[1].updatedAt);
  assert.deepEqual(p[0],P(1),'other entries untouched');
  assert.match(await pendRows().nth(1).textContent(),/サブ5/);
});

test('manual delete asks first; cancelling keeps it; registered data is never touched', async()=>{
  await seed({characters:[],master:{characters:[{id:'c1',name:'架空保留1'}],forms:[{id:'f1',characterId:'c1',name:'架空形態',short:'',race:'',battleType:'',shotType:''}]},
    units:[{id:'u1',formId:'f1',device:'メイン',no:1,fruits:[]}],pendingReadings:[P(1),P(2)]});
  await click('[data-act="view"][data-view="admin"]');
  const before=await snapshot();
  await page.evaluate(()=>{window.__c=window.confirm;window.confirm=m=>{window.__asked=m;return false}});
  await click('[data-act="srPendDel"][data-id="p1"]');
  assert.match(await page.evaluate(()=>window.__asked),/保留中の「架空保留1」を削除しますか？（登録済みの所持データは変わりません）/);
  assert.equal((await pend()).length,2,'cancel keeps it');
  await page.evaluate(()=>{window.confirm=window.__c});
  await click('[data-act="srPendDel"][data-id="p1"]');
  assert.match(await msg(),/保留を削除しました：架空保留1$/);
  const d=await snapshot();
  assert.deepEqual(d.pendingReadings.map(x=>x.id),['p2']);
  assert.deepEqual([d.master,d.units],[before.master,before.units],'characters / forms / units unchanged');
  await click('[data-act="srPendDel"][data-id="p2"]');assert.equal(await pendRows().count(),0);
});

test('duplicate hold of the same character: warned, then added as a separate entry (never merged)', async()=>{
  await seed({characters:[],master:{characters:[],forms:[]},units:[],pendingReadings:[P(1,{characterName:'架空キャラ壱',device:'メイン'})]});
  await preview({...READING,formName:null});
  await click('[data-act="srHold"]');
  assert.match(await msg(),/「架空キャラ壱」の保留がすでに1件あります（自動では統合・上書きしません）。別の保留として残す場合は、もう一度/);
  assert.equal((await pend()).length,1);
  await click('[data-act="srHold"]');
  const p=await pend();assert.equal(p.length,2);
  assert.deepEqual(p[0],P(1,{characterName:'架空キャラ壱',device:'メイン'}),'existing entry untouched');
  assert.notEqual(p[1].id,'p1');
});

test('200 limit: new holds stop at 200, nothing is deleted; updating an existing entry still works', async()=>{
  const list=Array.from({length:200},(_,i)=>P(i+1));
  await seed({characters:[],master:{characters:[],forms:[]},units:[],pendingReadings:list});
  await preview({...READING,formName:null});
  assert.equal(await page.locator('#srPendFull').isVisible(),true);
  assert.match(await page.locator('#srPendingList .invSec').textContent(),/200／200件/);
  await click('[data-act="srHold"]');
  assert.match(await msg(),/保留は200件までです。新しく保留するには、不要な保留を削除してください（自動では削除しません）/);
  const p=await pend();assert.equal(p.length,200);assert.deepEqual(p.map(x=>x.id),list.map(x=>x.id));
  await click('[data-act="srResume"][data-id="p7"]');await page.fill('#srF_race','架空族');await click('[data-act="srHold"]');
  assert.match(await msg(),/保留を更新しました/);assert.equal((await pend()).length,200);
  // 1件消せば、また保留できる
  await click('[data-act="srPendDel"][data-id="p200"]');
  await preview({...READING,formName:null});await click('[data-act="srHold"]');
  assert.match(await msg(),/保留しました.*（200／200件）/);
});

test('backup / restore keep pendingReadings; old data without it loads as empty; bad values are cleaned', async()=>{
  await seed({characters:[],master:{characters:[],forms:[]},units:[],pendingReadings:[P(1,{device:'サブ2',fruits:[{name:'加撃の実',grade:'特級L'}]}),P(2)]});
  const json=await page.evaluate(()=>backupJson());
  assert.deepEqual(JSON.parse(json).data.pendingReadings.map(x=>x.id),['p1','p2']);
  await seed({characters:[]});
  assert.deepEqual(await pend(),[],'old data without pendingReadings → empty list');
  await click('[data-act="view"][data-view="admin"]');await page.fill('#bkText',json);await click('[data-act="restore"]');
  let p=await pend();assert.deepEqual(p.map(x=>x.id),['p1','p2']);assert.equal(p[0].device,'サブ2');assert.deepEqual(p[0].fruits,[{name:'加撃の実',grade:'特級L'}]);
  assert.equal(await pendRows().count(),2);
  // 形の崩れた値は安全な値に直す（不明な端末・等級・戦型は空欄、重複IDは1件）。上限を超えていても切り捨てない
  const bad=[P(1,{device:'サブ9',battleType:'つよい型',fruits:[{name:'実',grade:'特L'},'x',{name:'',grade:''}],confidence:'SURE',uncertainFields:['race','bogus']}),P(1),'x',null,
    ...Array.from({length:5},(_,i)=>P(i+10))];
  await seed({characters:[],pendingReadings:bad});
  p=await pend();assert.equal(p.length,6);
  assert.deepEqual([p[0].device,p[0].battleType,p[0].fruits,p[0].confidence,p[0].uncertainFields],['','',[{name:'実',grade:''}],'LOW',['race']]);
  assert.equal(p.filter(x=>x.id==='p1').length,1);
});

test('a held reading is not shown as owned on the stage screen; a failed hold / delete save is rolled back', async()=>{
  // ステージ適正のある架空キャラ（メインに1体所持）。同じキャラ・同じ進化形態の読み取りを保留しても、所持は増えない
  await seed({characters:[],master:{characters:[{id:'c1',name:'架空キャラ壱'}],forms:[{id:'f1',characterId:'c1',name:'架空の形態・真',short:'',race:'',battleType:'',shotType:''}]},
    units:[{id:'u1',formId:'f1',device:'メイン',no:1,fruits:[]}],
    suits:[{id:'s1',stageKey:'禁忌の獄::一ノ獄',formId:'f1',source:'MANUAL',evaluationType:'CANDIDATE',verificationStatus:'VERIFIED'}],
    ui:{view:'stage',quest:'禁忌の獄',stage:{'禁忌の獄':'一ノ獄'}}});
  const stageBefore=await page.locator('#view-stage').innerHTML();
  await preview({...READING,needsReview:true});await page.selectOption('#srDevice','サブ1');
  await click('[data-act="srHold"]');
  assert.equal((await pend()).length,1);
  const d=await snapshot();assert.deepEqual(d.units,[{id:'u1',formId:'f1',device:'メイン',no:1,fruits:[],memo:''}]);
  await click('[data-act="view"][data-view="stage"]');
  assert.equal(await page.locator('#view-stage').innerHTML(),stageBefore,'stage screen (owned devices / counts) unchanged by the hold');
  // 保留の保存に失敗 → 保留前に戻る
  await preview({...READING,characterName:'架空キャラ弐'});
  await page.evaluate(()=>{window.__p=persist;persist=()=>{throw new Error('quota')}});
  await click('[data-act="srHold"]');
  assert.match(await msg(),/保留に失敗したため、保留前の状態に戻しました/);
  assert.equal((await pend()).length,1);
  // 削除の保存に失敗 → 元に戻る
  const id=(await pend())[0].id;
  await click(`[data-act="srPendDel"][data-id="${id}"]`);
  assert.match(await msg(),/削除に失敗したため、元に戻しました/);
  await page.evaluate(()=>{persist=window.__p});
  assert.equal((await pend()).length,1);
  await page.reload();assert.equal((await pend()).length,1);
});

// ===== 保留が上限（200件）を超えるデータ：黙って切り捨てない =====
const storedPend=()=>page.evaluate(key=>JSON.parse(Object.getPrototypeOf(localStorage).getItem.call(localStorage,key)).pendingReadings,KEY);
const backupWith=n=>JSON.stringify({app:'monst-character-manager-trial',version:1,data:{characters:[],master:{characters:[],forms:[]},units:[],
  pendingReadings:Array.from({length:n},(_,i)=>P(i+1,{characterName:'復元保留'+(i+1)}))}});

test('restore: a backup with more than 200 pending readings is refused before asking; current data is untouched', async()=>{
  await seed({characters:[],master:{characters:[{id:'c1',name:'既存の架空キャラ'}],forms:[]},units:[],pendingReadings:[P(1),P(2)]});
  const app=await page.evaluate(()=>APP);
  const json=backupWith(201).replace('monst-character-manager-trial',app);
  await click('[data-act="view"][data-view="admin"]'); // 画面の切り替えは表示状態を保存するので、その後を基準にする
  const before=await snapshot(), storedBefore=await page.evaluate(key=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,key),KEY);
  await page.evaluate(()=>{window.__asked=0;window.__c=window.confirm;window.confirm=m=>{window.__asked++;return true}});
  await page.fill('#bkText',json);await click('[data-act="restore"]');
  assert.match(await page.locator('#bkMsg').textContent(),/保留中の読み取りが201件あり、上限（200件）を超えているため復元を中止しました。現在のデータは変更していません/);
  assert.equal(await page.evaluate(()=>window.__asked),0,'stopped before the overwrite confirmation');
  const d=await snapshot();delete d.ui;delete before.ui;assert.deepEqual(d,before);
  assert.equal(await page.evaluate(key=>Object.getPrototypeOf(localStorage).getItem.call(localStorage,key),KEY),storedBefore,'saved data unchanged');
  // ちょうど200件なら復元できる
  await page.fill('#bkText',backupWith(200).replace('monst-character-manager-trial',app));await click('[data-act="restore"]');
  assert.match(await page.locator('#bkMsg').textContent(),/復元しました/);
  assert.equal((await pend()).length,200);assert.equal((await storedPend()).length,200);
  await page.evaluate(()=>{window.confirm=window.__c});
});

test('restore: a save failure leaves the current data as it was', async()=>{
  await seed({characters:[],master:{characters:[{id:'c1',name:'既存の架空キャラ'}],forms:[]},units:[],pendingReadings:[P(1)]});
  const app=await page.evaluate(()=>APP);
  const before=await snapshot();
  await click('[data-act="view"][data-view="admin"]');
  await page.fill('#bkText',backupWith(3).replace('monst-character-manager-trial',app));
  await page.evaluate(()=>{window.__p=persist;persist=()=>{throw new Error('quota')}});
  await click('[data-act="restore"]');
  await page.evaluate(()=>{persist=window.__p});
  assert.match(await page.locator('#bkMsg').textContent(),/復元に失敗したため、復元前の状態のままにしました/);
  const d=await snapshot();delete d.ui;delete before.ui;assert.deepEqual(d,before);
  await page.reload();assert.deepEqual((await pend()).map(x=>x.id),['p1']);
});

test('startup with more than 200 pending readings: all are kept (never truncated on save), a warning is shown, only new holds stop', async()=>{
  const list=Array.from({length:206},(_,i)=>P(i+1));
  await seed({characters:[],master:{characters:[],forms:[]},units:[],pendingReadings:list});
  assert.equal((await pend()).length,206,'nothing dropped on load');
  await click('[data-act="view"][data-view="admin"]'); // 画面の切り替えで保存が起きても、保留は全件のまま
  assert.equal((await storedPend()).length,206,'nothing dropped when saving');
  const warn=await page.locator('#srPendOver').textContent();
  assert.match(warn,/保留が上限（200件）を超えています（206件）。データは消していません。新しく保留するには、不要な保留を7件以上削除してください/);
  assert.match(await page.locator('#srPendingList .invSec').textContent(),/206／200件/);
  // 新しい保留だけ止まる
  await page.fill('#srText',JSON.stringify({...READING,formName:null}));await click('[data-act="srPreview"]');
  await click('[data-act="srHold"]');
  assert.match(await msg(),/保留は200件までです。新しく保留するには、不要な保留を7件以上削除してください（自動では削除しません）/);
  assert.equal((await storedPend()).length,206);
  // 再開・更新・登録・削除はできる（保存しても他の保留は消えない）
  await click('[data-act="srResume"][data-id="p3"]');await page.fill('#srF_race','架空族');await click('[data-act="srHold"]');
  assert.match(await msg(),/保留を更新しました/);
  let s=await storedPend();assert.equal(s.length,206);assert.equal(s.find(x=>x.id==='p3').race,'架空族');
  await click('[data-act="srResume"][data-id="p4"]');await openMore();await page.fill('#srF_formName','架空の形態・保');await toConfirm('サブ1');await click('[data-act="srApply"]');
  assert.match(await msg(),/登録しました：サブ1 架空保留4｜架空の形態・保/);
  s=await storedPend();assert.equal(s.length,205);assert.equal(s.some(x=>x.id==='p4'),false);
  await click('[data-act="srPendDel"][data-id="p206"]');
  s=await storedPend();assert.equal(s.length,204);
  assert.deepEqual(s.map(x=>x.id),list.map(x=>x.id).filter(id=>id!=='p4'&&id!=='p206'),'the rest is kept in order');
  // バックアップにも全件入る
  assert.equal(JSON.parse(await page.evaluate(()=>backupJson())).data.pendingReadings.length,204);
});
