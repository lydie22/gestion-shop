# Capture SMS Android privée

La capture automatique n’est pas disponible dans Expo Go. Elle est fournie par le module local `modules/shopflow-sms` et doit être utilisée dans une build Android privée (`development build` ou APK interne).

Le plugin `plugins/withShopflowSms.js` ajoute uniquement `RECEIVE_SMS` et un receiver Android. L’écran Messages demande la permission au moment de l’activation, configure les expéditeurs Airtel (`airtel`, `airtel money`) et importe ensuite les messages dans le même flux de rapprochement que l’import manuel.

Le receiver :

- ignore les SMS tant que l’utilisateur n’a pas activé la capture ;
- filtre l’expéditeur avant conservation ;
- chiffre la file locale avec une clé Android Keystore ;
- ne crée jamais directement de mouvement financier ;
- remet les événements à l’application, qui les synchronise avec l’appareil ShopFlow enregistré.

Pour générer une build native privée depuis le dossier frontend :

```powershell
cd 'D:\admin\MES PROJETS\les_apps\shop\gestion-shop'
npx expo prebuild --no-install
npx expo run:android
```

Tester sur un téléphone pilote avec un vrai SMS Airtel anonymisé. Vérifier la permission, l’expéditeur, la reprise après redémarrage, le doublon, l’absence de réseau et le refus d’un appareil non enregistré par le backend. La distribution et l’usage de la permission SMS doivent rester conformes aux règles Android et aux obligations applicables.
