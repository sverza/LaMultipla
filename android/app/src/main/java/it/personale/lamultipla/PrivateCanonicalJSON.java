package it.personale.lamultipla;

import java.util.Map;
import java.util.TreeMap;

/** Byte-compatible with the flat JSON.stringify metadata signed by the PC. */
public final class PrivateCanonicalJSON {
    private PrivateCanonicalJSON() {}
    public static String encode(Map<String, Object> values) throws Exception {
        StringBuilder result = new StringBuilder("{");
        for (Map.Entry<String, Object> entry : new TreeMap<>(values).entrySet()) {
            if (result.length() > 1) result.append(',');
            quote(result, entry.getKey()); result.append(':');
            Object value = entry.getValue();
            if (value instanceof String) quote(result, (String)value);
            else if (value == null || value instanceof Boolean || value instanceof Integer || value instanceof Long) result.append(value);
            else throw new Exception("Statement type");
        }
        return result.append('}').toString();
    }
    private static void escaped(StringBuilder out, char c) {
        final String hex = "0123456789abcdef";
        out.append("\\u");
        for (int shift = 12; shift >= 0; shift -= 4) out.append(hex.charAt((c >> shift) & 15));
    }
    private static void quote(StringBuilder out, String value) {
        out.append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"': case '\\': out.append('\\').append(c); break;
                case '\b': out.append("\\b"); break;
                case '\f': out.append("\\f"); break;
                case '\n': out.append("\\n"); break;
                case '\r': out.append("\\r"); break;
                case '\t': out.append("\\t"); break;
                default:
                    if (c < 32) escaped(out, c);
                    else if (Character.isHighSurrogate(c)) {
                        if (i + 1 < value.length() && Character.isLowSurrogate(value.charAt(i + 1))) out.append(c).append(value.charAt(++i));
                        else escaped(out, c);
                    } else if (Character.isLowSurrogate(c)) escaped(out, c);
                    else out.append(c);
            }
        }
        out.append('"');
    }
}
