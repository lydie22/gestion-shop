package expo.modules.shopflowsms

import android.content.Context
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal object SmsStore {
  private const val PREFS = "shopflow_sms"
  private const val SENDERS = "senders"
  private const val ENABLED = "enabled"
  private const val QUEUE = "queue"
  private const val KEY_ALIAS = "shopflow_sms_queue_v1"
  private const val TRANSFORMATION = "AES/GCM/NoPadding"

  fun configure(context: Context, senders: List<String>) {
    val normalized = senders.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.distinct()
    if (normalized.isEmpty()) return
    val json = JSONArray()
    normalized.forEach(json::put)
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(SENDERS, json.toString())
      .putBoolean(ENABLED, true)
      .apply()
  }

  fun accepts(context: Context, sender: String?): Boolean {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (!prefs.getBoolean(ENABLED, false) || sender.isNullOrBlank()) return false
    val senders = JSONArray(prefs.getString(SENDERS, "[]") ?: "[]")
    val normalizedSender = sender.trim().lowercase()
    return (0 until senders.length()).any { normalizedSender.contains(senders.getString(it)) }
  }

  @Synchronized
  fun append(context: Context, sender: String, body: String, receivedAt: Long) {
    if (!accepts(context, sender)) return
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val queue = decrypt(prefs.getString(QUEUE, null)) ?: JSONArray()
    val fingerprint = "$sender\u0000$receivedAt\u0000$body"
    val duplicate = (0 until queue.length()).any { index ->
      queue.optJSONObject(index)?.optString("fingerprint") == fingerprint
    }
    if (duplicate) return
    queue.put(JSONObject().apply {
      put("sender", sender)
      put("body", body)
      put("received_at", receivedAt)
      put("fingerprint", fingerprint)
    })
    prefs.edit().putString(QUEUE, encrypt(queue)).apply()
  }

  @Synchronized
  fun drain(context: Context): List<Map<String, Any?>> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val queue = decrypt(prefs.getString(QUEUE, null)) ?: return emptyList()
    return (0 until queue.length()).mapNotNull { index ->
      queue.optJSONObject(index)?.let { item ->
        mapOf(
          "sender" to item.optString("sender").ifBlank { null },
          "body" to item.optString("body"),
          "received_at" to item.optLong("received_at"),
        )
      }
    }
  }

  fun clear(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(QUEUE).apply()
  }

  private fun secretKey(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance("AES", "AndroidKeyStore")
    generator.init(android.security.keystore.KeyGenParameterSpec.Builder(
      KEY_ALIAS,
      android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or android.security.keystore.KeyProperties.PURPOSE_DECRYPT,
    ).setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
      .build())
    return generator.generateKey()
  }

  private fun encrypt(value: JSONArray): String {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, secretKey())
    val payload = cipher.iv + cipher.doFinal(value.toString().toByteArray(StandardCharsets.UTF_8))
    return Base64.encodeToString(payload, Base64.NO_WRAP)
  }

  private fun decrypt(encoded: String?): JSONArray? {
    if (encoded.isNullOrBlank()) return null
    return runCatching {
      val payload = Base64.decode(encoded, Base64.NO_WRAP)
      val iv = payload.copyOfRange(0, 12)
      val encrypted = payload.copyOfRange(12, payload.size)
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
      JSONArray(String(cipher.doFinal(encrypted), StandardCharsets.UTF_8))
    }.getOrNull()
  }
}
