package it.personale.lamultipla;

/** JSON integers may arrive as Integer or Long; never coerce text or fractions. */
public final class PrivateReceiptSequence {
    private PrivateReceiptSequence() {}
    public static long read(Object value) throws Exception {
        if (!(value instanceof Integer) && !(value instanceof Long)) throw new Exception("Chain");
        long sequence = ((Number) value).longValue();
        if (sequence < 1 || sequence > 1000000) throw new Exception("Chain");
        return sequence;
    }
}
