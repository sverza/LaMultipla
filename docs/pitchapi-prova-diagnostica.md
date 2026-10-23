# PitchAPI — preparazione della prova privata

Stato: **prova autorizzata conclusa,12/12 richieste riuscite; adozione della fonte non autorizzata**. Riferimento iniziale `4c22cb1a79f9d75859734dbcb8b08af2e33db274`, branch `feature/oddspapi-private-import`, PR #2 in bozza. L'utente ha completato personalmente la registrazione e inserito la chiave nella finestra locale. Il vault è decrittabile dall'utente Windows corrente; chiave football-data.org invariata.

## Inserimento e verifica locale

Da `C:\LaMultipla`, `node scripts/pitchapi-key.mjs --install` apre una finestra mascherata. Incollare esclusivamente nella finestra e premere **Salva**; mai in chat o nella riga di comando. `node scripts/pitchapi-key.mjs --verify` restituisce soltanto indicatori di configurazione/decrittabilità, senza contattare il servizio.

La credenziale è cifrata mediante DPAPI per l'utente Windows corrente in `.local/pitchapi/api-key.dpapi`, escluso da Git. Nessuna modifica alla chiave football-data.org, nessuna esportazione in variabili d'ambiente, nessun file temporaneo contenente la chiave. Codice GUI statico negli argomenti del processo; credenziali soltanto in memoria e nel file cifrato. Salvataggio esclusivo, rifiuto delle sovrascritture e dei percorsi reindirizzati. Il modulo Security del runtime Windows viene importato esplicitamente, senza modificare policy o impostazioni Windows. La decrittabilità non certifica la validità della chiave presso il fornitore.

I test non aprono la finestra reale, non leggono credenziali utente e non fanno richieste: risposte GUI simulate, rifiuto input errati/cancellazioni, isolamento da football-data.org, percorsi reindirizzati e roundtrip DPAPI reale con stringa sintetica in directory temporanea isolata. I test Windows sono saltati sulle altre piattaforme.

## Gate applicato alla prova

Prima di qualsiasi richiesta autenticata sono stati riesaminati documentazione ufficiale e condizioni applicabili e presentati endpoint e massimo **12** richieste. L'utente ha confermato esplicitamente «Confermo la prova, massimo12 richieste». Il comando di gestione della chiave non contiene client HTTP e non avvia la prova.

Seguire il [piano esistente](api-statistiche-piano-verifica.md): catalogo leghe, elenco corrente e uno storico, quindi statistiche/eventi/giocatori di una gara G6, una G7 e una storica, solo dopo identità esatte. Niente paginazioni o retry automatici. Accesso negato o assenza della stagione richiesta comportano arresto anticipato.

Training, refit, acquisizioni massive, adozione della fonte e conservazione permanente restano sospesi. L'accesso gratuito dichiarato non dimostra diritti su queste operazioni. Nessuna modifica a G8, modelli, dataset, journal, coorti, selettore, Android, Firebase o task; nessuna chiamata OddsPapi. Stake reale zero.

## Piano sottoposto alla conferma del 21 ottobre

Base esclusiva `https://api.pitchapi.dev`, metodo GET, credenziale nell'header `X-API-KEY` soltanto in memoria. ID sotto ricavati dalle risposte reali; nessun ID esemplificativo della documentazione è un target della prova.

| Massimo | Endpoint | Condizione prima di procedere |
|---|---|---|
| 1 | `/v1/leagues` | Una sola Serie A italiana identificabile, stagione `2026/2027` presente |
| 1 | `/v1/leagues/{leagueId}/matches?season=2026%2F2027&status=played` | Lega/stagione coerenti; G6 e G7 riconciliate con manifest privati per casa/trasferta e kickoff esatti |
| 1 | `/v1/leagues/{leagueId}/matches?season={historicalSeason}&status=played` | Una stagione fra `2025/2026` e `2024/2025` realmente presente nel catalogo; fixture storica univoca |
| 3 | `/v1/matches/{fixtureId}/stats` | Una gara G6, una G7 e una storica, tutte identificate prima della richiesta |
| 3 | `/v1/matches/{fixtureId}/events` | Gli stessi tre ID |
| 3 | `/v1/matches/{fixtureId}/players` | Gli stessi tre ID |

Tetto totale **12**, non un obiettivo da consumare. Richieste seriali, senza retry, redirect o paginazioni aggiuntive. Arresto su accesso negato, indisponibilità della stagione corrente, pagamento richiesto o risposta ambigua. Nessuna chiamata a lineups, shots, advanced, account o altri endpoint; eventuali prove successive richiedono autorizzazione distinta.

La [documentazione ufficiale](https://pitchapi.dev/) e la [pagina della chiave](https://pitchapi.dev/get-api-key), ricontrollate il21 ottobre, dichiarano un unico piano gratuito, senza carta/scadenza/overage, tutti gli endpoint e storico dal2021; un burst guard può restituire429. Il piano associato alla chiave non è verificabile pubblicamente: l'accesso effettivo resta da collaudare. Non è documentato un endpoint gratuito separato di verifica account.

Nelle pagine pubbliche esaminate non sono stati individuati termini dati che chiariscano training, conservazione duratura e uso dopo cessazione, né un divieto espresso di normale consultazione diagnostica. Questo è un limite della verifica, non una licenza implicita. La conferma richiesta riguarda soltanto la prova privata delimitata e le evidenze diagnostiche consentite; nessuna policy permanente viene adottata. Eventuali condizioni dell'account incompatibili comportano arresto.

Risposte previste con `data` oppure `error`; valori opzionali omessi e null distinti dagli zeri. Team stats sono stringhe con formato, player stats gruppi con chiavi/tipi. Questi sono schemi documentati, non campi effettivamente verificati nella Serie A. Non usare l'SDK con retry automatici. Dettagli non distinguibili (per esempio rosso diretto rispetto a secondo giallo) resteranno esplicitamente ambigui.

## Esito effettivo della prova

Esecuzione del21 ottobre2026, **16:54:29–16:56:31UTC** (18:54:29–18:56:31 Europe/Rome). Esattamente12 trasmissioni, tutte HTTP200, `application/json; charset=utf-8`, envelope `data` senza `error`. Nessun retry, redirect, pagina aggiuntiva, endpoint dimostrativo, pagamento o upgrade. Non vengono effettuate altre richieste in questo incarico.

Il catalogo osservato contiene77 leghe. La Serie A è stata distinta dalle omonime brasiliana ed ecuadoriana mediante nome esatto e paese `ITA`; flag Free positivo. L'accessibilità gratuita dei cinque tipi di endpoint previsti è **verificata per questa chiave e questi casi**, non dedotta dalla sola pubblicità. Non è stato consultato un pannello billing o un endpoint account non documentato.

| Ordinali | Richiesta realmente eseguita | Esito |
|---|---|---|
|1|Catalogo `/v1/leagues`|Lega italiana e sei stagioni identificate|
|2|Elenco `2026/2027`, `status=played`|70 incontri;20/20 G6/G7 riconciliati per squadre/casa-trasferta/kickoff e punteggi rispetto alle osservazioni private già riscontrate con CU47/CU49|
|3|Elenco `2025/2026`, `status=played`|380 incontri elencati; non380 incontri con statistiche collaudate|
|4–6|Stats, eventi e giocatori del campione G6|Tre risposte riuscite|
|7–9|Stats, eventi e giocatori del campione G7|Tre risposte riuscite|
|10–12|Stats, eventi e giocatori del campione storico|Tre risposte riuscite|

I campioni sono stati fissati **prima** della lettura delle statistiche: primo incontro cronologico di ogni giornata richiesta e primo cronologico della stagione storica. Nessuna ricerca retrospettiva del campione con più campi. Identità esatte, alias espliciti privati e hash sono conservati con l'evidenza. Per il campione storico, CC0 riscontra squadre/data/risultato; il kickoff viene da PitchAPI e non è indipendentemente riconfermato. La giornata è associata tramite il manifest: non è un campo esplicito dell'elenco PitchAPI.

Nessun conflitto di punteggio osservato sui20 incontri correnti. Non sono state nuovamente acquisite fonti ufficiali in questa prova, né confrontate indipendentemente le statistiche dettagliate. Fonte upstream e sua indipendenza restano ignote.

## Inventario dei dati osservati

Le colonne si riferiscono esclusivamente ai tre campioni, non alla completezza della stagione. **V**=campo presente con valore reale (compreso uno zero esplicito), **N**=null, **A**=assente, **S**=semantica non sufficientemente verificata, **NC**=endpoint/prova non effettuati. Nessuna risposta ha indicato «non disponibile nel Free». Un campo assente non viene classificato arbitrariamente come premium.

| Statistica squadra / fixture | G6 | G7 | Storica | Limite |
|---|---|---|---|---|
|Punteggi di fine gara e stato `finished`|V|V|V|Durata regolamentare e decisioni amministrative non esplicitate|
|Punteggio HT esplicito|A|A|A|Non ricostruito dagli eventi o dalla somma di statistiche|
|Corner home/away|V|V|V|Nessuna verifica indipendente della refertazione|
|Tiri totali, in porta, fuori, bloccati|V|V|V|Quattro chiavi distinte, senza sostituzioni fra definizioni|
|Possesso|V|V|V|Campo normale `BallPossesion`, non pass share avanzato|
|Falli, fuorigioco|V|V|V|Non attribuiti automaticamente ai singoli giocatori|
|Gialli, rossi aggregati|V|V|V|Nei tre campioni i rossi sono zeri espliciti|
|Rossi diretti / seconde ammonizioni distinti|S|S|S|Il totale rosso non dimostra la distinzione|
|Parate squadra|V|V|V|Non calcolate come SOT meno gol|
|Passaggi e precisione|V|V|V|Conteggio e percentuale conservati separatamente|
|xG e sue componenti osservate|V|V|V|Metodologia/versione del calcolo e qualità indipendente da chiarire|

Presenti tre periodi (`All`, `FirstHalf`, `SecondHalf`). Nei controlli applicati ai conteggi, somme dei periodi e partizione tiri non mostrano discrepanze; percentuali e xG arrotondati non sono forzati a identità aritmetiche. Ripetizioni equivalenti delle stesse chiavi nei gruppi sono tracciate; eventuali contraddizioni vengono escluse, non risolte scegliendo una riga.

| Eventi | Osservazione |
|---|---|
|Gol, autore, minuto e recupero|Valori presenti nei due incontri con gol; campione storico senza gol. Gli ID evento-player sono collegabili agli ID delle righe giocatore.|
|Autogol|Flag presente; un caso positivo nel campione. Non assumere che il team dell'evento identifichi sempre la squadra dell'autore anziché il beneficiario.|
|Rigori|Flag presente; nessun caso positivo nella prova. Rigore sbagliato non collaudato.|
|Assist nell'evento|Assenti; gli assist aggregati nelle righe giocatore non identificano chi ha assistito uno specifico gol.|
|Ammonizioni|Eventi osservati; rosso diretto/secondo giallo non distinti o collaudati con casi positivi.|
|Sostituzioni|Uscente/entrante osservati. Non trasformati in formazioni ufficiali o minuti ricostruiti.|
|Punteggio nell'evento gol|Osservato come punteggio precedente al gol nei campioni. Non trattarlo come punteggio finale né sommarlo.|
|Periodo|Campo presente, ma la documentazione lo descrive come derivato dal minuto: non prova autonoma dell'intervallo.|

Gli eventi sono rispettivamente25,17 e15. L'assenza di un tipo nel campione non certifica che il provider lo gestisca o che non si sia verificato. Per esempio `sub_in_player` non è applicabile a un evento gol: la presenza grezza resta distinta dall'applicabilità semantica.

| Campi giocatore | G6 (46 righe) | G7 (52) | Storica (49) |
|---|---:|---:|---:|
|ID e team ID presenti|46|52|49|
|Ruolo null|46|52|49|
|Minuti con valore / assenti|32 /14|32 /20|32 /17|
|Gol con valore / assenti|30 /16|30 /22|30 /19|
|Assist con valore / assenti|30 /16|30 /22|30 /19|
|Tiri totali, SOT, fuori: ciascuna chiave con valore / assente|16 /30|14 /38|8 /41|
|Falli commessi con valore / assenti|32 /14|32 /20|32 /17|
|Falli subiti: valore /null /assente|9 /23 /14|14 /18 /20|17 /15 /17|
|Parate con valore / assenti|2 /44|2 /50|2 /47|
|xG con valore / assenti|16 /30|14 /38|8 /41|
|Cartellini come contatore player|Assente|Assente|Assente|
|Titolarità e formazione ufficiale|NC|NC|NC|

**147 righe non equivalgono a147 partecipanti.** I minuti mancanti non provano una mancata partecipazione; un tiro assente non viene trasformato in zero. I denominatori della tabella sono tutte le righe restituite, non i soli giocatori scesi in campo. Le percentuali di missingness della popolazione dei partecipanti o della stagione restano non calcolabili.136 ID distinti,11 ricomparse fra campioni, nessuna associazione ID-nome contraddittoria osservata: evidenza limitata, non prova di stabilità pluriennale. Il ruolo manca nel100% dei record; le parate non autorizzano a inventare un ruolo formalmente mancante.

Sono presenti ulteriori chiavi di passaggio, duelli, recuperi, intercetti, respinte, xA/xGOT e altre metriche; elenco e valori grezzi restano nell'inventario privato. Una chiave presente solo per alcuni giocatori non dimostra che gli altri abbiano valore zero. Titolarità/lineups non sono state richieste perché fuori dal budget.

## Storico, aggiornamenti e affidabilità

Metadati osservati: `2021/2022`, `2022/2023`, `2023/2024`, `2024/2025`, `2025/2026`, `2026/2027`. Liste realmente ottenute:2026/27 e2025/26. Statistiche dettagliate ottenute: due gare2026/27 e una2025/26. Nessuna prova di dettaglio sulle altre quattro stagioni; nessuna percentuale di completezza storica certificata.

I risultati correnti arrivano almeno agli incontri G7 del19 ottobre nell'elenco osservato il21. Non è stata misurata la latenza dopo il fischio finale, né la continuità del servizio. Acquisizione, HTTP Date e hash sono conservati; un timestamp di modifica del singolo record non è stato osservato. Nessuna seconda osservazione temporale: revisioni retroattive non collaudate. Non usare l'acquisizione odierna come prova di disponibilità prima di un cutoff passato.

## Idoneità tecnica e decisione successiva

| Famiglia futura | Decisione tecnica dopo questa prova |
|---|---|
|Corner squadra/totali, tiri squadra|Promettente: target osservati; servono campione temporale predefinito, correzioni/refertazione e storico autorizzato. Nessun modello già validato.|
|Cartellini/bookings|Parziale: aggregati ed eventi gialli; tassonomia di secondo giallo/rosso diretto e regole bookmaker da verificare.|
|Falli squadra|Promettente sul target aggregato; definizioni e storico da verificare.|
|Marcatori|Parziale: gol/ID/own-goal osservati; esposizione, partecipazione, titolarità e rigori non completati.|
|Tiri/SOT giocatore|Bloccato come dataset completo: omissioni non equivalgono a zero, mancano ruoli e partecipazione ufficiale.|
|Parate portiere|Parziale: contatori presenti in due righe per incontro; ruolo e sostituzioni/esposizione non ancora verificati.|
|Assist, xG e metriche avanzate come feature|Disponibilità parziale osservata; definizioni, provenienza e disponibilità temporale richiedono verifica.|

La fonte **consente gratuitamente l'accesso osservato a statistiche ricche**, ma non è ancora dimostrato uno storico completo, affidabile e utilizzabile per tutti i modelli. Training/refit e adozione restano sospesi. Non esiste una nuova validazione scientifica dei mercati o dei modelli per effetto di questi test tecnici.

Uso settimanale ipotetico: una lista e10×3 sottoendpoint ≈31 richieste/giornata; con lineups ≈41, prima di verifiche successive delle revisioni. È uno scenario di carico, non una nuova autorizzazione, una garanzia di servizio o un piano attivato. La prova non ha ricevuto429, ma dura circa due minuti: insufficiente per dimostrare sostenibilità nel tempo.

Prima prossima azione: l'utente chiede al fornitore chiarimento scritto su acquisizione periodica privata, snapshot immutabili e durata, uso statistico/training/refit, attribuzione, upstream e uso dopo cessazione; nessun messaggio inviato dall'agente. In parallelo si può autorizzare separatamente una prova mirata di **3 lineups** sui medesimi incontri per verificare partecipazione/ruolo/titolarità, senza garanzia che colmi tutte le lacune. Un confronto dopo intervallo concordato richiederebbe **6** nuove richieste (stats e players sui tre incontri) per osservare eventuali revisioni; non dimostrerebbe comunque l'assenza di revisioni future. Casi con rosso/rigore e campionamento storico richiedono un piano ulteriore con selezione predefinita e budget distinto. Nessuno scaricamento stagionale dettagliato autorizzato.

## Evidenze e strumenti

Evidenze grezze, intent, ricevute, hash, alias, riconciliazioni e inventario campo per campo: `.local/preparation/pitchapi-20261021/trial/`. La revisione sigillata è `inventory-review.private.json`; il checkpoint conclusivo è `completion-v2.private.json`. Destinazione diagnostica temporanea: nessuna policy di conservazione permanente, nessuna pubblicazione di payload o quote. La chiave è fuori dalla directory delle prove.

`scripts/lib/pitchapi-trial.mjs` riusa il lock esistente e gli snapshot sigillati: intent prima dell'invio, budget persistente, hash/ricevuta per il riuso, blocco su esito ambiguo o precedente errore. `scripts/lib/pitchapi-inventory.mjs` è puro e offline: conserva null/assenze/zeri, chiavi e periodi esatti, duplicati equivalenti o contraddittori e percorsi di provenienza. Nessun collegamento a dataset/trainer/selettore/coorti. Le credenziali non sono persistite nei payload, negli argomenti o nelle ricevute; risposte che riflettano la chiave vengono rifiutate.

Verifiche locali: **374/374 test passati**, nessuno skip su Windows; lint senza errori, con un solo warning preesistente in `app/components.tsx` (`combinedPlayedOdd`); build Next.js riuscita. I19 nuovi test coprono vault, protocollo di richiesta e inventario, usando soltanto dati sintetici. Il budget reale è stato speso esclusivamente dalla prova approvata, non dai test.

Commit remoto e CI sono riportati nel rapporto conclusivo. Gli originali scientifici restano distinti e invariati. Stake reale zero.
