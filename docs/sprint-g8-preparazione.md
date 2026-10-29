# Sprint G8 — preparazione verificata al 21 ottobre 2026

Aggiornamento freeze-only: [G8 — READY FOR FREEZE / PREFLIGHT22–23 ottobre](g8-ready-for-freeze-preflight.md). Ispezione anticipata e verifica ricevuta ora disponibili, assemblaggio offline dai futuri input freschi e protezioni prima di ogni scrittura collaudati. Dataset già valido per tutta la finestra: nessun refresh superfluo. Proposta di coorte e freeze ancora da autorizzare; quote/consegne/progressivo restano separati. Lo stato storico sottostante descrive la preparazione precedente.

Stato complessivo **PARZIALE**: codice e prove disponibili, prerequisiti reali ancora aperti. Nessun freeze G8, registrazione definitiva di coorte, acquisizione OddsPapi, consegna o task attivati. Stake reale **0 €**; PR #2 in bozza.

## Le17 risposte operative

| N. | Componente | Stato ed evidenza |
|---|---|---|
| 1 | Percorso originale G8 | **PARZIALE**: preflight offline e freeze-only separato testati con algoritmi originali. Mancano approvazione serie/freeze, dieci ID provider e riconferme fresche. Gestore progressivo non collegato alla nuova serie. |
| 2 | Dati originali | **PRONTO**: nuova osservazione CC0 separata,1.560 risultati; cutoff1/10 invariato,1.490 righe di training identiche per hash alle originali. |
| 3 | G6/G7 | **PRONTO per riscontro separato**: unica prova football-data.org HTTP200,380 fixture,20/20 risultati riconciliati con manifest e punteggi ufficiali CU47/CU49. Non adottati per training. |
| 4 | football-data.org | **PARZIALE**: account utente, DPAPI e prova riuscita. Diritti di training, retention duratura e uso dopo cessazione da chiarire. |
| 5 | Challenger | **PARZIALE**: dataset misto con gate dei diritti, identità versionata, algoritmo fisso e40 bootstrap testati su sintetici. Nessun dataset osservato autorizzato. |
| 6 | Forecast challenger G8 | **BLOCCATO**: diritti, protocollo/coorte approvati e runner reale di freeze revisionato mancanti. Runner disponibile solo sintetico. |
| 7 | Modelli sperimentali | goals-v1 conserva l'evidenza retrospettiva1X2; DC/bivariato, mercati derivati e challenger restano soggetti ai gate scientifici esistenti. Nessuna nuova validazione predittiva. |
| 8 | Mercati FT | **PRONTO per diagnostica condizionata agli input**:1X2,O/U,BTTS,gol squadra,DC,DNB; AH soltanto con evidenza esatta di lato/base linea/segno/regole. |
| 9 | B2 | **PARZIALE**: codice e liquidazioni testati; semantica AH reale non attestata, quote escluse senza prova. |
| 10 | Esclusioni | Risultati esatti, handicap europei, Multigol/Builder non aggiunti per analogia; corner/cartellini/falli/giocatori fuori lotto. Nuovi mercati non selezionabili. |
| 11 | Contesto | **PARZIALE**:10 dossier privati preparati, **0/10 completi per il gate operativo**; note con fonti/scadenze e lacune esplicite. |
| 12 | Ciclo automatico sicuro | **PRONTO come dry-run locale**: lock, intent/outcome immutabili, recupero, QC/revisioni, candidato dataset, scoring sintetico appaiato, review, piano refit non eseguito. |
| 13 | Automazione reale | **BLOCCATA**: adozione fonte/policy, acquisizione autorizzata, scoring osservato per coorte, refit registrato, collegamento al gestore e autorizzazione operativa. |
| 14 | Tempi | Fit+40 bootstrap sintetici:4,55s v1,2,16s DC,4,18s bivariato; B2/14.414 selezioni6,95s. Stima15–45s per solo calcolo/serializzazione su carichi simili, non SLA o tempo end-to-end. Rete e verifiche umane separati. |
| 15 | Interventi venerdì | Approvazioni, riconferma calendario, controllo input/lock, contesto/regole/ticket ove richiesti. Contesto e ticket non sono prerequisiti del solo freeze indipendente dalle quote. |
| 16 | Provider | Nuova autorizzazione per massimo1 fixtures +1 markets solo se necessario +1 odds-by-tournaments. Account non conteggiato. Quote soltanto dopo freeze. |
| 17 | Finestra |23/10 **14:45 ≤ ora <18:15 Europe/Rome**,12:45–16:15UTC. Procedura e arresti sotto. Nessuna esecuzione automatica. |

## P0 — calendario, dataset e nuova serie proposta

Calendario ufficiale consultato: prima gara Torino–Monza23/10 ore20:45, ultima Udinese–Milan25/10 ore20:45. Tutte le dieci gare sono nel manifest privato con casa/trasferta e UTC. Roma è UTC+2 il23/24, UTC+1 il25: ultima gara19:45UTC. Il convertitore rifiuta ore locali ambigue/inesistenti, senza inferire kickoff dai giorni della settimana. [Programma Lega](https://www.legaseriea.it/serie-a/news/quando-si-gioca-anticipi-e-posticipi-fino-alla-12a-giornata), [PDF calendario](https://images.legaseriea.it/image/private/fl_attachment/prd/emzdipx98pkg0lgeqgrt.pdf).

Sette risposte pubbliche CC0 conservate separatamente con commit/hash/provenienza. La fonte resta ferma ai risultati del20 settembre; acquisizione recente non significa risultati aggiornati. Nuova osservazione1.560 righe, training al cutoff1/10 identico alle1.490 righe originali. Stagioni2022/23 e2023/24:380 risultati ciascuna;2024/25:370;2025/26:380;2026/27:50. La lacuna2024/25 non è imputata. Storico minimo squadre G8:42 incontri, oltre soglia20. Dataset originale completo4.980 righe invariato.

`g8-preflight.mjs` è offline/read-only. I piani con ID o attestazioni mancanti sono non eseguibili. Gli snapshot OddsPapi disponibili non contengono ID G8; quelli football-data.org non li sostituiscono. Nessuna riconferma o freschezza inventata.

Proposta privata **non attivata** `reference-g8-20261023-v1`: nuovo store/identità, avvio G8,60 giornate esplicite fino a2027/28G29,600 eventi; goals-v1/DC/bivariato originali, studi/parametri invariati, fonteA CC0, cutoff mensile e disponibilità temporale originali. Primari BTTS/O2.5, almeno500 appaiati, forecast90%, risultati95%, confronti/intervalli e chiusura48h dichiarati nella proposta. Intermedi descrittivi; lacune conservate nel frame senza scorrimento. Rinvii: evidenze versionate, stessa identità, nessun forecast retroattivo. La precedente coorte v2 e la lacuna G7 non sono rinominate o cancellate. **Richiede approvazione prima del freeze**, non è una registrazione efficace.

`reference-series.mjs` riusa i freeze originali v1/v2 sotto il nuovo namespace isolato. Autorizzazione legata all'hash della proposta, input fissati, lock, intent e ricevuta; recupero verifica entrambi i journal. Test integrato con veri fit originali e40 bootstrap: crash dopo v1, recupero byte-identico, v2 completato; input cambiati/journal alterati o mancanti/deadline rifiutati.

**Blocco d'integrazione:** il gestore progressivo cerca il journal nel percorso canonico; la nuova serie propone uno store distinto. Non è stato modificato per adottarla automaticamente. Bozza G8 disabilitata, configurazione G7 invariata. Freeze-only utilizzabile dopo i propri gate senza avviare il gestore completo. Un successivo lotto deve approvare/testare il collegamento alle revisioni shadow; niente copia silenziosa fra coorti.

## P1 — prova fonte, diritti e originali

Account registrato dall'utente; autorizzata/eseguita **una sola richiesta**,21/10 ore13:27:52UTC a `/v4/competitions/SA/matches?season=2026`: HTTP200 JSON,380 fixture. DPAPI per l'utente Windows; import esplicito del modulo Security del runtime risolve il salvataggio senza cambiare policy. Nessun segreto nei log/GitHub. Intent impedisce retry ambigui, ricevuta evita doppie chiamate e verifica hash dello snapshot al riuso.

20/20 identità e kickoff dei manifest G6/G7, punteggi FT e `FINISHED/REGULAR`, nessun ID duplicato o conflitto. I20 punteggi concordano con [CU47](https://images.legaseriea.it/image/private/fl_attachment/prd/hvdturcnhbtepxu03mq7.pdf) e [CU49](https://images.legaseriea.it/image/private/fl_attachment/prd/mapejn8noqpnevunrcsc.pdf), verificati sui documenti originali anche visivamente. I CU non riportano i kickoff individuali; l'API non espone `awarded` nei20 record. Le riserve di successive decisioni richiedono controllo delle revisioni, non un booleano inventato.

[Free](https://www.football-data.org/pricing):0€/mese,10 chiamate/minuto, risultati ritardati. [Condizioni](https://www.football-data.org/about): singola applicazione, fair use, attribuzione, nessuna garanzia di accuratezza/continuità e vincoli di riferimento ai dati nel servizio dopo cessazione. Non individuata una concessione esplicita per training e conservazione permanente: **punto da chiarire col fornitore**, non conclusione giuridica di divieto/licenza implicita. Nessuna email inviata, spesa o accettazione autonoma. Snapshot/termini/autorizzazione della prova privati; training, uso continuativo e retention duratura sospesi. Chiarire valutazioni statistiche, training/refit, copie immutabili/revisioni e conservazione dopo cessazione. A resta Openfootball, B riscontro separato, C non adottata.

**G6 invariata**: controllo originale tardivo19/10,0settled/10pending; non ripetuto o sostituito con la nuova fonte. **G7**: nessun journal autentico o forecast ricostruito. Un'osservazione del21/10 non dimostra disponibilità al1/10.

## P2–P4 — componenti realizzati e limiti

[Challenger data-refresh](challenger-refresh-g8.md): prototipo a parametri fissi, identità/codice/dataset distinti; costruzione in memoria di un dataset misto soltanto con20 risultati verificati e diritti espliciti. Rifiuta leakage, duplicati, revisioni, input bookmaker. Il runner accetta **solo sintetici**. Nessun freeze osservato G8 pronto, nessuna superiorità dimostrata. Diritti, tavolino/revisioni, protocollo e runner reale revisionato precedono l'uso futuro.

[B2](milestone-b2-diagnostica-ft.md): opt-in `--goals-b2`, catalogo/raw/report esatti e attestazione asiatica privata sigillata. Conserva B1, consolida FT1X2/BTTS/AH; payout originali, rimborsi/half-win/half-loss e2.624 controparti sintetiche testati. Lato/segno non dedotti dall'ordine provider. Famiglie non rappresentate restano escluse, senza modificare moduli registrati. Nuovi record non selezionabili/consegnabili.

[Ciclo ricerca dry-run](ciclo-ricerca-dry-run.md): stage locale per l'orchestrazione esistente, piano legato al codice/handler, acquisizione locale, QC/revisioni/rimozioni, candidato dataset, scoring sintetico, review e refit pianificato. Crash, input incompleti e retry locali espliciti testati; intent ambigui bloccati. Challenger peggiori conservati, forecast mancanti non ricreati. Nessuna capacità di rete/scheduler/trainer/consegna. Log-loss/Brier/calibrazione/coverage appaiati su eventi comuni; valutazione osservata richiede protocollo approvato. Report cumulativi produttivi/refit reale/adozione fonte non implementati.

## P5 — dossier, prezzi e budget

Dieci dossier privati con identità di bozza, `fixtureId:null` quando non osservato, note attribuite e scadenze; categorie non verificate pending. Ultime cinque righe CC0 osservate non presentate come forma recente completa, mancano G6/G7. Impegni europei distinti da minuti individuali/riposo reale/turnover. Accessi403 e date incoerenti marcati, non aggirati. Nessun aggiustamento probabilistico.

CU49 non dichiara nuove squalifiche di calciatori; ciò non attesta disponibilità G8. Servono sanzioni pregresse non scontate, ricorsi e decisioni successive. Formazioni ufficiali normalmente troppo tarde per la proposta a due ore: non inventarle o anticiparne l'attestazione. **0/10 dossier completi per il gate operativo**.

Piano privato OddsPapi non autorizzato: account non conteggiato; massimo tre richieste, fixtures1, markets1 solo necessaria, odds-by-tournaments1 dopo freeze. [Costo documentato](https://oddspapi.io/en/docs/requests-and-quota): ogni chiamata ai tre endpoint vale1 richiesta anche con errore dopo elaborazione. Nessun acquisto; verificare piano/quota prima. Conservati tetto locale200 e riserva50, nessun retry ambiguo.

Quota attuale non verificata: ultimo controllo14/10,242residue/250, **dato storico**. Ledger locale3 intent validi/invariati, non ricevute di successo o contatore remoto completo; nessun lock persistente attivo rilevato. Ricontrollare venerdì. Vecchie quote non fresche G8; catalogo riutilizzabile solo se esatto/coerente.

Restano umani: mercato/periodo90min+recupero, rimborsi/rinvii, semantica AH, offerta bet365 Italia e **prezzo del ticket effettivo**. Il prodotto delle singole non prova l'offerta; indipendenza non presunta. Quote dopo freeze, fresche al momento osservato e da ricontrollare, non garantite per due ore. Selettore1X2/governance invariati.

## Procedura23 ottobre — soltanto dopo approvazioni

1. Prima della finestra: branch/HEAD/CI, hash/clock/lock, rete/alimentazione. Approvare proposta privata `reference-g8-20261023-v1` e separatamente freeze G8; evidenza con hash proposta, revisore, timestamp effettivo e scadenza. Autorizzare budget provider separatamente.
2. Riconfermare Lega entro24h; una fixtures autorizzata se non esiste cache valida entro60min. Tutte10 gare, casa/trasferta, UTC/stati; qualsiasi conflitto o ID mancante blocca. Niente ID di altra fonte o timestamp storici spacciati attuali. Predisporre schedule/calendario e piano sigillato verificati. `reference-plan.template.private.json` è intenzionalmente non eseguibile, nessuna approvazione creata nello sprint.
3. Dataset CC0 entro72h, cutoff1/10/hash/training verificati. Eventuale refresh in nuova osservazione, differenze spiegate secondo policy. Mai G6/G7 supplementari nell'originale.
4. Dalle14:45 con piano realmente approvato: `node scripts/reference-series.mjs --plan .local/preparation/g8-authorized/reference-plan.private.json --preflight`. Read-only, ma verifica finestra e autorizzazioni.
5. Solo dopo esito positivo e autorizzazione: `node scripts/reference-series.mjs --plan .local/preparation/g8-authorized/reference-plan.private.json --freeze-approved`. Verificare ricevuta, journal v1/v2, timestamp,10eventi/esclusioni. Nessuna lettura quote o consegna. Completare prima delle18:15, non iniziare a ridosso.
6. Crash: conservare artifact/intent, recuperare lo stesso piano entro finestra. Input cambiati/ambiguità richiedono review. Dopo deadline registrare lacuna, nessun recupero retroattivo o retry provider ambiguo.
7. Dopo freeze, nuova autorizzazione quote: account, eventuale catalogo, batch e controlli freschezza/identità/regole. Diagnostica da journal sigillato con `multimarket-diagnostic.mjs --report ... --goals-b2 --catalog ... --fixtures ...`, eventuale `--asian-evidence` realmente verificata. Senza prezzi freschi: probabilità senza EV corrente.
8. Contesto/regole/ticket e binding nuova serie→gestore devono superare gate propri prima di screening/consegna autorizzati. **Non usare `windows-orchestrator --progressive-once` per il freeze-only**: può accodare stati e creare un journal canonico. Consegne non autorizzate. Diagnostica incompleta non annulla un freeze valido.

Calcolo -150min, queue -135min, consegna -120min: margini distinti; soglia tecnica5min non è anticipo utile. Ritardo: nessuna proposta retroattiva. Priorità riferimento; challenger/B2/automazione possono restare bloccati senza perderlo.

## Verifiche e conservazione

PC Windows: **355 test superati**, lint0errori (warning preesistente `combinedPlayedOdd`), build Next/TypeScript riuscita. Test DPAPI con soli segreti sintetici; su CI Linux i5 casi Windows specifici non sono eseguibili. Nessun forecast originale G8.

| Benchmark sintetico14.414 selezioni | Build+JSON+HTML | Picco RSS |
|---|---:|---:|
| A invariato |4,172s|357,3MiB|
| B1 |5,249s|343,0MiB|
| B2 con evidenze sintetiche coerenti |6,946s|345,3MiB|
| B2 duplicati |5,137s|343,0MiB|
| B2 incompleto |1,858s|342,4MiB|

B2 normale: build6.855ms, JSON83ms, HTML7,6ms; probabilità circa5.685ms, un hash report. Varianti incomplete/duplicate invalidano attestazioni legate al vecchio hash: meno lavoro non prova maggiore velocità dei mercati ammessi. Timeout120s, esiti privati; conservata anche prova fallita per input di forma errata, poi corretta, senza worker orfani.

Payload A intero **deep-equal** al precedente artifact A senza tolleranze/campi omessi. Fit centrale+40resamples sintetici/1.490righe: v1 4,549s/86,5MiB, DC2,156s/137,3MiB, bivariato4,180s/141,0MiB. Bootstrap della diagnostica già presenti, separati dal costo fit. Challenger sintetico400righe:40bootstrap1,23s/104,1MiB. Nessuna validazione predittiva/SLA.

**3.400 file protetti preesistenti invariati per hash**, registry v1/codice-studio v2 validi. Journal, baseline, vault, backup, ledger ed esperimenti salvaguardati, nuovi output privati versionati. Nessun segreto/risposta acquisita/backup pubblicato. SHA e CI effettivi nella consegna/PR, non anticipati qui.

Codice nuovo: preparazione G8 e contesto, `reference-series`, trial/vault football-data, `challenger-refresh`, `diagnostic-goals-b2`, stage `orchestration/research-cycle`, CLI/test relativi. Moduli scientifici registrati, app, Firebase e workflow deploy invariati. Prossima attività: colmare/approvare i gate del **freeze-only G8**, senza subordinare il riferimento al challenger.
