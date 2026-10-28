# LAMULTIPLA — M4-B OFFLINE INTEGRATION

Base verificata: `d712a173d7d73e78f2ec2f1758813b6e619640f9`, branch
`feature/oddspapi-private-import`, Windows, 28 ottobre 2026. M4-B collega
**esclusivamente dati sintetici**. Nessuna decisione autentica, acquisizione,
previsione, attivazione della policy o pilot è autorizzata dal nuovo codice.

## Matrice effettiva delle interfacce

| Passaggio | Componente effettivamente eseguito | Garanzia mantenuta |
|---|---|---|
| Manifest, coorte, archivio sigillato | M4-A `loadSyntheticReaderDiagnostic`, `verifyRoundArchive`, validatori scientifici originali | Scope G9 di test, tredici riferimenti, hash, modelli, dataset, cutoff, code/protocol identity e finestre del freeze sintetico |
| RAW/catalogo/report → board | M1 `adaptOddsPapi`, attraverso `createReadSession` | Replay normalizzatore, periodo fulltime, ID verificati, BTTS e O/U 2,5, quattro flag rigorosi |
| Universo → completezza | M3-C `reconcileUniverse`, richiamato da reader, M2 e compositore | Denominatore dal manifest scientifico: dieci fixture e venti board attesi |
| Board → probabilità | M2 `diagnoseProbabilityBoards`, proiezioni delle griglie congelate sintetiche | DC primario, bivariato comparatore, complementi, bootstrap, entry/grid/source hash |
| Evidenze → gate | M3-A/B, context e settlement validator esistenti | Review di test esplicite; l'adapter non ne genera e non riempie lacune |
| Ricerca e composizione | M3-B `discoverPrototype`, M3-A puro | Policy `mm-m3b-synthetic-v1` invariata, budget persistenti, Fréchet, nessuna indipendenza o probabilità congiunta puntuale |
| Decisione → persistenza | M3-B `runSyntheticPrototype` | Una sola decisione, intent/claim/preview/prepared/proof/receipt, lock Windows originale |
| Provenienza M4 → ricevuta M3 | Nuovo wrapper **test-only**, namespace separato | Intent di collegamento prima della persistenza M3; ricevuta riferita ai byte esatti della decisione e della ricevuta M3 |
| Verifica e replay | Nuovo verifier + reader M4-A + `verifySyntheticPrototype` | Rilettura indipendente, replay matematico, hash, nessuna nuova scrittura nel replay completato |
| Contratto autentico futuro | Nuovo descriptor/inspector read-only | Checklist di riferimenti; reader/verifier autentici obbligatori per verificare un archivio autentico; nessuna autorizzazione dedotta dagli hash |

La matrice redatta **prima** dell'implementazione è privata sotto
`.local/diagnostics/mm-m4b-20261028/interface-matrix.private.md`.

## File nuovi e contratti

Nessun file applicativo preesistente è modificato.

- `scripts/lib/mm-simulator-v1/synthetic-integration.mjs`: caricamento, binding,
  esecuzione sintetica, verifier e recovery del collegamento.
- `scripts/lib/mm-simulator-v1/integration-contract.mjs`: descriptor futuro,
  validazione strutturale e ispezione dei riferimenti locali, senza writer.
- `tests/fixtures/mm-integration.mjs`: costruzione di vettori G9 inventati,
  evidenze contestuali/review/prezzi ticket dichiarati sintetici.
- `tests/fixtures/mm-integration-child.mjs`: processi isolati per BUSY e crash.
- `tests/mm-offline-integration.test.mjs`: regressione integrata e casi negativi.
- Questo documento.

| Schema nuovo | Funzione |
|---|---|
| `lamultipla-mm-test-only-integration-input-v1` | Scope sintetico, riferimenti byte a input reader ed evidenze, SHA policy e UTC **simulato** esplicito |
| `lamultipla-mm-test-only-integration-evidence-v1` | Evidenze di test, legate allo stesso scope, contenuto reader e policy; nessun default positivo nell'adapter |
| `lamultipla-mm-test-only-integration-linkage-v1` | Coorte, manifest, journal/studio/dataset, fonti RAW/catalogo/report, universe coverage, entry/grid/quote links, hash M1/M2 e input M3 |
| `lamultipla-mm-test-only-integration-intent-v1` | Linkage completo e suo hash, codice del collegamento, safety invarianti |
| `lamultipla-mm-test-only-integration-receipt-v1` | Riferimento byte all'intent, linkage hash, riferimenti byte a ricevuta/decisione M3, SHA del payload decisionale, tempi reali e simulati distinti |
| `lamultipla-mm-future-integration-descriptor-v1` | Collegamenti futuri di coorte/approvazioni/manifest/dataset/studi/journal/freeze, autorizzazioni e ricevute provider, RAW/catalogo/report/board/diagnostica/reader, policy prospettica/approvazione, review/ticket, decisione/ricevuta |

I riferimenti `{ref,sha256}` indicano sempre i **byte**. L'hash di una decisione
o del linkage indica il payload JSON canonico secondo `hashValue` esistente;
non è confuso con l'hash dell'envelope formattato. I vecchi schemi non migrano.

Il descriptor distingue cutoff, generazione, completamento freeze, osservazione
quote, `createdAt` provider, review e scrittura della decisione. Null resta
assenza dichiarata. Verifica ordine e forma temporale, non rinnova i tempi.
Se input/report del reader sono presenti, l'inspector esegue i reader/verifier
**autentici** originali e confronta scope, contenuto, fonti scientifiche,
RAW/catalogo/report, board, diagnostica e tempi presenti. Un report sintetico
presentato come autentico è rifiutato. La sola verifica byte senza quei riferimenti
resta `archiveLinkageVerified:false`, non verifica semantica.

Anche un descriptor completo rimane `NOT_AUTHORIZED`: approvazione della policy,
autorizzazioni/ricevute remote provider, review umane/settlement e persistenza di
decisioni autentiche restano verifiche irrisolte esplicite. Nessuna firma o
approvazione è creata. La policy sintetica è rifiutata come policy prospettica,
anche se copiata in un file con nome diverso; il descriptor non è un loader di
policy eseguibili.

## Confine autentico/sintetico

La CLI autentica `multimarket-read.mjs` è invariata e non importa il wrapper.
Non esiste una nuova CLI autentica di composizione o un'opzione per abilitare
un pilot. Il wrapper richiede schema **test-only**, `sourceKind:SYNTHETIC_TEST_ONLY`,
coorte `SYNTHETIC-READER-COHORT`, namespace del reader sintetico, sourceData
`synthetic_test`, studio sintetico, squadre esplicitamente SYNTHETIC e ID interni
di test. Rilegge tutte le sorgenti con i controlli M4-A e ricostruisce M1/M2:
non converte un report autentico cambiandone un flag.

Il linkage originale conserva `sourceKind`, coorte/giornata, riferimenti e hash.
L'input M3 conserva il proprio schema senza campi aggiunti arbitrariamente. La
ricevuta esterna collega tale input all'archivio M4 e all'unica decisione M3.
Tutti i risultati restano `operationallyApproved:false`, `scientificallyValidated:false`,
`authenticExecutionAllowed:false`, `actualStakeEUR:0`, senza pacchetti Android.

## Persistenza e tempo

Namespace nuovo: `.local/mm-integration-test-only-v1/<hash(scope,policy)>/`.
Contiene soltanto intent/receipt di **integrazione sintetica**, lock e temporanei
propri. L'autorità M3 rimane nel namespace originale
`.local/mm-simulator-synthetic-v1/`: non riceve nuovi file, né decisioni copiate.
Non esistono nuovi numeri di tentativo o reset dei budget. Input diversi nello
stesso scope/policy producono conflitto.

Sono riutilizzati `privateLock`, envelope, `writeExclusive`, read-session e
verifier M3. Il breve controllo directory del namespace nuovo usa le medesime
regole canoniche/no-link; il helper privato M3 non viene esportato o modificato,
per preservare gli hash del codice cui sono legate le vecchie ricevute.
Junction/symlink e attraversamenti non ammessi sono rifiutati anche in verifica.

Prima di directory, lock o intent nuovi vengono validati clock, evidenze e
limite temporale persistito nelle fasi M3 già scritte. Un clock retrogrado o una
quota scaduta non aggiunge neppure file temporanei. Le sorgenti sono ricontrollate
prima degli effetti e dopo il compositore: una sostituzione interrompe la catena.

Un `commit-proof` M3 già verificabile consente esclusivamente il recupero della
ricevuta mancante tramite il runner M3 originale; non crea una nuova decisione,
non rinnova le quote e conserva il completamento simulato originario. Un replay
completo rilegge soltanto: byte, mtime e directory restano identici. Temporanei
incompleti non pubblicati sono preservati; un intent pubblicato troncato o
alterato arresta il recupero, senza sovrascrittura.

## Demo completamente sintetica

Evidenze private: `.local/diagnostics/mm-m4b-20261028/demo-summary.private.json`,
`positive-report.private.json`, `negative-universe-report.private.json` e
rispettivi sottoarchivi. Dataset costruito tramite helper di test, senza API,
senza fit e senza risultati reali per scegliere combinazioni.

Tempo simulato dichiarato: **30 ottobre 2026 12:51 UTC**, freeze sintetico
12:47, quote sintetiche osservate 12:50. Le esecuzioni reali del reader e le
scritture delle ricevute sono datate **28 ottobre 2026**, separatamente.

| Caso | Dati | Esito |
|---|---|---|
| Positivo G9 inventato | 10 fixture scientifiche e prezzi, 20 board completi, 4 aperti e 16 chiusi; 40 selezioni/80 probabilità | `SYNTHETIC_EXPLORATORY_SIMULATION_RECORDED`; quattro ticket di test verificati, nessuna ammissibilità autentica |
| Universo incompleto | 10 fixture scientifiche, soltanto 9 nei prezzi, 18 board | `ANALYSIS_INCOMPLETE`, fixture id9009 esplicita, 2 board mancanti e incoerenza scope: `coverageGaps:3`; nessun NO_BET globale |
| Provenienza falsa | Input di test dichiarato `LOCAL_AUTHENTIC_ARCHIVE` | `MM4B_TEST_ONLY_INPUT_REQUIRED` prima degli effetti, file e directory invariati |

Il caso positivo esamina 154 sottoinsiemi, visita 246 nodi, costruisce 16
combinazioni rispettando fixture/squadre e verifica 4 ticket ammessi dai gate
sintetici. Quote, review e ticket sono inventati: nessun prezzo è realmente offerto.
Il prodotto delle quote non sostituisce il ticket; probabilità congiunta puntuale
e intervallo congiunto restano null. Fréchet inferiore zero resta zero e produce
il limite economico inferiore -1 senza correzioni nel test dedicato.

Hash demo positiva:

```text
linkage payload 22a603695bdf1021821133fb74fc787dd416fc82610b55fb7c068f6ec0266d48
decision payload 94116df9301b6a667006a9f06215628f92c0f67c6ca72ebb482705049082aed5
integration receipt bytes 466601313b22558058323f478d7d281e492c40ba5fea8fba545083231e828c19
```

Verifier indipendente e replay coincidono sugli hash e sulla decisione;
un nuovo clock di consultazione simulato non rinfresca il risultato.

## Verifiche di chiusura

Il gruppo dedicato integrato supera **172/172** test, inclusi i **33 nuovi** casi
M4-B. Copre undici interruzioni delimitate alle fasi critiche, arresto reale di
un processo dopo `decision.json`, due BUSY, recupero serializzato, junction reali,
quote scadute e clock retrogrado senza nuovi file/directory, input o ricevute
alterati, provenienza falsa, comparator missing/invalid, board incompleti/chiusi,
budget 20.000/100.000/10 e Fréchet inferiore esattamente zero. Il test lock
preesistente usa sei processi/600 tentativi: zero sovrapposizioni osservate.

Una prima assertion di sviluppo usava il nome di campo sbagliato
(`presentFixtures` invece di `receivedFixtures`) ed è stata corretta nel nuovo
test. Un'altra esecuzione è stata invalidata da una modifica del nuovo codice
durante la prova: il binding del codice l'ha arrestata con conflitto, come
previsto. I log sono conservati; le prove finali sono avviate con codice fermo.
Nessun test preesistente è modificato, saltato o indebolito.

| Verifica finale Windows | Risultato |
|---|---|
| M1–M4-B e lock dedicati | **172/172**, zero failure/skip, 168,97s |
| Regressione completa seriale | **634/634**, zero failure/skip, 563,79s |
| Regressione completa parallela | **634/634**, zero failure/skip, 197,83s |
| Lint | Exit 0; solo avviso preesistente `combinedPlayedOdd`, `app/components.tsx:9` |
| Build Next 16.4.3 | Exit 0; TypeScript e tre pagine statiche completati, 13,27s |
| Integrità degli originali | **5.987/5.987** file preesistenti invariati per byte, dimensione e mtime |
| Segreti e confine CLI | Nessuna credenziale nei sei file nuovi; nessun chiamante applicativo del runner sintetico |

Baseline 601 + 33 test nuovi = 634. Nessuna modifica ai test preesistenti.
Node **24.19.0**, npm **11.17.0**; nessuna installazione o modifica di dipendenze.
I log completi e i riepiloghi di ciascun comando rimangono privati. La guardia
di rete copre anche i processi figli; nessun provider è stato chiamato. Eventuali
controlli di versione Next verso il registro npm sono bloccati e censiti, non
confusi con chiamate applicative o acquisizioni.

Comandi eseguiti dal root, con guardia privata nelle prove finali:

```powershell
node --test tests/mm-offline-integration.test.mjs
node --test --test-concurrency=1 tests/*.test.mjs
node --test tests/*.test.mjs
npm run lint
$env:NEXT_TELEMETRY_DISABLED='1'
npm run build
```

Lint/build sono stati lanciati dal runner privato direttamente attraverso i
binari npm installati, equivalenti agli script sopra; non è avviato alcun server.
La suite dedicata completa comprende tutti i file `mm-*.test.mjs` e i due gruppi
di test lock. Le esecuzioni complete finale seriale e parallela sono distinte.

Il replay G8 autentico è **READ_ONLY_LINKAGE_VERIFIED**: intero report M2 e
contenuto M4 identici agli originali. SHA diagnostica M2
`f7e193ce526c102d3d1b72391298c2b2e6723c19f815a12e3827722512ffd075`, SHA contenuto M4
`18b8c9ee273744a7bd7ca598310a210a61fd9920ab2d944a84d86da35234ec63`.
Nessuna esecuzione del compositore su G8. Un descriptor di regressione privata
verifica il collegamento autentico attraverso il reader ufficiale e rimane
`DESCRIPTOR_ONLY_NOT_AUTHORIZED`; un RAW copiato altrove con byte identici è
rifiutato come sostituzione del riferimento originale. Non viene modificato
alcun report/journal/receipt storico.

## Gap prima di un eventuale pilot

1. Occorre un percorso ufficiale, separatamente autorizzato e collaudato, che
   produca gli artifact dei freeze di giornate successive. M4-A li legge, M4-B
   non li scrive; non esistono nuovi consensi o journal autentici futuri.
2. Serve un universo futuro esplicitamente autorizzato e il relativo consenso
   al freeze. Il consenso G8 non viene esteso a G9.
3. Serve una policy prospettica distinta, approvata e versionata: quella M3-B
   è registrata solo per simulazione, con soglie EV euristiche non validate.
4. Quote fresche autorizzate, ricevute/ledger provider, context/settlement e
   review umane effettive, ticket combinato esatto e limiti persistenti devono
   essere verificati da un percorso autentico ancora da autorizzare/sviluppare.
5. Occorrono runner e persistenza autentici distinti, audit della catena e
   revisione delle decisioni; nessuna conversione automatica della simulazione.
6. `validatedMarkets:[]` resta invariato. Intervalli marginali descrittivi non
   sono simultanei; Fréchet può essere troppo ampio per qualsiasi proposta.

Le dipendenze e l'APK non cambiano. Restano i rischi documentati dall'audit del
28 ottobre: zero critical nell'ultimo audit, ma 14 high/5 moderate/1 low nel
controllo completo e 2 high/3 moderate in produzione. Non è stato rieseguito un
audit di rete né avviato un server; test/build usano la guardia di rete privata.
Questi risultati offline non autorizzano deploy, Android o funzionalità esposte.

## Git e pubblicazione

Il delta M4-B è limitato ai sei file nuovi sopra elencati. I due file locali
non correlati già presenti sono preservati ed esclusi dal commit. Originali,
approvazioni e ricevute G8, screening `0001`, coorte, archivi provider, selettore
1X2, Android, Firebase, package e lockfile restano invariati. L'impronta e il
percorso delle evidenze sintetiche sono conservati nel namespace diagnostico.

È previsto soltanto un commit **locale** di questa milestone dopo i controlli;
lo SHA effettivo è riportato nella consegna. Nessun push né nuova CI remota.
Il riferimento remoto osservato localmente rimane
`d712a173d7d73e78f2ec2f1758813b6e619640f9`; la CI precedente non certifica M4-B.
PR #2 e main non sono modificati.

Nessuna API provider, nuovo forecast/freeze, refit, screening G8, decisione
autentica, attivazione policy, invio, scheduler, deploy, merge o push.
Stake reale **0 €**.

**M4-B COMPLETE — OFFLINE INTEGRATION VERIFIED**
