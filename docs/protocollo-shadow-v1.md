# Protocollo shadow v1 — registrazione prima dell'implementazione

Definito il 10 ottobre 2026 dopo il congelamento della giornata 6. È un nuovo esperimento decisionale: NON preregistrazione retroattiva delle quote/previsioni già osservate in chat. Non cambia modello, dataset o journal congelati. Le soglie seguenti sono euristiche da valutare prospetticamente, non già dimostrate profittevoli.

## Unità, identità e tempi

Solo Serie A, bet365.it, Full Time Result fulltime, esiti 1/X/2, linea0, nessun giocatore. Abbinare fixtureID, squadre tramite alias espliciti, kickoff esatto, stagione/giornata, marketID/outcomeID e hash del report. Una quota duplicata/ambigua non viene scelta per convenienza. Versione originale del motore gol b630b78, configurazione invariata, studio storico verificato; ogni forecast mantiene provenienza e hash. Nessuna probabilità inserita dall'assessment entra nel calcolo.

Decisione generata dall'orologio reale, senza opzione CLI di retrodatazione. Forecast e dati acquisiti devono precederla, training precedente ai target. Osservazioni quote <=30 minuti, forecast <=24h, distanza forecast/quote <=30 minuti, decisione almeno5min prima del kickoff. changedAt non è un timestamp di sincronizzazione: se assente/vecchio oltre24h occorre conferma manuale esatta del prezzo. Prezzo >1, niente stato live/sospensione/bookmaker inattivo/marketActive non vero. Un override v2 positivo supera esclusivamente active=false; conserva tutti i flag originali. Conferma negativa blocca. Inattive non confermate rimangono osservazioni con riserva.

Le quote provider-active con identità/freschezza complete possono alimentare screening **shadow non verificato sul sito**; non diventano quote operative certificate. Override manuali, liquidazione, contesto e approvazione operativa restano separati. La liquidazione fulltime standard è l'ipotesi dichiarata per lo screening; mancanza di conferma delle regole è sempre un blocco operativo.

## Opportunità marginali

EV=p*quota-1. Richiedere EV centrale >=5%, EV al limite inferiore dell'intervallo bootstrap >=2%, ampiezza intervallo <=0.25, almeno40 repliche e fallimenti <=10%. Non introdurre soglie sulla quota o sulla probabilità della favorita; ordinare per EV inferiore e poi EV centrale, fixtureID/outcome per spareggio. Baseline di mercato solo lavagna 1X2 completa con gli stessi identificativi e tempi: p_i=(1/quota_i)/sum(1/quota). Dichiarare il margine e se ogni prezzo è verificato manualmente. Nessuna lavagna completata per imputazione. Una lavagna incompleta non invalida automaticamente l'EV di una singola quota, ma impedisce il confronto completo di mercato.

Categorie distinte: INSUFFICIENT_DATA, NO_VALUE, UNCERTAIN_VALUE, SHADOW_CANDIDATE. Intervalli marginali al95% con40 bootstrap non sono intervalli simultanei per30 esiti né protezione da ricerca multipla. La shortlist non è una prova statistica di alpha/value. Registrare il numero di esiti esaminati e tutte le esclusioni; nessuna ottimizzazione di soglie sul test2024/25–2025/26 o sull'esempio della chat.

## Combinazioni

Normalmente2–4 selezioni, estensione esplicita fino6. Una selezione per evento; vietare squadre ripetute anche in fixture diverse e mai costruire Bet Builder. Considerare dipendenze arbitrarie con limiti Fréchet: max(0,sum(p)-(n-1)) <= P(tutti) <= min(p). Ripetere con estremi marginali per un envelope di sensibilità, NON chiamarlo CI95 congiunto. Nessun prodotto delle probabilità e nessuna correlazione inventata. La probabilità congiunta puntuale resta null.

Il prodotto delle quote è soltanto un prezzo nominale diagnostico, non prova di una multipla offerta dal bookmaker. Una proposta shadow sostenuta dai limiti richiede: tutte le gambe disponibili manualmente, quota reale della combinazione verificata e legata agli esatti quoteID/hash report, limite inferiore EV combinazione >=5%. Rimane sperimentale, statisticaValidata=false, stake reale0€. Se manca prezzo combinato o il limite non sostiene valore: NO_BET con motivo; conservare le combinazioni esplorative. Valutare deterministicamente fino20.000 combinazioni, registrare troncamento; in caso di troncamento nessuna proposta finale. Non dichiarare un ottimo globale senza ricerca completa.

Un solo decision snapshot finale per stagione/giornata/versione shadow, senza sovrascrittura. Una eventuale proposta shadow unica, stake nominale massimo3€, nessuna puntata/pubblicazione. Il registro è separato dallo storico giocate. Anteprime sono esplicitamente non finali e tutte tracciate; il congelamento non è rinnovabile per cercare una proposta più conveniente dopo aver osservato risultati.

## Ciclo e risultati

Riutilizzare l'importatore ufficiale e il wrapper DPAPI: account free250 senza costi, catalogo cache7giorni, una richiesta quote per tutta la Serie A, massimo15/esecuzione, tetto prudenziale200/31giorni. Il ciclo non installa attività programmate e non effettua polling. Default locale; accesso API esclusivamente con opzione live esplicita. Aggiornamento risultati CC0 su commit pubblico fissato e snapshot distinto, senza ripetere il tuning. Per futuri forecast nuovi usare soltanto dataset osservati prima della generazione e righe disponibili prima del cutoff mensile; una fonte corretta posteriormente resta un rischio documentato. Conservare il dataset precedente, mai ricostruire decisioni passate con dati nuovi.

Valutazione futura legata a decision/journal/result hash: metriche predittive su tutte le previsioni, metriche dei candidati sul sottoinsieme esatto, rendimento soltanto simulato a prezzo realmente verificato, mai ROI reale. Nessun log-loss congiunto quando P congiunta non è identificata. Risultati mancanti/rinvii/correzioni restano pending/conflitti. Promozione operativa richiede separata approvazione dopo evidenze prospettiche; nessun flag nel file utente può autorizzarla.
