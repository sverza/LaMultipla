import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {sha256} from '../goals/data.mjs';
export async function contextIdentity(root){
  const paths=(await fs.readdir(path.join(root,'scripts/lib/context'))).filter(f=>f.endsWith('.mjs')).sort().map(f=>'scripts/lib/context/'+f);
  paths.push('scripts/context.mjs');const texts=await Promise.all(paths.map(f=>fs.readFile(path.join(root,f),'utf8')));
  let repositoryCommit=null,repositoryDirty=null;try{repositoryCommit=(await promisify(execFile)('git',['-C',root,'rev-parse','HEAD'])).stdout.trim();
    repositoryDirty=Boolean((await promisify(execFile)('git',['-C',root,'status','--porcelain'])).stdout.trim());}catch{/* Content hashes remain available. */}
  return {contextCodePaths:paths,contextCodeSha256:sha256(texts.map((t,i)=>paths[i]+'\n'+t.replace(/\r\n/g,'\n')).join('\n')),
    contextProtocolSha256:sha256((await fs.readFile(path.join(root,'docs/protocollo-contesto-v1.md'),'utf8')).replace(/\r\n/g,'\n')),repositoryCommit,repositoryDirty};
}
