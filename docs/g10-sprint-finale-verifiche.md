# G10 — sprint finale e prova generale sintetica

Questo sprint non autorizza né esegue un freeze G10, un pilot o un'acquisizione provider. Il pacchetto privato esistente e i suoi hash rimangono invariati. I comandi effettivi e i percorsi delle evidenze sono nel RUNBOOK privato, non in questo documento pubblico.

## Procedura scientifica

La prova generale `tests/g10-dress-rehearsal.test.mjs` utilizza un universo di dieci fixture esplicitamente sintetiche e 320 risultati inventati, in una directory `SYNTHETIC-G10-*`. Esercita gli algoritmi originali, non un mock del risultato: 41 calcoli v1 e 83 v2, inclusi i bootstrap, poi adapter MoviOdds, proiezioni probabilistiche e combinazioni esplorative. Il clock artificiale del 31 ottobre è distinto dai tempi reali misurati. Non è una misura delle prestazioni del futuro dataset autentico.

Il test interrompe dopo v1, conserva il journal, riprende v2 e verifica il replay senza riscritture. Input cambiati, clock retrogrado e finestra chiusa vengono rifiutati. Nessun consenso scientifico autentico viene prodotto. Il helper rimane sotto `tests/fixtures`, senza ingresso nella CLI autentica.

La finestra proposta per sabato è **09:00 ≤ Europe/Rome <12:30**, ossia **08:00 ≤ UTC <11:30**. Anche il completamento deve avvenire prima della chiusura. L'universo scientifico resta di dieci partite; la prima analisi riguarda soltanto lo slot di tre incontri del sabato. Non rinnova la validità del forecast per domenica o lunedì.

Prima di sabato servono l'approvazione esplicita del pacchetto/hash e dei **124 fit/bootstrap protocollari**, e l'autorizzazione alla shortlist internazionale nello slot esatto. Non si tratta di retuning. Il budget pubblico MoviOdds già concesso non viene rinnovato: le due catture previste restano entro quel plafond. Il runbook richiede la riconferma fresca delle fonti prima del freeze e una nuova cattura dei prezzi dopo `FROZEN_VERIFIED`.

## Stati e limiti

Una shortlist internazionale non richiede una verifica manuale di ogni quota italiana. Mantiene comunque prezzi internazionali, tempi effettivi, disponibilità, universo/slot, esclusioni, intervalli marginali e limiti Fréchet. Il prodotto delle singole è soltanto teorico: ticket effettivo, probabilità congiunta puntuale ed EV combinato verificato non sono inventati.

L'assenza di evidenze resta `ANALYSIS_INCOMPLETE`, anche se esistono combinazioni parziali. Un esito senza combinazioni riguarda soltanto un perimetro dichiarato completo. Nessun output abilita una scommessa o modifica la policy sintetica M3-B.

## Regressione e integrità

I risultati completi delle esecuzioni, i tempi, i replay storici G8 e l'inventario di integrità sono conservati nei diagnostici privati dello sprint. La suite locale contiene 682 test, inclusi 12 nuovi test di UI/archivio, Release e prova generale. Regressione seriale e parallela: **682/682**, nessuno skip Windows. Test dedicati: **241/241**. Lint senza errori, con un avviso preesistente non correlato in `app/components.tsx`; build statica completata. La verifica remota rimane un passaggio successivo al push autorizzato, da non confondere con questi risultati locali.

Il solo diff a file preesistenti dell'app è l'aggiunta della sezione multimercato e del suo riconoscimento come contenuto sperimentale da rifiutare nello storico legacy. Nessun algoritmo, journal, freeze, selettore 1X2, grant o dataset scientifico viene modificato. Nessun provider è interrogato dai test; il guard di rete impedisce richieste esterne Node durante la regressione. Un eventuale tentativo opzionale di Next di leggere metadati npm è bloccato e distinto dalle chiamate applicative.

Il collaudo è sintetico e offline. Non costituisce una prova end-to-end autentica G10 né un'autorizzazione all'importazione dei suoi futuri risultati nell'app.
