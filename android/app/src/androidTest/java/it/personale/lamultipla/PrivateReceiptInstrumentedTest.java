package it.personale.lamultipla;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Real Capacitor JSON parsing only; no vault, inbox, network or device archive. */
@RunWith(AndroidJUnit4.class)
public class PrivateReceiptInstrumentedTest {
    private PluginCall call(String json) throws Exception {
        return new PluginCall(null, "LaMultiplaPrivate", "SYNTHETIC", "consume", new JSObject(json));
    }
    @Test public void javascriptReceiptIntegerSurvivesRealCapacitorParsing() throws Exception {
        PluginCall input = call("{\"sequence\":4}");
        assertTrue(input.getData().opt("sequence") instanceof Integer);
        assertEquals(Long.valueOf(0), input.getLong("sequence", 0L)); // former bug
        assertEquals(4L, PrivateReceiptSequence.read(input.getData().opt("sequence")));
        assertEquals(1000000L, PrivateReceiptSequence.read(call("{\"sequence\":1000000}").getData().opt("sequence")));
        assertEquals(4L, PrivateReceiptSequence.read(Long.valueOf(4)));
    }
    @Test public void invalidReceiptValuesNeverBecomeAnAcceptedSequence() throws Exception {
        for (String json : new String[]{"{}", "{\"sequence\":null}", "{\"sequence\":\"4\"}",
                "{\"sequence\":true}", "{\"sequence\":4.5}", "{\"sequence\":0}",
                "{\"sequence\":-1}", "{\"sequence\":1000001}", "{\"sequence\":4294967300}"}) {
            try { PrivateReceiptSequence.read(call(json).getData().opt("sequence")); fail("Invalid sequence accepted"); }
            catch (Exception expected) { assertEquals("Chain", expected.getMessage()); }
        }
    }
}
