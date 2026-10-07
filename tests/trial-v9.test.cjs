// Round 7: link the owned units to 破界の星墓 suitability via the curated safe-link JSON (importReady only).
// Conversion → existing suitability import preview → (temporary profile only) import → stage candidates.
const {test,before,after,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const {convertSuitLinks}=require('./suit-links-convert.cjs');
const source=path.resolve(process.env.TRIAL_HTML_SOURCE||path.join(__dirname,'..','monst_character_manager_trial.html'));
const FX=name=>fs.readFileSync(path.join(__dirname,'fixtures',name),'utf8');
const STAGING=FX('hakai_main_staging_2026-10-07.json');
const LINKS=JSON.parse(FX('hakai_owned_suit_links_staging_2026-10-07.json'));
const REFERENCE=JSON.parse(FX('hakai_gamewith_sa_reference_2026-10-07.json'));
const SUITS=FX('hakai_gamewith_suits_import_2026-10-07.json');
const KEY='monst-character-manager-trial-v2';
const HAKAI_STAGES=eval('['+fs.readFileSync(source,'utf8').match(/id:'破界の星墓'[\s\S]*?stages:\[([\s\S]*?)\]/)[1]+']');
const EXPECTED=[
  ['ニギミタマ','乙骨憂太','現代の異能','S'],['ニギミタマ','sinギルティ','赦罪','A'],['ニギミタマ','マスター・コーヴ','死闘に挑む森羅万象流武術師範','A'],
  ['桃源郷','風火輪α','波間を駆け抜けし真夏の宝貝','S'],['桃源郷','ニケ','ビクトリアス・フォーム','A'],
  ['コキュートス','自来也','ガマ仙人','S'],['コキュートス','めぐみん','爆裂魔法を操る者','S'],
  ['パラノヴィア','マサムネ','約束の焔刃','A']];
let browser,server,url,context,page,errors;
before(async()=>{
  server=http.createServer((req,res)=>{if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(source));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
beforeEach(async()=>{
  context=await browser.newContext({viewport:{width:390,height:844}});page=await context.newPage();errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(url);
  page.on('dialog',d=>d.accept());
});
afterEach(async()=>{assert.deepEqual(errors,[],'no console or JavaScript errors');await context.close();});
const click=async selector=>page.locator(selector).first().click();
const owned=()=>page.evaluate(()=>JSON.stringify({c:db.master.characters,f:db.master.forms,u:db.units,o:db.ownershipChecks}));
async function importInventory(){
  await click('[data-act="view"][data-view="admin"]');
  await page.fill('#invText',STAGING);await click('[data-act="invPreview"]');await click('[data-act="invApply"]');
}
async function previewSuits(text=SUITS){await page.fill('#imText',text);await click('[data-act="imPreview"]')}
const planRows=()=>page.evaluate(()=>{
  const p=pendingSuitImport.plan,row=(it,cls)=>{const f=formOf(it.formId),c=charOf(f.characterId);
    return [cls,it.stageKey,c.name,f.name,it.evaluationType,it.grade,it.source,it.verificationStatus,it.sourceUrl,it.sourceUpdatedAt]};
  return {add:p.add.map(x=>row(x,'add')),update:p.update.length,same:p.same.length,issues:p.issues.map(x=>[x.characterName,x.formName,x.reason])};
});
async function candidates(stage,dev='メイン'){
  await page.evaluate(({s,dev})=>{db.ui.view='stage';db.ui.quest='破界の星墓';db.ui.stage['破界の星墓']=s;db.useDevs['破界の星墓::'+s]=[dev];render()},{s:stage,dev});
  return page.evaluate(({s,dev})=>candidatesFor('破界の星墓::'+s,dev).map(u=>{const f=formOf(u.formId);return charOf(f.characterId).name+'｜'+f.name}),{s:stage,dev});
}

test('conversion: importReady only, 8 entries, GameWith S/A grades kept as VERIFIED', ()=>{
  const out=convertSuitLinks(LINKS,REFERENCE,HAKAI_STAGES);
  assert.deepEqual(out,JSON.parse(SUITS),'fixture is exactly the converter output');
  assert.equal(LINKS.importReady.length,8);assert.equal(LINKS.needsReview.length,2);assert.equal(LINKS.doNotLink.length,2);
  const rows=out.flatMap(b=>b.entries.map(e=>[b.stageKey.split('::')[1],e.characterName,e.formName,e.grade]));
  assert.deepEqual(rows,EXPECTED);
  for(const b of out){
    assert.equal(b.format,'monst-suitability-import-v1');assert.equal(b.source,'GAMEWITH');assert.equal(b.evaluationType,'GRADE');
    assert.ok(HAKAI_STAGES.includes(b.stageKey.split('::')[1]));assert.match(b.sourceUrl,/^https:\/\/xn--eckwa2aa3a9c8j8bve9d\.gamewith\.jp\/article\/show\/\d+$/);
    for(const e of b.entries){assert.equal(e.verificationStatus,'VERIFIED');assert.ok(['S','A'].includes(e.grade));assert.equal(e.rank,undefined)}
  }
  const names=rows.map(r=>r[1]);
  for(const n of ['物干し竿','ネオ','春野サクラ','チェンソーマン＆ビーム','桜']) assert.ok(!names.includes(n),n+' is not linked');
  assert.equal(out.find(b=>b.stageKey.endsWith('桃源郷')).sourceUpdatedAt,undefined,'no updated date when the reference has none');
});

test('conversion refuses anything not explicitly listed in the reference (no name guessing)', ()=>{
  const bad=e=>({...LINKS,importReady:[{...LINKS.importReady[0],...e}]});
  // 春野サクラ ≠ GameWith「桜」: a 春野サクラ label does not exist in パラノヴィア
  assert.throws(()=>convertSuitLinks(bad({stageKeyHint:'パラノヴィア',characterName:'春野サクラ',formName:'戦場に咲く豪拳',sourceCharacterLabel:'春野サクラ',sourceFormLabel:null,grade:'A',sourceUrl:REFERENCE.stages.find(s=>s.stageKeyHint==='パラノヴィア').sourceUrl}),REFERENCE,HAKAI_STAGES),/not in reference/);
  // GameWith label variants are not normalised: "マスター・コーヴ" is not the GameWith label "マスターコーヴ"
  assert.throws(()=>convertSuitLinks(bad({characterName:'マスター・コーヴ',sourceCharacterLabel:'マスター・コーヴ',grade:'A'}),REFERENCE,HAKAI_STAGES),/not in reference/);
  // wrong grade, wrong url, unknown stage spelling
  assert.throws(()=>convertSuitLinks(bad({grade:'A'}),REFERENCE,HAKAI_STAGES),/not in reference/);
  assert.throws(()=>convertSuitLinks(bad({sourceUrl:'https://example.com/x'}),REFERENCE,HAKAI_STAGES),/sourceUrl/);
  assert.throws(()=>convertSuitLinks(bad({stageKeyHint:'ティルナノーグ'}),REFERENCE,HAKAI_STAGES),/unknown stage/);
  // needsReview / doNotLink sections are ignored even if they look complete
  const extra={...LINKS,importReady:[],needsReview:LINKS.needsReview.map(x=>({...x,formName:x.currentOwnedFormName,verificationStatus:'VERIFIED'}))};
  assert.deepEqual(convertSuitLinks(extra,REFERENCE,HAKAI_STAGES),[]);
});

test('preview: 8 new, nothing saved, owned data untouched', async()=>{
  await importInventory();
  const ownedBefore=await owned(), stored=await page.evaluate(k=>localStorage.getItem(k),KEY);
  await previewSuits();
  const r=await planRows();
  assert.deepEqual(r.add.map(x=>[x[1].split('::')[1],x[2],x[3],x[5]]),EXPECTED);
  for(const x of r.add){assert.equal(x[4],'GRADE');assert.equal(x[6],'GAMEWITH');assert.equal(x[7],'VERIFIED');assert.ok(x[8])}
  assert.deepEqual([r.add.length,r.update,r.same,r.issues.length],[8,0,0,0]);
  const text=(await page.locator('#imResult').textContent()).replace(/\s+/g,' ');
  assert.match(text,/追加 8件／更新 0件／変更なし 0件／要確認（取り込まない） 0件/);
  assert.equal(await page.locator('#imApply').isDisabled(),false);
  assert.equal(await page.evaluate(()=>db.suits.length),0,'preview saves nothing');
  assert.equal(await page.evaluate(k=>localStorage.getItem(k),KEY),stored,'storage unchanged by preview');
  assert.equal(await owned(),ownedBefore);
});

test('after import (temporary profile): only the linked units become stage candidates', async()=>{
  await importInventory();
  const ownedBefore=await owned();
  for(const [s] of EXPECTED) assert.deepEqual(await candidates(s),[],'no candidates before suits');
  await click('[data-act="view"][data-view="admin"]');await previewSuits();await click('[data-act="imApply"]');
  assert.equal(await owned(),ownedBefore,'characters / forms / units / ownershipChecks unchanged');
  const suits=await page.evaluate(()=>db.suits.map(s=>[s.source,s.evaluationType,s.grade,s.rank,s.verificationStatus]));
  assert.equal(suits.length,8);
  for(const s of suits){assert.equal(s[0],'GAMEWITH');assert.equal(s[1],'GRADE');assert.ok(['S','A'].includes(s[2]));assert.equal(s[3],null);assert.equal(s[4],'VERIFIED')}
  const c={};for(const s of ['ニギミタマ','桃源郷','コキュートス','パラノヴィア','アヴァロン']) c[s]=(await candidates(s)).sort();
  assert.deepEqual(c,{
    'ニギミタマ':['sinギルティ｜赦罪','マスター・コーヴ｜死闘に挑む森羅万象流武術師範','乙骨憂太｜現代の異能'].sort(),
    '桃源郷':['ニケ｜ビクトリアス・フォーム','風火輪α｜波間を駆け抜けし真夏の宝貝'].sort(),
    'コキュートス':['めぐみん｜爆裂魔法を操る者','自来也｜ガマ仙人'].sort(),
    'パラノヴィア':['マサムネ｜約束の焔刃'],
    'アヴァロン':[]});
  // owned but unlinked units stay out: 物干し竿 (form-name review), ニケ グロリアス (other form), 春野サクラ (≠ 桜)
  const ownedNames=await page.evaluate(()=>db.units.filter(u=>u.device==='メイン').map(u=>{const f=formOf(u.formId);return charOf(f.characterId).name+'｜'+f.name}).join('/'));
  for(const n of ['物干し竿｜巌流の斬妻を支えし大学物干し竿','ニケ｜グロリアス・フォーム','春野サクラ｜戦場に咲く豪拳']) assert.ok(ownedNames.includes(n),n+' is owned on メイン');
  const all=Object.values(c).flat().join('/');
  for(const n of ['物干し竿','グロリアス','春野サクラ','チェンソーマン']) assert.ok(!all.includes(n),n);
  for(const d of ['サブ1','サブ2']) assert.deepEqual(await candidates('ニギミタマ',d),[],'other devices have no candidates');
  // re-import is a no-op
  await click('[data-act="view"][data-view="admin"]');await previewSuits();
  const again=await planRows();assert.deepEqual([again.add.length,again.update,again.same,again.issues.length],[0,0,8,0]);
});

test('app import never links 物干し竿 / ネオ / 桜 by reference names', async()=>{
  await importInventory();
  const ownedBefore=await owned();
  const block=(stage,entries)=>({format:'monst-suitability-import-v1',stageKey:'破界の星墓::'+stage,source:'GAMEWITH',evaluationType:'GRADE',entries});
  const text=JSON.stringify([
    block('ニギミタマ',[{characterName:'物干し竿',formName:'巌流の新妻を支えし大太刀 物干し竿',grade:'A',verificationStatus:'VERIFIED'},{characterName:'物干し竿',grade:'A'}]),
    block('パラノヴィア',[{characterName:'ネオ',formName:'獣神化改',grade:'A'},{characterName:'桜',formName:'戦場に咲く豪拳',grade:'A'}])]);
  await previewSuits(text);
  const r=await planRows();
  assert.equal(r.add.length,0);
  assert.deepEqual(r.issues.map(x=>x[0]+':'+x[2]),[
    '物干し竿:進化形態が一致しません（正式名・短縮名と完全一致のみ）','物干し竿:進化形態の指定がありません（キャラ名だけでは紐づけません）',
    'ネオ:未登録のキャラ（自動では作成しません）','桜:未登録のキャラ（自動では作成しません）']);
  assert.equal(await owned(),ownedBefore);
});
