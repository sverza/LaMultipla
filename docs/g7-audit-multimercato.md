# G7: audit e consultazione multimercato

## Audit corrente

| Componente | Già implementato | Limite |
|---|---|---|
| goals-v1 | fit mensile, probabilità/CI/bootstrap1X2, journal scientifico | Journal conserva solo1X2; bridge puntuale BTTS/Over2.5 non conserva CI o conferisce validazione. |
| Dixon–Coles v2 | likelihood completa, rho stimato, temperatura, bootstrap | Development/calibration fissati, zero mercati prospetticamente validati. |
| Bivariato v2 | componente condivisa/griglia coerente, stessa procedura | Covarianza non negativa; validazione indipendente mancante. |
| engine/markets | BTTS,totali,teamtotals,DC,DNB,AH/push/halfWin/halfLoss; multigol matematico | Parser conservativo, AH lato/segno manuali; multigol senza parser quote. Corner/cards/players/BetBuilder esclusi. |
| engine/screen | p di liquidazione,EV,CI EV,quattro classi | eligibleForSelector:false sempre. NO_BET statico del contenitore indica mancata autorizzazione, non assenza di valore. Mancavano matrice completa e CI probabilità consultabili. |
| Vecchio shadow-cycle | extension-study/journal v2 prima delle quote | Non è il gestore progressivo G7; non usarlo per aggirarlo. |
| Gestore progressivo | v1 originale/revisioni,quote batch,shadow.mjs,consegna | Config attuale senza v2; resta invariata. B indipendente preparato. |

[Nuovo protocollo diagnostico](protocollo-multimercato-diagnostico-v1.md), fuori da engine/ per preservare gli hash registrati. Nessun tuning ripetuto o forecast G7 originale durante lo sviluppo.

## Consultazione G7

110 selezioni teoriche (11/gara), per DC/bivariato/riferimento v1:330righe. Probabilità e CI marginali DC/bivariato, liquidazioni complete; riferimento puntuale senza inventare CI. Prezzo/EV/CI EV con report fresco e schema esatto. Assenze PRICE_NOT_OBSERVED; stale non correnti. Altri mercati riconosciuti dal parser riportati singolarmente. Ranking EXPLORATORY_VALUE diagnostico, nessuna proposta Android.

CLI produce JSON immutabile e HTML privato offline: partita/modello/mercato/p/CI/prezzo/EV/classe/esclusioni. JSON anche anomalie, componenti parziali e funnel selettore. Prove sintetiche non sono G7 reale o validazione dei modelli.

## Sequenza, previa nuova autorizzazione

1. G6 il15: original-g6-check --record separato, pending se CC0 manca, originali/fonte/baseline invariati.
2. Il16 preflight/contesto/account gratuito; circa14:20 unica fixtures e nuova riconferma/versione manifest. Budget invariato:2 richieste attese,max3 con markets soltanto necessario.
3. Dataset CC0 osservato e immutabile tramite updater pubblico refreshDataset/store esistenti, senza quote. Studio v2 già registrato, niente --develop. Preflight diagnostico readonly, nessun fit/rete/scrittura.
4. Dalle14:45 congelare v2 col nuovo CLI, quindi gestore progressivo A normale: entrambi precedono l'unico report quote. Durata reale dei fit v2 G7 non ancora misurata, nessun ETA certificato. Se B fallisce o mette a rischio la finestra, registrarlo incompleto e preservare A. Non fare il fit dopo prezzi già osservati. Nessun polling/task/servizio aggiunto.
5. Subito dopo il report fresco: report B da journal v2/report già acquisito, zero nuove API. Nuove verifiche producono report versionati, nessun journal/report vecchio riscritto.
6. A conserva verifiche contesto/regole/ticket esatto; quote<=30min,freeze150/queue135/consegna120. B non estende scadenze e non viene consegnato. Nessuna scelta retrospettiva di tentativi.

Placeholder espliciti, da sostituire con percorsi privati reali revisionati:

```powershell
node scripts/multimarket-diagnostic.mjs --preflight --study STUDIO-V2.json --dataset DATASET.json --schedule MANIFEST.json
# Solo nella finestra originale del16 e dopo autorizzazione:
node scripts/multimarket-diagnostic.mjs --freeze --study STUDIO-V2.json --dataset DATASET.json --schedule MANIFEST.json --calendar SNAPSHOT-CALENDARIO.json
# Dopo il report fresco del ciclo A, zero rete:
node scripts/multimarket-diagnostic.mjs --report --study STUDIO-V2.json --journal JOURNAL-V2.json --odds-report REPORT-FRESCO.json --assessment VERIFICHE.json
```

Opzioni report --context/--decision legate a stessa giornata/report; decisione produce soltanto funnel. Report senza odds-report mostra prezzi pending. --inspect legge; --synthetic-audit registra7 scenari senza rete/fit; --audit-selector --decision FILE mostra blocchi del tentativo salvato.

Aperti: autorizzazione forecast/ciclo/quote/consegne, CC0 realmente disponibile (download nuovo non significa risultati nuovi), contesti, manifest/provider freschi, regole/prezzi manuali. Nessun deploy/APK richiesto. Launcher privati con HEAD583605 vanno revisionati per il nuovo commit, non aggirati.

## NO BET: gate distinti

| Gate | Effetto |
|---|---|
| Prezzi1X2 | Missing/stale/identità o flag negativi escludono; active=false richiede override esatto. Terna completa necessaria per baseline de-vig, non ogni candidato. Frequenza reale non misurata. |
| Contesto | Candidato richiede entrambe le squadre e calendario tutte competizioni; basta avere due gare pronte, non tutte10. Oggi0/10 è blocco concreto. |
| EV/CI | PointEV>=5%,lowerEV>=2%,larghezza p<=25pp. Punto positivo con CI sfavorevole resta UNCERTAIN_VALUE. |
| Minimo2 | Una singola non forma multipla; gare/squadre distinte,normalmente2–4,max6. |
| Liquidazione | Attestazione esatta mancante è insufficienza, non assenza di valore. |
| Prezzo combinato | Ticket ordinario esatto disponibile/fresco; prodotto singole non è offerta. Senza evidenza COMBINATION_EVIDENCE_INSUFFICIENT. |
| Fréchet | lowerjoint=max(0,sum(lowerp)−(n−1)); quota×lowerjoint−1>=5%. lowerjoint0 impossibile a ogni prezzo finito. |
| MODEL_NOT_AUTHORIZED | NO BET operativo sempre; non impedisce SHADOW_BOUND_PROPOSAL/MULTIPLA_SIMULATA. |

Esempio matematico controllato, non dati reali: due p=.75,lower=.70,quote1.50 passano singole; lowerjoint=.40. Ticket sintetico esplicitamente fornito2.25 produce lowerEV−10%; serve almeno2.625 per+5%. Non si stima il ticket dal prodotto. Tre lower=.60 producono lowerjoint0. Scenario p=.95,lower=.94,quote1.20,ticket fornito1.40 passa il selettore immutato, stake0: possibilità matematica, non frequenza realistica.

Fréchet può rendere proposte eccezionali con vantaggi marginali modesti, soprattutto aumentando leg. Non stimare un tasso reale senza cicli originali. Funnel registra scarti separati; conteggi sovrapposti, nessuna frequenza inventata o soglia allentata.

## Roadmap

1. **Predizione per mercato:** coorte v2 separata, freeze prima prezzi/kickoff. BTTS/Over2.5 seguono protocollo esistente: prime60giornate consecutive/600pianificate, chiusura48h dopo ultimo kickoff,>=500appaiate, coperture90/95%, niente peeking o pending imputati.
2. **Calibrazione/incertezza:** log-loss/Brier appaiati,ECE<=.08,Brier noninferiorità<=.005,CI98.75% vsv1 sui4confronti B/C×BTTS/Over2.5,CI95% baseline,bootstrap settimanale1000. CI del singolo forecast non sostituisce gate. Under2.5 è complemento del medesimo evento binario, non autorizzazione al prezzo/selettore. Linee1.5/3.5/famiglie ulteriori necessitano propri protocolli preregistrati, molteplicità/coorti future.
3. **Prezzi/regole:** misurare copertura/tempi/playability, identità/periodo/linea/orientamento/settlement e ticket effettivo. Push/partial richiedono metriche proprie, niente de-vig binario improvvisato.
4. **Dipendenze:** validare eventuale joint fra gare e assunzioni/incertezza, senza sostituire oggi Fréchet col prodotto. Joint stesso incontro non valida quota BetBuilder.
5. **Selettore/multiple:** nuova versione preregistrata, mercati ammessi/arresti fissi, tutti i tentativi/scarti, selezione multipla/costi/revisioni. Superiorità predittiva non valida ROI o multiple, niente tuning retrospettivo dei gate.
6. **Uso operativo:** review scientifica e autorizzazione esplicita separata, governance/rischi/diritti. STATISTICAL_GATE_PASSED_REVIEW_REQUIRED non abilita gioco. Stake0.
