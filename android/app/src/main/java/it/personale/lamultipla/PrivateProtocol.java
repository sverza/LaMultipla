package it.personale.lamultipla;

import android.util.Base64;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.HashMap;
import java.util.Locale;
import java.util.TimeZone;

final class PrivateProtocol {
    static final int MAX_BYTES = 262144;
    static byte[] decode(String value) throws Exception {
        if (!value.matches("^[A-Za-z0-9_-]{1,4096}$")) throw new Exception("Encoding");
        byte[] result = Base64.decode(value, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        if (!Base64.encodeToString(result, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING).equals(value)) throw new Exception("Encoding");
        return result;
    }
    static String hash(String value) throws Exception { return PrivateSignature.sha256(value.getBytes(StandardCharsets.UTF_8)); }
    static String canonical(JSONObject object) throws Exception {
        HashMap<String,Object> values = new HashMap<>();
        object.keys().forEachRemaining(name -> { Object value = object.opt(name); values.put(name, value == JSONObject.NULL ? null : value); });
        return PrivateCanonicalJSON.encode(values);
    }
    static long time(String value) throws Exception {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));format.setLenient(false);
        long time = format.parse(value).getTime();
        if (value.length() != 24 || !format.format(new java.util.Date(time)).equals(value)) throw new Exception("Time");return time;
    }
    static JSONObject statement(String encoded, String signature, JSONObject profile) throws Exception {
        if (encoded.length() > 4096) throw new Exception("Statement size");JSONObject s = new JSONObject(encoded);
        String[] required = {"schema","channel","keyId","readerUid","applicationId","sequence","previousDeliveryHash","season","matchday","kind","status","envelopeSha256","packageSha256","deliveryId","generatedAtUtc","expiresAtUtc"};
        if (s.length() != required.length) throw new Exception("Fields");for (String name : required) if (!s.has(name)) throw new Exception("Fields");
        JSONObject trust = profile.getJSONObject("trust");String keyId = s.getString("keyId");
        if (!encoded.equals(canonical(s)) || !s.getString("schema").equals("lamultipla-private-statement-v1")
            || !s.getString("readerUid").equals(trust.getString("readerUid")) || !s.getString("applicationId").equals(trust.getString("applicationId"))
            || !s.getString("channel").equals(trust.getString("channel"))) throw new Exception("Audience");
        for (String name : new String[]{"keyId","envelopeSha256","packageSha256","deliveryId"}) if (!s.getString(name).matches("^[a-f0-9]{64}$")) throw new Exception("Hash");
        long sequence = s.getLong("sequence");int round = s.getInt("matchday");
        if (sequence < 1 || sequence > 1000000 || round < 1 || round > 38 || !s.getString("season").matches("^[0-9]{4}/[0-9]{2}$")
            || !(s.getString("kind").equals("preview") || s.getString("kind").equals("final"))
            || !(s.getString("status").equals("simulation") || s.getString("status").equals("no_bet"))
            || (sequence == 1 ? !s.isNull("previousDeliveryHash") : !s.getString("previousDeliveryHash").matches("^[a-f0-9]{64}$"))) throw new Exception("Manifest");
        if (s.getString("channel").equals("shadow") && s.getString("season").equals("2026/27") && round <= 6) throw new Exception("Protected pilot");
        long generated = time(s.getString("generatedAtUtc")), expires = time(s.getString("expiresAtUtc"));
        if (generated > System.currentTimeMillis() || expires <= generated || expires - generated > 86400000) throw new Exception("Clock");
        byte[] spki = decode(trust.getJSONObject("keys").getString(keyId));
        if (!PrivateSignature.sha256(spki).equals(keyId) || !PrivateSignature.verify(spki, decode(signature), encoded)) throw new Exception("Signature");
        JSONObject identity = new JSONObject();for (String name : new String[]{"channel","readerUid","applicationId","season","matchday","kind","envelopeSha256"}) identity.put(name,s.get(name));
        if (!hash(canonical(identity)).equals(s.getString("deliveryId"))) throw new Exception("Identity");return s;
    }
    static JSONObject verify(JSONObject frame, JSONObject profile) throws Exception {
        if (frame.length() != 4 || !frame.getString("schema").equals("lamultipla-private-delivery-v1") || frame.toString().getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) throw new Exception("Frame");
        JSONObject s = statement(frame.getString("statement"),frame.getString("signature"),profile);
        String packageJson = frame.getString("packageJson");if (!hash(packageJson).equals(s.getString("packageSha256"))) throw new Exception("Payload");
        JSONObject e = new JSONObject(packageJson),p=e.getJSONObject("payload"),round=p.getJSONObject("round"),op=p.getJSONObject("operational");
        if (!e.getString("schema").equals("lamultipla-prospective-envelope-v1") || !e.getString("sha256").equals(s.getString("envelopeSha256"))
            || !p.getString("schema").equals("lamultipla-app-decision-v4") || !p.getString("mode").equals("experimental") || p.getDouble("actualStakeEUR") != 0
            || op.getBoolean("authorized") || op.getBoolean("publicationAllowed") || !op.getString("decision").equals("NO_BET")
            || !round.getString("season").equals(s.getString("season")) || round.getInt("matchday")!=s.getInt("matchday")
            || !p.getString("status").equals(s.getString("status")) || !p.getString("generatedAtUtc").equals(s.getString("generatedAtUtc"))
            || !(p.getBoolean("final")?"final":"preview").equals(s.getString("kind"))
            || (s.getString("channel").equals("synthetic_shadow") != p.getString("sourceData").equals("synthetic_test"))) throw new Exception("Contract");
        // Exact byte hash and PC signature authenticate this envelope. The full
        // shared v4 semantic parser runs again before the WebView archive/ACK.
        return s;
    }
}
