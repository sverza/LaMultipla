package it.personale.lamultipla;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

/** Pure synthetic state. Does not touch PrivateVault, network, jobs or real archive. */
@RunWith(AndroidJUnit4.class)
public class PrivateTransitionInstrumentedTest {
    private JSONObject data()throws Exception{
        try(InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("private-transition-vectors.json")){
            JSONObject value=new JSONObject(new String(in.readAllBytes(),StandardCharsets.UTF_8));
            assertEquals("SYNTHETIC_TEST_ONLY",value.getString("purpose"));return value;
        }
    }
    @Test public void signedTransitionPreservesSyntheticStateAndSessionWithoutEnablingReception()throws Exception{
        JSONObject d=data(),current=d.getJSONObject("current"),next=PrivateTransition.retiredState(d.getJSONObject("frame"),current,PrivateProtocol.time(d.getString("nowUtc")));
        assertEquals("shadow",next.getJSONObject("profile").getJSONObject("trust").getString("channel"));
        assertEquals(current.toString(),next.getJSONObject("retiredSynthetic").toString());
        assertEquals(current.getJSONObject("session").toString(),next.getJSONObject("session").toString());
        assertFalse(next.getBoolean("backgroundEnabled"));assertEquals(0,next.getLong("sequence"));
        assertEquals(0,next.getJSONArray("inbox").length());assertEquals(0,next.getJSONObject("finals").length());
        assertFalse(next.has("deliveryHash"));assertFalse(next.has("registeredToken"));
        assertEquals(4,current.getLong("sequence")); // caller's old state is also unchanged
    }
    @Test public void enabledPendingWrongCursorAndTamperedTransitionAreRejected()throws Exception{
        JSONObject d=data(),original=d.getJSONObject("current"),frame=d.getJSONObject("frame");long now=PrivateProtocol.time(d.getString("nowUtc"));
        for(String fault:new String[]{"enabled","pending","cursor","signature","profile"}){
            JSONObject state=new JSONObject(original.toString()),bad=new JSONObject(frame.toString());
            if(fault.equals("enabled"))state.put("backgroundEnabled",true);
            if(fault.equals("pending"))state.getJSONArray("inbox").put(new JSONObject());
            if(fault.equals("cursor"))state.put("sequence",3);
            if(fault.equals("signature"))bad.put("signature","A".repeat(86));
            if(fault.equals("profile"))bad.put("profileJson",frame.getString("profileJson")+" ");
            try{PrivateTransition.retiredState(bad,state,now);fail("Unsafe transition accepted");}catch(Exception expected){ /* no writes */ }
        }
    }
}
