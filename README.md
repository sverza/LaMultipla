# La Multipla · Serie A

App personale, mobile-first, per analisi sperimentali e storico Serie A, disponibile come PWA e APK Android. Schedine legacy, esperimenti, risultati e preferenze restano sul dispositivo in IndexedDB. Il nuovo canale privato PC → Firebase → Android usa account separati, pacchetti firmati e conferme di ricezione; non è il feed pubblico delle schedine.

Il motore è sperimentale: **stake reale sempre 0 €**, nessuna autorizzazione al gioco o alla pubblicazione di proposte. Il tracker legacy da 3 € resta distinto dall'archivio **Esperimento** v4.

## Protocollo di analisi unico

Il [protocollo generale v1](docs/protocollo-generale-v1.md) coordina acquisizione privata, modelli indipendenti, EV, contesto, liquidazione, combinazioni, congelamento e valutazione. `shadow.mjs` è l'unico produttore di decisioni; `decision.mjs` ne verifica il replay e prepara pacchetti locali. Tutti i modelli restano sperimentali per il gioco, stake reale zero: nessuna pubblicazione automatica. [Audit dell'architettura e punto 10](docs/rapporto-protocollo-2026-10-10.md).

## Analisi sperimentali private v4

Il collegamento decisione → app è implementato: `decision --app-package` prepara un file privato verificato per la scheda **Esperimento**. MULTIPLA SIMULATA e NO BET motivato restano separati da storico/ROI, con stake reale 0 € e nessuna conferma di gioco. Backup v4 include l’archivio sperimentale e conserva compatibilità v3. [Contratto](docs/contratto-app-v4.md), [collaudo Windows](docs/collaudo-v4-windows.md), [rapporto e blocchi](docs/rapporto-punto10-2026-10-11.md).

## Funzioni principali

- schedine da 1 a 6 selezioni, importate tramite JSON o automaticamente da GitHub;
- bozza separata dalla schedina realmente giocata;
- risultati espliciti per selezione: in attesa, vinta, persa o nulla;
- chiusura multipla: vinta, persa, nulla o cash out;
- dashboard con puntato, ritorni, profit/loss, ROI, hit rate e win rate;
- grafico interattivo, mappa delle 38 giornate, serie positiva/negativa e massimo drawdown;
- confronto con la stagione precedente e analisi per mercato/fiducia;
- tema chiaro, scuro o automatico;
- backup JSON completo, ripristino, esportazione CSV e scheda immagine condivisibile;
- notifiche Android per nuove schedine e promemoria degli esiti;
- controllo aggiornamenti APK dalla pagina Impostazioni.

Nel tracker legacy lo stake nominale è fissato a 3 €. Una bozza non entra nelle statistiche finché non viene confermata come giocata.
Questa regola riguarda soltanto il tracker legacy: i pacchetti sperimentali v4 impongono stake reale zero e rifiutano la promozione a giocata.

## Calendario privato e orchestrazione Windows

Il raccoglitore `scripts/private-calendar.mjs` incrocia stagione, giornata, squadre e orari CC0 Openfootball con gli identificativi e kickoff UTC del provider. Mantiene snapshot privati immutabili, cache e budget condiviso con le quote. Dati mancanti, annullamenti, orari discordanti e turni incompleti impediscono l'ammissione; l'incrocio delle fonti **non è una riconferma ufficiale Lega**. Download recente e risultati aggiornati sono controlli distinti.

Il [gestore progressivo](docs/punto11-gestione-progressiva.md) collega il collector a giornate riconfermate, piani versionati e rivalutazioni delle partite residue, anche su giorni diversi. Il primo forecast scientifico resta immutabile, le revisioni shadow separate; NO BET provvisorio non chiude il ciclo e una proposta ammissibile viene finalizzata subito. Anticipo minimo due ore, con margini per calcolo/queue e prezzi da ricontrollare. Stati nuovi richiedono un ricevitore compatibile; v4 precedente rimane leggibile. Primo collaudo OddsPapi reale ancora da eseguire. Nessun task o nuovo APK attivato. [Protocollo](docs/protocollo-analisi-progressive-v1.md), [verifica originale del 15 ottobre](docs/verifica-originale-15-ottobre.md).

Preparazione del 13 ottobre: [fonti risultati e diritti](docs/fonti-risultati-seriea-2026-27.md), [prima prova originale G7](docs/preparazione-prima-prova-g7.md). `original-g6-check.mjs --inspect` verifica gli originali; `--record` è bloccato fino al15 ottobre e conserva i pending. Evidenze supplementari in quarantena, nessuna sostituzione CC0 o modifica dei modelli. Config progressivo G7 predisposto localmente, riconferme/input/cloud-client ancora da completare.

## Pubblicazione PWA su GitHub Pages

Il workflow `Pubblica su GitHub Pages` parte automaticamente a ogni push sul ramo `main`.

In GitHub deve essere selezionato **Settings → Pages → Source: GitHub Actions**. La build statica viene creata nella cartella `out/` e pubblicata senza server.

Per provare il progetto in locale:

```text
npm install
npm run dev
```

Controlli prima di pubblicare:

```text
npm run lint
npm test
npm run build
```

## Quote OddsPapi per l'analisi

L'importatore Node acquisisce privatamente sul PC le quote pre-match `bet365.it` di Serie A, con cache, controllo del piano Free e riserva sulla quota. I prezzi vengono passati a uno screening che richiede stime indipendenti, contesto e verifica manuale finale; può concludere NO BET e non pubblica schedine. Il motore privato dispone di modelli indipendenti con validazione retrospettiva 1X2; la validazione futura e l’autorizzazione operativa sono ancora incomplete. L’app è il tracker, non il motore statistico.

Istruzioni Windows, contratto di analisi e limiti: [importatore privato OddsPapi](docs/oddspapi-private-import.md). Non inserire chiavi o risposte API in `public/`, nel sorgente o negli artifact di GitHub.

## Contratto legacy di consegna v3

Questo contratto descrive il tracker esistente, non autorizza nuove proposte del motore. L’adapter v4 privato è separato; i diritti di pubblicazione restano da chiarire; non tradurre gli intervalli del modello in fiducia soggettiva.

La PWA controlla `public/latest-slip.json` all’apertura e quando torna in primo piano. L’APK lo controlla anche periodicamente in background e, se gli avvisi sono attivati, segnala una nuova giornata con una notifica. Android decide il momento esatto del controllo per proteggere la batteria.

Una schedina nuova viene importata come **bozza**. Deve poi essere confermata nell’app dopo averla giocata su bet365.

Il file ha questa forma:

```json
{
  "available": true,
  "id": "2026-27-g1",
  "slip": {
    "season": "2026/27",
    "matchday": 1,
    "date": "2026-08-29",
    "notes": "Prima giornata",
    "selections": [
      {
        "match": "Squadra A - Squadra B",
        "market": "Over 1.5",
        "odd": 1.35,
        "probability": 78,
        "confidence": 4
      }
    ]
  }
}
```

`id` deve cambiare per ogni consegna. Per nascondere la proposta usare `{ "available": false }`. Non inserire token o password: il file viene pubblicato insieme al sito.

## APK Android

Il progetto Capacitor è già presente nella cartella `android/`. L’APK viene generato su GitHub, quindi non serve installare Android Studio sul PC.

1. Conservare in privato il file `LaMultipla-signing-backup.zip` consegnato a parte.
2. Aprire il file `LEGGIMI.txt` contenuto nello ZIP.
3. In GitHub aprire **Settings → Secrets and variables → Actions**.
4. Creare i quattro Repository secrets indicati nel file.
5. Aprire **Actions → Genera APK Android → Run workflow**.
6. Al termine, scaricare `LaMultipla-Android` dalla sezione **Artifacts** dell’esecuzione.

Con i quattro secret viene creato `LaMultipla.apk`, firmato e aggiornabile mantenendo i dati. Senza secret viene creato soltanto `LaMultipla-prova.apk`.

Per pubblicare automaticamente una versione nella sezione **Releases**, creare un tag come `v1.0.0`. Il file `public/app-version.json` comunica all’app l’ultima versione disponibile e il collegamento di download.

La chiave di firma non va mai caricata nel repository. Senza la stessa chiave non sarà possibile installare un aggiornamento sopra la versione precedente.

## Aggiornamenti

- Una nuova schedina richiede solo l’aggiornamento di `latest-slip.json`, non un nuovo APK.
- Modifiche a grafica o funzioni della PWA arrivano al successivo aggiornamento del sito.
- Modifiche alle funzioni native, alle notifiche o alla versione Android richiedono un nuovo APK firmato.
- Prima di reinstallare o cambiare telefono è sempre consigliato creare un backup completo dall’app.
