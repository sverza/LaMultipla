'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {isNative,requestNotificationPermission} from './lib/native';
import {pairPrivate,privateProfile,privateStatus,loginPrivate,logoutPrivate,enablePrivate,receivePrivate,transitionPrivateShadow,type PrivateStatus} from './lib/private';
import type {PrivatePairing} from '../shared/private-pairing.mjs';
export function PrivateDelivery({visible,onReceived}:{visible:boolean;onReceived:()=>Promise<void>}){
  const [profile,setProfile]=useState<PrivatePairing|null>(null),[status,setStatus]=useState<PrivateStatus|null>(null);
  const [fingerprint,setFingerprint]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
  const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false);const input=useRef<HTMLInputElement>(null),checking=useRef(false);
  const transitionInput=useRef<HTMLInputElement>(null);
  const remaining=useRef(0),retryAfter=useRef(0),retryDelay=useRef(30000);
  const refresh=useCallback(async()=>{setProfile(await privateProfile());setStatus(await privateStatus());},[]);
  const sync=useCallback(async()=>{
    if(checking.current)return;checking.current=true;
    try{const result=await receivePrivate(onReceived);remaining.current=result.pending;retryDelay.current=30000;retryAfter.current=Date.now()+30000;setNotice(result.pending?'Recupero delle analisi ancora in corso.':`Archivio privato aggiornato · ricevuta ${result.sequence}.`);}
    catch{remaining.current=1;retryAfter.current=Date.now()+retryDelay.current;retryDelay.current=Math.min(300000,retryDelay.current*2);setNotice('Ricezione da completare: controlla accesso e connessione. Le analisi salvate restano disponibili.');}
    finally{checking.current=false;await refresh().catch(()=>{});}
  },[onReceived,refresh]);
  useEffect(()=>{
    if(!isNative)return;
    void Promise.all([privateProfile(),privateStatus()]).then(async([p,s])=>{setProfile(p);setStatus(s);if(p&&s.backgroundEnabled)await sync();}).catch(()=>{});
    const resume=()=>{if(document.visibilityState==='visible')void privateStatus().then(s=>{if(s.backgroundEnabled)void sync();}).catch(()=>{});};
    const online=()=>resume();document.addEventListener('visibilitychange',resume);window.addEventListener('online',online);
    // Local-only inbox check while visible. No network polling: signed FCM wakes Android.
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible'&&Date.now()>=retryAfter.current)void privateStatus().then(s=>{if(s.backgroundEnabled&&(s.pending||remaining.current))void sync();}).catch(()=>{});},10000);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',online);};
  },[refresh,sync]);
  async function action(fn:()=>Promise<void>){setBusy(true);try{await fn();await refresh();}catch{setNotice('Operazione non completata. Verifica abbinamento, accesso e connessione.');}finally{setPassword('');setBusy(false);}}
  if(!visible)return null;
  return <section className="settings-card experiment-import"><h2>Ricezione privata dal PC</h2>
    {!isNative?<p>La ricezione automatica e le notifiche si collaudano nell’APK Android.</p>:<>
      <p>Le analisi firmate arrivano in Esperimento. Stake reale 0 €.</p>
      {!profile?<><label>Fingerprint mostrato sul PC<input aria-label="Fingerprint del PC" value={fingerprint} onChange={e=>setFingerprint(e.target.value)} autoComplete="off" /></label>
        <button className="secondary wide" disabled={busy} onClick={()=>input.current?.click()}>Abbina il PC una sola volta</button>
        <input hidden ref={input} type="file" accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];if(file)void action(async()=>{if(file.size>16384)throw new Error();await pairPrivate(JSON.parse(await file.text()),fingerprint);setNotice('PC abbinato. Accedi con l’account privato del telefono.');});e.target.value='';}} /></>:<>
        <p>PC abbinato · canale {profile.trust.channel==='synthetic_shadow'?'collaudo sintetico':'shadow'}.</p>
        {profile.trust.channel==='synthetic_shadow'&&<>
          <button disabled={busy||status?.backgroundEnabled||Boolean(status?.pending)} className="secondary wide" onClick={()=>transitionInput.current?.click()}>Configura il canale shadow dal PC</button>
          <input hidden ref={transitionInput} type="file" accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];if(file)void action(async()=>{
            if(file.size>16384)throw new Error();await transitionPrivateShadow(JSON.parse(await file.text()));
            setNotice('Canale shadow configurato. Test sintetici conservati; accesso salvato; ricezione sospesa.');
          });e.target.value='';}} />
        </>}
        <details><summary>Accesso privato</summary><form onSubmit={e=>{e.preventDefault();void action(async()=>{await loginPrivate(email,password);setNotice('Accesso effettuato. Puoi abilitare la ricezione privata.');});}}>
          <label>Email<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} /></label><button disabled={busy} className="secondary wide">Accedi</button>
        </form></details>
        <button disabled={busy} className="primary wide" onClick={()=>void action(async()=>{const enabled=!status?.backgroundEnabled;if(enabled)await requestNotificationPermission();await enablePrivate(enabled);setNotice(enabled?'Ricezione privata abilitata.':'Ricezione privata sospesa.');})}>{status?.backgroundEnabled?'Sospendi ricezione privata':'Abilita ricezione privata'}</button>
        <button disabled={busy} className="secondary wide" onClick={()=>void action(sync)}>Recupera analisi in attesa</button>
        <button disabled={busy} className="secondary wide" onClick={()=>void action(async()=>{await logoutPrivate();setNotice('Accesso chiuso; ricezione sospesa.');})}>Esci dall’accesso privato</button>
        <p>{status?.accessSaved?'Accesso salvato':'Accesso necessario'} · {status?.backgroundEnabled?'Ricezione attiva':'Ricezione sospesa'} · {status?.pending??0} pacchetti da importare.{status?.lastFailure?' Ultimo download da riprovare.':''}</p>
      </>}
      {notice&&<p role="status">{notice}</p>}
    </>}
  </section>;
}
