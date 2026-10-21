# G8 — READY FOR FREEZE / PREFLIGHT 22–23 OTTOBRE 2026

Audit eseguito il **21 ottobre 2026**, con controlli UTC e conversione Europe/Rome. Riferimento iniziale `0eb6edf839a91a553f52628a43f01fdbf2a4288d`, branch `feature/oddspapi-private-import`, PR #2 da mantenere in bozza. Il titolo identifica la preparazione per il 22–23, non retrodata l'audit.

## A. Stato complessivo

**READY CON PREREQUISITI TEMPORALI.** Le verifiche già possibili su registry, codice e dati sono superate. Restano decisioni esplicite e dati di calendario inevitabilmente freschi. Nessun freeze originale G8 né nuova coorte sono stati attivati. La prova end-to-end è **sintetica**, con veri algoritmi originali su squadre/dati sintetici e namespace isolati: non una prova reale G8.

Il freeze-only non legge quote, formazioni, dossier, ticket, PitchAPI, Firebase o Android; non chiama selettore, gestore progressivo o trasporto. L'unica dipendenza OddsPapi prima del freeze è **identità/calendario** già prescritta dal percorso corrente: 10 ID autentici, senza quote. Rimuoverla richiederebbe una decisione di protocollo, non una correzione tecnica. Nessuna chiamata OddsPapi è stata eseguita nell'audit.

## B. Prerequisiti e blocchi

| Categoria | Elemento | Stato/evidenza | Conseguenza e azione |
|---|---|---|---|
| A | Checkout/CI iniziale | HEAD noto verificato, branch corretto; file utente privato non tracciato preservato | Pubblicare solo file espliciti; nessun main/deploy. SHA finale e CI nella consegna. |
| A | Registry v1 | Riproduzione di studio, dataset originale 4.980 righe, codice/protocollo e metriche fissate verificata | Nessuna nuova selezione parametri o ricostruzione journal. |
| A | Studio/codice v2 | Hash registrati coerenti; DC e bivariato halfLife365/ridge20/temperatura0,8 | Rimangono sperimentali, nessuna promozione scientifica. |
| A | Dataset corrente A/CC0 | 1.560 righe osservate21/10; subset training al1/10: **1.490**, SHA identico agli originali | Nessun risultato supplementare G6/G7 aggiunto. |
| A | Freschezza dataset | Acquisito21/10 13:05:59.599UTC, valido fino24/10 13:05:59.599UTC | Copre tutta la finestra G8: **non serve un refresh soltanto per rinnovare la data**. Rivalidare hash, non ritoccare timestamp. |
| A | Storico squadre | Minimo42 presenze; tutte oltre20 | Lacuna2024/25:370 risultati anziché380, identica alla fonte originale, esplicita e non imputata. |
| A | Calendario oggi | PDF Lega HTTP200, stessi bytes della tabella G8 verificata visivamente; riscontro AIA21/10 su tutte10 gare | Non è una riconferma valida per venerdì: nuova osservazione/review entro24h al freeze. |
| A | Finestra/UTC |23/10 **14:45 ≤ ora <18:15 Roma** =12:45–16:15UTC | Ultimo istante matematico16:14:59.999UTC; devono terminare anche calcolo e scrittura, non soltanto iniziare. |
| A | Stato scientifico | G6 controllo originale tardivo19/10,0settled/10pending; G7 senza journal autentico; v2 senza journal reale | Non ripetere valutazione G6, non ricostruire G7. Nessun G8 presente al preflight. |
| A | Infrastruttura | Ispezione offline, assemblaggio/pinning da evidenze, verifica ricevuta, lock/intent/recovery testati | Nessuna probabilità matematica cambiata; journal sintetici deep-equal ai runner originali diretti. |
| B | Approvazione nuova serie | Proposta esistente ancora draft, hash sotto | Decisione utente prima di materializzare l'approvazione; non riapprovare roadmap già approvata. |
| B | Autorizzazione freeze G8 | Assente | Autorizzazione specifica distinta da questo audit, valida solo nella finestra. |
| B |10 ID OddsPapi |0/10 acquisiti | Autorizzare al massimo1 GET fixtures; riusare soltanto cache verificata entro60min. Nessun ID sostitutivo. |
| B | Riconferme fresche | Provider entro60min; Lega entro24h; CC0 calendario entro24h | Acquisizione/calendario ufficiale verificati venerdì, nessun timestamp inventato. |
| B | Apertura finestra | Ancora futura | Nessun comando offre override dell'orologio o esecuzione anticipata. |
| C | Blocchi sostanziali residui | **Nessuno identificato per il primo freeze G8**, subordinatamente ai B | Se cambia un hash, un evento o il protocollo, arresto e review; non degradare il controllo per passare. |

L'automazione delle successive60 giornate e il collegamento nuova serie→gestore progressivo **non sono implementati/attivati da questo lotto**. Il runner è deliberatamente per il primo freeze G8; ciò non autorizza i successivi cicli né prova completa produzione. Il denominatore futuro resta quello fissato, anche se una futura esecuzione viene mancata.

### Calendario e namespace degli identificativi

Fonte prevista: [programma Lega](https://www.legaseriea.it/serie-a/news/quando-si-gioca-anticipi-e-posticipi-fino-alla-12a-giornata), [PDF](https://images.legaseriea.it/image/private/fl_attachment/prd/emzdipx98pkg0lgeqgrt.pdf). [AIA21/10](https://www.aia-figc.it/dettaglio.asp?ID=28785) corrobora le dieci gare; non sostituisce la riconferma Lega. Nessuna variazione successiva individuata nella ricerca mirata, senza certificare l'assenza di futuri comunicati.

| Casa–trasferta | Data/ora Europe/Rome | Kickoff UTC |
|---|---|---|
| Torino FC–AC Monza | 23/10, 20:45 | 2026-10-23T18:45:00.000Z |
| Cagliari Calcio–Bologna FC 1909 | 24/10, 15:00 | 2026-10-24T13:00:00.000Z |
| Como 1907–US Sassuolo Calcio | 24/10, 15:00 | 2026-10-24T13:00:00.000Z |
| SSC Napoli–AS Roma | 24/10, 18:00 | 2026-10-24T16:00:00.000Z |
| Lazio Roma–Parma Calcio 1913 | 24/10, 20:45 | 2026-10-24T18:45:00.000Z |
| FC Internazionale Milano–ACF Fiorentina | 25/10, 12:30 | 2026-10-25T11:30:00.000Z |
| Atalanta BC–Frosinone Calcio | 25/10, 15:00 | 2026-10-25T14:00:00.000Z |
| Genoa CFC–Venezia FC | 25/10, 15:00 | 2026-10-25T14:00:00.000Z |
| US Lecce–Juventus FC | 25/10, 18:00 | 2026-10-25T17:00:00.000Z |
| Udinese Calcio–AC Milan | 25/10, 20:45 | 2026-10-25T19:45:00.000Z |

23/24 ottobre UTC+2;25 ottobre UTC+1. Le02:30 del25 sono ambigue e il convertitore le rifiuta; nessuna ambiguità nei kickoff elencati. Ogni fixture è unica,20 squadre distinte, stagione2026/27/giornata8. Openfootball non fornisce un ID provider: conserva chiave fonte/percorso/giornata/coppia e provenienza. Crosswalk privata separata:10 ID football-data.org e10 PitchAPI già osservati, con soli alias espliciti precedentemente verificati; **0 ID OddsPapi**. Nessuna nuova richiesta alle due fonti. La prima verifica senza alias resta conservata come tentativo non risolto, seguita dalla versione esplicita: niente fuzzy matching silenzioso. Questi ID supplementari non entrano automaticamente nello schedule OddsPapi.

### Scheda decisionale della coorte da approvare

- ID **reference-g8-20261023-v1**, proposta immutata `.local/preparation/sprint-g8-20261021/reference-cohort.draft.private.json`.
- SHA256 proposta **3d477e4f8c9b9ab5393514af3f8f711443787a3fe4396cc84695dbdb8b696d77**. Stato draft/non attiva; questo audit non è approvazione.
- Universo pianificato:2026/27 G8–G38 (31 giornate) e2027/28 G1–G29 (29),60 giornate/600 eventi. Le600 fixture individuali future non sono tutte note: ciascun manifest di10 eventi va identificato e fissato prospetticamente secondo la policy, senza spostare il frame per recuperare lacune.
- Modelli: goals-v1 originale e DC/bivariato v2 già registrati. Baseline empirica e Poisson lega dagli stessi input ammessi, v1 riferimento nei confronti v2. Nessun challenger o dato supplementare nella serie.
- Fonte A Openfootball CC0, finestra4anni, disponibilità assunta data+48h, aggiornamento/cutoff mensile registrati. **G8 cutoff1/10/2026 00:00UTC**. Assunzione temporale originale distinta dalla prova di prima pubblicazione della fonte.
- Primari BTTS e Over2.5 per DC/bivariato: almeno500 eventi appaiati, forecast≥90%, risultati≥95%; log-loss/Brier/calibrazione e confronti sugli stessi incontri. CI98,75% controv1 per quattro confronti primari, CI95% contro baseline; Brier non inferiore oltre0,005, ECE≤0,08, bootstrap1.000 blocchi settimanali seed20261010.1X2 descrittivo e riferimento v1; altri mercati non acquisiscono validazione per derivazione.
- Chiusura48h dopo ultimo kickoff del frame, intermedi descrittivi. Pending non zero/successi, revisioni/conflitti sospendono, lacune restano nel denominatore e impediscono il gate confermativo secondo il protocollo. Nessun rollover automatico della finestra o scelta retrospettiva dei tentativi migliori.
- Serie precedente v1, protocollo v2 e G7 mancata conservati. La nuova serie è separata per ID/store; non certifica che la precedente fosse continua o già avviata.

Riferimenti: [protocollo v2 invariato](protocollo-motore-gol-v2.md), [specifica fonti/ciclo](specifica-risultati-miglioramento-continuo-v1.md). L'approvazione deve citare ID/hash e annotare eventuali osservazioni **prima** del primo freeze; modificare la proposta richiede una nuova versione e nuova review, non cambiare il file già sigillato.

## C. Decisioni dell'utente ancora necessarie

1. Approvare la proposta della nuova serie con ID/hash sopra, oppure indicare le osservazioni da risolvere.
2. Autorizzare espressamente il solo freeze originale G8 il23/10 nella finestra14:45–18:15, senza quote/selezione/consegna.
3. Autorizzare separatamente la raccolta di identità calendario: controllo account gratuito e **massimo1 richiesta conteggiata fixtures**, nessun retry ambiguo. Quote/catalogo ulteriori restano fuori da questa autorizzazione minima.

Non sono richieste nuove approvazioni di roadmap, gratuità PitchAPI, conservazione privata o verifica lineup. Non occorrono account nuovi né inserimenti di chiavi per il freeze-only.

## D. Procedura esecutiva venerdì

Tutti gli script sotto esistono. Comandi di lettura eseguiti oggi; assemblaggio e freeze testati solo in isolamento sintetico. I comandi con input autorizzati sono **condizionati** ai file futuri elencati: oggi quei file non esistono e non devono essere inventati.

1. Su `C:\LaMultipla`, controllare HEAD/branch/CI, alimentazione, UTC effettivo e lock. Controllo offline utilizzabile **anche adesso**, senza scritture:

```powershell
node scripts/reference-series.mjs --plan .local/preparation/sprint-g8-20261021/reference-plan.template.private.json --inspect
node scripts/reference-series.mjs --verify
```

Il primo espone A/B/C e windowState con UTC; il secondo oggi restituisce NOT_FROZEN. L'orologio usato è quello reale: verificare l'UTC con una fonte oraria affidabile e la sincronizzazione Windows se emergono discrepanze. Il timezone del processo non decide la finestra. Nessun flag CLI --now per simulare una data reale.

2. Dopo le decisioni C, Codex prepara l'envelope di approvazione con identità revisore, timestamp effettivo, hash proposta, cohortApproved/freezeAuthorized veri, round8/sourceRoleA e scadenza alla chiusura. Percorso futuro **oggi mancante**: `.local/preparation/g8-authorized/approval.private.json`. Non basta rinominare il template.

3. Riconfermare ufficialmente le10 gare venerdì; salvare nuova evidenza con URL Lega/PDF, bytes/hash, observedAt/reviewedAt reali, revisore e10 eventi esatti in UTC. Envelope previsto `lamultipla-reference-official-reconfirmation-v1`; il documento referenziato deve esistere nel privato e avere SHA verificabile. Percorso futuro **oggi mancante**: `.local/preparation/g8-authorized/official-20261023.private.json`. La copia verificata oggi è conservata nel checkpoint ma scade22/10 e non può essere ritimestampata.

4. Solo dopo autorizzazione provider, idealmente poco prima14:45, acquisire/riusare il calendario senza quote:

```powershell
node scripts/private-calendar.mjs --refresh --max-age-minutes 60
```

Una nuova raccolta usa account gratuito + massimo1 fixtures, cache/ledger/intent esistenti. Il flag60 impedisce il riuso della normale cache giornaliera troppo vecchia. Su errore/429/intent ambiguo fermarsi: non ripetere il comando per consumare una seconda richiesta non autorizzata. Se la cache diventa vecchia dopo un'interruzione, rivalutare e chiedere una nuova autorizzazione prima di un'altra acquisizione.

5. Con quei due envelope e una cache corrente **già presenti**, assemblare senza rete e senza fit:

```powershell
node scripts/reference-series.mjs --assemble --plan .local/preparation/sprint-g8-20261021/reference-plan.template.private.json --official .local/preparation/g8-authorized/official-20261023.private.json --approval .local/preparation/g8-authorized/approval.private.json --out .local/preparation/g8-authorized
```

Il comando trova l'ultimo snapshot tramite calendar-state già esistente, rifiuta pendingId/assenze o dati discordanti; nessun ID viene digitato o inferito. Produce schedule e piano sigillati con hash di ogni input; replay identico ammesso, contenuto diverso rifiutato. Può essere preparato prima14:45, ma non produce un forecast o un'attivazione.

6. Dopo apertura, con piano effettivamente materializzato:

```powershell
node scripts/reference-series.mjs --plan .local/preparation/g8-authorized/reference-plan.private.json --preflight
```

Deve risultare positivo nella finestra12:45–16:15UTC: modello/studio, training originale, fonti fresche,10 identità, approvazione e hash. Nessun prezzo/contesto richiesto. Non eseguire il passo successivo se fallisce. Il dataset corrente copre la finestra: nessun nuovo download di training ordinario necessario.

7. **Solo con autorizzazione freeze esplicita**, preferibilmente dalle14:45 e senza aspettare il limite:

```powershell
node scripts/reference-series.mjs --plan .local/preparation/g8-authorized/reference-plan.private.json --freeze-approved
node scripts/reference-series.mjs --verify
```

Il secondo deve restituire **FROZEN_VERIFIED**, ricevuta/hash e conteggi/timestamp dei due journal; controllare10 eventi pianificati e tutte le eventuali esclusioni, senza trasformare un escluso in forecast. La presenza del solo intent non è successo. Il percorso ricalcola fit mensili e40 bootstrap prescritti **soltanto durante il freeze autorizzato**; nessun refit reale è stato fatto in questo audit. Non c'è retuning.

Artifact sotto `.local/research-review/cohorts/reference-g8-20261023-v1/`: freeze-intent prima dei modelli, journal v1 e v2 nei loro sotto-namespace `.local/model/prospective/journals` e `.local/model-v2/journals`, quindi freeze-receipt collegata agli hash. Versione/config/cutoff/dataset/studio/timestamp sono nei journal e nei link della transazione. Nessuna scrittura nei journal canonici delle serie precedenti. Un eventuale NO_BET interno del journal significa validazione/operatività non autorizzata, non un NO BET definitivo della giornata notificato all'app.

### Arresti e recupero

- Senza approvazione o prima della finestra: blocco prima di creare anche la directory lock della coorte. Due chiamate concorrenti non possono fare due freeze.
- Crash dopo intent o dopo v1: preservare tutto, verificare lo stesso piano; recupero **entro finestra e con input ancora validi**. I runner originali riusano il journal già scritto, non lo riscrivono. Un piano/input diverso non può completare silenziosamente l'intent precedente.
- Dopo ricevuta completa: replay non ricalcola; --verify è read-only e funziona anche dopo la deadline. Dopo deadline il comando freeze rimane sempre bloccato, anche se tentato come recupero.
- PARTIAL_REQUIRES_REVIEW non è un freeze completo. Non cancellare intent/lock/checkpoint, non ritoccare timestamp e non creare forecast retroattivi. Una finestra persa resta lacuna; se i prerequisiti scadono, review prima di eventuali nuove acquisizioni.
- Orologio che arretra, fonte troppo vecchia, coppie/ID/UTC discordanti, hash cambiato o journal mancante/alterato: arresto, nessun fallback matematico o sostituzione di fonte.

Rinviabili senza perdere il forecast: quote, dossier/lineup, regole/ticket, diagnostica multimercato, challenger, Android/Firebase e collegamento al progressivo. **Non usare windows-orchestrator/progressive-once, shadow o il ciclo consegne per congelare G8**. Nessun task viene attivato.

## E. Piano quote separato e sicurezza

| Endpoint futuro | Massimo conteggiato | Sequenza/scopo |
|---|---:|---|
| GET /v4/account |0|Quota/piano correnti, whitelist delle risposte. Saldo attuale non verificato nell'audit. |
| GET /v4/fixtures |1|Identità calendario prima freeze, salvo cache valida entro60min. |
| GET /v4/markets |1 condizionale|Dopo freeze, solo catalogo esatto/coerente mancante o insufficiente. |
| GET /v4/odds-by-tournaments |1|Dopo freeze e autorizzazione quote, bet365.it, batch esatto. |

Tetto iniziale complessivo **3 richieste conteggiate**, inclusa quella fixtures eventualmente già spesa: non tre aggiuntive dopo il freeze. [Costo documentato](https://oddspapi.io/en/docs/requests-and-quota):1 per endpoint conteggiato anche con errore dopo elaborazione; account non conteggiato. Confermare il saldo prima di spenderle, rispettando ledger/tetto200 e riserva50 già implementati.3 tentativi nel ledger locale non sono il saldo remoto; il dato242 residue del14/10 è solo storico. Nessuna chiamata account è stata fatta qui.

Quote successive al freeze, età massima30min al controllo, snapshot passati non riciclati come attuali. Board1X2 incompleto, quote inattive o mapping non verificabile: opportunità escluse con motivo, nessun prezzo inventato. Liquidazione90min+recupero, rinvii/rimborsi e mercati vanno verificati; un'offerta provider non prova selezionabilità sul conto bet365 Italia. Prima di un'eventuale futura proposta completa occorre **prezzo del ticket esatto** e verifica umana della disponibilità/regole, mai prodotto delle singole o indipendenza presunta. La freschezza non garantisce il prezzo per due ore.

NO BET per assenza di valore resta distinto da analisi incompleta/evidenze mancanti/MODEL_NOT_AUTHORIZED. Nessuna soglia EV o governance cambiata. Stake reale **0 €**. Il freeze scientifico può riuscire senza produrre alcuna multipla; quote o selezione richiedono successive autorizzazioni. Nuova serie→screening/consegna ha un gate d'integrazione separato e non viene attivata dal piano.

Conferme di sicurezza: nessun originale modificato, forecast reale anticipato, OddsPapi/PitchAPI richiesto, coorte attivata, consegna, scheduler, deploy, APK, Firebase o scommessa. Gli unici nuovi riscontri di rete sono consultazioni pubbliche e il PDF ufficiale, conservato privatamente. Copie di ricerca, crosswalk e output sintetici esclusi da Git.

## F. Stato tecnico e prove

Nuove verifiche: preflight offline senza effetti; approvazioni/campo temporale; ultimo millisecondo; DST25/10; freschezza72h/24h/60min; manifest casa/trasferta, ID di altra fonte e discrepanze; frame60/600; snapshot/namespace; assemblaggio idempotente e hash pin; concorrenza; clock rollback; crash dopo v1 e recupero; verifica ricevuta successiva. Rete disabilitata nella prova dei runner originali. I due payload sintetici sono **deep-equal integralmente** a quelli ottenuti invocando direttamente le funzioni originali sugli stessi input e clock. Non si limitano a una tolleranza numerica.

Correzioni infrastrutturali: guardie prima della creazione del lock/coorte, clock monotono fra controlli, stato provider esplicitamente0 per tutte10 gare anche quando coppie/orari coincidono, pin dei dati di training originali, ispezione fuori finestra e verifica storica della ricevuta senza calcolo. Assemblaggio da fonti già acquisite e flag cache60min eliminano preparazioni manuali di ID e il riuso accidentale della cache giornaliera. Nessun modulo scientifico registrato modificato.

Le metriche/algoritmi registrati non sono cambiati. L'ispezione reale non fa fit. Tempi già misurati nello sprint precedente su1490 righe sintetiche: v1+40bootstrap4,55s, DC2,16s, bivariato4,18s; circa15–45s per pipeline scientifica/serializzazione su carico simile, non SLA. Questa attività non ripete un fit originale G8 per misurarlo. Iniziare presto nella finestra, con margine per controlli e recovery.

PC verificato: timezone Windows W. Europe Standard Time (Roma), UTC del PC coerente entro circa un secondo con il tool orario UTC indipendente al21/10 21:25:59UTC. Questa osservazione non sostituisce il controllo dell'orologio venerdì.

Suite locale **409/409**, lint senza errori (solo warning preesistente dell'app), build riuscita. Verifica degli hash dei3.400 file protetti e assenza di G8 reale ripetuta alla chiusura. Commit remoto e CI effettivi nella consegna verificata. Il checkpoint privato `.local/preparation/g8-freeze-preflight-20261021/` conserva l'audit e la scheda; approvazione e piano operativo mancanti restano esplicitamente mancanti.
