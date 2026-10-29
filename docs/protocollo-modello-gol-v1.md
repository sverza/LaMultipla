# Protocollo sperimentale gol v1

Definito prima del codice del modello, 10 ottobre 2026. Nessuna quota corrente o storica entra nelle stime. L'app esistente calcola EV su probabilità fornite dall'utente: non è un modello addestrato. Storico schedine e patch non sono un campione completo di risultati e non vengono usati.

## Dati e diritti

Fonte: https://github.com/openfootball/football.json, risultati `it.1.json`, licenza CC0-1.0 https://github.com/openfootball/football.json/blob/master/LICENSE.md. Nessuna chiave/carta/costo; copia e analisi ammesse dalla licenza dichiarata. Provenienza upstream openfootball/italy. Congelare commit, SHA256 dei file e licenza. Fonte comunitaria, nessuna garanzia di completezza/correttezza; generazione JSON giornaliera non garantisce aggiornamento dei risultati upstream. Non utilizzare per infortuni, formazioni, corner, cartellini o giocatori.

Importare 2013/14–2026/27 disponibili. Validare stagione/competizione, data reale, squadre distinte, gol interi 0–30; accettare `score.ft` e array `score` di due valori del formato sorgente. Rifiutare conflitti duplicati, conservare manifest con mancanti/futuri e anomalie. Nessuna imputazione di gol. Alias squadre espliciti, mai fuzzy. Il giorno è noto, il fuso di `time` no: ignorare `time` e usare fine giornata + margine, `availableAtUtc=date+48h`. È un'assunzione conservativa per backtest, NON una prova della disponibilità storica del dato. Un dataset scaricato oggi può contenere correzioni retrospettive: validazione retrospettiva, non certificazione point-in-time. Per validazione prospettica servono snapshot futuri immutabili e risultati acquisiti successivamente.

## Separazione temporale

Finestra mobile ultimi 4 anni, ritardo risultati 48h. Allenamento iniziale 2013–2021; tuning su 2022/23 e 2023/24 con previsioni prima dei risultati, refit al primo giorno UTC di ciascun mese. Scegliere una sola configurazione con minima media log-loss dei tre mercati, esclusivamente sul tuning. Bloccarla prima di valutare 2024/25 e 2025/26 (test finale). Escludere date successive al cutoff dichiarato. 2026/27 solo shadow, nessun tuning. Eventuali revisioni del protocollo avranno nuova versione e nuovo test; non riutilizzare il test per scegliere configurazioni.

## Baseline e modello

Baseline 1: frequenze empiriche 1/X/2, Over 2.5 e BTTS, smoothing Laplace, stesso training disponibile. Baseline 2: Poisson indipendente con medie gol casa/trasferta di lega. Modello: regressione Poisson log-lineare attacco/difesa squadra, intercetta e vantaggio casa, penalizzazione L2 degli effetti squadra. Pesi temporali esponenziali. Griglia predefinita: half-life 365/730 giorni, ridge 5/20, rho Dixon-Coles -0.10/0/+0.10. Rho è iperparametro scelto sul tuning, NON un parametro stimato con la likelihood completa Dixon-Coles: chiamare il modello Poisson penalizzato con correzione DC. Rho 0 è confronto ablation Poisson. Vincoli positività delle quattro celle corrette. Ottimizzazione verificata per convergenza; nessuna previsione su fit fallito. Squadra con meno di 20 presenze nel training: nessuna previsione.

Distribuzione unica P(gol casa, gol ospite) su griglia 0–30 con controllo massa omessa <1e-8 e normalizzazione. Da essa: 1X2, BTTS, totali gol. Validazione v1 esclusivamente fulltime 1X2, BTTS e Over/Under **2.5**. Altre linee calcolabili sperimentalmente ma non abilitate. Nessun marcatore/corner/cartellino/handicap o combinazione certificato.

## Metriche e accettazione preregistrata

Log-loss (1X2 multiclass, altri binari), Brier (1X2 somma componenti), calibrazione per decili uniformi ECE e frequenze con intervalli Wilson 95%. Pubblicare copertura, esclusioni per squadra, tutte le configurazioni di tuning, metriche per stagione e aggregazione test. Confronti appaiati sulle stesse partite; incertezza della differenza log-loss con bootstrap 1000 repliche di blocchi settimanali (seed fisso 20261010). Non interpretare il rendimento delle scommesse come metrica probabilistica primaria.

Per ciascun mercato: almeno 500 eventi di test predetti, copertura >=90% dei risultati disponibili, >=95% risultati registrati in ciascuna stagione test rispetto a 380; limite superiore CI95 della differenza log-loss <0 contro **entrambe** le baseline; Brier non peggiore di entrambe oltre 0.005; ECE <=0.08 per binari, <=0.10 per ciascuna classe 1X2. Qualsiasi fallimento = mercato non validato. Queste soglie sono operative sperimentali, non garanzia di valore o redditività. La validazione retrospettiva resta distinta dall'approvazione operativa: nessuna abilitazione automatica senza revisione delle evidenze e validazione prospettica.

## Incertezza e limiti

Previsioni correnti: almeno 40 bootstrap del training per blocchi di date, rifit del modello, intervallo percentile 95% per probabilità. Se oltre 10% bootstrap fallisce: incertezza insufficiente, nessuna ammissione operativa. Questi intervalli misurano sensibilità al campione, non errori sistematici, assenze/tattica o tutte le dipendenze. Log delle esclusioni e dei cutoff; seed deterministico. Non usare probabilità centrale senza intervallo per affermare value robusto. Nessuna probabilità combinata fra eventi calcolata.

NO_BET per evidenze insufficienti distinto da assenza di valore dopo tutti i controlli. Modello e prezzi sono flussi separati. La CLI di studio salva in `.local/model`, non pubblica, non modifica schedine/app/storico, non chiama OddsPapi. Output sperimentali non compilano automaticamente un assessment validato. Prima della prossima multipla: qualità/identità dati, mercati che superano test e revisione, snapshot prospettici, contesto e liquidazione, quote fresche verificate, incertezza ed EV, dipendenze fra selezioni.

Riferimento metodologico: Dixon & Coles (1997), JRSS C 46(2), 265–280, https://doi.org/10.1111/1467-9876.00065. L'implementazione iniziale usa la correzione a quattro celle, non replica tutte le scelte del paper.
