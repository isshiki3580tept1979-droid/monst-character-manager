// スクショ読取ツール（試作）の画面 Index.html を、google.script.run のモックで確認する。Gemini とは通信しない。
const {test,before,after,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const source=path.join(__dirname,'..','モンスト スクショ読取','Index.html');
const READING={format:'monst-screenshot-reading-v1',characterName:'自来也',formName:'ガマ仙人',monsterNo:'1234',race:null,battleType:'バランス型',shotType:'反射',
  fruit1:'同族の絆・加撃 特L',fruit2:null,fruit3:null,confidence:'MEDIUM',needsReview:true,reviewNotes:['種族の表示が隠れている'],uncertainFields:['race','fruit1']};
const MOCK=`window.__calls=[];window.__next=null;
window.google={script:{run:(function(){function mk(s,f){return {withSuccessHandler:h=>mk(h,f),withFailureHandler:h=>mk(s,h),
  msrReadScreenshot:p=>{window.__calls.push(p);const r=window.__next;const go=()=>r&&r.fail?f(new Error(r.fail)):s(r);if(window.__hold)window.__release=go;else setTimeout(go,30)}}}return mk(()=>{},()=>{})})()}};`;
let browser,server,url,context,page,errors;
before(async()=>{
  server=http.createServer((req,res)=>{if(req.url!=='/'){res.writeHead(404);res.end();return}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(source));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${server.address().port}/`;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
beforeEach(async()=>{
  context=await browser.newContext({viewport:{width:390,height:844}});
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:url.slice(0,-1)});
  await context.addInitScript(MOCK);
  page=await context.newPage();errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(url);
});
afterEach(async()=>{assert.deepEqual(errors,[]);await context.close();});
// ブラウザ内で画像ファイルを作る（PNG）
const makePng=(w,h,color='#3a6')=>page.evaluate(({w,h,color})=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,w,h);
  return c.toDataURL('image/png').split(',')[1]},{w,h,color}).then(b=>Buffer.from(b,'base64'));
const png=async(name,w=300,h=600,color)=>({name,mimeType:'image/png',buffer:await makePng(w,h,color)});
// 1キャラ＝スクショ2枚：1回の選択で2枚を渡す
async function choose(w=300,h=600,w2=w,h2=h){
  await page.setInputFiles('#file',[await png('shot1.png',w,h,'#3a6'),await png('shot2.png',w2,h2,'#a36')]);
  await page.waitForFunction(()=>!document.getElementById('readBtn').disabled);
}
const sent=()=>page.evaluate(()=>window.__calls);

test('2. without images the read button is disabled and nothing is sent', async()=>{
  assert.equal(await page.locator('#file').getAttribute('multiple'),'','file input accepts several images at once');
  assert.equal(await page.locator('#readBtn').isDisabled(),true);
  await page.evaluate(()=>MSR.read());
  assert.deepEqual(await sent(),[]);
  assert.match(await page.locator('#error').textContent(),/2枚選んでください/);
  assert.equal(await page.locator('#result').isVisible(),false);
});

test('two images: both are previewed (画像1 / 画像2) and sent together in ONE call', async()=>{
  await choose(300,600,1200,4000);
  assert.equal(await page.locator('#previews').isVisible(),true);
  for(const n of [1,2]){
    assert.equal(await page.locator('#preview'+n).isVisible(),true,'preview '+n);
    assert.equal((await page.locator('#pv'+n+' figcaption').textContent()).trim(),'画像'+n);
  }
  assert.match(await page.locator('#imageInfo1').textContent(),/300×600（image\/png/);
  assert.match(await page.locator('#imageInfo2').textContent(),/600×2000（image\/jpeg/,'large image is downscaled to JPEG');
  assert.match(await page.locator('#imageInfo').textContent(),/2枚/);
  await page.evaluate(r=>{window.__next={ok:true,reading:r,model:'gemini-test'}},READING);
  await page.click('#readBtn');
  await page.waitForSelector('#result:not(.hidden)');
  const c=await sent();assert.equal(c.length,1,'one call for the pair');
  assert.deepEqual(Object.keys(c[0]),['images']);assert.equal(c[0].images.length,2);
  for(const im of c[0].images) assert.deepEqual(Object.keys(im).sort(),['base64Data','mimeType']);
  assert.equal(c[0].images[0].mimeType,'image/png','small PNG passes through');
  assert.equal(c[0].images[1].mimeType,'image/jpeg');assert.ok(c[0].images[1].base64Data.startsWith('/9j/'),'JPEG data');
  assert.notEqual(c[0].images[0].base64Data,c[0].images[1].base64Data);
});

test('one image or three+ images cannot be read; non-image files are rejected', async()=>{
  await page.setInputFiles('#file',[await png('only.png')]);
  await page.waitForFunction(()=>!document.getElementById('error').classList.contains('hidden'));
  assert.match(await page.locator('#error').textContent(),/1枚しか選ばれていません/);
  assert.equal(await page.locator('#readBtn').isDisabled(),true);
  await page.evaluate(()=>MSR.read());assert.deepEqual(await sent(),[]);
  await page.setInputFiles('#file',[await png('a.png'),await png('b.png'),await png('c.png')]);
  await page.waitForFunction(()=>/3枚選ばれています/.test(document.getElementById('error').textContent));
  assert.equal(await page.locator('#readBtn').isDisabled(),true);assert.equal(await page.locator('#previews').isVisible(),false);
  await page.setInputFiles('#file',[await png('a.png'),{name:'memo.txt',mimeType:'text/plain',buffer:Buffer.from('hello')}]);
  await page.waitForFunction(()=>/画像2は画像ファイルではありません/.test(document.getElementById('error').textContent));
  assert.equal(await page.locator('#readBtn').isDisabled(),true);
  // a broken "image" cannot be opened → error, still disabled
  await page.setInputFiles('#file',[await png('a.png'),{name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not really a png')}]);
  await page.waitForFunction(()=>/画像2：画像を開けませんでした/.test(document.getElementById('error').textContent));
  assert.equal(await page.locator('#readBtn').isDisabled(),true);
  // choosing a proper pair afterwards works
  await choose();assert.equal(await page.locator('#error').isVisible(),false);
  assert.deepEqual(await sent(),[]);
});

test('different characters: warning is shown and no result is confirmed', async()=>{
  await choose();
  await page.evaluate(()=>{window.__next={ok:false,code:'CHARACTER_MISMATCH',error:'2枚が同じキャラクターではない可能性があります。同じキャラのスクショを2枚選び直してください',
    mismatch:{reasons:['図鑑No.が違います（画像1：1234／画像2：5678）'],image1:{characterName:'自来也',monsterNo:'1234'},image2:{characterName:'<b>ナルト</b>',monsterNo:'5678'}}}});
  await page.click('#readBtn');await page.waitForSelector('#error:not(.hidden)');
  const e=await page.locator('#error').textContent();
  assert.match(e,/2枚が同じキャラクターではない可能性があります/);assert.match(e,/図鑑No\.が違います/);
  assert.match(e,/画像1：自来也（図鑑No\.1234）/);assert.match(e,/画像2：<b>ナルト<\/b>（図鑑No\.5678）/,'shown as text, not HTML');
  assert.equal(await page.locator('#error b').count(),0);
  assert.equal(await page.locator('#result').isVisible(),false);
  assert.equal(await page.locator('#readBtn').isDisabled(),false,'can retry after finishing');
});

test('7. needsReview / uncertain fields / nulls are shown; reading-in-progress is shown', async()=>{
  await choose();
  await page.evaluate(r=>{window.__next={ok:true,reading:r,model:'gemini-test'};window.__hold=true},READING);
  await page.click('#readBtn');
  assert.match(await page.locator('#status').textContent(),/読み取り中/);
  assert.equal(await page.locator('#readBtn').isDisabled(),true,'no double send while reading');
  await page.evaluate(()=>window.__release());
  await page.waitForSelector('#result:not(.hidden)');
  const banner=page.locator('#reviewBanner');
  assert.match(await banner.textContent(),/要確認（NEEDS_REVIEW）/);assert.equal(await banner.getAttribute('class'),'needs');
  assert.equal(await page.locator('#needsReview').isChecked(),true);
  assert.equal(await page.locator('#confidence').textContent(),'MEDIUM');
  assert.equal(await page.inputValue('#f_characterName'),'自来也');
  assert.equal(await page.inputValue('#f_race'),'','null shows as empty');
  const uncertain=await page.$$eval('label.f.uncertain input',els=>els.map(e=>e.id));
  assert.deepEqual(uncertain,['f_race','f_fruit1']);
  assert.equal(await page.inputValue('#reviewNotes'),'種族の表示が隠れている');
  // not needing review
  await page.evaluate(r=>MSR.renderReading({...r,needsReview:false,confidence:'HIGH',uncertainFields:[]},'m'),READING);
  assert.equal(await banner.getAttribute('class'),'ok');assert.doesNotMatch(await banner.textContent(),/NEEDS_REVIEW/);
});

test('8. copy JSON: edited values, empty → null, and no image / base64 / model / key', async()=>{
  await choose();
  await page.evaluate(r=>{window.__next={ok:true,reading:r,model:'gemini-secret-model-name'}},READING);
  await page.click('#readBtn');await page.waitForSelector('#result:not(.hidden)');
  await page.fill('#f_race','亜人');await page.fill('#f_characterName','  ');
  await page.click('#copyBtn');
  await page.waitForFunction(()=>document.getElementById('copyMsg').textContent==='コピーしました');
  const copied=(await page.evaluate(()=>navigator.clipboard.readText())).split(String.fromCharCode(13)).join(''); // Windows のクリップボードは改行を CRLF にする
  const data=JSON.parse(copied);
  assert.deepEqual(Object.keys(data),['format','characterName','formName','monsterNo','race','battleType','shotType','fruit1','fruit2','fruit3','fruit4','confidence','needsReview','reviewNotes','uncertainFields']);
  assert.equal(data.race,'亜人');assert.equal(data.characterName,null);assert.equal(data.fruit2,null);assert.equal(data.needsReview,true);
  const b64=(await sent())[0].images[1].base64Data;
  for(const bad of [b64.slice(0,40),'base64','data:image','gemini-secret-model-name','api','key','GEMINI']) assert.ok(!copied.toLowerCase().includes(bad.toLowerCase()),'copy contains '+bad);
  assert.equal(await page.inputValue('#jsonOut'),copied);
  // unchecking needsReview is the user's explicit choice and is reflected
  await page.uncheck('#needsReview');
  assert.equal(JSON.parse(await page.inputValue('#jsonOut')).needsReview,false);
});

test('Gemini text is never interpreted as HTML; errors and clear work', async()=>{
  await choose();
  await page.evaluate(r=>{window.__next={ok:true,reading:{...r,characterName:'<img src=x onerror="window.__x=1">',reviewNotes:['<b>x</b>']}}},READING);
  await page.click('#readBtn');await page.waitForSelector('#result:not(.hidden)');
  assert.equal(await page.evaluate(()=>window.__x),undefined);
  assert.equal(await page.locator('#result img').count(),0);
  assert.equal(await page.inputValue('#f_characterName'),'<img src=x onerror="window.__x=1">');
  // server error
  await page.evaluate(()=>{window.__next={ok:false,code:'NO_API_KEY',error:'GEMINI_API_KEY が Script Properties に設定されていません'}});
  await page.click('#readBtn');await page.waitForSelector('#error:not(.hidden)');
  assert.match(await page.locator('#error').textContent(),/GEMINI_API_KEY/);assert.equal(await page.locator('#result').isVisible(),false);
  // transport failure
  await page.evaluate(()=>{window.__next={fail:'timeout'}});
  await page.click('#readBtn');await page.waitForFunction(()=>/通信に失敗/.test(document.getElementById('error').textContent));
  // clear
  await page.click('#clearBtn');
  assert.equal(await page.locator('#readBtn').isDisabled(),true);assert.equal(await page.locator('#previews').isVisible(),false);
  for(const n of [1,2]){assert.equal(await page.locator('#preview'+n).getAttribute('src'),null);assert.equal(await page.locator('#imageInfo'+n).textContent(),'')}
  assert.equal(await page.locator('#imageInfo').textContent(),'');
  assert.equal(await page.locator('#error').isVisible(),false);assert.equal(await page.inputValue('#file'),'');
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).length),0,'nothing stored in localStorage');
});

test('clear while reading: the late answer is ignored and everything is back to the start', async()=>{
  await choose();
  await page.evaluate(r=>{window.__next={ok:true,reading:r};window.__hold=true},READING);
  await page.click('#readBtn');
  assert.equal(await page.locator('#readBtn').isDisabled(),true);
  await page.evaluate(()=>MSR.read());assert.equal((await sent()).length,1,'a second call is not sent while reading');
  await page.click('#clearBtn');
  await page.evaluate(()=>window.__release());await page.waitForTimeout(100);
  assert.equal(await page.locator('#result').isVisible(),false);assert.equal(await page.locator('#status').isVisible(),false);
  assert.equal(await page.locator('#readBtn').isDisabled(),true);assert.equal(await page.locator('#previews').isVisible(),false);
});
