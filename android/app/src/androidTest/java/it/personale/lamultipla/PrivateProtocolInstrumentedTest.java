package it.personale.lamultipla;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

/** Synthetic public-key-only vectors. Exercises real Android org.json. */
@RunWith(AndroidJUnit4.class)
public class PrivateProtocolInstrumentedTest {
    private JSONObject vectors() throws Exception {
        try (InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("private-protocol-vectors.json")) {
            ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;
            while((n=in.read(buffer))!=-1)out.write(buffer,0,n);
            JSONObject data=new JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8));
            assertEquals("SYNTHETIC_TEST_ONLY",data.getString("purpose"));return data;
        }
    }
    @Test public void fullPcFramesVerifyWithRealAndroidJson() throws Exception {
        JSONObject data=vectors(),profile=data.getJSONObject("profile");JSONArray cases=data.getJSONArray("cases");
        assertEquals(3,cases.length());
        for(int i=0;i<cases.length();i++) {
            JSONObject frame=cases.getJSONObject(i).getJSONObject("frame");String encoded=frame.getString("statement");
            assertEquals(encoded,PrivateProtocol.canonical(new JSONObject(encoded)));
            JSONObject statement=PrivateProtocol.verify(frame,profile);
            assertEquals("2026/27",statement.getString("season"));
            assertEquals(i==0?"simulation":"no_bet",statement.getString("status"));
            assertEquals(7+i,statement.getInt("matchday"));
        }
    }
    @Test public void equivalentButNoncanonicalBytesAndTamperingAreRejected() throws Exception {
        JSONObject data=vectors(),profile=data.getJSONObject("profile"),frame=data.getJSONArray("cases").getJSONObject(0).getJSONObject("frame");
        String encoded=frame.getString("statement"),escaped=encoded.replace("2026/27","2026\\/27");
        assertEquals("2026/27",new JSONObject(escaped).getString("season"));
        try {PrivateProtocol.statement(escaped,frame.getString("signature"),profile);fail("Noncanonical bytes accepted");} catch(Exception expected) {assertEquals("Audience",expected.getMessage());}
        for(String field:new String[]{"packageJson","signature"}) {
            JSONObject bad=new JSONObject(frame.toString());
            bad.put(field,field.equals("packageJson")?frame.getString(field)+" ":"A".repeat(86));
            try {PrivateProtocol.verify(bad,profile);fail("Tampering accepted");} catch(Exception expected) { /* rejected before any import */ }
        }
        JSONObject wrong=new JSONObject(profile.toString());wrong.getJSONObject("trust").put("readerUid","SYNTHETIC_OTHER");
        try {PrivateProtocol.verify(frame,wrong);fail("Wrong recipient accepted");} catch(Exception expected) {assertEquals("Audience",expected.getMessage());}
    }
}
