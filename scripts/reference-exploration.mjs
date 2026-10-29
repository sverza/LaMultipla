// No API calls, quote acquisition, selector, scientific decision or delivery.
import path from 'node:path';
import {verifyFrozenRound} from './lib/reference-odds/round-freeze.mjs';
import {createReadSession} from './lib/mm-simulator-v1/read-session.mjs';
import {hashValue,timestamp} from './lib/mm-simulator-v1/contracts.mjs';
import {adaptMoviOddsReference} from './lib/reference-odds/moviodds-offline.mjs';
import {exploreInternational} from './lib/reference-odds/exploratory.mjs';
const args=process.argv.slice(2),values={};for(let i=0;i<args.length;i+=2){const k=args[i];if(!['--plan','--input'].includes(k)||Object.hasOwn(values,k)||!args[i+1])throw Error('REFERENCE_EXPLORATION_ARGUMENT_INVALID');values[k]=args[i+1];}
if(!values['--plan']||!values['--input'])throw Error('EXPLICIT_PLAN_AND_APPROVED_REFERENCE_INPUT_REQUIRED');
try{
 const root=path.resolve('.'),now=new Date().toISOString(),verified=await verifyFrozenRound(root,values['--plan']);
 if(verified.status!=='FROZEN_VERIFIED')throw Error('REFERENCE_VERIFIED_FREEZE_REQUIRED');
 const session=createReadSession(root),input=(await session.json(values['--input'])).payload,
  approval=(await session.reference(input.approval,path.dirname(path.resolve(values['--input'])))).payload;
 if(input.schema!=='lamultipla-international-reference-execution-v1'||approval.schema!=='lamultipla-international-reference-approval-v1'
  ||approval.internationalShortlistAuthorized!==true||approval.packageSha256!==hashValue(verified.loaded.plan)
  ||approval.provenance!=='EXPLICIT_USER_APPROVAL_LOCAL_RECORD'||!approval.reviewer?.trim()
  ||!timestamp(approval.approvedAtUtc)||Date.parse(approval.approvedAtUtc)>Date.parse(now)||!timestamp(approval.expiresAtUtc)||Date.parse(approval.expiresAtUtc)<=Date.parse(now)
  ||hashValue(approval.slot)!==hashValue(input.slot))throw Error('REFERENCE_SHORTLIST_SEPARATE_APPROVAL_REQUIRED');
 const receipt=(await session.reference(input.moviReceipt,path.dirname(path.resolve(values['--input'])))).payload,
  wire=await session.bytes(input.moviRaw.ref,{reference:input.moviRaw}),
  boards=adaptMoviOddsReference({wireBytes:wire.bytes,receipt,rawReference:wire.reference,evaluatedAtUtc:now});
 const report=exploreInternational({manifest:verified.loaded.artifacts.manifest,bindings:verified.loaded.artifacts.bindings,
  journal:verified.journals.v2,study:verified.loaded.artifacts.studyV2,freezeCompletedAtUtc:verified.completedAtUtc,
  boards,slot:input.slot,evaluatedAtUtc:now,sourceKind:verified.sourceKind,
  calendar:{...verified.calendarAtFreeze,providerIdentitiesObservedAtUtc:boards.source.observedAtUtc}});
 await session.finish();await verified.loaded.session.finish();
 // Output only. The operator may redirect this diagnostic, never an authentic decision.
 console.log(JSON.stringify(report,null,2));
}catch(e){console.error(JSON.stringify({status:'STOP',reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'REFERENCE_EXPLORATION_VALIDATION_FAILED',decisionExecuted:false}));process.exitCode=1;}
