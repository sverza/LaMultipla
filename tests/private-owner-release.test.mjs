import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {sealReleaseBackup,openReleaseBackup} from '../scripts/lib/private/release-backup.mjs';
import {preparePrivateRelease} from '../scripts/prepare-android-private-release.mjs';
test('owner Release: encrypted portable backup roundtrips without plaintext credentials; tamper and wrong passphrase fail',()=>{
 const bytes=Buffer.alloc(512,42),credentials={alias:'SYNTHETIC_ALIAS',storePassword:'SYNTHETIC_PRIVATE_STORE',keyPassword:'SYNTHETIC_PRIVATE_KEY'},pass='SYNTHETIC_LOCAL_BACKUP_PASSPHRASE';
 const b=sealReleaseBackup(bytes,credentials,pass),text=JSON.stringify(b),restored=openReleaseBackup(b,pass);
 assert.ok(!text.includes(credentials.storePassword));assert.ok(!text.includes(credentials.keyPassword));assert.ok(!text.includes(pass));assert.deepEqual(restored.keystore,bytes);assert.deepEqual(restored.credentials,credentials);
 assert.throws(()=>openReleaseBackup(b,'SYNTHETIC_WRONG_PASSPHRASE'),/INTEGRITY/);const altered=structuredClone(b);altered.ciphertext='AA'+altered.ciphertext.slice(2);assert.throws(()=>openReleaseBackup(altered,pass),/INTEGRITY/);
 assert.throws(()=>sealReleaseBackup(bytes,credentials,'short'),/INPUT/);
});
test('owner Release: unsafe destination, overwrite and non-increasing base version are refused before writes',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lm-release-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 assert.throws(()=>preparePrivateRelease(process.cwd(),temp),/DIRECTORY/);assert.deepEqual(await fs.readdir(temp),[]);
 assert.throws(()=>preparePrivateRelease(process.cwd(),'.local/unused-release-test',{versionCode:2}),/VERSION/);
});
test('owner Release: same definitive app, isolated copy, no public feed/jobs or source changes',async t=>{
 const root=process.cwd(),target=path.join(root,'.local','SYNTHETIC-release-'+process.pid+'-'+Date.now());
 t.after(async()=>{await fs.unlink(path.join(target,'node_modules')).catch(()=>{});await fs.rm(target,{recursive:true,force:true});});
 const originals=await Promise.all(['app/page.tsx','android/app/build.gradle','android/app/src/main/AndroidManifest.xml'].map(n=>fs.readFile(path.join(root,n),'utf8')));
 const r=preparePrivateRelease(root,target),gradle=await fs.readFile(path.join(target,'android/app/build.gradle'),'utf8'),
  manifest=await fs.readFile(path.join(target,'android/app/src/main/AndroidManifest.xml'),'utf8'),native=await fs.readFile(path.join(target,'app/lib/native.ts'),'utf8');
 assert.equal(r.applicationId,'it.personale.lamultipla');assert.equal(r.debugSigningAllowed,false);assert.equal(r.installationPerformed,false);
 assert.match(gradle,/applicationId "it\.personale\.lamultipla"/);assert.match(gradle,/versionCode 8/);assert.doesNotMatch(manifest,/BackgroundJobService|RECEIVE_BOOT_COMPLETED/);
 assert.match(native,/Feed pubblico disabilitato/);assert.equal(r.privatePairingChanged,false);
 for(const n of ['public/latest-slip.json','public/app-version.json','android/keystore.properties'])await assert.rejects(fs.access(path.join(target,n)));
 assert.deepEqual(await Promise.all(['app/page.tsx','android/app/build.gradle','android/app/src/main/AndroidManifest.xml'].map(n=>fs.readFile(path.join(root,n),'utf8'))),originals);
 assert.throws(()=>preparePrivateRelease(root,target),/DIRECTORY/);
});
