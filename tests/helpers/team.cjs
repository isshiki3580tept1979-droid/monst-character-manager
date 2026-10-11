// v27 のステージ編成（端末カード＋キャラを選ぶ画面）をテストから操作する共通ヘルパー。
// teamView は、以前の選択欄（select）と同じ形 {cand, groups, sel} で候補を返す（画面を開いて読み、閉じる）。
const openTeam=async(page,dev)=>{await page.locator(`.pickDev[data-dev="${dev}"] [data-act="openPicker"]`).click()};
const closeTeam=async page=>{if(await page.locator('#pickModal').evaluate(m=>m.classList.contains('open')))await page.locator('#pickModal .btns [data-act="close"]').click()};
async function teamView(page,dev){
  await openTeam(page,dev);
  const r=await page.evaluate(d=>{const k=key(db.ui.quest,curStage()), p=pickState(k,d);
    const lab=g=>[...document.querySelectorAll(`#pkList .pkItem[data-group="${g}"]`)].map(b=>b.getAttribute('aria-label'));
    const cand=lab('cand'), own=lab('own');
    if(p.stale) cand.unshift((p.unit?unitLabel(p.unit):'削除された個体')+'（候補外）');
    return {cand,groups:own.length?[['所持キャラ（適正未登録・仮選択）',own]]:[],sel:p.sel}},dev);
  await closeTeam(page);return r;
}
// 以前の select の選択肢の文字列（先頭の案内つき）。all=true なら仮選択（その他の所持キャラ）も含める
async function optionList(page,dev,all=false){
  const v=await teamView(page,dev), own=v.groups.flatMap(g=>g[1]);
  return [v.cand.length||own.length?'— 使う個体を選ぶ —':'候補なし',...v.cand,...(all?own:[])];
}
// 端末の編成で個体を選ぶ（id が空なら選択をやめる）
// dispatch:true は、古いタブの警告バーがボタンの上に重なる場面用（クリックをその要素へ直接送る）
async function choose(page,dev,id,opts={}){
  const tap=l=>opts.dispatch?l.dispatchEvent('click'):l.click();
  await tap(page.locator(`.pickDev[data-dev="${dev}"] [data-act="openPicker"]`));
  await tap(id?page.locator(`#pkList .pkItem[data-id="${id}"]`):page.locator('#pickModal [data-act="pickClear"]'));
}
module.exports={openTeam,closeTeam,teamView,optionList,choose};
