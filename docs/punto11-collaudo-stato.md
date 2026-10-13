# Punto 11 — stato del collaudo, 11 ottobre 2026

Base remota prima del recupero: `977ec415cb3051eadbf2110d5070ba68676a65af`, PR #2 in bozza. Punto 10 completato come implementazione sperimentale: 114 test superati e CI verde sul commit consegnato. Questo checkpoint raccoglie il lavoro successivo autorizzato alla consegna nella Fase 0; non attribuire al nuovo commit la CI del precedente.

Nessun merge, deploy, rilascio di produzione, pubblicazione di schedine o nuova automazione. Stake reale 0 €. Vecchio trigger sospeso secondo lo stato già accertato; nessuna API di gestione automazioni invocata durante il collaudo. Snapshot originali della sesta giornata non riscritti.

## Collaudo sintetico completato

Le prove fisiche sul PC e sul Samsung Galaxy S24 Ultra sono confermate dall'utente. Non sono test del dispositivo eseguiti dal container.

| Verifica | Windows | PWA installata | APK di collaudo |
|---|---|---|---|
| Import quattro pacchetti sintetici v4 | Superata | Superata | Superata |
| MULTIPLA_SIMULATA, NO BET motivati, ricevuta redatta | Superata | Superata | Superata |
| Esperimenti separati dalle giocate | 4 esperimenti / 0 schedine | 4 / 0 | 4 / 0 |
| Persistenza dopo chiusura e riapertura | Superata | Superata | Superata |
| Backup v4, restore in archivio vuoto, deduplicazione | Superata | Superata | Superata |
| Rifiuto payload alterato con hash invariato | Non attestata in questa sequenza | Superata, restano 4 | Superata, restano 4 |
| Apertura, navigazione, esportazione senza rete | Non oggetto della prova desktop | Superata dopo correzione SW | Superata |
| Integrità backup offline verificata sul PC | — | Superata | Superata |

Compatibilità v3 sul PC provata con storico vuoto, preservando gli esperimenti: non attesta migrazione completa dei dati legacy. I prezzi osservati e le probabilità della prova positiva sono sintetici e non dimostrano accuratezza o valore su partite reali.

Backup privati verificati sul PC:

- `.local/android-v4-backup-before-restore-2026-10-11.json` e `.local/android-v4-backup-offline-2026-10-11.json`: PWA, versione 4, quattro esperimenti, zero schedine.
- `.local/android-apk-v4-backup-before-restore-2026-10-11.json` e `.local/android-apk-v4-backup-offline-2026-10-11.json`: APK, `parseBackup` superato per tutti gli elementi, versione 4, quattro esperimenti, zero schedine, `backgroundSync: false`.

I backup non sono allegati al repository pubblico.

## Correzione offline PWA

La prima apertura offline mostrava HTML senza stile e pulsanti non operativi. `public/sw.js` v9 precache anche CSS e JS referenziati dal documento iniziale; fallback HTML solo per navigazioni. L'utente ha applicato la correzione al server locale e confermato la prova offline riuscita.

Sei test mirati Node del service worker superati: root/basepath, installazione incompleta, fallback navigazione, feed senza copia obsoleta, preservazione di altre cache, scritture runtime. Nessun nuovo test browser offline nel container attestato; verifica reale sul telefono. Nella Fase 0 autorizzata per recuperare e pubblicare il lavoro locale, la suite completa è stata eseguita una volta sulle modifiche da consegnare: 123/123 test superati (114 precedenti e nove nuovi). Lint zero errori, solo il warning preesistente `combinedPlayedOdd`.

## APK nativo separato: prova completata

L'APK resta il prodotto principale previsto; la PWA è aggiuntiva. L'app originale `it.personale.lamultipla` non è stata aggiornata o azzerata.

`scripts/prepare-android-v4-collaudo.mjs` prepara manualmente una nuova copia `.local/android-v4-collaudo`, package `it.personale.lamultipla.collaudo`, nome `LaMultipla TEST APK`, FileProvider separato e banner esplicito. Esclude credenziali/dati locali/feed/correzioni storiche, riusa le dipendenze, rifiuta destinazioni esistenti. Nella sola copia forza l'anteprima, blocca feed/aggiornamenti e rimuove servizio periodico e comandi che possono creare job. Necessario perché il plugin originale può schedulare un job già durante `getStatus`. Nessuna modifica/cancellazione dei job originali.

Windows: sorgente `977ec41`, 75 file verificati, `sourceUnchanged: true`, job/feed/release disabilitati, API 0. Prima preparazione interrotta prima della scrittura per CRLF; script corretto e poi riuscito. Tre test mirati dello script, lint, build web e sync della copia superati nel container.

Sul PC: Java 21, SDK 36, Build Tools 35.0.0; build web, sync Capacitor e `assembleDebug` riusciti. Gradle ha installato Platform-Tools nella radice SDK privata; ADB precedente resta separato. APK 7.302.355 byte, SHA256 `ac8772413343bdc73dc3b068dc66474b39ccd1a92b7cd630f2b3149bc4e6fbe6`. Manifest compilato: package/nome/provider separati, nessun servizio o avvio automatico. Installazione e prove native completate; restore da vuoto dopo backup validato, azzerando esclusivamente il package di test.

Ultimo controllo read-only `dumpsys jobscheduler it.personale.lamultipla.collaudo`: sezione Registered filtrata `None.`. Intestazione 785 jobs globale, non conteggio del package di test. Backup offline integro, sincronizzazione disabilitata.

Limite: chooser Android di condivisione aperto, ma lettura FileProvider da parte di un'app destinataria esterna non provata. Backup recuperato senza modificarne i byte dalla cache del package debug via ADB. Consegna automatica, notifiche v4 e autenticità del produttore restano da implementare/collaudare. Versione/timestamp dell'APK originale non acquisiti: non attestare confronto prima/dopo.

## Prova prospettica reale aperta

Calendario privato settima giornata: dieci eventi, primo kickoff registrato 16 ottobre 2026 ore 18:45 UTC / 20:45 Europe/Rome; SHA `805b16b7a75c304d4665ce7415e3f93fec2ade4d853233cb0e7b1c2d34b4ae0e`. Riconfermare alla fonte ufficiale prima del freeze. Nessun forecast/report quote della settima giornata prodotto.

Sviluppo v2 privato completato, mercati validati vuoti e uso operativo non approvato. Non ripetere tuning/confronto storico. Nuovo storico osservato e verificato prima del freeze; refit mensile resta con cutoff 1 ottobre, senza risultati successivi nel training. I nuovi dati possono aggiornare il contesto secondo policy.

Prima della prova: calendario/identità, storico, codice registrato, quota API corrente; freeze nuovo entro 24 ore, quote successive al forecast e fresche entro 30 minuti, contesto/regole/prezzi attestati quando richiesti, buffer pre-kickoff 5 minuti. Riutilizzare artefatti idonei; non sovrascrivere forecast scaduti. Finale unico, replay prima dell'import. MULTIPLA_SIMULATA o NO BET validi; stake reale 0 €.

## Obbligo separato dal 15 ottobre

Journal originale `2026-27-round-06-goals-v1-b630b78`, SHA già verificato sul PC `6500cb65e321568c033bfec90e90fee97b43b6fb489f07e9daf4b15adc3a9070`. Baseline `lamultipla-market-baseline-v1` verificata indipendentemente sul PC: journal associato corretto, SHA `199386b326542ab68d7f7f18c80ac1b691f9e335db40a9c00070f552076d9990`, integrità confermata. Non ripetere questi controlli senza motivo.

Dal 15 ottobre Europe/Rome: risultati verificati e valutazione append-only secondo [validazione prospettica v1](validazione-prospettica-v1.md). Nessun nuovo forecast/quote del pilot. Nessun promemoria/job creato.

## Consegna e blocchi

Proposta ancora non attivata: [motore Windows e consegna privata a costo zero](punto11-consegna-privata.md). GitHub conserva codice/verifiche; non possiede file/credenziali del PC. Firma, REST privato, outbox, import/cursore atomici e regole sono ora implementati e collaudati con dati sintetici/emulatore; integrazione APK/FCM, orchestratore e collaudo reale del trasporto restano da completare. Non è ancora un servizio automatico operativo.

L'utente conferma che il PC può restare acceso spesso. Il progetto prevede futura ripartenza al suo accesso Windows, recuperando solo attività ancora temporalmente valide; nessun task creato ora. Il PC deve comunque essere disponibile nella finestra utile prima dei kickoff.

L'11 ottobre l'utente riferisce di avere già chiarito con OddsPapi il giorno precedente: uso privato, senza distribuzione pubblica/a pagamento, consentito. Il percorso privato procede su questa conferma; nessun nuovo contatto o richiesta di conferma obbligatoria. Non estendere il chiarimento alla pubblicazione di dati o ricevute reali nel repository pubblico. La risposta originale del provider non è stata acquisita in questa sessione.

Restano evidenze umane richieste dalle policy attuali, futura configurazione account/destinatari, sviluppo della consegna e autorizzazione all'attivazione. Sviluppo locale sintetico può proseguire nel frattempo.

Audit Windows: 27 vulnerabilità, 1 bassa/3 moderate/21 alte/2 critiche. Analisi e correzioni mirate aperte; nessun `audit fix --force`. Nessuna modifica ai workflow o alle automazioni.

## Recupero del lavoro locale — Fase 0

Checkout Windows verificato dall'utente: branch della PR, HEAD `977ec41`, nessun commit successivo o file non tracciato da recuperare; unica modifica `public/sw.js`. Il suo SHA256 coincide con la correzione di questo ambiente: `d24627cc76854bc69ddcddf27093593b1e5567b38fe07a9a6dbe18dc1d954b25`. `.local/`, `.next/`, `node_modules/`, `out/` e `next-env.d.ts` risultano ignorati anche sul PC.

Consegna preparata con sei percorsi espliciti: SW, preparatore APK, due test e i due documenti del punto 11. Revisione del contenuto e scansione credenziali senza rilevamenti; nessun report reale, journal, forecast, backup, token o dato personale riservato incluso. Nessun `git add -f`, reset o pulizia dei file privati. Suite 123/123, lint zero errori e warning preesistente, build Next/TypeScript completata. Le prove del telefono non vengono ripetute.

## Primo blocco del trasporto privato — 11 ottobre

Recupero precedente pubblicato in `cd313130d078801e138c5ce627e51abd7fca5417`; PR #2 ancora in bozza e verifica CI #15 verde. Il successivo blocco aggiunge firma P-256, outbox, REST Auth/Firestore, ricevitore con cursore atomico, regole verificate in emulatore e adapter DPAPI/CLI manuale. Suite completa 140/140 superata, lint zero errori (warning preesistente), build riuscita. Le 17 nuove prove usano esclusivamente fixture sintetiche; i test Firestore separati usano un progetto demo locale e l'emulatore viene spento dopo la prova.

DPAPI non è collaudabile nel container Linux: predisposto `scripts/private-vault-selftest.mjs`, che sul PC crea soltanto una cartella di prova nuova dentro `.local`, verifica cifratura/lettura/rifiuto alterazioni, poi elimina esclusivamente tale cartella. Non richiede credenziali o account cloud. Non ripetere i collaudi manuali v4/PWA/APK già superati: questo è un nuovo componente.

Nessuna consegna cloud/FCM reale o integrazione APK del nuovo trasporto attestata. Orchestratore, Task Scheduler non attivato, contesto automatico, risultati e prova end-to-end su Samsung restano lavori aperti. Il journal originale rimane una valutazione separata obbligatoria dal 15 ottobre, senza modificarne gli snapshot.

## Aggiornamento DPAPI e ricezione privata

DPAPI collaudato sul PC Windows dall’utente: `encryptedOnDisk`, `sameUserRoundTrip`, `tamperingRejected` tutti veri, zero richieste API e nessun job attivato. Nuovo codice APK/FCM preparato; il precedente APK offline resta una prova del contratto v4, non del nuovo trasporto. Build e collaudo sul Samsung del nuovo APK restano aperti. Vedere `punto11-ricezione-android.md`.


## Recupero trasporto dopo la diagnostica — 12 ottobre

APK diagnostico aggiornato sul Samsung senza perdere abbinamento o analisi simulata. Prima consegna recuperata manualmente con ACK, seconda senza notifica: nessuna ricezione autonoma attestata. Identificati nel codice la ricostruzione non compatibile dei byte JSON Android e un replay incompleto dopo import IndexedDB seguito da errore nativo; corretti senza toccare snapshot, chiavi o report privati. Nuovi test host e test strumentali predisposti: dettagli e limiti in [ricezione Android](punto11-ricezione-android.md). Compilazione/esecuzione delle prove strumentali e ricezione automatica su dispositivo ancora aperte. Nessun task Windows o automazione periodica attivato.


Il 12 ottobre alle 23:54 Europe/Rome l’utente conferma compilazione delle sole varianti app, verifica identità/firme, aggiornamento del package di collaudo e installazione del package test. I due test strumentali del protocollo sul Galaxy terminano con **OK (2 tests)**. Sono aggiuntivi alle 174 prove host e non attestano ancora notifiche o ricezione autonoma. Fonte: output Windows/Android condiviso dall’utente; nessun dato privato del progetto cloud incluso nel rapporto.


## Trasporto privato end-to-end — 13 ottobre

Recupero automatico delle prime due consegne all’apertura dell’APK, senza nuovo login: cursore/ACK 2, pending 0. Nuova consegna sintetica NO BET per revisione mancante, app in background: notifica immediata riferita dall’utente; apertura, import v4 della giornata sintetica 9 e ACK 3/pending 0 confermati. Primo percorso PC → cloud privato → notifica Android → Esperimento → ACK attestato. Telefono offline, reti distinte, PC spento/riavvio e backup successivo restano da collaudare. Orchestratore Windows e Task Scheduler non ancora implementati/attivati; modello non autorizzato al gioco.


Consegna 4 MULTIPLA_SIMULATA: telefono inizialmente offline, poi dati mobili con Wi-Fi/USB disattivati e PC spento. Notifica immediata riferita dall’utente; dopo riaccensione/accesso PC, ACK 4/pending 0. Recupero dal cloud e stato persistente del produttore confermati; avvio automatico del motore Windows non attestato. Primo componente eseguibile del futuro orchestratore: recupero periodico delle sole consegne, con stato/retry/lock; preparazione Task Scheduler disabilitata e sola validazione COM da collaudare sul PC. Nessun task registrato. Vedere [orchestratore Windows](punto11-orchestratore-windows.md).


Self-test Windows del recupero consegne superato il 13 ottobre. Prima validazione COM rifiutata per XML malformato; prova comparativa senza dichiarazione XML accettata, riserializzazione nativa e sola validazione riuscite, nessun task registrato. Generatore/validatore corretti senza modificare la preparazione privata originale; riconferma dello script aggiornato ancora necessaria.


Il 13 ottobre alle 00:44 Europe/Rome il validatore aggiornato sul PC conferma sola validazione COM, normalizzazione in memoria, preparazione disabilitata e nessun task registrato. Due esecuzioni separate del recupero consegne reale confermano ACK 4/pending 0: prima richiesta di rete, seconda solo ricevuta locale. Nessun nuovo login/invio, nessuna API OddsPapi o analisi attivata. Componente Windows delle consegne collaudato, motore analitico ancora da collegare.

Il 13 ottobre alle 01:16 Europe/Rome l’utente conferma **12/12 nuovi test di orchestrazione su Windows**, zero errori/skip: checkpoint di ogni fase, processo terminato durante lock, report completo prima della ricevuta, tentativo ambiguo senza ripetizione, scadenza e protezione del pilot, simulazione/NO BET firmati con adapter sintetici. Non prova ancora un’acquisizione OddsPapi reale o il ciclo autonomo di una giornata. Commit analitico `64af475` e correzione portabilità `111bd35` pubblicati, Actions verdi, PR in bozza. La provenienza del calendario futuro contiene URL ufficiali verificati separatamente; nessuno snapshot originale riscritto.

Configurazione chiave unattended predisposta tramite finestra Windows incollabile, SecureString/DPAPI e salvataggio esclusivo compatibile con il lettore esistente. Le prove host usano solo cifrato/chiave sintetici e adapter: verifica reale di salvataggio/decrittazione sul PC ancora necessaria. Nessuna chiave o richiesta API inclusa nelle prove; dettagli in [analisi persistente](punto11-analisi-persistente.md).

Il 13 ottobre alle 01:24–01:25 Europe/Rome l’utente conferma installazione della chiave OddsPapi via finestra, salvataggio cifrato e decrittazione. Successivo processo `--inspect`: configurazione/lettura unattended confermate senza finestra, rete/API o task. `providerValidated: false`: prova locale, non verifica del piano presso il provider. Implementazione della transizione al canale shadow e nuova copia APK predisposte; prove sul PC/Samsung ancora aperte. Vedere [canale shadow](punto11-canale-shadow.md).

## Preparazione shadow e nuovi test Android — 13 ottobre

Profilo PC shadow preparato con successo a partire da `721afb6`: stessa chiave di firma, quattro consegne sintetiche confermate, archivio precedente conservato, nessuna rete/API, ricezione ancora sospesa e nessun task registrato. File di transizione e identità cloud rimangono privati.

Sul Windows dell'utente: nuova copia APK versione 5, build web/TypeScript, sync Capacitor e build delle sole varianti app/debug e app/debugAndroidTest riusciti. Verificati package di collaudo, nome e certificato precedente per entrambi gli APK; installazioni con aggiornamento riuscite. Sul Samsung, soltanto la nuova classe `PrivateTransitionInstrumentedTest` termina alle 11:54 Europe/Rome con **OK (2 tests)**. Le prove usano stato sintetico e non scrivono nel vault o nell'archivio effettivo: attestano parser/firma/transizione e rifiuto degli stati non ammessi, non ancora il cambio reale di profilo. Applicazione una tantum, conservazione effettiva dell'archivio e registrazione Android shadow restano da verificare.

Alle 11:58–12:03 Europe/Rome, otto esperimenti ancora presenti ma due frame nell'inbox nativa. Recupero fallito con messaggio generico; accesso salvato e log senza errori nativi utili. Revisione del codice Capacitor installato identifica `getLong` incompatibile con il numero JSON `Integer` della ricevuta, che diventa zero. Correzione con validazione rigorosa dei tipi/limiti e diagnostica del consumo; nuovo test Java host e due test strumentali sul vero bridge predisposti. Non attribuire il recupero a sessione scaduta né considerarlo riuscito prima della nuova prova fisica. Archivio, pacchetti, chiave e transizione privata conservati; ricezione sospesa.
