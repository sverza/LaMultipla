# La Multipla · Serie A

Tracker personale, mobile-first, per una multipla Serie A da 3 € a giornata. Funziona come PWA e come app Android; non usa backend, account o Firebase. Schedine, risultati e preferenze restano sul dispositivo in IndexedDB.

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

Lo stake è sempre fissato a 3 €. Una bozza non entra nelle statistiche finché non viene confermata come giocata.

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
npm run build
```

## Consegna automatica della schedina

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
