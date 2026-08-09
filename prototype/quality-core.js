(() => {
  'use strict';
  const curve = window.JK_QUALITY_DATA?.audit?.dayDifficultyCurve?.segments || [
    {from:0,to:.15,targetLevel:1.35},{from:.15,to:.45,targetLevel:1.95},{from:.45,to:.72,targetLevel:2.55},{from:.72,to:.9,targetLevel:1.85},{from:.9,to:1,targetLevel:1.45}
  ];
  const byQuestion = window.JK_QUALITY_DATA?.calibration?.questions || {};
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function baseProfile(question){
    const p=question?.initialCalibration || byQuestion[question?.sourceQuestionId] || byQuestion[question?.id];
    if(p)return {...p};
    const words=String(question?.stem||'').trim().split(/\s+/).filter(Boolean).length,d=Number(question?.difficulty||2);
    const reading=String(question?.part||'').includes('READ');
    return {status:'fallback',score:d===1?25:d===3?82:55,level:d,targetSeconds:Math.round(reading?Math.min(210,60+words*2+d*10):Math.min(125,28+words*1.2+d*8))};
  }
  function profile(question){
    const base=baseProfile(question);
    return window.JK_PHASE27?.applyToQuestionProfile ? window.JK_PHASE27.applyToQuestionProfile(base,question) : base;
  }
  function targetLevelAt(index,total){
    const ratio=total<=1?0:index/(total-1);
    return (curve.find(x=>ratio>=Number(x.from)&&ratio<=Number(x.to))||curve.at(-1)).targetLevel;
  }
  function arrange(ids,qMap){
    const rows=ids.map(id=>qMap[id]).filter(Boolean).sort((a,b)=>Number(profile(b).score||55)-Number(profile(a).score||55)||String(a.id).localeCompare(String(b.id)));
    const positions=ids.map((_,i)=>({i,target:targetLevelAt(i,ids.length)})).sort((a,b)=>b.target-a.target||a.i-b.i),placed=Array(ids.length);
    positions.forEach((pos,index)=>{placed[pos.i]=rows[index]});
    for(let i=1;i<placed.length;i++){
      if(placed[i]?.conceptId!==placed[i-1]?.conceptId)continue;
      const target=targetLevelAt(i,placed.length);
      for(let j=i+1;j<placed.length;j++){
        if(placed[j]?.conceptId===placed[i-1]?.conceptId)continue;
        if(Math.abs(targetLevelAt(j,placed.length)-target)>.15)continue;
        [placed[i],placed[j]]=[placed[j],placed[i]];break;
      }
    }
    return placed.filter(Boolean).map(q=>q.id);
  }
  function arrangeDay({grammarQuestionIds=[],readingQuestionIds=[],qMap={}}={}){
    const grammar=arrange(grammarQuestionIds,qMap),reading=arrange(readingQuestionIds,qMap);
    const pacing={};
    for(const id of [...grammar,...reading])pacing[id]=profile(qMap[id]);
    const active=window.JK_PHASE27?.activeProfile?.();
    return {grammarQuestionIds:grammar,readingQuestionIds:reading,questionPacing:pacing,difficultyCurveVersion:active?'27.0-adhd-fatigue-aware-personal':'25.0-adhd-fatigue-aware',calibrationStatus:active?'personal_admin_approved':'initial_simulation_no_learner_history',personalDifficultyProfileId:active?.profileId||null};
  }
  function targetSeconds(question){return Number(profile(question).targetSeconds||60)}
  function personalDifficulty({question,answerAccuracy,processPassRate,paceOverrunRate,recoveryRate}={}){
    const base=Number(profile(question).score||55);
    const has=[answerAccuracy,processPassRate,paceOverrunRate,recoveryRate].some(v=>Number.isFinite(Number(v)));
    if(!has)return {status:'initial_simulation_no_learner_history',score:base,level:profile(question).level,targetSeconds:targetSeconds(question)};
    const failA=100-clamp(Number(answerAccuracy||0),0,100),failP=100-clamp(Number(processPassRate||0),0,100),pace=clamp(Number(paceOverrunRate||0),0,100),failR=100-clamp(Number(recoveryRate||0),0,100);
    const score=Math.round(.55*base+.20*failA+.15*failP+.07*pace+.03*failR),level=score<=38?1:score<=67?2:3;
    const stable=Number(answerAccuracy)>=80&&Number(processPassRate)>=75;
    const seconds=Math.round(targetSeconds(question)*(stable?clamp(1+(score-base)/250,.92,1.18):clamp(1+(score-base)/180,1,1.25)));
    return {status:'observed_history',score,level,targetSeconds:seconds,timeReductionAllowed:stable};
  }
  window.JK_QUALITY={baseProfile,profile,targetSeconds,targetLevelAt,arrange,arrangeDay,personalDifficulty,curve};
})();
