import fs from 'node:fs/promises';
import path from 'node:path';
import {digest} from '../prospective/store.mjs';
export async function b1Identity(root){
 const paths=['mapping','diagnostic','identity'].map(n=>'scripts/lib/diagnostic-goals-b1/'+n+'.mjs');
 const source=await Promise.all(paths.map(async p=>[p,(await fs.readFile(path.join(root,p),'utf8')).replace(/\r\n/g,'\n')]));
 return {version:'goals-mapping-b1-v1',paths,codeCanonicalSha256:digest(source),scientificStudyChanged:false};
}
