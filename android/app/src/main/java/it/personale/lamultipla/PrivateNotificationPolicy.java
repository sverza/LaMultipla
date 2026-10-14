package it.personale.lamultipla;
import org.json.JSONObject;

/** Existing notification decisions, exposed for isolated Android tests. */
final class PrivateNotificationPolicy {
    static boolean silent(JSONObject statement) throws Exception {
        return statement.getString("kind").equals("preview") && statement.getString("status").equals("no_bet");
    }
    static boolean expired(JSONObject statement,long now) throws Exception {
        return PrivateProtocol.time(statement.getString("expiresAtUtc")) <= now;
    }
    static String title(JSONObject statement) throws Exception {
        return statement.getString("status").equals("simulation") ? "LaMultipla · proposta shadow" :
            statement.getString("kind").equals("final") ? "LaMultipla · NO BET definitivo" : "LaMultipla · aggiornamento sperimentale";
    }
}
