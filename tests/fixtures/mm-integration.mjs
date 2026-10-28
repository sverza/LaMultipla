// Only invented teams, observations, reviews and ticket prices. Not a pilot.
import fs from 'node:fs/promises';
import path from 'node:path';
import {syntheticReaderArchive} from './mm-reader.mjs';
import {syntheticReviewedContext} from './context.mjs';
import {loadSyntheticReaderDiagnostic} from '../../scripts/lib/mm-simulator-v1/prospective-reader.mjs';
import {hashValue,hashBytes} from '../../scripts/lib/mm-simulator-v1/contracts.mjs';
import {REVIEW_SCHEMA,TICKET_SCHEMA} from '../../scripts/lib/mm-simulator-v1/composition-gates.mjs';
import {PROTOTYPE_POLICY_SHA256} from '../../scripts/lib/mm-simulator-v1/prototype-policy.mjs';
import {SYNTHETIC_INTEGRATION_SCHEMA,SYNTHETIC_EVIDENCE_SCHEMA} from '../../scripts/lib/mm-simulator-v1/synthetic-integration.mjs';

export async function syntheticIntegratedFixture(root,{activeFixtures=2,missingFixture=false,round=9}={}){
 const f=await syntheticReaderArchive(root,{round});
 for(let i=activeFixtures;i<f.raw.length;i++)for(const market of Object.values(f.raw[i].bookmakerOdds['bet365.it'].markets))market.marketActive=false;
 if(missingFixture){f.raw.pop();f.bindings.events.pop();}await f.save();
 const filename=path.join(root,'.local/integration-fixture/input.json'),evidenceFile=path.join(root,'.local/integration-fixture/evidence.json');
 const ref=async file=>({ref:file,sha256:hashBytes(await fs.readFile(file))});
 let config,evidence,reader;
 async function saveEvidence(mutator=()=>{}){
  reader=await loadSyntheticReaderDiagnostic(root,f.cfg,f.readAtUtc);const d=reader.content.diagnostic;
  evidence={schema:SYNTHETIC_EVIDENCE_SCHEMA,synthetic:true,sourceKind:'SYNTHETIC_TEST_ONLY',scope:f.scope,
   readerContentSha256:reader.contentSha256,policySha256:PROTOTYPE_POLICY_SHA256,policyRegisteredInSimulationAtUtc:'2026-10-30T12:40:00.000Z',
   context:syntheticReviewedContext(f.b.journalV2.manifest,f.readAtUtc),
   calendar:{synthetic:true,diagnosticSha256:d.canonicalSha256,officialObservedAtUtc:'2026-10-30T12:20:00.000Z',providerObservedAtUtc:'2026-10-30T12:20:00.000Z',
    eventsSha256:hashValue(d.boardStates.filter((b,i,a)=>a.findIndex(x=>x.event.id===b.event.id)===i).map(b=>b.event))},
   selectionReviews:d.records.map(r=>({schema:REVIEW_SCHEMA,synthetic:true,quoteId:r.quoteId,diagnosticSha256:d.canonicalSha256,recordSha256:hashValue(r),
    reviewer:'SYNTHETIC_TEST_REVIEWER',evidence:'SYNTHETIC_TEST_VECTOR',observedPrice:r.historicalPrice,available:true,reviewedAtUtc:f.readAtUtc,oldChangeReviewed:true,
    rules:{family:r.family,line:r.line,period:r.period,regulationTimeIncludingStoppage:true,extraTimeExcluded:true,penaltiesExcluded:true,
     voidAndPostponementReviewed:true,definitionSha256:'a'.repeat(64),reviewedAtUtc:f.readAtUtc}})),ticketReviews:[]};
  const records=d.records.filter(r=>['YES','OVER'].includes(r.outcome)&&d.boardStates.find(b=>b.boardId===r.boardId)?.boardAvailability==='OPEN');
  for(let i=0;i<records.length;i++)for(let j=i+1;j<records.length;j++)if(records[i].event.id!==records[j].event.id){
   const ids=[records[i].quoteId,records[j].quoteId];evidence.ticketReviews.push({schema:TICKET_SCHEMA,synthetic:true,diagnosticSha256:d.canonicalSha256,
    quoteIds:ids,selectionReviewSha256:ids.map(id=>hashValue(evidence.selectionReviews.find(r=>r.quoteId===id))),kind:'ordinary_accumulator',bookmaker:'bet365.it',
    available:true,reviewer:'SYNTHETIC_TEST_REVIEWER',evidence:'SYNTHETIC_EXACT_TICKET_OBSERVATION',price:1.4,reviewedAtUtc:f.readAtUtc});
  }
  mutator(evidence);await f.write(evidenceFile,evidence);
  config={schema:SYNTHETIC_INTEGRATION_SCHEMA,synthetic:true,sourceKind:'SYNTHETIC_TEST_ONLY',scope:f.scope,
   readerInput:await ref(f.cfg),evidence:await ref(evidenceFile),simulationAtUtc:f.readAtUtc,policySha256:PROTOTYPE_POLICY_SHA256};
  await f.write(filename,config);return evidence;
 }
 await saveEvidence();return {...f,filename,evidenceFile,saveEvidence,ref,get config(){return config;},get evidence(){return evidence;},get reader(){return reader;}};
}
