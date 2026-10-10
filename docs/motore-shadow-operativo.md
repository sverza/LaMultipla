# Motore delle opportunità e ciclo shadow

## Risultato implementato

`scripts/shadow.mjs` collega gli artefatti originali: studio validato e codice v1, journal1X2 congelato, reportOddsPapi v2, verifiche manuali opzionali. Il ciclo completo produce screening e decisione immutabile con hash, policy/code/protocol hash e origine. Resta sempre experimental=true, operationallyApproved=false, actualStakeEUR=0. Nessuna scrittura in app/schedine/storico, nessun merge/deploy. Directory `.local/shadow`, ignorata da Git; previsioni nella directory prospettica esistente, riusate senza modificarle se già congelate.

Pipeline: verifica registry/codice → eventuale snapshot risultati pubblico → forecast mensile dal calendario o riuso del journal preesistente → una acquisizione quote batch con importatore esistente → verifica identità calendario/report → abbinamento esatto/EV/uncertezza/baseline → combinazioni Fréchet → decisione finale unica → successiva valutazione e progressione. Il dataset usato per il tuning originale è conservato: `--refresh-data` aggiorna soltanto un nuovo snapshot dei risultati, non riaddestra lo studio né modifica la configurazione. Forecast mensile e decisione sono generati ora; dati scaricati oggi non ricostruiscono una decisione di ieri. Per l'estensione sperimentale multimercato vedere [motore-multimercato-operativo.md](motore-multimercato-operativo.md); v1, snapshot e selettore esistenti sono conservati.

Il manifest della giornata deve essere confermato una volta: dieci fixtureID, squadre e kickoff con fonte calendario. L'importatore non deduce una giornata dal solo numero10. Il file schedule ha lo stesso formato di docs/fixtures/seriea-2026-27-round06.json; manifest round ha season/matchday/fromUtc/toUtc/fixtureIds. Preflight blocca round/schedule incompatibili e final decision già esistente prima della rete. Fonti meteo/infortuni/formazioni e prezzi Bet Builder non sono inventati.

## Uso Windows e acquisizione

Prerequisiti già presenti: Node>=22.13, Git, branch PR#2, studio e dataset locali. Nessuna nuova dipendenza. Prima aggiornare branch. Quote live: wrapper esistente, nessuna chiave nei comandi; mantiene prompt protetto, metodo di incolla già collaudato, ripristino dell'ambiente e DPAPI opzionale. `-SaveKey` solo se l'utente desidera salvataggio cifrato sul proprio PC; non necessario per questo test.

Esempio **per una futura esecuzione**, non da lanciare automaticamente sulla giornata già congelata:

```powershell
.\scripts\oddspapi.ps1 -RoundPath ".local\oddspapi\round.json" -ShadowCycle -ShadowPreview -StudyPath ".local\model\studies\STUDIO.json" -SchedulePath ".local\shadow\schedule.json" -RefreshData
```

Sostituire i placeholder con i propri percorsi. `-RefreshData` è opzionale: legge commit pubblico corrente, CC0 e cinque stagioni su quel commit (7GET pubbliche, no chiave/piano a pagamento). Controlla licenza invariata, data acquisizione e righe. QuotaOddsPapi: account non conteggiato, markets solo cache assente/oltre7giorni e odds-by-tournaments una volta. Conservati limite15/esecuzione, tetto200/31giorni e riserva50 Free. Nessun retry/polling. Nessuna chiamata reale API effettuata per lo sviluppo di questa PR.

Modalità locale zero richieste, utilizzabile per verificare artefatti reali già presenti:

```powershell
node .\scripts\shadow.mjs --journal "JOURNAL.json" --study "STUDIO.json" --report "REPORT.json" --assessment "REVISIONE.json" --preview
```

Assessment facoltativo. Il programma usa soltanto le sue verifiche manuali, mai le probabilità eventualmente inserite. `--preview` salva una nuova anteprima non finale, non occupa la decisione finale e non la sostituisce. Senza preview il percorso deterministico impedisce una seconda decisione finale per giornata/versione, anche se la prima è NO_BET. Se quote/report sono vecchi, restituisce INSUFFICIENT_DATA: non li presenta come quote correnti. Nessuna opzione CLI as-of per ricostruire decisioni passate.

`--cycle --study ... --round ... --schedule ... --report ...` esegue il ciclo senza rete; `--live-odds` al posto di report richiede chiave nell'ambiente gestita dal wrapper. `--dataset FILE` consente un nuovo dataset content-addressed già acquisito. La versione del motore originale e le evidenze dello studio rimangono obbligatorie. Existing journal da una fonte/cutoff diverso non viene rimpiazzato per migliorare la proposta.

## Disponibilità, EV e multipla

Categorie: insufficient data, no value, uncertain value, shadow candidate. Un prezzo feed-active fresco può essere candidato shadow non confermato; nessun automatismo certifica la giocabilità italiana. Override manuale v2 è esatto su identità, prezzo, timestamp e hash; non sana market/bookmaker sospesi. Baseline1X2 soltanto completa e senza imputazioni; etichetta manualPlayabilityVerified distinta da feed.

Policy corrente **shadow-value-v2**, registrata il 10/10/2026 alle 10:10:21Z; protocollo base v1 archiviato e modifica in docs/protocollo-shadow-v2-tempi.md. Per screening: forecast originale <=24h, quote <=30min osservate dopo forecast e registrazione v2; nessun rinnovo artificiale del journal. Per benchmark predittivo la distanza resta <=30min, inclusi i timestamp delle verifiche manuali. Lavagne successive possono essere diagnostiche (`compatible=false`), senza confronto contemporaneo o ingresso nelle metriche del mercato. Soglie invariate: centrale>=5% EV, lower>=2%, ampiezza<=0.25. Non sono soglie di profitto già validate. Almeno40 bootstrap, fallimenti<=10%; limiti marginali non simultanei. Ogni esclusione è registrata e conteggiata, tutti gli esiti esaminati restano disponibili nell'audit.

Selector2–4 normalmente (`--max-legs 6` solo estensione esplicita), niente duplicati eventi/squadre, nessun prodotto delle probabilità. Per ogni combinazione registra limiti di probabilità congiunta ed envelope di sensibilità, probabilità puntuale e CI congiunto null. Il prodotto delle quote è nominale, non una quota offerta. Se manca la quota combinata esatta, proposta finale assente e NO_BET/COMBINATION_EVIDENCE_INSUFFICIENT anche con marginali interessanti. Non si pubblica una combinazione fingendo indipendenza.

Supporto per evidenza prezzo combinato reale: `--combined-prices FILE`, array `verifications` con schema lamultipla-accumulator-price-verification-v1, domain bet365.it, origin manual_bet365_it, kind ordinary_accumulator, availability available, reportSha256, quoteIds esatti distinti, price, verifiedAtUtc, reviewer, evidence. Nessuna selezione o quota riempita automaticamente. Richiede tutte le gambe manualmente disponibili e limite inferiore EV>=5%: massimo una SHADOW_BOUND_PROPOSAL, statisticamenteValidata=false e stake reale0. Non basta la frase "eventi diversi = indipendenti".

## Valutazione nel tempo

Acquisire risultati con il comando prospettico già presente, dopo le partite e margine48h; non aggiornare il training della giornata valutata. Poi:

```powershell
node .\scripts\shadow.mjs --evaluate "DECISIONE.json" --journal "JOURNAL.json" --results "RISULTATI.json"
node .\scripts\shadow.mjs --progress
```

I comandi in chat verranno proposti separatamente. Metriche predittive su tutti i forecast; metriche dei candidati sul sottoinsieme, non confuse con performance globale. Baseline mercato: lavagne complete temporalmente compatibili e manualmente verificate della decisione e snapshot prospettici già congelati, tra quelli compatibili scegliere quello più vicino al momento del forecast; log-loss/Brier modello e mercato sugli stessi incontri. Lavagne feed-only non certificate restano diagnostiche e non entrano nel benchmark verificato. Se esiste proposta e tutti i risultati sono disponibili: rendimento solo simulato alla quota verificata, stake nominale<=3€ e stake reale0; nessun log-loss congiunto inventato. Rinvii/pending e revisioni fonti rilevati; progressione sospende la giornata in conflitto, senza correggere forecast o decisioni. Regole di void/riliquidazione ufficiali sono un controllo ancora necessario per usare il rendimento oltre l'ipotesi fulltime.

## Automazione e diritti

È implementata una esecuzione end-to-end invocabile, non installata una attività programmata. Gli input di calendario/manifest e i soli prezzi non confermati restano interventi umani; dataset/result fetch e screening/combinazioni/hash/evaluation sono automatici una volta configurati. Una futura attività Windows può richiamare il wrapper con DPAPI, conservando budget/lock/no-retry; non viene creata né configurata in questa PR.

Budget pianificato: 1batch/giorno31 + circa5 refresh catalogo =36 richieste/mese; due osservazioni per4–5 giornate =8–10 + catalogo. Compatibile con250 documentate, purché nessun altro processo condivida quota oltre i limiti. Il software legge consumo account effettivo e ledger prudenziale, non assume reset al primo del mese. Quota insufficiente, identity non confermata o erroreAPI fermano il ciclo.

Documentazione ufficiale ricontrollata il10/10/2026: https://oddspapi.io/en/docs/requests-and-quota, anche errori elaborati possono consumare una unità; https://oddspapi.io/en/legal/terms, obbligo di verifica dati, niente redistribuzione standalone, accesso revocabile. Non interpretare queste clausole come concessione generale di pubblicazione o retention perpetua. Uso privato autorizzato dell'account già attivo, diritti di pubblicazione app ancora da risolvere prima di abilitare tale funzione. Nessuno scraping, API private, carta, trial o costo. CC0 del dataset risultati è distinta dalle condizioni delle quote.

## Evidenze e limiti del collaudo

74 test passati (inclusi forecast congelati da ore, esclusioni temporali v2 e baseline successiva non comparabile): collegamento/override/tempi/ambiguità/uncertezza/baseline, dipendenze/limiti/prezzo combinato, no-overwrite e scoring; ciclo con HTTP **mocked** esegue realmente importer, modello/40bootstrap, congelamento, selector e journal senza pubblicazione. Smoke CLI separato sullo studio reale locale, con quote **sintetiche**, ha esaminato30 esiti, trovato7 candidati e91 combinazioni, restituito NO_BET/COMBINATION_EVIDENCE_INSUFFICIENT; non è un risultato reale di value betting. Lint senza errori, warning preesistente nell'app. I dati sintetici dei test non sono quote reali. Fonti pubbliche aggiornate sono testate con mock, non dichiarate collaudate su risultati futuri. Il pacchetto originale delle quote e il journal sul PC dell'utente non sono accessibili nel container: un calcolo su estratti della chat è etichettato diagnostico post-hoc, non nuova decisione prospettica né nuova acquisizione API. Il successivo collaudo locale sui file originali resta necessario. Il nuovo percorso ShadowCycle del wrapper richiede ancora quel collaudo Windows; gestione protetta della chiave resta quella già verificata sul PC.

Il collaudo Windows su 12b7585 ha effettivamente letto 30 esiti 1X2 dal report reale del 9 ottobre: NO_BET/INSUFFICIENT_DATA, zero richieste API, anteprima non finale. Non dimostra assenza di valore: report scaduto. Questo test ha motivato la distinzione dei due tempi v2 prima di qualsiasi nuova acquisizione; non modifica la preview precedente o la baseline Inter–Parma congelata. L’output CLI ora espone anche policyVersion, globalIssues ed exclusionReasons.
