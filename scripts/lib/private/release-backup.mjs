import {randomBytes,scryptSync,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function sealReleaseBackup(keystore,credentials,passphrase){
 if(!Buffer.isBuffer(keystore)||keystore.length<100||keystore.length>1024*1024||typeof passphrase!=='string'||passphrase.length<16
  ||!credentials?.storePassword||!credentials?.keyPassword||!credentials?.alias)throw Error('BACKUP_INPUT_INVALID');
 const salt=randomBytes(16),iv=randomBytes(12),key=scryptSync(passphrase,salt,32,{N:65536,r:8,p:1,maxmem:128*1024*1024}),
  cipher=createCipheriv('aes-256-gcm',key,iv),plain=Buffer.from(JSON.stringify({schema:'lamultipla-release-portable-secret-v1',keystore:keystore.toString('base64'),keystoreSha256:sha(keystore),credentials}));
 const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);plain.fill(0);key.fill(0);
 return {schema:'lamultipla-release-portable-backup-v1',cipher:'AES-256-GCM',kdf:'SCRYPT-N65536-R8-P1',salt:salt.toString('base64'),iv:iv.toString('base64'),
  tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
export function openReleaseBackup(bundle,passphrase){
 if(bundle?.schema!=='lamultipla-release-portable-backup-v1'||bundle.cipher!=='AES-256-GCM'||bundle.kdf!=='SCRYPT-N65536-R8-P1'
  ||typeof passphrase!=='string'||passphrase.length<16||JSON.stringify(bundle).length>2*1024*1024)throw Error('BACKUP_INPUT_INVALID');
 try{const salt=Buffer.from(bundle.salt,'base64'),iv=Buffer.from(bundle.iv,'base64'),tag=Buffer.from(bundle.tag,'base64');
  if(salt.length!==16||iv.length!==12||tag.length!==16)throw Error();
  const key=scryptSync(passphrase,salt,32,{N:65536,r:8,p:1,maxmem:128*1024*1024}),decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);
  const plain=Buffer.concat([decipher.update(Buffer.from(bundle.ciphertext,'base64')),decipher.final()]),payload=JSON.parse(plain.toString('utf8'));plain.fill(0);key.fill(0);
  const keystore=Buffer.from(payload.keystore,'base64');if(payload.schema!=='lamultipla-release-portable-secret-v1'||sha(keystore)!==payload.keystoreSha256
   ||!payload.credentials?.storePassword||!payload.credentials?.keyPassword||!payload.credentials?.alias)throw Error();
  return {keystore,credentials:payload.credentials,keystoreSha256:payload.keystoreSha256};
 }catch{throw Error('BACKUP_PASSWORD_OR_INTEGRITY_INVALID');}
}
