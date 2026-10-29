package it.personale.lamultipla;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

/** Ephemeral synthetic signatures. No vault, archive, network or device registration. */
@RunWith(AndroidJUnit4.class)
public class PrivateRoundStateInstrumentedTest {
    private JSONObject vectors() throws Exception {
        try(InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("private-round-state-vectors.json")){
            JSONObject d=new JSONObject(new String(in.readAllBytes(),StandardCharsets.UTF_8));
            assertEquals("SYNTHETIC_TEST_ONLY",d.getString("purpose"));return d;
        }
    }
    @Test public void pcStatesAndProposalVerifyWithNativeJsonAndOneChain() throws Exception {
        JSONObject d=vectors(),profile=d.getJSONObject("profile");JSONArray cases=d.getJSONArray("cases");String previous=null;
        assertEquals(5,cases.length());
        for(int i=0;i<cases.length();i++){
            JSONObject c=cases.getJSONObject(i),statement=PrivateProtocol.verify(c.getJSONObject("frame"),profile);
            assertEquals(i+1,statement.getInt("sequence"));
            assertEquals(previous,statement.isNull("previousDeliveryHash")?null:statement.getString("previousDeliveryHash"));
            previous=c.getString("deliveryHash");
            assertEquals(i<3,PrivateNotificationPolicy.silent(statement));
            assertEquals(i==3?"LaMultipla · proposta shadow":i==4?"LaMultipla · NO BET definitivo":"LaMultipla · aggiornamento sperimentale",PrivateNotificationPolicy.title(statement));
            long expiry=PrivateProtocol.time(statement.getString("expiresAtUtc"));
            assertFalse(PrivateNotificationPolicy.expired(statement,expiry-1));assertTrue(PrivateNotificationPolicy.expired(statement,expiry));
        }
    }
    @Test public void modifiedPayloadAndRecipientFailBeforeAnyInboxOrAck() throws Exception {
        JSONObject d=vectors(),profile=d.getJSONObject("profile"),frame=d.getJSONArray("cases").getJSONObject(0).getJSONObject("frame");
        JSONObject changed=new JSONObject(frame.toString());changed.put("packageJson",frame.getString("packageJson").replace("NO_BET_PROVISIONAL","NO_BET_FINAL"));
        try{PrivateProtocol.verify(changed,profile);fail("Modified state accepted");}catch(Exception expected){assertEquals("Payload",expected.getMessage());}
        JSONObject wrong=new JSONObject(profile.toString());wrong.getJSONObject("trust").put("channel","shadow");
        try{PrivateProtocol.verify(frame,wrong);fail("Wrong channel accepted");}catch(Exception expected){assertEquals("Audience",expected.getMessage());}
    }
}
