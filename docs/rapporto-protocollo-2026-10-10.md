# Punto 9 — audit e integrazione del processo decisionale

Base: PR #2 in bozza, commit `c1667c1`. Audit sul codice, sui protocolli specialistici, sui report gol/contesto, sul feed versionato, sui workflow e sulle automazioni accessibili. Nessuna acquisizione OddsPapi, nessuna modifica app/feed/storico, nessun deploy o nuovo trigger. Principale: [protocollo generale v1](protocollo-generale-v1.md).

## Ricostruzione del precedente sistema

I commit di `public/latest-slip.json` documentano consegne delle giornate 1–6; l'ultimo aggiornamento su main è `72667e3`. Nel vecchio repository il generatore statistico riproducibile non era presente: probabilità/fiducia/motivazioni erano campi del feed e il tracker calcolava EV/ritorni, senza stimare probabilità. L'automazione “Schedina Serie A 2.1 - audit” aveva un prompt di ricerca/controllo e possibile pubblicazione GitHub, non chiamava i nuovi CLI privati né monitorava i journal. All'ispezione è sospesa (`is_enabled:false`, `next_run:null`); non è stata modificata né sono state modificate altre attività.

| Componente originario | Decisione |
|---|---|
| Stake massimo3 €, una per giornata, bozza distinta dalla giocata, storico e backup | Conservare; stake shadow reale0 |
| Controllo italiano, disponibilità prezzo, ragioni della scelta, possibilità NO BET | Conservare, vincolare a identità/tempo/evidenze |
| Probabilità percentuali e fiducia1–5 senza modello/hash/cutoff | Non usarle come evidenza statistica; mantenere soltanto la lettura dello storico |
| Fonte tipster/motivazione “prudente” e preferenza quote basse | Nessuna correzione numerica o priorità di selezione senza validazione |
| Partite diverse descritte come riduzione della correlazione | Non prova indipendenza; joint model ancora assente |
| Moltiplicazione quote come “quota totale” del tracker | Diagnostica legacy; futuro adapter deve distinguere prezzo osservato e prodotto |
| Trigger che può pubblicare e feed con available:false | Trigger sospeso; nuovo contratto deve comunicare NO BET motivato |

Incoerenza aritmetica effettiva nel **record storico**, senza rifare l'analisi della giornata: il vecchio feed contiene p83%/quota1,14, p57%/quota1,80 e p62%/quota1,57, con EV rispettivamente −5,38%, +2,60%, −2,66%. I minimumOdd registrati1,12/1,75/1,53 non corrispondono al criterio EV≥5% del vecchio prompt; le soglie coerenti sarebbero1,27/1,85/1,70 con arrotondamento superiore al centesimo. Non sono correzioni delle quote o nuove proposte: il file pubblico e la sua storia restano intatti. Il feed non certifica le date UTC/prezzi storici né una fonte riproducibile di quelle probabilità.

## Architettura verificata e modifiche

Un solo percorso: schedule/storico → journal indipendente → report OddsPapi → screen EV → contextGate → **selectionGate** → selectCombination → governance → freeze → valutazione separata. Il motore v2 aggiunge diagnostica di mercati, senza diventare un secondo selettore. `oddspapi-analysis` resta compatibilità di audit, non autorità decisionale; i suoi vecchi campi di autovalutazione non promuovono un modello.

Implementato:

- Verifica di liquidazione per candidata 1X2 con report/identità/hash, regole italiane, revisore, timestamp e scope regolamentare. Disposizioni umane negative vincolate agli stessi dati. Non si alterano forecast o flag provider.
- Candidate grezze, pronte contestualmente e pronte per il selettore distinte; perdita di informazioni o conflitti non diventano assenza di valore.
- Audit di12passi, policy generale e hash, conclusione shadow separata da NO BET operativo/modello non autorizzato. Tutte le soglie numeriche precedenti sono conservate.
- Un congelamento finale per giornata anche tra policy diverse, con claim atomico; un lock residuo dopo un arresto richiede controllo del processo, non rimozione automatica. Anteprime separate.
- Protezione esplicita del pilot giornata6 nel CLI di analisi; inspect/evaluate/progress restano disponibili. Nessun nuovo studio/forecast/quote del pilot in questa sessione.
- Review locale con replay deterministico dei componenti decisionali agli input/tempo originali; rifiuto di flag operativi alterati, hash discordanti e audit manomesso. Pacchetto privato e ricevuta NO BET redatta su allowlist. Nessun endpoint di pubblicazione.
- Monitoraggio shadow separato anche per versione del protocollo generale. Valutazioni vecchie restano leggibili, senza migrazione/sovrascrittura.
- Obbligo di valutazione del journal originale dal15ottobre, con ID/hash/baseline e stato in CLI. Non è un servizio attivo di promemoria; il completamento sul PC non è verificabile dal container.

Non implementato: autorizzazione operativa, promozione statistica automatica, stima congiunta validata, adapterappv4, publication job, trigger/cron o monitoraggio in background. Il percorso di promozione è preregistrato nel protocollo, non presentato come nuova validazione eseguita.

## Uso Windows per nuove giornate

Node≥22.13, branch della PR e dipendenze già installate; cartella `C:\LaMultipla`. Il wrapper protetto OddsPapi resta quello esistente. Questo punto non richiede chiave né nuove richieste. Usare prima `--help` per i parametri aggiornati:

```powershell
node C:\LaMultipla\scripts\decision.mjs --obligations
node C:\LaMultipla\scripts\shadow.mjs --help
node C:\LaMultipla\scripts\decision.mjs --help
```

Per un futuro report si può generare il template locale delle regole con `decision --template --report FILE`. Il template envelope contiene `payload.estimates`; integrare le attestazioni realmente completate nell'assessment già esistente, mantenendo le verifiche di disponibilità. I campi null non superano il gate. Non eseguire questo per rianalizzare il pilot.

Per controllare una **nuova** decisione usare `decision --audit --decision FILE --journal FILE --report FILE --study FILE --assessment FILE`: decision/journal devono essere envelope, report/study/assessment JSON originali. `--handoff` e `--receipt` con gli stessi input scrivono esclusivamente pacchetti locali non sovrascrivibili. Non pubblicare questi file senza autorizzazione.

## Diritti, costi e integrazione app

Fonti ufficiali consultate il10ottobre2026:

- [OddsPapi Terms](https://oddspapi.io/en/legal/terms): no redistribuzione dei dati come prodotto autonomo, verifica accuratezza responsabilità utilizzatore; chiedere chiarimento nei casi dubbi. Non dedurre diritto di pubblicazione/retention illimitata dall'accesso al piano.
- [Quota](https://oddspapi.io/en/docs/requests-and-quota): una richiesta conteggiata vale un'unità, anche errori elaborati; account non conteggiato. Nessuna nuova richiesta in questo lavoro; consumo zero. Il limite250 è quello verificato nel precedente account sul PC, non garantito qui da un nuovo test.
- [Prezzi](https://oddspapi.io/en/pricing): widget dinamico non dimostra da solo copertura o diritti del piano. Nessun abbonamento/carta.

L'app oggi perde i nuovi metadati, impone fiducia1–5, moltiplica quote individuali e non rappresenta NO BET motivato. Il nuovo pacchetto è per revisione privata, **non già importabile dal tracker**. L'eventuale JSON pubblico di quote e relativo storico non è autorizzato per supposizione. Soluzione provvisoria costo0: import locale privato futuro oppure ricevuta redatta, dopo consenso alla pubblicazione; nessun upload è effettuato qui.

## Blocchi e punto 10

| Blocco | Evidenza necessaria / prossimo lavoro |
|---|---|
| Validazione futura1X2 | Coorte confermativa futura, forecast invariati, baseline appaiate, metriche/CI/calibrazione e audit; pilot15ottobre separato |
| Altri mercati | Gate specifici v2 su coorte separata; corner/cards/players senza dataset/modello validato restano esclusi |
| Joint | Protocollo e modello congiunto valutati su nuove osservazioni; Fréchet non è probabilità congiunta validata |
| Prezzi/regole/context | Attestazioni vere italiane, aggiornate e non contraddittorie; la firma del revisore è una dichiarazione, non una verifica indipendente del software |
| Diritti feed pubblico/storico | Risposta ufficiale o licenza esplicita; consegna privata nel frattempo |
| App/adapter | Contratto v4, NO BET visibile, p/CI al posto della fiducia inventata, prezzi osservati, compatibilità backup e conferma gioco separata |
| Automazione | Prima test Windows privato futuro; poi progettazione trigger approvata separatamente, nessun nuovo job adesso |

Il punto10 deve superare gli8criteri misurabili del protocollo, usando test negativi e una giornata futura reale prima del kickoff, senza nuovi test della sesta. Il test può concludere NO BET: riuscire non richiede trovare valore. La statistica continua ad accumulare evidenze mentre si sviluppano adapter e controllo end-to-end. Non è richiesto aspettare una promozione dei modelli per sviluppare o collaudare in shadow.

## Verifica eseguita

106 test automatici superati (10 nuovi del protocollo/consegna, con input dichiaratamente sintetici); lint senza errori, con un warning preesistente `combinedPlayedOdd` in `app/components.tsx`; build Next/TypeScript superata. Test nuovi: liquidazione vuota/valida/discordante/stale, esclusione umana, inattivi con override senza mutazione provider, replay/hash/flag alterati, consegna privata e ricevuta priva di quote, concorrenza/congelamento fra policy, protezione pilot e obbligo separato, CLI senza chiave/rete/pubblicazione. La diramazione shadow positiva è verificata sinteticamente con prezzo1,44 e marginali dichiarate per test, non con nuove quote reali.

Esempio **sintetico**, osservato nel test end-to-end del pacchetto:

```json
{"shadow":"MULTIPLA_SIMULATA","operational":"NO_BET","cause":"MODEL_NOT_AUTHORIZED","actualStakeEUR":0,"jointProbability":null,"statisticallyValidated":false,"publicationAllowed":false}
```

L'output reale del comando `decision --obligations` identifica il journal originale e la baseline, stato `WAITING_UNTIL_15_OCTOBER`, `completionVerified:false`, `newTriggerCreated:false`. Non sono state ricalcolate le sue probabilità né recuperati i suoi risultati.

Verificati invariati gli hash canonici di modello/protocollo v1 e v2; diff vuoto per app, feed pubblico, motori statistici, protocollo originale e freeze originario. Le automazioni prima/dopo sono identiche: audit sospeso e altre attività invariate. I file Windows non sono disponibili nel container: la verifica materiale dei loro byte resta locale; non si dichiara una verifica del filesystem del PC.
