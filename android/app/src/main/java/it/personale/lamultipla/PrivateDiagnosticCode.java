package it.personale.lamultipla;
import java.util.Arrays;
/** Fixed diagnostic stages only. Never log a message body, identity or credential. */
public final class PrivateDiagnosticCode {
    private PrivateDiagnosticCode() {}
    private static final java.util.List<String> STAGES=Arrays.asList("FIREBASE_INIT","HINT_RECEIVED","HINT_DISABLED","HINT_VERIFY","HINT_VERIFIED","HINT_ALREADY_ARCHIVED",
        "FCM_TOKEN_CHANGED","WORK_ENQUEUE","WORK_QUEUED","WORK_START","WORK_DISABLED","SESSION_READ","SESSION_REFRESH","DEVICE_REGISTER","HEAD_READ","EVENT_READ",
        "PACKAGE_VERIFY","ARCHIVE_SAVE","INBOX_CONSUME","NOTIFICATION_POST","NOTIFICATION_DISABLED","NOTIFICATION_EXPIRED","WORK_COMPLETE","BACKGROUND_ENABLE","FCM_REGISTER");
    private static final java.util.List<String> DETAILS=Arrays.asList("Encoding","Time","Clock","Signature","Identity","Audience","Manifest","Hash","Payload","Contract",
        "Fields","Frame","Statement size","Statement type","Protected pilot","Login needed","Session changed","Session","Chain","Inbox full","Head","Head conflict","Rollback","Missing head","Missing event","Frozen final");
    public static String format(String stage,Throwable error) {
        String code=STAGES.contains(stage)?stage:"UNKNOWN";
        if(error==null)return code;
        String detail=error.getMessage(),type=error.getClass().getSimpleName().replaceAll("[^A-Za-z0-9_$]","");
        if(type.length()>64)type="Exception";
        return code+"_FAILED:"+type+(detail!=null&&(DETAILS.contains(detail)||detail.matches("^HTTP_[45][0-9]{2}$"))?":"+detail:"");
    }
}
