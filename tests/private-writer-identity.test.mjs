// SYNTHETIC ONLY: ephemeral keys and vault adapter. No Windows/cloud calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {repairWriterIdentity} from '../scripts/lib/private/writer-identity.mjs';
import {base64url,keyFingerprint} from '../shared/private-delivery.mjs';
import {digest} from '../scripts/lib/prospective/store.mjs';
async function setup(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lamultipla-identity-test-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const spki=base64url(await crypto.subtle.exportKey('spki',keys.publicKey)),keyId=await keyFingerprint(spki);
  const config={projectId:'demo-private-identity',writerUid:'SYNTHETIC_WRONG_PC',readerUid:'SYNTHETIC_ANDROID',apiKey:'SYNTHETIC_API_CONFIG_123456',
    mobileAppId:'1:123456:android:abcdef',senderId:'123456',applicationId:'it.personale.lamultipla.collaudo',channel:'synthetic_shadow'};
  const profile={schema:'lamultipla-private-pairing-v1',projectId:config.projectId,apiKey:config.apiKey,mobileAppId:config.mobileAppId,senderId:config.senderId,
    deviceId:'synthetic-device-01',trust:{readerUid:config.readerUid,applicationId:config.applicationId,channel:config.channel,keys:{[keyId]:spki}}};
  let state={config,profile,privateKeyPkcs8:base64url(await crypto.subtle.exportKey('pkcs8',keys.privateKey))};let saves=0;
  const sealed=value=>JSON.stringify({schema:'lamultipla-windows-dpapi-v1',ciphertext:Buffer.from('SYNTHETIC_ENCRYPTED_'+digest(value)).toString('base64')});
  const vault={load:async()=>structuredClone(state),save:async value=>{saves++;state=structuredClone(value);await fs.writeFile(path.join(directory,'writer.dpapi.json'),sealed(value));}};
  await fs.writeFile(path.join(directory,'writer.dpapi.json'),sealed(state));await fs.writeFile(path.join(directory,'cloud-config.private.json'),JSON.stringify(config,null,2));
  await fs.writeFile(path.join(directory,'phone-pairing.private.json'),JSON.stringify(profile,null,2));
  return {directory,vault,original:structuredClone(state),saves:()=>saves,writerUid:'SYNTHETIC_CORRECT_PC',readerUid:config.readerUid};
}
test('bootstrap writer UID repair preserves signing key, recipient and exact pairing file, with encrypted original backup',async t=>{
  const s=await setup(t),encryptedBefore=await fs.readFile(path.join(s.directory,'writer.dpapi.json')),pairingBefore=await fs.readFile(path.join(s.directory,'phone-pairing.private.json'));
  const result=await repairWriterIdentity(s);assert.equal(result.keyPreserved,true);assert.equal(result.readerUnchanged,true);assert.equal(result.apiRequests,0);
  const after=await s.vault.load();assert.equal(after.config.writerUid,s.writerUid);assert.equal(after.config.readerUid,s.original.config.readerUid);
  assert.equal(after.privateKeyPkcs8,s.original.privateKeyPkcs8);assert.deepEqual(after.profile,s.original.profile);
  assert.deepEqual(await fs.readFile(path.join(s.directory,'phone-pairing.private.json')),pairingBefore);
  assert.deepEqual(await fs.readFile(path.join(s.directory,'writer-identity-repair/writer.before.dpapi.json')),encryptedBefore);
  assert.equal(JSON.parse(await fs.readFile(path.join(s.directory,'cloud-config.private.json'),'utf8')).writerUid,s.writerUid);
  const second=await repairWriterIdentity(s);assert.equal(second.reused,true);assert.equal(s.saves(),1);
});
test('interruption after vault save resumes config update without rotating key or overwriting original backup',async t=>{
  const s=await setup(t),before=await fs.readFile(path.join(s.directory,'writer.dpapi.json'));
  await assert.rejects(repairWriterIdentity({...s,afterVaultSave:()=>{throw new Error('SYNTHETIC crash');}}),/crash/);
  assert.equal((await s.vault.load()).config.writerUid,s.writerUid);
  assert.equal(JSON.parse(await fs.readFile(path.join(s.directory,'cloud-config.private.json'),'utf8')).writerUid,s.original.config.writerUid);
  await repairWriterIdentity(s);assert.equal(s.saves(),1);assert.equal((await s.vault.load()).privateKeyPkcs8,s.original.privateKeyPkcs8);
  assert.deepEqual(await fs.readFile(path.join(s.directory,'writer-identity-repair/writer.before.dpapi.json')),before);
});
test('reader changes, invalid/identical UIDs, existing session and any queued data refuse mutation',async t=>{
  const s=await setup(t);
  for(const change of [{readerUid:'OTHER_ANDROID'},{writerUid:s.readerUid},{writerUid:'bad uid'}])await assert.rejects(repairWriterIdentity({...s,...change}));
  await fs.writeFile(path.join(s.directory,'session.dpapi.json'),'SYNTHETIC_SESSION');await assert.rejects(repairWriterIdentity(s),/Sessione/);
  await fs.unlink(path.join(s.directory,'session.dpapi.json'));await fs.mkdir(path.join(s.directory,'outbox'));await fs.writeFile(path.join(s.directory,'outbox/000000000001.json'),'SYNTHETIC_FRAME');
  await assert.rejects(repairWriterIdentity(s),/Outbox/);assert.equal(s.saves(),0);assert.deepEqual(await s.vault.load(),s.original);
});
test('different retry target or tampered encrypted backup refuses further changes',async t=>{
  const s=await setup(t);await repairWriterIdentity(s);
  await assert.rejects(repairWriterIdentity({...s,writerUid:'SYNTHETIC_ANOTHER_PC'}),/conflitto/);
  await fs.appendFile(path.join(s.directory,'writer-identity-repair/writer.before.dpapi.json'),' ');
  await assert.rejects(repairWriterIdentity(s),/alterato/);assert.equal(s.saves(),1);
});
test('profile/config conflicts cannot change identity; plaintext private key is never written into the backup or intent',async t=>{
  const s=await setup(t),changed={...s.original.config,projectId:'demo-other-project'};
  await fs.writeFile(path.join(s.directory,'cloud-config.private.json'),JSON.stringify(changed));await assert.rejects(repairWriterIdentity(s),/conflitto/);assert.equal(s.saves(),0);
  await fs.writeFile(path.join(s.directory,'cloud-config.private.json'),JSON.stringify(s.original.config));await repairWriterIdentity(s);
  for(const file of await fs.readdir(path.join(s.directory,'writer-identity-repair'))){const content=await fs.readFile(path.join(s.directory,'writer-identity-repair',file),'utf8');
    assert.ok(!content.includes(s.original.privateKeyPkcs8));assert.ok(!content.includes('"privateKeyPkcs8"'));
  }
});
