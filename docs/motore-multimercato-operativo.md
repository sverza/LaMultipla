# Motore multimercato: implementazione e uso shadow

> Coordinamento aggiornato, 10 ottobre 2026: [protocollo generale v1](protocollo-generale-v1.md). Le istruzioni storiche restano per riproduzione; il pilot giornata 6 è protetto da nuove analisi. Le decisioni nuove richiedono anche attestazione di liquidazione; uso operativo/pubblicazione restano disabilitati.
Implementazione separata in scripts/lib/engine e scripts/model-engine.mjs. Riusa dataset CC0, alias, finestra temporale, metriche, EV con liquidazione e store immutabile esistenti. Non modifica codice/protocollo gol v1, forecast round6, snapshot di analisi, baseline Inter–Parma, app, schedine o storico. Registro modello v1 e selettore shadow esistenti rimangono vincolanti; i nuovi modelli non ricevono autorizzazione operativa.

## Componenti e fonte

Dixon–Coles full likelihood e Poisson bivariato sono implementati con gradienti analitici e L-BFGS/backtracking, convergenza verificata. Temperatura unica sulla griglia preserva coerenza tra mercati. Griglia0..30 gol per squadra, massa mancante<=1e-8 prima della calibrazione. Nessuna probabilità su modello non convergente/squadra con meno20 presenze. Bootstrap settimanale40 per candidato; fallimenti>10% escludono l'evento. Modelli e bootstrap condivisi per tutta la giornata, non un fit per ciascuna quota.

Fonte incorporata: openfootball/football.json CC0, snapshot di14 stagioni già fissato al commit e6744429ee395bc86f247348c6184bb08d4eb361. Per nuovi forecast si possono usare gli snapshot distinti prodotti dall'updater CC0 esistente. I dati2024/25 mancanti non vengono corretti né usati come nuovo test; ogni revisione della fonte cambia hash. Licenza, eventi e date+48h sono controllati; date+48h resta un'assunzione, non un timestamp storico del fornitore.

## Comandi Windows, una fase per volta

Riprodurre il nuovo sviluppo SOLO sul dataset già disponibile. Recuperare il dataset referenziato dallo studio v1 evita download/registrazioni e richieste OddsPapi:

```powershell
& {
    $originalStudy = Get-Content "C:\LaMultipla\.local\model\studies\791e2be8-b0d9-4b5f-a648-3d0610a580be.json" -Raw | ConvertFrom-Json
    $datasetPath = Join-Path "C:\LaMultipla\.local\model\datasets" ($originalStudy.datasetSha256 + ".json")
    node "C:\LaMultipla\scripts\model-engine.mjs" --develop --dataset $datasetPath
}
```

Questo crea un nuovo studio v2 in .local/model-v2/development, non ricalcola lo studio v1. Le cifre saranno confrontate con il rapporto prima di congelare nuovi forecast. Gli hash del contenitore dataset possono differire dal PC di sviluppo per i metadati di acquisizione; sourceCommit/file hash e risultati devono coincidere. Studio v2 conserva hash codice canonicoLF/protocollo e Git commit/dirty, tempi e selezione. Cambi di codice/protocollo bloccano il riuso: nuova versione, nessuna modifica dello studio salvato.

Solo per una giornata futura confermata, dopo il13/10, diversa dal round6, preparare il manifest con dieci fixtureID/kickoff/squadre. Uso separato locale:

```powershell
node .\scripts\model-engine.mjs --freeze --study "STUDIO-V2.json" --dataset "DATASET.json" --schedule "CALENDARIO-FUTURO.json"
node .\scripts\model-engine.mjs --screen --study "STUDIO-V2.json" --journal "JOURNAL-V2.json" --report "REPORT-ODDSPAPI.json" --assessment "VERIFICHE.json"
```

Placeholder espliciti: questi esempi non sono comandi da lanciare sul round6. Tutte le modalità del nuovo CLI sono locali, senza chiave/API/polling. Freeze reale almeno5min prima dei kickoff; nessuna opzione as-of. Percorso esclusivo per round/study; il comando freeze rifiuta un file esistente. Nessuna previsione retrospettiva chiamata prospettica.

## Integrazione nel ciclo esistente

Il wrapper già presente può eseguire l'intero ciclo per giornate future:

```powershell
.\scripts\oddspapi.ps1 -RoundPath "ROUND-FUTURO.json" -ShadowCycle -ShadowPreview -StudyPath "STUDIO-V1.json" -SchedulePath "CALENDARIO-FUTURO.json" -ExperimentalStudyPath "STUDIO-V2.json"
```

Il ciclo verifica codici/dataset/calendario, eventualmente usa -RefreshData per un nuovo snapshot CC0, congela v2 e v1 dal calendario prima di leggere i prezzi, acquisisce una sola richiesta batch quote con guardie esistenti, verifica identità calendario/report, riusa i journal senza sovrascriverli, esegue v1 e aggiunge experimentalMarkets alla stessa decisione/anteprima. -ExperimentalJournalPath permette riuso esplicito di un v2 già congelato. Default senza questi argomenti rimane v1. Il prompt protetto/DPAPI e riserva Free rimangono invariati; nessuna chiave nel nuovo motore.

Il calendario iniziale è una fonte dichiarata, non una verifica API simulata: il binding del report viene controllato dopo l'acquisizione e prima della decisione. Se identità/fit/freschezza non sono adeguati il ciclo si interrompe o produce NO_BET. Una incompatibilità dopo la chiamata non può annullarne il consumo; conservare l'audit. Un forecast scaduto non viene rigenerato per aggiornarne il timestamp. Una decisione finale già presente impedisce nuova acquisizione; usare preview per il collaudo, mantenere tutte le anteprime senza cherry-picking.

I nuovi record classificano INSUFFICIENT_DATA / NO_VALUE / UNCERTAIN_VALUE / EXPLORATORY_VALUE. Anche EXPLORATORY_VALUE ha eligibleForSelector=false. Non viene trasformato in proposta di multipla. Eventuale superiorità prospettica porta solo a STATISTICAL_GATE_PASSED_REVIEW_REQUIRED; serve revisione esplicita di protocollo e approvazione prima di abilitare un mercato.

## Mercati, liquidazione e dipendenze

1X2, BTTS, Over/Under a linee intere/mezze/quarti, gol squadra, doppia chance, DNB e handicap asiatici hanno proiezioni matematiche da un'unica distribuzione. Quarter lines conservano halfWin/halfLoss/push; l'EV riusa settlementEV. Nessun de-vig binario ingenuo di mercati con push; la baseline di mercato v1 completa resta separata. Multigol è solo una funzione matematica, non un parser di prezzi feed verificato. Totali asiatici con nome diverso da Over Under Full Time restano unmapped finché manca un mapping controllato: il supporto matematico non implica copertura API.

Parser conservativo su marketType/name/period/outcome/line e assenza di giocatore. Non assimila corner/cards ai gol. Per spreads il lato e il segno della linea non vengono indovinati: richiede settlementMapping con quoteId/reportSha256/identitySha256, domain bet365.it, origin manual_bet365_it, side home/away, line, settlementVerified=true, reviewer/evidence/verifiedAtUtc. Mappa liquidazione diversa dalla verifica del prezzo. Regole operative bookmaker sempre da confermare. Override manuale positivo v2 supera solo active=false, conserva gli altri flag, prezzo/identità/hash/tempo esatti; negativo blocca.

Nello stesso incontro jointSettlement integra combinazioni di liquidazioni sulla griglia, non moltiplica marginali. Questo è un calcolo matematico del modello: non certifica la quota Bet Builder o le sue regole. Gross product è soltanto un rendimento ipotetico; bookmakerCombinedPrice resta null. Tra incontri diversi non è disponibile una joint puntuale: il selettore conserva Fréchet, prezzo combinato verificato, stake reale0 e NO_BET quando manca evidenza. La nuova struttura non aggira nessun gate del selettore.

## Risultati e monitoraggio

Riutilizzare --capture-results del CLI prospective.mjs sul nuovo journal (legge manifest.season e scarica solo risultati CC0 su commit fissato), dopo le partite e disponibilità48h. Poi:

```powershell
node .\scripts\model-engine.mjs --evaluate --study "STUDIO-V2.json" --journal "JOURNAL-V2.json" --results "RISULTATI.json"
node .\scripts\model-engine.mjs --progress
```

Output esclusivi con hash, niente modifica di forecast/results precedenti. Per candidato: log-loss/Brier/ECE, copertura/esclusioni e confronti appaiati controv1/empirica/Poisson lega. Metriche rolling descrittive e conteggi per giornata; test confermativo sulla finestra fissa delle prime60 giornate consecutive (600 pianificate), chiusa48h dopo l'ultimo kickoff, con almeno500 eventi appaiati e gate di copertura. CI98.75% vsv1 sui quattro confronti B/C×BTTS/Over2.5, CI95 contro baseline,1000 bootstrap settimanali. Le giornate successive non ripetono il test su un campione crescente. Una giornata mancante impedisce il gate; rinvii che alterano l'ordine cronologico richiedono controllo esplicito. Altre linee non ereditano quel gate. Revisioni o rimozioni di risultati sospendono il confronto della coorte; nessuna correzione automatica dei pronostici. Nuove versioni restano coorti separate.

Updaters e forecasting/screening/evaluation sono invocabili automaticamente, ma non è installato un servizio o scheduler. Budget quote invariato: un batch per osservazione e catalogo in cache; nuovi modelli non moltiplicano richieste API. Nessun nuovo collaudo OddsPapi reale in questa fase. Wrapper ampliato testato per codice/contratto, nuovo percorso multimercato ancora da collaudare su Windows con una futura giornata.

## Audit delle automazioni

Lettura del10/10/2026: attività ChatGPT “Schedina Serie A 2.1 - audit” ancora attiva; il prompt precedente autorizza pubblicazione su GitHub di una schedina considerata validata. Non richiama questo CLI Windows o il registry v2 e non ha accesso dimostrato ai journal/DPAPI locali. Non è quindi l'automazione del nuovo esperimento e presenta un rischio di pubblicazione tramite percorso precedente. Non è stata modificata/disattivata, rispettando il vincolo di autorizzazione. Prima di attivare il ciclo continuativo occorre sospendere/riallineare quell'attività con consenso esplicito. I workflow GitHub esistenti di verifica/build/deploy non sono stati cambiati; nessun task Windows è stato installato o ispezionato sul PC, cui questa sessione non ha accesso diretto.

Aggiornamento successivo10/10/2026: ricevuta autorizzazione esplicita, la sola attività “Schedina Serie A 2.1 - audit” è stata sospesa, senza eliminarla o cambiare prompt/calendario. La precedente descrizione fotografa la lettura precedente alla sospensione. Verificato is_enabled=false e next_run_time=null; altre attività invariate. Il riferimento generico del vecchio prompt alla conservazione di audit non era un collegamento al CLI privato/journal del PC. Nessun monitoraggio locale automatico era stato installato: comandi di valutazione restano disponibili, da invocare. Per il nuovo livello contestuale e i limiti delle fonti vedere [studio-contestuale-operativo.md](studio-contestuale-operativo.md).
