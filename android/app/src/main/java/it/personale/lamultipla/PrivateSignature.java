package it.personale.lamultipla;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.math.BigInteger;
import java.util.Arrays;

/** WebCrypto raw P-256 r||s to Java DER interoperability. No Android dependencies. */
public final class PrivateSignature {
    private PrivateSignature() {}
    public static String sha256(byte[] data) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(data);
        StringBuilder result = new StringBuilder();
        for (byte b : digest) result.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        return result.toString();
    }
    private static byte[] integer(byte[] raw, int offset) {
        int first = offset;
        while (first < offset + 31 && raw[first] == 0) first++;
        boolean pad = (raw[first] & 128) != 0;
        byte[] value = new byte[offset + 32 - first + (pad ? 1 : 0)];
        System.arraycopy(raw, first, value, pad ? 1 : 0, offset + 32 - first);
        return value;
    }
    public static boolean verify(byte[] spki, byte[] raw, String statement) throws Exception {
        if (raw.length != 64 || spki.length > 256 || statement.length() > 4096) return false;
        ECPublicKey key = (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(spki));
        if (!key.getParams().getOrder().equals(new BigInteger("ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551", 16))) return false;
        byte[] r = integer(raw, 0), s = integer(raw, 32), der = new byte[6 + r.length + s.length];
        der[0] = 48; der[1] = (byte)(der.length - 2); der[2] = 2; der[3] = (byte)r.length;
        System.arraycopy(r, 0, der, 4, r.length); der[4 + r.length] = 2; der[5 + r.length] = (byte)s.length;
        System.arraycopy(s, 0, der, 6 + r.length, s.length);
        Signature verifier = Signature.getInstance("SHA256withECDSA");verifier.initVerify(key);
        verifier.update(("lamultipla-private-delivery-v1\n" + statement).getBytes(StandardCharsets.UTF_8));
        return verifier.verify(Arrays.copyOf(der, der.length));
    }
}
