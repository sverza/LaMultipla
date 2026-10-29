import {syntheticCompositionFixture} from './mm-composition.mjs';
import {PROTOTYPE_INPUT_SCHEMA} from '../../scripts/lib/mm-simulator-v1/prototype-analysis.mjs';

export async function syntheticPrototypeFixture({activeFixtures=2}={}){
 const f=await syntheticCompositionFixture({events:10});
 for(let i=activeFixtures;i<f.raw.length;i++)for(const m of Object.values(f.raw[i].bookmakerOdds['bet365.it'].markets))m.marketActive=false;
 f.rebuild();
 const convert=()=>{const {search,scenario,...data}=f.input;void search;void scenario;return {schema:PROTOTYPE_INPUT_SCHEMA,synthetic:true,
  policyRegisteredInSimulationAtUtc:'2026-10-16T12:40:00.000Z',data};};
 return {source:f,input:convert(),rebuild(){f.rebuild();this.input=convert();return this.input;}};
}
