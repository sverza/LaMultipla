import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {privateLock} from './outbox.mjs';
import {digest,readSnapshot,writeExclusive} from '../prospective/store.mjs';
import {canonical,keyFingerprint} from '../../../shared/private-delivery.mjs';
const uid=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const hash=v=>digest(canonical(v));
const withoutWriter=c=>Object.fromEntries(Object.entries(c).filter(([key])=>key!=='writerUid'));
async function exists(file){try{await fs.stat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function backup(source,target){
  const bytes=await fs.readFile(source);
  try{await fs.copyFile(source,target,fs.constants.COPYFILE_EXCL);}
  catch(e){if(e.code!=='EEXIST')throw e;if(!(await fs.readFile(target)).equals(bytes))throw new Error('Backup privato già presente ma differente');}
}
async function replaceConfig(file,value){
  const temporary=file+'.'+randomUUID()+'.tmp';let handle;
  try{handle=await fs.open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();await handle.close();handle=null;await fs.rename(temporary,file);}
  finally{if(handle)await handle.close();await fs.rm(temporary,{force:true});}
}
// Bootstrap repair only: recipient, signature key, pairing and all data remain
// immutable. Intent + encrypted backup precede mutation; interrupted repair resumes.
export async function repairWriterIdentity({directory,vault,writerUid,readerUid,afterVaultSave=async()=>{}}){
  if(!uid(writerUid)||!uid(readerUid)||writerUid===readerUid)throw new Error('UID PC e Android validi e distinti richiesti');
  return privateLock(directory,async()=>{
    const stored=await vault.load();if(!stored)throw new Error('Associazione privata assente');
    const config=stored.config,profile=stored.profile;
    if(config?.channel!=='synthetic_shadow'||config.applicationId!=='it.personale.lamultipla.collaudo'
      ||config.readerUid!==readerUid||profile?.trust?.readerUid!==readerUid)throw new Error('Correzione consentita solo al PC: verificare UID Android e canale sintetico');
    if(await exists(path.join(directory,'session.dpapi.json')))throw new Error('Sessione già presente: correzione iniziale non consentita');
    let entries=[];try{entries=await fs.readdir(path.join(directory,'outbox'));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(entries.some(name=>name!=='locks'))throw new Error('Outbox già presente: nessuna identità modificata');
    const pairingFile=path.join(directory,'phone-pairing.private.json'),configFile=path.join(directory,'cloud-config.private.json');
    const pairing=JSON.parse(await fs.readFile(pairingFile,'utf8')),source=JSON.parse(await fs.readFile(configFile,'utf8'));
    if(hash(pairing)!==hash(profile)||hash(withoutWriter(source))!==hash(withoutWriter(config)))throw new Error('Configurazione o profilo locali in conflitto');
    const ids=Object.keys(profile.trust.keys??{});if(ids.length!==1||await keyFingerprint(profile.trust.keys[ids[0]])!==ids[0])throw new Error('Chiave pubblica originale non verificabile');
    const keyId=ids[0],repair=path.join(directory,'writer-identity-repair'),intentFile=path.join(repair,'intent.private.json');
    let intent;try{intent=await readSnapshot(intentFile);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(intent){
      if(intent.writerUid!==writerUid||intent.readerUid!==readerUid||intent.profileHash!==hash(profile)||intent.keyId!==keyId
        ||intent.configurationHash!==hash(withoutWriter(config))||![intent.originalWriterUid,writerUid].includes(config.writerUid)
        ||![intent.originalWriterUid,writerUid].includes(source.writerUid))throw new Error('Correzione precedente in conflitto: nessuna sovrascrittura');
      const before=await fs.readFile(path.join(repair,'writer.before.dpapi.json'));
      if(digest(before.toString('utf8'))!==intent.originalEncryptedHash)throw new Error('Backup cifrato originale alterato');
      const beforeConfig=JSON.parse(await fs.readFile(path.join(repair,'config.before.private.json'),'utf8'));
      if(hash(withoutWriter(beforeConfig))!==intent.configurationHash||beforeConfig.writerUid!==intent.originalWriterUid)throw new Error('Backup configurazione alterato');
    }else{
      if(source.writerUid!==config.writerUid)throw new Error('UID nelle due configurazioni non coerenti');
      if(config.writerUid===writerUid)return {purpose:'REPAIR_WRITER_IDENTITY_ONLY',reused:true,keyPreserved:true,pairingUnchanged:true,readerUnchanged:true,apiRequests:0,jobsEnabled:false};
      const encryptedFile=path.join(directory,'writer.dpapi.json'),before=await fs.readFile(encryptedFile,'utf8'),sealed=JSON.parse(before);
      if(sealed.schema!=='lamultipla-windows-dpapi-v1'||typeof sealed.ciphertext!=='string')throw new Error('Vault cifrato originale non valido');
      await fs.mkdir(repair,{recursive:true,mode:0o700});await backup(encryptedFile,path.join(repair,'writer.before.dpapi.json'));await backup(configFile,path.join(repair,'config.before.private.json'));
      intent={schema:'lamultipla-writer-identity-repair-v1',writerUid,readerUid,originalWriterUid:config.writerUid,keyId,
        profileHash:hash(profile),configurationHash:hash(withoutWriter(config)),originalEncryptedHash:digest(before),createdAtUtc:new Date().toISOString()};
      await writeExclusive(intentFile,intent);
    }
    const reused=config.writerUid===writerUid&&source.writerUid===writerUid;
    if(config.writerUid!==writerUid){await vault.save({...stored,config:{...config,writerUid}});await afterVaultSave();}
    const verified=await vault.load();
    if(verified.config.writerUid!==writerUid||hash(withoutWriter(verified.config))!==intent.configurationHash
      ||hash(verified.profile)!==intent.profileHash||verified.privateKeyPkcs8!==stored.privateKeyPkcs8)throw new Error('Correzione protetta non verificata');
    if(source.writerUid!==writerUid)await replaceConfig(configFile,verified.config);
    return {purpose:'REPAIR_WRITER_IDENTITY_ONLY',reused,keyPreserved:true,pairingUnchanged:true,readerUnchanged:true,originalEncryptedBackupKept:true,apiRequests:0,jobsEnabled:false};
  });
}
