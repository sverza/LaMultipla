import { canonicalTeam } from './data.mjs';
export function fitPoisson(rows, cutoffUtc, {halfLife=365,ridge=5,rho=0,maxIterations=600}={}) {
  if (!Number.isFinite(Date.parse(cutoffUtc)) || rows.length < 100 || rows.some(r=>Date.parse(r.availableAtUtc)>=Date.parse(cutoffUtc))) throw new Error('Insufficient or future training data');
  if (!Number.isFinite(halfLife) || !Number.isFinite(ridge) || !(halfLife>0 && ridge>0) || !Number.isFinite(rho)) throw new Error('Invalid parameters');
  const teams = [...new Set(rows.flatMap(r=>[r.home,r.away]))].sort(), ids = new Map(teams.map((t,i)=>[t,i])), n=teams.length;
  const counts=Object.fromEntries(teams.map(t=>[t,0]));
  let sh=0,sa=0,sw=0;
  const records=rows.map(r=>{const w=Math.exp(-Math.LN2*(Date.parse(cutoffUtc)-Date.parse(r.date))/86400000/halfLife);
    counts[r.home]++;counts[r.away]++; sh+=w*r.goals[0];sa+=w*r.goals[1];sw+=w; return [ids.get(r.home),ids.get(r.away),...r.goals,w];});
  const x=new Float64Array(2+2*n); x[0]=Math.log(Math.max(sa/sw,.05)); x[1]=Math.log(Math.max(sh/sw,.05))-x[0];
  // Diagonal Newton descent with backtracking: optimize penalized Poisson likelihood.
  function evaluate(v, derivatives=false) {
    let cost=0; const g=new Float64Array(v.length),h=new Float64Array(v.length);
    for(const [i,j,y,z,w] of records) {
      for(const [indices,goals] of [[[0,1,2+i,2+n+j],y],[[0,2+j,2+n+i],z]]) {
        const eta=indices.reduce((s,k)=>s+v[k],0), rate=Math.exp(eta);cost+=w*(rate-goals*eta);
        if(derivatives) for(const k of indices){g[k]+=w*(rate-goals);h[k]+=w*rate;}
      }
    }
    for(let k=2;k<v.length;k++){cost+=ridge*v[k]*v[k]/2;g[k]+=ridge*v[k];h[k]+=ridge;}
    return {cost,g,h};
  }
  let converged=false,iterations=0;
  for(;iterations<maxIterations;iterations++) {
    const {cost,g,h}=evaluate(x,true); const delta=Array.from(g,(v,k)=>v/Math.max(h[k],1e-6));
    if(Math.max(...delta.map(Math.abs))<1e-5){converged=true;break;}
    let step=1, accepted=false;
    for(let k=0;k<30;k++){const next=x.map((v,i)=>v-step*delta[i]);
      if(evaluate(next).cost < cost){x.set(next);accepted=true;break;}step/=2;}
    if(!accepted) break;
  }
  return {schema:'lamultipla-goals-fit-v1',cutoffUtc,config:{halfLife,ridge,rho},teams,counts,
    coefficients:Array.from(x), converged,iterations,trainingRows:rows.length,
    maxResultAvailableAtUtc:rows.reduce((m,r)=>r.availableAtUtc>m?r.availableAtUtc:m,'')};
}
function poisson(rate) {
  if(!Number.isFinite(rate)||rate<=0||rate>12) return null;
  const p=[Math.exp(-rate)];for(let i=1;i<=30;i++)p.push(p[i-1]*rate/i);return p;
}
export function distribution(homeRate,awayRate,rho=0) {
  const h=poisson(homeRate),a=poisson(awayRate);if(!h||!a)return null;
  const tau=[[1-homeRate*awayRate*rho,1+homeRate*rho],[1+awayRate*rho,1-rho]];
  if(tau.flat().some(v=>v<=0))return null;
  const grid=h.map((v,i)=>a.map((w,j)=>v*w*(i<=1&&j<=1?tau[i][j]:1)));
  const mass=grid.flat().reduce((s,p)=>s+p,0);if(Math.abs(1-mass)>1e-8)return null;
  return grid.map(row=>row.map(p=>p/mass));
}
export function marketsFromGrid(grid,line=2.5) {
  if(!grid || !Number.isFinite(line))return null;
  const p={oneXTwo:[0,0,0],btts:0,over:0,under:0,push:0};
  grid.forEach((row,i)=>row.forEach((v,j)=>{p.oneXTwo[i>j?0:i===j?1:2]+=v;
    if(i>0&&j>0)p.btts+=v;if(i+j>line)p.over+=v;else if(i+j<line)p.under+=v;else p.push+=v;}));return p;
}
export function predict(model,home,away,line=2.5) {
  home=canonicalTeam(home);away=canonicalTeam(away);
  const i=model.teams.indexOf(home),j=model.teams.indexOf(away),n=model.teams.length;
  if(!model.converged || i<0 || j<0 || home===away || model.counts[home]<20 || model.counts[away]<20)return null;
  const x=model.coefficients,homeRate=Math.exp(x[0]+x[1]+x[2+i]+x[2+n+j]),awayRate=Math.exp(x[0]+x[2+j]+x[2+n+i]);
  const grid=distribution(homeRate,awayRate,model.config.rho);
  return grid ? {home,away,homeRate,awayRate,probabilities:marketsFromGrid(grid,line),line}:null;
}
export function baselines(rows) {
  const p={oneXTwo:[1,1,1],btts:1,over:1};let h=0,a=0;
  for(const r of rows){const [x,y]=r.goals;p.oneXTwo[x>y?0:x===y?1:2]++;p.btts+=Number(x>0&&y>0);p.over+=Number(x+y>2.5);h+=x;a+=y;}
  return {empirical:{oneXTwo:p.oneXTwo.map(v=>v/(rows.length+3)),btts:p.btts/(rows.length+2),over:p.over/(rows.length+2)},
    leaguePoisson:marketsFromGrid(distribution(h/rows.length,a/rows.length))};
}
