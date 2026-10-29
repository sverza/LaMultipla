# Android — estensione multimercato e Release privata

## Una sola identità applicativa

Il candidato Release usa **`it.personale.lamultipla`**, lo stesso applicationId definitivo, e Capacitor Android **8.5.1**. Non crea una seconda app `.collaudo`. La preparazione avviene in una nuova directory privata tramite `scripts/prepare-android-private-release.mjs`, senza modificare i sorgenti nativi originali.

Nella copia di distribuzione sono disabilitati il feed pubblico, il controllo di aggiornamenti pubblico e i job legacy di acquisizione. Pairing, regole Firebase e canale privato v4 non vengono riconfigurati o attivati. Non vengono copiati keystore, credenziali, RAW o ricevute private nei sorgenti della build. L'APK e i rapporti di firma restano esclusi da Git; nessun workflow lo distribuisce con il push del branch.

La firma richiede un keystore Release persistente esterno al repository. Non si usa la chiave debug. Trovare il keystore originale non dimostra che l'app sul telefono abbia quella firma: prima di un aggiornamento occorre confrontare **applicationId, certificato e versionCode installati**. Nessuna disinstallazione automatica è prevista.

## Contratto di visualizzazione separato

`shared/multimarket-experiment.mjs` introduce `lamultipla-mm-app-experiment-v1`, envelope e frame di firma locale versionati. Non è una schedina v4 e non estende il contratto cloud. In questa versione accetta esclusivamente `SYNTHETIC_TEST_ONLY`, firma ECDSA P-256 e chiavi pubbliche con uso `SYNTHETIC_ONLY`, legate all'applicationId. Non esiste un flag che promuova questi dati ad autentici.

La sezione Esperimento visualizza:

- **MULTIPLA ESPLORATIVA**, con combinazioni matematiche e nessuna ammissibilità operativa;
- **NO BET ESPLORATIVO**, soltanto per uno slot completo senza combinazioni;
- **ANALYSIS_INCOMPLETE**, conservando lacune ed esclusioni.

Sono mostrati prezzi internazionali, DC-v2 e comparatore bivariato, incertezza marginale, Fréchet, tempi artificiali dei test e tempi reali della firma. Il prezzo teorico è esplicitamente distinto dal ticket effettivo non verificato. Stake reale zero; nessuna registrazione di giocate.

`shared/multimarket-store.mjs` usa un database IndexedDB separato, `lamultipla-mm-local-test-v1`. Verifica prima di scrivere, impedisce duplicati e conflitti, mantiene i frame scaduti come archivio senza rinnovare i tempi, ed esporta/ripristina un backup firmato separato. Un backup v4 dello storico non contiene automaticamente questo nuovo archivio: occorre esportare anche il backup multimercato se presente.

La UI autentica/cloud multimercato rimane **non attiva**. Il percorso PC può essere approvato separatamente; questa estensione non autorizza consegne dei futuri risultati reali al Samsung.

## Collaudi

`tests/multimarket-app.test.mjs` copre tre stati, firme, hash, manifest, provenienza, duplicati, scadenza, persistenza e ripristino; verifica l'invarianza dei database legacy/v4. `tests/browser-multimarket.mjs` esercita il sito statico della Release su localhost con Chromium desktop/mobile, firme sintetiche, importazione, alterazione, duplicati, riapertura e backup/ripristino. Le richieste esterne sono vietate. Il test browser v4 originale è rieseguito sullo stesso export statico.

`tests/private-owner-release.test.mjs` controlla isolamento della copia, applicationId invariato, rifiuto di sovrascritture, disabilitazione dei job pubblici e backup crittografato. Non installa nulla e non prova la conservazione sul Samsung non collegato.

## Backup della chiave

`scripts/private-release-backup.mjs --help` descrive una procedura manuale Windows. Il backup portabile usa AES-256-GCM e scrypt; una finestra locale mascherata acquisisce la passphrase, mai argomenti di comando o file versionati. Il file deve stare fuori Git e fuori directory sincronizzate. L'operazione scrive esclusivamente un nuovo file e ne verifica subito la decrittazione. `--verify` controlla un backup senza ripristinare né sostituire il vault.

La copia DPAPI è legata all'utente Windows e **non sostituisce un backup portabile**. Conservare la passphrase separatamente, con una copia offline del backup, prima di reinstallazioni del PC. Il backup reale non viene esportato automaticamente e la passphrase non viene scelta dall'assistente. La procedura privata contiene i percorsi effettivi e i passi di recupero controllato, senza password.

## Aggiornamento o reinstallazione futura

Prima di qualsiasi installazione autorizzata: esportare il backup completo nell'app attuale, copiarlo sul PC e verificarne parsing, conteggi e campi; conservare una seconda copia locale. Esportare separatamente l'archivio multimercato, se presente. Verificare il ripristino su un archivio sintetico isolato senza cancellare il telefono.

Se applicationId e firma coincidono e la versione cresce, si può proporre un aggiornamento che conserva i dati. Se la firma differisce o l'identità installata è sconosciuta, fermarsi: serve una decisione esplicita sulla migrazione, con backup reale verificato prima di un'eventuale reinstallazione. I test di ripristino sintetici non certificano un backup del telefono mai ricevuto.

Nessun APK viene installato, pubblicato, inviato via Firebase o distribuito da questo sprint.
