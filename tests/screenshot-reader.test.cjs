// スクショ読取ツール（試作）のサーバー側 Code.js を、Apps Script のモック上で確認する。Gemini とは通信しない。
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const SRC=fs.readFileSync(path.join(__dirname,'..','モンスト スクショ読取','Code.js'),'utf8');
const KEY='TEST-KEY-should-never-leak-0123456789';
const IMG={base64Data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',mimeType:'image/png'};
const GOOD={characterName:'自来也',formName:'ガマ仙人',monsterNo:'1234',race:'亜人',battleType:'バランス型',shotType:'反射',
  fruit1:'同族の絆・加撃 特L',fruit2:'撃種の絆・加撃 特L',fruit3:null,confidence:'HIGH',needsReview:false,reviewNotes:[],uncertainFields:[]};
const gemini=obj=>({code:200,body:JSON.stringify({candidates:[{content:{parts:[{text:typeof obj==='string'?obj:JSON.stringify(obj)}]},finishReason:'STOP'}]})});

function load({props={GEMINI_API_KEY:KEY},responses=[]}={}){
  const calls=[],sleeps=[],logs=[];
  const sb={
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>Object.prototype.hasOwnProperty.call(props,k)?props[k]:null,
      setProperty:()=>{throw new Error('must not write properties')},deleteProperty:()=>{throw new Error('must not write properties')}})},
    UrlFetchApp:{fetch:(url,options)=>{calls.push({url,options});const r=responses.shift();if(!r)throw new Error('unexpected fetch');if(r instanceof Error)throw r;
      return {getResponseCode:()=>r.code,getContentText:()=>r.body}}},
    Utilities:{sleep:ms=>sleeps.push(ms)},
    Logger:{log:(...a)=>logs.push(a.join(' '))},
    console:{log:(...a)=>logs.push(a.join(' ')),error:(...a)=>logs.push(a.join(' '))},
    DriveApp:undefined,SpreadsheetApp:undefined,CacheService:undefined,Date,JSON,encodeURIComponent,isFinite,String,Object,Array
  };
  vm.createContext(sb);vm.runInContext(SRC,sb);
  return {sb,calls,sleeps,logs,read:p=>JSON.parse(JSON.stringify(sb.msrReadScreenshot(p)))};
}
const noLeak=(t,label)=>{const s=JSON.stringify(t.result??'')+t.logs.join('\n');assert.ok(!s.includes(KEY),label+': key leaked');assert.ok(!s.includes(IMG.base64Data),label+': image leaked')};

test('1. API key missing → safe NO_API_KEY error, no request sent', ()=>{
  for(const props of [{},{GEMINI_API_KEY:''}]){
    const t=load({props});const r=t.read(IMG);
    assert.equal(r.ok,false);assert.equal(r.code,'NO_API_KEY');assert.match(r.error,/GEMINI_API_KEY/);
    assert.equal(t.calls.length,0);
  }
});

test('2. no image → NO_IMAGE, nothing sent; bad type / broken data rejected', ()=>{
  const t=load();
  for(const p of [undefined,null,{},{base64Data:''},{mimeType:'image/png'}]) {const r=t.read(p);assert.equal(r.ok,false);assert.equal(r.code,'NO_IMAGE')}
  assert.equal(t.read({...IMG,mimeType:'image/gif'}).code,'UNSUPPORTED_IMAGE_TYPE');
  assert.equal(t.read({...IMG,mimeType:'text/plain'}).code,'UNSUPPORTED_IMAGE_TYPE');
  assert.equal(t.read({base64Data:'not base64!!',mimeType:'image/png'}).code,'INVALID_IMAGE_DATA');
  assert.equal(t.read({base64Data:'A'.repeat(7*1024*1024+4),mimeType:'image/png'}).code,'IMAGE_TOO_LARGE');
  assert.equal(t.calls.length,0);
});

test('3. valid Gemini JSON is parsed; request carries image inline, schema, header key, model', ()=>{
  const t=load({responses:[gemini(GOOD)]});const r=t.read(IMG);t.result=r;
  assert.equal(r.ok,true);assert.equal(r.attempts,1);assert.equal(r.model,'gemini-3.5-flash-lite');
  assert.deepEqual(r.reading,{format:'monst-screenshot-reading-v1',...GOOD,fruit4:null}); // fruit4 は任意（無ければ null）
  const {url,options}=t.calls[0];
  assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
  assert.ok(!url.includes(KEY),'key is not in the URL');
  assert.equal(options.headers['x-goog-api-key'],KEY);assert.equal(options.muteHttpExceptions,true);
  const body=JSON.parse(options.payload);
  assert.deepEqual(body.contents[0].parts[0],{inline_data:{mime_type:'image/png',data:IMG.base64Data}});
  assert.match(body.contents[0].parts[1].text,/推測して補ったり/);
  const gc=body.generationConfig;
  assert.equal(gc.responseMimeType,'application/json');assert.equal(gc.temperature,0);
  assert.equal(gc.responseSchema.type,'OBJECT');
  assert.deepEqual(gc.responseSchema.required,['characterName','formName','monsterNo','race','battleType','shotType','fruit1','fruit2','fruit3','fruit4','confidence','needsReview','reviewNotes','uncertainFields']);
  assert.equal(gc.responseSchema.properties.characterName.nullable,true);
  assert.deepEqual(gc.responseSchema.properties.confidence.enum,['HIGH','MEDIUM','LOW']);
  noLeak(t,'success');
});

test('GEMINI_MODEL overrides the default model (trimmed); blank falls back', ()=>{
  let t=load({props:{GEMINI_API_KEY:KEY,GEMINI_MODEL:'  gemini-3.6-flash '},responses:[gemini(GOOD)]});
  assert.equal(t.read(IMG).model,'gemini-3.6-flash');assert.match(t.calls[0].url,/models\/gemini-3\.6-flash:generateContent$/);
  t=load({props:{GEMINI_API_KEY:KEY,GEMINI_MODEL:'  '},responses:[gemini(GOOD)]});
  assert.equal(t.read(IMG).model,'gemini-3.5-flash-lite');
});

test('4. missing required fields do not crash: null + needsReview + notes', ()=>{
  const t=load({responses:[gemini({characterName:'自来也',confidence:'HIGH',needsReview:false})]});
  const r=t.read(IMG);
  assert.equal(r.ok,true);
  assert.equal(r.reading.characterName,'自来也');
  for(const k of ['formName','monsterNo','race','battleType','shotType','fruit1','fruit2','fruit3']) assert.equal(r.reading[k],null,k);
  assert.equal(r.reading.needsReview,true,'forced to review');
  assert.ok(r.reading.reviewNotes.some(n=>n.includes('進化形態が回答にありません')));
  assert.deepEqual(r.reading.uncertainFields,[]);
  // wrong types become null + review (no coercion of names)
  const t2=load({responses:[gemini({...GOOD,characterName:123,formName:['x'],monsterNo:5678,needsReview:'no',confidence:'SURE'})]});
  const r2=t2.read(IMG);
  assert.equal(r2.reading.characterName,null);assert.equal(r2.reading.formName,null);
  assert.equal(r2.reading.monsterNo,'5678','numeric monsterNo is kept as digits');
  assert.equal(r2.reading.confidence,'LOW');assert.equal(r2.reading.needsReview,true);
});

test('5. invalid / non-object JSON and broken API bodies are rejected safely', ()=>{
  const cases=[
    [gemini('ここに説明文 {"characterName":"x"}'),'INVALID_JSON'],
    [gemini('```json\n{}\n```'),'INVALID_JSON'],
    [gemini('[1,2,3]'),'INVALID_JSON'],
    [gemini('"text"'),'INVALID_JSON'],
    [{code:200,body:'<html>oops</html>'},'INVALID_RESPONSE'],
    [{code:200,body:JSON.stringify({candidates:[{content:{parts:[]},finishReason:'MAX_TOKENS'}]})},'EMPTY_RESPONSE'],
    [{code:200,body:JSON.stringify({promptFeedback:{blockReason:'SAFETY'}})},'BLOCKED']];
  for(const [res,code] of cases){const t=load({responses:[res]});const r=t.read(IMG);t.result=r;assert.equal(r.ok,false);assert.equal(r.code,code);assert.equal(r.reading,undefined);noLeak(t,code)}
});

test('6. null handling: null / "" / "null" stay null; nulls alone do not invent values', ()=>{
  const t=load({responses:[gemini({...GOOD,race:null,fruit1:'  ',fruit2:'null',fruit3:null,monsterNo:null})]});
  const r=t.read(IMG).reading;
  for(const k of ['race','fruit1','fruit2','fruit3','monsterNo']) assert.equal(r[k],null,k);
  assert.equal(r.characterName,'自来也');assert.equal(r.formName,'ガマ仙人');
  assert.equal(r.needsReview,false,'legitimately missing optional items with HIGH confidence are not forced');
  // character / form missing → review
  const t2=load({responses:[gemini({...GOOD,characterName:null,formName:null})]});
  const r2=t2.read(IMG).reading;assert.equal(r2.needsReview,true);
  assert.ok(r2.reviewNotes.some(n=>n.includes('キャラ名が読み取れていません')));
});

test('needsReview is forced by uncertainFields, non-HIGH confidence, unknown battle/shot types; values are never rewritten', ()=>{
  const r1=load({responses:[gemini({...GOOD,uncertainFields:['formName','bogus']})]}).read(IMG).reading;
  assert.equal(r1.needsReview,true);assert.deepEqual(r1.uncertainFields,['formName']);
  const r2=load({responses:[gemini({...GOOD,confidence:'MEDIUM'})]}).read(IMG).reading;assert.equal(r2.needsReview,true);
  const r3=load({responses:[gemini({...GOOD,battleType:'バランス',shotType:'反射型',monsterNo:'No.12'})]}).read(IMG).reading;
  assert.equal(r3.battleType,'バランス');assert.equal(r3.shotType,'反射型');assert.equal(r3.monsterNo,'No.12');
  assert.equal(r3.needsReview,true);
  assert.equal(r3.reviewNotes.filter(n=>n.startsWith('［自動確認］')).length,3);
  const r4=load({responses:[gemini({...GOOD,needsReview:true,reviewNotes:['実の等級がかすれている']})]}).read(IMG).reading;
  assert.equal(r4.needsReview,true);assert.deepEqual(r4.reviewNotes,['実の等級がかすれている']);
  // extra keys from Gemini are dropped
  const r5=load({responses:[gemini({...GOOD,secret:'x',imageData:'abc'})]}).read(IMG).reading;
  assert.deepEqual(Object.keys(r5).sort(),['battleType','characterName','confidence','formName','format','fruit1','fruit2','fruit3','fruit4','monsterNo','needsReview','race','reviewNotes','shotType','uncertainFields']);
});

test('9. only 429 / 503 are retried, at most 2 retries with short waits', ()=>{
  let t=load({responses:[{code:503,body:'{}'},{code:429,body:'{}'},gemini(GOOD)]});
  let r=t.read(IMG);assert.equal(r.ok,true);assert.equal(r.attempts,3);assert.deepEqual(t.sleeps,[1000,2000]);
  t=load({responses:[{code:503,body:'{"error":{"message":"high demand"}}'},{code:503,body:'{}'},{code:503,body:'{}'},{code:503,body:'{}'}]});
  r=t.read(IMG);assert.equal(r.ok,false);assert.equal(r.code,'API_ERROR');assert.equal(r.status,503);assert.equal(r.attempts,3,'gives up after 3 calls');
  assert.equal(t.calls.length,3);assert.deepEqual(t.sleeps,[1000,2000]);
  assert.equal(t.sb.msrShouldRetry_(429),true);assert.equal(t.sb.msrShouldRetry_(503),true);
  for(const c of [400,401,403,404,500,502,504]) assert.equal(t.sb.msrShouldRetry_(c),false,String(c));
});

test('10. permanent errors (400 etc.) are not retried; key is redacted from error text', ()=>{
  for(const code of [400,401,403,404,500]){
    const t=load({responses:[{code,body:JSON.stringify({error:{message:'API key not valid: '+KEY}})}]});
    const r=t.read(IMG);t.result=r;
    assert.equal(r.ok,false);assert.equal(r.status,code);assert.equal(r.attempts,1);assert.equal(t.calls.length,1);assert.deepEqual(t.sleeps,[]);
    assert.match(r.error,new RegExp('HTTP '+code));noLeak(t,String(code));
  }
  // network exception → INTERNAL, redacted, no retry
  const t=load({responses:[new Error('fetch failed for '+KEY)]});const r=t.read(IMG);t.result=r;
  assert.equal(r.code,'INTERNAL');noLeak(t,'exception');
});

// ===== 1キャラ＝スクショ2枚 =====
const IMG2={base64Data:'/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',mimeType:'image/jpeg'};
const PAIR={images:[IMG,IMG2]};
const SAME={...GOOD,sameCharacter:'YES',image1CharacterName:'自来也',image1MonsterNo:'1234',image2CharacterName:null,image2MonsterNo:'1234'};
const noLeak2=(t,label)=>{noLeak(t,label);const s=JSON.stringify(t.result??'')+t.logs.join('\n');assert.ok(!s.includes(IMG2.base64Data),label+': image2 leaked')};

test('pair: both images go to ONE Gemini request, labelled, with the pair prompt and identity schema', ()=>{
  const t=load({responses:[gemini(SAME)]});const r=t.read(PAIR);t.result=r;
  assert.equal(r.ok,true);assert.equal(r.imageCount,2);assert.equal(t.calls.length,1,'one request for both images');
  const body=JSON.parse(t.calls[0].options.payload);const parts=body.contents[0].parts;
  assert.equal(body.contents.length,1);
  assert.deepEqual(parts.slice(0,4),[{text:'【画像1】'},{inline_data:{mime_type:'image/png',data:IMG.base64Data}},{text:'【画像2】'},{inline_data:{mime_type:'image/jpeg',data:IMG2.base64Data}}]);
  assert.equal(parts.length,5);
  assert.match(parts[4].text,/同じ1体のキャラクターの情報を補い合う/);
  assert.match(parts[4].text,/推測して補ったり/);assert.match(parts[4].text,/sameCharacter/);
  const sc=body.generationConfig.responseSchema;
  assert.deepEqual(sc.properties.sameCharacter.enum,['YES','NO','UNKNOWN']);
  for(const k of ['image1CharacterName','image1MonsterNo','image2CharacterName','image2MonsterNo']){assert.equal(sc.properties[k].nullable,true,k);assert.ok(sc.required.includes(k),k)}
  // reading keeps the existing format: identity helpers are not part of it
  assert.deepEqual(r.reading,{format:'monst-screenshot-reading-v1',...GOOD,fruit4:null}); // fruit4 は任意（無ければ null）
  noLeak2(t,'pair success');
});

test('pair: images array must hold exactly 2; each image is validated and named', ()=>{
  const t=load();
  for(const images of [[],[IMG],[IMG,IMG2,IMG],'x',null]){const r=t.read({images});assert.equal(r.ok,false);assert.equal(r.code,'IMAGE_COUNT');assert.match(r.error,/2枚/)}
  let r=t.read({images:[IMG,{...IMG2,mimeType:'image/gif'}]});assert.equal(r.code,'UNSUPPORTED_IMAGE_TYPE');assert.match(r.error,/^画像2：/);
  r=t.read({images:[{base64Data:'',mimeType:'image/png'},IMG2]});assert.equal(r.code,'NO_IMAGE');assert.match(r.error,/^画像1：/);
  r=t.read({images:[IMG,{base64Data:'not base64!!',mimeType:'image/png'}]});assert.equal(r.code,'INVALID_IMAGE_DATA');
  r=t.read({images:[IMG,{base64Data:'A'.repeat(7*1024*1024+4),mimeType:'image/png'}]});assert.equal(r.code,'IMAGE_TOO_LARGE');
  assert.equal(t.calls.length,0,'nothing sent');
});

test('pair: clearly different characters → CHARACTER_MISMATCH, no reading', ()=>{
  const cases=[
    [{...SAME,image2MonsterNo:'5678'},/図鑑No\./],
    [{...SAME,sameCharacter:'NO',image2MonsterNo:null},/別キャラ/],
    [{...SAME,image1MonsterNo:null,image2MonsterNo:null,image2CharacterName:'ナルト'},/キャラ名/]];
  for(const [res,why] of cases){
    const t=load({responses:[gemini(res)]});const r=t.read(PAIR);t.result=r;
    assert.equal(r.ok,false);assert.equal(r.code,'CHARACTER_MISMATCH');assert.equal(r.reading,undefined);
    assert.match(r.error,/2枚が同じキャラクターではない可能性があります/);
    assert.ok(r.mismatch.reasons.some(x=>why.test(x)),String(why));
    assert.deepEqual(Object.keys(r.mismatch).sort(),['image1','image2','reasons']);
    noLeak2(t,'mismatch');
  }
});

test('pair: same character is not over-flagged; unclear identity does not block', ()=>{
  // 図鑑No.が一致していれば、キャラ名の表記ゆれ・Gemini の NO よりも一致を優先（要確認にはする）
  let r=load({responses:[gemini({...SAME,sameCharacter:'NO',image2CharacterName:'自来 也'})]}).read(PAIR);
  assert.equal(r.ok,true);assert.equal(r.reading.needsReview,true);
  assert.ok(r.reading.reviewNotes.some(n=>n.includes('図鑑No.は一致')));
  // 全角数字・前置き付きの図鑑No.も数字で比べる
  r=load({responses:[gemini({...SAME,image1MonsterNo:'No.１２３４',image2MonsterNo:'1234'})]}).read(PAIR);
  assert.equal(r.ok,true);
  // 2枚目から特定できない（UNKNOWN）→ 別キャラと断定しない。HIGH なら要確認も強制しない
  r=load({responses:[gemini({...SAME,sameCharacter:'UNKNOWN',image2CharacterName:null,image2MonsterNo:null})]}).read(PAIR);
  assert.equal(r.ok,true);assert.equal(r.reading.needsReview,false);
  assert.ok(r.reading.reviewNotes.some(n=>n.includes('同じキャラか画像から確かめられませんでした')));
  // sameCharacter が無い・不正 → UNKNOWN と同じ扱い
  r=load({responses:[gemini({...GOOD,sameCharacter:'maybe'})]}).read(PAIR);
  assert.equal(r.ok,true);
});

test('pair: Gemini errors and broken JSON are reported the same way as single', ()=>{
  for(const [res,code] of [[gemini('説明文です'),'INVALID_JSON'],[{code:503,body:'{}'},'API_ERROR'],[{code:200,body:'<html>'},'INVALID_RESPONSE']]){
    const responses=code==='API_ERROR'?[res,res,res]:[res];
    const t=load({responses});const r=t.read(PAIR);t.result=r;assert.equal(r.ok,false);assert.equal(r.code,code);noLeak2(t,code);
  }
});

test('Code.js stores nothing and contains no key / Drive / Spreadsheet / OCR code', ()=>{
  for(const bad of [/DriveApp|Drive\.Files|SpreadsheetApp|DocumentApp|CacheService|ocrLanguage|setProperty|deleteProperty|Logger\.log|console\.log|localStorage/]) assert.doesNotMatch(SRC,bad);
  assert.doesNotMatch(SRC,/AIza[0-9A-Za-z_-]{10,}/,'no API key literal');
  const t=load({responses:[gemini(GOOD)]});t.result=t.read(IMG);assert.deepEqual(t.logs,[]);noLeak(t,'logs');
});
