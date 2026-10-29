# M3-B — Policy versionata e persistenza esclusivamente sintetica

Base `0a16cf297add87de40b52c6d8926b825c87a039e`. Autorizzazione dell'utente limitata al prototipo sintetico. Nessuna validazione scientifica, attivazione prospettica, API, Android o uso operativo.

## Decisioni fissate prima del codice

| Tema | Specifica M3-B sintetica |
|---|---|
| Policy | Configurazione nota e versionata, DC primario e bivariato comparatore,2–4 leg,1/fixture, nessuna squadra ripetuta;20.000 combinazioni tentate e100.000 nodi. Nessun fallback |
| Ampiezza0,25 | **u−l** dell'intervallo bootstrap descrittivo della probabilità marginale DC della singola leg, in punti assoluti di probabilità. Non ampiezza dell'EV, non relativa, non intervallo congiunto. Centrale esterna a[l,u]: non ammissibile, nessun override |
| Soglie | EV marginale puntuale≥0,05; inferiore marginale≥0,02; inferiore combinato≥0,05. Euristiche esplorative non validate; nessuna soglia assoluta p |
| Prima delle review | Enumerazione per numero di leg crescente e quote ID ordinati, senza ranking marginale usato come surrogato del combinato. Questo ordine fissa quali ticket entrano nel budget prima di conoscerne il prezzo |
| Budget review | Massimo10 identità di ticket distinte per autorità input/versione. Claim immutabile prima della verifica, risultato dopo. Una review mancante/fallita occupa il proprio slot; ripresa dello stesso claim non crea una nuova verifica. Nessun parametro attempt che azzeri il budget |
| Dopo le review | Ranking solo per **C×L_sens−1** decrescente, poi ID combinazione crescente; C verificato per l'esatto ticket sintetico. Nessun EV combinato puntuale, nessun prodotto delle quote |
| Esaustività | Ricerca troncata, ticket non verificati, budget insufficiente o dati/evidenze mancanti: ANALYSIS_INCOMPLETE quando impediscono una conclusione esaustiva. L'eventuale migliore del subset resta diagnostica, non finale positiva. Nessun NO_BET globale |
| Dipendenze | Fréchet senza indipendenza; limite inferiore0 invariato; probabilità congiunta puntuale e CI congiunto null. Inviluppo da intervalli marginali non simultanei |
| Tempi | Forecast24h; quote/review30min; calendario60min; commit prima di kickoff−150min. Si riusa inoltre la funzione di timing del gestore esistente, senza scheduler o sua modifica: deve esserci uno slot attivo. I tempi del test sono esplicitamente simulati; timestamp reali di scrittura separati |
| Autorità | Una directory deterministica per stagione/giornata/versione nel solo namespace `.local/mm-simulator-synthetic-v1`. Input diversi nello stesso scope: conflitto, non nuova numerazione. Configurazione/provenienza e tutti i gate restano fail-closed |
| Persistenza | Policy, intent, input, preview, claim/risultati review, piano decisione, decisione, prova del commit e receipt sono artifact distinti immutabili. Si riusano privateLock e writeExclusive senza modifiche al percorso1X2 |
| Recovery | Receipt completa: replay read-only. Decisione senza prova di commit: completamento solo se ancora temporalmente valido; fuori finestra resta parziale. Prova di commit già persistita e coerente: possibile completare la sola receipt senza ricalcolare la decisione. File troncati/alterati pubblicati: STOP; temporanei non pubblicati preservati |
| BUSY | Fail-fast, nessun retry automatico. Due BUSY possono lasciare zero effetti; un riavvio serializzato esplicito riusa la stessa autorità e rivalida tutto. Errori di cleanup possono seguire una scrittura già avvenuta: non si presumono assenza di effetti |

Rispetto alla bozza, l'ordine marginale e la prima combinazione positiva sono sostituiti da ordine deterministico di review e ranking combinato **inferiore verificato** nel perimetro esaustivo. M3-A resta invariata e non diventa attivabile: M3-B riusa soltanto le sue primitive sintetiche, preservando i suoi blocchi autentici. L'autorizzazione attuale registra esclusivamente la policy del prototipo, non un protocollo di uso reale.

Il lettore M2 autentico è ancora legato alla serieG8; la policy scientifica mantiene validatedMarkets vuoto. Restano invariati i limiti24h/30min di shadow-v2,60min e150min del progressivo e il suo slot−360/−150. Un forecast scientifico più vecchio di24h non è ritimbrato e non diventa un ingresso fresco. Contesto e regole restano quelli esistenti, con dati sintetici espliciti.

## Moduli e contratti implementati

| File nuovo | Responsabilità |
|---|---|
| `scripts/lib/mm-simulator-v1/prototype-policy.mjs` | Configurazione immutabile `mm-m3b-synthetic-v1`, riconosciuta solo per digest esatto; nessuna policy arbitraria o variante di soglia accettata |
| `scripts/lib/mm-simulator-v1/prototype-analysis.mjs` | Controlli M1/M2/M3-A, timing esistente, enumerazione deterministica compatta, verifica ticket e ranking dell'inferiore combinato |
| `scripts/lib/mm-simulator-v1/prototype-store.mjs` | Namespace sintetico, registrazione policy, intent, input, claim, decisione, ricevute, verifica/recovery e replay |
| `tests/fixtures/mm-prototype.mjs` | Universo interamente sintetico; fixture non quotabili rappresentate come board completi ma chiusi, distinti dai dati mancanti |
| `tests/fixtures/mm-prototype-child.mjs` | Processi di prova nascosti su Windows, interruzioni reali con limite di durata e guasto di cleanup confinato al figlio |
| `tests/mm-simulator-prototype.test.mjs` | Test dedicati della matematica, stato, budget, filesystem, processi e replay |

SHA256 canonico della policy: `0f06a78f1ea3f0be4bc1482a4131810cf896d150b2299a195ba4d57d9ceb9c29`. Configurazione del **prototipo sintetico**, non approvazione di un pilot o validazione dei mercati. Il registro locale salva la policy esatta, il digest del codice e l'UTC reale della registrazione; il tempo dello scenario è dichiarato separatamente. Non si scrivono envelope di consenso scientifico.

L'ingresso `lamultipla-mm-synthetic-prototype-input-v1` contiene `synthetic:true`, tempo di registrazione della policy **nel solo scenario** e i dati M1/M2, journal/studio, calendario e review sintetiche. Non accetta parametri search/scenario scelti dal chiamante: usa soltanto la configurazione riconosciuta. Un journal originale, fonte archiviata o schema incoerente è rifiutato prima degli artifact decisionali.

M3-A viene invocata in sola memoria per verificare tutti i candidati marginali, con una sola combinazione di preview e nessuna review ticket. Quella preview non determina il budget o il risultato M3-B. L'enumeratore M3-B applica invece i tetti effettivi20.000/100.000 e conserva riferimenti alle leg, evitando copie ripetute delle stesse griglie/provenienze. Ordine:2,3,4 leg, indici lessicografici delle quote ordinate per ID; il conteggio include i sottoinsiemi scartati per fixture/squadre ripetute. Le review si chiedono solo per combinazioni con tutti i gate marginali superati.

La lista verificata è ordinata per `conditionalSyntheticNetPerUnitBounds[0]` decrescente, poi ID combinazione crescente. Non esiste EV combinato puntuale. Una combinazione con margine inferiore zero resta a zero; netto inferiore−1 per qualsiasi prezzo finito. Prezzo reale sempre null: il prototipo verifica soltanto prezzi ticket **sintetici dichiarati**, non certifica un'offerta bet365 effettiva.

## Persistenza, autorità e verifica

Entry point: `runSyntheticPrototype({root,input,simulationClock})`; verifier read-only: `verifySyntheticPrototype({root,input})`. Nessuna CLI live, orchestratore nuovo, accesso a provider, generazione di forecast o esportazione Android. La demo usa un workspace privato dedicato, non il namespace scientifico.

Directory deterministica: `<root>/.local/mm-simulator-synthetic-v1/<hash stagione/giornata/policy>`. All'interno è ammesso un solo input sigillato per quella autorità/versione. Nessun parametro attempt o altro nome per azzerare il budget. Il runner rifiuta input/codice/policy differenti nello stesso scope: una futura procedura per nuove osservazioni autentiche non è implementata né autorizzata. Cambiare root non è una procedura di recovery o rinnovo del budget.

| Artifact immutabile | Legami e ruolo |
|---|---|
| `policy.json` | Configurazione nota, SHA policy/codice, UTC reale e ambito esclusivamente sintetico |
| `intent.json` | Autorità, SHA input/policy/codice, riferimento byte al registro, inizio dello scenario e UTC reale; precede gli effetti decisionali |
| `input.json` | Copia integrale dell'ingresso fornito, verificata contro l'input del chiamante |
| `preview.json` | Verifica iniziale e ordine completo dei ticket candidati; non finale |
| `review-NN-claim.json` | Slot1–10, identità combinazione, autorità/input/policy e tempo simulato; scritto prima del controllo |
| `review-NN-result.json` | Riferimento al claim esatto e risultato riproducibile della review sintetica |
| `prepared.json` | Decisione attesa e suo hash, riferimenti esatti a intent/input/preview/claim/risultati |
| `decision.json` | Decisione esattamente uguale al piano preparato; nessuna ricalcolazione dell'hash per legittimare una mutazione |
| `commit-proof.json` | Rilettura e gate ancora validi dopo la pubblicazione della decisione; hash byte dei riferimenti, completamento simulato e osservazione UTC reale separati |
| `receipt.json` | Catena completa fino a decisione e prova del commit; hash canonici e hash dei byte distinti |

Si riusano `writeExclusive` e `privateLock` esistenti senza modificarli: pubblicazione esclusiva con file sincronizzato e hard link, nessuna sovrascrittura. I riferimenti indicano file esatti del namespace, SHA256 dei byte e SHA256 del payload. Schemi e flag di sicurezza sono verificati; risultati e decisione sono anche ricostruiti deterministicamente dagli input e dai claim. La conta dei claim riguarda verifiche **distinte**, non le ripetizioni pure del validatore necessarie a controllare gli hash.

Il verifier controlla anche ordine/numero delle review, assenza di slot extra, layout coerente, hash di codice e policy. Junction/symlink nel percorso vengono rifiutati prima di creare artifact nel target esterno. File pubblicati troncati, sconosciuti o alterati non sono riparati automaticamente. I temporanei non pubblicati sono riconosciuti soltanto per nome ammesso, preservati e mai promossi silenziosamente a snapshot.

## Stati, incompletezza e recovery

`SYNTHETIC_FINAL_VERIFIED` significa che la **catena sintetica** è verificata, non che una previsione scientifica sia congelata o una quota sia realmente offerta.

La decisione distingue `SYNTHETIC_EXPLORATORY_SIMULATION_RECORDED`, `ANALYSIS_INCOMPLETE`, `NO_COMBINATION_IN_REVIEWED_SYNTHETIC_SCOPE` e `NO_SYNTHETIC_COMBINATION_AVAILABLE`. Un positivo richiede ricerca non troncata, copertura adeguata, tutti i ticket candidati necessari verificati entro il budget e almeno un inferiore combinato≥0,05. Con più di10 ticket necessari, la migliore dei10 può apparire solo come diagnostica del subset: `selected:null`, incompletezza esplicita. I negativi hanno sempre `globalNoBet:false`.

Per tutti gli output: `synthetic:true`, `exploratory:true`, `operationallyApproved:false`, `scientificallyValidated:false`, `actualStakeEUR:0`, `authenticExecutionAllowed:false`, `appDeliveryAllowed:false`. L'eventuale `exploratoryPolicyEligible:true` riguarda esclusivamente il risultato del vettore sintetico. `jointProbability:null`, `jointConfidenceInterval:null`; intervalli marginali non simultanei e netto condizionale alla liquidazione binaria ordinaria, senza probabilità di void inventate.

| Interruzione/stato | Comportamento |
|---|---|
| Prima dell'intent | Nessun effetto decisionale; una registrazione policy già riuscita viene verificata e riutilizzata |
| Intent senza input/preview | Si prosegue soltanto con gli stessi input/code/policy, sotto il lock e dentro la finestra simulata |
| Claim senza risultato | Si riusa lo stesso slot/identità; nessuna seconda prenotazione o richiesta esterna |
| Prepared senza decisione | Si rivalidano contenuto e tempi prima della pubblicazione esclusiva della decisione attesa |
| Decisione senza prova di commit | Non è successo. Recovery solo ancora entro finestra, con input immutati e gate rivalidati; fuori finestra si conserva lo stato parziale |
| Prova di commit senza receipt | Si verifica il commit già dimostrato e si completa soltanto la receipt; nessun nuovo forecast o decisione. Il solo mtime non sarebbe una prova |
| Receipt completa e nessun proprietario/residuo del lock | Replay interamente read-only, senza creare neppure lock temporanei; hash/mtime di file e directory invariati |
| BUSY o cleanup ambiguo | Errore propagato, nessun retry automatico. Dopo effetti già avvenuti si ispeziona la catena; un riavvio serializzato esplicito può verificare o recuperare lo stesso scope |

Il commit prova il rispetto del **clock di test** esplicito; non è una certificazione esterna del tempo, una firma del bookmaker o un permesso a riutilizzare date simulate per esecuzioni autentiche. Le verifiche locali rilevano modifiche rispetto agli input/codice/riferimenti attesi; non offrono una radice di fiducia esterna contro la sostituzione maliziosa di un intero workspace insieme a tutti i suoi input.

## Prove e demo

18 test dedicati includono20 interruzioni reali di processo, prima/dopo10 fasi critiche; due BUSY controllati senza intent e successivo recupero serializzato; tre processi separati con proprietario trattenuto e due rifiuti BUSY; EPERM in pubblicazione e AggregateError di cleanup dopo receipt; file pubblicati incompleti, temporanei preservati, input/hash/policy alterati, slot aggiuntivi, junction, clock rollback, limite escluso, recovery senza prova di commit e completamento della sola receipt.

Sono coperti budget persistente, limite inferiore Fréchet0, centrale fuori intervallo, contesto/quote/review mancanti, board completi ma chiusi e assenza di accessi autentici. La prova a configurazione piena conta20.000 terminali,21.572 nodi e10 claim e termina `ANALYSIS_INCOMPLETE`. Il test di replay blocca esplicitamente tutte le primitive filesystem di scrittura: nessuna viene chiamata. Nessun test multiprocesso M2.5 modificato.

Demo privata: `.local/diagnostics/mm-simulator-m3b-20261027/demo.private.md` e relativo JSON.40 selezioni inventate,20 board completi; soltanto2 fixture con disponibilità positiva, le altre8 esplicitamente chiuse.4 review distinte e nessuna lacuna. Tutte le marginali alte sono identiche; il ticket sintetico dato1,80 viene ordinato prima dei tre ticket dati1,40 per il rispettivo inferiore combinato0,44 contro0,12. Questo dimostra il ranking richiesto senza usarne uno marginale surrogato. Nessun prezzo reale o probabilità congiunta puntuale.

La demo completa registrazione, decisione, commit-proof, receipt, verifica e seconda esecuzione read-only. Input, byte e mtime di file e directory restano identici al replay. Receipt byte SHA256 `3bb17c6a0c51c850cc6a8f05e83dd269c7a8cfc51ba72536da7d343315607c38`; payload decisione SHA256 `ff200c35a2182ce46bd90312b97cf9c23091c30c4245c49fcf12bdeaa9c00b9c`.

## Esito conclusivo

**M3-B COMPLETE — SYNTHETIC ONLY.**18/18 test dedicati; regressione parallela555/555 in84,002s e seriale555/555 in298,717s, senza skip. Lint senza errori, solo l'avviso preesistente `combinedPlayedOdd` in `app/components.tsx`. Build Next.js/TypeScript superata. La verifica multiprocesso già esistente ha contato25 e26 ingressi su600 tentativi, con zero sovrapposizioni e zero rifiuti di accesso Windows nelle due suite; nessuna modifica al test corretto M2.5 e nessun nuovo problema di concorrenza osservato.

Controllo dei5.743 file preesistenti, inclusi originali scientifici, G8, approvazioni, ledger e M1/M2/M3-A: hash byte, dimensione e mtime invariati. La scheda decisionale precedente e il file locale non correlato restano preservati; quest'ultimo non è stato letto o incluso. Solo7 file nuovi di questo lotto:3 moduli,3 file di test/fixture e questo documento. Nessuna modifica alla persistenza produttiva1X2 o al lock.

Evidenze private sotto `.local/diagnostics/mm-simulator-m3b-20261027/`: baseline e controllo finale, log mirati, log delle due suite, lint/build, input e output della demo e autorità sintetica persistita. Nessun dato privato incluso nei file da versionare. Commit esclusivamente locale; nessun push, CI remota non eseguita, PR non modificata. Nessuna chiamata API, acquisizione reale, forecast/refit, journal autentico, consegna, scheduler, deploy o scommessa. Stake reale0€.

## Limiti e prerequisiti per un eventuale pilot futuro

M3-B non accetta dati autentici o storici reali. Non modifica `validatedMarkets:[]`, gli studi, le coorti o la policy1X2; nessuna regola di disponibilità viene aggirata. EV, ampiezza0,25 e tempi restano euristiche di ricerca. Quaranta bootstrap e limiti marginali non garantiscono copertura simultanea, accuratezza, indipendenza o rendimento. Il risultato dei test non misura frequenza o qualità delle opportunità reali.

Prima di un pilot occorrerebbero: autorizzazione prospettica e universo futuro; contratto autentico separato dalla policy sintetica; reader ufficiale dei forecast eleggibili e relativo scope/cutoff; RAW/catalogo/report quote autorizzati e freschi con hash verificati; review umane e contesto autentici; prezzo esatto del ticket; clock reale e gestione delle nuove osservazioni/versioni senza azzerare budget; accettazione Windows del percorso autentico, con ricevute e recovery. Né registrazione della policy sintetica né una receipt della demo approvano questi passaggi. L'integrazione Android rimane fuori perimetro e richiederebbe altro contratto e consenso.
