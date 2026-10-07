// Converts hakai_owned_suit_links_staging (importReady only) into the trial's monst-suitability-import-v1 blocks.
// No name guessing: each entry must carry an explicit characterName/formName, and its GameWith label/grade/url
// must appear as-is in the GameWith reference file. needsReview / doNotLink are never converted.
const QUEST='破界の星墓';
function convertSuitLinks(links,reference,stages){
  if(links.schema!=='monst-hakai-owned-suit-links-staging-v1') throw new Error('links schema');
  if(reference.schema!=='monst-hakai-gamewith-reference-v1') throw new Error('reference schema');
  if(links.source!=='GAMEWITH'||links.evaluationType!=='GRADE') throw new Error('links source/evaluationType');
  const blocks=new Map();
  for(const e of links.importReady){
    if(!stages.includes(e.stageKeyHint)) throw new Error('unknown stage '+e.stageKeyHint);
    const ref=reference.stages.filter(s=>s.stageKeyHint===e.stageKeyHint);
    if(ref.length!==1) throw new Error('reference stage '+e.stageKeyHint);
    const st=ref[0];
    if(st.sourceUrl!==e.sourceUrl) throw new Error('sourceUrl mismatch '+e.characterName);
    if(!['S','A'].includes(e.grade)||e.verificationStatus!=='VERIFIED') throw new Error('grade/status '+e.characterName);
    if(!e.characterName||!e.formName) throw new Error('canonical name missing');
    const hits=(st.rankings[e.grade]||[]).filter(r=>r.characterLabel===e.sourceCharacterLabel&&r.formLabel===e.sourceFormLabel);
    if(hits.length!==1) throw new Error('not in reference '+e.stageKeyHint+' '+e.grade+' '+e.sourceCharacterLabel);
    if(!blocks.has(st.stageKeyHint)){
      const b={format:'monst-suitability-import-v1',stageKey:QUEST+'::'+e.stageKeyHint,source:'GAMEWITH',sourceUrl:st.sourceUrl,evaluationType:'GRADE'};
      if(st.sourceUpdatedAt) b.sourceUpdatedAt=st.sourceUpdatedAt.slice(0,10); // "+09:00" timestamps: date part is the JST date
      b.entries=[];blocks.set(st.stageKeyHint,b);
    }
    blocks.get(st.stageKeyHint).entries.push({characterName:e.characterName,formName:e.formName,grade:e.grade,verificationStatus:'VERIFIED',
      note:'GameWith表記：'+e.sourceCharacterLabel+(e.sourceFormLabel?'｜'+e.sourceFormLabel:'')});
  }
  return [...blocks.values()];
}
module.exports={convertSuitLinks};
