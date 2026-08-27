# La Multipla · Serie A

PWA mobile-first con stake fisso di 3 €. Nessun backend: schedine e backup restano sul dispositivo in IndexedDB.

## Avvio e build
`npm run dev` avvia l'app; `npm run build` crea il sito statico in `out/`.

Il workflow incluso pubblica il ramo `main`; su GitHub scegliere **Settings → Pages → Source: GitHub Actions**.

## Android con Capacitor
Eseguire `npm run build`, poi `npm run android:add` (solo la prima volta), `npm run android:sync` e `npm run android:open`. Da Android Studio si genera l'APK.

Lo schema JSON e un esempio copiabile sono disponibili direttamente nell'app.

## Consegna automatica della schedina

L'app controlla `public/latest-slip.json` a ogni apertura. Quando il file contiene una schedina nuova, mostra un'anteprima e permette di importarla come bozza con un tocco. Una bozza non viene conteggiata nelle statistiche finché non viene confermata come giocata.

Il processo programmato deve aggiornare il file con questa forma:

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

`id` deve cambiare a ogni nuova schedina. Non inserire token o chiavi nel file: viene pubblicato insieme al sito.
