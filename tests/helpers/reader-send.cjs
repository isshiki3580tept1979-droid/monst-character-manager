// 読取アプリの「管理アプリへ送る」を押し、送信とタブの終了を確かめる（reader-manager-e2e / reader-manager-fruit4 共通）。
// 読取アプリは postMessage の直後に window.top.close() で自分のタブを閉じる。Playwright の click / tap は入力を送った後も
// 完了を待つため、その間にページが閉じると "Target page, context or browser has been closed" で失敗することがある
// （送信自体は済んでいる）。この例外だけは、タブが実際に閉じたこと・受け取った回数と送り元が正しいことを確かめたうえで続ける。
// ほかの例外、タブが閉じない、回数や送り元が違う場合は失敗にする。
const assert=require('node:assert/strict');
const CLOSED=/Target page, context or browser has been closed|Target closed|Frame was detached/;

async function sendAndWaitClose({pop,fr,receiver,origin,expect=1,tap=false,timeout=5000}){
  // 受け取り側（管理アプリのページ）で、読み取り結果のメッセージを数える（送り元も控える）
  const before=await receiver.evaluate(()=>{
    if(!window.__readerSends){window.__readerSends=[];window.addEventListener('message',e=>{if(e.data&&e.data.type==='msr-reading')window.__readerSends.push(e.origin)},true)}
    return window.__readerSends.length;
  });
  const closing=pop.waitForEvent('close',{timeout}).then(()=>true,()=>false);
  let raced=null;
  try{ if(tap) await fr.locator('#sendBtn').tap(); else await fr.click('#sendBtn'); }
  catch(e){ if(!CLOSED.test(String(e&&e.message))) throw e; raced=e; }
  const closed=pop.isClosed()||await closing;
  if(!closed) throw raced||new Error('読取アプリのタブが閉じませんでした（送信処理が最後まで動いていない）');
  if(expect>0) await receiver.waitForFunction(n=>window.__readerSends.length>=n,before+expect,{timeout});
  await receiver.waitForTimeout(150); // 余分な2回目が来ないことも確かめる
  const sends=await receiver.evaluate(()=>window.__readerSends.slice());
  assert.equal(sends.length-before,expect,'number of readings received by the manager');
  if(origin) for(const o of sends.slice(before)) assert.equal(o,origin,'origin of the reading');
  if(raced&&process.env.READER_SEND_DEBUG) console.log('[reader-send] page closed while the click was finishing (handled after checks)');
  return {raced:!!raced};
}
module.exports={sendAndWaitClose};
