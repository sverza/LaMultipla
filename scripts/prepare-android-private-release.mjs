// A new build directory, SAME applicationId; never a second installed app.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
function once(text,from,to){if(text.split(from).length!==2)throw Error('PRIVATE_RELEASE_SOURCE_MISMATCH');return text.replace(from,to);}
function method(text,signature,body){const at=text.indexOf(signature);if(at<0||text.indexOf(signature,at+1)>=0)throw Error('PRIVATE_RELEASE_METHOD_MISMATCH');
 const open=text.indexOf('{',at);let depth=1,end=open+1;for(;end<text.length&&depth;end++){if(text[end]==='{')depth++;else if(text[end]==='}')depth--;}
 if(depth)throw Error('PRIVATE_RELEASE_METHOD_INCOMPLETE');return text.slice(0,open+1)+'\n'+body+'\n    }'+text.slice(end);}
export function preparePrivateRelease(root,destination,{versionCode=8,versionName='1.1.0-private.1'}={}){
 root=fs.realpathSync(root);destination=path.resolve(destination);const relative=path.relative(path.join(root,'.local'),destination);
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||fs.existsSync(destination)||!Number.isSafeInteger(versionCode)||versionCode<8
  ||!/^\d+\.\d+\.\d+-private\.\d+$/.test(versionName))throw Error('NEW_PRIVATE_RELEASE_DIRECTORY_AND_VERSION_REQUIRED');
 const roots=new Set(['package.json','package-lock.json','tsconfig.json','next.config.ts','capacitor.config.ts']),
  names=execFileSync('git',['-C',root,'ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean),files=new Map(),sourceHashes={};
 for(const name of names){if(!roots.has(name)&&!/^(app|shared|public|android)\//.test(name))continue;
  if(/(?:^|\/)(?:\.env[^/]*|local\.properties|keystore\.properties|build|\.gradle|\.idea)(?:\/|$)|\.(?:jks|keystore|pem|p12)$/i.test(name)
   ||['public/latest-slip.json','public/app-version.json','android/keystore.properties.example'].includes(name)||name.endsWith('/BackgroundJobService.java'))continue;
  const file=path.join(root,name);if(!fs.lstatSync(file).isFile())throw Error('REGULAR_SOURCE_FILE_REQUIRED');const bytes=fs.readFileSync(file);sourceHashes[name]=sha(bytes);files.set(name,bytes);
 }
 const edit=(file,fn)=>{if(!files.has(file))throw Error('PRIVATE_RELEASE_SOURCE_MISSING');files.set(file,fn(files.get(file).toString('utf8').replace(/\r\n/g,'\n')));};
 edit('android/app/build.gradle',t=>once(once(t,'versionCode 2','versionCode '+versionCode),'versionName "1.0.1"','versionName "'+versionName+'"'));
 edit('app/lib/native.ts',t=>method(method(t,'export async function fetchRemoteFeed()',"  throw new Error('Feed pubblico disabilitato nella Release privata.');"),'export async function fetchUpdateInfo(): Promise<UpdateInfo | null>','  return null;')
  .replace('export async function fetchRemoteFeed() {','export async function fetchRemoteFeed(): Promise<unknown> {')
  .replace('Capacitor, CapacitorHttp, registerPlugin','Capacitor, registerPlugin').replace('APP_VERSION, FEED_URL, formatDate, Slip, slipLabels, VERSION_URL','APP_VERSION, formatDate, Slip, slipLabels'));
 edit('app/page.tsx',t=>{t=once(t,"const localExperimentPreview=()=>typeof window!=='undefined'&&isLocalExperimentPreview(window.location.hostname,isNative);",
  "const localExperimentPreview=()=>typeof window!=='undefined'&&isLocalExperimentPreview(window.location.hostname,isNative);\nconst privateOwnerRelease=()=>true;");
  return once(once(t,'    if (checkingRef.current) return;',"    if(privateOwnerRelease()){if(announce)setMessage('Release privata: il feed pubblico è disabilitato.');return;}\n    if (checkingRef.current) return;"),
  'if(!localExperimentPreview())setUpdateInfo(await fetchUpdateInfo());','if(!localExperimentPreview()&&!privateOwnerRelease())setUpdateInfo(await fetchUpdateInfo());');});
 const java='android/app/src/main/java/it/personale/lamultipla/LaMultiplaNativePlugin.java';
 edit(java,t=>{t=method(t,'public void getStatus(PluginCall call)','        call.resolve(status());');
  for(const n of ['configure','runNow','scheduleReminder','setNotificationsEnabled'])t=method(t,`public void ${n}(PluginCall call)`,'        call.reject("Automazioni legacy disabilitate nella Release privata.");');
  t=method(t,'public void cancelReminder(PluginCall call)','        call.resolve();');
  t=once(once(t,'BackgroundJobService.preferences(getContext())','getContext().getSharedPreferences("la_multipla_sync", Context.MODE_PRIVATE)'),
   'result.put("enabled", prefs.getBoolean("enabled", true));','result.put("enabled", false);');if(t.includes('BackgroundJobService'))throw Error('LEGACY_JOB_REFERENCE_REMAINING');return t;});
 edit('android/app/src/main/AndroidManifest.xml',t=>once(once(t,'        <service\n            android:name=".BackgroundJobService"\n            android:exported="false"\n            android:permission="android.permission.BIND_JOB_SERVICE" />','        <!-- Private owner Release: no legacy public-feed jobs. -->'),
  '    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />',''));
 edit('app/layout.tsx',t=>once(t,'<body>{children}</body>','<body><div role="status" style={{padding:8,textAlign:"center"}}>LaMultipla privata · analisi esplorative senza giocate</div>{children}</body>'));
 if(!files.get('android/app/build.gradle').toString().includes('applicationId "it.personale.lamultipla"'))throw Error('APPLICATION_ID_MUST_REMAIN_UNCHANGED');
 fs.mkdirSync(destination,{recursive:true});for(const [name,bytes]of files){const file=path.join(destination,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});}
 fs.symlinkSync(path.join(root,'node_modules'),path.join(destination,'node_modules'),process.platform==='win32'?'junction':'dir');
 for(const [name,h]of Object.entries(sourceHashes))if(sha(fs.readFileSync(path.join(root,name)))!==h)throw Error('SOURCE_CHANGED_DURING_RELEASE_PREPARATION');
 const result={schema:'lamultipla-private-owner-release-source-v1',applicationId:'it.personale.lamultipla',versionCode,versionName,sourceHashes,
  sourceCommit:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),destination,debugSigningAllowed:false,
  publicFeedEnabled:false,legacyJobsEnabled:false,privatePairingChanged:false,installationPerformed:false};
 fs.writeFileSync(path.join(destination,'private-release-source-manifest.json'),JSON.stringify(result,null,2),{flag:'wx'});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const r=preparePrivateRelease(process.cwd(),process.argv[2]);console.log(JSON.stringify({...r,sourceHashes:undefined,sourceFileCount:Object.keys(r.sourceHashes).length}));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
