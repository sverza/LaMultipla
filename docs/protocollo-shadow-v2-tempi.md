# Policy shadow-value-v2: forecast congelati e prezzi successivi

Registrazione: 2026-10-10T10:10:21Z, prima dell'implementazione e di nuove acquisizioni. Motivazione: il collaudo locale v1 ha restituito INSUFFICIENT_DATA sul report del 9 ottobre; il vincolo di distanza forecast/quote avrebbe inoltre escluso prezzi nuovi confrontati con il forecast congelato alle 06:22Z. La modifica non deriva da nuovi prezzi, esiti o ottimizzazione del rendimento. Non è una preregistrazione retroattiva dei dati già osservati.

Il protocollo shadow v1 rimane archiviato, i suoi snapshot non cambiano. Il modello goals-v1-b630b78, i parametri, il cutoff e i journal prospettici restano identici. Tutti i criteri EV, incertezza, identità, disponibilità, combinazioni e stake reale zero restano quelli di v1. Cambia soltanto il trattamento temporale del confronto.

## Screening di valore al momento della decisione

Usare il forecast originale immutabile generato al massimo 24 ore prima della decisione. Usare prezzi osservati DOPO il forecast e DOPO questa registrazione, non nel futuro e non più vecchi di 30 minuti alla decisione. Non richiedere che il prezzo sia stato osservato entro 30 minuti dalla generazione del forecast. L'informazione statistica può essere più vecchia del prezzo: registrare esplicitamente questo ritardo e il rischio di informazioni sopravvenute non modellate. Nessun aggiornamento delle probabilità con le quote, nessun ricalcolo per rinnovare il timestamp.

Identità, training prima degli eventi e decisione almeno 5 minuti prima del calcio d'inizio rimangono obbligatori. Forecast scaduti richiedono una futura nuova versione/coorte autorizzata, non la modifica del journal esistente. Le quote vecchie del precedente test non possono produrre nuove decisioni v2. La preview v1 già salvata resta distinta.

## Baseline e prestazioni del mercato

Una lavagna completa e utilizzabile può produrre probabilità implicite senza margine come diagnostica al momento della decisione. Per confrontare log-loss/Brier modello e mercato rispetto allo stesso momento informativo, mantenere la distanza massima di 30 minuti dal forecast. Tutte le osservazioni dei prezzi e, se presenti, le verifiche manuali devono rispettarla; verifiche manuali della lavagna entro 5 minuti tra loro. Registrare `compatible`, ritardo, osservazioni e verifiche, senza etichettare compatibile una lavagna successiva di ore.

Per lavagne lontane dal forecast: `compatible=false`, probabilità implicite conservate, differenza forecast/mercato non pubblicata come confronto contemporaneo e nessun ingresso nel benchmark predittivo verificato. La baseline Inter–Parma congelata alle 06:25:50Z resta valida e distinta: non aggiornarla con prezzi nuovi.

La decisione finale è unica per giornata/versione policy; le versioni non vanno aggregate come un solo esperimento. La nuova versione consente solo nuove decisioni shadow, non scommesse o promozione operativa. Il limite di 24 ore è una euristica ancora da valutare prospetticamente, non prova della validità di informazioni datate.
