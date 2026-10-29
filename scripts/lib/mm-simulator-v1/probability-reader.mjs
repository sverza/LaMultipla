import fs from 'node:fs/promises';
import path from 'node:path';
import {loadFrozenReference} from '../reference-screen.mjs';
import {privateInput} from '../orchestration/analysis-plan.mjs';
import {loadOfflineBoards} from '../../multimarket-boards.mjs';
import {parseSource,hashBytes,hashValue,exactFields} from './contracts.mjs';
import {diagnoseProbabilityBoards} from './probabilities.mjs';

export const PROBABILITY_INPUT_SCHEMA='lamultipla-mm-probability-input-v1';
export async function loadProbabilityDiagnostic(root,filename){
 const file=await privateInput(root,filename),bytes=await fs.readFile(file),config=parseSource(bytes,{ref:file,sha256:hashBytes(bytes)});
 if(!exactFields(config,['schema','boardsInput','referencePlan'])||config.schema!==PROBABILITY_INPUT_SCHEMA)throw Error('MM2_INPUT_INVALID');
 const loadRef=async reference=>{
  const resolved=await privateInput(root,path.resolve(path.dirname(file),reference?.ref??'')),content=await fs.readFile(resolved);
  const value=parseSource(content,reference);return {file:resolved,bytes:content,value};
 };
 const boardInput=await loadRef(config.boardsInput),plan=await loadRef(config.referencePlan);
 // Official historical verification only. This cannot complete an intent or fit models.
 const reference=await loadFrozenReference(root,plan.file);
 if(hashValue(reference.extensionJournal)!==reference.verified.journals.v2.sha256)throw Error('MM2_FROZEN_JOURNAL_LINK_CHANGED');
 const boards=await loadOfflineBoards(boardInput.file);
 if(boards.bindingSha256!==hashValue(boardInput.value.bindings)||['raw','catalog','report'].some(key=>hashValue(boards.source[key])!==hashValue(boardInput.value.source[key])))
  throw Error('MM2_BOARD_INPUT_LINK_CHANGED');
 const diagnostic=diagnoseProbabilityBoards({boards,journal:reference.extensionJournal,study:reference.input.study,freezeCompletedAtUtc:reference.frozenAtUtc});
 if(hashBytes(await fs.readFile(plan.file))!==hashBytes(plan.bytes)||hashBytes(await fs.readFile(boardInput.file))!==hashBytes(boardInput.bytes))throw Error('MM2_INPUT_CHANGED_DURING_READ');
 const result={schema:'lamultipla-mm-probability-report-v1',verification:{method:'loadFrozenReference',status:reference.verified.status,
  cohortId:reference.verified.cohortId,receiptSha256:reference.verified.receiptSha256,journal:reference.verified.journals.v2,
  plan:{ref:plan.file,sha256:hashBytes(plan.bytes)},boardsInput:{ref:boardInput.file,sha256:hashBytes(boardInput.bytes)},
  readOnly:true,forecastExecuted:false,providerRequests:0},diagnostic};
 return {...result,canonicalSha256:hashValue(result)};
}
