# B1: mapping gol e arretrati scientifici

Intervento del 19 ottobre 2026, sul branch della PR2 in bozza. B1 è un adapter diagnostico esterno e versionato, non una nuova versione dei modelli. Engine, studi v1/v2, protocolli, cutoff, journal, baseline e selettore 1X2 non cambiano. Nessun nuovo mercato diventa validato o ammesso alle proposte.

## Controllo originale G6

Prima dell'intervento non esistevano record del controllo originale. Eseguito una sola volta `node scripts/original-g6-check.mjs --record` alle **00:51:19 del 19 ottobre Europe/Rome**, ossia 18 ottobre22:51:19UTC. È un controllo tardivo rispetto al 15 ottobre, non un'esecuzione tempestiva ricostruita.

Esito: `EVALUATED_WITH_PENDING`, dieci forecast originari, zero settled, dieci pending, zero confronti appaiati con il mercato. Log-loss, Brier e altre metriche aggregate del modello/baseline sono `null`: non ci sono esiti osservabili su cui calcolarle. Pending non trasformati in risultati o perdite. La nuova osservazione Openfootball è fissata a commit `e6744429ee395bc86f247348c6184bb08d4eb361`, con copia di metadata, licenza e JSON; l'ultimo FT disponibile resta il20 settembre. Nessuna fonte supplementare usata.

Intent, osservazione, valutazione e check sono nuovi file privati esclusivi collegati da hash; il journal originale e la baseline non sono riscritti. Il CLI `--inspect` ora legge anche la cronologia dei check, verifica envelope e collegamenti all'osservazione/valutazione e riporta il controllo completato più recente. Non esegue scoring, rete o una nuova valutazione: distingue un controllo registrato con pending da un intent incompleto e dalla semplice scadenza del calendario. La funzione e l'evaluator originali di registrazione restano invariati.

## G7 e prossima opportunità

Nei percorsi scientifici canonici v1/v2 non risulta alcun journal autentico G7; neppure un freeze-attempt nel percorso diagnostico reale. È registrata privatamente la finestra originale mancata del16 ottobre. Nessuna previsione generata retroattivamente, nessuna data imputata, consegna o proposta G7.

La [programmazione Lega](https://www.legaseriea.it/serie-a/news/quando-si-gioca-anticipi-e-posticipi-fino-alla-12a-giornata), consultata in questo intervento, indica G8 dal venerdì23 a domenica25 ottobre. Rimangono da riconfermare manifest completo/orari e comunicazioni successive, predisporre il piano specifico G8 e verificare fonte, registry e disponibilità temporale nella finestra utile. Il25 ottobre richiede attenzione al cambio di ora: niente UTC fissi ricavati dalla settimana precedente. Nessun ciclo G8 è stato avviato o forecast preparato. Le eventuali osservazioni provider, il freeze e le consegne richiedono autorizzazioni distinte. Nessun reset silenzioso delle coorti per nascondere la lacuna G7.

## Contratto B1

`scripts/lib/diagnostic-goals-b1/` definisce `goals-mapping-b1-v1`. Occorrono report privato, catalogo originale e snapshot fixtures/quote completo con hash identici ai link del report. L'adapter ricostruisce deterministicamente il report dagli stessi input, senza rete, e confronta identità e campi provider della selezione. Non inventa le informazioni mancanti.

Richiede stagione/giornata e insieme completo dei dieci fixture ID coerenti con il journal; il sottoinsieme progressivo eventualmente dichiarato rimane distinto dall'identità completa della giornata. Fixture, market e outcome ID, nomi, periodi, linee, player flag, coppia participant ID, casa/trasferta, kickoff, prezzo e stato devono corrispondere alla fonte. Duplicate quote o ID sorgente non unici, outcome ambigui e campi necessari mancanti sono rifiutati. Le normalizzazioni dei nomi squadra restano soltanto quelle già previste dal modello, senza inversione del ruolo home/away.

| Tipo | Identità accettata | Matematica e limiti |
|---|---|---|
| Doppia chance | FT, `doublechance`, nome esatto `Double Chance Full Time` o legacy `Double Chance`, non player, linea0, esiti catalogati con ID esatto | 1X/X2/12; il catalogo osservato usa **2X**. Solo la tabella esplicita2X→X2 traduce quell'esito nel target matematico equivalente. Il report e l'identità grezza restano2X. X1,21, label generiche o minuscole non accettate. |
| Totali FT | `totals`, `Over Under Full Time`, Over/Under e linea numerica esatta | Mezze/intere/quarti già supportati, range originale0–10; nessun alias per un mercato asiatico con un nome diverso. |
| Gol squadra | `teamtotals-team1` + `Over Under Team 1`; team2 + nomeTeam2 | team1 sempre home, team2 sempre away; soglia esatta, nessuno scambio implicito. |
| DNB | `drawnobet`, `Draw No Bet`, FT, linea0, esiti1/2 | Rimborso sul pareggio: push, non loss. Payoff/EV con probabilità di rimborso. |

Linee nulle o stringhe non convertite automaticamente, esiti non riconosciuti e periodi diversi sono esclusi. I payoff e le distribuzioni sono quelli del motore già registrato. Nessun nuovo modello, nessuna nuova soglia EV o ipotesi di indipendenza introdotta. Handicap, Multigol e score esatti non vengono aggiunti da B1.

Il mapping prova la corrispondenza della fonte, **non** la giocabilità su bet365 Italia. Le regole/ticket richiedono ancora attestazione umana specifica. Quote scadute, future, inattive o con problemi tecnici di provenienza/tempi non alimentano prezzo corrente, EV corrente o graduatoria B1; l'identità storica può essere ricostruibile senza rendere corrente il prezzo. Lo stato di validazione resta separato; `eligibleForSelector:false`, nessuna consegna Android.

Sul report storico riconfermato: 910 righe delle categorie B1,430 mapping verificati (30 doppia chance,180 totali FT,200 gol squadra,20 DNB),480 rifiutati per periodo/nome/payoff fuori ambito. Zero righe fresche al19 ottobre. Questa verifica non è un'acquisizione né una prova di prezzi attuali.

## Consultazione privata

La CLI preesistente mantiene il percorso A predefinito. L'estensione è esplicita e disponibile solo in modalità report, con file dentro `.local`:

```powershell
node scripts/multimarket-diagnostic.mjs --report --study STUDY --journal JOURNAL --odds-report REPORT --goals-b1 --catalog CATALOG --fixtures RAW_FIXTURES
```

Sono placeholder di input già esistenti, non un comando per acquisire quote o produrre nuovi forecast. Se manca un journal prospettico autentico non si ricostruisce ora quello G7 per poter eseguire il rapporto. L'output privato conserva `mappingB1` con ID, esito grezzo/canonico, fingerprint, ragioni e stato; il report registra anche l'identità del codice B1 e dell'adapter prestazionale A. JSON/HTML restano sperimentali e non sono pacchetti di proposta.

## Prove e prestazioni

Test su catena completa di fonti sintetiche, ID errati, hash alterati, periodi/linee, nomi esatti, duplicati, campi mancanti, inversione squadre, quotazioni inattive/scadute, source timestamp e CLI. Complementi O/U sulle mezze linee; push su linea intera; halfWin/halfLoss sui quarti; DNB in pareggio EV0; ruoli home/away distinti. Confronti di compatibilità A mantenuti senza tolleranze.

Benchmark sintetico sulla struttura delle14.414 selezioni reali, con catalogo/raw/report sintetici coerenti e40 griglie bootstrap già disponibili: B1 normale6,43s, picco343MiB; A predefinito4,52s, picco357MiB. B1 con report incompleto3,54s e duplicati7,32s (in concomitanza con la suite). Il caso incompleto rifiuta i mapping privi di conferma: il minor tempo non dimostra un miglioramento del caso completo. Tutti entro l'obiettivo60s; non sono SLA né validazione predittiva. Controller con timeout180s e conservazione privata degli esiti, senza worker orfani.

Suite completa: **302 test superati**, nessun fallimento, cancellazione o skip. Lint senza errori, con il solo warning preesistente `combinedPlayedOdd`; build Next/TypeScript completata. Il confronto integrale del payload A sulle 14.414 selezioni con l'artefatto finale della milestone A è identico, senza tolleranze numeriche. B1 modifica intenzionalmente soltanto il percorso diagnostico esplicito; i suoi nuovi mapping sono verificati contro i payoff del motore invariato.

Controllo finale: **3.393 file protetti preesistenti invariati**, sette nuovi file esclusivamente nei percorsi del controllo/valutazione G6. Verificati nuovamente journal, baseline e codice registrato v2; nessuna modifica nei moduli scientifici v1/v2 o nell'evaluator originale. La copia privata del sandbox e il vault cifrato corrispondono agli hash salvati durante il collaudo precedente; i tre export locali conservano gli stessi otto esperimenti e lo stesso storico. Questo verifica le copie locali, non uno stato aggiornato del telefono o del servizio cloud. Nessuna decifratura del vault.

## Chiusura del lotto e proposta B2

B1 termina con mapping e protezioni diagnostiche, non con una nuova famiglia validata. B2 suggerito: binding esterno degli handicap asiatici FT, dimostrando sullo snapshot il segno/lato della linea e le regole applicabili, con test di orientamento e liquidazione intera/mezza/quarta. Non dedurre l'orientamento né offrire un ticket ipotetico. Multigol/score esatti richiedono lotti ulteriori e prova dell'offerta effettiva. Nessun avvio B2–G, provider conteggiato, deploy, APK, task o giocata. Stake reale zero.
