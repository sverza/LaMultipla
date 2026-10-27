# Policy esplorativa M3 v1 — proposta da approvare

ID proposto: `multimarket-exploratory-m3-v1-draft-20261027`.

**DRAFT_REQUIRES_USER_APPROVAL — NON ATTIVA — COMPOSITORE NON IMPLEMENTATO.** Questa specifica non registra una coorte, non modifica policy esistenti e non autorizza forecast, quote, simulazioni autentiche o consegne. Un'eventuale approvazione dello sviluppo M3 dovrà distinguere implementazione, prove sintetiche e primo uso prospettico.

## 1. Perimetro e separazione scientifica

Solo BTTS Yes/No e Over/Under2,5 FT regolamentare, recupero incluso, supplementari e rigori esclusi. Massimo una selezione per fixture e nessuna squadra ripetuta nella stessa combinazione. Esclusi1X2, altre linee, team totals, DNB, handicap, Bet Builder, corner, cartellini e giocatori. Non si amplia la allowlist per compensare una copertura insufficiente.

Le probabilità e le repliche devono provenire da journal v2 già congelati e verificati con un lettore ufficiale. Nessun fit, refit, correzione, temperatura nuova o ricostruzione di bootstrap. La proposta usa **DC-v2 come primario fisso**, bivariato-v2 come comparatore diagnostico: scelta da approvare prima dei nuovi dati. Non si sceglie il modello con EV maggiore per ogni selezione e non si passa automaticamente al comparatore quando il primario è incompleto. Il comparatore mancante resta esplicitamente tale; non fornisce un'autorizzazione sostitutiva.

`validatedMarkets: []` resta invariato. L'approvazione di un esperimento non è una validazione predittiva. Il gate `MODEL_NOT_AUTHORIZED` del selettore1X2 non viene cambiato. Tutti gli output M3 dichiarano `exploratory:true`, `statisticallyValidated:false`, `operationallyApproved:false`, `eligibleForOriginalSelector:false`, `appDeliveryAllowed:false`, `actualStakeEUR:0`.

G6–G9 sono esclusivamente archivi diagnostici/di regressione: nessuna decisione prospettica ricostruita. La data iniziale e l'universo del primo esperimento futuro devono essere approvati prima del relativo evento e dell'esame dei risultati. Coorti, registri, journal, G8 e screening0001 restano invariati; la lacunaG7 non viene cancellata. La serie originale di60 giornate/600 eventi non è reinterpretata da M3.

## 2. Contratti da realizzare in M3, non ancora esistenti

| Contratto proposto | Vincoli |
|---|---|
| Admission manifest | ID esperimento/policy/code hash, autorizzazione, intera giornata con10 fixture, subset ancora futuro, snapshot M1 verificato contro RAW/catalogo/report, rapporto M2 e freeze verificato, modello primario fisso, cutoff e hash originali |
| Selection review | Board/outcome/quote ID, fixture, FT/linea, prezzo singolo, hash dell'input, contesto e liquidazione pertinenti, fonte reale, revisore, osservazione/revisione UTC e scadenze; nessun default positivo |
| Ticket review | Esatto insieme ordinato di quote, prezzo complessivo effettivamente mostrato, bookmaker bet365.it, ordinary accumulator, evidenza e revisore, timestamp, legami con tutte le verifiche singole |
| Attempt intent | ID stabile e namespace M3, input/policy/code hash prima degli effetti, ordine di esecuzione, stato; nessun nuovo ID per aggirare uno stato ambiguo |
| Final result | Decisione esplorativa o mancata simulazione con perimetro e cause, preview distinta, gate ed esclusioni completi, prove e tutti gli hash, prezzo reale, limiti di dipendenza e incertezza |
| Receipt e verifica | Riferimenti ai byte/artifact effettivi, hash canonici distinti dagli hash file, finalità e controllo di replay; `FINAL_VERIFIED` M3 non equivale al `FROZEN_VERIFIED` scientifico della coorte |

I contratti M1/M2 non sono modificati: restano ingressi, non prove che tutti i gate M3 siano superati. Non importare il test helper di recovery nei moduli applicativi. Non passare una decisione multimercato al vecchio `persistDecision`/`appPackage`1X2 fingendo che ne abbia il contratto.

## 3. Gate di ingresso

| Gate | Condizione necessaria | Rifiuto / conseguenza |
|---|---|---|
| Autorizzazione | Protocollo esplorativo, inizio futuro e ambito approvati | INPUT_BLOCKED; nessuna registrazione automatica |
| Freeze | Journal/studio/dataset/entry/code/protocollo/receipt autentici, hash coerenti, fonte/cutoff consentiti | STOP_INTEGRITY; preservare ogni artifact |
| Identità | Stessa stagione, giornata, fixture, casa/trasferta, kickoff e calendario riconfermato | Esclusione o STOP su conflitti; niente fuzzy matching |
| Fonte quote | Snapshot originale verificabile, catalogo e mapping versionati, bookmaker regionale esatto | Fonte/confine non dimostrati: nessuna selezione |
| Board | Esattamente due outcome verificati dello stesso mercato, periodo, linea e osservazione | Completo/disponibile restano condizioni distinte; vietato riempire buchi |
| Disponibilità | Bookmaker attivo, non sospeso, mercato attivo e selezioni attive | False/null/omissioni/ambiguità bloccano; nessun override manuale |
| Griglie | Probabilità e complementi validi secondo M2, primario identificato, parametri congelati | Dato non utilizzabile; nessuna ricostruzione |
| Incertezza | Repliche/metadati e intervalli sufficienti, non alterati | Incompletezza; una centrale senza intervallo non è selezionabile |
| Tempi | Tutte le scadenze reali ancora valide al commit finale | EXPIRED/WAITING; nessuna ritimbratura |
| Contesto | Evidenze e review applicabili complete, senza aggiustamenti probabilistici | REVIEW_REQUIRED, non assenza di valore |
| Regole | Liquidazione esatta verificata per mercato e bookmaker | SETTLEMENT_UNVERIFIED, non proiezione economica definitiva |
| Offerta singola | Prezzo e disponibilità controllati manualmente e legati alla stessa quota | Prezzo mutato o controllo assente: blocco; non riscrivere il RAW |
| Ticket | Prezzo e disponibilità della combinazione esatta verificati | Preview/incomplete, mai prezzo dedotto dal prodotto |
| Persistenza | Un solo writer, input immutabili e nessun effetto ambiguo precedente | LOCK_BUSY / REVIEW; niente retry cieco |

L'intero universo della giornata viene censito, con esclusioni visibili; le selezioni possono appartenere a giorni differenti. Le dieci partite non devono essere tutte nello stesso giorno. Una simulazione positiva sul subset ammesso non certifica la completezza dell'offerta su altre fixture.

## 4. Requisiti temporali

UTC per calcoli e hash, Europe/Rome soltanto per visualizzazione. Nessun giorno settimanale fisso, nessuna CLI `as-of` per decisioni autentiche. Kickoff, rinvii e DST provengono dal calendario verificato; cambiamenti invalidano i binding precedenti.

- Forecast già congelato prima dell'osservazione delle quote; verifica del completamento del freeze, non solo della generazione del journal.
- Approvazione e hash della policy devono precedere l'acquisizione delle quote del primo esperimento e il primo evento eleggibile. Mercati, modello primario, soglie, budget e ordine non possono essere scelti dopo aver visto quei prezzi o risultati.
- Età del forecast al commit: massimo24 ore, come nel percorso di riferimento. Una nuova quota non rinnova il forecast.
- Osservazione quote e controlli singoli/ticket: massimo30 minuti. Revisione successiva all'osservazione pertinente, mai futura rispetto al clock reale.
- Riconferma calendario/provider nel limite già previsto di60 minuti per gli ingressi di calendario, con verifica delle eventuali variazioni ufficiali. Se una dipendenza richiede una fonte più fresca prevale il limite più stretto.
- `changedAt` è ultimo cambiamento, non osservazione. Oltre24 ore richiede la review esatta prevista; non basta da solo a dichiarare un prezzo scaduto. Timestamp obbligatorio mancante/invalido resta bloccato da M1. `bookmakerChangedAt:null` resta un'assenza opzionale, non zero.
- Completamento della composizione prima del primo kickoff selezionato meno150 minuti, **limite escluso**, preservando il margine tecnico della pipeline. Non basta iniziare entro il limite.

Scadenza effettiva: minimo fra validità del forecast, quote, review singole/ticket, contesto/regole applicabili e kickoff−150 minuti. Ogni gate è ricontrollato immediatamente prima del commit. I futuri limiti135/120 minuti di coda/consegna non si attivano qui; la protezione tecnica dei5 minuti non sostituisce la finestra utile. Quote osservate non garantite per le due ore successive.

Il primo ciclo autentico richiederà forecast e prezzi realmente eleggibili nella relativa finestra: gli archivi G6–G9 e un rapporto M2 calcolato oggi non soddisfano questo requisito.

Il loader autentico M2 attuale usa il verificatore della serie G8 e non è già un lettore universale delle giornate future. Prima di un pilot futuro serviranno journal autorizzati e un corrispondente percorso ufficiale di verifica; questa policy non lo inventa, non estende il freeze G8 e non consente di adattare un vecchio journal cambiandone ID o data. Il prototipo può essere sviluppato su fixture sintetiche e archivi storici dichiarati, ma questi ingressi non abilitano esiti prospettici.

## 5. Contesto e liquidazione

Si conserva il contratto contestuale attuale: calendar, injuries, suspensions e lineups per le due squadre, con fonte attribuita, timestamp, review e incertezze. TTL attuali:24/24/168/24 ore; formazione confermata massimo2 ore. Calendario delle altre competizioni e intervallo di riposo devono rispettare i controlli esistenti; assenza di notizie non equivale a disponibilità confermata.

Una formazione probabile documentata può soddisfare il relativo formato; non diventa ufficiale. L'assenza di lineup non blocca il calcolo statistico o il freeze, ma resta un blocco della composizione secondo il gate attuale. Renderla facoltativa nella composizione richiederebbe una scelta esplicita di policy, non un cambiamento silenzioso di `CONTEXT_POLICY`.

Review delle regole: fonte ufficiale applicabile a bet365 Italia, URL e versione/hash, revisore reale, verifica entro7 giorni come nel gate esistente. Devono essere espliciti FT con recupero, esclusione di supplementari/rigori, rinvii, sospensioni, annullamenti e void. Non dedurre regole dal nome del mercato o dalle sole definizioni del provider.

Per le due famiglie il payoff è binario in caso di regolare liquidazione. I void amministrativi non sono perdite e non ricevono probabilità inventate. Se non è dimostrabile come verrà liquidato il ticket in caso di void, non finalizzare. Anche con regole note, gli EV sotto sono dichiarati condizionali alla liquidazione binaria ordinaria di tutte le leg: non modellano il rischio di annullamento.

Le attestazioni manuali provano una review dichiarata, non una certificazione indipendente del software. Duplicati o review contraddittorie causano REVIEW, non scelta della variante più favorevole.

## 6. Prezzo effettivo e ricerca dichiarata

Prima verificare singole selezioni, disponibilità e regole su bet365 Italia. Poi aprire manualmente il ticket esatto senza inviare la giocata e registrare il prezzo totale mostrato. Vietato automatizzare login, conto o puntata. Importo reale sempre0 €.

Il prezzo del ticket è associato all'esatto insieme di quote e alle versioni delle verifiche. Non è il prodotto delle singole, anche se incidentalmente coincide. Se cambia una leg, un prezzo singolo o un input, la vecchia review non è più applicabile. Un nuovo dato produce una nuova osservazione con legame di revisione; nessuna sovrascrittura o selezione retrospettiva della migliore quota.

Proposta operativa di ricerca, da approvare:

1. Ordinare individualmente le selezioni che superano i gate: EV marginale inferiore decrescente, EV puntuale decrescente, ID fixture/mercato/outcome come tie-break stabili. Sono metriche esplorative, non valutazioni validate.
2. Enumerare prima2, poi3, poi4 leg, in ordine lessicografico degli indici della lista; una sola leg per fixture e nessuna squadra ripetuta. Limite tecnico20.000 combinazioni, ereditato come tetto ingegneristico. Ricerca troncata: nessuna prova di assenza di valore.
3. Verificare manualmente, nello stesso ordine, al massimo10 ticket per tentativo. Il10 è un budget di review proposto, non una soglia statistica: non è stato ottimizzato sui risultati passati e richiede approvazione.
4. Finalizzare la **prima** combinazione che supera tutti i gate con prezzo effettivo, senza attendere inutilmente la finestra successiva. Nessun confronto a posteriori per scegliere il tentativo più favorevole.
5. Se il budget finisce prima di una verifica completa, dichiarare REVIEW_BUDGET_EXHAUSTED e il perimetro esaminato; mai un NO BET globale.

La prima versione propone2–4 leg. Non eredita automaticamente il massimo assoluto6 del vecchio selettore. Una simulazione negativa riguarda soltanto l'universo ammesso e verificato secondo queste regole; non afferma che nessun mercato reale abbia valore.

## 7. Soglie proposte e loro origine

**Nessuna soglia qui è attiva o validata.** La seguente proposta riutilizza i riferimenti ingegneristici già presenti in `scripts/lib/shadow/policy.mjs`, senza modificarli né stimarli su G6–G9:

| Controllo esplorativo proposto | Valore | Significato |
|---|---:|---|
| EV marginale puntuale minimo |0,05|Netto per unità, dal prezzo singolo verificato e dalla probabilità del primario |
| EV marginale inferiore minimo |0,02|Da estremo inferiore descrittivo originale |
| Ampiezza marginale massima |0,25|25 punti di probabilità, non25% relativo |
| EV combinato inferiore minimo |0,05|Dal prezzo reale del ticket e inviluppo conservativo di Fréchet |

Con prezzo singolo `c`, punto `p` e intervallo marginale `[l,u]`, gli EV diagnostici binari sono `c*p−1` e `[c*l−1,c*u−1]`. Nessuna probabilità è ricavata dal prezzo. I confronti usano precisione completa; arrotondamento solo in visualizzazione, senza epsilon che attenui una soglia economica.

Prima di implementare l'ammissione autentica devono essere approvati primario, soglie, budget e ordine. In mancanza di uno di questi parametri la policy è incompleta e non attivabile. Lo sviluppo del codice non costituisce approvazione scientifica. Eventuali cambiamenti successivi richiedono nuova versione prima degli eventi futuri, mai retuning sui risultati del pilot.

## 8. Dipendenze e incertezza

Una leg per partita elimina combinazioni dello stesso incontro, non la dipendenza fra incontri. Vietati prodotto delle probabilità marginali, indipendenza presunta e uso dell'indice comune dei bootstrap come modello della distribuzione congiunta degli esiti.

Per `n` marginali centrali `p_i`:

`L_point = max(0, sum(p_i)−(n−1))`; `U_point = min(p_i)`.

Con intervalli marginali `[l_i,u_i]`:

`L_sens = max(0, sum(l_i)−(n−1))`; `U_sens = min(u_i)`.

Per prezzo effettivo `C`, l'inviluppo netto condizionale è `[C*L_sens−1, C*U_sens−1]`. Non è un intervallo congiunto95%. `jointProbability:null` e `jointConfidenceInterval:null` devono restare tali. Anche i limiti puntuali sono condizionali alla correttezza delle probabilità marginali stimate; non sono una dimostrazione di profitto.

Si mantengono i bootstrap congelati e le condizioni M2: almeno40 dichiarati, fallimenti non oltre10%, conti coerenti, grid e complementi verificati. Nessun refit o bootstrap sostitutivo. Intervalli non simultanei; estremi dei complementi non corretti artificialmente. Una centrale esterna all'intervallo resta segnalata e richiede review: nessun allargamento automatico per farla entrare.

### Restrittività legittima

Se `sum(l_i) <= n−1`, `L_sens=0` e l'EV inferiore è−1 per qualsiasi prezzo finito: nessuna combinazione supera il gate. Non si indebolisce Fréchet per ottenere una proposta. Se tutti gli estremi inferiori sono <= `(n−1)/n`, questa condizione è inevitabile.

La policy non è matematicamente impossibile. Esempio **esclusivamente sintetico**: due selezioni con punto0,95, intervallo[0,90;0,98] e quote singole1,20 superano i gate marginali; un prezzo del ticket **dato indipendentemente** pari a1,40 dà `L_sens=0,80` ed EV inferiore0,12. Non è una quota ricavata dal prodotto, una fixture reale o una previsione di frequenza delle proposte.

Con estremi0,49 e0,49 invece il limite inferiore è zero e nessun prezzo finito risolve il blocco. Sono dimostrazioni aritmetiche, non validazione empirica o motivi per scegliere soglie dai risultati noti.

## 9. Stati, finalità e assenza di proposta

| Stato proposto | Significato e finalità |
|---|---|
| INPUT_BLOCKED / STOP_INTEGRITY | Autorizzazione, identità o hash non validi; non procedere |
| LOCK_BUSY_NO_FINAL | Contesa fail-fast verificata, nessun effetto dimostrato; stato non finale, nessun successo implicito |
| PARTIAL_REQUIRES_REVIEW | Intent, final/receipt o cleanup ambigui; conservare e bloccare altri tentativi |
| ANALYSIS_INCOMPLETE | Forecast, quote, contesto, regole, intervalli o ticket insufficienti; non NO BET |
| PREVIEW_REQUIRES_REVIEW | Elenco deterministico di combinazioni da verificare, non consiglio o offerta |
| NO_SIMULATION_AVAILABLE_INPUTS | Nessuna combinazione costruibile dall'offerta osservata disponibile; motivo tecnico, non assenza di valore |
| NO_COMBINATION_IN_REVIEWED_SCOPE | Nessuna combinazione supportata nel solo perimetro dichiarato e completamente verificato |
| EXPLORATORY_SIMULATION_FROZEN | Unica simulazione positiva finale M3 della giornata; tutti i gate superati, stake reale0 |
| EXPIRED / INVALIDATED | Nuova osservazione append-only; un risultato precedente non viene riscritto |

Gli esiti negativi restano provvisori finché ci sono finestre/opportunità future previste dal gestore esistente. Nessun nuovo scheduler. Un limite di ricerca/review, una fonte mancante o un rinvio irrisolto impediscono di dichiarare un negativo globale definitivo. Esaurimento temporale con lacune: motivo `EXHAUSTED_WITH_INCOMPLETE_EVIDENCE`, non prova di NO_VALUE.

Tutte le finestre e tutti i tentativi sono conservati; non si sceglie dopo i risultati il migliore. Una simulazione positiva completa non aspetta il giorno seguente. Una finale già verificata non viene sostituita con nuove quote.

## 10. Persistenza, replay e recovery

L'audit2.5 dimostra che il lock attuale garantisce esclusione fail-closed, non che una coppia contesa produca sempre un vincitore. Entrambi possono restituire BUSY e ritirarsi senza effetti. **Questo caso va previsto dal chiamante M3, non cambiato eliminando i controlli del lock.**

Ordine richiesto per il futuro codice:

1. Validare autorizzazione, input e finestra reale; cercare intent/finali/ricevute già presenti. Nessun nuovo intent per eludere un tentativo precedente.
2. Acquisire il lock esistente del namespace M3; se fallisce, non assumere che non esistano effetti da altri writer. Nessun retry automatico del lock o delle API.
3. Sotto il lock, rileggere stato e hash; persistere l'intent immutabile prima degli effetti della decisione.
4. Preview e finale sono artifact distinti. Il renderer non muta input/array. Gli hash di ciascun riferimento puntano all'artifact effettivo, senza ricalcolare un hash per legittimare una mutazione involontaria.
5. Pubblicare con primitive esclusive e receipt verificabile. Successo soltanto dopo rilettura e verifica di final, input, prezzi/evidenze e receipt.
6. Medesimi input e finale verificata: replay read-only; nessuna riscrittura o nuova proposta. Input diversi: conflitto, non un tentativo numerato per aggirarlo.

### Contesa o errore

Due BUSY espliciti non sono due tentativi scientifici riusciti. Dopo la conclusione di tutti i writer noti, verificare assenza di finale/receipt/effetti parziali, input identici, ritiro dei lock e validità temporale. Solo allora è consentibile **un nuovo avvio manuale esplicito**, con lo stesso intent/input se già esistente. Il lock viene riacquisito e tutti i controlli vengono rifatti; osservare una directory vuota non sostituisce il lock.

Non fare retry su timeout, EPERM/EACCES, errori di pubblicazione, `AggregateError` di cleanup o esito ambiguo. Un'azione può aver scritto il final e poi fallire durante il rilascio: la mancanza di una Promise fulfilled non prova assenza di effetti. Ispezionare prima final e receipt. Mai cancellare un lock vivo/alterato, un temporaneo estraneo o un checkpoint per ottenere progresso.

Crash con final valido ma receipt assente: non calcolare di nuovo e non rifare acquisizioni. Una futura procedura di completamento della sola receipt dovrà essere espressamente prevista e testata, verificando i tempi di commit già dimostrati; il solo mtime del file non basta. Senza tale prova resta PARTIAL_REQUIRES_REVIEW. Nessuna ricevuta retrodatata. Se il final non esiste e la finestra è chiusa, nessuna nuova composizione autentica.

Il test helper2.5 dimostra un unico recupero serializzato dopo due BUSY e quiescenza. Non implementa questo FSM produttivo, non è un'API di retry e non risolve fairness o contesa arbitrariamente continua. L'accettazione M3 dovrà coprire esplicitamente questo FSM su filesystem Windows, inclusi processi separati, crash e errori dopo la scrittura.

## 11. Confini applicativi e accettazione futura

Selettore1X2, soglie originali, `CONTEXT_POLICY`, engine, freeze-only, journal e coorti non vengono modificati. Nuovi moduli fuori dall'engine registrato; namespace privato M3 separato. Nessuna scrittura in `public/latest-slip.json` o altri feed pubblici.

Android v4 accetta selezioni1X2: una multipla BTTS/O2,5 non è esportabile fingendo quel contratto. M3 rimane JSON/Markdown locale, senza code Firebase, firma/ACK o nuovo APK. Una futura esportazione richiederà contratto/versione/ricevitore e autorizzazione separati. Una sola finale M3 non garantisce da sola un unico output globale fra due selettori paralleli: il futuro confine comune di consegna andrà progettato prima di abilitare invii.

Prima di un pilot autentico: approvazione della policy, evento futuro e autorizzazioni alle fonti; tutti i gate, test sintetici completi positivi/negativi, Fréchet con limite zero, prezzi reali distinti dal prodotto, input incompleti, timeout/contesa/crash/replay e originali invariati. Nessun test software sostituisce validazione predittiva, calibrazione, confronti appaiati o verifica prospettica del selettore. Conservare anche esiti negativi e challenger peggiori.

**Decisioni richieste prima di M3:** approvare o modificare questa proposta, il primario fisso, soglie/budget/ordine e scope del primo lotto di sviluppo. L'avvio dell'implementazione e quello del primo esperimento autentico restano autorizzazioni distinte. Nessuna di esse è conferita dalla presente milestone2.5.
