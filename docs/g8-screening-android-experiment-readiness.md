# G8 — SCREENING & ANDROID EXPERIMENT READINESS

Verifica del 22 ottobre 2026, ramo `feature/oddspapi-private-import`. **Percorso manuale collaudato su dati sintetici; esecuzione originale e consegna reale ancora da autorizzare nei rispettivi ambiti.** Il freeze e le approvazioni G8 già registrate non cambiano. Stake reale 0 €.

## Collegamenti verificati

| Componente | Prima dell'intervento | Stato e limite attuale |
|---|---|---|
| Freeze-only della nuova coorte | Già collaudato, namespace autonomo | Invariato. Nessun journal G8 autentico ancora prodotto in questo incarico. |
| Consumo dei journal | L'orchestratore cercava i percorsi canonici precedenti | Nuovo adapter esterno `scripts/reference-screen.mjs`: lettura in posizione, nessuna copia nei journal precedenti. |
| Screening e selettore | Implementati in `shadow.mjs` e relativi moduli | Riutilizzati. Nessun nuovo selettore, soglia EV, modello o assunzione di indipendenza. |
| Diagnostica multimercato | Separata dal selettore 1X2 | La CLI ottimizzata A/B1/B2 legge in posizione il journal v2. Rimane un comando successivo indipendente; nessun mercato sperimentale entra nel selettore. |
| Pacchetto v4 | Una decisione senza proposta diventava sempre `no_bet` | Il bridge usa v4 soltanto per una proposta completa; per gli altri esiti usa gli aggiornamenti di giornata già supportati. |
| Firma, sequenze, deduplica, ACK | Già implementati | Riutilizzati senza modifica del contratto condiviso o delle regole Firebase. |
| App TEST v7 | Supporto `roundStateProtocol:1` già collaudato sul Samsung | Contratti compatibili. In questo incarico verificata l'interfaccia locale, non una nuova consegna sul dispositivo. |
| Gestore progressivo | Persistenza, finestre e unico indice finale già presenti | Riutilizzati policy temporale, metadati e indice finale. Il bridge è manuale; non avvia il manager né i suoi stadi dataset/forecast/quote/queue. |

Il vecchio ciclo completo **non deve essere avviato per aggirare il nuovo namespace**: potrebbe cercare o generare journal canonici diversi. Questo intervento prepara il primo screening del riferimento congelato. Non autorizza revisioni, nuovi forecast nei giorni seguenti o attivazioni automatiche; il forecast deve comunque rispettare il limite di età di 24 ore del protocollo corrente.

## Integrità della lettura

Prima di creare un tentativo, l'ingresso reale richiede `FROZEN_VERIFIED`, proposta con SHA256 approvato `3d477e4f8c9b9ab5393514af3f8f711443787a3fe4396cc84695dbdb8b696d77`, piano operativo sigillato e catena intent/ricevuta/journal coerente. Ricalcola esclusivamente i controlli del preflight al timestamp storico del freeze: non esegue fit e non rinnova il consenso.

Verifica registry/codice registrato, studi, dataset, cutoff, manifest di dieci gare, hash delle entry e namespace reale dei file. Rifiuta marcatori sintetici nel percorso originale, identità discordanti, input sostituiti e file diretti fuori dall'archivio privato. Il report deve appartenere a OddsPapi API, bet365.it, torneo 23, alle stesse dieci fixture con squadre e kickoff esatti. ID di PitchAPI o football-data.org non sono utilizzati come ID OddsPapi.

Questi controlli dimostrano integrità e coerenza locale; non costituiscono una firma del fornitore o un'attestazione temporale esterna. Una falsificazione deliberata dell'intero archivio locale non diventa impossibile grazie al solo SHA256.

Il producer rimane `scripts/shadow.mjs`, invocato in modalità locale. Due opzioni limitate alle anteprime offline (`--preview-out`, `--attempt-metadata`) permettono un output immutabile deterministico e il filtro temporale già previsto dal protocollo progressivo. Non abilitano acquisizioni o un secondo percorso matematico.

## Significato degli esiti

| Esito del rapporto | Pacchetto/app | Condizioni |
|---|---|---|
| `MULTIPLA_SIMULATA` | `lamultipla-app-decision-v4`, `simulation`, finale | Combinazione scelta dall'autorità esistente; forecast, intervalli, prezzi, disponibilità, contesto, liquidazione e prezzo esatto del ticket verificati. Nessuna promozione operativa. |
| `NO_BET` | `lamultipla-app-round-state-v1`, `NO_BET_PROVISIONAL` | Nessuna combinazione ammissibile dopo verifica completa del perimetro 1X2 residuo; causa conservata. Non significa assenza di valore nei mercati non validati. |
| `ANALYSIS_INCOMPLETE` | `EVIDENCE_INSUFFICIENT` oppure `TECHNICALLY_INCOMPLETE` | Quote mancanti/scadute, board incompleti, contesto o liquidazione da verificare, prezzo combinato assente, ricerca troncata, modello non utilizzabile o finestra utile persa. Non è una prova di assenza di valore. |

Per affermare un NO BET completo, il bridge richiede tre esiti univoci e utilizzabili per ogni fixture ancora eleggibile, contesto pronto e prezzi manualmente verificati. Le regole di liquidazione sono richieste per le candidate, come nel gate esistente. Per una proposta bastano le selezioni che superano tutti i gate: lacune altrove rimangono nel rapporto e non vengono nascoste.

Il primo NO BET non chiude la giornata. Questo bridge non dichiara automaticamente un NO BET definitivo e non esegue la chiusura temporale del manager. Una decisione scientifica/operativa non autorizzata non viene etichettata come assenza di valore. Il blocco operativo generale `MODEL_NOT_AUTHORIZED` rimane sempre presente, anche quando esiste una simulazione ammessa in shadow.

Per ogni tentativo sono conservati report/assessment/context hash, provenienza del forecast, decisione riproducibile, esclusioni e diagnostica. Il pacchetto di simulazione trasmette probabilità, intervalli, EV, identità, verifiche delle regole e prezzo del ticket. Gli aggiornamenti di stato trasmettono solo motivazioni e legami hash; l'audit dettagliato resta sul PC.

## Persistenza e finestre

Output privati sotto `.local/research-review/cohorts/reference-g8-20261023-v1/screening/0001/`:

- `intent.json`: input pin prima degli effetti, numero del tentativo e orario reale.
- `attempt.json`: metadati e fixture ancora eleggibili secondo i kickoff effettivi.
- `decision.json`: anteprima immutabile dell'unica autorità decisionale; assente se mancano le quote.
- `app-package.json`: pacchetto pronto per un eventuale invio successivo.
- `receipt.json`: esito e hash del pacchetto/decisione/ricevuta scientifica; richieste e consegne eseguite pari a zero.

Una simulazione completa viene anche registrata nell'indice finale shadow già esistente: una sola proposta per giornata, condiviso con il gestore progressivo. Non viene copiata nei journal scientifici. Un nuovo tentativo dopo una proposta finale è bloccato. I tentativi incompleti restano conservati e non sono selezionati retrospettivamente come nuove prove scientifiche.

Lo stesso numero di tentativo con gli stessi input recupera gli artifact senza ricalcolare la decisione. Con input diversi si arresta: usare un nuovo numero soltanto per una rivalutazione esplicita, conservando il precedente. Crash dopo decisione/finale/pacchetto non comporta sostituzione dei file. Il recupero storico non rende fresche quote o pacchetti vecchi.

Resta la policy già registrata: analisi oltre 150 minuti dalla prima selezione, accodamento nuovo prima del limite di 135 minuti, ricezione utile prima dei 120 minuti. L'outbox ora applica il limite di accodamento anche all'invio manuale delle simulazioni progressive; riusare una firma già accodata resta consentito per il recupero, senza una nuova notifica decisiva. Scadenza firmata: minimo tra generazione +30 minuti e primo kickoff −120 minuti. L'archiviazione tardiva è marcata come tale, senza push utile. Le quote non sono garantite durante le due ore successive.

## Quote: manifest della successiva autorizzazione

Base: `https://api.oddspapi.io/v4`. **Nessuna delle richieste qui sotto è stata eseguita.**

| GET | Parametri | Massimo aggiuntivo | Condizione |
|---|---|---|---|
| `/account` | Solo credenziale protetta | 1 controllo gratuito | Soltanto se confermato non conteggiato; saldo e ledger validi, nessun credito acquistato. |
| `/markets` | `language=en` | 0 oppure 1 conteggiata | Solo se manca un catalogo integro o ha almeno 7 giorni; cache verificata e hash conservato. |
| `/odds-by-tournaments` | `tournamentIds=23`, `bookmakers=bet365.it`, `language=en`, `verbosity=3` | 1 conteggiata | Dopo `FROZEN_VERIFIED`; riconciliazione alle dieci fixture autorizzate. |

Tetto della richiesta futura: **massimo 2 conteggiate aggiuntive**, ridotto a 1 con catalogo riusabile. La `/fixtures` già autorizzata per venerdì è distinta: non è inclusa una seconda acquisizione di identità. La precedente approvazione non autorizza catalogo, quote o ulteriori controlli account illimitati. Il saldo remoto attuale resta non verificato in questo incarico.

Ispezione locale del 22/10: catalogo osservato il **9/10 alle 22:49:40 UTC**, quindi già oltre 7 giorni; ultimo report indicizzato **G6 del 10/10 alle 10:16:16 UTC**, non riusabile per G8. In assenza di nuovi snapshot legittimi, il piano di venerdì richiederà entrambe le richieste conteggiate sopra. Il ledger conserva i tre tentativi precedenti e lo stesso hash JSON registrato nel consenso: non rappresenta il saldo remoto.

Riutilizzare un report solo se hash/identità coerenti, acquisizione successiva al forecast congelato e anzianità non superiore a 30 minuti al momento della decisione. Non riusare vecchie quote come attuali. Se esiste un intent di richiesta con esito ambiguo, fermarsi senza retry né nuova acquisizione con altro identificativo. L'importatore esistente offre intent e ricevute per acquisizioni con `acquisitionId`: usarlo nell'esecuzione successivamente autorizzata. Nessuna paginazione o richiesta fuori dal manifest.

Dopo il freeze, questo comando produce in sola lettura il manifest concreto, con i veri ID e la situazione del catalogo in quel momento:

```powershell
node scripts/reference-screen.mjs --plan .local/preparation/g8-authorized/reference-plan.private.json --quote-plan
```

Oggi tale piano operativo e la ricevuta autentica non esistono ancora: il comando deve fermarsi con `REFERENCE_SCREEN_REQUIRES_FROZEN_VERIFIED`. Non richiede una nuova approvazione della coorte; serve invece il consenso separato alle quote sopra elencate.

## Procedura dopo il freeze di venerdì

1. Eseguire la procedura freeze-only già approvata, senza cambiarla. Confermare:

```powershell
node scripts/reference-series.mjs --verify
```

2. Richiedere il manifest quote con il comando precedente. Ottenere l'autorizzazione specifica a quei GET. Soltanto dopo: controllo saldo/ledger, eventuale riuso di report valido o acquisizione tramite l'importatore esistente. Nessun comando di acquisizione è proposto qui come già autorizzato.

3. Primo screening locale, senza trasporto. `--latest-report` risolve l'indice privato dell'importatore e poi verifica le identità; non accetta silenziosamente una giornata diversa:

```powershell
node scripts/reference-screen.mjs --plan .local/preparation/g8-authorized/reference-plan.private.json --attempt 0001 --latest-report
```

Senza verifiche aggiuntive questo può legittimamente produrre **ANALISI INCOMPLETA**, non una schedina. Senza report, omettere `--latest-report`: si registra esplicitamente `QUOTES_NOT_ACQUIRED`, senza calcolo o acquisizioni. Il comando non accoda e non invia nulla.

4. Per completare i gate, preparare e verificare le evidenze reali negli schemi esistenti: dossier di contesto, `manualVerification`, `settlementVerification` e array di prezzi combinati. Le probabili formazioni mancanti non sono inventate; nessuna correzione alle probabilità. La verifica umana deve riguardare gli esiti esatti, le regole bet365 Italia e il ticket realmente offerto, non il prodotto delle singole quote. Conservare timestamp, reviewer, URL e legami al report.

Il comando completo è implementato e collaudato. I tre file seguenti sono **input futuri, non dichiarati presenti o compilati oggi**: Codex li predisporrà con gli ID reali dopo l'acquisizione autorizzata e le verifiche umane. Non compilare attestazioni automatiche al posto dell'utente.

```powershell
node scripts/reference-screen.mjs --plan .local/preparation/g8-authorized/reference-plan.private.json --attempt 0002 --latest-report --assessment .local/preparation/g8-screening/assessment.reviewed.private.json --context-evidence .local/preparation/g8-screening/context.reviewed.private.json --combined-prices .local/preparation/g8-screening/combined-prices.reviewed.private.json
```

Una revisione delle evidenze richiede un nuovo tentativo, non la modifica di `0001`. Quote ormai scadute non vengono rinfrescate da questi comandi. Se il prezzo del ticket non è verificabile, mantenere l'esito incompleto; se tutto è verificato ma non ammissibile, NO BET motivato.

La diagnostica multimercato è indipendente. Non usare `shadow.mjs --extension-journal` per questo flusso: richiama ancora lo screening diagnostico originale costoso. Dopo aver salvato l'esito, la CLI ottimizzata esistente legge i percorsi reali senza copiare i journal:

```powershell
$lmG8Plan = (Get-Content -LiteralPath .local/preparation/g8-authorized/reference-plan.private.json -Raw | ConvertFrom-Json).payload
$lmG8Freeze = (Get-Content -LiteralPath .local/research-review/cohorts/reference-g8-20261023-v1/freeze-receipt.json -Raw | ConvertFrom-Json).payload
$lmG8Latest = Get-Content -LiteralPath .local/oddspapi/latest.json -Raw | ConvertFrom-Json
$lmG8Report = Join-Path 'C:\LaMultipla\.local\oddspapi' $lmG8Latest.reportPath
$lmG8ReportMeta = Get-Content -LiteralPath $lmG8Report -Raw | ConvertFrom-Json
$lmG8Catalog = Join-Path 'C:\LaMultipla\.local\oddspapi' $lmG8ReportMeta.source.catalogPath
$lmG8Raw = Join-Path (Split-Path -Parent $lmG8Report) 'fixtures.json'
node scripts/multimarket-diagnostic.mjs --report --goals-b2 --study $lmG8Plan.studyV2File --journal $lmG8Freeze.v2.file --odds-report $lmG8Report --catalog $lmG8Catalog --fixtures $lmG8Raw
```

Le variabili leggono soltanto metadati privati, senza stamparli e senza toccare credenziali. I file sono prodotti dal freeze/import autentico futuro. Il bridge deve prima aver verificato quel report; non sostituirlo nel frattempo. Catalogo o raw snapshot assenti impediscono B1/B2, senza invalidare il pacchetto già salvato. La CLI produce JSON/HTML privati; le verifiche manuali di mapping asiatico restano necessarie ove richieste. Nessuna probabilità diagnostica viene promossa al selettore.

5. Ispezionare la ricevuta e il pacchetto indicati dall'output. Firma/accodamento e invio cloud richiedono **un consenso successivo alla consegna privata**. Dopo tale consenso, per il pacchetto effettivamente verificato dell'ultimo tentativo, gli ingressi esistenti sono:

```powershell
node scripts/private-delivery.mjs --queue .local/research-review/cohorts/reference-g8-20261023-v1/screening/0002/app-package.json --channel shadow
node scripts/private-delivery.mjs --flush --channel shadow
```

Il percorso `0002` è valido solo se quel tentativo ha prodotto il pacchetto; usare la ricevuta effettiva, non accodare alla cieca. Non eseguire ora questi due comandi. Prima dell'invio verificare pairing, destinatario TEST, capacità `roundStateProtocol:1`, coda e freschezza. Un FCM accettato non è un ACK: la conferma utile arriva soltanto dopo importazione persistente del telefono. Non reinviare una proposta finale diversa.

## Prove e limiti della readiness

- Suite automatica: **418 test superati**; test mirati bridge/trasporto/compatibilità: **30/30**. Soglie, classificazioni e valori delle combinazioni coincidono con il producer originale; probabilità e intervalli non sono modificati dal bridge.
- Flusso sintetico completo: input di riferimento sintetico → autorità `createDecision` originale → pacchetto → ECDSA → outbox persistente → client REST Firestore con server simulato → ricevitore dell'app/IndexedDB → ACK. Tre esiti, crash, rete assente, push fallito, ACK perso, riapertura, duplicato e alterazione. Nessuna rete reale.
- Prova locale aggiuntiva **della vera CLI `shadow.mjs`**, con registry originali letti soltanto, squadre/dati sintetici e copie di studio dichiaratamente sintetiche per v2: i tre esiti e la diagnostica esclusa dal selettore sono stati prodotti negli archivi isolati. Nessun piano reale o ricevuta scientifica fittizia è stato creato per superare l'ingresso produttivo.
- Browser reale Edge headless, localhost, larghezze 1280 e 390: tre stati, importazione duplicata, pacchetto alterato, persistenza dopo reload e storico legacy preservato. Screenshot/evidenze solo privati. Un primo avvio del Chromium di cache non è riuscito; la prova è stata completata con Edge installato, senza modificare impostazioni di sicurezza.
- Compatibilità degli otto esperimenti precedenti e backup verificata dai test già esistenti. Nessuna modifica all'app, al database Android, al pairing o alle regole cloud. Lint senza errori, solo warning preesistente `combinedPlayedOdd`; build riuscita.

Queste sono prove software sintetiche, non validazione predittiva, né una nuova prova cloud/Samsung. L'ingresso reale rifiuta i riferimenti sintetici: il suo primo successo positivo su G8 può essere verificato soltanto dopo il freeze autentico. Resta inoltre da verificare in quella sessione lo stato corrente del dispositivo e del canale reale, senza cambiare APK o regole.

**Per venerdì:** tecnicamente possibile produrre una MULTIPLA SIMULATA, un NO BET provvisorio motivato oppure un aggiornamento di analisi incompleta. Nessun esito è garantito. Quote fresche, evidenze e ticket reale sono prerequisiti operativi; la consegna richiede consenso separato. Il freeze scientifico rimane utilizzabile anche se quote, screening o trasporto falliscono.

Pubblicazione limitata a codice/test/documentazione sicuri sul ramo della PR #2 in bozza. Nessun `public/latest-slip.json`, Pages, deploy, forecast originale, provider reale, consegna o scheduler in questo incarico. I 3.400 file protetti e le approvazioni già registrate vengono ricontrollati alla chiusura; SHA remoto e CI effettivi sono riportati nella consegna della sessione.
