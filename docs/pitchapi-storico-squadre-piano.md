# PitchAPI — piano storico e dati per modelli di squadra

Aggiornamento successivo: [audit avanzati di squadra v1](pitchapi-advanced-squadre-v1.md), lotto separato di 18 richieste concluso il 21 ottobre. Conservazione privata ora confermata dall'utente; training/refit restano distinti e sospesi. La precedente verifica lineup G8 è conclusa e non viene ripetuta. Le formazioni sono contesto facoltativo, non prerequisito dei modelli originali.

Base `e310f111b06c94f2baf60776655851fc6bb37a41`,21 ottobre2026. **Prova autorizzata conclusa: cinque elenchi,17 stats e due lineup;24 nuove richieste HTTP200. La lineup prepartita G8 non contiene titolari, riserve o modulo utilizzabili. Nessuna richiesta pending e nessun retry.** La gratuità senza trial/contingente è confermata personalmente dall'utente nella dashboard; non viene ripetuto l'audit commerciale. Restano separati accesso, conservazione e diritti di training/refit.

## Direzione e protezione degli originali

Priorità operative: famiglia gol/risultato, poi corner, cartellini, falli e tiri **di squadra/partita**, secondo offerta e validazione. Mercati sui singoli giocatori esclusi dalla roadmap operativa attuale. I dati individuali rimangono candidati per feature di squadra, senza introduzione automatica nei modelli.

G8 resta indipendente; nessun forecast, cambio di cutoff, modello, coorte, journal, selettore, studio, task, deploy o consegna. I3.400 file protetti sono stati ricontrollati e risultano invariati.

## Riutilizzo e campionamento fissato prima dei nuovi dati

Gli snapshot già verificati contengono380 incontri2025/26 e70 conclusi2026/27, con ID unici e20 squadre per elenco. Sono elenchi `status=played`: non provano l'assenza di rinvii, gare future o stati amministrativi esclusi dal filtro. Restano disponibili anche tre stats/eventi/players della prima prova; nessuna richiesta verrà ripetuta per ottenere gli stessi dati.

Regola versionata `CHRONOLOGICAL_FIRST_LOWER_MIDPOINT_LAST_V1`: ordinare le gare concluse per kickoff UTC e, a parità, ID con ordine lessicografico esplicito; scegliere gli indici0, floor((N−1)/2), N−1. Per la stagione corrente il frame è costituito dalle70 gare concluse già osservate, non dalle future G8. Per le quattro stagioni mancanti il frame verrà sigillato alla prima acquisizione. Nessuna sostituzione perché mancano statistiche o il risultato non è interessante. Duplicati/identità invalide bloccano il piano; coppie casa/trasferta ripetute sono anomalie da riconciliare, non righe da cancellare.

I sei campioni già determinabili e gli endpoint esatti sono nel piano privato `.local/preparation/pitchapi-history-20261021/discovery-proposal.private.json`. Per2025/26 sono i ranghi1/190/380; per2026/27,1/35/70. La statistica del rango1 del2025/26 è già disponibile e sarà riusata. Gli ID delle altre dodici gare non sono ancora noti: non vengono inventati per chiedere un'autorizzazione apparente.

## Autorizzazione in due passaggi

**Primo passaggio proposto: cinque GET di elenco**, base esclusiva `https://api.pitchapi.dev` e lega italiana già verificata `l_0ALvwF`:

| N. | Endpoint esatto | Scopo |
|---|---|---|
|1|`/v1/leagues/l_0ALvwF/matches?season=2021%2F2022&status=all`|Elenco mancante2021/22|
|2|`/v1/leagues/l_0ALvwF/matches?season=2022%2F2023&status=all`|Elenco mancante2022/23|
|3|`/v1/leagues/l_0ALvwF/matches?season=2023%2F2024&status=all`|Elenco mancante2023/24|
|4|`/v1/leagues/l_0ALvwF/matches?season=2024%2F2025&status=all`|Elenco mancante2024/25|
|5|`/v1/leagues/l_0ALvwF/matches?season=2026%2F2027&status=all`|**Una richiesta di riserva motivata prima dell'uso:** identificare fixture G8 per una futura lineup prepartita e controllare gli stati non restituiti dal vecchio filtro played|

Nessun catalogo ripetuto. I quattro elenchi mancanti sono acquisizioni singole, non download dello storico dettagliato. La quinta non duplica la vecchia query: cambia il filtro per includere gare non concluse. Nessuna paginazione, retry, fallback di stagione o uso automatico della riserva. Arresto su errori, risposte ambigue o identità contraddittorie.

**Secondo passaggio, ancora da presentare e autorizzare:** pubblicare all'utente il manifest esatto delle18 fixture con nome, ID, kickoff e `/stats`; riusare la risposta già ottenuta, quindi al massimo17 nuove stats. Proporre due `/lineups`: una sul campione G6 già noto e una su una fixture G8 rigorosamente riconciliata con il manifest ufficiale. Nessun nuovo `/players`, `/events` o `/advanced` incluso. Se una diversa combinazione è necessaria, motivarla prima dell'uso.

Budget previsto **5+17+2=24 nuove richieste**, con6 non allocate e **tetto complessivo30**. Le6 non sono autorizzate implicitamente dal piano. Il vecchio lotto12 rimane separato e immutabile. Ogni fase avrà autorizzazione/manifest/hash, contatore condiviso di questo incarico, intent e ricevute; un esito ambiguo conta nel budget e blocca i successivi invii. La conferma del primo passaggio non autorizza il secondo.

## Obiettivo specifico delle formazioni

La [documentazione PitchAPI](https://pitchapi.dev/) distingue `confirmed`, `lineup_type`, modulo, titolari e riserve; una previsione può essere disponibile entro48h dal kickoff. Non sono documentati un timestamp di pubblicazione/modifica della lineup o endpoint dedicati a infortuni e squalifiche. `position_id` dei titolari è uno slot nello schieramento, mentre quello dei subentranti ha un'altra semantica: non viene usato come ruolo universale.

Queste sono dichiarazioni di schema, **non evidenze prepartita osservate**. Una lineup passata non certifica quando fosse consultabile. La richiesta prepartita G8 andrà eseguita soltanto dopo conferma del target, autorizzazione e ingresso nella finestra documentata; un'assenza non dà diritto a retry. Per Torino–Monza23/10 ore20:45 Europe/Rome,48h prima è21/10 ore20:45: nessuna disponibilità garantita a quell'ora.

Registrare separatamente: osservata prima del freeze con `confirmed=false`; confermata prima del kickoff; acquisita a partita conclusa. Un flag `confirmed=true` letto oggi su una gara passata non la rende informazione disponibile prima del suo freeze. La formazione ufficiale pubblicata dopo il freeze rimane inammissibile per quel forecast anche se precede il kickoff. Non introdurre queste feature nel riferimento G8.

## Matrice da produrre dopo la prova

Per stagione separare: fixture elencate, concluse, campioni pianificati, tentati, ricevuti, identificati e valutabili. Per ogni statistica contare entrambe le squadre e ciascun periodo, distinguendo valore nonzero, zero esplicito, null, omissione, ambiguità e non applicabilità. Denominatore primario per un campo FT:6 celle team per stagione (3 incontri×2), anche se una risposta fallisce; periodi separati. Le percentuali sono **campionarie**. Non stimano una probabilità di copertura stagionale, perché i tre punti temporali non sono un campione casuale.

Controlli: leghe/stagioni, ID e casa/trasferta, calendario, stati, duplicati e coppie ripetute; confronto dei punteggi con osservazioni già ammesse senza riscriverle; semantica periodo/unità, somme dei conteggi applicabili, percentuali e arrotondamenti separati, chiavi ripetute equivalenti rispetto a conflittuali. Punteggio HT, rosso diretto, secondo giallo e stato amministrativo non saranno derivati da campi insufficienti. Per stats/eventi/player restano distinti ambiti e tassonomie. xA e xAG non intercambiabili.

## Dati individuali come feature di squadra

Il primo lotto players rimane un'evidenza parziale:147 righe, ruolo null per tutte, minuti assenti in51. Valori omessi non diventano zeri o assenze dal campo. Un contributo offensivo mancante non equivale a nessun contributo. I nuovi `/lineups` servono anche a verificare il join fixture/team/player, titolari e riserve, senza imputare ruoli/minuti.

Candidati da confrontare in futuri challenger: continuità e copertura dei minuti osservati; tassi gol/xG/tiri/passaggi/occasioni e contributi difensivi rapportati a esposizione verificata; contributi dei soli probabili titolari quando la lineup era già osservata; cambi nella formazione rispetto a precedenti osservazioni prepartita. Tassi con denominatore nullo restano indefiniti; insiemi incompleti conservano coverage e missingness. Nessuna somma di xG+xA o chiavi duplicate senza semantica; nessun ruolo ricostruito dal nome.

Nessun peso causale o coefficiente tattico manuale. Eventuali finestre di forma, shrinkage o pesi per minuti saranno scelti sul development temporalmente separato, preregistrati e confrontati con baseline/reference su eventi futuri comuni. Ablation delle feature, calibrazione e intervalli; conservare anche risultati negativi e correggere la molteplicità dei confronti. Il ruolo è una feature possibile, non un requisito universale per ogni modello.

## Osservazioni prepartita e futuro ciclo autonomo — specifica, non attivazione

Nuovo namespace diagnostico, append-only: observationId, fixture/team/player ID, URL e versione fonte, hash dei bytes, observedAtUtc, sourcePublishedAtUtc/sourceUpdatedAtUtc solo se forniti, confirmed/lineup_type, campo/stato/confidenza, validUntilUtc secondo policy approvata, predecessorHash/revision. L'orario di acquisizione è sempre reale; nessuna retrodatazione. Vista point-in-time al freeze: solo osservazioni già acquisite, disponibili e non scadute; mancanza di timestamp fonte non viene colmata usando il kickoff.

Usare gli stage del `research-cycle.mjs` e lock/intent già esistenti: acquisizione autorizzata → QC/quarantena revisioni → osservazione immutabile → candidato dataset ammesso → valutazione di forecast già congelati → review → eventuale refit registrato → preparazione giornata. Prepartita: acquisizione pianificata autorizzata → join/QC/freschezza → snapshot al cutoff; eventuali cambi creano nuove osservazioni e non riscrivono il passato. Nessun secondo scheduler, nessun trigger o API ricorrente attivati.

Diritti da chiarire prima di produzione/training: snapshot duraturi, analisi probabilistiche private con confronto quote, training/refit, automazione, attribuzione/upstream e uso dopo cessazione. Gratuità non equivale a questi permessi. Nessuna acquisizione pluristagionale dettagliata proposta come automaticamente autorizzata.

Il modulo offline `pitchapi-history-plan.mjs` e i relativi test rendono riproducibili selezione, controlli e budget proposto; non importano chiavi né eseguono rete. Il rapporto conclusivo e la roadmap saranno aggiornati dopo la prova autorizzata, distinguendo osservato/documentato/non verificato.

## Primo passaggio — riscontro reale

Autorizzazione esplicita dell'utente: «Autorizzo le5 richieste di elenco». Eseguite esattamente le cinque URL sopra, tutte HTTP200 JSON con `data`, senza errori applicativi, retry o paginazioni. Nessun nuovo stats/lineup/event/player/advanced. Snapshot e ricevute temporanee, separati dal lotto precedente, in `.local/preparation/pitchapi-history-20261021/acquisition/`.

| Stagione | Elencate | Concluse | Altri stati osservati | Riscontro con dati già ammessi |
|---|---:|---:|---|---|
|2021/22|380|380|Nessuno|380 date e punteggi concordi|
|2022/23|381|381|Nessuno|380 gare ordinarie concordi;1 spareggio separato|
|2023/24|380|380|Nessuno|380 date e punteggi concordi|
|2024/25|380|380|Nessuno|370 concordi;10 senza corrispondenza nel dataset CC0 incompleto|
|2025/26|380|380|Nessuno, elenco precedente played|380 date e punteggi concordi; elenco riusato|
|2026/27|380|70|310 `not_started`|50 risultati originali e20 supplementari concordi; le70 fixture già osservate non mostrano revisioni nei campi confrontati|

Tutti gli elenchi contengono20 squadre.2.281 fixture ID distinti complessivi, nessun ID ripetuto fra stagioni, nessun conflitto ID-nome nei27 team ID osservati. Nessun conflitto FT/data nei confronti applicabili. Questo non verifica statistiche dettagliate, tempestività o assenza storica di revisioni. I dieci risultati aggiuntivi2024/25 non vengono inseriti negli originali.

**2022/23:** la coppia Spezia–Hellas Verona compare il5 marzo e l'11 giugno2023 con ID diversi. La seconda è uno [spareggio ufficiale in campo neutro](https://www.legaseriea.it/serie-a/news/spezia-verona-per-rimanere-in-serie-a-tim), non un duplicato da cancellare o una gara con autentico vantaggio casa. La regola fissata sceglie proprio lo spareggio come ultimo campione: viene mantenuto, con scope `POSTSEASON_NEUTRAL_PLAYOFF`. Per il futuro rapporto ordinario2022/23: due campioni regolari/4 celle team, più un campione speciale/2 celle, senza confondere i denominatori. Nessuna sostituzione opportunistica.

**2023/24:** l'ultimo campione è Atalanta–Fiorentina2 giugno2024, recupero della29ª giornata, confermato dalla [pagina ufficiale Atalanta](https://www.atalanta.it/news/recupero-29a-serie-a-tim-23-24-atalanta-fiorentina-cosi-in-campo). L'accesso diretto al PDF CU238 dal PC ha fallito per DNS, senza retry: non viene dichiarato scaricato. La data effettiva del recupero non viene trasformata nella data originaria del rinvio.

Le dieci fixture G8 coincidono con il manifest già preparato per squadre e kickoff; gli ID sono PitchAPI, **non** OddsPapi. Nessuna configurazione operativa o attestazione di riconferma del calendario è stata modificata. Torino–Monza è `m_0pSK27`,23 ottobre18:45UTC/20:45Roma. Al termine della discovery la lineup era ancora pending; la singola richiesta è stata poi eseguita21 ottobre18:53UTC, rispettando l'apertura18:45UTC. Esito dettagliato nella sezione prepartita sotto.

Il manifest privato sottoposto alla seconda conferma e poi approvato è `.local/preparation/pitchapi-history-20261021/detail-approval.private.md`:18 fixture/17 nuove stats e due lineup,19 nuove richieste, totale incarico24/30. Le sei residue restano non allocate. Un'unica osservazione prepartita non dimostra affidabilità o frequenza degli aggiornamenti.

Il client diagnostico `pitchapi-history-acquisition.mjs` riusa lock e snapshot sigillati esistenti, con grant distinti e tetto condiviso30; non estende l'autorizzazione del primo lotto12. Gli endpoint devono figurare esattamente nel grant della fase. Esiti ambigui bloccano i successivi invii; risposte già ricevute sono riusate solo dopo verifica di hash e legami. Nessun collegamento a training, coorti o scheduler.

## Secondo lotto — dati squadra osservati

Conferma dell'utente: «Autorizzo il secondo lotto, massimo19 richieste». Eseguite17 nuove `/stats` e due `/lineups`, storica e prepartita; tutte HTTP200 con envelope applicativo riuscito. La risposta stats Genoa–Lecce già acquisita è stata riusata con verifica di hash. Totale18 campioni stats, di cui17 ordinari e uno spareggio, senza sostituzioni. Nessun nuovo players/event/advanced. Totale incarico **24/30 trasmissioni**, nessuna richiesta pending, sei non allocate; nessun retry. Il successo HTTP della seconda lineup non equivale a presenza di una formazione.

Matrice FT: ogni denominatore6 corrisponde a3 incontri×2 squadre. Una cella valorizzata comprende lo zero esplicito. Nelle tre gare2022/23 lo spareggio è compreso solo nella vista «tutti i campioni»; la vista del campionato ordinario ha denominatore4, più2 celle dello spareggio in vista separata. Nessuna percentuale viene estesa alla popolazione stagionale.

| Campo FT, celle valorizzate |2021/22|2022/23¹|2023/24|2024/25|2025/26|2026/27|
|---|---:|---:|---:|---:|---:|---:|
|Gol dalla lista fixture²|6/6|6/6|6/6|6/6|6/6|6/6|
|Corner|6/6|6/6|6/6|6/6|6/6|6/6|
|Tiri totali|6/6|6/6|6/6|6/6|6/6|6/6|
|Tiri in porta|6/6|6/6|6/6|6/6|6/6|6/6|
|Tiri fuori|6/6|6/6|6/6|6/6|6/6|6/6|
|Tiri bloccati|6/6|6/6|6/6|6/6|6/6|6/6|
|Possesso|6/6|6/6|6/6|6/6|6/6|6/6|
|Falli|6/6|6/6|6/6|6/6|6/6|6/6|
|Fuorigioco|6/6|6/6|6/6|6/6|6/6|6/6|
|Gialli, chiave consolidata senza ambiguità³|5/6|6/6|5/6|5/6|6/6|6/6|
|Rossi aggregati|6/6|6/6|6/6|6/6|6/6|6/6|
|Passaggi|6/6|6/6|6/6|6/6|6/6|6/6|
|Passaggi riusciti/precisione|6/6|6/6|6/6|6/6|6/6|6/6|
|Parate|6/6|6/6|6/6|6/6|6/6|6/6|
|xG|6/6|6/6|6/6|6/6|6/6|6/6|
|xG non-penalty/on-target/open-play/set-play, ciascuna chiave|6/6|6/6|6/6|6/6|6/6|6/6|
|HT esplicito / gol per tempo|0/6|0/6|0/6|0/6|0/6|0/6|
|Rosso diretto / secondo giallo distinguibili|0/6|0/6|0/6|0/6|0/6|0/6|

¹Due campioni regolari e uno spareggio in campo neutro. ²`finished` e punteggio non esplicitano da soli durata regolamentare o successiva decisione amministrativa: questi metadati restano mancanti. ³In tre celle c'è uno zero esplicito in Discipline e una stringa vuota in Top stats. Non sono due numeri discordanti: è un'incoerenza di rappresentazione della chiave ripetuta. Lo zero originale è preservato; la vista consolidata conserva l'ambiguità anziché scegliere una riga o convertire il vuoto in zero. Nessun adattamento permissivo del parser per nascondere il problema.

Per queste chiavi FT non sono emersi null singoli o omissioni oltre alle ambiguità descritte; gli zeri restano separati dai valori positivi nell'inventario privato. Non è un'affermazione su altre gare/chiavi. Mancano la distinzione dei sottotipi rossi e i punteggi HT; non vengono ricostruiti.

| Periodi statistici |2021/22|2022/23|2023/24–2026/27, ciascuna stagione|
|---|---|---|---|
|Match con `All`|3/3|3/3|3/3|
|Match con FirstHalf e SecondHalf|0/3|1/3, solo spareggio|3/3|
|Campioni ordinari con tempi separati|0/3|0/2|3/3|

Somme dei conteggi dei periodi verificabili e partizione tiri non mostrano discrepanze nei controlli implementati; percentuali e xG arrotondati non sono forzati a somme esatte. Il campionamento non localizza la data precisa di introduzione dei periodi: non attribuire una copertura uniforme a tutta la stagione2022/23. I totali di corner sono somme home/away dello stesso incontro e periodo, con dipendenza congiunta ancora da modellare; nessuna probabilità è stata stimata da questi conteggi.

La matrice completa, con valore positivo/zero/null/omissione/ambiguità/non applicabile/risposta indisponibile per campo, periodo, squadra e scope, è `.local/preparation/pitchapi-history-20261021/team-quality-matrix.private.md`; JSON sigillato e provenienza in `team-quality-review.private.json`. `pitchapi-history-quality.mjs` calcola tutto offline. La categoria non applicabile non viene usata per nascondere un periodo non restituito o una metrica mancante.

## Lineup storica e osservazione prepartita conclusa

Genoa–Fiorentina G6, osservata21/10 ore17:54:25UTC: identità fixture/team coerenti,11 titolari per lato,13 riserve home e11 away, moduli presenti,46/46 player ID collegati alle righe players già acquisite, nessuna inversione di squadra. Entrambi i lati `confirmed=true`. Classificazione corretta: **POST_MATCH_CAPTURE**, non evidenza prepartita.

I titolari hanno slot dello schieramento, le riserve categorie di posizione: non sono la stessa codifica di ruolo. Il join rende verificabile l'identità, ma non riempie automaticamente i minuti o i tiri omessi e non certifica una mancata partecipazione. I record dei precedenti campioni non vengono riclassificati: rimangono **147 righe**, con i loro null/assenze originari.

Nessun campo di pubblicazione/aggiornamento della lineup, infortuni o squalifiche è apparso nella risposta. `lineup_type="standard"` è presente anche con `confirmed=true`, mentre la documentazione descrive l'omissione dopo conferma: differenza segnalata senza trattare `standard` come previsione. Fa fede il flag effettivo per questa distinzione, insieme all'istante di osservazione; non viene inventata una data di pubblicazione.

Torino–Monza G8: eseguita **una sola** GET `https://api.pitchapi.dev/v1/matches/m_0pSK27/lineups` mediante lo script privato esistente, senza rinnovare il grant e senza ripetere le23 precedenti. Ricevuta alle **2026-10-21T18:53:20.675Z**, cioè21 ottobre ore**20:53:20.675 Europe/Rome**, dopo l'apertura autorizzata delle20:45. HTTP200, `application/json; charset=utf-8`,508 bytes, envelope `data` senza errore. HTTP Date `Wed, 21 Oct 2026 18:53:20 GMT`; identità fixture e squadre corrette. Provenienza: URL, istante effettivo, ricevuta ordinale24 e hash dei bytes, conservati privatamente. Il kickoff resta23 ottobre18:45UTC/20:45Roma.

| Campo effettivo | Torino | Monza |
|---|---|---|
|`confirmed`|Presente, `false`|Presente, `false`|
|`lineup_type`|Assente|Assente|
|`formation`|Stringa vuota|Stringa vuota|
|`starters`|Presente, `null`|Presente, `null`|
|`subs`|Presente, `null`|Presente, `null`|
|Pubblicazione/aggiornamento fonte|Campi assenti|Campi assenti|

**Esito di contenuto: NO_PREDICTION_CONTENT_OBSERVED.** È una risposta prepartita non confermata, ma senza una formazione proposta consultabile. Non sono zero titolari o zero riserve: i valori originali sono null. Il riepilogo generico del runner assegna `PREMATCH_PREDICTED` in base al solo flag e mostra0 dopo normalizzazione delle liste mancanti: quelle etichette/conteggi non sono prova della presenza di un XI. La valutazione di contenuto separata conserva gli stati originali e ne impedisce questa interpretazione. Non è stato modificato il codice del runner né sovrascritto lo snapshot originale.

La lineup G6 precedente è **confermata ma acquisita postpartita**; quella G8 è **osservata prima del kickoff, non confermata e priva di contenuto**. Non abbiamo osservato qui né un XI probabile utilizzabile né una formazione ufficiale G8. Non possiamo concludere che PitchAPI non ne fornirà mai una: questa prova dimostra soltanto l'assenza di contenuto alle20:53 del21 ottobre. Non prova disponibilità prima di quell'istante e non misura aggiornamenti successivi. Nessun timestamp di pubblicazione viene inventato a partire da HTTP Date o kickoff.

Ripresa manuale completata tramite `.local/preparation/pitchapi-history-20261021/resume-lineup.private.mjs`. Restano immutabili il precedente checkpoint pending e la prima verifica a zero richieste; il nuovo checkpoint è `checkpoint-24-lineup-observed.private.json`. Risposta e review sigillate in `g8-lineup-observation.private.json`, interpretazione rigorosa dei null/assenze in `g8-lineup-content-assessment.private.json`. Nessun timer, trigger o processo in attesa, nessuna autorizzazione rinnovata. Prova conclusa: **non effettuare altre osservazioni o retry** senza nuova autorizzazione distinta.

Fonti integrative ammissibili alla sola consultazione pubblica: comunicati/convocati/bollettini dei club per indisponibilità e notizie attribuibili, comunicati Lega per squalifiche, pubblicazioni ufficiali dei club per formazioni confermate. La pagina Atalanta citata è un esempio concreto di formazione ufficiale pubblica, con data ma senza ora di pubblicazione sufficientemente precisa per ricostruire un cutoff passato. Non è una fonte di probabili formazioni universale né una concessione a scraping/archiviazione/training automatizzati. Se la prova prepartita fallisce, servirà un piano distinto per una fonte predittiva esterna, con diritti e tempestività verificati; non viene ora selezionato un servizio a pagamento.

## Decisione tecnica e acquisizione futura subordinata ai diritti

**Promettente per dati FT di squadra**, in particolare corner/falli/tiri e famiglia gol. **Parziale** per cartellini, periodi storici, metadati amministrativi e contributi individuali completi. **Non dimostrata l'idoneità per probabili formazioni preforecast:** la singola osservazione G8 restituisce metadati senza XI. Nessun modello è stato costruito, validato o promosso in questo incarico.

Prima del dataset ampio: chiarimento scritto dei diritti pertinenti e approvazione della policy C futura; protocollo per soli incontri ordinari, campo neutro/spareggi separati, definizioni/versioni di target e disponibilità temporale; QC e piano acquisizioni esplicito. Le2.281 fixture elencate comprendono310 future e uno spareggio: al momento il frame ordinario concluso è1.970 incontri. Gli snapshot stats già disponibili coprono19 di questi e uno spareggio; una futura acquisizione completa FT ordinaria richiederebbe **1.951 nuove stats**, da ricalcolare/verificare al momento dell'autorizzazione. Questo numero è un preventivo tecnico, **non** un'autorizzazione o un diritto al bulk. Eventuali players/events/lineups richiedono scopo e budget separati, non vengono raccolti perché il piano è gratuito.

Avanzamento proposto: dataset FT/QC → baseline e challenger per corner/falli/tiri squadra con development temporale → contributi individuali e lineup mediante ablation su eventi futuri → cartellini solo dopo tassonomia → validazione e gate del selettore. L'ordine principale della roadmap famiglia gol rimane invariato. Una cache storica acquisita oggi non ricostruisce feature prepartita passate; evitare leakage nei backtest e mantenere i protocolli originali separati.

Futuro carico squadra minimo: una lista e10 stats per giornata≈11 richieste, più osservazioni prepartita e acquisizioni individuali soltanto quando previste dalla policy. Revisioni con nuove osservazioni/hash, niente overwrite. Riutilizzare il ciclo esistente per QC, candidati dataset, scoring di forecast immutabili e refit autorizzato; bloccare su lacune/conflitti/diritti, registrare pending e segnalare anomalie. Nessun secondo scheduler, acquisizione ricorrente reale o refit attivati.

La prova prepartita autorizzata è conclusa con esito negativo quanto alla presenza di una formazione consultabile nell'istante osservato. La continuità/disponibilità in altri istanti resta non verificata. Gli studi registrati, i modelli originali, il selettore e G8 restano invariati; stake reale zero.

Verifiche locali finali: **390/390 test passati**, nessuno skip su Windows; lint senza errori con il solo warning preesistente `combinedPlayedOdd`; build Next.js riuscita;3.400 file protetti e chiave football-data.org invariati. Test sintetici su grant/endpoints/budget condiviso, crash/retry, hash, finestra lineup, denominatori, scope neutro, omissioni/zeri e disponibilità point-in-time. Gli scenari sintetici non sono validazione predittiva. I payload, i grant e il runner privato non vengono pubblicati; solo codice diagnostico, test e documentazione sicuri.

Nella ripresa dell'unica osservazione G8 non è stato modificato codice: aggiornati soltanto rapporto e roadmap, aggiunta privatamente una valutazione immutabile del contenuto. Ricontrollati3.400 originali protetti prima e dopo la richiesta; grant invariato, contatore24, pending0, riserva6. Nessuna ulteriore chiamata PitchAPI, forecast, training o attivazione.
