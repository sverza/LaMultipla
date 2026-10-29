# LAMULTIPLA — CRITICAL DEPENDENCIES REMEDIATION

28 ottobre 2026. Intervento limitato alle dipendenze critiche; nessuna modifica al codice applicativo, scientifico, al selettore o ai contratti Android.

## Versioni e compatibilità

| Pacchetto | Prima | Dopo | Motivazione |
|---|---|---|---|
| next |16.2.6|**16.4.3**|Rimuove tutti i20 GHSA Next osservati, incluso GHSA-p293-qw3h-jr36 Windows; contiene le correzioni successive alla prima patch16.4.1. Nessun cambio di major. |
| eslint-config-next |16.2.6|**16.4.3**|Allineamento della configurazione lint e plugin Next. |
| @capacitor/android |8.5.0|**8.5.1**|Prima patch del ramo per GHSA-rvm3-566m-v7fv, fissata esattamente nel manifest. |
| @capacitor/core / cli |8.5.0 /8.5.0|**invariati**|Android8.5.1 dichiara peer Core^8.5.0; nessun allineamento ulteriore necessario dimostrato. |
| react / react-dom / react-server-dom-webpack |19.2.6|**invariati**|Compatibili con i peer Next; nessuna necessità di aggiornamento in questo perimetro. |

Fonti ufficiali: [Next16.4.3](https://github.com/vercel/next.js/releases/tag/v16.4.3), [RCE Windows](https://github.com/advisories/GHSA-p293-qw3h-jr36), [RCE SVG](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [use cache](https://github.com/advisories/GHSA-673q-mjm6-r5xr), [Capacitor8.5.1](https://github.com/ionic-team/capacitor/releases/tag/8.5.1), [proxy WebView](https://github.com/advisories/GHSA-rvm3-566m-v7fv). Le versioni16.4.1/2/3 risultavano fuori dai range Next rilevati; scelta16.4.3 per includere i backport correttivi senza passare a canary o cambiare React.

## Manifest, lock e installazione

Modificati tre soli valori diretti nel manifest: Next, eslint-config-next e Android. Lock coerente:15 versioni esistenti aggiornate e31 nodi aggiunti, principalmente binari opzionali Sharp/SWC per le piattaforme supportate e dipendenze del plugin lint. Nessuna versione rimossa, nessun aggiornamento di pacchetti estranei. Il dettaglio completo del delta è nel rapporto diagnostico privato.

Next aggiorna @next/env, plugin ESLint e SWC16.4.3, @swc/helpers0.5.23, PostCSS annidato8.5.23 e introduce Sharp0.35.5 nel proprio ramo. Sharp0.34.5 rimane nel ramo dev miniflare, senza essere promosso a corretto. Il cambio dev/prod di quel ramo e dei suoi binari è conseguenza della risoluzione separata delle due versioni, non una rimozione della vulnerabilità.

Installazioni eseguite con `--ignore-scripts --no-audit --no-fund`; lock preparato con `npm install --package-lock-only` su pacchetti nominati, poi `npm ci` due volte, entrambe exit0. Nessun audit fix, force, downgrade o aggiornamento massivo. Script lifecycle di esbuild, workerd, resolver e vecchio Sharp verificati e non eseguiti. Next/ESLint/Android candidati non introducono lifecycle script nuovi nel delta. Build e lint funzionano con l’installazione riproducibile senza tali script; la CI remota ordinaria, che usa npm ci senza ignore-scripts, resta da eseguire dopo una futura pubblicazione autorizzata.

## Audit prima/dopo

| Ambito | Prima | Dopo | CRITICAL | HIGH |
|---|---:|---:|---:|---:|
| Completo |23|**20**|2 → **0**|15 →14|
| Omit dev |9|**5**|2 → **0**|4 →2|

Audit completo residuo:14 high,5 moderate,1 low. Produzione:2 high,3 moderate. **25 GHSA distinti eliminati dall’albero completo;59 residui; nessun nuovo GHSA** rispetto all’audit immediatamente precedente. Sono risolti il GHSA Capacitor, tutti i20 GHSA Next e i4 PostCSS annidati. Dei6 advisory critical distinti iniziali, nessuno rimane nell’audit. npm audit exit1 segnala i residui, non un errore del registro. `npm ls --all` e quello dei componenti aggiornati: exit0, nessun peer invalido.

Residui di produzione: brace-expansion e source-map-js (high), Capacitor CLI/xcode/uuid (moderate, catena comune). Lo stack Vite/Cloudflare, RSC diretto, Satori e altri strumenti conservano gli advisory già documentati; nessuna rimozione o promozione arbitraria. Restano distinti anche il runtime Node locale24.19.0 con Undici incorporato7.29.0 e il pacchetto Undici npm del ramo dev: non aggiornati in questo incarico.

## Regressione Windows

| Controllo | Esito |
|---|---|
| Multimercato, reader e lock dedicati dopo Next |**139/139**, zero skip |
| Suite completa seriale dopo entrambi gli aggiornamenti |**601/601**, zero skip; 375.19s |
| Suite completa parallela dopo entrambi gli aggiornamenti |**601/601**, zero skip; 91.34s |
| Lint finale |exit0; solo warning preesistente combinedPlayedOdd |
| Build statica finale |exit0; tre pagine statiche, TypeScript superato |
| Replay G8 read-only |**READ_ONLY_LINKAGE_VERIFIED**; M2 intero e contenuto M4 identici agli originali |

La suite completa comprende i139 test dedicati e i controlli Windows DPAPI/lock saltati su Ubuntu. Nessun test modificato, disabilitato o allungato. Contratti Android/v4, persistenza e selettore1X2 coperti dalla regressione esistente e dai controlli di invarianza; non è una prova su dispositivo o una compilazione nativa Android. Nessun nuovo server o APK.

La guardia privata ha bloccato due tentativi di controllo versione verso registry.npmjs.org avvenuti nelle due build Next; non sono chiamate applicative/provider. Nessun altro host esterno registrato. I test usano mock/sintetici; nessuna chiamata OddsPapi, PitchAPI, Firebase o consegna.

I log privati conservano e spiegano due errori della procedura diagnostica (caricamento della guardia su Windows e confronto fra livelli di hash diversi). Sono stati corretti solo nelle utility private; nessun artifact originale è stato modificato. Il replay finale confronta integralmente i report originali e verifica distintamente gli hash dei contenuti e degli envelope. Le impronte degli artifact scientifici privati restano nel rapporto locale.

## Android e confini della patch

Il modulo nativo distribuito da npm cambia Bridge.java e WebViewLocalServer.java per bloccare navigazioni verso il proxy interno e applicare i controlli documentali; Plugin.java cambia il commento contrattuale. build.gradle del modulo è byte-identico. Il progetto Gradle punta già a ../node_modules/@capacitor/android/capacitor: la nuova sorgente sarà usata dalla prossima compilazione autorizzata, senza necessità emersa di cap sync. Non eseguiti sync, Gradle, rigenerazione asset, modifica Firebase, build/installazione/consegna APK. L’APK già sul Samsung non viene corretto da questo lockfile: richiederà in futuro rebuild e distribuzione espressamente autorizzati.

## Integrità, rollback e pubblicazione

Baseline5986 file:5984 invariati per SHA256, dimensione e mtime; modifiche intenzionali solo a package.json e package-lock.json, oltre a questo nuovo documento. Invariati journal, receipt, approvazioni, freeze G8, screening0001, coorti, dataset, cutoff, motori, selettore, ledger, archivio PitchAPI, sorgenti Android e shared. File locali non correlati preservati e non aggiunti. Nessun segreto o RAW privato incluso.

Primo commit locale Next: `914f74eb2310f15acb012f120248524da84faa70`. Secondo lotto Capacitor separato; rollback disponibile per commit in ordine inverso, previa revisione. Nessun push: il riferimento remoto verificato resta32fb1ea81fa4a4ff2d633f64264a5b8465a5abd3; nessuna nuova CI eseguita. La precedente CI40579898422 non certifica questi nuovi commit. PR#2 non modificata; pubblicazione e verifica CI Node22 da autorizzare separatamente.

M4-B resta da autorizzare. La remediation elimina i due blocchi critical oggetto dell’incarico; consente raccomandazione di pubblicazione controllata con nuova CI e successivo lavoro offline, senza attivare un pilot o la policy autentica. I residui vanno trattati separatamente prima di riabilitare i profili vulnerabili o distribuire Android. Stake reale0€.

**SECURITY REMEDIATION COMPLETE**
