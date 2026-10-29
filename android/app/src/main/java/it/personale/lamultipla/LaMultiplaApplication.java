package it.personale.lamultipla;
import android.app.Application;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONObject;
/** Restore explicit private configuration before a cold-start FCM service. */
public class LaMultiplaApplication extends Application {
    @Override public void onCreate(){super.onCreate();
        try{JSONObject state=PrivateVault.load(this);if(!state.optBoolean("backgroundEnabled"))return;
            JSONObject profile=state.getJSONObject("profile");
            FirebaseOptions options=new FirebaseOptions.Builder().setProjectId(profile.getString("projectId")).setApiKey(profile.getString("apiKey"))
                .setApplicationId(profile.getString("mobileAppId")).setGcmSenderId(profile.getString("senderId")).build();
            if(FirebaseApp.getApps(this).isEmpty())FirebaseApp.initializeApp(this,options);
            FirebaseMessaging.getInstance().setAutoInitEnabled(true);
            android.util.Log.i("LaMultiplaPrivateDiag",PrivateDiagnosticCode.format("FIREBASE_INIT",null));
        }catch(Exception error){android.util.Log.w("LaMultiplaPrivateDiag",PrivateDiagnosticCode.format("FIREBASE_INIT",error));}
    }
}
