# Cornerflick: verifica dal PC Windows

Ricerca del13 ottobre2026, iniziata21:16 UTC/23:16 Europe/Rome, checkout `C:\LaMultipla`, base `e2e050d58796cc56a08255fdac1e8fff2ae7594f`. Solo documentazione pubblicabile. Risposte grezze, header/hash, confronto con documenti ufficiali e checkpoint conservati in `.local/preparation/cornerflick-20261013/`, esclusi da Git. Nessun dato importato nei modelli/journal o valutazione scientifica anticipata.

## HTTP effettivo

Richieste GET dal Windows, senza cookie/account/chiave, UA identificativo di ricerca, timeout20 secondi, catene redirect registrate. Nessun aggiramento di protezioni.

| URL Cornerflick | Esito | Risposta osservata |
| --- | --- | --- |
| `/football/leagues/serie-a/results` | 200, nessun redirect | HTML190528 byte, pagina risultati effettiva, nessuna challenge rilevata |
| `/football/leagues/serie-a/results/season.json` | 200, nessun redirect | `application/json; charset=utf-8`,43053 byte, JSON parsabile |
| `/football/leagues/serie-a/results/season.csv` | 200, nessun redirect | `text/csv; charset=utf-8`,20020 byte, CSV parsabile con campi quotati |

JSON SHA256 `f282bf8bb398d04c0b1f1f112d3992b901d53baed395c346cc3914cabc9cc4e0`; CSV SHA256 `fc37fb160de83bd0b9840b4742f187e77be9dc577f79f2130d2bda6c368579db`. Sono hash dell'osservazione locale, non indirizzi di snapshot riacquisibili. HTTP senza ETag/Last-Modified, `cache-control: public, max-age=0`, server Vercel. Disponibilità e assenza di CAPTCHA osservate in questa sessione, non garantite in futuro.

Il successivo [robots.txt](https://cornerflick.com/robots.txt) vieta `season.csv` e le risorse `data.json`/CSV delle singole partite. Non vieta il JSON stagionale. Il CSV è stato richiesto una sola volta prima di leggere robots; dopo il riscontro nessuna nuova richiesta CSV e nessuna richiesta ai record per partita vietati. Robots non è una licenza o prova di diritti.

## Schema, stagione, G6 e storico

JSON: oggetti `meta`, `competition`, array `matches`; sessanta ID distinti. Metadata: publisher, fonte dichiarata `api-football`, licenza/attribuzione, `generated_at`, `last_updated_at`, copertura22 agosto–12 ottobre2026 e count60. Competizione italiana Serie A identificata, ma **nessun campo season esplicito**, né nei metadata né nelle entry:2026/27 compatibile con date e calendario esterno, non autocertificata dal feed.

Entry con ID/slug, kickoff con offset UTC, nomi/slug casa e ospite, home_score/away_score, status, venue/referee e link. Tutte le60 osservate hanno `finished`. Giornate3–6: dieci entry ciascuna; venti entry precedenti non hanno né `matchday` né `round`, mostrate come Other matches. Non attribuire G1/G2 dal solo ordinamento. CSV:60 righe, stessi ID/kickoff/score del JSON; mancano stagione, status e metadata temporali/licenza incorporati.

CU47 originale locale riletto e hash verificato (`0b148c528be00a75f94c2a159f35ab49ca3d69020a9f207be2e4736fd3b42ba1`): tutte le dieci coppie casa/ospite G6 e i dieci punteggi coincidono. Kickoff e date coincidono nei dieci casi col manifest originale G6 riscontrato sul CU24. Alias espliciti, nessun fuzzy matching; mappa uno-a-uno ai fixtureID originali. Solo confronto, nessuno scoring o importazione. Fonte ufficiale [CU47](https://images.legaseriea.it/image/private/fl_attachment/prd/hvdturcnhbtepxu03mq7.pdf).

Il JSON aggregato non dichiara periodo90 minuti, score separati per supplementari/rigori, FT del provider o distinzione delle assegnazioni a tavolino. Nei documenti G6 consultati non emerge un tale caso; il CU47 conserva la riserva di possibili decisioni successive. Non equiparare quindi `finished` a prova universale di risultato sul campo definitivo. Nessun caso reale di rinvio/annullamento/rettifica provato; non inventare una copertura delle fixture non concluse, che questo endpoint potrebbe omettere.

Le cinquanta gare precedenti sono state confrontate con il dataset CC0 originale:50/50 identità/date/punteggi coincidenti. L'archivio Cornerflick osservato contiene solo sessanta gare2026; nessun endpoint documentato per selezionare stagioni precedenti individuato nei link della pagina. Non è provata copertura storica pluriennale e non sono stati tentati parametri o percorsi inventati.

## Tempi e affidabilità

`generated_at=2026-10-13T21:16:31+00:00`, `last_updated_at=2026-10-13T21:00:05+00:00`: metadata presenti e coerenti con l'acquisizione. G6 del12 ottobre inclusa, a differenza di Openfootball. Un timestamp di refresh non dimostra quando ogni risultato sia comparso o sia stato corretto. Nessun timestamp di prima pubblicazione/aggiornamento per entry, né revision ID o endpoint immutabile, trovato nell'aggregato.

La [pagina dati](https://cornerflick.com/data) dichiara note datate per rettifiche, ma nei file osservati non è stata verificata una rettifica reale. Singola osservazione: nessuna misura di cadenza, latenza FT, uptime, tasso di errori o continuità. ID incorporano squadre/data: rinvio o correzione di nome/data potrebbe cambiare identità; occorre una crosswalk esplicita versionata, non deduplica silenziosa. Dipendenza Cornerflick/API-Football, nessun SLA verificato.

## Diritti e decisione

[Open data](https://cornerflick.com/data) dichiara CC BY4.0 per la compilazione, con credito/link «Data by Cornerflick — cornerflick.com», e distingue i diritti dei fornitori sottostanti. [Termini](https://cornerflick.com/terms), aggiornati29 maggio2026, limitano scraping/harvesting/bulk-download salvo quanto consentito dalla legge e concedono accesso personale non commerciale. Rimane da chiarire come l'offerta open-data si coordini con questi limiti per un'acquisizione automatica periodica; non si conclude che ogni riuso sia vietato o autorizzato.

[API-Football](https://www.api-football.com/terms) è il fornitore dichiarato: non garantisce dati/aggiornamenti e lascia all'utilizzatore la verifica di ulteriori diritti d'uso/pubblicazione. Non verificato il contratto del ripubblicatore. Nessuna chiave/account o accesso diretto API-Football eseguito, nessun contatto inviato.

**Decisione: fonte di confronto promettente; non adottata come primaria o feed supplementare automatico. Nessun adapter implementato.** Bloccano diritti non sufficientemente chiariti e contratto incompleto per stagione/periodo/stati eccezionali. Per rivalutare: chiarimento di utilizzo JSON periodico privato, schema/season espliciti, semantica FT e rettifiche, osservazioni prospettiche non invasive autorizzate con snapshot immutabili. Gli strumenti di quarantena esistenti restano separati; Cornerflick non è ancora fonte ammessa nel loro allowlist.

## Alternative realmente interrogate

- [OpenLigaDB](https://www.openligadb.de/): API anonima, dati ODbL. `https://api.openligadb.de/getmatchdata/seriea/2026` dal PC:200 JSON `[]`. Catalogo `getavailableleagues`:200,837 entry; candidate italiane individuate solo stagioni precedenti, nessuna Serie A2026 identificata. Non basta l'endpoint vuoto per provare un'assenza assoluta, ma non è copertura utilizzabile G6.
- [CSV pubblico engsoccerdata](https://raw.githubusercontent.com/jalapic/engsoccerdata/master/data-raw/italy.csv):200 senza account,28824 righe/94 stagioni,6 ottobre1929–25 maggio2025; nessuna riga2026. Snapshot di ricerca conservato, non integrato; diritti del dataset non promossi automaticamente dalla sola pubblicità del repository.
- `footballcsv/italy` non è un feed italiano corrente: repository risolve ora a `footballcsv/spec`, README di specifica. Zafronix e football-data.org richiedono chiave/account: non usati in questo incarico. Openfootball mantiene la fonte originale CC0, senza nuovi risultati G6 attestati da questa ricerca.

Non è stata trovata e certificata un'alternativa che soddisfi contemporaneamente aggiornamento G6, nessun account/chiave/costo, contratto e diritti chiari. Non presentare gli endpoint storici/vuoti come soluzione del blocco.

## Continuità e sicurezza

Verifica effettuata **prima** della ricerca: gli strumenti nativi disponibili espongono cron/heartbeat ricorrenti; la [documentazione ufficiale consultata](https://learn.chatgpt.com/docs/automations?surface=app) non stabilisce un contratto locale una tantum verificabile con questi strumenti. Nessuna attività creata: trigger14 ottobre00:51 Europe/Rome **non supportato affidabilmente nelle capacità esposte**, non registrato. Nessun RRULE ricorrente, task Windows sostitutivo, script che avvia agenti o workaround dei limiti.

Checkpoint privato con avanzamento, file/risposte, risultati, passi mancanti e prompt di ripresa. Una ripresa deve leggere il checkpoint, controllare Git/processi, saltare attività concluse e fermarsi se `status:complete`. Non riavviare un lavoro terminato. Questo checkpoint non pianifica alcuna esecuzione.

Originali G6, baseline, training e valutazione CC0 del15 invariati. Nessun OddsPapi, task motore, deploy, main merge, pubblicazione schedine o APK. Stake reale zero.

Controlli conclusivi sul PC: JSON/CSV/confronti mirati sopra descritti; suite263/263 senza skip, lint zero errori (warning preesistente `combinedPlayedOdd`), build Next/TypeScript riuscita. Nessun test sintetico nuovo: nessun adapter o codice funzionale modificato. Hash di journal/baseline G6 e tutte le entry originali ricontrollati, nessuna valutazione eseguita. Solo questo rapporto pubblicabile, nessuna risposta acquisita o tabella di risultati nel commit.
