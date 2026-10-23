import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {sha256} from '../goals/data.mjs';
import {validateReproduction} from '../prospective/freeze.mjs';
import {digest,verifyEnvelope} from '../prospective/store.mjs';

export async function modelIdentity(root) {
  const texts=await Promise.all(['data','model','metrics','study','bridge'].map(n=>fs.readFile(path.join(root,`scripts/lib/goals/${n}.mjs`),'utf8')));
  const protocol=await fs.readFile(path.join(root,'docs/protocollo-modello-gol-v1.md'),'utf8'),normalize=t=>t.replace(/\r\n/g,'\n');
  let repositoryCommit=null,repositoryDirty=null;try{
    repositoryCommit=(await promisify(execFile)('git',['-C',root,'rev-parse','HEAD'])).stdout.trim();
    repositoryDirty=Boolean((await promisify(execFile)('git',['-C',root,'status','--porcelain'])).stdout.trim());
  }catch{ /* hashes still mandatory */ }
  return {codeRawSha256:sha256(texts.join('\n')),codeCanonicalSha256:sha256(texts.map(normalize).join('\n')),
    protocolRawSha256:sha256(protocol),protocolCanonicalSha256:sha256(normalize(protocol)),repositoryCommit,repositoryDirty};
}
export async function readRegistry(root,studyPath,loadJson) {
  const study=await loadJson(studyPath),dataset=await loadJson(path.join(root,'.local/model/datasets',study.datasetSha256+'.json'));
  const identity=await modelIdentity(root);validateReproduction(study,dataset,identity);
  return {study,dataset,identity};
}
export function validateCurrentDataset(input,now) {
  const dataset=input?.schema==='lamultipla-prospective-envelope-v1'?verifyEnvelope(input):input,clock=new Date(now).getTime();
  if(!Number.isFinite(clock)||dataset?.schema!=='lamultipla-results-dataset-v1'||dataset.source!=='openfootball/football.json'
    ||dataset.license!=='CC0-1.0'||dataset.licenseSha256!=='36ffd9dc085d529a7e60e1276d73ae5a030b020313e6c5408593a6ae2af39673'
    ||!/^[a-f0-9]{40}$/.test(dataset.commit)||!Number.isFinite(Date.parse(dataset.acquiredAtUtc))||Date.parse(dataset.acquiredAtUtc)>clock
    ||!Number.isFinite(Date.parse(dataset.cutoffUtc))||Date.parse(dataset.cutoffUtc)>clock
    ||!Array.isArray(dataset.files)||!dataset.files.length||dataset.files.some(f=>!/^[a-f0-9]{64}$/.test(f.sha256)||!/^\d{4}-\d{2}\/it\.1\.json$/.test(f.path))
    ||!Array.isArray(dataset.rows)||new Set(dataset.rows.map(r=>r.key)).size!==dataset.rows.length)throw new Error('Current results dataset invalid/unobserved');
  for(const r of dataset.rows)if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date
    ||!/^\d{4}-\d{2}$/.test(r.season)||r.key!==`${r.season}:${r.home}:${r.away}`
    ||!Number.isFinite(Date.parse(r.availableAtUtc))||Date.parse(r.availableAtUtc)!==Date.parse(r.date)+48*3600000||Date.parse(r.availableAtUtc)>clock
    ||typeof r.home!=='string'||!r.home.trim()||typeof r.away!=='string'||!r.away.trim()||r.home===r.away
    ||!Array.isArray(r.goals)||r.goals.length!==2||r.goals.some(g=>!Number.isInteger(g)||g<0||g>30))throw new Error('Invalid current result row');
  return {dataset,sha256:digest(dataset)};
}
