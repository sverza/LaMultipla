// SYNTHETIC ONLY. No private keys are stored in the Android test vectors.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {canonical,verifyDelivery} from '../shared/private-delivery.mjs';
const vectorsUrl=new URL('../android/app/src/androidTest/assets/private-protocol-vectors.json',import.meta.url);
const javaString=s=>'new String(new char[]{'+Array.from({length:s.length},(_,i)=>'(char)0x'+s.charCodeAt(i).toString(16)).join(',')+'})';
test('actual Java canonical encoder matches signed PC bytes, slash, identity, UTF-16 keys and string escaping',async t=>{
  let compiler='javac',prefix=[];
  try{execFileSync(compiler,['-version'],{stdio:'pipe'});}catch{compiler='java';prefix=['-m','jdk.compiler/com.sun.tools.javac.Main'];
    try{execFileSync(compiler,[...prefix,'-version'],{stdio:'pipe'});}catch{t.skip('JDK required');return;}}
  const data=JSON.parse(await fs.readFile(vectorsUrl,'utf8'));
  const objects=data.cases.flatMap(({frame})=>{const s=JSON.parse(frame.statement);return [s,Object.fromEntries(['channel','readerUid','applicationId','season','matchday','kind','envelopeSha256'].map(k=>[k,s[k]]))];});
  objects.push({slash:'2026/27',quote:'"\\',control:'\b\f\n\r\t\x00\x01\x1f',unicode:'€ 😀 \u2028\u2029',lone:'\ud800x\udc00',nil:null,yes:true,no:false,count:1000000,'\ud800':'high','\ue000':'bmp'});
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-java-canonical-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  let body='';
  for(const obj of objects){body+='m.clear();\n';for(const [k,v] of Object.entries(obj)){const value=typeof v==='string'?javaString(v):v===null?'null':typeof v==='number'?v+'L':String(v);body+='m.put('+javaString(k)+','+value+');\n';}
    body+='if(!PrivateCanonicalJSON.encode(m).equals('+javaString(canonical(obj))+'))throw new Exception("Canonical bytes differ");\n';}
  body+='m.clear();m.put("bad",1.5);try{PrivateCanonicalJSON.encode(m);throw new AssertionError("Fraction accepted");}catch(Exception expected){}';
  const main='import java.util.*;import it.personale.lamultipla.PrivateCanonicalJSON; public class CanonicalTest {public static void main(String[] args)throws Exception{Map<String,Object> m=new HashMap<>();'+body+'System.out.print("PASS");}}';
  const source=fileURLToPath(new URL('../android/app/src/main/java/it/personale/lamultipla/PrivateCanonicalJSON.java',import.meta.url));
  await fs.writeFile(path.join(directory,'CanonicalTest.java'),main);
  execFileSync(compiler,[...prefix,'-d',directory,source,path.join(directory,'CanonicalTest.java')],{stdio:'pipe'});
  assert.equal(execFileSync('java',['-cp',directory,'CanonicalTest'],{encoding:'utf8'}),'PASS');
});
test('Android instrumented vectors are authentic synthetic v4 contracts with only public trust',async()=>{
  const data=JSON.parse(await fs.readFile(vectorsUrl,'utf8'));assert.equal(data.purpose,'SYNTHETIC_TEST_ONLY');assert.deepEqual(Object.keys(data.profile),['trust']);
  assert.equal(data.cases.length,3);
  for(const [i,{frame}] of data.cases.entries()){
    const verified=await verifyDelivery(frame,data.profile.trust,{now:'2026-10-12T01:00:00.000Z',archiveExpired:true});
    assert.equal(verified.statement.matchday,7+i);assert.equal(verified.envelope.payload.actualStakeEUR,0);assert.equal(verified.envelope.payload.sourceData,'synthetic_test');
    assert.equal(verified.statement.status,i?'no_bet':'simulation');assert.equal(verified.expired,true);
  }
  assert.doesNotMatch(JSON.stringify(data),/PRIVATE KEY|refreshToken|password|client_email/);
});
