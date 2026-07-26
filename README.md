# VigiAero

Signalement de feux de forêt depuis un avion léger. Une position, un type de feu,
un SMS au **114** — sans couverture data.

État : **MVP Android**, France. Voir [docs/00-plan-produit.md](docs/00-plan-produit.md)
pour la suite (planification des vols, Espagne, iOS).

---

## Ce que fait l'application

1. **Carte** plein écran (Leaflet embarqué, fond OpenStreetMap + calque
   aéronautique OpenAIP en surcouche unique).
2. **Bandeau de position permanent** : code **DFCI** et degrés décimaux de la
   position de l'avion, rafraîchis à 1 Hz. Lisible directement à la radio, même
   sans rien envoyer.
3. **MARQUE VERTICALE** : capture la position de l'avion à l'instant de l'appui
   (à 100 kt, une seconde vaut 50 m — le point est lu sur l'appui, pas après le
   rendu de l'écran suivant).
4. **Pointer sur la carte** : réticule fixe au centre, on déplace la carte sous
   le réticule et on valide. Plus praticable qu'un appui précis en turbulence.
5. **Écran de confirmation** : type de feu, ampleur facultative, et le texte
   exact qui partira, avec son décompte de caractères.
6. **Envoi** : ouvre la messagerie avec le 114 et le message pré-remplis.

### Le message

```
FEU DE FORET IMPORTANT vu d avion
DFCI KD44F0
43.52970N 005.44740E
S.BESNIER F-GXYZ radio 123.500
1432UTC 3500ft GPS
En vol, ne peux pas parler
```

143 caractères — **un seul SMS**. Les contraintes qui expliquent cette forme :

- au-delà de 160 caractères, le SMS est découpé en segments dont le réassemblage
  et l'ordre d'arrivée ne sont pas garantis chez le destinataire ; les lignes de
  confort sont donc écartées automatiquement si elles font déborder, et l'écran
  affiche ce qui a été retiré ;
- **aucun accent** : un seul caractère hors alphabet GSM-7 ferait tomber la
  capacité de 160 à 70 caractères ;
- **DFCI en premier** : c'est le référentiel de travail des CODIS.

---

## Installer l'APK

L'APK est dans `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.

1. Copier le fichier sur le téléphone (câble USB, envoi par mail, cloud…).
2. L'ouvrir depuis le gestionnaire de fichiers.
3. Android demandera d'autoriser l'installation depuis cette source : accepter.
4. Au premier lancement : lire les conditions, puis saisir nom, immatriculation
   et fréquence radio. Ces informations restent sur le téléphone.
5. Autoriser l'accès à la position **« pendant l'utilisation »**.

Installation par USB, si le téléphone est en mode développeur :

```bash
C:\Users\v1v1\.buildtools\android-sdk\platform-tools\adb.exe install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

---

## Recompiler

La chaîne de compilation est locale, sans compte Expo ni service tiers. Elle est
installée dans `C:\Users\v1v1\.buildtools` (JDK 17 + SDK Android).

```bash
cd apps/mobile/android && ./gradlew.bat assembleRelease
```

Avec les variables d'environnement :

```bash
JAVA_HOME=C:\Users\v1v1\.buildtools\jdk-17.0.19+10
ANDROID_HOME=C:\Users\v1v1\.buildtools\android-sdk
```

Après un `npx expo prebuild` (qui régénère `android/` et écrase la
configuration de signature), relancer :

```bash
node tools/apply-signing.js
```

### Développement au quotidien

```bash
cd apps/mobile && npx expo start
```

---

## Vérifications

Le calcul de position est du code sûreté : c'est lui qui détermine où les
secours vont chercher. Il est vérifié, pas seulement écrit.

```bash
node tools/test-dfci.js
node tools/test-message.js
```

- `test-dfci.js` : invariants de la projection Lambert 93 (l'origine, le facteur
  d'échelle publié 0,99905102, l'échelle unitaire sur les parallèles standards),
  aller-retours WGS84 ↔ L93, puis **40 000 mailles tirées au sort dans le
  shapefile officiel** converties de bout en bout et comparées à leur code réel.
- `test-message.js` : formatage des degrés décimaux (hémisphère sud, longitudes
  ouest, arrondis), réduction à l'ASCII, segmentation SMS GSM-7 / UCS-2, et
  garantie du segment unique y compris avec un nom d'observateur long.

---

## Outils de génération

Les fichiers `src/data/*` et `src/lib/mapHtml.ts` sont **générés** — ne pas les
éditer à la main.

| Commande | Produit |
|---|---|
| `node tools/build-dfci-grid.js` | `src/data/dfciGrid.ts` — la grille DFCI dérivée du shapefile officiel, vérifiée sur ses 339 264 mailles, en 11 Ko |
| `node tools/build-map-html.js` | `src/lib/mapHtml.ts` — la page Leaflet embarquée (Leaflet 1.9.4 intégré, pour que la carte fonctionne sans réseau) |
| `node tools/apply-signing.js` | configuration de signature du projet Android |

---

## Limites connues

- **Envoi non automatique.** Android réserve l'envoi de SMS en arrière-plan aux
  applications de messagerie par défaut, et iOS l'interdit totalement. VigiAero
  ouvre donc la messagerie avec le message prêt : il reste un appui sur
  « Envoyer ». C'est aussi ce qui empêche les fausses alertes.
- **Aucun accusé de réception.** Android ne remonte pas le statut d'envoi :
  l'historique indique « transmis » lorsque la fenêtre SMS a été ouverte avec le
  message, pas lorsque le SMS est arrivé.
- **Tuiles non mises en cache.** Sans réseau, la carte reste vide — mais le
  bandeau de position, le code DFCI et le bouton d'alerte, qui sont natifs et
  posés au-dessus de la carte, continuent de fonctionner normalement.
- **Le 114 est un service dédié.** Il s'adresse d'abord aux personnes sourdes,
  malentendantes ou aphasiques. L'usage par un pilote qui ne peut pas parler en
  vol doit être validé auprès du service, et l'idéal reste une convention avec le
  CODIS concerné. La destination est isolée dans une constante (`DESTINATION`
  dans `ReportScreen.tsx`) pour être changée en une ligne.
- **Clé OpenAIP partagée avec Cumulus** (`app.json` → `extra.openAipKey`) : à
  remplacer par une clé dédiée.
- **Altitude GPS, pas QNH.** Le récepteur rend une altitude rapportée à
  l'ellipsoïde ; l'écart avec l'altitude barométrique atteint environ 150 ft en
  France. Le message l'annonce explicitement (`3500ft GPS`) : c'est une hauteur
  d'observation indicative, pas une altitude de vol.
- **APK de 70 Mo** (toutes architectures dans un seul fichier) : trop lourd pour
  un envoi par courriel, à passer par câble USB ou par un partage de fichiers.
