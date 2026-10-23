# LaMultipla — ampliamento del motore probabilistico

## Esito

Implementati e collegati al ciclo shadow due modelli gol alternativi, distribuzioni coerenti per più mercati, probabilità di liquidazione, forecast immutabili di una nuova coorte e monitoraggio con gate prospettici. **Nessun nuovo mercato validato e nessuna autorizzazione al gioco.** Miglioramento di BTTS piccolo e soltanto sul campione di calibrazione; Over2.5 peggiora rispetto a v1. Non cambiano soglie, forecast o snapshot della giornata6.

## Diagnosi v1

I705 pronostici fuori campione v1 hanno sostenuto1X2, non BTTS/Over2.5. BTTS log-loss0.696060 contro0.695925 empirica e0.697623 Poisson lega: intervalli appaiati attraversano zero. Over0.695558 contro0.692268/0.692323: peggioramento puntuale. ECE/Brier superavano i gate: attribuire tutto alla calibrazione sarebbe inesatto. Gli anni del test sono consumati, non vengono riusati come nuovo holdout.

Limite dimostrato matematicamente e con test: a intensità fissate, rho DC corregge solo0–0,0–1,1–0,1–1; Over2.5 non cambia. Migliorare1X2 o modificare soltanto rho non garantisce migliore previsione del totale. Likelihood completa e bivariato possono cambiare le intensità, ma questo non assicura superiorità. Dati di contesto/xG non sono presenti nello storico utilizzato; non sono stati inventati o acquisiti da siti con diritti incerti.

## Nuova misura reale, non nuovo test

Fonte CC0 openfootball/football.json, commit e6744429ee395bc86f247348c6184bb08d4eb361, dataset locale4980 risultati. Studio eseguito realmente nel container e riprodotto via nuovo CLI; nessuna richiesta OddsPapi. Non è ancora riproduzione Windows. Entrambi i candidati scelgono halfLife365/ridge20 sul2022/23 (341 previsioni/39 esclusioni), temperatura0.8 sul2023/24 (358 previsioni/22 esclusioni). La temperatura minimizza il log-score dell'intera distribuzione, non l'EV o il risultato di un singolo mercato. V1 resta configurazione365/5/rho=-0.1.

Le358 righe riportate sono appaiate ai medesimi eventi di v1. **Il campione2023/24 ha scelto la temperatura: le cifre sono development/calibrazione, non validazione indipendente.**

| Log-loss, minore è meglio | V1 originale | DC likelihood completa | Poisson bivariato |
|---|---:|---:|---:|
| Punteggio esatto della griglia |2.773667|2.772177|2.771837|
| 1X2 |0.990348|0.990283|0.992717|
| BTTS |0.690865|0.689614|0.690099|
| Over2.5 |0.672610|0.675798|0.675720|
| Brier BTTS |0.248784|0.248197|0.248444|
| Brier Over2.5 |0.239811|0.241384|0.241344|

BTTS: differenza log-loss -0.001251 DC / -0.000766 bivariato. Over: +0.003188 / +0.003110, quindi peggiora. Entrambi battono puntualmente empirica/Poisson lega su questo campione per BTTS e Over, ma il confronto onesto con v1 rimane misto. Non usiamo questa osservazione per cambiare configurazione o gate dopo aver visto i risultati.

Diagnostica di calibrazione: ECE BTTS0.0242/0.0210; Over0.0457/0.0489. Medie gol osservate casa1.39665/ospite1.17877, medie predette DC1.33509/1.10373; variabilità predetta inferiore a quella osservata. La temperatura scelta0.8 concentra la distribuzione: sensibilità e bias residui da verificare nella coorte futura, non una correzione già dimostrata. Nel bivariato la componente condivisa tende a quasi zero (~1e-10 in alcuni fit): non emerge un vantaggio evidente della covarianza positiva. La covarianza empirica aggregata negativa non è una stima causale o condizionale sufficiente per scegliere un nuovo modello.

## Stato dei mercati e priorità

“Feed osservato” significa presenza nel precedente collaudo reale fornito dall'utente, non nuova acquisizione odierna. Il catalogo OddsPapi non prova disponibilità bet365.it per ogni evento. Il parser esclude nomi/tipi/linee non riconosciuti e statistiche giocatore nei mercati gol.

| Famiglia | Feed bet365.it osservato | Storico indipendente a0€ | Modello e codice | Validazione e limite |
|---|---|---|---|---|
| 1X2 |Sì|Risultati CC0|V1 invariato; B/C di confronto|V1 accettato retrospettivamente, prospettica ancora in corso; nessun operativo |
| BTTS |Sì|Risultati CC0|B/C implementati, bootstrap/EV shadow|500 futuri e superiorità appaiata; nessuna promozione attuale |
| U/O2.5 |Sì|Risultati CC0|B/C implementati|Peggiora controv1 in calibrazione; stessi gate futuri |
| Altre linee U/O / totali asiatici |Totali sì; non ogni linea|Risultati CC0|Proiezione coerente, push e quarter lines testati|Validazione per linea/famiglia, parser conservativo; non ereditano il gate2.5 |
| Gol squadra |Sì|Punteggi casa/ospite CC0|Marginali della stessa griglia|Valutare squadra/lato/linea e calibrazione dedicata |
| Doppia chance / DNB |Sì|Risultati CC0|Somma coerente / liquidazione con push|Nessuna validazione automatica dal test1X2; niente de-vig binario con push |
| Handicap asiatico |Sì, poche selezioni nel collaudo|Differenze gol CC0|Distribuzione differenze, half-win/half-loss testati|Lato/segno della linea richiedono mapping verificato; gate dedicato |
| Multigol |Non dimostrato nel collaudo|Risultati CC0|Range di gol matematicamente implementato|Nessun parser/price feed verificato, nessuna selezione abilitata |
| Corner |Sì|Fonte adeguata compatibile non acquisita|NB/bivariato conteggi ipotizzabile|Non supportato: serve storico continuativo, dispersione e regole |
| Cartellini/falli |Bookings e props osservati|Fonte adeguata compatibile non acquisita|Conteggi/esposizione/arbitro, solo ipotesi|Non supportato; bookings non equivalgono automaticamente a conteggio carte |
| Tiri/marcatori/altre props |Sì|Minuti/formazioni/eventi continuativi non disponibili|Minuti/impiego + intensità individuale, solo ipotesi|Non supportato; niente divisione arbitraria dei gol tra giocatori |
| Combinati / Bet Builder |Non verificato un prezzo combinato nel feed|Griglia solo per eventi di gol nello stesso match|Joint di liquidazione matematico testato|Nessun prodotto marginali; prezzo/rules reali e validazione congiunta ancora mancanti |

Priorità concreta: raccogliere coorte B/C BTTS–Over, poi protocolli per doppia chance/DNB e linee gol; non avviare fit corner/players con dati insufficienti. Per future versioni di Over valutare dispersione/NB o dipendenze Sarmanov/Mar-Co su un nuovo sviluppo e una nuova coorte. Non aggiunti ora come tentativi extra sul medesimo test. Fonti aggiuntive gratis diventano input solo dopo copertura/licenza/qualità verificate.

## Fonti e condizioni verificate il10/10/2026

- Openfootball: https://github.com/openfootball/football.json e LICENSE.md, CC0; risultati e calendario comunitari, non eventi/shots/xG, nessun SLA ufficiale. Dataset già conservato; nessun nuovo download di risultati della giornata6.
- Football-Data.co.uk: https://football-data.co.uk/data.php e https://football-data.co.uk/notes.txt; dispone di statistiche Serie A come corners/shots/cards/fouls, ma la pagina aggiornata09/10/26 limita uso a privati ed esclude esplicitamente prodotti di training e bot/scraper/AI. **Non importato, non usato per addestrare.** Gratuità non equivale a licenza adatta al nostro pipeline automatizzato.
- StatsBomb/Hudl: https://github.com/hudl/open-data, README, data/competitions.json e LICENSE.pdf. Catalogo Serie A maschile osservato2015/16 e1986/87, non storico corrente continuativo2026/27. Licenza separata; testo PDF integrale non estratto/verificato in questa fase, nessuna ingestione o concessione di pubblicazione presunta. Utile candidato di ricerca, non fonte operativa certificata per Serie A attuale.
- OddsPapi: https://oddspapi.io/en/docs/get-markets, get-odds-by-tournaments, requests-and-quota. Solo fonte di prezzi, nessuna quota come feature del modello. Esempio docs BTTS ha type generico totals mentre il collaudo aveva bothteamsscore: usiamo mapping conservativo del report, non classificazione dedotta dal nome generico. Nessuna chiamata API nuova, costo0€; diritti di pubblicazione app ancora separati.
- Ricerca primaria alternativa: https://arxiv.org/abs/2103.07272 (dipendenze/Mar-Co) e https://arxiv.org/abs/2307.02139 (estensioni sul calcio femminile); ipotesi e dati non trasferiti come prova di validità Serie A.

## Integrazione, monitoraggio e prove

Nuovo CLI sviluppa e congela una coorte distinta, stessa interfaccia schedule e stesso store; il wrapper/ciclo shadow esistente accetta ExperimentalStudyPath, prepara i forecast prima dell'acquisizione e aggiunge experimentalMarkets alla decisione originale. EV e selector v1 restano; i nuovi mercati non entrano in una multipla. Forecast v2 disponibili solo per nuove giornate dal13/10, mai round6. Valutazione CC0 successiva, metriche appaiate,500 eventi/coorte, controllo molteplicità e conflitti di correzioni. Nessun scheduler creato o attivato.

Il monitoraggio separa metriche rolling dal test confermativo: finestra delle prime60 giornate consecutive congelate (600 pianificate), con almeno500 eventi appaiati, chiusa48h dopo l'ultimo kickoff. Le giornate seguenti non allargano il campione del test. Questa precisazione è registrata dopo lo sviluppo storico ma prima di ogni forecast v2 reale, impedisce peeking/selezione dell'istante favorevole e non cambia i parametri in funzione delle metriche osservate. Nessuna promozione da un semplice andamento positivo o da una coorte incompleta.

Test: likelihood/gradienti, convergenza, momenti bivariati, invarianza Over2.5 rispetto a rho, quarter lines/DNB/doppia chance, dipendenze nella griglia, no leakage/round6, override manuali senza cambiare flag, freeze esclusivo, nuovo ciclo prima-prezzi, CLI locale, scoring e conflitti, gate500 e nessuna autorizzazione automatica. I test di acquisizione e future partite sono **sintetici/mock**, marcati come tali. La misura development invece usa risultati storici reali. Non dichiarata una nuova validazione fuori campione o un collaudo multimercato Windows non eseguito.

Verifica finale locale: **85/85 test passati**, lint0 errori e1 warning preesistente in app/components.tsx, build Next/TypeScript riuscita. Test aggiunto sulla finestra confermativa: una61ª giornata non cambia il confronto primario; una lacuna tra le prime60 impedisce il gate. Nessuna modifica a scripts/lib/goals, scripts/lib/prospective, protocollo v1, fixture round6, app/public o workflow.

Artefatto development finale reale: `a27d7053004264a4af6204d31b932b9bbe76d9f6963249f5e1d1b8969ff23268`, iniziato2026-10-10T20:19:12.993Z, completato20:19:26.971Z. Code SHA256 `a6566dca426a5ed3bd6311ed355468c66fdf061f91cc7ebed251794b26389cf2`; protocollo SHA256 `6a70e734d664d1758c06856691e990c883be6a766edae57e3800bc10610c5c58`; dataset SHA256 `32919619e2baac8db221c53373fc46e269a5075e4d94cce4c207e2eb6920cdfe`. Il CLI ha registrato repository b704835 con dirty=true durante lo sviluppo; gli hash identificano precisamente il codice nuovo e il protocollo, senza attribuire il nuovo modello al solo parent commit. Risultati numerici identici alla precedente esecuzione development; il nuovo artefatto associa la precisazione prospettica preregistrata prima di nuovi forecast. Registro v1 ricontrollato: codice canonico `9f3164d585f686ee7ebfcb7a87e415a6fedde6992d1ab4104349a860c054ff11`, protocollo canonico `8fa215bc08008e86c90d834b666de42a50235940f000167cc1a7e0b721c0977b`, invariati. Artefatti privati non aggiunti al repository.

Controllo automazioni read-only: “Schedina Serie A 2.1 - audit” è ancora attiva e può pubblicare via prompt precedente. Non usa questa pipeline privata/registry. Nessuna modifica a task/workflow; occorre autorizzazione per sospensione/riallineamento prima dell'automazione continuativa. Il codice nuovo non pubblica nulla, ma non può controllare un altro trigger attivo in una conversazione distinta.

La pipeline tecnica è ampliata, la capacità predittiva valida no: oggi solo1X2 ha evidenza retrospettica, tutti i nuovi mercati restano esperimenti o non supportati. Prima di una prossima multipla operativa mancano prove prospettiche, approvazione dei mercati/regole, controlli di contesto e giocabilità, evidenza congiunta e prezzo reale della combinazione; NO_BET resta un risultato previsto.
