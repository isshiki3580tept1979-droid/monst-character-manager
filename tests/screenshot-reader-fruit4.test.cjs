// v30 工程1：スクショ読取ツールの わくわくの実4枠対応（Code.js / Index.html）。Gemini とは通信しない（Apps Script と google.script はモック）。
const {test,before,after,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const http=require('node:http');
const {chromium}=require('playwright');
const DIR=path.join(__dirname,'..','モンスト スクショ読取');
const SRC=fs.readFileSync(path.join(DIR,'Code.js'),'utf8');
const KEY='TEST-KEY-should-never-leak-0123456789';
const IMG={base64Data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',mimeType:'image/png'};
// 架空キャラ（リンネ No.8929・ネオ No.8570 の報告を参考にした4個の実。キャラ名は架空）
const FOUR=['速必殺の力 特級EL','兵命削りの力 特級EL','将命削りの力 特級EL','熱き友撃の力 特級EL'];
const GOOD4={characterName:'架空リンネ',formName:'架空の形態',monsterNo:'99301',race:'神',battleType:'バランス型',shotType:'貫通',
  fruit1:FOUR[0],fruit2:FOUR[1],fruit3:FOUR[2],fruit4:FOUR[3],confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[]};
const gemini=obj=>({code:200,body:JSON.stringify({candidates:[{content:{parts:[{text:typeof obj==='string'?obj:JSON.stringify(obj)}]},finishReason:'STOP'}]})});
function load(responses=[]){
  const calls=[];
  const sb={PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='GEMINI_API_KEY'?KEY:null})},
    UrlFetchApp:{fetch:(url,options)=>{calls.push({url,options});const r=responses.shift();if(!r)throw new Error('unexpected fetch');return {getResponseCode:()=>r.code,getContentText:()=>r.body}}},
    Utilities:{sleep:()=>{}},Logger:{log:()=>{}},console:{log:()=>{},error:()=>{}},Date,JSON,encodeURIComponent,isFinite,String,Object,Array};
  vm.createContext(sb);vm.runInContext(SRC,sb);
  return {sb,calls,read:p=>JSON.parse(JSON.stringify(sb.msrReadScreenshot(p)))};
}
const body=t=>JSON.parse(t.calls[0].options.payload);

test('Gemini request: the schema has fruit4 (nullable), the order is fruit1→fruit4, uncertainFields accepts fruit4', ()=>{
  const t=load([gemini(GOOD4)]);t.read(IMG);
  const s=body(t).generationConfig.responseSchema;
  assert.deepEqual(s.propertyOrdering.slice(6,10),['fruit1','fruit2','fruit3','fruit4']);
  assert.equal(s.properties.fruit4.type,'STRING');assert.equal(s.properties.fruit4.nullable,true);
  assert.match(s.properties.fruit4.description,/わくわくの実4/);
  assert.ok(s.properties.uncertainFields.items.enum.includes('fruit4'));
  for(const k of ['fruit1','fruit2','fruit3']) assert.ok(s.required.includes(k),k+' stays required');
});

test('Gemini prompt (1 image and 2 images): fruit1〜fruit4, still "only what is shown", empty slots null', ()=>{
  for(const [name,src] of [['single','MSR_PROMPT'],['pair','MSR_PROMPT_PAIR']]){
    const p=vm.runInContext(src,load().sb);
    assert.match(p,/fruit1〜fruit4/,name);assert.doesNotMatch(p,/fruit1〜fruit3/,name);
    assert.match(p,/画像に表示されている実だけ/,name);assert.match(p,/実が見えない枠は null/,name);
    assert.match(p,/推測/,name);
  }
});

test('4 fruits survive normalization unchanged and in order (names and grades are not rewritten)', ()=>{
  const r=load([gemini(GOOD4)]).read(IMG);
  assert.equal(r.ok,true);
  assert.deepEqual([r.reading.fruit1,r.reading.fruit2,r.reading.fruit3,r.reading.fruit4],FOUR);
  assert.equal(r.reading.needsReview,false);assert.deepEqual(r.reading.reviewNotes,[]);
  assert.deepEqual(Object.keys(r.reading).sort(),['format','characterName','formName','monsterNo','race','battleType','shotType','fruit1','fruit2','fruit3','fruit4','confidence','needsReview','reviewNotes','uncertainFields'].sort());
});

test('fruit4 is optional: null / missing / blank → null and NOT a reason for review; 0〜3 fruits behave as before', ()=>{
  const {fruit4,...no4}=GOOD4;
  for(const [label,resp] of [['missing',no4],['null',{...GOOD4,fruit4:null}],['blank',{...GOOD4,fruit4:'  '}],['"null"',{...GOOD4,fruit4:'null'}]]){
    const r=load([gemini(resp)]).read(IMG).reading;
    assert.equal(r.fruit4,null,label);assert.equal(r.needsReview,false,label+': no review forced');assert.deepEqual(r.reviewNotes,[],label+': no note');
    assert.deepEqual([r.fruit1,r.fruit2,r.fruit3],FOUR.slice(0,3),label);
  }
  for(const n of [0,1,2,3]){
    const o={...no4};FOUR.slice(0,3).forEach((f,i)=>{o['fruit'+(i+1)]=i<n?f:null});
    const r=load([gemini(o)]).read(IMG).reading;
    assert.equal(r.fruit4,null);assert.equal(r.needsReview,false,n+' fruits');
    FOUR.slice(0,3).forEach((f,i)=>assert.equal(r['fruit'+(i+1)],i<n?f:null));
  }
  // fruit1〜3 が回答に無い場合は従来どおり要確認にする
  const {fruit2,...miss2}=no4;
  const r=load([gemini(miss2)]).read(IMG).reading;
  assert.equal(r.needsReview,true);assert.ok(r.reviewNotes.some(n=>n.includes('わくわくの実2が回答にありません')));
});

test('fruit4 with a wrong type is not coerced: null + review (same rule as the other fields); uncertain fruit4 is kept; unknown keys (fruit5) are dropped', ()=>{
  const r=load([gemini({...GOOD4,fruit4:42,fruit5:'余分の実 特級L'})]).read(IMG).reading;
  assert.equal(r.fruit4,null);assert.equal(r.needsReview,true);assert.ok(r.reviewNotes.some(n=>n.includes('わくわくの実4の形式が正しくありません')));
  assert.equal('fruit5' in r,false);
  const u=load([gemini({...GOOD4,uncertainFields:['fruit4','bogus']})]).read(IMG).reading;
  assert.deepEqual(u.uncertainFields,['fruit4']);assert.equal(u.needsReview,true);
});

test('two images: the pair request also has fruit4 and the result keeps 4 fruits', ()=>{
  const t=load([gemini({...GOOD4,sameCharacter:'YES',image1CharacterName:'架空リンネ',image1MonsterNo:'99301',image2CharacterName:'架空リンネ',image2MonsterNo:'99301'})]);
  const r=t.read({images:[IMG,IMG]});
  assert.equal(r.ok,true);assert.deepEqual([r.reading.fruit1,r.reading.fruit2,r.reading.fruit3,r.reading.fruit4],FOUR);
  const s=body(t).generationConfig.responseSchema;
  assert.ok(s.properties.fruit4);assert.ok(s.required.includes('sameCharacter'));
});

// ---------- 画面（Index.html） ----------
let browser,server,url,context,page,errors;
const MOCK=`window.google={script:{run:(function(){function mk(s,f){return {withSuccessHandler:h=>mk(h,f),withFailureHandler:h=>mk(s,h),msrReadScreenshot:p=>{}}}return mk(()=>{},()=>{})})()}};`;
before(async()=>{
  server=http.createServer((req,res)=>{if(req.url!=='/'){res.writeHead(404);res.end();return}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(DIR,'Index.html')))});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${server.address().port}/`;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r))});
beforeEach(async()=>{
  context=await browser.newContext({viewport:{width:390,height:844}});await context.addInitScript(MOCK);
  page=await context.newPage();errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(url);
});
afterEach(async()=>{assert.deepEqual(errors,[]);await context.close()});
const copyData=()=>page.evaluate(()=>MSR.buildCopyData());

test('screen: a 4th fruit input exists, shows fruit4, can be edited, and is copied in order', async()=>{
  await page.evaluate(r=>MSR.renderReading(r,'m'),{format:'monst-screenshot-reading-v1',...GOOD4});
  assert.deepEqual(await page.$$eval('#fields input',els=>els.map(e=>e.id)),['f_characterName','f_formName','f_monsterNo','f_race','f_battleType','f_shotType','f_fruit1','f_fruit2','f_fruit3','f_fruit4']);
  assert.match(await page.locator('label.f:has(#f_fruit4)').textContent(),/わくわくの実4/);
  assert.equal(await page.inputValue('#f_fruit4'),FOUR[3]);
  await page.fill('#f_fruit4','熱き友撃の力 特級M');
  const d=await copyData();
  assert.deepEqual(Object.keys(d),['format','characterName','formName','monsterNo','race','battleType','shotType','fruit1','fruit2','fruit3','fruit4','confidence','needsReview','reviewNotes','uncertainFields']);
  assert.deepEqual([d.fruit1,d.fruit2,d.fruit3,d.fruit4],[FOUR[0],FOUR[1],FOUR[2],'熱き友撃の力 特級M']);
  assert.equal(JSON.parse(await page.inputValue('#jsonOut')).fruit4,'熱き友撃の力 特級M','copy text follows the edit');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal scroll at 390px');
});

test('screen: a reading without fruit4 (old shape) renders an empty 4th input, copies fruit4 as null, and is not flagged', async()=>{
  const {fruit4,...old}=GOOD4;
  await page.evaluate(r=>MSR.renderReading(r,'m'),{format:'monst-screenshot-reading-v1',...old,fruit3:null});
  assert.equal(await page.inputValue('#f_fruit4'),'');
  const d=await copyData();assert.equal(d.fruit4,null);assert.equal(d.fruit3,null);assert.equal(d.needsReview,false);
  assert.equal(await page.locator('label.f.uncertain').count(),0);
  await page.evaluate(r=>MSR.renderReading(r,'m'),{format:'monst-screenshot-reading-v1',...GOOD4,uncertainFields:['fruit4','fruit1'],needsReview:true});
  assert.deepEqual(await page.$$eval('label.f.uncertain input',els=>els.map(e=>e.id)),['f_fruit1','f_fruit4']);
  assert.deepEqual((await copyData()).uncertainFields,['fruit4','fruit1']);
});

test('screen: the 4th fruit input stays inside the screen without horizontal scroll at 390px and 360px', async()=>{
  for(const w of [390,360]){
    await page.setViewportSize({width:w,height:800});
    await page.evaluate(r=>MSR.renderReading(r,'m'),{format:'monst-screenshot-reading-v1',...GOOD4,fruit4:'撃種の絆・加撃速命 特級EL'});
    const m=await page.evaluate(()=>{const r=document.getElementById('f_fruit4').getBoundingClientRect();return {inside:r.left>=0&&r.right<=innerWidth&&r.height>=36,hscroll:document.documentElement.scrollWidth>innerWidth}});
    assert.deepEqual(m,{inside:true,hscroll:false},w+'px');
  }
});
