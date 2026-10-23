# G8 — sicurezza del lock Windows

22 ottobre 2026; base `beef66eb669964e9f85278ecb7f42461af2afa40`, branch `feature/oddspapi-private-import`, PR #2 in bozza.

**G8 LOCK SAFE per il difetto di pubblicazione corretto e le prove qui descritte.** Non significa che siano già presenti le riconferme fresche di venerdì o che il freeze reale sia stato eseguito. Preflight reale: `READY_CON_PREREQUISITI_TEMPORALI`; coorte autentica `NOT_FROZEN`, senza intent.

## Diagnosi dimostrata e limiti dell’attribuzione

La versione precedente creava il record finale con `open('wx')`, scriveva `choosing:true`, chiudeva il proprio handle, calcolava il ticket, scriveva un temporaneo e faceva `rename(temporary, filename)` sopra il record già esistente. L’errore dell’acquisizione FT è localizzato nell’ultima operazione, non nella richiesta PitchAPI: Windows `EPERM`, `process-lock.mjs:33`, prima dell’intent della richiesta169.

Prove isolate sul PC locale, Windows/NTFS:

| Prova | Esito osservato |
|---|---|
| Sostituzioni ordinarie consecutive, nessun handle deliberatamente mantenuto dal test | Prima esecuzione:26 sostituzioni riuscite, `EPERM` al ticket27; target26 e temporaneo27 conservati. |
| Seconda esecuzione indipendente della stessa sequenza |500/500 riuscite: il problema non è un divieto permanente di ogni sostituzione. |
| Rename verso nomi nuovi |500/500 riuscite. |
| Hard link verso nomi nuovi |500/500 riusciti. |
| Destinazione tenuta aperta da un altro processo PowerShell con `FileShare.ReadWrite`, senza `FileShare.Delete` | Rename sopra il file esistente: `EPERM` riproducibile. Contenuto originale invariato. |
| Nuovo nome per il ticket, mentre quell’handle resta aperto | Hard link riuscito. |
| Chiusura dell’handle e ripetizione della sostituzione sacrificabile | Rename riuscito. |

Dimostrato: la sostituzione del nome già pubblicato è vulnerabile alle restrizioni Windows sulla cancellazione/condivisione; chiudere il solo handle del produttore non garantisce il successo. I file della prima prova non erano read-only. **Non è identificato il processo che causò la negazione originale**: antivirus, indicizzazione e altri handle esterni restano ipotesi, non risultati. Non sono stati disattivati antivirus, cambiati permessi del repository o allentate policy PowerShell.

Le prove concorrenti hanno anche mostrato una seconda condizione Windows: un partecipante che si ritira può essere enumerato e poi diventare delete-pending prima di `open`, che può restituire `EPERM`. Viene accettato come assente soltanto dopo una nuova verifica che restituisce esplicitamente `ENOENT`. Se esiste ancora, la negazione viene propagata e l’azione non parte: nessun accesso negato viene interpretato come lock libero.

Evidenze private: `.local/preparation/windows-lock-g8-20261022/`, comprese riproduzioni sacrificabili, log, checkpoint di integrità e preflight reale prima/dopo. Non sono payload provider o credenziali pubblicati.

## Correzione e proprietà di sicurezza

API invariata: `privateLock(directory, action)`. Rimane l’ordinamento Lamport bakery con comportamento fail-fast; nessuna attesa o retry viene aggiunto al lock.

1. Annuncio immutabile `<pid>-<nonce>.json`, con host, PID, nonce, versione, `choosing:true` e ticket0. Si scrive/fsync/chiude un temporaneo proprio e si pubblica mediante hard link esclusivo verso un **nome nuovo**.
2. Ticket immutabile `<pid>-<nonce>.ticket.json`, con ticket positivo e hash dell’annuncio. Stessa pubblicazione esclusiva, senza modificare l’annuncio.
3. Il lettore vede un partecipante ancora in scelta oppure un ticket completo e verificato. Ticket minimo e nonce ordinano i concorrenti; chi trova un proprietario prioritario o ancora in scelta fallisce prima dell’azione.
4. Dopo l’azione si ritira prima il ticket, poi l’annuncio. La transizione intermedia torna a `choosing:true`, quindi blocca i concorrenti, senza creare un intervallo libero durante la sezione critica.

Non c’è più `rename` nel componente. `EEXIST`, accessi negati ed errori di pubblicazione non autorizzano sovrascritture o ingresso nella sezione critica. Prima dell’ingresso vengono ricontrollati i file pubblicati propri; prima della rimozione si verificano File ID/inode, device e bytes attesi. Un record sostituito o alterato viene preservato e produce errore; anche la scomparsa inattesa di un record pubblicato proprio viene segnalata. Un errore di cleanup viene riportato con le cause, non nascosto dietro un successo dell’azione.

La recovery riguarda soltanto record strutturalmente verificati di questo host il cui PID risulta effettivamente terminato. PID vivo o non verificabile: nessun furto. PID riusato da un processo vivo: blocco conservativo. Un record finale corrotto non viene ricostruito dai soli caratteri del filename né eliminato automaticamente.

I temporanei altrui, anche incompleti e appartenenti a processi morti, **non vengono cancellati**: non sono partecipanti pubblicati e restano come diagnostica. Questa è una differenza intenzionale dal cleanup precedente. Il test storico del trasporto ora verifica questa conservazione anziché pretendere la cancellazione del temporaneo estraneo. I record legacy validi rimangono riconosciuti; un vecchio produttore e uno nuovo non possono ignorarsi e accedere entrambi. Non si tenta una migrazione di proprietari attivi.

Ambito: filesystem locale, host unico, produttori che rispettano il protocollo e nomi con nonce mai riutilizzati. Non è un lock distribuito o una protezione contro un attaccante che controlla il filesystem. Errori permanenti di disco, ACL, hard link o handle esterni rimangono errori espliciti e possono richiedere intervento; non vengono convertiti in successo.

## Prove effettive

Sedici nuovi test del componente, eseguiti sul filesystem Windows reale:

- Acquisizione singola e2.000 acquisizioni consecutive, con `rename` proibito nel test: zero invocazioni, rilascio senza record propri residui.
- Due processi e terzo concorrente: nessun ingresso mentre il proprietario è vivo; rilascio regolare e acquisizione successiva.
- Sei processi avviati insieme,600 tentativi: sentinella creata atomicamente con `wx` più intervalli di sezione critica da clock monotono di sistema. Ogni collisione o sovrapposizione fa fallire il test. Nella prova mirata:18 ingressi, zero sovrapposizioni e zero accessi Windows rifiutati. Il protocollo fail-fast non promette fairness o successo di ogni tentativo conteso.
- Terminazione reale del solo processo figlio di prova durante la sezione critica e durante la scelta; recovery dei record verificati, conservazione dei temporanei incompleti.
- Record vivi, legacy, incompleti, corrotti, host discordante, ticket orfano e contenuto alterato durante il rilascio.
- Collisione `EEXIST` reale alla pubblicazione: il target estraneo non viene sostituito o eliminato; errore di pubblicazione `EPERM` iniettato: nessun ingresso.
- Handle Windows reale che vieta la sostituzione; ACL reale che vieta la creazione nella sola directory temporanea di prova, ripristinata al termine.
- Accesso negato a un partecipante ancora presente: rifiuto. Ritiro confermato da `ENOENT` dopo delete-pending: nessun partecipante inesistente inventato.

Le prove di mutua esclusione usano processi separati e filesystem reale, non soltanto mock. L’iniezione riguarda esclusivamente errori aggiuntivi per controllare i percorsi fail-closed. Gli stress runner sono fixture di test finite, non acquisizioni, scheduler o retry produttivi. I processi terminati sono esclusivamente figli sacrificabili avviati dal test.

## Regressione freeze-only e hash scientifici

Il componente è condiviso da acquisizioni private, `reference-series`, `reference-screen`, round manager, ciclo di ricerca, outbox e `withLock`. Nessun chiamante, algoritmo, parametro o regola scientifica viene modificato.

La fingerprint v1 include `goals/{data,model,metrics,study,bridge}.mjs` e il protocollo v1; la v2 include i moduli `engine`, `goals/{data,model,metrics}.mjs` e il protocollo v2. `process-lock.mjs` **non rientra in quei fingerprint**, nei3.400 originali protetti o negli input sigillati del piano. Registry e riproduzione dei modelli sono verificati dal preflight reale anche dopo il fix.

Proposta approvata invariata: `3d477e4f8c9b9ab5393514af3f8f711443787a3fe4396cc84695dbdb8b696d77`. Envelope di approvazione invariato: `7c876786f046d9e897f98da913542429f52297acd8bef43affa3190c3fea4da4`. Nessuna nuova registrazione, modifica o rinnovo dell’approvazione.

Due livelli di regressione sintetica:

1. Transazione fra processi: journal v1 persistito, concorrente respinto, proprietario terminato realmente, recovery, v1 e intent byte-identici, journal v2, ricevuta verificata `FROZEN_VERIFIED`, replay senza riscrittura.
2. Runner originali v1/v2 su soli dati sintetici: crash dopo v1, recupero,40 bootstrap prescritti, payload deep-equal ai runner diretti, blocco su input cambiati, journal alterati e deadline scaduta. Nessun forecast G8 autentico.

Assemblaggio del piano, approvazioni, finestre, timezone/DST, input freschi, lock, intent, receipt e API read-only sono coperti dai48 test mirati passati. Preflight reale prima/dopo: stessi esiti sostanziali e `READY_CON_PREREQUISITI_TEMPORALI`. Rimangono da fornire venerdì le riconferme ufficiali e provider fresche e da attendere **14:45 ≤ Europe/Rome <18:15**. Verifica reale della coorte: `NOT_FROZEN`, `intentPresent:false`. Nessun calcolo o registrazione reale eseguiti.

Comandi locali/read-only già presenti:

```powershell
node scripts/reference-preflight.mjs --plan .local/preparation/g8-authorized/reference-plan.pending.private.json
node scripts/reference-series.mjs --verify
```

Il fix non autorizza un’esecuzione anticipata o automatica. I comandi di assemblaggio/freeze e le approvazioni restano quelli del piano G8 esistente. Prima del freeze evitare altri produttori sul medesimo namespace; su errore conservare intent/journal/ricevuta e verificare lo stato prima di qualsiasi recupero entro finestra.

## PitchAPI preservato, non riavviato

Verifica esclusivamente offline:236 stats presenti,168 nuove ricevute dell’incarico precedente, manifest e grant sigillati,168 intent/trasmissioni/checkpoint, nessuna ambigua. Prossima richiesta mai avviata: **batch3, posizione49, ordinale169**. Budget residuo1.735, non rinnovato né consumato.

Tutti i1.862 file dell’archivio presenti all’inizio sono controllati mediante hash prima/dopo. Le21 analytics disponibili e nove indisponibilità restano invariate. Nessun nuovo `/stats`, `/advanced` o altro endpoint richiesto. STOP e checkpoint rimangono conservati; il fix non li cancella o sblocca.

Il runner privato di completamento è anche ancorato al vecchio HEAD: la futura ripresa richiederà una review tecnica del nuovo commit e una risoluzione esplicita dello stop nel runner, mantenendo manifesto, grant, budget e ricevute. Non viene fatto in questo incarico e non richiede inventare una nuova autorizzazione alle richieste già comprese nel residuo.

## Esiti finali

Suite locale completa: **457/457**; lint zero errori, solo warning preesistente `combinedPlayedOdd`; build Next/TypeScript riuscita. Le due prove specifiche Windows sono eseguite localmente; su CI Linux sono dichiarate skip, non presentate come prove Windows. Commit remoto e CI effettivamente osservati sono riportati nella consegna.

Originali, grant, journal, dataset/cutoff, ledger OddsPapi e approvazioni G8 invariati. Nessuna API applicativa, forecast reale, refit reale, consegna, deploy, APK, scheduler o scommessa. Stake reale zero. Nessun processo di acquisizione PitchAPI lasciato attivo.
