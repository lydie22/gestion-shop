const { AndroidConfig, withAndroidManifest } = require('@expo/config-plugins');

const RECEIVER = 'expo.modules.shopflowsms.ShopflowSmsReceiver';

module.exports = function withShopflowSms(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    const manifest = configWithManifest.modResults.manifest;
    const permissions = manifest['uses-permission'] || [];
    for (const name of ['android.permission.RECEIVE_SMS']) {
      if (!permissions.some((item) => item.$?.['android:name'] === name)) permissions.push({ $: { 'android:name': name } });
    }
    manifest['uses-permission'] = permissions;
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    application.receiver = application.receiver || [];
    if (!application.receiver.some((item) => item.$?.['android:name'] === RECEIVER)) {
      application.receiver.push({
        $: {
          'android:name': RECEIVER,
          'android:enabled': 'true',
          'android:exported': 'true',
          'android:permission': 'android.permission.BROADCAST_SMS',
        },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.provider.Telephony.SMS_RECEIVED' } }] }],
      });
    }
    return configWithManifest;
  });
};
