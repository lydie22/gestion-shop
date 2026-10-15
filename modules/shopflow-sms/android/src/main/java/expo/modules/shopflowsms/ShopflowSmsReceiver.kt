package expo.modules.shopflowsms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.telephony.SmsMessage

class ShopflowSmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    val extras = intent.extras ?: return
    val rawPdus = extras.get("pdus") as? Array<*> ?: return
    val format = extras.getString("format")
    rawPdus.forEach { rawPdu ->
      val pdu = rawPdu as? ByteArray ?: return@forEach
      val message = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        SmsMessage.createFromPdu(pdu, format)
      } else {
        @Suppress("DEPRECATION")
        SmsMessage.createFromPdu(pdu)
      }
      val sender = message.originatingAddress ?: return@forEach
      SmsStore.append(context, sender, message.messageBody.orEmpty(), message.timestampMillis)
    }
  }
}
