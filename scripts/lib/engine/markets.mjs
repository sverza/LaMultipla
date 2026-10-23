import {settlementEV} from '../analysis.mjs';
export const FAMILIES=Object.freeze({oneXTwo:'V1_RETROSPECTIVE_ONLY',btts:'EXPERIMENTAL',totals:'EXPERIMENTAL',teamTotals:'EXPERIMENTAL',
  doubleChance:'EXPERIMENTAL',drawNoBet:'EXPERIMENTAL',asianHandicap:'EXPERIMENTAL',multigoal:'MATHEMATICAL_ONLY',corners:'UNSUPPORTED',cards:'UNSUPPORTED',players:'UNSUPPORTED',betBuilder:'UNSUPPORTED'});
export function marketReadiness(spec,cohort,kind){
  if(!validateSpec(spec))return {state:'UNSUPPORTED',operationallyApproved:false};
  const primary=spec.family==='btts'?'btts':spec.family==='totals'&&spec.line===2.5?'over':null;
  if(!primary)return {state:'EXPLORATORY_SEPARATE_PROTOCOL_REQUIRED',operationallyApproved:false};
  const passed=cohort?.conflicted===false&&cohort?.confirmatoryFrame?.closed===true&&cohort?.confirmatoryFrame?.pairedN>=500&&cohort?.acceptance?.[kind]?.[primary]?.statisticalGatePassed===true;
  return {state:passed?'STATISTICAL_GATE_PASSED_REVIEW_REQUIRED':'PROSPECTIVE_VALIDATION_PENDING',operationallyApproved:false};
}
const names=['win','halfWin','push','halfLoss','loss'];
const validGrid=g=>Array.isArray(g)&&g.length>0&&g.every(r=>Array.isArray(r)&&r.length===g.length&&r.every(p=>Number.isFinite(p)&&p>=0))&&Math.abs(g.flat().reduce((s,p)=>s+p,0)-1)<1e-6;
export function validateSpec(spec) {
  if(!spec||!['oneXTwo','btts','totals','teamTotals','doubleChance','drawNoBet','asianHandicap','multigoal'].includes(spec.family))return false;
  if(spec.family==='oneXTwo')return ['1','X','2'].includes(spec.outcome);
  if(spec.family==='btts')return ['Yes','No'].includes(spec.outcome);
  if(spec.family==='doubleChance')return ['1X','X2','12'].includes(spec.outcome);
  if(['teamTotals','drawNoBet','asianHandicap'].includes(spec.family)&&!['home','away'].includes(spec.side))return false;
  if(spec.family==='drawNoBet')return true;
  if(spec.family==='multigoal')return Number.isInteger(spec.min)&&Number.isInteger(spec.max)&&spec.min>=0&&spec.min<=spec.max&&['total','home','away'].includes(spec.side);
  return Number.isFinite(spec.line)&&Math.abs(spec.line*4-Math.round(spec.line*4))<1e-8&&Math.abs(spec.line)<=10
    &&(spec.family==='asianHandicap'||spec.line>=0)&& (spec.family==='asianHandicap'||['Over','Under'].includes(spec.outcome));
}
function leg(value,line,direction=1){const d=(value-line)*direction;return d>0?'win':d===0?'push':'loss';}
export function settlementAt(home,away,spec) {
  if(!validateSpec(spec)||![home,away].every(n=>Number.isInteger(n)&&n>=0))throw new Error('Invalid goal settlement');
  const outcome=home>away?'1':home===away?'X':'2';
  if(spec.family==='oneXTwo')return outcome===spec.outcome?'win':'loss';
  if(spec.family==='btts')return (home>0&&away>0)===(spec.outcome==='Yes')?'win':'loss';
  if(spec.family==='doubleChance')return spec.outcome.includes(outcome)?'win':'loss';
  if(spec.family==='drawNoBet')return home===away?'push':(spec.side==='home'?home>away:away>home)?'win':'loss';
  if(spec.family==='multigoal'){const total=spec.side==='home'?home:spec.side==='away'?away:home+away;return total>=spec.min&&total<=spec.max?'win':'loss';}
  const value=spec.family==='asianHandicap'?(spec.side==='home'?home-away:away-home):spec.family==='teamTotals'?(spec.side==='home'?home:away):home+away;
  const line=spec.family==='asianHandicap'?-spec.line:spec.line,direction=spec.family==='asianHandicap'||spec.outcome==='Over'?1:-1;
  if(Math.abs(line*2-Math.round(line*2))<1e-8)return leg(value,line,direction);
  const a=leg(value,line-.25,direction),b=leg(value,line+.25,direction);
  if(a===b)return a;if([a,b].includes('push'))return [a,b].includes('win')?'halfWin':'halfLoss';
  throw new Error('Inconsistent quarter line');
}
export function settlementProbabilities(grid,spec) {
  if(!validGrid(grid)||!validateSpec(spec))return null;const p=Object.fromEntries(names.map(n=>[n,0]));
  grid.forEach((r,h)=>r.forEach((mass,a)=>p[settlementAt(h,a,spec)]+=mass));return p;
}
export function jointSettlement(grid,specs,prices) {
  if(!validGrid(grid)||!Array.isArray(specs)||specs.length<2||specs.some(s=>!validateSpec(s))||!Array.isArray(prices)||prices.length!==specs.length||prices.some(p=>!Number.isFinite(p)||p<=1))return null;
  const cells={};let allFullWin=0,expectedGrossProduct=0;
  const gross=(s,p)=>s==='win'?p:s==='halfWin'?(1+p)/2:s==='push'?1:s==='halfLoss'?.5:0;
  grid.forEach((r,h)=>r.forEach((mass,a)=>{const states=specs.map(s=>settlementAt(h,a,s)),key=states.join('|');cells[key]=(cells[key]??0)+mass;
    if(states.every(s=>s==='win'))allFullWin+=mass;expectedGrossProduct+=mass*states.reduce((v,s,i)=>v*gross(s,prices[i]),1);}));
  return {cells,allFullWin,expectedGrossProduct,mathematicalOnly:true,bookmakerCombinedPrice:null,
    limitation:'Same-fixture joint settlement from goal grid; gross product is hypothetical, not Bet Builder rules or offered price'};
}
export function quoteSpec(q,mapping) {
  if(q?.period!=='fulltime'||q.playerProp!==false||q.playerKey!=='0'||q.playerName!=null)return null;
  let spec;
  if(q.marketType==='1x2'&&q.marketName==='Full Time Result'&&q.line===0)spec={family:'oneXTwo',outcome:q.outcome};
  if(q.marketType==='bothteamsscore'&&q.marketName==='Both Teams To Score'&&q.line===0)spec={family:'btts',outcome:q.outcome};
  if(q.marketType==='totals'&&q.marketName==='Over Under Full Time')spec={family:'totals',line:q.line,outcome:q.outcome};
  if(['teamtotals-team1','teamtotals-team2'].includes(q.marketType))spec={family:'teamTotals',side:q.marketType.endsWith('team1')?'home':'away',line:q.line,outcome:q.outcome};
  if(q.marketType==='doublechance'&&q.marketName==='Double Chance'&&q.line===0)spec={family:'doubleChance',outcome:q.outcome};
  if(q.marketType==='drawnobet'&&q.marketName==='Draw No Bet'&&q.line===0&&['1','2'].includes(q.outcome))spec={family:'drawNoBet',side:q.outcome==='1'?'home':'away'};
  // Provider line orientation is not guessed; explicit signed-side mapping must be bound by the caller.
  if(q.marketType==='spreads'&&q.marketName==='Asian Handicap'&&mapping&&typeof q.quoteId==='string'&&mapping.quoteId===q.quoteId&&mapping.line===q.line)spec={family:'asianHandicap',line:mapping.line,side:mapping.side};
  return validateSpec(spec)?spec:null;
}
export const evForGrid=(grid,spec,price)=>settlementEV(price,settlementProbabilities(grid,spec));
