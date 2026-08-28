package it.personale.lamultipla;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.PersistableBundle;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;

public class BackgroundJobService extends JobService {
    static final String PREFS = "la_multipla_sync";
    static final String FEED_URL = "https://sverza.github.io/LaMultipla/latest-slip.json";
    static final int PERIODIC_JOB_ID = 8101;
    static final int IMMEDIATE_JOB_ID = 8102;
    private static final String CHANNEL_SLIPS = "nuove_schedine";
    private static final String CHANNEL_REMINDERS = "promemoria_esiti";

    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void ensurePeriodic(Context context) {
        SharedPreferences prefs = preferences(context);
        if (prefs.getBoolean("enabled", true)) {
            schedulePeriodic(context, prefs.getInt("intervalHours", 3));
        }
    }

    static void schedulePeriodic(Context context, int requestedHours) {
        int hours = Math.max(1, Math.min(24, requestedHours));
        JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        scheduler.cancel(PERIODIC_JOB_ID);
        JobInfo job = new JobInfo.Builder(PERIODIC_JOB_ID, new ComponentName(context, BackgroundJobService.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPersisted(true)
            .setPeriodic(TimeUnit.HOURS.toMillis(hours))
            .build();
        scheduler.schedule(job);
    }

    static void cancelPeriodic(Context context) {
        ((JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE)).cancel(PERIODIC_JOB_ID);
    }

    static void runNow(Context context) {
        JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        scheduler.cancel(IMMEDIATE_JOB_ID);
        JobInfo job = new JobInfo.Builder(IMMEDIATE_JOB_ID, new ComponentName(context, BackgroundJobService.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setMinimumLatency(0)
            .setOverrideDeadline(1_000)
            .build();
        scheduler.schedule(job);
    }

    static void scheduleReminder(Context context, int id, long at, String title, String body) {
        PersistableBundle extras = new PersistableBundle();
        extras.putString("kind", "reminder");
        extras.putInt("notificationId", id);
        extras.putString("title", title);
        extras.putString("body", body);
        long delay = Math.max(1_000, at - System.currentTimeMillis());
        JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        scheduler.cancel(id);
        JobInfo job = new JobInfo.Builder(id, new ComponentName(context, BackgroundJobService.class))
            .setPersisted(true)
            .setMinimumLatency(delay)
            .setExtras(extras)
            .build();
        scheduler.schedule(job);
    }

    static void cancelReminder(Context context, int id) {
        ((JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE)).cancel(id);
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            PersistableBundle extras = params.getExtras();
            if ("reminder".equals(extras.getString("kind", ""))) {
                showNotification(extras.getInt("notificationId"), CHANNEL_REMINDERS, "Promemoria esiti", extras.getString("title", "La Multipla"), extras.getString("body", "Completa gli esiti della schedina."));
            } else {
                checkFeed();
            }
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }

    private void checkFeed() {
        SharedPreferences prefs = preferences(this);
        String checkedAt = isoNow();
        prefs.edit().putString("lastCheck", checkedAt).apply();
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(FEED_URL + "?t=" + System.currentTimeMillis()).openConnection();
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(15_000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "LaMultipla-Android/1.0");
            if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) return;
            BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8));
            StringBuilder body = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) body.append(line);
            reader.close();
            JSONObject feed = new JSONObject(body.toString());
            if (!feed.optBoolean("available", true)) return;
            String id = feed.optString("id", "");
            JSONObject slip = feed.optJSONObject("slip");
            if (id.isEmpty() && slip != null) id = slip.optString("season", "") + "-g" + slip.optInt("matchday", 0);
            if (id.isEmpty()) return;
            prefs.edit().putString("lastCheck", checkedAt).putString("lastFeedId", id).apply();
            String lastNotified = prefs.getString("lastNotifiedFeedId", "");
            if (!id.equals(lastNotified) && canNotify()) {
                int day = slip == null ? 0 : slip.optInt("matchday", 0);
                showNotification(8801, CHANNEL_SLIPS, "Nuove schedine", "Nuova schedina disponibile", day > 0 ? "La giornata " + day + " è pronta. Apri l’app per importarla." : "Apri La Multipla per importarla automaticamente.");
                prefs.edit().putString("lastNotifiedFeedId", id).apply();
            }
        } catch (Exception ignored) {
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private boolean canNotify() {
        boolean enabled = preferences(this).getBoolean("notificationsEnabled", false);
        boolean permitted = Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        return enabled && permitted;
    }

    private void showNotification(int id, String channelId, String channelName, String title, String body) {
        if (!canNotify()) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(new NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_DEFAULT));
        }
        Intent intent = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(this, id, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(this, channelId) : new Notification.Builder(this);
        Notification notification = builder
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new Notification.BigTextStyle().bigText(body))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build();
        manager.notify(id, notification);
    }

    private static String isoNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }
}
