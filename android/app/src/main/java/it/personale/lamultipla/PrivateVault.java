package it.personale.lamultipla;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import org.json.JSONObject;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.security.KeyStore;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/** App-private no-backup file; non-exportable AES key in Android Keystore. */
final class PrivateVault {
    private static final String ALIAS = "lamultipla_private_delivery_v1";
    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey)store.getKey(ALIAS, null);
    }
    private static AtomicFile file(Context context) { return new AtomicFile(new File(context.getNoBackupFilesDir(), "private-delivery.enc")); }
    static synchronized JSONObject load(Context context) throws Exception {
        AtomicFile file = file(context);
        if (!file.getBaseFile().exists() && !new File(file.getBaseFile().getPath()+".bak").exists()) return new JSONObject();
        byte[] bytes = file.readFully();if (bytes.length > 8 * 1024 * 1024) throw new Exception("Vault size");
        JSONObject sealed = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(sealed.getString("iv"), Base64.NO_WRAP)));
        cipher.updateAAD(context.getPackageName().getBytes(StandardCharsets.UTF_8));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(sealed.getString("data"), Base64.NO_WRAP)), StandardCharsets.UTF_8));
    }
    static synchronized void save(Context context, JSONObject value) throws Exception {
        byte[] plain = value.toString().getBytes(StandardCharsets.UTF_8);if (plain.length > 6 * 1024 * 1024) throw new Exception("Inbox full");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE, key());
        cipher.updateAAD(context.getPackageName().getBytes(StandardCharsets.UTF_8));
        JSONObject sealed = new JSONObject().put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .put("data", Base64.encodeToString(cipher.doFinal(plain), Base64.NO_WRAP));
        AtomicFile file = file(context);FileOutputStream stream = null;
        try { stream = file.startWrite();stream.write(sealed.toString().getBytes(StandardCharsets.UTF_8));file.finishWrite(stream); }
        catch (Exception e) { if (stream != null) file.failWrite(stream);throw e; }
    }
    static synchronized void put(Context context, String field, Object value) throws Exception {
        JSONObject state = load(context);if (value == null || value == JSONObject.NULL) state.remove(field);else state.put(field, value);save(context, state);
    }
}
