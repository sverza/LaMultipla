import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const TEST_APP_ID = 'it.personale.lamultipla.collaudo';
const JAVA = 'android/app/src/main/java/it/personale/lamultipla/';
const sha = data => createHash('sha256').update(data).digest('hex');

function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw new Error(`Sorgente inatteso: ${before}`);
  return text.replace(before, after);
}

function replaceMethod(text, signature, body) {
  const start = text.indexOf(signature);
  if (start < 0 || text.indexOf(signature, start + signature.length) >= 0) throw new Error(`Metodo inatteso: ${signature}`);
  const open = text.indexOf('{', start);
  let depth = 1, end = open + 1;
  for (; end < text.length && depth; end++) {
    if (text[end] === '{') depth++;
    if (text[end] === '}') depth--;
  }
  if (depth) throw new Error(`Metodo incompleto: ${signature}`);
  return text.slice(0, open + 1) + '\n' + body + '\n    }' + text.slice(end);
}

export function prepareAndroidCollaudo(root, destination = path.join(root, '.local', 'android-v4-collaudo')) {
  root = fs.realpathSync(root);
  destination = path.resolve(destination);
  const privateRoot = path.join(root, '.local');
  const relative = path.relative(privateRoot, destination);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Destinazione richiesta dentro .local, in una nuova sottocartella.');
  if (fs.existsSync(destination)) throw new Error(`Destinazione già presente; nessuna sovrascrittura: ${destination}`);
  if (!fs.statSync(path.join(root, 'node_modules')).isDirectory()) throw new Error('Dipendenze mancanti: completare npm ci nel repository originale.');

  const rootFiles = new Set(['package.json', 'package-lock.json', 'tsconfig.json']);
  const excluded = new Set([
    `${JAVA}BackgroundJobService.java`, 'android/keystore.properties.example',
    'app/data/historical-v3-patches.json', 'public/latest-slip.json', 'public/app-version.json',
  ]);
  const tracked = execFileSync('git', ['-C', root, 'ls-files', '-z'], {encoding: 'utf8'}).split('\0').filter(Boolean);
  const sourceHashes = {};
  const files = new Map();
  for (const name of tracked) {
    if (!(rootFiles.has(name) || /^(app|shared|public|android)\//.test(name))) continue;
    if (excluded.has(name) || /(?:^|\/)(?:\.env[^/]*|local\.properties|keystore\.properties|build|\.gradle|\.idea)(?:\/|$)|\.(?:jks|keystore|pem|p12)$/i.test(name)) continue;
    const source = path.join(root, name);
    if (!fs.lstatSync(source).isFile()) throw new Error(`File sorgente non regolare: ${name}`);
    const data = fs.readFileSync(source);
    sourceHashes[name] = sha(data);
    files.set(name, data);
  }
  const modify = (name, transform) => {
    if (!files.has(name)) throw new Error(`File richiesto mancante: ${name}`);
    // Git for Windows can check out text files as CRLF. Normalize only the
    // private transformed copy; source bytes and their hashes stay untouched.
    files.set(name, transform(files.get(name).toString('utf8').replace(/\r\n/g, '\n')));
  };
  modify('app/page.tsx', text => replaceOnce(text,
    "const localExperimentPreview=()=>typeof window!=='undefined'&&isLocalExperimentPreview(window.location.hostname,isNative);",
    'const localExperimentPreview=()=>true; // Solo copia privata APK di collaudo.'
  ).replace('isExperimentalInput,isLocalExperimentPreview', 'isExperimentalInput')
    .replaceAll('disabled={!isNative}', 'disabled={true}')
    .replace('disabled={checking} onClick={runCheck}', 'disabled={true} onClick={runCheck}'));
  modify('app/lib/native.ts', text => {
    text = replaceMethod(text, 'export async function fetchRemoteFeed()', "  throw new Error('Feed remoto disabilitato nel collaudo APK.');");
    text = replaceOnce(text, 'export async function fetchRemoteFeed() {', 'export async function fetchRemoteFeed(): Promise<unknown> {');
    text = replaceMethod(text, 'export async function fetchUpdateInfo(): Promise<UpdateInfo | null>', '  return null;');
    return text.replace('Capacitor, CapacitorHttp, registerPlugin', 'Capacitor, registerPlugin')
      .replace('APP_VERSION, FEED_URL, formatDate, Slip, slipLabels, VERSION_URL', 'APP_VERSION, formatDate, Slip, slipLabels');
  });
  modify(`${JAVA}LaMultiplaNativePlugin.java`, text => {
    text = replaceMethod(text, 'public void getStatus(PluginCall call)', '        call.resolve(status());');
    for (const method of ['configure', 'runNow', 'scheduleReminder', 'setNotificationsEnabled']) {
      text = replaceMethod(text, `public void ${method}(PluginCall call)`, '        call.reject("Automazioni disabilitate nel collaudo APK.");');
    }
    text = replaceMethod(text, 'public void cancelReminder(PluginCall call)', '        call.resolve();');
    text = replaceOnce(text, 'BackgroundJobService.preferences(getContext())', 'getContext().getSharedPreferences("la_multipla_sync", Context.MODE_PRIVATE)');
    text = replaceOnce(text, 'result.put("enabled", prefs.getBoolean("enabled", true));', 'result.put("enabled", false);');
    if (text.includes('BackgroundJobService')) throw new Error('Riferimento residuo al servizio automatico.');
    return text;
  });
  modify('android/app/src/main/AndroidManifest.xml', text => {
    text = replaceOnce(text, `        <service\n            android:name=".BackgroundJobService"\n            android:exported="false"\n            android:permission="android.permission.BIND_JOB_SERVICE" />`, '        <!-- Nessun servizio automatico nel collaudo APK. -->');
    text = replaceOnce(text, '    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />', '');
    return text;
  });
  modify('android/app/build.gradle', text => replaceOnce(replaceOnce(replaceOnce(text, 'applicationId "it.personale.lamultipla"', `applicationId "${TEST_APP_ID}"`),
    'versionCode 2','versionCode 3'),'versionName "1.0.1"','versionName "1.0.1-private-diagnostics"'));
  modify('android/app/src/main/res/values/strings.xml', text => text.replaceAll('La Multipla', 'LaMultipla TEST APK').replaceAll('it.personale.lamultipla', TEST_APP_ID));
  modify('app/layout.tsx', text => replaceOnce(text, '<body>{children}</body>', '<body><div role="status" style={{padding:8,textAlign:"center",background:"#ccf068",color:"#10241e",fontWeight:700}}>APK DI COLLAUDO · dati sintetici · stake reale 0 €</div>{children}</body>'));
  modify('package.json', text => {
    const pkg = JSON.parse(text);
    pkg.name = 'lamultipla-private-android-collaudo';
    pkg.scripts = {build: 'next build', 'android:sync': 'cap sync android'};
    return JSON.stringify(pkg, null, 2) + '\n';
  });
  files.set('app/data/historical-v3-patches.json', JSON.stringify({schemaVersion: 1, purpose: 'Collaudo sintetico isolato', slips: []}) + '\n');
  files.set('capacitor.config.json', JSON.stringify({appId: TEST_APP_ID, appName: 'LaMultipla TEST APK', webDir: 'out', android: {backgroundColor: '#061e1a'}}, null, 2) + '\n');
  files.set('next.config.mjs', `export default ${JSON.stringify({output: 'export', trailingSlash: true, images: {unoptimized: true}, turbopack: {root}}, null, 2)};\n`);
  // Validate all transformations before creating the private destination.
  for (const directory of [privateRoot, path.dirname(destination)]) {
    if (fs.existsSync(directory) && fs.realpathSync(directory) !== directory) throw new Error('Percorso privato con collegamento simbolico non consentito.');
  }
  fs.mkdirSync(destination, {recursive: true});
  for (const [name, data] of files) {
    const target = path.join(destination, name);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, data, {flag: 'wx'});
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(destination, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = {
    purpose: 'SYNTHETIC_ANDROID_V4_TEST_ONLY', destination, applicationId: TEST_APP_ID,
    sourceCommit: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
    sourceHashes, actualStakeEUR: 0, apiRequests: 0, jobsEnabled: false,
    remoteFeedEnabled: false, privateReceptionRequiresPairing: true, periodicJobsEnabled: false, release: false, sourceUnchanged: true,
  };
  for (const [name, expected] of Object.entries(sourceHashes)) {
    if (sha(fs.readFileSync(path.join(root, name))) !== expected) throw new Error(`Sorgente cambiato durante preparazione: ${name}`);
  }
  fs.writeFileSync(path.join(destination, 'collaudo-source-manifest.json'), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv[2]) throw new Error('Uso: node prepare-android-v4-collaudo.mjs <repository-root>');
    const {sourceHashes, ...summary} = prepareAndroidCollaudo(process.argv[2],process.argv[3]);
    console.log(JSON.stringify({...summary, sourceFilesVerified: Object.keys(sourceHashes).length}, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
