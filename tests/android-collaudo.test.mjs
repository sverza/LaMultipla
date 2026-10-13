import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {prepareAndroidCollaudo, TEST_APP_ID} from '../scripts/prepare-android-v4-collaudo.mjs';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const read = (directory, file) => fs.readFileSync(path.join(directory, file), 'utf8');

test('APK test copy isolates identity, jobs and data while preserving native sharing and source bytes', () => {
  fs.mkdirSync(path.join(root, '.local'), {recursive: true});
  const parent = fs.mkdtempSync(path.join(root, '.local', 'android-collaudo-test-'));
  const destination = path.join(parent, 'project');
  try {
    const result = prepareAndroidCollaudo(root, destination);
    assert.equal(result.applicationId, TEST_APP_ID);
    assert.match(read(destination, 'android/app/build.gradle'), /applicationId "it.personale.lamultipla.collaudo"/);
    assert.match(read(destination, 'android/app/build.gradle'), /versionCode 6/);
    assert.match(read(destination, 'android/app/build.gradle'), /versionName "1.0.1-private-receipt"/);
    for (const file of [
      'android/app/src/main/java/it/personale/lamultipla/PrivateReceiptSequence.java',
      'android/app/src/androidTest/java/it/personale/lamultipla/PrivateReceiptInstrumentedTest.java',
    ]) assert.equal(read(destination, file), read(root, file));
    const plugin = read(destination, 'android/app/src/main/java/it/personale/lamultipla/LaMultiplaNativePlugin.java');
    assert.doesNotMatch(plugin, /BackgroundJobService|JobScheduler|schedulePeriodic/);
    assert.match(plugin, /FileProvider.getUriForFile/);
    assert.match(plugin, /public void shareTextFile/);
    assert.match(plugin, /result.put\("enabled", false\)/);
    assert.equal(fs.existsSync(path.join(destination, 'android/app/src/main/java/it/personale/lamultipla/BackgroundJobService.java')), false);
    assert.doesNotMatch(read(destination, 'android/app/src/main/AndroidManifest.xml'), /BIND_JOB_SERVICE|RECEIVE_BOOT_COMPLETED/);
    const native = read(destination, 'app/lib/native.ts');
    assert.doesNotMatch(native, /CapacitorHttp|fetch\(/);
    assert.match(native, /Capacitor.isNativePlatform\(\)/);
    assert.match(native, /Native.shareTextFile/);
    assert.match(read(destination, 'app/page.tsx'), /const localExperimentPreview=\(\)=>true/);
    assert.deepEqual(JSON.parse(read(destination, 'app/data/historical-v3-patches.json')).slips, []);
    for (const file of ['.local', '.env', '.git', 'scripts', 'public/latest-slip.json', 'public/app-version.json', 'android/keystore.properties', 'android/local.properties']) {
      assert.equal(fs.existsSync(path.join(destination, file)), false, file);
    }
    for (const [file, expected] of Object.entries(result.sourceHashes)) {
      const actual = createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
      assert.equal(actual, expected, file);
    }
    assert.equal(read(destination, 'shared/decision-v4.mjs'), read(root, 'shared/decision-v4.mjs'));
    assert.equal(read(destination, 'shared/experimental-store.mjs'), read(root, 'shared/experimental-store.mjs'));
    assert.throws(() => prepareAndroidCollaudo(root, destination), /già presente/);
  } finally { fs.rmSync(parent, {recursive: true, force: true}); }
});

test('preparation refuses source directory and paths outside private workspace before writing', () => {
  assert.throws(() => prepareAndroidCollaudo(root, root), /dentro .local/);
  assert.throws(() => prepareAndroidCollaudo(root, path.join(root, 'public', 'collaudo')), /dentro .local/);
  assert.throws(() => prepareAndroidCollaudo(root, path.join(root, '.local')), /dentro .local/);
});

test('Windows CRLF checkout prepares successfully without changing original line endings', () => {
  fs.mkdirSync(path.join(root, '.local'), {recursive: true});
  const fixture = fs.mkdtempSync(path.join(root, '.local', 'android-crlf-test-'));
  const files = [
    'app/page.tsx', 'app/lib/native.ts', 'app/layout.tsx', 'package.json',
    'android/app/build.gradle', 'android/app/src/main/AndroidManifest.xml',
    'android/app/src/main/res/values/strings.xml',
    'android/app/src/main/java/it/personale/lamultipla/LaMultiplaNativePlugin.java',
  ];
  try {
    for (const file of files) {
      const target = path.join(fixture, file);
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.writeFileSync(target, read(root, file).replace(/\r?\n/g, '\r\n'));
    }
    fs.mkdirSync(path.join(fixture, 'node_modules'));
    const git = args => execFileSync('git', ['-C', fixture, ...args], {stdio: 'pipe'});
    git(['init']);
    git(['config', 'core.autocrlf', 'false']);
    git(['add', '.']);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'CRLF test fixture']);
    const destination = path.join(fixture, '.local', 'copy');
    const result = prepareAndroidCollaudo(fixture, destination);
    assert.equal(result.sourceUnchanged, true);
    assert.doesNotMatch(read(destination, 'android/app/src/main/AndroidManifest.xml'), /BIND_JOB_SERVICE/);
    assert.match(read(destination, 'android/app/build.gradle'), /applicationId "it.personale.lamultipla.collaudo"/);
    for (const file of files) {
      assert.equal(read(fixture, file), read(root, file).replace(/\r?\n/g, '\r\n'), file);
    }
  } finally { fs.rmSync(fixture, {recursive: true, force: true}); }
});
