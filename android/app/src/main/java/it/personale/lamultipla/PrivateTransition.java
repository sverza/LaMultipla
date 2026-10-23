package it.personale.lamultipla;
import org.json.JSONObject;
import org.json.JSONArray;
import java.nio.charset.StandardCharsets;

/** One-way, signed transition. Never enables background work or modifies slips. */
final class PrivateTransition {
    private static void fields(JSONObject value,String... names)throws Exception{
        if(value.length()!=names.length)throw new Exception("Transition fields");
        for(String name:names)if(!value.has(name))throw new Exception("Transition fields");
    }
    static JSONObject verify(JSONObject frame,JSONObject current,long now)throws Exception{
        fields(frame,"schema","statement","signature","profileJson");
        if(!frame.getString("schema").equals("lamultipla-private-pairing-transition-v1")
            ||frame.toString().getBytes(StandardCharsets.UTF_8).length>16384||current.optBoolean("backgroundEnabled")
            ||current.optJSONObject("retiredSynthetic")!=null||current.optJSONArray("inbox")!=null&&current.getJSONArray("inbox").length()>0)throw new Exception("Transition state");
        JSONObject old=current.getJSONObject("profile"),trust=old.getJSONObject("trust"),next=new JSONObject(frame.getString("profileJson")),nt=next.getJSONObject("trust");
        fields(next,"schema","projectId","apiKey","mobileAppId","senderId","deviceId","trust");
        fields(nt,"readerUid","applicationId","channel","keys");
        if(!trust.getString("channel").equals("synthetic_shadow")||!nt.getString("channel").equals("shadow")
            ||!next.getString("schema").equals("lamultipla-private-pairing-v1")||!next.getString("deviceId").matches("^[a-z0-9-]{8,64}$")
            ||next.getString("deviceId").equals(old.getString("deviceId")))throw new Exception("Transition profile");
        for(String name:new String[]{"schema","projectId","apiKey","mobileAppId","senderId"})if(!old.getString(name).equals(next.getString(name)))throw new Exception("Transition profile");
        for(String name:new String[]{"readerUid","applicationId"})if(!trust.getString(name).equals(nt.getString(name)))throw new Exception("Transition profile");
        String encoded=frame.getString("statement");if(encoded.length()>4096)throw new Exception("Transition size");
        JSONObject s=new JSONObject(encoded);
        fields(s,"schema","keyId","projectId","readerUid","applicationId","fromDeviceId","fromChannel","toChannel",
            "expectedSequence","expectedDeliveryHash","profileSha256","generatedAtUtc","expiresAtUtc");
        String keyId=s.getString("keyId");
        if(!encoded.equals(PrivateProtocol.canonical(s))||!s.getString("schema").equals("lamultipla-private-pairing-transition-statement-v1")
            ||trust.getJSONObject("keys").length()!=1||nt.getJSONObject("keys").length()!=1
            ||!trust.getJSONObject("keys").getString(keyId).equals(nt.getJSONObject("keys").getString(keyId))
            ||!s.getString("projectId").equals(old.getString("projectId"))||!s.getString("readerUid").equals(trust.getString("readerUid"))
            ||!s.getString("applicationId").equals(trust.getString("applicationId"))||!s.getString("fromDeviceId").equals(old.getString("deviceId"))
            ||!s.getString("fromChannel").equals("synthetic_shadow")||!s.getString("toChannel").equals("shadow"))throw new Exception("Transition audience");
        long sequence=current.optLong("sequence",0);String hash=current.optString("deliveryHash","");
        if(sequence<0||sequence>1000000||s.getLong("expectedSequence")!=sequence
            ||(sequence==0?!s.isNull("expectedDeliveryHash"):!hash.matches("^[a-f0-9]{64}$")||!hash.equals(s.getString("expectedDeliveryHash"))))throw new Exception("Transition cursor");
        if(!PrivateProtocol.hash(frame.getString("profileJson")).equals(s.getString("profileSha256")))throw new Exception("Transition payload");
        long generated=PrivateProtocol.time(s.getString("generatedAtUtc")),expires=PrivateProtocol.time(s.getString("expiresAtUtc"));
        if(generated>now||expires<=now||expires-generated!=7*86400000L)throw new Exception("Transition clock");
        byte[] key=PrivateProtocol.decode(trust.getJSONObject("keys").getString(keyId));
        if(!PrivateSignature.sha256(key).equals(keyId)||!PrivateSignature.verifyTransition(key,PrivateProtocol.decode(frame.getString("signature")),encoded))throw new Exception("Transition signature");
        return next;
    }
    static JSONObject retiredState(JSONObject frame,JSONObject current,long now)throws Exception{
        JSONObject profile=verify(frame,current,now),retired=new JSONObject(current.toString());
        JSONObject next=new JSONObject().put("profile",profile).put("retiredSynthetic",retired).put("backgroundEnabled",false)
            .put("sequence",0).put("inbox",new JSONArray()).put("finals",new JSONObject()).put("notifiedThrough",0);
        if(current.has("session"))next.put("session",current.getJSONObject("session"));
        if(current.has("fcmToken"))next.put("fcmToken",current.getString("fcmToken"));
        // New registration is required in the separate channel. Never copy
        // registeredToken, deliveryHash, finals or cursor into its state.
        return next;
    }
}
