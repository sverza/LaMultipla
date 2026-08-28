package it.personale.lamultipla;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LaMultiplaNativePlugin.class);
        super.onCreate(savedInstanceState);
        BackgroundJobService.ensurePeriodic(this);
    }
}
