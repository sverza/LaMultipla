import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSeason,trainingBefore} from '../scripts/lib/goals/data.mjs';
import {distribution,marketsFromGrid,fitPoisson,predict} from '../scripts/lib/goals/model.mjs';
import {metrics,evaluateAcceptance,pairedCI} from '../scripts/lib/goals/metrics.mjs';
import {quoteProbabilities} from '../scripts/lib/goals/bridge.mjs';
function syntheticRows(){return Array.from({length:160},(_,i)=>({key:String(i),season:'2021-22',date:'2021-09-01',
  availableAtUtc:'2021-09-03T00:00:00Z',home:i%2?'A':'B',away:i%2?'B':'A',goals:[i%4,(i*7)%3]}));}
test('coherent goal distribution agrees with independent analytic probabilities',()=>{
  const p=marketsFromGrid(distribution(1.7,.8));
  assert.ok(Math.abs(p.btts-(1-Math.exp(-1.7))*(1-Math.exp(-.8)))<1e-10);
  assert.ok(Math.abs(p.oneXTwo.reduce((a,b)=>a+b,0)-1)<1e-10);
  assert.ok(Math.abs(p.over-(1-Math.exp(-2.5)*(1+2.5+2.5**2/2)))<1e-10);
  assert.ok(Math.abs(p.over+p.under-1)<1e-10);
  const dc=marketsFromGrid(distribution(1.7,.8,-.1));assert.ok(dc.oneXTwo[1]>p.oneXTwo[1]);
  assert.ok(Math.abs(dc.over-p.over)<1e-10);
  assert.equal(distribution(100,1),null);assert.equal(distribution(3,3,.5),null);
});
test('training is strictly prior to cutoff including result availability buffer',()=>{
  const rows=syntheticRows();assert.equal(trainingBefore(rows,'2021-09-03T00:00:00Z').length,0);
  assert.equal(trainingBefore(rows,'2021-09-04T00:00:00Z').length,160);
  assert.throws(()=>fitPoisson(rows,'2021-09-03T00:00:00Z'));
  const model=fitPoisson(rows,'2021-09-04T00:00:00Z');assert.equal(model.converged,true);
  assert.equal(predict(model,'unknown','B'),null);
  const forced=fitPoisson(rows,'2021-09-04T00:00:00Z',{maxIterations:0});assert.equal(predict(forced,'A','B'),null);
});
test('normalize results rejects invalid identities, scores, season and conflicting duplicates',()=>{
  const m={date:'2023-08-20',team1:'Inter',team2:'Parma Calcio',score:{ft:[2,0]}},input={name:'Italian Serie A 2023/24',matches:[m]};
  const d=normalizeSeason(input,'2023-24','2023-08-23T00:00:00Z');assert.equal(d.rows[0].home,'FC Internazionale Milano');
  assert.equal(normalizeSeason(input,'2023-24','2023-08-22T00:00:00Z').rows.length,0);
  for(const bad of [{...m,score:{ft:[null,0]}},{...m,date:'2023-02-30'},{...m,team2:'Inter'}])assert.throws(()=>normalizeSeason({...input,matches:[bad]},'2023-24','2024-01-01T00:00:00Z'));
  assert.throws(()=>normalizeSeason({...input,matches:[m,{...m,score:[3,0]}]},'2023-24','2024-01-01T00:00:00Z'));
  assert.throws(()=>normalizeSeason({...input,name:'other competition'},'2023-24','2024-01-01T00:00:00Z'));
});
test('proper scoring rules, calibration intervals and deterministic paired bootstrap',()=>{
  const r={date:'2025-01-01',y:{oneXTwo:0,btts:1,over:0},model:{oneXTwo:[.8,.1,.1],btts:.8,over:.2},empirical:{oneXTwo:[.3,.3,.4],btts:.5,over:.5},leaguePoisson:{oneXTwo:[.3,.3,.4],btts:.5,over:.5}};
  assert.ok(Math.abs(metrics([r],'btts').brier-.04)<1e-12);assert.ok(Math.abs(metrics([r],'oneXTwo').brier-.06)<1e-12);
  assert.equal(metrics([r],'btts').calibration[0].curve[8].n,1);
  assert.deepEqual(pairedCI([r],'btts','empirical'),pairedCI([r],'btts','empirical'));
  const a=evaluateAcceptance([r],380,[{results:380}]);assert.equal(a.btts.retrospectiveAccepted,false);
  assert.equal(a.btts.operationallyApproved,false);
});
test('goal forecasts map only correct event and validated fulltime market definitions',()=>{
  const model=fitPoisson(syntheticRows(),'2021-09-04T00:00:00Z'),central=predict(model,'A','B'),forecast={model,central};
  const q={fixture:['A','B'],period:'fulltime',marketType:'totals',outcome:'Over',line:2.5,kickoffUtc:'2021-09-05T00:00:00Z'};
  assert.ok(quoteProbabilities(forecast,q));
  for(const patch of [{period:'firsthalf'},{fixture:['B','A']},{line:1.5},{marketType:'totals-corners'},{playerKey:'person'},{kickoffUtc:model.cutoffUtc}])assert.equal(quoteProbabilities(forecast,{...q,...patch}),null);
});

test('appending future results cannot change training or a frozen forecast',()=>{
  const old=syntheticRows(),cutoff='2021-09-04T00:00:00Z';
  const future={...old[0],date:'2022-01-01',availableAtUtc:'2022-01-03T00:00:00Z',goals:[30,30]};
  const a=fitPoisson(trainingBefore(old,cutoff),cutoff),b=fitPoisson(trainingBefore([...old,future],cutoff),cutoff);
  assert.deepEqual(a,b);assert.deepEqual(predict(a,'A','B'),predict(b,'A','B'));
});

test('acceptance gate requires paired improvement and calibration, not EV',()=>{
  const records=Array.from({length:600},(_,i)=>({date:new Date(Date.UTC(2024,0,1)+i*86400000).toISOString().slice(0,10),
    y:{oneXTwo:i%10===0?1:0,btts:Number(i%10!==0),over:Number(i%10!==0)},
    model:{oneXTwo:[.9,.1,0],btts:.9,over:.9},empirical:{oneXTwo:[.4,.3,.3],btts:.5,over:.5},leaguePoisson:{oneXTwo:[.4,.3,.3],btts:.5,over:.5}}));
  const result=evaluateAcceptance(records,600,[{results:380}]);assert.equal(result.btts.retrospectiveAccepted,true);
  assert.equal(result.btts.operationallyApproved,false);
  const incomplete=evaluateAcceptance(records,600,[{results:300}]);assert.equal(incomplete.btts.retrospectiveAccepted,false);
});
