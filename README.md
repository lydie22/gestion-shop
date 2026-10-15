# ShopFlow Mobile

Application Expo/React Native de gestion auditable d’une boutique Mobile Money. Le backend est séparé dans `..\backend`.

## Développement

```powershell
cd 'D:\admin\MES PROJETS\les_apps\shop\gestion-shop'
npm install
Copy-Item .env.example .env.local
$env:EXPO_PUBLIC_SHOPFLOW_API_URL = 'http://127.0.0.1:8000'
npm run dev
```

L’API doit être démarrée séparément :

```powershell
cd 'D:\admin\MES PROJETS\les_apps\shop\backend'
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

Sur un téléphone physique, remplacer `127.0.0.1` par l’adresse IP LAN de l’ordinateur qui héberge l’API. Le serveur doit être accessible depuis le même réseau.

## Vérifications locales

```powershell
npm run typecheck
$env:EXPO_PUBLIC_DOMAIN = 'localhost'; npm run build
```

Le build web confirme les bundles iOS/Android générés par Metro, mais ne remplace pas une compilation native.

## Mode hors ligne

Les transactions, mouvements de caisse et événements SMS sont conservés dans des files locales durables séparées, chacune avec une clé d’idempotence. Les textes SMS réels sont stockés dans le coffre sécurisé natif (`expo-secure-store`) ; l’AsyncStorage ne conserve qu’un marqueur protégé. À la reconnexion, le backend rejoue les demandes sans doubler les mouvements financiers ni les événements sources. Une erreur de synchronisation reste conservée pour une reprise ultérieure.

## Capture SMS Android privée

La capture SMS n’est pas disponible dans Expo Go. Elle nécessite une build native privée et la permission Android accordée par l’utilisateur :

```powershell
npx expo prebuild --no-install
npx expo run:android
```

Voir [ANDROID_SMS.md](ANDROID_SMS.md) pour les limites, les tests sur téléphone et l’import manuel de secours. Un SMS reste un événement source et ne devient jamais automatiquement un mouvement financier confirmé.
