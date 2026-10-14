import fs from 'node:fs/promises';
import path from 'node:path';
import {sha256} from '../goals/data.mjs';
export async function diagnosticIdentity(root){
 const files=(await fs.readdir(path.join(root,'scripts/lib/diagnostics'))).filter(n=>n.endsWith('.mjs')).sort().map(n=>'scripts/lib/diagnostics/'+n);
 files.unshift('scripts/multimarket-diagnostic.mjs');const contents=await Promise.all(files.map(f=>fs.readFile(path.join(root,f),'utf8')));
 return {paths:files,codeCanonicalSha256:sha256(contents.map((s,i)=>files[i]+'\n'+s.replace(/\r\n/g,'\n')).join('\n')),
  protocolCanonicalSha256:sha256((await fs.readFile(path.join(root,'docs/protocollo-multimercato-diagnostico-v1.md'),'utf8')).replace(/\r\n/g,'\n'))};
}
