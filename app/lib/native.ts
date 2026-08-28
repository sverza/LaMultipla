import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { APP_VERSION, FEED_URL, formatDate, Slip, slipLabels, VERSION_URL } from './model';

type NativeSyncStatus = {
  enabled: boolean;
  intervalHours: number;
  lastCheck: string;
  lastFeedId: string;
};

type NativeBridge = {
  getStatus: () => Promise<NativeSyncStatus>;
  configure: (options: { enabled: boolean; intervalHours: number }) => Promise<NativeSyncStatus>;
  runNow: () => Promise<void>;
  getNotificationPermission: () => Promise<{ state: string }>;
  requestNotificationPermission: () => Promise<{ state: string }>;
  setNotificationsEnabled: (options: { enabled: boolean }) => Promise<void>;
  scheduleReminder: (options: { id: number; title: string; body: string; at: number }) => Promise<void>;
  cancelReminder: (options: { id: number }) => Promise<void>;
  haptic: (options: { strength: string }) => Promise<void>;
  shareTextFile: (options: { filename: string; data: string; mimeType: string; title: string; text: string }) => Promise<void>;
  shareBase64File: (options: { filename: string; data: string; mimeType: string; title: string; text: string }) => Promise<void>;
};

export type UpdateInfo = { version: string; apkUrl?: string; notes?: string };

const Native = registerPlugin<NativeBridge>('LaMultiplaNative');
export const isNative = Capacitor.isNativePlatform();

function localStatus(): NativeSyncStatus {
  return {
    enabled: localStorage.getItem('la-multipla-background-sync') !== 'false',
    intervalHours: Number(localStorage.getItem('la-multipla-sync-hours')) || 3,
    lastCheck: localStorage.getItem('la-multipla-last-feed-check') || '',
    lastFeedId: localStorage.getItem('la-multipla-last-feed-id') || '',
  };
}

export async function fetchRemoteFeed() {
  const checkedAt = new Date().toISOString();
  let data: unknown;
  if (isNative) {
    const response = await CapacitorHttp.get({ url: FEED_URL, headers: { 'Cache-Control': 'no-cache' } });
    if (response.status < 200 || response.status >= 300) throw new Error('Schedina remota non raggiungibile.');
    data = response.data;
  } else {
    const response = await fetch('./latest-slip.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Schedina remota non raggiungibile.');
    data = await response.json();
  }
  localStorage.setItem('la-multipla-last-feed-check', checkedAt);
  return data;
}

export async function getSyncStatus() {
  if (!isNative) return localStatus();
  try {
    const native = await Native.getStatus();
    const local = localStatus();
    return { ...native, lastCheck: native.lastCheck || local.lastCheck, lastFeedId: native.lastFeedId || local.lastFeedId };
  } catch {
    return localStatus();
  }
}

export async function configureSync(enabled: boolean, intervalHours: number) {
  localStorage.setItem('la-multipla-background-sync', String(enabled));
  localStorage.setItem('la-multipla-sync-hours', String(intervalHours));
  if (!isNative) return localStatus();
  return Native.configure({ enabled, intervalHours });
}

export async function runNativeSyncNow() {
  if (isNative) await Native.runNow();
}

export async function notificationPermission() {
  if (!isNative) return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  try {
    return (await Native.getNotificationPermission()).state;
  } catch {
    return 'prompt';
  }
}

export async function requestNotificationPermission() {
  if (!isNative) {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.requestPermission();
  }
  return (await Native.requestNotificationPermission()).state;
}

export async function setNativeNotificationsEnabled(enabled: boolean) {
  if (isNative) await Native.setNotificationsEnabled({ enabled });
}

function reminderId(slip: Slip) {
  return 20_000 + slip.matchday + slip.season.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
}

export async function scheduleResultReminder(slip: Slip) {
  if (!isNative || localStorage.getItem('la-multipla-notifications') !== 'true') return;
  if (await notificationPermission() !== 'granted') return;
  const at = new Date(`${slip.date}T10:00:00`);
  at.setDate(at.getDate() + 3);
  if (at.getTime() <= Date.now()) at.setTime(Date.now() + 6 * 60 * 60 * 1000);
  await Native.scheduleReminder({
    id: reminderId(slip),
    title: `Giornata ${slip.matchday}: manca l'esito`,
    body: 'Apri La Multipla e completa i risultati delle selezioni.',
    at: at.getTime(),
  });
}

export async function cancelResultReminder(slip: Slip) {
  if (isNative) await Native.cancelReminder({ id: reminderId(slip) });
}

export async function haptic(style: 'light' | 'medium' | 'success' = 'light') {
  if (!isNative) return;
  try { await Native.haptic({ strength: style }); } catch { /* non bloccare il salvataggio */ }
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function exportBackupFile(data: string, filename: string) {
  if (!isNative) {
    downloadBlob(new Blob([data], { type: 'application/json' }), filename);
    return;
  }
  await Native.shareTextFile({ filename, data, mimeType: 'application/json', title: 'Backup La Multipla', text: 'Salva questa copia in una posizione sicura.' });
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (context.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
  });
  if (line) lines.push(line);
  return lines;
}

export function createSlipShareCard(slip: Slip) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Impossibile creare la scheda da condividere.');
  context.fillStyle = '#0d1713'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ccf068'; context.fillRect(0, 0, 22, canvas.height);
  context.fillStyle = '#edf5f0'; context.font = '700 34px Arial'; context.fillText('LA MULTIPLA', 82, 92);
  context.fillStyle = '#79d19b'; context.font = '500 28px Arial'; context.fillText(`SERIE A · ${slip.season}`, 82, 140);
  context.fillStyle = '#edf5f0'; context.font = '600 82px Georgia'; context.fillText(`Giornata ${slip.matchday}`, 82, 250);
  context.fillStyle = '#93a69d'; context.font = '400 30px Arial'; context.fillText(formatDate(slip.date, true), 82, 304);
  context.fillStyle = '#14221c'; context.beginPath(); context.roundRect(62, 350, 956, 150, 28); context.fill();
  context.fillStyle = '#93a69d'; context.font = '700 24px Arial'; context.fillText('QUOTA', 98, 405); context.fillText('STAKE', 410, 405); context.fillText('ESITO', 690, 405);
  context.fillStyle = '#edf5f0'; context.font = '600 46px Georgia'; context.fillText(`@ ${slip.playedOdd?.toFixed(2) || slip.picks.reduce((a, p) => a * p.odd, 1).toFixed(2)}`, 98, 466); context.fillText('3,00 €', 410, 466);
  context.fillStyle = slip.result === 'won' ? '#ccf068' : slip.result === 'lost' ? '#ff9e8d' : '#edf5f0'; context.fillText(slip.placement === 'draft' ? 'Bozza' : slipLabels[slip.result], 690, 466);
  let y = 575;
  slip.picks.forEach((pick, index) => {
    context.fillStyle = '#14221c'; context.beginPath(); context.roundRect(62, y - 42, 956, 112, 22); context.fill();
    context.fillStyle = '#ccf068'; context.font = '700 28px Arial'; context.fillText(String(index + 1).padStart(2, '0'), 94, y + 4);
    context.fillStyle = '#edf5f0'; context.font = '700 28px Arial'; context.fillText(wrapText(context, pick.match, 590)[0] || pick.match, 160, y - 5);
    context.fillStyle = '#93a69d'; context.font = '400 24px Arial'; context.fillText(pick.market, 160, y + 36);
    context.fillStyle = '#edf5f0'; context.font = '600 30px Georgia'; context.textAlign = 'right'; context.fillText(`@ ${pick.odd.toFixed(2)}`, 968, y + 10); context.textAlign = 'left';
    y += 128;
  });
  context.fillStyle = '#93a69d'; context.font = '400 24px Arial'; context.fillText('Tracker personale · nessun dato condiviso automaticamente', 82, 1290);
  return canvas;
}

export async function shareSlipCard(slip: Slip) {
  const canvas = createSlipShareCard(slip);
  const filename = `la-multipla-g${slip.matchday}.png`;
  const dataUrl = canvas.toDataURL('image/png');
  if (isNative) {
    await Native.shareBase64File({ filename, data: dataUrl.split(',')[1], mimeType: 'image/png', title: `La Multipla · Giornata ${slip.matchday}`, text: `${slip.picks.length} selezioni` });
    return;
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Immagine non disponibile.')), 'image/png'));
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ title: `La Multipla · Giornata ${slip.matchday}`, files: [file] });
  else downloadBlob(blob, filename);
}

export async function fetchUpdateInfo(): Promise<UpdateInfo | null> {
  try {
    let data: unknown;
    if (isNative) {
      const response = await CapacitorHttp.get({ url: VERSION_URL, headers: { 'Cache-Control': 'no-cache' } });
      if (response.status < 200 || response.status >= 300) return null;
      data = response.data;
    } else {
      const response = await fetch('./app-version.json', { cache: 'no-store' });
      if (!response.ok) return null;
      data = await response.json();
    }
    if (!data || typeof data !== 'object') return null;
    const source = data as Record<string, unknown>;
    if (!source.version) return null;
    return { version: String(source.version), apkUrl: source.apkUrl ? String(source.apkUrl) : undefined, notes: source.notes ? String(source.notes) : undefined };
  } catch { return null; }
}

export function appVersion() { return APP_VERSION; }
