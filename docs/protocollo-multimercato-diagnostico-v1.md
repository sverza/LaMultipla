# Diagnostica multimercato v1 — percorso separato

Registrato il14 ottobre2026 alle17:33UTC, prima di ogni forecast originale di questo percorso. Versione `multimarket-diagnostic-v1`. Nuovo formato di consultazione per modelli/parametri già fissati: non sostituisce protocolli gol v1/v2, protocollo progressivo, gate o selettore. G6, journal e baseline precedenti non sono rigenerabili. Stake reale zero.

## Due percorsi e tempi

A: `shadow.mjs` rimane unica autorità della proposta shadow 1X2 fulltime. Studio v1, EV, contesto, liquidazione, disponibilità manuale, prezzo combinato e Fréchet invariati. `MODEL_NOT_AUTHORIZED` mantiene NO BET operativo anche se esiste MULTIPLA SIMULATA shadow.

B: `multimarket-diagnostic.mjs` produce soltanto `lamultipla-multimarket-diagnostic-v1`, privato, non importabile come proposta Android. `decision:null`, `eligibleForSelector:false`, `appDeliveryAllowed:false`. EXPLORATORY_VALUE non conferisce autorizzazione; validazione assente è distinta da NO_VALUE/UNCERTAIN_VALUE/INSUFFICIENT_DATA.

Riutilizzare studio v2 registrato verificando codice/protocollo. Nessun `--develop`, tuning o scelta di temperatura sui dati consumati. Il nuovo codice è fuori da engine/ e conserva l'identità dello studio. Refit mensile forward con parametri e bootstrap già fissati è forecasting, non tuning. Il nuovo CLI congela v2 tramite store esclusivo esistente soltanto nella prima finestra originale: kickoff iniziale meno360min fino a meno150min. Tutte10 gare future e riconciliate con calendario CC0/provider e manifest ufficiale, freschezze progressive; dataset osservato entro72h, cutoff mensile e data+48h invariati. Superare la scadenza durante i fit impedisce la pubblicazione. Nessuna CLI as-of. Intento/outcome immutabili per ogni invocazione; crash senza outcome resta incompleto. Journal già presente riusato senza ritimbratura; conflitti input bloccano. Non scegliere il migliore tra tentativi.

Per G7 congelare v2 nella finestra del16 **prima** delle quote del ciclo originale. Poi il gestore progressivo esistente congela v1 e acquisisce il report. Timestamp propri, non falsa simultaneità; quote successive a entrambi. Il gestore può osservare nuovamente CC0: eventuale commit/training diverso resta documentato, non motivo per selezione retrospettiva. Il CLI diagnostico non scarica dati, non chiama OddsPapi e non accoda/consegna. Il dataset gratuito va preparato tramite updater CC0/store esistenti, senza sostituire lo studio. Il vecchio shadow-cycle con estensione v2 non è il gestore G7 e non serve ad aggirarlo. Fallimento B non modifica A; se v2 manca prima delle quote, B originale è incompleto: niente fit successivo ai prezzi spacciato per originale contemporaneo.

## Proiezioni e incertezza

Per gara:1/X/2,Over e Under1.5/2.5/3.5,BTTS Yes/No. DC/bivariato più riferimento v1 già presente nel journal v2. Questo riferimento non è il journal scientifico originale v1: probabilità puntuali, nessun bootstrap ricostruito; CI1X2 originali restano nel percorso A.

Liquidazione integrata sulla griglia dei gol, win/halfWin/push/halfLoss/loss. CI marginali2.5/97.5 dai40bootstrap congelati, fallimenti<=10%, nessun nuovo fit durante consultazione. EV da settlementEV, CI EV direttamente dai bootstrap di liquidazione; p(win)×quota−1 solo quando non esistono liquidazioni parziali. Intervalli marginali di sensibilità, non simultanei o prova di profitto.

Altri prezzi solo col parser esistente e identità verificabile: team totals,doppia chance,DNB,AH con mapping manuale bound a report/quote/lato/linea. Multigol matematico senza parser prezzo verificato, nessun EV feed promesso. Corner/cards/players/BetBuilder non sono inferiti. Mercati non mappati restano anomalie, niente fuzzy matching.

Quote bet365.it fresche<=30min, successive al forecast; identità fixture/squadre/kickoff/mercato/outcome/quoteId esatta. Prezzi stale/preforecast/incoerenti conservati come osservazioni, prezzo corrente ed EV corrente null, esclusi dal ranking. Prezzi mancanti non azzerano probabilità o provano assenza di valore. Regole e contesto hanno stati separati: proiezione corretta non certifica giocabilità/settlement. Attestazioni manuali non certificate autonomamente.

Nessuna combinazione B entra nel selettore. Joint nello stesso incontro dalla griglia è matematica, non offerta BetBuilder. Fra gare nessuna indipendenza presunta né prodotto marginali. Nel percorso A resta il prezzo totale effettivo del ticket; prodotto singole non sostitutivo.

## Provenienza e validazione

JSON envelope/hash con codice/protocollo diagnostico, journal/studio/dataset/report/assessment/context; HTML statico privato senza fetch/script dallo stesso payload. Output esclusivi; dati reali/quote/dossier fuori GitHub. Tutti i tentativi conservati, niente selezione del migliore da valutare.

V2 nella propria coorte/study hash; B non entra in metriche v1/G6 e non modifica la preregistrazione v2. Gate esistente BTTS/Over2.5: prime60 giornate consecutive, almeno500 appaiati, coperture90/95%, confronti/calibrazione previsti. Altre linee/famiglie richiedono preregistrazione e gate propri prima dei nuovi dati. Superiorità predittiva non abilita automaticamente selettore o uso reale.
