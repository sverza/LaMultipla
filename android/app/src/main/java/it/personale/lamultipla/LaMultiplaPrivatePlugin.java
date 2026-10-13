package it.personale.lamultipla;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import androidx.work.WorkManager;
import org.json.JSONObject;
import org.json.JSONArray;
@CapacitorPlugin(name="LaMultiplaPrivate")
public class LaMultiplaPrivatePlugin extends Plugin {
    private void firebase(JSONObject profile) throws Exception {
        FirebaseOptions options=new FirebaseOptions.Builder().setProjectId(profile.getString("projectId")).setApiKey(profile.getString("apiKey"))
            .setApplicationId(profile.getString("mobileAppId")).setGcmSenderId(profile.getString("senderId")).build();
        if(FirebaseApp.getApps(getContext()).isEmpty())FirebaseApp.initializeApp(getContext(),options);
        if(!FirebaseApp.getInstance().getOptions().getApplicationId().equals(options.getApplicationId()))throw new Exception("Project mismatch");
        FirebaseMessaging.getInstance().setAutoInitEnabled(true);
    }
    @Override public void load(){try{JSONObject s=PrivateVault.load(getContext());if(s.optBoolean("backgroundEnabled"))firebase(s.getJSONObject("profile"));}catch(Exception ignored){}}
    @PluginMethod public void applicationId(PluginCall call){call.resolve(new JSObject().put("value",getContext().getPackageName()));}
    @PluginMethod public void notificationOpened(PluginCall call){boolean opened=getActivity().getIntent().getBooleanExtra("lamultiplaPrivate",false);getActivity().getIntent().removeExtra("lamultiplaPrivate");call.resolve(new JSObject().put("value",opened));}
    @PluginMethod public void loadProfile(PluginCall call){try{call.resolve(new JSObject().put("value",PrivateVault.load(getContext()).optJSONObject("profile")));}catch(Exception e){call.reject("Archivio privato non leggibile");}}
    @PluginMethod public void loadRetiredProfile(PluginCall call){try{JSONObject retired=PrivateVault.load(getContext()).optJSONObject("retiredSynthetic");
        call.resolve(new JSObject().put("value",retired==null?JSONObject.NULL:retired.getJSONObject("profile")));}catch(Exception e){call.reject("Archivio sintetico non leggibile");}}
    @PluginMethod public void applyShadowTransition(PluginCall call){try{
        synchronized(PrivateVault.class){JSONObject current=PrivateVault.load(getContext());
            JSONObject next=PrivateTransition.retiredState(new JSONObject(call.getString("json")),current,System.currentTimeMillis());
            PrivateVault.save(getContext(),next);}
        // Reception stays suspended; enabling it is an explicit user action.
        call.resolve();
    }catch(Exception e){call.reject("Transizione firmata non valida: sospendi ricezione e completa le analisi in attesa");}}
    @PluginMethod public void saveProfile(PluginCall call){try{
        JSONObject profile=new JSONObject(call.getString("json"));JSONObject trust=profile.getJSONObject("trust");
        if(!trust.getString("applicationId").equals(getContext().getPackageName())||!profile.getString("projectId").matches("^[a-z][a-z0-9-]{4,28}[a-z0-9]$")
            ||!trust.getString("readerUid").matches("^[A-Za-z0-9_-]{1,128}$")||!(trust.getString("channel").equals("synthetic_shadow")||trust.getString("channel").equals("shadow"))
            ||!profile.getString("deviceId").matches("^[a-z0-9-]{8,64}$")||!profile.getString("apiKey").matches("^[A-Za-z0-9_-]{20,128}$")
            ||!profile.getString("senderId").matches("^[0-9]+$")||!profile.getString("mobileAppId").matches("^1:"+profile.getString("senderId")+":android:[a-f0-9]+$")
            ||(getContext().getPackageName().endsWith(".collaudo")&&!trust.getString("channel").equals("synthetic_shadow")))throw new Exception();
        synchronized(PrivateVault.class){JSONObject state=PrivateVault.load(getContext());
            if(state.has("profile")&&!state.getJSONObject("profile").toString().equals(profile.toString()))throw new Exception();
            state.put("profile",profile);PrivateVault.save(getContext(),state);}call.resolve();
    }catch(Exception e){call.reject("Abbinamento non valido o già presente");}}
    @PluginMethod public void loadSession(PluginCall call){try{call.resolve(new JSObject().put("value",PrivateVault.load(getContext()).optJSONObject("session")));}catch(Exception e){call.reject("Accesso privato non leggibile");}}
    @PluginMethod public void saveSession(PluginCall call){try{
        String json=call.getString("json");JSONObject session=json==null||json.equals("null")?null:new JSONObject(json);
        if(session!=null&&!session.getString("uid").equals(PrivateVault.load(getContext()).getJSONObject("profile").getJSONObject("trust").getString("readerUid")))throw new Exception();
        PrivateVault.put(getContext(),"session",session);call.resolve();
    }catch(Exception e){call.reject("Accesso privato non salvato");}}
    @PluginMethod public void status(PluginCall call){try{JSONObject s=PrivateVault.load(getContext());JSONArray inbox=s.optJSONArray("inbox");
        JSONObject profile=s.optJSONObject("profile"),session=s.optJSONObject("session");
        boolean accessSaved=profile!=null&&session!=null&&session.optString("uid").equals(profile.getJSONObject("trust").getString("readerUid"))&&!session.optString("refreshToken").isEmpty();
        call.resolve(new JSObject().put("accessSaved",accessSaved).put("backgroundEnabled",s.optBoolean("backgroundEnabled")).put("pending",inbox==null?0:inbox.length()).put("lastFailure",s.optString("lastFailure", "")));
    }catch(Exception e){call.reject("Stato privato non disponibile");}}
    @PluginMethod public void setBackground(PluginCall call){try{
        boolean enabled=Boolean.TRUE.equals(call.getBoolean("enabled"));JSONObject state=PrivateVault.load(getContext());
        if(enabled&&(state.optJSONObject("profile")==null||state.optJSONObject("session")==null))throw new Exception();
        if(enabled)firebase(state.getJSONObject("profile"));PrivateVault.put(getContext(),"backgroundEnabled",enabled);
        if(enabled)PrivateDownloadWorker.enqueue(getContext());else{
            WorkManager.getInstance(getContext()).cancelAllWorkByTag(PrivateDownloadWorker.TAG);
            if(!FirebaseApp.getApps(getContext()).isEmpty())FirebaseMessaging.getInstance().setAutoInitEnabled(false);
        }call.resolve();
    }catch(Exception e){android.util.Log.w("LaMultiplaPrivateDiag",PrivateDiagnosticCode.format("BACKGROUND_ENABLE",e));call.reject("Ricezione privata non configurata");}}
    @PluginMethod public void fcmToken(PluginCall call){try{
        JSONObject s=PrivateVault.load(getContext());if(!s.optBoolean("backgroundEnabled"))throw new Exception();firebase(s.getJSONObject("profile"));
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task->{if(!task.isSuccessful()){android.util.Log.w("LaMultiplaPrivateDiag",PrivateDiagnosticCode.format("FCM_REGISTER",task.getException()));call.reject("Registrazione notifiche non riuscita");}else{
            try{PrivateVault.put(getContext(),"fcmToken",task.getResult());call.resolve(new JSObject().put("value",task.getResult()));}
            catch(Exception e){call.reject("Registrazione notifiche non salvata");}
        }});
    }catch(Exception e){call.reject("Ricezione privata disabilitata");}}
    @PluginMethod public void inbox(PluginCall call){try{JSONArray inbox=PrivateVault.load(getContext()).optJSONArray("inbox");call.resolve(new JSObject().put("frames",inbox==null?new JSONArray():inbox));}catch(Exception e){call.reject("Archivio ricevute non leggibile");}}
    @PluginMethod public void cursor(PluginCall call){try{JSONObject s=PrivateVault.load(getContext());long n=s.optLong("sequence",0);String hash=s.optString("deliveryHash","");
        if(n<0||n>1000000||(n>0&&!hash.matches("^[a-f0-9]{64}$")))throw new Exception("Chain");
        call.resolve(new JSObject().put("sequence",n).put("deliveryHash",n==0?JSONObject.NULL:hash));
    }catch(Exception e){call.reject("Cursore privato non disponibile");}}
    @PluginMethod public void archiveImported(PluginCall call){try{
        JSONObject frame=new JSONObject(call.getString("json"));
        synchronized(PrivateVault.class){JSONObject s=PrivateVault.load(getContext()),statement=PrivateProtocol.verify(frame,s.getJSONObject("profile"));
            long n=statement.getLong("sequence"),current=s.optLong("sequence",0);String hash=PrivateProtocol.hash(frame.getString("statement"));
            if(n>current){
                if(n!=current+1||(current==0?!statement.isNull("previousDeliveryHash"):!s.getString("deliveryHash").equals(statement.getString("previousDeliveryHash"))))throw new Exception();
                JSONObject finals=s.optJSONObject("finals");if(finals==null)finals=new JSONObject();String round=statement.getString("season")+":"+statement.getInt("matchday");
                if(finals.has(round))throw new Exception();if(statement.getString("kind").equals("final"))finals.put(round,statement.getString("deliveryId"));
                s.put("finals",finals).put("sequence",n).put("deliveryHash",hash);
            }else if(n==current&&!hash.equals(s.getString("deliveryHash")))throw new Exception();
            s.put("notifiedThrough",Math.max(n,s.optLong("notifiedThrough",0)));PrivateVault.save(getContext(),s);
        }call.resolve();
    }catch(Exception e){android.util.Log.w("LaMultiplaPrivateDiag",PrivateDiagnosticCode.format("ARCHIVE_SAVE",e));call.reject("Archivio privato non coerente");}}
    @PluginMethod public void consume(PluginCall call){try{
        long n=call.getLong("sequence",0L);String hash=call.getString("deliveryHash");
        synchronized(PrivateVault.class){JSONObject s=PrivateVault.load(getContext());JSONArray before=s.optJSONArray("inbox"),after=new JSONArray();boolean found=n==s.optLong("sequence",0)&&hash.equals(s.optString("deliveryHash",""));
            if(before!=null)for(int i=0;i<before.length();i++){JSONObject frame=before.getJSONObject(i),statement=new JSONObject(frame.getString("statement"));
                if(statement.getLong("sequence")==n&&PrivateProtocol.hash(frame.getString("statement")).equals(hash))found=true;
                if(statement.getLong("sequence")>n)after.put(frame);}
            if(!found)throw new Exception();s.put("inbox",after);PrivateVault.save(getContext(),s);}call.resolve();
    }catch(Exception e){call.reject("Ricevuta locale non coerente");}}
}
