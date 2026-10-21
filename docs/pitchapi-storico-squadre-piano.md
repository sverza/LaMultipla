# PitchAPI — piano storico e dati per modelli di squadra

Base `e310f111b06c94f2baf60776655851fc6bb37a41`,21 ottobre2026. **Proposta in attesa di autorizzazione: zero nuove richieste autenticate.** La gratuità senza trial/contingente è confermata personalmente dall'utente nella dashboard; non viene ripetuto l'audit commerciale. Restano separati accesso, conservazione e diritti di training/refit.

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
