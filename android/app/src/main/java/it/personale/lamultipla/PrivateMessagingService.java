package it.personale.lamultipla;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import org.json.JSONObject;
public class PrivateMessagingService extends FirebaseMessagingService {
    @Override public void onMessageReceived(RemoteMessage message) {
        // Data-only hint: authenticate locally; defer network/crypto/archive work.
        try{JSONObject state=PrivateVault.load(this);if(!state.optBoolean("backgroundEnabled"))return;
            JSONObject s=PrivateProtocol.statement(message.getData().get("statement"),message.getData().get("signature"),state.getJSONObject("profile"));
            if(s.getLong("sequence")>state.optLong("sequence",0))PrivateDownloadWorker.enqueue(this);
        }catch(Exception ignored){/* No untrusted content or credentials in logs. */}
    }
    @Override public void onNewToken(String token) {
        try{PrivateVault.put(this,"fcmToken",token);if(PrivateVault.load(this).optBoolean("backgroundEnabled"))PrivateDownloadWorker.enqueue(this);}catch(Exception ignored){}
    }
    @Override public void onDeletedMessages(){try{if(PrivateVault.load(this).optBoolean("backgroundEnabled"))PrivateDownloadWorker.enqueue(this);}catch(Exception ignored){}}
}
