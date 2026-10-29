# Risultati Serie A: ricognizione e integrazione separata

Verifica pubblica del 13 ottobre 2026, 20:32 UTC. Nessuna adozione automatica di una fonte alternativa, nessuna valutazione G6 anticipata. Dati, PDF e copie di ricerca restano privati; nel repository solo strumenti e documentazione.

## Problema Openfootball

La risposta pubblica è HTTP 200 e viene interpretata correttamente: 380 fixture, 50 risultati FT, ultimo risultato 20 settembre. Il commit JSON resta `e6744429ee395bc86f247348c6184bb08d4eb361`, del 22 settembre; SHA256 file `721a6c220fecb8208287e41401fa2fce652cd23765ce58a39bf98cdaa3d528ad`. Tutte le dieci fixture G6 hanno `score` assente. Otto hanno superato data+48h al momento della ricerca; le due del 12 ottobre superano tale soglia il 14 ottobre. Il 15 ottobre, se il file resta identico, saranno dieci pending.

Anche [upstream Italy](https://github.com/openfootball/italy/blob/48954d163c312aa705efacb64f771267031fe6eb/2026-27/1-seriea.txt) è fermo al commit del 21 settembre per il file stagionale. È evidenza di mancato aggiornamento della fonte, non un errore di lettura locale. Non è stata accertata la causa organizzativa del ritardo. [JSON fissato](https://github.com/openfootball/football.json/blob/e6744429ee395bc86f247348c6184bb08d4eb361/2026-27/it.1.json). Refresh non equivale a nuovi risultati; mantenere audit delle lacune.

## Confronto

| Fonte | Evidenza verificata | Ripetibilità e limiti | Esito |
| --- | --- | --- | --- |
| Lega Serie A, comunicati ufficiali | CU 47 del 13 ottobre, pagina 1: tutte le dieci gare G6, identità coerenti col journal; riserva di successive decisioni esplicita | Documento identificabile, bytes/hash e data, ma giorno di pubblicazione senza ora; successivi CU possono rettificare. Termini limitano estrazione e riuso | Autorità consigliata per riscontro ufficiale; feed subordinato a diritti verificati |
| Lega, calendario/Match Centre | Calendario dinamico anche vuoto o con gare passate ancora indicate upcoming nelle viste consultate | Nessuna API pubblica supportata verificata, pagine variabili, status non sufficiente per FT | Non adottato come scraper |
| football-data.org API v4 | Serie A italiana dichiarata nel Free Tier; risorse con ID, stagione, giornata, kickoff, status, score e lastUpdated | Account/accettazione termini, 10 richieste/minuto dichiarate, risultati ritardati; JSON grezzo archiviabile. Completezza G6 2026/27 **non verificata** con endpoint autenticato | Candidato consigliato per una prova automatizzabile separata, nessuna iscrizione/acquisizione eseguita |
| Football-Data.co.uk CSV | Download pubblici e aggiornamenti periodici dichiarati | Termini dichiarano restrizioni per bot/scraper/AI; CSV senza storico di pubblicazione di ogni risultato, date e alias da riconciliare | Non acquisito né adottato per automazione |
| RAI e siti giornalistici/club | Articoli recenti mostrano che risultati G6 esistono fuori da Openfootball | Notizie parziali, possibili rettifiche, nessun contratto di feed/riuso o copertura di dieci gare verificato | Solo ricerca/riscontro; nessun parser o dataset scientifico |

[CU 47](https://images.legaseriea.it/image/private/fl_attachment/prd/hvdturcnhbtepxu03mq7.pdf), collegato dalla [notizia ufficiale](https://www.legaseriea.it/serie-a/news/le-decisioni-del-giudice-sportivo-x9431); copia scaricata durante la ricerca, SHA256 `0b148c528be00a75f94c2a159f35ab49ca3d69020a9f207be2e4736fd3b42ba1`. Consultato visivamente e tramite estrazione locale per verificare il documento, senza scoring. Nessun risultato del PDF importato nel dataset o journal.

[Termini Lega](https://www.legaseriea.it/terms-and-conditions), versione 1 dicembre 2025: uso personale/non commerciale, diritti sui contenuti e consenso scritto per estrazione/uso (artt. 2.4, 5.1–5.2). La consultabilità gratuita non conferisce CC0 né autorizza un feed. Prima di integrare dati Lega chiarire il permesso applicabile; il consenso dell'utente a sviluppare il software non sostituisce quello della fonte. Nessuna ripubblicazione di PDF, loghi o dataset ufficiali.

[Copertura football-data.org](https://www.football-data.org/coverage), [prezzi](https://www.football-data.org/pricing), [termini](https://www.football-data.org/client/register), [match v4](https://docs.football-data.org/general/v4/match.html), [policy](https://docs.football-data.org/general/v4/policies.html). Richiede account per i match; attribuzione visibile richiesta, nessuna licenza CC0. `lastUpdated` indica aggiornamento del record, non prima disponibilità storica. Rinviate, sospese, annullate e `AWARDED` distinte da `FINISHED`; gare a tavolino non diventano gol sul campo. Verificare anche duration/fulltime, timezone, correzioni e conservazione consentita, senza attribuire alla fonte garanzie che i termini escludono.

[Football-Data.co.uk](https://football-data.co.uk/data.php) e [contatti/limiti](https://football-data.co.uk/contact.php): non è stato scaricato il CSV. Non raccomandato per questo agente/automazione sulla base delle restrizioni dichiarate.

## Confine implementato

`scripts/lib/prospective/source-review.mjs` è un modulo **offline di quarantena**, non un nuovo feed. Schema `lamultipla-supplemental-results-v1`: stagione/giornata, documento e URL/termini, bytes/hash, acquisizione UTC, pubblicazione opzionale, diritti con prova, entry con fixtureID, squadre canoniche esplicite, kickoff/data, stato, locator e revisione. Nessun fuzzy matching. Una dichiarazione del revisore non prova automaticamente la correttezza della trascrizione: controllare anche il documento grezzo.

La riconciliazione richiede manifest completo di dieci gare/venti squadre. Fonte senza diritti verificati, identità conflittuali, kickoff cambiato, stato non FT, duplicati e correzioni discordanti restano withheld/pending. Osservazioni precedenti e attuali si confrontano tutte, senza preferire arbitrariamente la più recente. Confronto opzionale con CC0: dissenso sospende il riscontro, non modifica il risultato originario. Conservare tutti gli snapshot e la catena di rettifiche; non sovrascrivere.

Output `lamultipla-supplemental-result-review-v1`, `cohortEligible:false`, `trainingEligible:false`, nessuna conversione al formato CC0. Acquisizione effettiva come limite conservativo di osservazione: non retrodatare a data della gara, pubblicazione senza ora o lastUpdated. Modulo testato con dati sintetici; nessun adapter autenticato, scraper Lega o evidenza originale autorizzata ammessa ancora.

## Passaggio successivo condizionato

1. Preferibilmente account gratuito football-data.org creato dall'utente e termini accettati per LaMultipla. Credenziale via percorso privato protetto, mai in chat/repository; prima prova separata di copertura G6 e stagione 2026/27, con risposta integrale, timestamp/hash e confronto ufficiale consentito.
2. Per feed Lega servono diritti di estrazione/riuso chiariti con la fonte. Nessun contatto inviato dall'agente.
3. Prima di usare una fonte alternativa per scoring: decisione metodologica esplicita, protocollo supplementare con esiti/correzioni/coorti predefiniti. G6 rimane valutazione originale CC0; eventuale analisi supplementare separata e identificata, non riscrittura della coorte preregistrata.
4. Training/forma futuri da nuova fonte richiedono studio separato di identità, copertura e point-in-time. Nessun innesto nel training ottobre: stesso cutoff 1 ottobre; G6 successiva al cutoff rimane esclusa anche per G7. La forma recente CC0 resta incompleta; non certificarne la completezza con una nuova data di download.
