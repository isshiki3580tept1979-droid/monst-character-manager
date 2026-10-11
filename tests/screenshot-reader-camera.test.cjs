// スクショ読取 Index.html の「カメラで撮影する」（1枚ずつ撮影・撮り直し・画像から選ぶ）を、google.script のモックで確かめる。
// Gemini とは通信しない。撮影は <input capture="environment"> へのファイル指定で再現する（実機のカメラ起動そのものは実機で確認）。
const {test,before,after,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const source=path.join(__dirname,'..','モンスト スクショ読取','Index.html');
const READING={format:'monst-screenshot-reading-v1',characterName:'架空撮影キャラ',formName:null,monsterNo:'90031',race:'亜人',battleType:'バランス型',shotType:'反射',
  fruit1:'撃種の絆・加撃 特L',fruit2:null,fruit3:null,confidence:'MEDIUM',needsReview:true,reviewNotes:[],uncertainFields:[]};
// window.__params：管理アプリから開かれたときの URL パラメータ（google.script.url.getLocation が返すもの）
const MOCK=`window.__calls=[];window.__next=null;window.__params=window.__params||{};
window.google={script:{run:(function(){function mk(s,f){return {withSuccessHandler:h=>mk(h,f),withFailureHandler:h=>mk(s,h),
  msrReadScreenshot:p=>{window.__calls.push(p);const r=window.__next;const go=()=>r&&r.fail?f(new Error(r.fail)):s(r);if(window.__hold)window.__release=go;else setTimeout(go,30)}}}return mk(()=>{},()=>{})})(),
  url:{getLocation:cb=>setTimeout(()=>cb({parameter:window.__params}),5)}}};`;
let browser,server,url,context,page,errors,external;
before(async()=>{
  server=http.createServer((req,res)=>{if(req.url!=='/'){res.writeHead(404);res.end();return}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(source));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${server.address().port}/`;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
async function open(params){
  context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});external=[];
  await context.route('**/*',r=>{if(r.request().url().startsWith(url))return r.continue();external.push(r.request().url());return r.abort()});
  if(params) await context.addInitScript(p=>{window.__params=p},params);
  await context.addInitScript(MOCK);
  page=await context.newPage();errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(url);await page.waitForTimeout(30); // getLocation の応答を待つ
}
beforeEach(()=>{context=null});
afterEach(async()=>{assert.deepEqual(errors,[]);assert.deepEqual(external,[],'no request leaves the page');await context?.close();});
const makeImg=(w,h,color,type='image/jpeg')=>page.evaluate(({w,h,color,type})=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,w,h);
  return c.toDataURL(type,0.9).split(',')[1]},{w,h,color,type}).then(b=>Buffer.from(b,'base64'));
// スマホのカメラで撮った写真に近い大きさ（4000×3000 の JPEG）
const photo=async(color='#3a6',w=4000,h=3000)=>({name:'IMG_0001.jpg',mimeType:'image/jpeg',buffer:await makeImg(w,h,color)});
const sent=()=>page.evaluate(()=>window.__calls);
const pressed=()=>page.evaluate(()=>['modeShot','modeCam'].filter(id=>document.getElementById(id).getAttribute('aria-pressed')==='true'));
async function shoot(n,file,input='cam'){await page.setInputFiles('#'+input+n,file);await page.waitForFunction(n=>/済み|もう一度/.test(document.getElementById('slotState'+n).textContent),n)}

test('two ways to read: スクショ (default when opened directly) and カメラ; the screenshot route is unchanged', async()=>{
  await open();
  assert.deepEqual(await pressed(),['modeShot']);
  assert.equal(await page.locator('#file').isVisible(),true);assert.equal(await page.locator('#camPane').isVisible(),false);
  assert.equal(await page.locator('#modeHint').isVisible(),false);
  await page.click('#modeCam');
  assert.deepEqual(await pressed(),['modeCam']);
  assert.equal(await page.locator('#camPane').isVisible(),true);assert.equal(await page.locator('#shotPane').isVisible(),false);
  // 背面カメラで撮るための指定（Android Chrome はカメラを直接起動する）。カメラが使えないときの「画像から選ぶ」もある
  for(const n of [1,2]){
    assert.equal(await page.locator('#cam'+n).getAttribute('capture'),'environment');
    assert.equal(await page.locator('#cam'+n).getAttribute('accept'),'image/*');
    assert.equal(await page.locator('#cam'+n).getAttribute('multiple'),null,'one photo at a time');
    assert.equal(await page.locator('#pick'+n).getAttribute('capture'),null);
  }
  assert.equal(await page.locator('#readBtn').isDisabled(),true);
  await page.click('#modeShot');assert.equal(await page.locator('#file').isVisible(),true);
});

test('camera: one photo at a time, retake, then the pair goes to the same reader call; large photos are downscaled', async()=>{
  await open();await page.click('#modeCam');
  await shoot(1,await photo('#3a6'));
  assert.match(await page.locator('#slotState1').textContent(),/撮影済み/);assert.match(await page.locator('#camLabel1').textContent(),/撮り直す/);
  assert.match(await page.locator('#imageInfo').textContent(),/1枚目の準備ができました。2枚目を撮影してください/);
  assert.equal(await page.locator('#pv1').isVisible(),true);assert.equal(await page.locator('#pv2').isVisible(),false);
  assert.equal(await page.locator('#readBtn').isDisabled(),true,'not with one photo');
  await page.evaluate(()=>MSR.read());assert.deepEqual(await sent(),[]);
  assert.match(await page.locator('#error').textContent(),/1枚目・2枚目とも撮影してください/);
  await shoot(2,await photo('#a36'));
  assert.match(await page.locator('#imageInfo').textContent(),/2枚そろいました/);
  assert.match(await page.locator('#imageInfo2').textContent(),/2000×1500（image\/jpeg/,'4000×3000 → long side 2000');
  assert.equal(await page.locator('#readBtn').isDisabled(),false);
  // 2枚目を撮り直す（1枚目はそのまま）
  const first=await page.evaluate(()=>document.getElementById('preview1').src);
  await shoot(2,await photo('#36a',3000,4000));
  assert.match(await page.locator('#imageInfo2').textContent(),/1500×2000/);
  assert.equal(await page.evaluate(()=>document.getElementById('preview1').src),first);
  await page.evaluate(r=>{window.__next={ok:true,reading:r,model:'gemini-test'}},READING);
  await page.click('#readBtn');await page.waitForSelector('#result:not(.hidden)');
  const c=await sent();assert.equal(c.length,1,'one call for the pair');
  assert.deepEqual(Object.keys(c[0]),['images']);assert.equal(c[0].images.length,2);
  for(const im of c[0].images){assert.deepEqual(Object.keys(im).sort(),['base64Data','mimeType']);assert.equal(im.mimeType,'image/jpeg');assert.ok(im.base64Data.length<7*1024*1024)}
  assert.equal(await page.inputValue('#f_characterName'),'架空撮影キャラ');
  // 確認・修正・JSONコピーは従来どおり
  await page.fill('#f_race','魔族');assert.equal(JSON.parse(await page.inputValue('#jsonOut')).race,'魔族');
  // 結果が出たあとで撮り直すと、古い結果は消える（別の写真の結果を送らない）
  await shoot(1,await photo('#999'));
  assert.equal(await page.locator('#result').isVisible(),false);
});

test('camera fallback: 「画像から選ぶ」 fills a slot too; a non-image or broken photo shows an error for that slot only', async()=>{
  await open();await page.click('#modeCam');
  await shoot(1,await photo(),'pick');assert.match(await page.locator('#slotState1').textContent(),/選択済み/);
  await page.setInputFiles('#cam2',{name:'memo.txt',mimeType:'text/plain',buffer:Buffer.from('x')});
  assert.match(await page.locator('#error').textContent(),/2枚目：画像ファイルではありません/);
  await page.setInputFiles('#cam2',{name:'b.jpg',mimeType:'image/jpeg',buffer:Buffer.from('broken')});
  await page.waitForFunction(()=>/もう一度撮影してください/.test(document.getElementById('slotState2').textContent));
  assert.match(await page.locator('#error').textContent(),/2枚目：画像を開けませんでした/);
  assert.equal(await page.locator('#readBtn').isDisabled(),true);
  assert.match(await page.locator('#slotState1').textContent(),/選択済み/,'slot 1 kept');
  await shoot(2,await photo('#a36'));assert.equal(await page.locator('#readBtn').isDisabled(),false);
  assert.equal(await page.locator('#error').isVisible(),false);
});

test('switching method or clear empties the chosen images; a late answer after switching is ignored', async()=>{
  await open();await page.click('#modeCam');
  await shoot(1,await photo());await shoot(2,await photo('#a36'));
  await page.evaluate(r=>{window.__next={ok:true,reading:r};window.__hold=true},READING);
  await page.click('#readBtn');assert.match(await page.locator('#status').textContent(),/読み取り中/);
  await page.click('#modeShot');
  await page.evaluate(()=>window.__release());await page.waitForTimeout(80);
  assert.equal(await page.locator('#result').isVisible(),false,'late answer ignored');
  assert.equal(await page.locator('#readBtn').isDisabled(),true);
  await page.click('#modeCam');
  for(const n of [1,2]) assert.match(await page.locator('#slotState'+n).textContent(),/未撮影/);
  assert.equal(await page.locator('#previews').isVisible(),false);
  await shoot(1,await photo());await page.click('#clearBtn');
  assert.match(await page.locator('#slotState1').textContent(),/未撮影/);assert.match(await page.locator('#camLabel1').textContent(),/撮影する/);
  assert.equal(await page.locator('#pv1').isVisible(),false);
});

test('opened from the manager: サブ1〜サブ5 start with カメラ, メイン with スクショ; both stay switchable; send works for camera photos', async()=>{
  const nonce='abcdefghij0123456789XYZ';
  for(const [dev,mode] of [['サブ1','modeCam'],['サブ5','modeCam'],['メイン','modeShot'],['不明な端末','modeShot']]){
    await open({return:'manager',nonce,device:dev});
    assert.deepEqual(await pressed(),[mode],dev);
    if(dev==='不明な端末') assert.equal(await page.locator('#modeHint').isVisible(),false);
    else assert.match(await page.locator('#modeHint').textContent(),new RegExp('登録先：'+dev));
    await page.click(mode==='modeCam'?'#modeShot':'#modeCam');assert.notDeepEqual(await pressed(),[mode],'switchable');
    await context.close();context=null;
  }
  // 端末の指定なし（管理画面の端末が未選択）→ スクショ
  await open({return:'manager',nonce});assert.deepEqual(await pressed(),['modeShot']);
  await context.close();
  // サブ2：撮影 → 読み取り → 管理アプリへ送る（送り先は固定のオリジン）
  await open({return:'manager',nonce,device:'サブ2'});
  await page.evaluate(()=>{window.__posted=[];Object.defineProperty(window,'opener',{value:{closed:false,postMessage:(m,o)=>window.__posted.push([m,o])}})});
  await shoot(1,await photo());await shoot(2,await photo('#a36'));
  await page.evaluate(r=>{window.__next={ok:true,reading:r}},READING);
  await page.click('#readBtn');await page.waitForSelector('#result:not(.hidden)');
  assert.equal(await page.locator('#sendBtn').isVisible(),true);assert.equal(await page.locator('#copyBtn').isVisible(),true);
  await page.click('#sendBtn');
  const [[m,origin]]=await page.evaluate(()=>window.__posted);
  assert.equal(origin,'https://isshiki3580tept1979-droid.github.io');
  assert.deepEqual(Object.keys(m).sort(),['nonce','reading','type']);assert.equal(m.reading.characterName,'架空撮影キャラ');
  assert.doesNotMatch(JSON.stringify(m),/base64|\/9j\/|image\/jpeg/,'no photo data is sent to the manager');
});

test('390px: method buttons and photo slots fit without horizontal scrolling', async()=>{
  await open({return:'manager',nonce:'abcdefghij0123456789XYZ',device:'サブ3'});
  await shoot(1,await photo());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal scroll');
  const boxes=await page.evaluate(()=>['modeShot','modeCam'].map(id=>document.getElementById(id).getBoundingClientRect()).map(b=>[Math.round(b.top),Math.round(b.height)]));
  assert.equal(boxes[0][0],boxes[1][0],'the two method buttons sit side by side');assert.ok(boxes[0][1]>=40,'tap-friendly height');
  for(const sel of ['label:has(#cam1)','label:has(#pick1)']){const b=await page.locator(sel).boundingBox();assert.ok(b.height>=40&&b.x>=0&&b.x+b.width<=390,sel)}
  fs.mkdirSync(path.join(__dirname,'artifacts'),{recursive:true});
  await page.screenshot({path:path.join(__dirname,'artifacts','reader-camera-390.png'),fullPage:true});
});
