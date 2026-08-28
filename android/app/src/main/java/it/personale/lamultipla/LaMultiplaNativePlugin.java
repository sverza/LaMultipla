package it.personale.lamultipla;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(
    name = "LaMultiplaNative",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class LaMultiplaNativePlugin extends Plugin {
    @PluginMethod
    public void getStatus(PluginCall call) {
        try {
            BackgroundJobService.ensurePeriodic(getContext());
        } catch (Exception ignored) {
            // Alcuni produttori limitano JobScheduler: l'app deve comunque avviarsi.
        }
        call.resolve(status());
    }

    @PluginMethod
    public void configure(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        int hours = Math.max(1, Math.min(24, call.getInt("intervalHours", 3)));
        BackgroundJobService.preferences(getContext()).edit().putBoolean("enabled", enabled).putInt("intervalHours", hours).apply();
        if (enabled) BackgroundJobService.schedulePeriodic(getContext(), hours);
        else BackgroundJobService.cancelPeriodic(getContext());
        call.resolve(status());
    }

    @PluginMethod
    public void runNow(PluginCall call) {
        BackgroundJobService.runNow(getContext());
        call.resolve();
    }

    @PluginMethod
    public void getNotificationPermission(PluginCall call) {
        resolvePermission(call);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            resolvePermission(call);
        } else {
            requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
        }
    }

    @PluginMethod
    public void setNotificationsEnabled(PluginCall call) {
        BackgroundJobService.preferences(getContext()).edit().putBoolean("notificationsEnabled", Boolean.TRUE.equals(call.getBoolean("enabled", false))).apply();
        call.resolve();
    }

    @PermissionCallback
    public void notificationPermissionCallback(PluginCall call) {
        resolvePermission(call);
    }

    @PluginMethod
    public void scheduleReminder(PluginCall call) {
        int id = call.getInt("id", 20_000);
        long at = call.getLong("at", System.currentTimeMillis() + 3_600_000);
        BackgroundJobService.scheduleReminder(getContext(), id, at, call.getString("title", "La Multipla"), call.getString("body", "Completa gli esiti."));
        call.resolve();
    }

    @PluginMethod
    public void cancelReminder(PluginCall call) {
        BackgroundJobService.cancelReminder(getContext(), call.getInt("id", 20_000));
        call.resolve();
    }

    @PluginMethod
    public void haptic(PluginCall call) {
        Vibrator vibrator = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
        long duration = "light".equals(call.getString("strength", "light")) ? 24 : 45;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE));
        else vibrator.vibrate(duration);
        call.resolve();
    }

    @PluginMethod
    public void shareTextFile(PluginCall call) {
        try {
            byte[] data = call.getString("data", "").getBytes(StandardCharsets.UTF_8);
            shareFile(call, data);
        } catch (Exception error) {
            call.reject("Impossibile condividere il file.", error);
        }
    }

    @PluginMethod
    public void shareBase64File(PluginCall call) {
        try {
            byte[] data = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
            shareFile(call, data);
        } catch (Exception error) {
            call.reject("Impossibile condividere l'immagine.", error);
        }
    }

    private void shareFile(PluginCall call, byte[] data) throws Exception {
        String filename = call.getString("filename", "la-multipla-file").replaceAll("[^a-zA-Z0-9._-]", "_");
        File directory = new File(getContext().getCacheDir(), "shared");
        if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Cartella temporanea non disponibile");
        File file = new File(directory, filename);
        try (FileOutputStream output = new FileOutputStream(file)) { output.write(data); }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.setType(call.getString("mimeType", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_STREAM, uri);
        intent.putExtra(Intent.EXTRA_TEXT, call.getString("text", ""));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(intent, call.getString("title", "Condividi"));
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(chooser);
        call.resolve();
    }

    private JSObject status() {
        android.content.SharedPreferences prefs = BackgroundJobService.preferences(getContext());
        JSObject result = new JSObject();
        result.put("enabled", prefs.getBoolean("enabled", true));
        result.put("intervalHours", prefs.getInt("intervalHours", 3));
        result.put("lastCheck", prefs.getString("lastCheck", ""));
        result.put("lastFeedId", prefs.getString("lastFeedId", ""));
        return result;
    }

    private void resolvePermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("state", Build.VERSION.SDK_INT < 33 ? "granted" : getPermissionState("notifications").toString());
        call.resolve(result);
    }
}
