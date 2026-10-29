import fs from 'node:fs/promises';
import path from 'node:path';
import {digest} from '../prospective/store.mjs';
export const REFERENCE_SOURCES=Object.freeze({
  "scripts/lib/engine/screen.mjs": "f120ce7696e912c37ce6611995b6a55ecc10c9a5ced687633d41b3f7c84324f7",
  "scripts/lib/diagnostics/multimarket.mjs": "c567e92daf818675648cbfd7160f03573302dd8d95b9835c144a8b123d935df2",
  "scripts/lib/availability.mjs": "b918d9687d1771fbfe44cec31daef2b69766402c73d6257649f6a0168c426e07",
  "scripts/lib/decision/gates.mjs": "e68dd912da96545a9092caa219e46b06120f834ec0510e67d6411785349e7951"
});
export async function diagnosticPerformanceIdentity(root){
 for(const [file,expected] of Object.entries(REFERENCE_SOURCES)){
  const actual=digest((await fs.readFile(path.join(root,file),'utf8')).replace(/\r\n/g,'\n'));
  if(actual!==expected)throw Error('DIAGNOSTIC_REFERENCE_SOURCE_CHANGED');
 }
 const paths=(await fs.readdir(path.join(root,'scripts/lib/diagnostic-performance'))).filter(n=>n.endsWith('.mjs')).sort().map(n=>'scripts/lib/diagnostic-performance/'+n);
 const sources=await Promise.all(paths.map(async p=>[p,(await fs.readFile(path.join(root,p),'utf8')).replace(/\r\n/g,'\n')]));
 return {version:'diagnostic-performance-v1',referenceSources:REFERENCE_SOURCES,paths,codeCanonicalSha256:digest(sources),scientificPolicyChanged:false};
}
