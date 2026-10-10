# Protocollo generale LaMultipla v1

Versione `analysis-decision-v1`, registrata il 10 ottobre 2026 alle 21:40 UTC. Vale per nuove analisi, non ricostruisce decisioni passate. Autorità del processo: questo protocollo. Autorità numerica: i protocolli specialistici e i rispettivi hash. Una modifica di criteri o modelli richiede nuova versione e coorte futura separata.

## Stato e responsabilità

Un solo produttore di decisioni: `scripts/shadow.mjs`. `model-engine.mjs` produce diagnostica sperimentale, `oddspapi-analysis.mjs` conserva compatibilità con gli audit precedenti: nessuno dei due autorizza una multipla. `decision.mjs` verifica e prepara una consegna locale; non ricalcola probabilità né sceglie selezioni.

Oggi tutti i modelli sono **non autorizzati al gioco**. Il modello goals-v1 1X2 ha superato la validazione retrospettiva; BTTS/UO e gli altri mercati restano sperimentali o non supportati. Separare sempre:

- risultato shadow: `MULTIPLA_SIMULATA` oppure `NO_BET`, con motivo tecnico;
- decisione operativa: `NO_BET / MODEL_NOT_AUTHORIZED`, finché manca autorizzazione esplicita;
- pubblicazione: non consentita da questa implementazione, indipendentemente dai primi due stati.

Il proprietario del progetto autorizza eventuale uso operativo e pubblicazione, dopo esame delle evidenze e verifica tecnica. Un campo JSON `approved: true` non costituisce autorizzazione. La capacità di calcolare EV non dimostra né accuratezza né profitto.

## Procedimento unico

| Passo | Software e controlli reali | Intervento necessario oggi |
|---|---|---|
| 1 Calendario | `validateCycleSchedule`: 10 fixture distinte, 20 squadre, stagione/giornata/finestre coerenti; identità riconciliata col report | Calendario e rinvii verificati su fonte ufficiale, fonte registrata nel manifest |
| 2 Storico | `--refresh-data`: commit e licenza CC0 verificati, nuovi snapshot esclusivi; nessuna modifica allo studio originario | Lacune e correzioni successive devono essere esaminate, mai imputate |
| 3 Forecast | Registro/hash/configurazione, cutoff mensile, dati osservabili prima della generazione, forecast prima delle quote; esclusioni esplicite | Revisione della copertura e dei limiti delle incertezze |
| 4 Quote | OddsPapi batch/cache/quota oppure report locale; `bet365.it`, selezione, periodo, linea, giocatore, fixture e timestamp esatti | Verifica manuale positiva v2 per inattivi, prezzi finali e combinazione; flag provider immutabili |
| 5 Valore preliminare | EV da forecast indipendente; baseline senza margine soltanto con 1X2 completa; niente prezzi mancanti inventati | Nessuna probabilità inserita dal revisore |
| 6 Contesto mirato | Dossier di forma e calendario; evidenze selettive ufficiali, limiti, conflitti, fonti, diritti e tempi | Indisponibili, squalifiche, formazioni, tutte le competizioni e turnover: controllo umano, nessuno scraping implicito |
| 7 Affidabilità | `contextGate`; dati mancanti/contraddittori portano a revisione; probabilità, CI ed EV restano invariati | Accettazione documentata dell'incertezza o esclusione motivata, non correzioni numeriche |
| 8 Liquidazione | `selectionGate`: verifica delle regole associata esattamente a report/identità/quote; eventuale esclusione umana vincolata agli stessi dati | Prima verifica delle regole italiane ufficiali e relativa evidenza; non presumere regole di altre giurisdizioni |
| 9 Combinazioni | Ricerca finita, nessun doppio evento/squadra; Fréchet e sensibilità alle marginali; prezzo realmente verificato separato dal prodotto diagnostico | Mancano un modello congiunto validato e un protocollo di validazione congiunta |
| 10 Decisione | Governance distingue valore, dati insufficienti, contesto, liquidazione, prezzo congiunto e autorizzazione | Nessuna proposta shadow è una giocata |
| 11 Congelamento | Envelope SHA256, scrittura esclusiva, un file finale per giornata anche fra versioni di policy; anteprime separate | Conservare copie private; hash locale non è un timestamp notarile né prova contro riscrittura volontaria |
| 12 Valutazione | `shadow --evaluate/--progress`, risultati osservati dopo, confronti appaiati, revisioni/rimozioni sospese | Acquisizione risultati, verifica anomalie e valutazione originale dal 15 ottobre |

L'audit eseguibile riporta lo stato di ciascuna fase; `RECORDED` non significa che ogni informazione sia sufficiente, e `WAITING_RESULTS` è uno stato futuro, non un test superato. Le fonti comunitarie non certificano da sole il calendario reale o l'assenza di correzioni posteriori.

## Criteri e fallimenti

Conservare le soglie shadow v2: EV puntuale ≥5%, EV alla marginale inferiore ≥2%, ampiezza CI ≤25 punti percentuali, ≥40 repliche e fallimenti ≤10%; quote entro 30 minuti, forecast entro 24 ore, buffer kickoff 5 minuti. Sono criteri sperimentali preregistrati, **non soglie di redditività dimostrata**. Un CI marginale non è simultaneo fra tutte le selezioni. Non allentare i criteri per ottenere una proposta.

La verifica di liquidazione `lamultipla-settlement-verification-v1` contiene hash del report, quote ID e identità integrale; dominio italiano, origine manuale, URL HTTPS delle regole ufficiali effettivamente consultate, versione/hash del contenuto o riferimento, revisore, evidenza e timestamp. Conferma: tempo regolamentare incluso recupero, esclusi supplementari/rigori, regole annullamento/rinvio esaminate. Validità massima 7 giorni è una regola di revisione, non garanzia che le condizioni non siano cambiate. Una singola verifica delle regole può essere riusata per creare attestazioni per selezione, ma il legame a ciascuna identità/report resta obbligatorio. `decision --template` lascia questi campi vuoti.

Una disposizione umana `lamultipla-selection-disposition-v1` può richiedere revisione o escludere una candidata; deve avere stessa identità/report, timestamp successivo all'osservazione, revisore e motivazione. Un'esclusione non crea nuove probabilità e non promuove altre candidate.

I conteggi restano separati: candidate EV grezze, pronte contestualmente, ammesse dopo liquidazione. `NO_VALUE` indica solo EV puntuale non positivo sulle selezioni esaminate con dati utilizzabili. `UNCERTAIN_VALUE` indica valore puntuale non sufficientemente robusto. `INSUFFICIENT_DATA` può convivere con entrambi: non significa che tutte le quote siano senza valore. Mercati senza modello validato sono esclusi dal selettore, ma conservabili come diagnostica esplicitamente sperimentale.

Normalmente 2–4 selezioni, limite assoluto 6, stake nominale massimo 3 €, una sola multipla per giornata; stake reale oggi sempre zero. Nessuna selezione aggiunta per alzare la quota. Partite diverse non dimostrano indipendenza. Il prodotto delle quote non è il prezzo della combinazione offerto dal bookmaker. Un bound Fréchet sfavorevole indica valore congiunto **non dimostrato**, non assenza di valore. Nessuna probabilità congiunta o intervallo congiunto validato viene inventato. `MULTIPLA_SIMULATA` è soltanto una proposta sostenuta dai bound, condizionata alle stime marginali, mai una multipla statisticamente validata.

## Percorso di promozione

Il pilot della sesta giornata rimane descrittivo e intoccabile. Per goals-v1 1X2 preregistrare una nuova coorte confermativa delle prime 60 giornate consecutive con kickoff dal 13 ottobre 2026, anche su più stagioni: 600 incontri pianificati, almeno 500 appaiati, copertura forecast ≥90%, risultati verificabili ≥95%. Nessuna selezione delle giornate favorevoli, niente arresto anticipato per promozione; rolling metriche soltanto descrittive.

Modello, codice, protocollo, configurazione e baseline congelati prima delle partite; valutazione su identici incontri. Bootstrap a blocchi settimanali 1000 repliche con seed 20261010, CI95% della differenza log-loss con limite superiore <0 contro **entrambe** le baseline empirica e Poisson di lega; Brier non peggiore di oltre 0,005; ECE per ogni classe ≤0,10. Verificare copertura/calibrazione per stagione, promosse, casa/trasferta e range probabilità, dichiarando i sottogruppi insufficienti. Confronto mercato solo su lavagne complete, verificate e temporalmente compatibili; diagnostica di mercato non è test di profitto.

Questi sono criteri futuri di revisione statistica, non risultati già ottenuti. Il protocollo confermativo v2 e i suoi confronti multipli restano separati e invariati. Prima dell'uso operativo servono inoltre: audit indipendenza/leakage e dati, stabilità delle incertezze, validazione del metodo congiunto e del selettore sul proprio futuro campione, diritti, test end-to-end e autorizzazione esplicita registrata. Il monitoraggio non deve impedire lo sviluppo di altri modelli; ogni variante apre nuova versione/coorte senza riscrivere le precedenti. Il codice attuale non contiene un interruttore che abiliti il gioco.

## Contratto di consegna

`decision.mjs --handoff` produce soltanto un pacchetto **privato**, con snapshot originale e suo hash, audit ricalcolato, proposta shadow se presente, stato operativo NO BET, prezzo combinato osservato, marginali/CI riferibili al journal, origine e date. Non scrive in `public/`, non invia a GitHub e non aggiorna lo storico dell'app. `--receipt` produce un candidato pubblico NO BET su allowlist (stagione/giornata, codici motivazione, hash, stato, timestamp): nessuna quota, EV, probabilità o nota contestuale. Anche questo rimane locale finché la pubblicazione non è autorizzata.

Il contratto futuro v4 deve trasportare: fixture ID/kickoff, mercato/esito/periodo/linea/giocatore, quote/timestamp/origine-verifica, p in scala 0–1 e CI, model/policy/code/dataset/journal hash, motivazione, prezzo complessivo **osservato**, stake proposto ≤3, stato proposta/approvata/giocata, eventuale NO BET, conferma separata della giocata con prezzo/stake effettivi. Non convertire CI in una “fiducia 1–5” arbitraria.

`latest-slip.json` attuale richiede p in percentuale e fiducia 1–5; perde campi di audit e l'app moltiplica i prezzi singoli come totale. `available:false` non visualizza una decisione motivata. È pertanto un **contratto legacy**, non una destinazione già compatibile. Punto 10: parser v4 rigoroso, probabilità finite/normalizzate, prezzi finiti, prezzo totale osservato separato da diagnostico; compatibilità in lettura dei backup v3, nessuna riscrittura dello storico, stato NO BET senza stake, bozza distinta da giocata, notifiche comprensibili anche per NO BET. Nessuna migrazione app viene eseguita qui.

Le condizioni OddsPapi vietano ridistribuzione come prodotto autonomo e chiedono chiarimento nei casi dubbi. Non è documentato un divieto assoluto di ogni uso in app; **non è però dimostrato il diritto di esporre feed/archivio di quote in JSON su GitHub pubblico**. Fino a chiarimento: analisi e consegna private, solo ricevuta redatta potenzialmente pubblicabile. Le licenze delle informazioni contestuali sono distinte. La permanenza dello storico dopo cessazione e la distribuzione pubblica richiedono risposta ufficiale; niente consenso dedotto da una chiamata API riuscita.

## Criteri di accettazione del punto 10

1. Scenario locale futuro Windows con calendario ufficiale e dati reali autorizzati, senza modificare pilot: tutti i 12 stati audit espliciti, hash verificabili e zero segreti nel pacchetto.
2. Collisioni d'identità, campi non finiti, quote stale/inattive senza attestazione, regole/context mancanti o discordanti: esclusione spiegata e nessuna selezione autorizzata.
3. Lavagna incompleta: nessuna probabilità mercato inventata; forecast indipendente invariato. Quote nuove non cambiano il journal.
4. 2–4/max6, un file finale per giornata, cap3 €, nessuna probabilità marginale moltiplicata; prezzo congiunto mancante e joint model non validato restano distinti dalla mancanza di valore.
5. Modello retrospettivo senza autorizzazione produce sempre stake reale0/NO BET operativo, anche se esiste proposta shadow. Test di entrambe le diramazioni con fixture sintetiche dichiarate; nessuna equivalenza fra questi test e validazione statistica.
6. Replay locale byte-equivalente a parità di input/tempo; ogni nuova versione separata. Freeze esclusivo e revisioni/rimozioni risultati rilevate; niente riscrittura degli snapshot originali.
7. Contratto app v4 compatibile con backup/storico; NO BET visibile; bozza non diventa giocata. Test UI/Android/PWA prima di qualunque rilascio.
8. Futuro publishing: autorizzazione operativa + diritti + consenso pubblicazione distinti, branch dedicato, confronto SHA precedente (CAS), rilettura del feed e ricevuta. Nessuna pubblicazione automatica affidata al vecchio trigger.

Percorso a costo zero: test privato Windows → valutazione prospettica separata → adapter app locale → eventuale feed redatto GitHub → app, solo dopo autorizzazioni. Gli attuali workflow main effettuano deploy, quelli PR verificano il codice: non attivarli per pubblicare. Nessun cron/trigger nuovo. “Schedina Serie A 2.1 - audit” resta sospesa. La valutazione originale è dovuta dal **15 ottobre 2026 (Europe/Rome)**; `decision --obligations` la ricorda nel rapporto, ma non crea un promemoria automatico.

## Protocolli specialistici preservati

- [Modello v1](protocollo-modello-gol-v1.md), [prospettico v1](validazione-prospettica-v1.md), [qualità dati](qualita-dati-2024-25.md).
- [Shadow v1 storico](protocollo-shadow-v1.md), [tempi v2](protocollo-shadow-v2-tempi.md).
- [Motore gol v2](protocollo-motore-gol-v2.md), [contesto v1](protocollo-contesto-v1.md).
- [Audit e blocchi del punto 9](rapporto-protocollo-2026-10-10.md).
