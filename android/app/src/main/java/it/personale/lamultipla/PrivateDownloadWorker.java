package it.personale.lamultipla;

import android.content.Context;
import android.content.Intent;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import androidx.work.WorkManager;
import androidx.work.OneTimeWorkRequest;
import androidx.work.ExistingWorkPolicy;
import androidx.work.Constraints;
import androidx.work.NetworkType;
import androidx.work.BackoffPolicy;
import androidx.work.OutOfQuotaPolicy;
import androidx.work.Operation;
import org.json.JSONObject;
import org.json.JSONArray;
import java.net.URL;
import java.net.HttpURLConnection;
import java.net.URLEncoder;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

public class PrivateDownloadWorker extends Worker {
    static final String TAG = "lamultipla-private-inbox";
    public PrivateDownloadWorker(Context context, WorkerParameters parameters) { super(context, parameters); }
    static void enqueue(Context context) {
        enqueue(context,false);
    }
    private static void diagnostic(String stage,Throwable error){android.util.Log.i("LaMultiplaPrivateDiag",PrivateDiagnosticCode.format(stage,error));}
    static void enqueue(Context context,boolean expedited) {
        diagnostic("WORK_ENQUEUE",null);
        OneTimeWorkRequest.Builder builder = new OneTimeWorkRequest.Builder(PrivateDownloadWorker.class).addTag(TAG)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS);
        // Prioritize only a verified high-priority FCM wake-up. On older Android,
        // avoid introducing a foreground service; quota exhaustion falls back.
        if(expedited&&Build.VERSION.SDK_INT>=31)builder.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST);
        Operation operation=WorkManager.getInstance(context).enqueueUniqueWork(TAG,ExistingWorkPolicy.APPEND_OR_REPLACE,builder.build());
        operation.getResult().addListener(()->{try{operation.getResult().get();diagnostic("WORK_QUEUED",null);}
            catch(Exception error){diagnostic("WORK_ENQUEUE",error);}},androidx.core.content.ContextCompat.getMainExecutor(context));
    }
    static JSONObject request(String url, String method, String token, JSONObject body) throws Exception {
        return request(url,method,token,body,false);
    }
    static JSONObject request(String url, String method, String token, JSONObject body, boolean form) throws Exception {
        HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();c.setConnectTimeout(10000);c.setReadTimeout(10000);c.setInstanceFollowRedirects(false);c.setRequestMethod(method);
        if(token!=null)c.setRequestProperty("Authorization","Bearer "+token);c.setRequestProperty("Content-Type",form?"application/x-www-form-urlencoded":"application/json");
        try {
            if(body!=null){String data=body.toString();if(form)data="grant_type=refresh_token&refresh_token="+URLEncoder.encode(body.getString("refresh_token"),"UTF-8");
                c.setDoOutput(true);try(java.io.OutputStream out=c.getOutputStream()){out.write(data.getBytes(StandardCharsets.UTF_8));}}
            int status=c.getResponseCode();if(status==404)return null;if(status<200||status>=300)throw new Exception("HTTP_"+status);
            try(InputStream input=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] buffer=new byte[8192];int n;while((n=input.read(buffer))!=-1){out.write(buffer,0,n);if(out.size()>2*PrivateProtocol.MAX_BYTES+32768)throw new Exception("Response size");}
                return new JSONObject(out.toString("UTF-8"));
            }
        }finally{c.disconnect();}
    }
    static String token(Context context,JSONObject profile) throws Exception {
        JSONObject state=PrivateVault.load(context),session=state.optJSONObject("session");
        if(!state.optBoolean("backgroundEnabled")||session==null||!session.getString("uid").equals(profile.getJSONObject("trust").getString("readerUid")))throw new Exception("Login needed");
        if(session.getLong("expiresAt")>System.currentTimeMillis()+60000)return session.getString("idToken");
        diagnostic("SESSION_REFRESH",null);
        JSONObject data=request("https://securetoken.googleapis.com/v1/token?key="+URLEncoder.encode(profile.getString("apiKey"),"UTF-8"),"POST",null,
            new JSONObject().put("grant_type","refresh_token").put("refresh_token",session.getString("refreshToken")),true);
        if(!data.getString("user_id").equals(session.getString("uid")))throw new Exception("Identity");
        long seconds=Long.parseLong(data.getString("expires_in"));if(seconds<120||seconds>86400)throw new Exception("Session");
        JSONObject next=new JSONObject().put("uid",session.getString("uid")).put("idToken",data.getString("id_token"))
            .put("refreshToken",data.getString("refresh_token")).put("expiresAt",System.currentTimeMillis()+seconds*1000);
        synchronized(PrivateVault.class){JSONObject current=PrivateVault.load(context);
            if(!current.optBoolean("backgroundEnabled")||current.optJSONObject("session")==null||!current.getJSONObject("session").getString("refreshToken").equals(session.getString("refreshToken")))throw new Exception("Session changed");
            current.put("session",next);PrivateVault.save(context,current);}
        return next.getString("idToken");
    }
    private void notifyReceived(JSONObject statement) throws Exception {
        if(PrivateProtocol.time(statement.getString("expiresAtUtc"))<=System.currentTimeMillis()){diagnostic("NOTIFICATION_EXPIRED",null);return;}
        Context context=getApplicationContext();NotificationManager manager=context.getSystemService(NotificationManager.class);
        if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel(TAG,"Analisi private LaMultipla",NotificationManager.IMPORTANCE_DEFAULT));
        Intent intent=new Intent(context,MainActivity.class).putExtra("lamultiplaPrivate",true).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int id=statement.getInt("sequence");PendingIntent open=PendingIntent.getActivity(context,id,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        if(NotificationManagerCompat.from(context).areNotificationsEnabled()){NotificationManagerCompat.from(context).notify(TAG,id,
            new NotificationCompat.Builder(context,TAG).setSmallIcon(android.R.drawable.ic_dialog_info).setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setContentTitle("LaMultipla · analisi privata ricevuta").setContentText("Apri Esperimento. Stake reale 0 €.").setContentIntent(open).setAutoCancel(true).build());diagnostic("NOTIFICATION_POST",null);}
        else diagnostic("NOTIFICATION_DISABLED",null);
    }
    private void pendingNotifications(JSONObject profile) throws Exception {
        Context context=getApplicationContext();JSONObject state=PrivateVault.load(context);JSONArray inbox=state.optJSONArray("inbox");
        if(inbox==null)return;
        for(int i=0;i<inbox.length();i++){
            JSONObject statement=PrivateProtocol.verify(inbox.getJSONObject(i),profile);long sequence=statement.getLong("sequence");
            synchronized(PrivateVault.class){JSONObject current=PrivateVault.load(context);
                if(!current.optBoolean("backgroundEnabled"))return;
                if(sequence<=current.optLong("notifiedThrough",0))continue;
                // Stable Android notification ID makes a crash after posting harmless.
                notifyReceived(statement);current.put("notifiedThrough",sequence);PrivateVault.save(context,current);
            }
        }
    }
    @Override public Result doWork() {
        Context context=getApplicationContext();String stage="WORK_START";diagnostic(stage,null);
        try {
            JSONObject initial=PrivateVault.load(context);if(!initial.optBoolean("backgroundEnabled")||initial.optJSONObject("profile")==null||initial.optJSONObject("session")==null){diagnostic("WORK_DISABLED",null);return Result.success();}
            stage="SESSION_READ";JSONObject profile=initial.getJSONObject("profile"),trust=profile.getJSONObject("trust");String auth=token(context,profile);
            stage="NOTIFICATION_POST";
            pendingNotifications(profile);
            String base="https://firestore.googleapis.com/v1/projects/"+profile.getString("projectId")+"/databases/(default)/documents/users/"+trust.getString("readerUid")+"/channels/"+trust.getString("channel");
            String fcm=initial.optString("fcmToken","");if(!fcm.isEmpty()&&!fcm.equals(initial.optString("registeredToken",""))){
                stage="DEVICE_REGISTER";
                String document="projects/"+profile.getString("projectId")+"/databases/(default)/documents/users/"+trust.getString("readerUid")+"/channels/"+trust.getString("channel")+"/devices/"+profile.getString("deviceId");
                JSONObject fields=new JSONObject().put("fcmToken",new JSONObject().put("stringValue",fcm)).put("applicationId",new JSONObject().put("stringValue",context.getPackageName()));
                request("https://firestore.googleapis.com/v1/projects/"+profile.getString("projectId")+"/databases/(default)/documents:commit","POST",auth,
                    new JSONObject().put("writes",new JSONArray().put(new JSONObject().put("update",new JSONObject().put("name",document).put("fields",fields)))));
                PrivateVault.put(context,"registeredToken",fcm);
            }
            stage="HEAD_READ";JSONObject head=request(base+"/head/current","GET",auth,null);if(head==null){if(initial.optLong("sequence",0)>0)throw new Exception("Missing head");diagnostic("WORK_COMPLETE",null);return Result.success();}
            long target=Long.parseLong(head.getJSONObject("fields").getJSONObject("sequence").getString("integerValue"));
            if(target<1||target>1000000)throw new Exception("Head");
            long current=initial.optLong("sequence",0);if(target<current)throw new Exception("Rollback");
            for(int count=0;current<target&&count<16&&!isStopped();count++){
                stage="EVENT_READ";
                JSONObject document=request(base+"/events/"+(current+1),"GET",auth,null);if(document==null)throw new Exception("Missing event");
                JSONObject frame=new JSONObject(document.getJSONObject("fields").getJSONObject("body").getString("stringValue"));
                stage="PACKAGE_VERIFY";JSONObject statement=PrivateProtocol.verify(frame,profile);String hash=PrivateProtocol.hash(frame.getString("statement"));
                stage="ARCHIVE_SAVE";
                synchronized(PrivateVault.class){JSONObject state=PrivateVault.load(context);
                    if(!state.optBoolean("backgroundEnabled"))return Result.success();
                    if(statement.getLong("sequence")!=state.optLong("sequence",0)+1 || (state.optLong("sequence",0)==0?!statement.isNull("previousDeliveryHash"):
                        !statement.getString("previousDeliveryHash").equals(state.getString("deliveryHash"))))throw new Exception("Chain");
                    JSONArray inbox=state.optJSONArray("inbox");if(inbox==null)inbox=new JSONArray();if(inbox.length()>=16)throw new Exception("Inbox full");
                    JSONObject finals=state.optJSONObject("finals");if(finals==null)finals=new JSONObject();String round=statement.getString("season")+":"+statement.getInt("matchday");
                    if(finals.has(round))throw new Exception("Frozen final");if(statement.getString("kind").equals("final"))finals.put(round,statement.getString("deliveryId"));
                    inbox.put(frame);state.put("inbox",inbox).put("finals",finals).put("sequence",statement.getLong("sequence")).put("deliveryHash",hash);
                    state.remove("lastFailure");PrivateVault.save(context,state);current=statement.getLong("sequence");
                }
                // Atomic inbox is durable before notification; ACK waits for full JS v4 import.
                stage="NOTIFICATION_POST";
                pendingNotifications(profile);
            }
            stage="HEAD_READ";
            JSONObject end=PrivateVault.load(context);if(current==target&&!end.optString("deliveryHash","").equals(head.getJSONObject("fields").getJSONObject("deliveryHash").getString("stringValue")))throw new Exception("Head conflict");
            if(current<target)return Result.retry();diagnostic("WORK_COMPLETE",null);return Result.success();
        } catch(Exception e) {
            diagnostic(stage,e);
            try{PrivateVault.put(context,"lastFailure","PRIVATE_DOWNLOAD_FAILED");}catch(Exception ignored){}
            return getRunAttemptCount()<5?Result.retry():Result.failure();
        }
    }
}
