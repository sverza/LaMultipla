# Protocollo di sviluppo gol v2 e roadmap dei mercati

## Diagnosi misurata, senza rituning del test v1

Sullo studio v1 già congelato (705 previsioni), BTTS ha log-loss0.696060 contro0.695925 empirica/0.697623 Poisson lega. CI95 della differenza: [-0.010925,+0.011789] e [-0.013268,+0.010721]. Non c'è un miglioramento dimostrato. ECE0.036552 e Brier0.251386 superano i controlli di calibrazione/non inferiorità, ma non il criterio di superiorità. Non attribuire automaticamente il fallimento a una cattiva calibrazione.

Over2.5: log-loss0.695558 contro0.692268/0.692323, quindi peggioramento puntuale; CI95 differenze [-0.014225,+0.020714] e [-0.014281,+0.020573]. ECE0.048767 e Brier0.251132 passano i rispettivi gate v1, ma il segnale non supera le baseline. Log-loss per stagione:0.686602 nel2024/25 e0.704288 nel2025/26. Questa instabilità è descrittiva, non prova di una causa particolare.

Ipotesi da verificare su development: dispersione e covarianza dei gol non spiegate dal Poisson; effetti di contesto assenti; correzione rho limitata alle quattro celle; tuning medio su1X2/BTTS/Over invece della likelihood completa dei risultati. Non affermare che una di queste ipotesi sia già confermata. Il rho v1 NON è MLE della likelihood completa DC. I test2024/25–2025/26, e i50 shadow2026/27 già esaminati, sono consumati e non possono diventare il nuovo test v2.

## Disegno v2 fissato prima di nuovi fit

Fonte iniziale resta CC0 openfootball, con snapshot/versioni/acquisizione; nessun dato di quote nei parametri. Development2013/14–2021/22, tuning walk-forward2022/23–2023/24, ultimi blocchi development per calibrazione temporale. Gli anni già esaminati possono essere usati come sviluppo dichiarato, mai chiamati nuovi holdout. Stesse finestre temporali4anni, disponibilità date+48h, esclusione <20 presenze.

Tre candidati massimi: (A) v1 originale come riferimento; (B) Poisson penalizzato con rho stimato nella likelihood completa DC e vincoli di positività; (C) bivariato Poisson con componente condivisa non negativa (non rappresenta covarianza negativa). Per B/C fissare griglia halfLife365/730, ridge5/20 prima del fit. Scegliere una configurazione per modello esclusivamente tramite log-score della distribuzione completa dei gol sul tuning. Eventuale temperatura unica della griglia [0.8,1,1.2], scelta sui blocchi di calibrazione development, poi renormalizzazione: tutti i mercati derivano dalla stessa distribuzione. Vietati calibratori binari separati che rompano la coerenza.

Questa PR definisce il protocollo; **B/C non sono ancora implementati o validati**. Prima di produrre forecast v2 registrare commit, dataset, config scelta, cutoff e data di attivazione. La prima coorte valutabile inizia dalla prima giornata futura dopo quella registrazione, mai dal round6 già congelato. Nessun confronto prospettico prima di almeno500 previsioni della nuova coorte, anche se richiede una seconda stagione; report descrittivi intermedi, nessun arresto anticipato perché una curva migliora.

Gate distinti per mercato: copertura>=90% degli eventi confermati; fonte>=95% risultati nei blocchi di calendario coperti; CI95 appaiato settimanale della differenza log-loss<0 contro empirica e Poisson lega; Brier non peggiore oltre0.005; ECE<=0.08 BTTS/Over, <=0.10 classi1X2. Bootstrap almeno1000 blocchi, seed20261010. Per selezione fra B/C usare un criterio predefinito di superiorità rispetto a v1 e correzione Bonferroni per i quattro confronti primari (2modelli×2mercati): intervalli98.75%, oltre ai confronti baseline. Se nessuno passa, mercati restano disabilitati. Nuove idee dopo il test richiedono v3 e un'altra coorte futura, non proseguire ottimizzando sullo stesso campione.

Diagnostica predefinita: momenti/covarianza empirici e predetti, dispersione residua per squadra/periodo, frequenze0–0/1–1, calibrazione per decili e stagioni, sharpness e intervalli, drift/coverage, errori per neopromosse. Questi report non devono scegliere automaticamente nuovi parametri dal test. Il passaggio a NB/Sarmanov/xG è una successiva ipotesi, non una funzione che si dichiara già disponibile.

Riferimenti primari per studiare le alternative, senza presumere risultati trasferibili alla Serie A: Petretta et al., https://arxiv.org/abs/2103.07272; Michels et al., https://arxiv.org/abs/2307.02139 (studio su calcio femminile).

## Roadmap con gate per mercato

| Mercato | Dati/modello necessari | Stato e condizione di attivazione |
|---|---|---|
| 1X2 | Risultati, modello v1 e coorte prospettica | Screening shadow implementato; approvazione operativa assente |
| Doppia chance / DNB | Derivabili dalla distribuzione1X2; DNB con massa push esplicita | Somme coerenti calcolabili, ma nuovi gate settlement/value e validazione per selezione prima dell'abilitazione |
| Altre linee U/O, gol squadra | Griglia dei gol; punteggi team; validazione per famiglia/linea, controllo molteplicità | Calcolabilità non equivale a affidabilità; aspettare evidenze v2, niente stime abilitate ora |
| Handicap/totali asiatici | Griglia differenza/totale; quarter lines con half-win/push/half-loss | EV settlement già riutilizzabile; parser linee e probabilità di liquidazione più test fuori campione dedicati mancanti |
| Corner | Conteggi casa/ospite storici, dispersione, covarianza, contesto e regole | Nessuna fonte Serie A corrente continua autorizzata già validata; studiare NB/bivariati, non usare il modello gol |
| Cartellini | Gialli/rossi, arbitro, minuti, regole bet365 Bookings vs numero carte | Feed Bookings non è numero di cartellini; dati/settlement/modello/holdout specifici mancanti |
| Tiri e statistiche giocatore | Eventi, formazioni/minuti/esposizione, sostituzioni, definizioni del fornitore | Nessun modello; risultati finali openfootball insufficienti; nessuna imputazione di minuti o tiri |
| Marcatori | Minuti/probabilità impiego, intensità giocatore e squadra, rigori | Richiede modello separato e prova fuori campione; non dividere gol squadra per giocatori presunti |
| Multigol / combinati / Bet Builder Max | Eventi congiunti dalla griglia o modello specifico; prezzi reali e regole del bookmaker | Non ricavare quote combinate dalle singole; disponibilità nel catalogo non prova copertura/prezzo o modello affidabile |

Hudl/StatsBomb Open Data è un candidato gratuito per ricerca, con attribuzione e licenza propria da esaminare integralmente prima di ingest/pubblicazione. README https://github.com/hudl/open-data/blob/master/README.md e catalogo https://github.com/hudl/open-data/blob/master/data/competitions.json: per Serie A sono elencati2015/16 e1986/87, non una copertura corrente2026/27. Non è sostituto dimostrato di uno storico continuo per player/corner/cartellini. Nessuna API privata o scraping aggiunti e nessun contratto a pagamento proposto.
