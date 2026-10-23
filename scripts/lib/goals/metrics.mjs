export function rng(seed=20261010){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=Math.imul(a^a>>>15,1|a);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
export function quantile(a,q){const v=[...a].sort((x,y)=>x-y);return v[Math.min(v.length-1,Math.floor(q*(v.length-1)))];}
export const truth=r=>({oneXTwo:r.goals[0]>r.goals[1]?0:r.goals[0]===r.goals[1]?1:2,
  btts:Number(r.goals[0]>0&&r.goals[1]>0),over:Number(r.goals[0]+r.goals[1]>2.5)});
function score(p,y){const ps=Array.isArray(p)?p:[p,1-p],cls=Array.isArray(p)?y:1-y;
  return {logLoss:-Math.log(Math.max(ps[cls],1e-15)),brier:ps.reduce((s,v,k)=>s+(v-Number(k===cls))**2,0)/(Array.isArray(p)?1:2)};}
export function metrics(records,key,source='model'){
  if(!records.length)return null;
  const values=records.map(r=>score(r[source][key],r.y[key]));
  const calibration=Array.from({length:key==='oneXTwo'?3:1},(_,cls)=>{
    const bins=Array.from({length:10},()=>({n:0,p:0,y:0}));
    for(const r of records){const p=key==='oneXTwo'?r[source][key][cls]:r[source][key],y=key==='oneXTwo'?Number(r.y[key]===cls):r.y[key];
      const b=bins[Math.min(9,Math.floor(p*10))];b.n++;b.p+=p;b.y+=y;}
    const curve=bins.map(b=>{if(!b.n)return {n:0,meanPrediction:null,observed:null,wilson95:null};
      const y=b.y/b.n,z=1.96,d=1+z*z/b.n,center=(y+z*z/(2*b.n))/d,half=z*Math.sqrt(y*(1-y)/b.n+z*z/(4*b.n*b.n))/d;
      return {n:b.n,meanPrediction:b.p/b.n,observed:y,wilson95:[center-half,center+half]};});
    return {class:cls,ece:curve.reduce((s,b)=>s+(b.n?b.n/records.length*Math.abs(b.meanPrediction-b.observed):0),0),curve};});
  return {n:records.length,logLoss:values.reduce((s,v)=>s+v.logLoss,0)/values.length,
    brier:values.reduce((s,v)=>s+v.brier,0)/values.length,calibration};
}
export function pairedCI(records,key,baseline,reps=1000){
  if(!records.length)return null;const groups=new Map();
  for(const r of records){const week=Math.floor(Date.parse(r.date)/(7*86400000));const a=groups.get(week)||[];
    a.push(score(r.model[key],r.y[key]).logLoss-score(r[baseline][key],r.y[key]).logLoss);groups.set(week,a);}
  const blocks=[...groups.values()],random=rng(),samples=[];
  for(let b=0;b<reps;b++){let sum=0,n=0;for(let i=0;i<blocks.length;i++){const block=blocks[Math.floor(random()*blocks.length)];for(const d of block){sum+=d;n++;}}samples.push(sum/n);}
  return {lower:quantile(samples,.025),upper:quantile(samples,.975),blocks:blocks.length,replicates:reps,seed:20261010};
}
export function evaluateAcceptance(records,totalResults,seasonAudits){
  return Object.fromEntries(['oneXTwo','btts','over'].map(key=>{
    const model=metrics(records,key),empirical=metrics(records,key,'empirical'),leaguePoisson=metrics(records,key,'leaguePoisson');
    const comparisons={empirical:pairedCI(records,key,'empirical'),leaguePoisson:pairedCI(records,key,'leaguePoisson')};
    const reasons=[];
    if(records.length<500)reasons.push('test_sample_below_500');
    if(records.length/Math.max(totalResults,1)<.9)reasons.push('prediction_coverage_below_90_percent');
    if(seasonAudits.some(s=>s.results/380<.95))reasons.push('source_results_below_95_percent');
    if(!model||model.calibration.some(c=>c.ece>(key==='oneXTwo'?.10:.08)))reasons.push('calibration_threshold_failed');
    for(const [name,m]of Object.entries({empirical,leaguePoisson})){
      if(!comparisons[name]||comparisons[name].upper>=0)reasons.push(`no_confident_logloss_improvement_over_${name}`);
      if(!model||model.brier>m.brier+.005)reasons.push(`brier_noninferiority_failed_${name}`);}
    return [key,{retrospectiveAccepted:!reasons.length,operationallyApproved:false,reasons,model,empirical,leaguePoisson,comparisons}];
  }));
}
