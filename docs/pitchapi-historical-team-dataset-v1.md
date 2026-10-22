# PITCHAPI — HISTORICAL TEAM DATASET V1

22 ottobre 2026; base `2bff81b3589bfa6b1194aa5498bd000bffaeca7f`, branch `feature/oddspapi-private-import`, PR #2 in bozza.

**Implementazione e primo pilota completati. Archivio storico ancora parziale.** Nessun training, refit, forecast, aggiornamento scientifico o collegamento alla G8. Gratuità e conservazione privata sono quelle già confermate dall’utente; diritti e autorizzazione per training/refit restano separati. Non viene ripetuto l’audit commerciale.

## Architettura effettiva

Archivio privato in `.local/pitchapi/team-archive-v1/`, escluso da Git:

- `objects/<SHA256>.json`: bytes originali delle risposte, conservati senza riserializzazione. Scrittura esclusiva, verifica hash e sincronizzazione su disco.
- `observations/<SHA256>.json`: envelope verificabile con URL esatto, timestamp effettivo della precedente o nuova acquisizione, hash dei bytes, ricevuta e provenienza. L’importazione non modifica la data dell’osservazione originale.
- `views/<SHA256>.json`: proiezione ricostruibile offline contenente universo delle fixture, risultati e stati, osservazioni tradizionali e avanzate separate, disponibilità per fixture/endpoint, matrici di qualità per stagione e revisioni. Include hash del normalizzatore, parser e dizionari utilizzati. Nessun puntatore “latest” sovrascritto.
- `plans/<SHA256>.json` e relativo manifest privato leggibile: fixture, squadre, kickoff, stagione ed endpoint esatti, ordine, regola di campionamento, legame alla vista di partenza e budget.
- `acquisition/`: estensione del framework PitchAPI già esistente, con grant immutabili, intent scritti prima della rete, bytes e ricevute. Nessun nuovo client OddsPapi o scheduler.
- `batches/<grant SHA256>/`: checkpoint immutabili per richiesta e rapporti delle esecuzioni. Una ricevuta già presente permette il recupero dell’importazione o del checkpoint senza nuova acquisizione.

Gli oggetti sorgente precedenti non vengono spostati, cancellati o modificati. Il content addressing evita copie ripetute dello stesso oggetto nell’archivio. Le viste separano identità, risultato dichiarato dal provider e misure: un endpoint `/stats` o `/advanced` che non ripubblica stagione, kickoff o punteggio non viene presentato come riconferma indipendente di quei campi.

`finished` e il punteggio dell’elenco non attestano da soli durata regolamentare, assenza di decisioni amministrative o liquidazione di un mercato. Durata regolamentare verificata: false; informazioni amministrative e HT non esplicite: null. I valori originali restano disponibili.

Lo spareggio Spezia–Verona 2022/23 conserva ID distinto, scope `POSTSEASON_NEUTRAL_PLAYOFF` e campo neutro verificato. È separabile dal campionato ordinario; nessun vantaggio casalingo viene attribuito automaticamente. Per gli altri incontri il campo neutro non documentato rimane ignoto, non false.

## Riutilizzo e universo

Importate **45 risposte già verificate**, senza rete: sette elenchi, 20 `/stats`, 18 `/advanced` (nove disponibili e nove `ANALYTICS_UNAVAILABLE`). Eventi, giocatori e lineup non vengono importati in questo archivio di squadra né richiesti nuovamente. I vecchi grant restano chiusi e invariati.

| Stagione | Fixture elencate | Candidate concluse | Stats archiviate | Advanced disponibili | Advanced indisponibili già osservate |
|---|---:|---:|---:|---:|---:|
| 2021/22 | 380 | 380 | 11 | 0 | 3 |
| 2022/23 | 381 | 381 | 11 | 0 | 3 |
| 2023/24 | 380 | 380 | 11 | 0 | 3 |
| 2024/25 | 380 | 380 | 11 | 7 | 0 |
| 2025/26 | 380 | 380 | 11 | 7 | 0 |
| 2026/27 | 380 | 70 | 13 | 7 | 0 |
| **Totale** | **2.281** | **1.971** | **68** | **21** | **9** |

Il 2022/23 comprende 380 gare ordinarie e uno spareggio; le 11 stats comprendono dieci gare ordinarie e lo spareggio. Totale ordinario: 1.970 candidate, 67 stats. Le 310 fixture non concluse della stagione corrente rimangono identità di calendario, non campioni disputati; G8 è esclusa dall’acquisizione.

Universo e stati derivano dagli elenchi già osservati: questa attività non riconferma online nuovi cambi di calendario. I numeri delle statistiche sono copertura effettivamente acquisita, non percentuali inferite per l’intera stagione.

## Pilota reale autorizzato

**60 richieste pianificate e inviate, 60 HTTP 200, zero retry, zero ambigue, zero pending nel lotto.** Nessun altro endpoint: **48 `/stats` + 12 `/advanced`**. Credenziale DPAPI esistente, mai esportata o pubblicata.

Regola `EQUAL_CHRONOLOGICAL_STRATA_MIDPOINT_OF_UNSEEN_V1`: per ciascuna stagione ordinare le fixture concluse non già acquisite per kickoff UTC e ID ASCII; dividere in otto strati e scegliere il punto centrale di ogni strato. Selezionare quattro delle otto nuove gare nelle sole stagioni dal 2024/25 per advanced, con la stessa regola. Nessuna selezione basata su valori, punteggi o completezza statistica; nessuna sostituzione dopo la risposta.

Manifest esatto sigillato prima della prima trasmissione, SHA256 `0b199d41ba90ebaf046a7e61c8e8eefedf00f0e484b553dc9b21a48b69c4e79f`. Autorizzazione registrata con provenienza dal messaggio esplicito dell’utente e orario effettivo di registrazione; non viene attribuito un orario inventato al suo invio originale. Evidenze operative in `.local/preparation/pitchapi-archive-20261022/`.

Prima risposta: `2026-10-22T08:46:26.733Z`; ultima: `2026-10-22T08:46:41.325Z` (10:46 Europe/Rome). Esecuzione locale complessiva circa 16 secondi: osservazione del pilota, non SLA o stima garantita per l’intero archivio.

Nel nuovo lotto: **47 VALID_COMPLETE, 13 VALID_PARTIAL**; i 12 advanced sono completi per il contratto principale, quindi le 13 risposte parziali sono tradizionali. Nessun conflitto di identità, schema o controllo aggregato bloccante. Le ambiguità restano registrate.

Non sono stati riacquisiti i 38 dettagli precedenti o i sette elenchi: 20 stats e 18 advanced riutilizzati, inclusa la prova negativa delle nove indisponibilità. Non vengono spese le richieste risparmiate per ampliare il lotto oltre 60.

## Qualità e missingness realmente osservate

Tradizionali: **68 partite, 136 team-cell FT per metrica**. Corner, tiri totali/nello specchio/fuori/bloccati, possesso tradizionale, falli, fuorigioco, rossi aggregati, passaggi, passaggi precisi, parate e cinque misure xG del dizionario hanno valori numerici in 136/136 celle FT. Un conteggio zero esplicito rimane zero; non è ottenuto da null o omissioni.

Gialli: **120/136 celle FT non ambigue; 16/136 ambigue** per rappresentazioni duplicate discordanti, ad esempio zero numerico in un gruppo e stringa vuota in un altro. Si conservano tutte le osservazioni e i percorsi: nessuna scelta silenziosa della rappresentazione più favorevole. Espulsioni dirette e seconde ammonizioni restano semanticamente non distinguibili dai rossi aggregati: 136/136 celle per sottotipo non verificate, non zero.

Totale matrice FT dei 21 locator: 2.856 celle = 2.326 VALUE, 242 ZERO, 288 AMBIGUOUS (272 sottotipi rossi non verificati + 16 gialli). Nell’insieme dei 68 incontri: 52 risposte tradizionali complete per il contratto verificato e 16 parziali. COMPLETE esclude dalla pretesa di verifica i due sottotipi rossi non documentati.

| Stagione | Periodo All | FirstHalf | SecondHalf |
|---|---:|---:|---:|
| 2021/22 | 11/11 | 0/11 | 0/11 |
| 2022/23 | 11/11 | 3/11 | 3/11 |
| 2023/24 | 11/11 | 11/11 | 11/11 |
| 2024/25 | 11/11 | 11/11 | 11/11 |
| 2025/26 | 11/11 | 11/11 | 11/11 |
| 2026/27 | 13/13 | 13/13 | 13/13 |

Per il 2022/23 i tre periodi parziali osservati riguardano due gare ordinarie e lo spareggio: fra le sole ordinarie, 2/10. Periodo disponibile non significa automaticamente ogni campo valorizzato; la matrice conserva i singoli stati. Nessuna ricostruzione forzata dell’HT. Zero anomalie dei controlli eseguiti su somme dei periodi, partizione dei tiri e possesso entro la tolleranza già prevista; non è una certificazione esterna della correttezza di tutti i conteggi.

Sono inoltre censite **19 chiavi tradizionali fuori dal dizionario consolidato**, fra cui clearances, intercetti, duelli, cross precisi, lanci lunghi, tiri dentro/fuori area, grandi occasioni e tocchi nell’area avversaria. L’inventario normalizzato mantiene ogni chiave esatta, periodo, lato, rappresentazione, valore interpretabile e percorsi dei duplicati. Semantica non verificata significa `UNMAPPED_SEMANTICS_NOT_ADMITTED`: nessun alias inventato e nessuna ammissione automatica alle feature. Tutto il contenuto rimane nei bytes originali.

Advanced: **21 partite, 42 team-object**, sette per ciascuna delle tre stagioni recenti. Tutti i 64 campi principali hanno valore numerico: **2.688 celle = 2.527 VALUE + 161 ZERO**, zero null/omissioni nei campi principali del campione disponibile. I due metadati opzionali già noti (`press_zone_fraction`, `possession_method`) sono omessi in **84/84 celle**. Le nove risposte storiche senza analytics restano indisponibilità dell’endpoint, non valori null/zero delle metriche. Nessun advanced precedente al 2024/25 richiesto nel nuovo lotto.

VAEP/PV conservano valori e residui delle decomposizioni senza scegliere una convenzione di segno/baseline non chiarita. xT, VAEP, PV e xG restano metriche modellate dal fornitore, con versione del modello sorgente ignota. Possesso tradizionale e pass-share avanzato restano campi distinti; cross non sommati ai passaggi già inclusivi, chances_created non sommato al suo alias key_passes.

## Ripresa, revisioni e arresti

Un solo lock dell’archivio coordina import, piano, viste e acquisizione; viene riutilizzato il lock locale esistente. Ogni tentativo conta dal suo intent, anche se la risposta non arriva. Un intent senza ricevuta blocca ogni richiesta successiva: nessun retry, salto o rinnovo automatico del grant. Autenticazione, rate limit, identità, schema, dominio numerico e incoerenze bloccanti fermano il lotto. Un 404 advanced esattamente `ANALYTICS_UNAVAILABLE` è un’osservazione negativa esplicita che consente di proseguire.

Un crash dopo la ricevuta e prima del checkpoint è recuperabile dalla ricevuta verificata. Bytes parziali o alterati non vengono sovrascritti: il sistema si ferma e conserva la diagnostica per una decisione esplicita. Grant, ordine e budget restano quelli originari; la ripresa non rinnova l’autorizzazione.

Due osservazioni dello stesso endpoint rimangono distinte. La vista segnala `REVISION_REQUIRES_REVIEW` e non sceglie automaticamente “l’ultima”. Cambiamenti contraddittori fra elenchi vengono conservati come osservazioni sorgente e bloccano l’assemblaggio dell’universo. Il prototipo verifica questa gestione offline; **non include una policy attivata di riacquisizione delle revisioni**. Il percorso attuale evita la riacquisizione di URL completati.

Le 60 ricevute reali sono state rigiocate con rete e accesso alla chiave vietati: **60 riusi, zero chiamate, zero letture della chiave**. Due ricostruzioni consecutive dai raw hanno prodotto la stessa vista. Nessun processo di acquisizione lasciato in esecuzione.

## Comandi presenti e collaudati

Da `C:\LaMultipla`, operazioni locali senza rete:

```powershell
node scripts/pitchapi-archive.mjs import-existing
node scripts/pitchapi-archive.mjs rebuild
node scripts/pitchapi-archive.mjs plan --stats-per-season 8 --advanced-per-recent-season 4
```

`plan` prepara soltanto un nuovo manifest e non autorizza né esegue richieste. Ogni piano futuro richiede un nuovo consenso preciso; il piano del pilota è ormai esaurito. Il comando reale utilizzato per questo singolo lotto è:

```powershell
node scripts/pitchapi-archive.mjs run --grant .local/preparation/pitchapi-archive-20261022/pilot-grant.private.json --batch-size 60
```

Non eseguirlo come procedura periodica. `--batch-size` limita le nuove risposte completate per invocazione, entro l’ordine e il tetto del grant; una richiesta ambigua arresta comunque il processo e conta come intent consumato. Il default è una sola richiesta. Nessuna credenziale è passata negli argomenti.

## Completamento futuro e impiego predittivo

Sull’universo già fissato restano **1.903 `/stats` e 809 `/advanced` recenti non osservati: 2.712 endpoint**. Sarebbero 46 ulteriori lotti da massimo 60, l’ultimo ridotto, previa autorizzazione; non vengono avviati. Prima: review del pilota, approvazione dei manifest incrementali e dei limiti di frequenza, quindi progressione per stagione/periodo con gli stessi checkpoint. Nessuna nuova richiesta advanced sulle stagioni precedenti senza motivazione e consenso separati. Un aggiornamento del catalogo corrente costituirà un’altra operazione autorizzata, non una conseguenza di `rebuild`.

L’archivio distingue tradizionali a storico lungo e advanced recente. Future feature rolling, casa/trasferta e per avversario dovranno usare solo incontri precedenti e osservazioni effettivamente disponibili prima del cutoff. Le statistiche del target non possono essere sue feature. Acquisizioni effettuate oggi non provano disponibilità negli anni precedenti; un backtest che non dispone delle osservazioni storiche dovrà dichiarare questa limitazione, non spostarne i timestamp al kickoff.

Nessun peso, modello corner/cartellini/tiri, training o refit introdotto. Lo sviluppo dei challenger richiede diritti pertinenti, protocollo temporale, controlli di esposizione/missingness e confronti prospettici separati. L’acquisizione riuscita non valida un modello né autorizza mercati nel selettore.

## Verifiche tecniche e integrità

15 nuovi test dell’archivio; 31 test mirati con i moduli PitchAPI esistenti. Coperti: identità/stagioni, fixture future, campo neutro, campionamento, tetto 60, endpoint esclusi, null/zero/omissioni, gialli ambigui, periodi, raw alterati, revisioni, offline/restart, lock concorrenti, auth/rate limit, errori di schema e riflessione delle credenziali.

Suite completa: **439/439**. Lint: zero errori, solo warning preesistente `combinedPlayedOdd`. Build Next/TypeScript completata. Dettagli privati nei log dell’incarico. Solo codice, test e questa documentazione vengono pubblicati; snapshot, manifest con payload reali, grant e credenziale rimangono in `.local`.

Controllo integrità: **3.400 originali invariati**, dieci file di controllo (approvazioni/piano G8, ledger OddsPapi e cifrato PitchAPI) invariati, 54 vecchie ricevute e relativi raw invariati. Nessun OddsPapi, forecast G8, modifica scientifica, scheduler, Firebase, Android, deploy o scommessa. Stake reale zero. PR #2 mantenuta in bozza; commit e CI sono riportati nella consegna finale.
