import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../scripts/lib/private-store.mjs';
import {digest,writeExclusive} from '../scripts/lib/prospective/store.mjs';
import {inspectG6CheckHistory} from '../scripts/lib/audit/g6-check-history.mjs';
test('G6 read-only history distinguishes no record, orphan intent, completed pending and broken links without scoring',async()=>{
 const root=path.join(ROOT,'.local/tests/history-'+crypto.randomUUID()),original={journal:{id:'SYNTHETIC'},baseline:{synthetic:true},fileHashes:{journal:'a',baseline:'b'},summary:{status:'DUE_REQUIRES_RECORD'}};
 assert.equal((await inspectG6CheckHistory(root,original)).status,'DUE_REQUIRES_RECORD');
 const dir=path.join(root,'.local/model/prospective/checks/SYNTHETIC/test');await writeExclusive(path.join(dir,'intent.json'),{synthetic:true});
 assert.equal((await inspectG6CheckHistory(root,original)).incompleteIntents,1);
 const checkedAtUtc='2026-10-18T23:00:00Z',observation={synthetic:true,source:'openfootball/football.json',license:'CC0-1.0',acquiredAtUtc:checkedAtUtc},counts={planned:10,settled:0,pending:10};
 const evaluation={journalSha256:digest(original.journal),resultsSha256:digest(observation),evaluatedAtUtc:checkedAtUtc,counts};
 await writeExclusive(path.join(dir,'results.json'),observation);
 const evfile=path.join(root,'.local/model/prospective/evaluations/SYNTHETIC',digest(observation)+'.json');await writeExclusive(evfile,evaluation);
 await writeExclusive(path.join(dir,'check.json'),{schema:'lamultipla-original-g6-check-v1',journalSha256:digest(original.journal),baselineSha256:digest(original.baseline),
  originalFileHashes:original.fileHashes,originalForecastUnchanged:true,supplementalSourceUsed:false,startedAtUtc:'2026-10-18T22:59:00Z',checkedAtUtc,
  resultsSha256:digest(observation),evaluationSha256:digest(evaluation),counts,status:'EVALUATED_WITH_PENDING'});
 const result=await inspectG6CheckHistory(root,original,{now:'2026-10-19T00:00:00Z'});assert.equal(result.status,'EVALUATED_WITH_PENDING');assert.equal(result.completedChecks,1);assert.equal(result.evaluationExecuted,false);
 await fs.writeFile(evfile,JSON.stringify({corrupted:true}));await assert.rejects(inspectG6CheckHistory(root,original,{now:'2026-10-19T00:00:00Z'}),/hash/i);
});
