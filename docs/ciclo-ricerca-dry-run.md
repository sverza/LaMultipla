# Ciclo di ricerca locale — plugin dry-run v1

Stato del componente: implementato e testato **soltanto in modalità locale/sintetica**, non attivato. Non è un secondo orchestratore operativo e non acquisisce risultati, non esegue forecast, training o consegne. La futura chiamata va integrata nel gestore Windows esistente, con il suo budget e i suoi adapter autorizzati; nessuna attività pianificata è stata creata.

## Avvio dimostrativo ripetibile

```powershell
node scripts/research-cycle.mjs --demo --dry-run
node --test tests/research-cycle.test.mjs
```

Il primo comando accetta esattamente quei due flag e una fixture sintetica incorporata. Non esistono flag `--live`, URL, credenziali, percorsi di output arbitrari o caricamenti di handler eseguibili. Il namespace è `.local/research-cycle/dry-run/<cycle-hash>/`. Il clock della simulazione è dichiaratamente il 26 ottobre 2026, dopo dieci eventi sintetici; il log distingue questo clock dall'istante effettivo d'invocazione. Non sono dati G8 reali né un forecast anticipato o retrodatato.

La seconda esecuzione dello stesso input e codice riutilizza gli outcome verificati senza rieseguire gli stage. Un input, una nuova osservazione, il codice adapter o gli handler con hash diverso ottengono una nuova directory, senza sostituire la precedente. La CLI rifiuta directory private redirette prima di scrivere il ciclo.

## Contratto del plugin

`researchCycleTick({directory, input, clock, handlers, resumeRetryable})` usa `privateLock` e gli envelope immutabili `writeExclusive` già presenti. L'input comprende:

- `schema: lamultipla-research-cycle-input-v1`; `mode: synthetic | local-only`.
- Manifest esatto di dieci fixture, stagione, giornata, squadre e kickoff UTC espliciti.
- Osservazione locale con identità della fonte, licenza dichiarata, `permission: LOCAL_REVIEW_ONLY`, acquisizione e righe contenenti identità, stato, tempi regolamentari e osservazione. L'etichetta di licenza **non prova un diritto d'uso**: nessuna fonte viene autorizzata dal plugin.
- Eventuale precedente osservazione della stessa fonte, temporalmente non successiva.
- Forecast già esistenti e policy refit opzionali. Il plugin non crea forecast mancanti.

Gli handler iniettati sono funzioni locali affidabili per test e futura integrazione, non codice remoto o path configurabili nella CLI. Ricevono copie congelate di `{input, outputs, now}`. La libreria JavaScript non è una sandbox per funzioni ostili: chi integra un handler deve garantirne l'assenza di effetti esterni. L'hash del testo delle funzioni non osserva lo stato nascosto delle closure: ogni configurazione che incide sui risultati deve stare nell'input versionato, non in variabili esterne. La CLI offre soltanto gli handler puri incorporati; non importa client di rete, provider, cloud o trainer.

| Stage | Funzione realizzata | Limite esplicito |
|---|---|---|
| `capture_local` | Registra hash, fonte e istante dell'osservazione già fornita | Nessun downloader o credenziale |
| `quality` | Verifica identità esatta, duplicati, FT regolamentare, score, osservazioni, revisioni/rimozioni | Non certifica l'affidabilità giuridica o fattuale della fonte |
| `dataset_version` | Crea candidato locale immutabile, con righe riconciliate e hash | Non aggiorna il training o dataset originali |
| `evaluate` | Su sintetici: confronti appaiati 1X2, BTTS e Over 2.5, log-loss, Brier, calibrazione | Dati reali restituiscono `REAL_EVALUATION_REQUIRES_APPROVED_PROTOCOL` |
| `review` | Conserva problemi nei dati, esito e modelli peggiori | Nessuna ipotesi inventata, retuning o promozione |
| `refit_plan` | Distingue policy fissa da refit registrato e prepara hash/intent | Nessun fit eseguito |
| `next_ready` | Elenca eventi futuri/passati e controlli ancora richiesti | Nessun forecast tardivo, scheduler o consegna |

Le metriche riutilizzano il modulo registrato in sola lettura: Brier 1X2 come somma sulle tre classi; binario come `(p-y)^2`; floor log-loss `1e-15`; dieci bin di calibrazione. Ogni mercato usa gli stessi eventi per tutti i modelli e baseline forniti. Un modello negativo rimane nel rapporto. Le metriche sintetiche sono descrittive: non provano accuratezza o promuovono challenger.

## Persistenza e recupero

Ogni stage scrive prima `intent.json`, poi `outcome.json`, entrambi con hash e legame all'input più agli outcome precedenti. Gli outcome riusciti non vengono riscritti. I nomi degli attempt sono consecutivi; alterazioni del legame o dell'envelope vengono rifiutate.

Un intent privo di outcome è **ambiguo**: la ripresa si arresta su quello stage e non lo ritenta, anche con `resumeRetryable`. Questo include l'interruzione fra ritorno dell'handler e pubblicazione dell'outcome. I test simulano questa situazione senza chiamare servizi reali. Un errore noto e dichiaratamente locale `localRetryable` richiede `resumeRetryable: true`; il nuovo attempt conserva il fallimento precedente e riutilizza gli stage completati. Gli altri errori richiedono revisione.

Duplicati, variazioni di identità/kickoff, rimozione di risultati precedenti e modifica di un FT già verificato bloccano dataset ed evaluation anche dopo riavvio. Una transizione ordinaria da partita pending a conclusa viene invece verificata come nuova osservazione. Un risultato mancante rimane pending. L'età della fonte viene riportata; una copia locale recente non è prova di aggiornamento del servizio né di disponibilità nel passato.

I kickoff sono istanti assoluti, senza giorni della settimana fissi: il test del 23/25 ottobre verifica che `18:45Z` prima e `19:45Z` dopo il cambio d'ora corrispondano entrambi alle 20:45 italiane. Non viene creato un forecast per un evento già iniziato o una finestra mancata.

## Cosa manca prima dell'autonomia reale

Occorrono fonte e condizioni approvate, adapter autenticato/rate limit con ledger degli intent, protocollo e coorte preregistrati, regole esplicite dei dataset/refit, journal autentici e integrazione degli stage nel gestore esistente. Restano da implementare dispatch del training, aggregazione cumulativa scientifica con revisioni, gestione operativa dei conflitti e segnalazioni autorizzate. I refit pianificati non equivalgono a modelli pronti. Attivazione, acquisizioni reali automatiche, forecast, task e consegne richiedono autorizzazioni separate.

La demo e i test non leggono journal G6/G7, baseline, backup, vault o gli otto esperimenti. Stake reale zero.
