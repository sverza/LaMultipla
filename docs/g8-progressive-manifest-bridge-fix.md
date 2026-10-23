# G8 — progressive manifest bridge fix

Il journal autentico contiene `manifest.schema: lamultipla-round-manifest-v1`. Il precedente merge `{schema: scheduleSchema, ...manifest}` lasciava prevalere quello schema anche quando il chiamante richiedeva un calendario: il validatore reale si arrestava con `PROGRESSIVE_ROUND_IDENTITY_INVALID` prima di produrre la decisione.

La conversione `scheduleFromJournalManifest()` ora proietta esplicitamente stagione, giornata ed eventi nello schema calendario. Ammette soltanto i due schemi conosciuti e i manifest storici in memoria privi di schema; rifiuta schemi espliciti sconosciuti. Il validatore di identità rimane invariato. La stessa conversione corregge il confronto con il forecast originale nell'adapter progressivo. Nessun journal viene modificato.

`roundIdentitySha256` viene confrontato con l'identità validata una sola volta, senza cambiarne la semantica: stagione, giornata, fixture e squadre canoniche. La validità dei kickoff resta controllata dal validatore; la loro integrità puntuale resta legata al manifest/journal sigillato e alla riconciliazione del calendario. Non si cambia il digest per includere nuovi campi, né si rigenerano metadati già persistiti.

I sette nuovi test usano il manifest completo e il validatore effettivo: riproduzione del vecchio merge, input congelati, rifiuto di identità alterate e kickoff invalidi, rilevazione di modifiche al manifest e recupero dello stesso intent senza decisione per MULTIPLA_SIMULATA, NO_BET e ANALYSIS_INCOMPLETE. Restano separati test sintetici e dati scientifici autentici.

Validazione locale: 478 test della suite completa e 50 del lotto mirato superati; lint senza errori con il solo warning preesistente in `app/components.tsx`; build riuscita. Nessun deploy. Il fix non modifica probabilità, modelli, governance, selettore, policy temporali o ricevute scientifiche.

Un eventuale recupero reale richiede gli stessi input dell'intent, nessuna decisione incompatibile e quote ancora fresche all'ora reale della decisione. Il test sintetico non autorizza clock storici, nuove richieste provider o un nuovo numero di tentativo. Dopo la scadenza delle quote il recupero operativo deve fermarsi.
