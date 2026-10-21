# B2 — Adapter diagnostico FT e handicap asiatici

Versione: `goals-mapping-b2-v1`. Sprint G8, 21 ottobre 2026.

## Ambito realizzato

Il nuovo adapter esterno conserva i mapping B1 (doppia chance, totali FT, gol squadra e DNB) e applica gli stessi controlli esatti della catena catalogo → snapshot grezzo → report → fixture del journal anche a 1X2, BTTS e handicap asiatici FT. Non modifica il parser scientifico, le distribuzioni, gli studi registrati, il selettore o le sue soglie.

Il report viene ricostruito una sola volta; catalogo, fixture grezze, quote ed evidenze sono indicizzati prima del ciclo sulle selezioni. I fingerprint globali non sono ricalcolati per ciascuna quota. I controlli e la cache probabilistica della milestone A restano attivi. `buildB2Diagnostic` è un percorso opt-in separato: A e B1 mantengono le proprie API e semantiche.

## Handicap asiatici: capacità implementata, evidenza reale ancora necessaria

Il catalogo locale osservato contiene `Asian Handicap`, tipo `spreads`, periodo `fulltime`, esiti `1` e `2`. Non espone un campo esplicito che certifichi se la linea sia relativa alla squadra selezionata o sempre alla squadra di casa. Il solo nome, l'ordine degli esiti e il segno numerico non dimostrano la semantica.

Per questo motivo **nessuna quota asiatica viene interpretata automaticamente**. Anche un vecchio `settlementMapping` non sostituisce l'evidenza richiesta dal nuovo adapter. L'assenza di un'attestazione esatta mantiene la quota tra le anomalie/esclusioni; non equivale ad assenza di valore statistico.

`asianEvidenceTemplate` produce un modello privato intenzionalmente incompleto. L'attestazione deve legare schema, hash del report/catalogo/snapshot, quote ID e fingerprint dell'identità a:

- ruolo casa/trasferta e selezione esatta verificati;
- linea originale, base esplicita `HOME_SIDE` oppure `SELECTED_SIDE`, linea firmata della selezione;
- revisore, evidenza e timestamp non futuro, successivo all'acquisizione e recente;
- URL ufficiale delle regole bet365, relativo hash e versione;
- FT con recupero, esclusione di supplementari/rigori e verifica di rimborsi/rinvii.

La conversione dell'eventuale linea riferita alla squadra di casa è registrata nella specifica diagnostica e non riscrive la linea originale del report. Il software controlla coerenza e provenienza dell'attestazione, **non certifica autonomamente la verità di una verifica umana**. Un'attestazione non rende il prezzo corrente: restano separati controlli di disponibilità, freschezza, contesto, liquidazione e ticket combinato.

## Probabilità e liquidazione

Le probabilità dei cinque payoff (`win`, `halfWin`, `push`, `halfLoss`, `loss`) derivano esclusivamente dalle griglie gol già congelate. Linee intere, mezze e quarti usano le funzioni scientifiche esistenti. Gli intervalli marginali e gli intervalli EV usano gli stessi bootstrap conservati; nessun fit o tuning viene eseguito dal diagnostico. Un rimborso non è una sconfitta. Le linee non rappresentabili o fuori dominio vengono rifiutate.

1X2, Over/Under FT, BTTS, gol squadra, doppia chance e DNB restano analizzabili soltanto con identità e dati di origine verificabili. Le linee di totali intere e a quarti sono già gestite da B1: non vengono rinominate in una nuova offerta provider non dimostrata.

Risultato esatto, handicap europei, Multigol e Bet Builder non vengono aggiunti per analogia matematica: il contratto del motore congelato non rappresenta tutte queste liquidazioni/identità. Corner, cartellini, falli e giocatori restano fuori ambito.

## Verifiche e limiti

I test sintetici B2 coprono equivalenza dei mapping B1, identità FT 1X2/BTTS, assenza e ambiguità delle evidenze, inversioni casa/trasferta, hash e ID alterati, periodi e player errati, duplicati, timestamp, linee intere/mezze/quarti, rimborsi, half-win/half-loss, payoff EV, probabilità e intervalli bootstrap esatti, prezzi inattivi/scaduti e divieto di consegna/promozione.

I dati e le attestazioni sintetici dimostrano il funzionamento del codice, non la semantica delle quote realmente acquisite, la continuità di una fonte o la validazione predittiva di un mercato. B2 è quindi **implementata nel percorso diagnostico; l'impiego reale degli handicap resta bloccato senza evidenza documentata del lato/segno e delle regole**. Tutti i nuovi record hanno `eligibleForSelector:false`; stake reale zero.

Test mirato: `node --test tests/goals-b2.test.mjs`. Suite, benchmark e verifiche dello sprint sono riportati nel rapporto operativo complessivo.
