# La Multipla · Serie A

PWA mobile-first con stake fisso di 3 €. Nessun backend: schedine e backup restano sul dispositivo in IndexedDB.

## Avvio e build
`npm run dev` avvia l'app; `npm run build` crea il sito statico in `out/`.

Il workflow incluso pubblica il ramo `main`; su GitHub scegliere **Settings → Pages → Source: GitHub Actions**.

## Android con Capacitor
Eseguire `npm run build`, poi `npm run android:add` (solo la prima volta), `npm run android:sync` e `npm run android:open`. Da Android Studio si genera l'APK.

Lo schema JSON e un esempio copiabile sono disponibili direttamente nell'app.
