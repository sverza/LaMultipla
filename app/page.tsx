'use client';
/* eslint-disable @next/next/no-img-element -- i percorsi relativi devono funzionare anche sotto GitHub Pages */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calibration,
  CurrentSlipCard,
  PerformanceBreakdown,
  PickResultControl,
  PlacementPanel,
  Ring,
  SeasonComparison,
  SeasonMap,
  Settlement,
  SlipCard,
  Title,
  TrendChart,
} from './components';
import {
  APP_VERSION,
  buildStats,
  compareVersions,
  effectiveOdd,
  euro,
  formatDate,
  isPlayed,
  normalizeSlip,
  parseSlip,
  PickResult,
  quotedOdd,
  Slip,
  slipLabels,
  SlipResult,
} from './lib/model';
import {
  appVersion,
  cancelResultReminder,
  configureSync,
  exportBackupFile,
  fetchRemoteFeed,
  fetchUpdateInfo,
  getSyncStatus,
  haptic,
  isNative,
  notificationPermission,
  requestNotificationPermission,
  runNativeSyncNow,
  scheduleResultReminder,
  setNativeNotificationsEnabled,
  shareSlipCard,
  UpdateInfo,
} from './lib/native';
import { putSlip, readAll, removeSlip, replaceAll, updateSlip } from './lib/storage';

type View = 'dash' | 'current' | 'history' | 'detail' | 'settings';
type Modal = 'import' | 'edit' | 'schema' | 'backup' | null;
type Theme = 'system' | 'light' | 'dark';
type UndoState = { previous?: Slip; currentId: string; message: string };
type SyncStatus = Awaited<ReturnType<typeof getSyncStatus>>;

const EXAMPLE = `{
  "season": "2026/27",
  "matchday": 1,
  "date": "2026-08-29",
  "notes": "Prima giornata",
  "selections": [
    {
      "match": "Inter - Torino",
      "market": "Over 1.5",
      "odd": 1.35,
      "probability": 78,
      "confidence": 4
    }
  ]
}`;

const sortSlips = (items: Slip[]) => items.slice().sort((a, b) => b.date.localeCompare(a.date) || b.matchday - a.matchday);

export default function Home() {
  const [slips, setSlips] = useState<Slip[]>([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('dash');
  const [chosen, setChosen] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [lastBackup, setLastBackup] = useState(() => typeof window === 'undefined' ? '' : localStorage.getItem('la-multipla-last-backup') || '');
  const [backupDays, setBackupDays] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = localStorage.getItem('la-multipla-last-backup');
    return saved ? Math.max(0, Math.floor((Date.now() - new Date(saved).getTime()) / 86_400_000)) : null;
  });
  const [activeSeason, setActiveSeason] = useState('');
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    const saved = localStorage.getItem('la-multipla-theme');
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [notifications, setNotifications] = useState('prompt');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const backupInput = useRef<HTMLInputElement>(null);
  const checkingRef = useRef(false);

  const load = useCallback(async () => {
    const items = sortSlips(await readAll());
    setSlips(items);
    setReady(true);
    setActiveSeason((current) => {
      if (current && items.some((slip) => slip.season === current)) return current;
      const saved = localStorage.getItem('la-multipla-season');
      if (saved && items.some((slip) => slip.season === saved)) return saved;
      return items[0]?.season || saved || '2026/27';
    });
    return items;
  }, []);

  const refreshStatus = useCallback(async () => {
    setSyncStatus(await getSyncStatus());
    setNotifications(await notificationPermission());
    setUpdateInfo(await fetchUpdateInfo());
  }, []);

  const checkGitHub = useCallback(async (announce = false) => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const feed = await fetchRemoteFeed();
      if (!feed || typeof feed !== 'object') throw new Error('Il file GitHub non contiene dati validi.');
      const source = feed as Record<string, unknown>;
      if (source.available === false) {
        if (announce) setMessage('Controllo completato: nessuna nuova schedina.');
        return;
      }
      const raw = source.slip || source;
      const preview = parseSlip(raw);
      const feedId = String(source.id || `${preview.season}-${preview.matchday}`);
      localStorage.setItem('la-multipla-last-feed-id', feedId);
      const importedId = localStorage.getItem('la-multipla-imported-feed');
      const current = await readAll();
      const duplicate = current.some((slip) => slip.season === preview.season && slip.matchday === preview.matchday);
      if (importedId === feedId || duplicate) {
        localStorage.setItem('la-multipla-imported-feed', feedId);
        if (announce) setMessage('Controllo completato: sei già aggiornato.');
        return;
      }
      await putSlip(preview);
      localStorage.setItem('la-multipla-imported-feed', feedId);
      localStorage.setItem('la-multipla-season', preview.season);
      setActiveSeason(preview.season);
      await load();
      await haptic('success');
      setMessage(`Giornata ${preview.matchday} importata automaticamente come bozza.`);
    } catch (error) {
      if (announce) setMessage(error instanceof Error ? error.message : 'Controllo GitHub non riuscito.');
    } finally {
      checkingRef.current = false;
      setChecking(false);
      setSyncStatus(await getSyncStatus());
    }
  }, [load]);

  useEffect(() => {
    const savedTheme = (localStorage.getItem('la-multipla-theme') || 'system') as Theme;
    if (savedTheme === 'light' || savedTheme === 'dark') document.documentElement.dataset.theme = savedTheme;
    else delete document.documentElement.dataset.theme;

    const initialLoad = window.setTimeout(() => {
      void load().then(() => checkGitHub(false));
      void refreshStatus();
    }, 0);
    if (!isNative && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');

    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkGitHub(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(initialLoad);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [checkGitHub, load, refreshStatus]);

  const seasons = useMemo(() => [...new Set(slips.map((slip) => slip.season))].sort().reverse(), [slips]);
  const seasonSlips = useMemo(() => slips.filter((slip) => slip.season === activeSeason), [slips, activeSeason]);
  const currentSlip = seasonSlips[0];
  const selected = slips.find((slip) => slip.id === chosen) || (view === 'current' ? currentSlip : undefined);
  const stats = useMemo(() => buildStats(seasonSlips), [seasonSlips]);
  const previousSeason = seasons[seasons.indexOf(activeSeason) + 1];
  const previousStats = useMemo(() => buildStats(slips.filter((slip) => slip.season === previousSeason)), [slips, previousSeason]);
  const backupDue = slips.length > 0 && (backupDays === null || backupDays >= 14);

  const selectSeason = (season: string) => {
    setActiveSeason(season);
    localStorage.setItem('la-multipla-season', season);
  };

  const openSlip = (slip: Slip, destination: 'detail' | 'current' = 'detail') => {
    setChosen(slip.id);
    setView(destination);
  };

  const save = async (slip: Slip, previous?: Slip, savedMessage?: string) => {
    await putSlip(slip);
    if (previous && savedMessage) setUndo({ previous, currentId: slip.id, message: savedMessage });
    if (savedMessage) setMessage(savedMessage);
    await load();
  };

  const importSlip = async () => {
    try {
      const slip = parseSlip(JSON.parse(text));
      const current = await readAll();
      if (current.some((item) => item.season === slip.season && item.matchday === slip.matchday)) throw new Error(`La giornata ${slip.matchday} è già presente.`);
      await putSlip(slip);
      const savedMessage = `Giornata ${slip.matchday} importata come bozza.`;
      setUndo({ currentId: slip.id, message: savedMessage });
      setText('');
      setModal(null);
      selectSeason(slip.season);
      setMessage(savedMessage);
      await load();
      await haptic('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'JSON non valido.');
    }
  };

  const editable = (slip: Slip) => JSON.stringify({
    season: slip.season,
    matchday: slip.matchday,
    date: slip.date,
    notes: slip.notes || '',
    selections: slip.picks.map((pick) => ({ match: pick.match, market: pick.market, odd: pick.odd, probability: pick.probability, confidence: pick.confidence })),
  }, null, 2);

  const openEdit = (slip: Slip) => {
    setChosen(slip.id);
    setText(editable(slip));
    setModal('edit');
  };

  const editSlip = async () => {
    try {
      if (!selected) throw new Error('Schedina non trovata.');
      const parsed = parseSlip(JSON.parse(text));
      if (slips.some((slip) => slip.season === parsed.season && slip.matchday === parsed.matchday && slip.id !== selected.id)) throw new Error(`La giornata ${parsed.matchday} è già presente.`);
      const updated: Slip = {
        ...parsed,
        placement: selected.placement,
        playedOdd: selected.playedOdd,
        result: selected.result,
        returnAmount: selected.returnAmount,
        picks: parsed.picks.map((pick, index) => ({ ...pick, id: selected.picks[index]?.id || pick.id, result: selected.picks[index]?.result || 'pending' })),
      };
      const savedMessage = `Giornata ${parsed.matchday} aggiornata.`;
      await updateSlip(selected.id, updated);
      setUndo({ previous: selected, currentId: updated.id, message: savedMessage });
      setChosen(updated.id);
      setText('');
      setModal(null);
      setMessage(savedMessage);
      selectSeason(updated.season);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Modifica non valida.');
    }
  };

  const backup = async () => {
    try {
      const now = new Date().toISOString();
      const data = JSON.stringify({
        app: 'seriea-multipla', version: 2, exportedAt: now,
        preferences: { theme, activeSeason, notifications: localStorage.getItem('la-multipla-notifications') === 'true', backgroundSync: syncStatus?.enabled ?? true, syncHours: syncStatus?.intervalHours ?? 3 },
        slips,
      }, null, 2);
      await exportBackupFile(data, `la-multipla-backup-${now.slice(0, 10)}.json`);
      localStorage.setItem('la-multipla-last-backup', now);
      setLastBackup(now);
      setBackupDays(0);
      setMessage('Backup completo creato.');
    } catch {
      setMessage('Non sono riuscito a creare il backup.');
    }
  };

  const exportCsv = () => {
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const header = ['Stagione', 'Giornata', 'Data', 'Stato', 'Esito multipla', 'Puntata', 'Quota giocata', 'Quota effettiva', 'Ritorno', 'Profit/Loss', 'Partita', 'Mercato', 'Quota selezione', 'Probabilità stimata', 'Quota equa', 'Value', 'Fiducia', 'Esito selezione', 'Note'];
    const rows = slips.flatMap((slip) => slip.picks.map((pick) => [
      slip.season, slip.matchday, slip.date, isPlayed(slip) ? 'Giocata' : 'Bozza', slipLabels[slip.result], isPlayed(slip) ? slip.stake : '', quotedOdd(slip).toFixed(2), effectiveOdd(slip).toFixed(2),
      isPlayed(slip) && slip.result !== 'pending' ? slip.returnAmount.toFixed(2) : '', isPlayed(slip) && slip.result !== 'pending' ? (slip.returnAmount - slip.stake).toFixed(2) : '',
      pick.match, pick.market, pick.odd.toFixed(2), pick.probability, (100 / pick.probability).toFixed(2), ((pick.odd * pick.probability / 100 - 1) * 100).toFixed(1), pick.confidence, pick.result, slip.notes || '',
    ]));
    const csv = '\ufeff' + [header, ...rows].map((row) => row.map(quote).join(';')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `la-multipla-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const restore = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text()) as { app?: string; slips?: Partial<Slip>[]; preferences?: Record<string, unknown> };
      if (raw.app !== 'seriea-multipla' || !Array.isArray(raw.slips)) throw new Error('Backup non riconosciuto.');
      await replaceAll(raw.slips.map(normalizeSlip));
      if (raw.preferences?.theme && ['system', 'light', 'dark'].includes(String(raw.preferences.theme))) applyTheme(String(raw.preferences.theme) as Theme);
      setUndo(null);
      await load();
      setMessage('Backup ripristinato.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Backup non valido.');
    }
  };

  const deleteSlip = async (slip: Slip) => {
    if (!confirm(`Eliminare definitivamente la giornata ${slip.matchday}?`)) return;
    await removeSlip(slip.id);
    const savedMessage = `Giornata ${slip.matchday} eliminata.`;
    setUndo({ previous: slip, currentId: slip.id, message: savedMessage });
    await load();
    setView('history');
    setMessage(savedMessage);
  };

  const undoLast = async () => {
    if (!undo) return;
    if (undo.previous) {
      await updateSlip(undo.currentId, undo.previous);
      setChosen(undo.previous.id);
    } else await removeSlip(undo.currentId);
    setUndo(null);
    await load();
    setMessage('Operazione annullata.');
  };

  function applyTheme(value: Theme) {
    setTheme(value);
    localStorage.setItem('la-multipla-theme', value);
    if (value === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = value;
  }

  const toggleTheme = () => {
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    applyTheme(dark ? 'light' : 'dark');
  };

  const setPickResult = async (slip: Slip, pickId: string, result: PickResult) => {
    await save({ ...slip, picks: slip.picks.map((pick) => pick.id === pickId ? { ...pick, result } : pick) }, slip, 'Esito selezione aggiornato.');
    await haptic('light');
  };

  const settle = async (slip: Slip, result: SlipResult, manual?: number) => {
    const fallback = result === 'won' ? slip.stake * effectiveOdd(slip) : result === 'void' ? slip.stake : 0;
    const returnAmount = manual !== undefined && Number.isFinite(manual) && manual >= 0 ? manual : fallback;
    const savedMessage = `Giornata ${slip.matchday}: ${slipLabels[result].toLowerCase()}, ritorno ${euro(returnAmount)}.`;
    await save({ ...slip, result, returnAmount: +returnAmount.toFixed(2) }, slip, savedMessage);
    await cancelResultReminder(slip);
    await haptic('success');
  };

  const setPlacement = async (slip: Slip, playedOdd?: number) => {
    const makePlayed = slip.placement === 'draft';
    const updated = { ...slip, placement: makePlayed ? 'played' as const : 'draft' as const, playedOdd: makePlayed ? playedOdd || quotedOdd(slip) : slip.playedOdd };
    await save(updated, slip, makePlayed ? `Giornata ${slip.matchday} confermata come giocata.` : `Giornata ${slip.matchday} riportata in bozza.`);
    if (makePlayed) await scheduleResultReminder(updated);
    else await cancelResultReminder(updated);
    await haptic('success');
  };

  const setPlayedOdd = async (slip: Slip, odd: number) => save({ ...slip, playedOdd: odd }, slip, `Quota giocata aggiornata a ${odd.toFixed(2)}.`);

  const share = async (slip: Slip) => {
    try {
      await shareSlipCard(slip);
      setMessage('Riepilogo pronto per la condivisione.');
    } catch (error) {
      if (error instanceof Error && /cancel|annull/i.test(error.message)) return;
      setMessage('Condivisione non riuscita.');
    }
  };

  const changeBackgroundSync = async (enabled: boolean, hours = syncStatus?.intervalHours || 3) => {
    setSyncStatus(await configureSync(enabled, hours));
    setMessage(enabled ? 'Controllo in background attivato.' : 'Controllo in background disattivato.');
  };

  const changeNotifications = async (enabled: boolean) => {
    if (!enabled) {
      localStorage.setItem('la-multipla-notifications', 'false');
      await setNativeNotificationsEnabled(false);
      setNotifications('denied');
      setMessage('Promemoria disattivati nell’app.');
      return;
    }
    const permission = await requestNotificationPermission();
    const granted = permission === 'granted';
    localStorage.setItem('la-multipla-notifications', String(granted));
    await setNativeNotificationsEnabled(granted);
    setNotifications(permission);
    setMessage(granted ? 'Notifiche e promemoria attivati.' : 'Android non ha concesso il permesso per le notifiche.');
  };

  const runCheck = async () => {
    await runNativeSyncNow();
    await checkGitHub(true);
  };

  const renderSeasonSelector = () => (
    <label className="season-selector"><span>Stagione</span><select value={activeSeason} onChange={(event) => selectSeason(event.target.value)}>{(seasons.length ? seasons : [activeSeason || '2026/27']).map((season) => <option key={season}>{season}</option>)}</select></label>
  );

  return (
    <main className="shell">
      <header>
        <button className="brand" onClick={() => setView('dash')} aria-label="Apri la dashboard"><img src="./icon-192.png" alt="" /><span><strong>La Multipla</strong><small>Serie A · stake fisso €3</small></span></button>
        <div className="header-actions"><button className="round theme-toggle" onClick={toggleTheme} aria-label="Cambia modalità colore"><span className="moon">☾</span><span className="sun">☀</span></button><button className="round" onClick={() => { setText(''); setModal('import'); }} aria-label="Importa schedina">＋</button></div>
      </header>

      <section className="content">
        {view === 'dash' && <>
          <div className="page-intro"><div><div className="eye">PANORAMICA STAGIONE</div><h1>Il tuo campionato,<br /><em>una multipla alla volta.</em></h1></div>{renderSeasonSelector()}</div>
          {!ready ? <div className="empty">Caricamento…</div> : <>
            <CurrentSlipCard slip={currentSlip} onOpen={() => currentSlip && openSlip(currentSlip, 'current')} onImport={() => setModal('import')} />
            {seasonSlips.length > 0 && <>
              <div className="hero"><div className="hero-top"><small>PROFITTO REALIZZATO</small><span>{stats.played} concluse · {stats.pending} aperte{stats.drafts ? ` · ${stats.drafts} bozze` : ''}</span></div><strong className={stats.profit >= 0 ? 'pos' : 'neg'}>{stats.profit >= 0 ? '+' : ''}{euro(stats.profit)}</strong><div>{[['ROI', `${stats.roi.toFixed(1).replace('.', ',')}%`], ['Ritorni', euro(stats.returns)], ['A rischio', euro(stats.atRisk)]].map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</div></div>
              <div className="metrics four"><span><small>Totale puntato</small><strong>{euro(stats.stake)}</strong></span><span><small>Quota media</small><strong>{stats.avgOdd.toFixed(2)}</strong></span><span><small>Media selezioni</small><strong>{stats.avgPicks.toFixed(1)}</strong></span><span><small>Value medio</small><strong className={stats.avgValue >= 0 ? 'pos-text' : 'neg-text'}>{stats.avgValue >= 0 ? '+' : ''}{stats.avgValue.toFixed(1).replace('.', ',')}%</strong></span></div>
              <Title title="Curva del profitto" meta={activeSeason} /><TrendChart points={stats.trend} maxDrawdown={stats.maxDrawdown} onOpen={(id) => { const slip = slips.find((item) => item.id === id); if (slip) openSlip(slip); }} />
              <Title title="Mappa del campionato" meta={`${stats.registered}/38 giocate`} /><SeasonMap slips={seasonSlips} onOpen={openSlip} />
              <div className="rings"><Ring value={stats.win} label="Multiple" detail={`${stats.wonCount} vinte · ${stats.lostCount} perse`} /><Ring value={stats.hit} label="Selezioni" detail={`${stats.wonPicks}/${stats.wonPicks + stats.lostPicks} corrette`} /></div>
              <div className="season-card"><div className="season-head"><span><small>AVANZAMENTO STAGIONE</small><strong>{stats.registered} di 38 giornate giocate</strong></span><b>{(stats.registered / 38 * 100).toFixed(1).replace('.', ',')}%</b></div><div className="progress"><i style={{ width: `${Math.min(100, stats.registered / 38 * 100)}%` }} /></div><div className="season-facts"><span><small>Esposizione massima</small><b>{euro(114)}</b></span><span><small>Miglior giornata</small><b className={stats.best >= 0 ? 'pos-text' : 'neg-text'}>{stats.played ? `${stats.best >= 0 ? '+' : ''}${euro(stats.best)}` : '—'}</b></span><span><small>Peggior giornata</small><b className={stats.worst >= 0 ? 'pos-text' : 'neg-text'}>{stats.played ? `${stats.worst >= 0 ? '+' : ''}${euro(stats.worst)}` : '—'}</b></span><span><small>Serie attuale</small><b>{stats.streak ? `${stats.streak} ${stats.streakResult === 'won' ? 'vinte' : 'perse'}` : '—'}</b></span></div></div>
              {previousSeason && previousStats.played > 0 && <SeasonComparison current={stats} previous={previousStats} previousSeason={previousSeason} />}
              {backupDue && <button className="backup-reminder" onClick={() => setModal('backup')}><span>↥</span><div><strong>{backupDays === null ? 'Proteggi il tuo storico' : 'È ora di un nuovo backup'}</strong><small>{backupDays === null ? 'Non hai ancora esportato una copia.' : `Ultimo backup ${backupDays} giorni fa.`}</small></div><b>Apri →</b></button>}
              <details className="analysis-disclosure"><summary><span><small>ANALISI AVANZATE</small><strong>Mercati, fiducia e calibrazione</strong></span><b>＋</b></summary><PerformanceBreakdown picks={seasonSlips.filter(isPlayed).flatMap((slip) => slip.picks)} matchdays={stats.played} /><Calibration picks={seasonSlips.filter(isPlayed).flatMap((slip) => slip.picks)} /></details>
            </>}
          </>}
        </>}

        {view === 'history' && <><div className="page-intro"><div><div className="eye">ARCHIVIO</div><h1>Storico<br /><em>giornate.</em></h1></div>{renderSeasonSelector()}</div>{!seasonSlips.length ? <div className="empty">Nessuna schedina in questa stagione.</div> : <div className="list">{seasonSlips.map((slip) => <button key={slip.id} onClick={() => openSlip(slip)}><SlipCard slip={slip} /></button>)}</div>}</>}

        {(view === 'current' || view === 'detail') && selected && <>
          {view === 'detail' && <button className="back" onClick={() => setView('history')}>← Storico</button>}
          <div className="detail-heading"><div><div className="eye">GIORNATA {selected.matchday} · {formatDate(selected.date)}</div><h1>La tua<br /><em>multipla.</em></h1></div><button className="share-button" onClick={() => share(selected)}><span>↗</span>Condividi</button></div>
          <SlipCard slip={selected} /><PlacementPanel key={`${selected.id}-${selected.placement}-${selected.playedOdd}`} slip={selected} onToggle={(odd) => setPlacement(selected, odd)} onOdd={(odd) => setPlayedOdd(selected, odd)} /><button className="secondary wide edit-button" onClick={() => openEdit(selected)}>✎ Modifica schedina</button>
          <Title title="Selezioni" meta={`${selected.picks.filter((pick) => pick.result !== 'pending').length}/${selected.picks.length} definite`} /><div className="picks">{selected.picks.map((pick) => <PickResultControl key={pick.id} pick={pick} disabled={!isPlayed(selected)} onChange={(result) => setPickResult(selected, pick.id, result)} />)}</div>
          {!isPlayed(selected) && <p className="hint">Conferma prima la schedina per poter inserire gli esiti.</p>}{isPlayed(selected) && <Settlement key={`${selected.id}-${selected.result}-${selected.returnAmount}-${selected.playedOdd}-${selected.picks.map((pick) => pick.result).join('-')}`} slip={selected} onSettle={(result, amount) => settle(selected, result, amount)} />}<button className="danger" onClick={() => deleteSlip(selected)}>Elimina schedina</button>
        </>}

        {view === 'current' && !selected && <><div className="eye">SCHEDINA ATTUALE</div><h1>La prossima<br /><em>multipla.</em></h1><CurrentSlipCard onOpen={() => undefined} onImport={() => setModal('import')} /></>}

        {view === 'settings' && <>
          <div className="eye">CENTRO DI CONTROLLO</div><h1>Impostazioni<br /><em>e stato.</em></h1><div className="settings-stack">
            <section className="settings-card"><div className="settings-title"><span className="settings-icon">↻</span><div><small>SINCRONIZZAZIONE</small><h2>Schedine da GitHub</h2></div><i className={syncStatus?.enabled ? 'online' : ''} /></div><div className="status-grid"><span><small>Ultimo controllo</small><b>{syncStatus?.lastCheck ? new Date(syncStatus.lastCheck).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Mai'}</b></span><span><small>Ultimo file</small><b>{syncStatus?.lastFeedId || 'Nessuno'}</b></span></div><label className="switch-row"><span><strong>Controllo in background</strong><small>{isNative ? 'Funziona periodicamente anche ad app chiusa' : 'Disponibile nell’APK Android'}</small></span><input type="checkbox" checked={Boolean(syncStatus?.enabled)} disabled={!isNative} onChange={(event) => changeBackgroundSync(event.target.checked)} /><i /></label><label className="select-row"><span>Frequenza controllo</span><select value={syncStatus?.intervalHours || 3} disabled={!isNative || !syncStatus?.enabled} onChange={(event) => changeBackgroundSync(true, Number(event.target.value))}><option value="1">Ogni ora</option><option value="3">Ogni 3 ore</option><option value="6">Ogni 6 ore</option><option value="12">Ogni 12 ore</option></select></label><button className="secondary wide" disabled={checking} onClick={runCheck}>{checking ? 'Controllo in corso…' : 'Controlla ora'}</button></section>
            <section className="settings-card"><div className="settings-title"><span className="settings-icon">♢</span><div><small>ANDROID</small><h2>Notifiche e promemoria</h2></div></div><label className="switch-row"><span><strong>Avvisi attivi</strong><small>Nuova schedina e risultati mancanti</small></span><input type="checkbox" checked={notifications === 'granted' && localStorage.getItem('la-multipla-notifications') === 'true'} disabled={!isNative} onChange={(event) => changeNotifications(event.target.checked)} /><i /></label>{!isNative && <p className="settings-note">Queste opzioni si attiveranno automaticamente nella versione APK.</p>}</section>
            <section className="settings-card"><div className="settings-title"><span className="settings-icon">◐</span><div><small>ASPETTO</small><h2>Modalità colore</h2></div></div><div className="theme-options">{(['system', 'light', 'dark'] as Theme[]).map((value) => <button key={value} className={theme === value ? 'active' : ''} onClick={() => applyTheme(value)}>{value === 'system' ? 'Automatica' : value === 'light' ? 'Chiara' : 'Scura'}</button>)}</div></section>
            <section className="settings-card"><div className="settings-title"><span className="settings-icon">↥</span><div><small>DATI LOCALI</small><h2>Backup e ripristino</h2></div>{backupDue && <b className="attention-dot">!</b>}</div><div className="last-backup"><small>ULTIMA COPIA</small><strong>{lastBackup ? new Date(lastBackup).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Mai eseguita'}</strong></div><button className="primary wide" onClick={backup}>Esporta backup completo</button><button className="secondary wide" onClick={() => backupInput.current?.click()}>Importa backup</button><button className="secondary wide" onClick={exportCsv}>Esporta CSV per Excel</button><input hidden ref={backupInput} type="file" accept=".json,application/json" onChange={(event) => event.target.files?.[0] && restore(event.target.files[0])} /></section>
            <section className="settings-card app-card"><div className="settings-title"><img src="./icon-192.png" alt="" /><div><small>LA MULTIPLA</small><h2>Versione {appVersion()}</h2></div></div>{updateInfo && compareVersions(updateInfo.version, APP_VERSION) > 0 ? <div className="update-banner"><span><small>AGGIORNAMENTO DISPONIBILE</small><strong>Versione {updateInfo.version}</strong><em>{updateInfo.notes || 'Nuove funzioni e miglioramenti.'}</em></span>{updateInfo.apkUrl && <button onClick={() => window.open(updateInfo.apkUrl, '_blank')}>Scarica</button>}</div> : <p className="settings-note">L’app è aggiornata. Le schedine da GitHub non richiedono un nuovo APK.</p>}<button className="link wide" onClick={() => setModal('schema')}>Visualizza schema JSON</button></section>
          </div><small className="privacy">🔒 Tutto lo storico resta sul tuo dispositivo. Nessun account, backend o profilazione.</small>
        </>}
      </section>

      <nav><button className={view === 'dash' ? 'active' : ''} onClick={() => setView('dash')}><b>⌂</b>Home</button><button className={view === 'current' ? 'active' : ''} onClick={() => { if (currentSlip) openSlip(currentSlip, 'current'); else setView('current'); }}><b>◇</b>Schedina</button><button className={view === 'history' || view === 'detail' ? 'active' : ''} onClick={() => setView('history')}><b>◷</b>Storico</button><button className={view === 'settings' ? 'active' : ''} onClick={() => { setView('settings'); refreshStatus(); }}><b>⚙</b>Altro</button></nav>
      {message && <div className="toast"><span>{message}</span>{undo && message === undo.message && <button onClick={undoLast}>Annulla</button>}<button className="toast-close" onClick={() => setMessage('')} aria-label="Chiudi">×</button></div>}
      {modal && <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && setModal(null)}><div className="modal"><button className="close" onClick={() => setModal(null)}>×</button>
        {modal === 'import' && <><div className="eye">NUOVA GIORNATA</div><h2>Incolla la schedina</h2><p>Da 1 a 6 selezioni. Verrà salvata come bozza; lo stake è sempre 3 €.</p><textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={EXAMPLE} /><button className="primary wide" onClick={importSlip}>Controlla e importa</button><button className="link wide" onClick={() => setModal('schema')}>Vedi lo schema accettato</button></>}
        {modal === 'edit' && <><div className="eye">MODIFICA GIORNATA</div><h2>Correggi la schedina</h2><p>Puoi cambiare data, quota, mercato o selezioni. Gli esiti già inseriti restano associati per ordine.</p><textarea value={text} onChange={(event) => setText(event.target.value)} /><button className="primary wide" onClick={editSlip}>Salva modifiche</button></>}
        {modal === 'schema' && <><div className="eye">FORMATO ACCETTATO</div><h2>Schema JSON</h2><p><code>probability</code> è una percentuale; <code>confidence</code> va da 1 a 5.</p><pre>{EXAMPLE}</pre><button className="primary wide" onClick={() => { navigator.clipboard.writeText(EXAMPLE); setMessage('Schema copiato.'); }}>Copia esempio</button></>}
        {modal === 'backup' && <><div className="eye">I TUOI DATI</div><h2>Backup ed esportazione</h2><p>Il backup include tutte le stagioni e le preferenze principali.</p>{lastBackup && <div className="last-backup"><small>ULTIMA COPIA</small><strong>{new Date(lastBackup).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}</strong></div>}<button className="primary wide" onClick={backup}>Esporta backup JSON</button><button className="secondary wide" onClick={exportCsv}>Esporta CSV per Excel</button><button className="secondary wide" onClick={() => backupInput.current?.click()}>Importa backup</button><small className="privacy">🔒 Nessun dato lascia il dispositivo.</small></>}
      </div></div>}
    </main>
  );
}
