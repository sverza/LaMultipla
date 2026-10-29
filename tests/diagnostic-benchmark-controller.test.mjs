import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {syntheticMultimarket} from './fixtures/multimarket.mjs';
import {ROOT} from '../scripts/lib/private-store.mjs';
import {readSnapshot} from '../scripts/lib/prospective/store.mjs';
test('controlled reference timeout retains outcome and diagnostics and reaps its only worker',async()=>{
 const s=await syntheticMultimarket(),directory=path.join(ROOT,'.local/tests/benchmark-'+crypto.randomUUID());await fs.mkdir(directory,{recursive:true});
 const file=path.join(directory,'shape.json'),shape={coverage:s.journal.entries.map(e=>({fixtureId:e.fixtureId})),selections:[]};
 // Sufficient work even on fast CI; no original prices or real player/team data.
 for(let i=0;i<130;i++)shape.selections.push(...s.report.selections);
 await fs.writeFile(file,JSON.stringify(shape));let result;
 try{await promisify(execFile)(process.execPath,[path.join(ROOT,'scripts/benchmark-diagnostic.mjs'),'--shape',file,'--mode','reference','--timeout','1'],{cwd:ROOT,windowsHide:true});}
 catch(e){assert.equal(e.code,2);result=JSON.parse(e.stdout);}
 assert.equal(result?.status,'TIMEOUT');const outcome=await readSnapshot(path.join(result.directory,'outcome.private.json'));
 assert.equal(outcome.status,'TIMEOUT');assert.ok(outcome.workerPid>0);assert.equal(outcome.completion.code,null);
 assert.throws(()=>process.kill(outcome.workerPid,0),e=>e.code==='ESRCH');
 assert.ok(await fs.stat(path.join(result.directory,'intent.private.json')));
});
