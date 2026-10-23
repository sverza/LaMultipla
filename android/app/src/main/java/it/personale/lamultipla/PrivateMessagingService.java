package it.personale.lamultipla;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import org.json.JSONObject;
public class PrivateMessagingService extends FirebaseMessagingService {
    @Override public void onMessageReceived(RemoteMessage message) {
        // Data-only hint: authenticate locally; defer network/crypto/archive work.
        android.util.Log.i("LaMultiplaPrivateDiag",PrivateDiagnosticCode.format("HINT_RECEIVED",null));
        try{JSONObject state=PrivateVault.load(this);if(!state.optBoolean("backgroundEnabled")){android.util.Log.i("LaMultiplaPrivateDiag",PrivateDiagnosticCode.format("HINT_DISABLED",null));return;}
            JSONObject s=PrivateProtocol.statement(message.getData().get("statement"),message.getData().get("signature"),state.getJSONObject("profile"));
            android.util.Log.i("LaMultiplaPrivateDiag",PrivateDiagnosticCode.format("HINT_VERIFIED",null));
            if(s.getLong("sequence")>state.optLong("sequence",0))PrivateDownloadWorker.enqueue(this,message.getPriority()==RemoteMessage.PRIORITY_HIGH);
            else android.util.Log.i("LaMultiplaPrivateDiag",PrivateDiagnosticCode.format("HINT_ALREADY_ARCHIVED",null));
        }catch(Exception error){android.util.Log.w("LaMultiplaPrivateDiag",PrivateDiagnosticCode.format("HINT_VERIFY",error));}
    }
    @Override public void onNewToken(String token) {
        try{PrivateVault.put(this,"fcmToken",token);if(PrivateVault.load(this).optBoolean("backgroundEnabled"))PrivateDownloadWorker.enqueue(this);}catch(Exception ignored){}
    }
    @Override public void onDeletedMessages(){try{if(PrivateVault.load(this).optBoolean("backgroundEnabled"))PrivateDownloadWorker.enqueue(this);}catch(Exception ignored){}}
}
