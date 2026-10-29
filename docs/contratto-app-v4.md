# Contratto app v4 — revisione 1, 11 ottobre2026

Estensione compatibile del 13 ottobre: proposte ancora v4, più schema distinto `lamultipla-app-round-state-v1` per stati senza forecast/quote inventati. Parser/backup nuovi leggono entrambi; il vecchio APK riceve solo v4 finché non dichiara capacità `roundStateProtocol:1`. [Dettagli, notifiche e autorizzazioni residue](punto11-gestione-progressiva.md). Nessuna migrazione degli esperimenti esistenti o aggiornamento del Samsung eseguito.

## Percorso implementato

`shadow.mjs` resta l'unico produttore della decisione. `decision.mjs --app-package` verifica gli hash degli input e ricostruisce screening, gate, selettore e governance all'orologio originale, poi produce un envelope privato `lamultipla-prospective-envelope-v1` con SHA256 e payload `lamultipla-app-decision-v4`. Non acquisisce quote, non riscrive journal/decisioni, non pubblica. Una scrittura già esistente è rifiutata, mai sostituita.

Il comando richiede `--decision FILE --journal FILE --report FILE --study FILE --assessment FILE`. Decisione e journal sono envelope congelati; report, studio e assessment sono gli originali riferiti dai loro hash. I file di output rimangono in `.local/decisions/app-v4/`. Il handoff completo del punto 9 resta un formato di audit privato non importabile: solo il nuovo adapter minimizzato è destinato all'app.

L'app usa lo stesso validatore del CLI (`shared/decision-v4.mjs`). Il percorso importazione è scheda **Esperimento → Apri pacchetto locale**, oppure JSON incollato. SHA256 verifica integrità, non firma, provenienza autentica, orologio esterno o verità delle attestazioni umane. Nessuna richiesta di rete è necessaria per importare.

## Campi e semantica

| Campo | Contenuto e controllo |
|---|---|
| schema/id/round/generatedAtUtc/final | Schema esatto, identità, stagione/giornata, timestamp UTC, anteprima distinta da congelamento |
| status/mode/sourceData/delivery | `simulation` o `no_bet`, solo `experimental`, origine sintetica/originale/non specificata, solo `private_local` |
| actualStakeEUR/nominalStakeEUR | Reale sempre0; nominale3 solo per simulazione, 0 per NO BET |
| operational | Sempre NO BET/MODEL_NOT_AUTHORIZED, authorized e publicationAllowed false |
| source/model | Hash decision/journal/report/study/assessment; versione protocollo; modello/codice/dataset/protocollo, cutoff e generazione forecast |
| selections[].identity | Fixture, squadre/participant IDs, kickoff, torneo/stagione/provider fixture, mercato/esito/periodo/linea/giocatore |
| selections[].price/provider/verification | Prezzo singolo, osservazione/cambio, flag originali, verifica italiana e hash attestazione; inattivi solo con conferma esplicita senza alterare flag |
| selections[].settlement | Hash regole, timestamp revisione, URL; i dettagli umani completi rimangono nell'assessment privato |
| selections[].forecast/value | P in scala0–1, 1/X/2 normalizzate, CI marginali95 contenenti le stime, hash entry, EV puntuale/inferiore/superiore coerenti |
| combined | Prezzo **osservato** e sua attestazione; prodotto diagnostico distinto; jointProbability e jointConfidenceInterval null; Fréchet e sensibilità marginale, nessuna validazione congiunta dichiarata |
| reasonCodes/shadowCause/exclusions/counts/phases | Motivazioni sintetiche, esclusioni aggregate, conteggi e dodici stati audit consultabili |

Oggi il selettore ammette solo1X2 fulltime. Altri mercati hanno diagnostica shadow separata e non diventano selezioni importabili per il solo fatto di essere calcolabili. L'adapter non aggiunge modelli, probabilità o selezioni. Quote oltre30 minuti, forecast oltre24 ore, buffer kickoff5 minuti, liquidazione oltre7 giorni, prezzi/EV incoerenti, campi mancanti/extra e flag operativi abilitati vengono rifiutati. Le soglie del selettore restano quelle preregistrate:5% EV puntuale,2% EV inferiore, ampiezza marginale≤25 pp,5% EV combinazione al limite di sensibilità. Non sono prova di redditività.

## Stati: nessuna conversione implicita

| Stato | Destinazione e azioni |
|---|---|
| Simulazione v4 | Archivio sperimentale, stake reale0, nessun pulsante per giocare/confermare |
| NO BET v4 | Archivio sperimentale; motivo tecnico visibile e blocco operativo separato |
| Bozza v3 | Percorso legacy invariato, separato dall'esperimento |
| Approvazione operativa v4 | Non ammessa; richiede futuro contratto/versione/autorizzazione verificabile |
| Giocata effettiva v3 | Dati storici invariati e contabilizzati solo nel percorso legacy |
| Giocata effettiva v4 | Rifiutata: nessun interruttore JSON abilita scommesse |

L'archivio `lamultipla-experiments/snapshots` è distinto da `seriea-multipla/slips`. Deduplicazione per hash, import additive senza sovrascrittura, verifica prima della scrittura. Backup v4 conserva storico/preferenze e aggiunge envelope sperimentali; backup v3 continua a essere accettato. Ripristinare v3 non elimina l'archivio sperimentale. La normalizzazione legacy conserva la semantica precedente: il nuovo contratto non cambia calcolo di ritorni/ROI né propone migrazioni finanziarie.

## Consegna e privacy

Il pacchetto app è **privato**, contiene quote e forecast necessari alla lettura; non contiene report completi, dossier contestuali, note mediche, API key o nomi dei revisori. L'allowlist impedisce campi aggiuntivi; non è un sistema DLP capace di certificare testo arbitrario inserito a mano.

`decision --receipt` genera una ricevuta redatta separata, senza quote/probabilità/EV, riconosciuta dall'app come NO BET con esito shadow esplicito. Il parser del feed è predisposto per questa ricevuta, ma `public/latest-slip.json` resta identico: nessuna pubblicazione è autorizzata. La futura consegna completa richiede chiarimento dei diritti OddsPapi, consenso pubblicazione e autenticità/trasporto definiti. SHA locale non basta per un feed non fidato.

In anteprima browser localhost il feed pubblico e le migrazioni legacy sono disabilitati; l'APK Capacitor usa anch'esso localhost ed è escluso da tale modalità. Il servizio Android in background resta legacy: gestione nativa di notifiche NO BET e futura consegna v4 richiedono collaudo/dispositivo e aggiornamento esplicito, non sono dichiarati verificati da viewport mobile.
