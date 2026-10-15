package expo.modules.shopflowsms

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ShopflowSmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ShopflowSms")

    Function("configure") { senders: List<String> ->
      SmsStore.configure(requireNotNull(appContext.reactContext), senders)
    }

    Function("drain") {
      SmsStore.drain(requireNotNull(appContext.reactContext))
    }

    Function("clear") {
      SmsStore.clear(requireNotNull(appContext.reactContext))
    }
  }
}
