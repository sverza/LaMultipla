import fs from 'node:fs/promises';
import path from 'node:path';
import {hashBytes,parseSource,exactFields} from './contracts.mjs';
import {verifyEnvelope} from '../prospective/store.mjs';

const fail=code=>{throw Error(code);};
const inside=(base,file)=>{const r=path.relative(base,file);return r!==''&&!r.startsWith('..')&&!path.isAbsolute(r);};
// Shared by reader and replay verifier. No mkdir, locks, caches or recovery.
export async function assertReadNamespace(root,filename,{code=false}={}){
 const base=path.resolve(root);
 if(typeof filename!=='string'||!filename||/[?#\r\n]/.test(filename)||filename.includes('://'))fail('MM4_LOCAL_PATH_REQUIRED');
 if(await fs.realpath(base)!==base)fail('MM4_UNSAFE_PATH');
 const file=path.resolve(base,filename),namespace=code?base:path.join(base,'.local');
 if(!inside(namespace,file))fail('MM4_OUTSIDE_NAMESPACE');
 let cursor=base;const names=path.relative(base,file).split(path.sep);
 for(let i=0;i<names.length;i++){
  cursor=path.join(cursor,names[i]);const s=await fs.lstat(cursor);
  if(s.isSymbolicLink()||await fs.realpath(cursor)!==cursor||(i<names.length-1?!s.isDirectory():!s.isFile()))fail('MM4_UNSAFE_PATH');
 }
 return file;
}
export function createReadSession(root){
 const pins=new Map();
 async function bytes(filename,{reference=null,code=false}={}){
  const file=await assertReadNamespace(root,filename,{code}),s=await fs.lstat(file),handle=await fs.open(file,'r');let b;
  try{const opened=await handle.stat();if(opened.ino!==s.ino||opened.dev!==s.dev)fail('MM4_FILE_REPLACED');b=await handle.readFile();}
  finally{await handle.close();}
  await assertReadNamespace(root,file,{code});const after=await fs.lstat(file);
  if(s.ino!==after.ino||s.dev!==after.dev||s.size!==after.size||s.mtimeMs!==after.mtimeMs||b.length!==s.size)fail('MM4_FILE_CHANGED_DURING_READ');
  const pin={file,sha256:hashBytes(b),size:s.size,mtimeMs:s.mtimeMs,ino:s.ino,dev:s.dev,code};
  if(reference&&(!exactFields(reference,['ref','sha256'])||pin.sha256!==reference.sha256))fail('MM4_SOURCE_BYTES_MISMATCH');
  const previous=pins.get(file);if(previous&&JSON.stringify(previous)!==JSON.stringify(pin))fail('MM4_FILE_CHANGED_DURING_READ');
  pins.set(file,pin);return {file,bytes:b,reference:{ref:file,sha256:pin.sha256}};
 }
 async function json(filename,options={}){
  const read=await bytes(filename,options),value=parseSource(read.bytes,read.reference);
  return {...read,value,payload:value.schema==='lamultipla-prospective-envelope-v1'?verifyEnvelope(value):value};
 }
 async function sealed(filename,options={}){const r=await json(filename,options);if(r.value.schema!=='lamultipla-prospective-envelope-v1')fail('MM4_SEALED_ARTIFACT_REQUIRED');return r;}
 async function reference(ref,directory,{sealed:enveloped=false}={}){
  if(!exactFields(ref,['ref','sha256']))fail('MM4_REFERENCE_INVALID');
  return (enveloped?sealed:json)(path.resolve(directory,ref.ref),{reference:ref});
 }
 async function finish(){for(const p of [...pins.values()])await bytes(p.file,{reference:{ref:p.file,sha256:p.sha256},code:p.code});}
 return {bytes,json,sealed,reference,finish,references:()=>[...pins.values()].map(p=>({ref:p.file,sha256:p.sha256})).sort((a,b)=>a.ref<b.ref?-1:a.ref>b.ref?1:0)};
}
