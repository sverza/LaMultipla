import {fitPoisson,distribution} from '../goals/model.mjs';
import {canonicalTeam} from '../goals/data.mjs';

export const logFactorial=Array.from({length:61},(_,n)=>{let v=0;for(let i=2;i<=n;i++)v+=Math.log(i);return v;});
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export function minimize(objective,initial,{maxIterations=600,tolerance=1e-4}={}) {
  let x=Float64Array.from(initial),state=objective(x),iterations=0,converged=false;const history=[];
  if(!Number.isFinite(state.cost))throw new Error('Invalid likelihood initialization');
  const initialCost=state.cost;
  for(;iterations<maxIterations;iterations++) {
    if(Math.max(...Array.from(state.gradient,Math.abs))<=tolerance){converged=true;break;}
    const q=Float64Array.from(state.gradient),alpha=[];
    for(let k=history.length-1;k>=0;k--){const h=history[k];alpha[k]=h.inverse*dot(h.s,q);for(let j=0;j<q.length;j++)q[j]-=alpha[k]*h.y[j];}
    const last=history.at(-1),scale=last?dot(last.s,last.y)/dot(last.y,last.y):1;
    const direction=q.map(v=>v*scale);
    for(let k=0;k<history.length;k++){const h=history[k],beta=h.inverse*dot(h.y,direction);for(let j=0;j<q.length;j++)direction[j]+=h.s[j]*(alpha[k]-beta);}
    for(let j=0;j<q.length;j++)direction[j]*=-1;
    if(dot(direction,state.gradient)>=0){history.length=0;direction.set(state.gradient.map(v=>-v));}
    const slope=dot(direction,state.gradient);let step=1,next,proposal,accepted=false;
    for(let k=0;k<35;k++){proposal=x.map((v,j)=>v+step*direction[j]);next=objective(proposal);
      if(Number.isFinite(next.cost)&&next.cost<=state.cost+1e-4*step*slope){accepted=true;break;}step/=2;}
    if(!accepted)break;
    const s=proposal.map((v,j)=>v-x[j]),y=next.gradient.map((v,j)=>v-state.gradient[j]),sy=dot(s,y);
    if(sy>1e-12){history.push({s,y,inverse:1/sy});if(history.length>10)history.shift();}
    x=proposal;state=next;
  }
  if(Math.max(...Array.from(state.gradient,Math.abs))<=tolerance)converged=true;
  return {coefficients:Array.from(x),converged,iterations,initialCost,cost:state.cost,gradientMax:Math.max(...Array.from(state.gradient,Math.abs))};
}
export function bivariateLogProbability(y,z,a,b,c) {
  if(![y,z].every(v=>Number.isInteger(v)&&v>=0&&v<=30)||![a,b,c].every(v=>Number.isFinite(v)&&v>0))return null;
  const terms=[];for(let k=0;k<=Math.min(y,z);k++)terms.push((y-k)*Math.log(a)+(z-k)*Math.log(b)+k*Math.log(c)-logFactorial[y-k]-logFactorial[z-k]-logFactorial[k]);
  const max=Math.max(...terms),weights=terms.map(v=>Math.exp(v-max)),sum=weights.reduce((s,v)=>s+v,0);
  return {logProbability:-a-b-c+max+Math.log(sum),sharedMean:weights.reduce((s,v,k)=>s+v*k,0)/sum};
}
export function likelihood(rows,cutoffUtc,teams,config) {
  const n=teams.length,ids=new Map(teams.map((t,i)=>[t,i]));
  const records=rows.map(r=>[ids.get(r.home),ids.get(r.away),...r.goals,Math.exp(-Math.LN2*(Date.parse(cutoffUtc)-Date.parse(r.date))/86400000/config.halfLife)]);
  return x=>{
    const gradient=new Float64Array(x.length);let cost=0;const rho=.2*Math.tanh(x.at(-1)),rhoDerivative=.2*(1-Math.tanh(x.at(-1))**2),shared=Math.exp(x.at(-1));
    for(const [i,j,y,z,w] of records){
      const hi=[0,1,2+i,2+n+j],ai=[0,2+j,2+n+i],eh=hi.reduce((s,k)=>s+x[k],0),ea=ai.reduce((s,k)=>s+x[k],0),a=Math.exp(eh),b=Math.exp(ea);
      if(!Number.isFinite(a+b)||a<=0||b<=0||a>12||b>12)return {cost:Infinity,gradient};
      let gh,ga,gc=0;
      if(config.kind==='dc'){
        const tau=[1-a*b*rho,1+a*rho,1+b*rho,1-rho];if(tau.some(v=>v<=0))return {cost:Infinity,gradient};
        cost+=w*(a+b-y*eh-z*ea+logFactorial[y]+logFactorial[z]);gh=a-y;ga=b-z;
        if(y<=1&&z<=1){const k=y*2+z,t=tau[k],dh=[-a*b*rho,a*rho,0,0][k],da=[-a*b*rho,0,b*rho,0][k],dr=[-a*b,a,b,-1][k];
          cost-=w*Math.log(t);gh-=dh/t;ga-=da/t;gc=-dr/t*rhoDerivative;}
      }else{
        if(a+shared>12||b+shared>12)return {cost:Infinity,gradient};
        const p=bivariateLogProbability(y,z,a,b,shared);if(!p)return {cost:Infinity,gradient};
        cost-=w*p.logProbability;gh=a-y+p.sharedMean;ga=b-z+p.sharedMean;gc=shared-p.sharedMean;
      }
      for(const k of hi)gradient[k]+=w*gh;for(const k of ai)gradient[k]+=w*ga;gradient[gradient.length-1]+=w*gc;
    }
    for(let k=2;k<2+2*n;k++){cost+=config.ridge*x[k]**2/2;gradient[k]+=config.ridge*x[k];}
    return {cost,gradient};
  };
}
export function fitGoals(rows,cutoffUtc,config) {
  if(!['dc','bivariate'].includes(config?.kind))throw new Error('Unknown candidate');
  if(rows.some(r=>!Array.isArray(r.goals)||r.goals.some(g=>!Number.isInteger(g)||g<0||g>30)))throw new Error('Invalid training results');
  const initial=fitPoisson(rows,cutoffUtc,{halfLife:config.halfLife,ridge:config.ridge,rho:0});
  const solution=minimize(likelihood(rows,cutoffUtc,initial.teams,config),[...initial.coefficients,config.kind==='dc'?0:Math.log(.05)]);
  return {...initial,...solution,schema:'lamultipla-goals-fit-v2',config:{kind:config.kind,halfLife:config.halfLife,ridge:config.ridge},
    rho:config.kind==='dc'?.2*Math.tanh(solution.coefficients.at(-1)):null,sharedRate:config.kind==='bivariate'?Math.exp(solution.coefficients.at(-1)):null};
}
export function bivariateGrid(a,b,c) {
  if(![a,b,c].every(v=>Number.isFinite(v)&&v>=0)||a+c>12||b+c>12)return null;
  const grid=Array.from({length:31},()=>Array(31).fill(0));grid[0][0]=Math.exp(-a-b-c);
  for(let j=1;j<=30;j++)grid[0][j]=grid[0][j-1]*b/j;
  for(let i=1;i<=30;i++)for(let j=0;j<=30;j++)grid[i][j]=(a*grid[i-1][j]+(j?c*grid[i-1][j-1]:0))/i;
  const mass=grid.flat().reduce((s,v)=>s+v,0);return Math.abs(mass-1)<=1e-8?grid.map(r=>r.map(p=>p/mass)):null;
}
export function temper(grid,temperature=1) {
  if(!grid||!Number.isFinite(temperature)||temperature<=0)return null;
  const values=grid.map(r=>r.map(p=>p**(1/temperature))),mass=values.flat().reduce((s,v)=>s+v,0);
  return mass>0?values.map(r=>r.map(v=>v/mass)):null;
}
export function predictGrid(fit,home,away,temperature=1) {
  home=canonicalTeam(home);away=canonicalTeam(away);const n=fit.teams.length,i=fit.teams.indexOf(home),j=fit.teams.indexOf(away),x=fit.coefficients;
  if(!fit.converged||i<0||j<0||home===away||fit.counts[home]<20||fit.counts[away]<20)return null;
  const a=Math.exp(x[0]+x[1]+x[2+i]+x[2+n+j]),b=Math.exp(x[0]+x[2+j]+x[2+n+i]);
  const grid=fit.config.kind==='bivariate'?bivariateGrid(a,b,fit.sharedRate):distribution(a,b,fit.rho??fit.config.rho??0);
  return temper(grid,temperature);
}
