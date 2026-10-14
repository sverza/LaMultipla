import fs from 'node:fs/promises';
import path from 'node:path';
import {sha256} from '../goals/data.mjs';
import {validateStudy} from './forecast.mjs';
export async function engineCodeIdentity(root){
  const paths=(await fs.readdir(path.join(root,'scripts/lib/engine'))).filter(n=>n.endsWith('.mjs')).sort().map(n=>'scripts/lib/engine/'+n);
  paths.push(...['data','model','metrics'].map(n=>'scripts/lib/goals/'+n+'.mjs'));
  const contents=await Promise.all(paths.map(p=>fs.readFile(path.join(root,p),'utf8')));
  return {paths,sha256:sha256(contents.map((s,i)=>paths[i]+'\n'+s.replace(/\r\n/g,'\n')).join('\n')),
    protocolSha256:sha256((await fs.readFile(path.join(root,'docs/protocollo-motore-gol-v2.md'),'utf8')).replace(/\r\n/g,'\n'))};
}
export async function requireRegisteredCode(root,study){validateStudy(study);const identity=await engineCodeIdentity(root);
  if(study.modelCodeSha256!==identity.sha256||study.protocolSha256!==identity.protocolSha256)throw new Error('Engine code/protocol differs from registered development study; new version required');return identity;}
