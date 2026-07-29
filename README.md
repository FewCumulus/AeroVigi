# AeroVigi

Signalement de feux de forêt depuis un avion léger. Une position, un type de feu,
un SMS au **114** — sans couverture data.

État : **MVP Android**, France.

| Document | Contenu |
|---|---|
| [docs/00-plan-produit.md](docs/00-plan-produit.md) | Plan produit et technique : contraintes, architecture, carroyage DFCI, suite (feux partagés, planification des vols, Espagne) |
| [docs/02-ios-app-store.md](docs/02-ios-app-store.md) | Portage iOS et publication App Store : prérequis, chaîne de compilation, différences de comportement, revue Apple |

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
5. **Écran de confirmation** : type de feu, ampleur facultative, **intention**
   (« je reste sur zone » / « je poursuis ma route » — le CODIS sait ainsi s'il
   peut compter sur un observateur au-dessus du feu), et le texte exact qui
   partira, avec son décompte de caractères.
6. **Envoi** : ouvre la messagerie avec le 114 et le message pré-remplis.
7. **Consignes après alerte** : les trois règles de conduite au-dessus d'un feu,
   plus la position en gros caractères pour la lire à la radio à l'organisme de
   contrôle ou à Info FIR, sans rouvrir la messagerie.
8. **Feux reportés sur la carte** avec l'heure du signalement. Un appui sur un
   marqueur rouvre la fiche pour un message de suivi — « arrivée de véhicules
   d'intervention » ou « le feu semble maîtrisé », ce dernier grisant le
   marqueur. Deux commandes apparaissent alors dans la barre latérale : un
   **œil** pour masquer les marqueurs, une **corbeille** pour effacer ceux de
   plus de 12 h ou la totalité. Un feu isolé s'efface depuis sa propre fiche.
   Le partage de ces feux entre pilotes viendra avec le serveur
   ([plan §5.2](docs/00-plan-produit.md)).
9. **Lien vers la [Météo des forêts](https://meteofrance.com/meteo-des-forets)**
   de Météo-France en tête de menu, à consulter au sol avant le vol.

Le bouton retour d'Android ramène à l'écran précédent ; sur la carte (l'écran
racine), un double appui est requis pour quitter — un geste de trop en vol ne
doit pas décharger les tuiles. Un premier appui affiche « Appuyez de nouveau
pour quitter » ; sans confirmation dans les 2 secondes, l'application reste au
premier plan.

### R8 / réduction de la taille

Le binaire est compilé avec R8 (minification du code Java/Kotlin) et réduction
des ressources inutilisées, via le plugin `expo-build-properties`
(`android.enableMinifyInReleaseBuilds` / `enableShrinkResourcesInReleaseBuilds`
dans `app.json`). Effet mesuré : APK de 71,6 Mo → 66,4 Mo. N'affecte pas le
bundle JavaScript (Hermes), seulement le code natif Android — testé sur
appareil après activation, aucune régression observée.

### Le message

```
FEU DE FORET IMPORTANT vu d avion
DFCI KD44F0
43.52970N 005.44740E
JO PILOTE F-GXYZ radio 123.500
1432UTC 3500ft GPS
Je reste sur zone
Appel vocal impossible
```

157 caractères — **un seul SMS**, avec trois caractères de marge. Les contraintes qui expliquent cette forme :

- au-delà de 160 caractères, le SMS est découpé en segments dont le réassemblage
  et l'ordre d'arrivée ne sont pas garantis chez le destinataire ; les lignes de
  confort sont donc écartées automatiquement si elles font déborder, et l'écran
  affiche ce qui a été retiré ;
- **aucun accent** : un seul caractère hors alphabet GSM-7 ferait tomber la
  capacité de 160 à 70 caractères ;
- **DFCI en premier** : c'est le référentiel de travail des CODIS.

---

## Installer l'APK

Les APK ne sont pas versionnés : récupérer celui de la dernière *release*, ou le
compiler soi-même (voir « Recompiler » ci-dessous — le fichier est alors dans
`apps/mobile/android/app/build/outputs/apk/release/`).

1. Copier le fichier sur le téléphone (câble USB, envoi par mail, cloud…).
2. L'ouvrir depuis le gestionnaire de fichiers.
3. Android demandera d'autoriser l'installation depuis cette source : accepter.
4. Au premier lancement : lire les conditions, puis saisir nom, immatriculation
   et fréquence radio. Ces informations restent sur le téléphone.
5. Autoriser l'accès à la position **« pendant l'utilisation »**.

Installation par USB, si le téléphone est en mode développeur :

```bash
adb install -r app-release.apk
```

---

## Clé OpenAIP

La surcouche aéronautique de la carte (espaces aériens) provient de l'API de
tuiles OpenAIP, qui demande une clé. Elle est **facultative** : sans clé,
l'application fonctionne et affiche le seul fond OpenStreetMap. Les alertes n'en
dépendent pas.

Une clé gratuite s'obtient sur [openaip.net](https://www.openaip.net), dans les
paramètres du compte. Deux façons de la fournir.

**Dans l'application** — *Menu → Profil → Clé OpenAIP*. La clé est stockée sur
le téléphone et prend le pas sur une éventuelle clé de compilation. C'est le
mode prévu pour les versions distribuées : le binaire ne contient alors aucune
clé.

**À la compilation** — `apps/mobile/app.config.ts` lit la variable
d'environnement `AEROVIGI_OPENAIP_KEY`. Copier `.env.example` en `.env` (ignoré
par Git) et y renseigner la clé, ou la passer à la commande de compilation. Une
clé injectée ainsi se retrouve dans le binaire, d'où elle est extractible : à
réserver aux compilations privées.

## Recompiler

La chaîne de compilation est locale : JDK 17 et SDK Android (plateforme 36,
build-tools 36), sans compte Expo ni service tiers.

```bash
cd apps/mobile/android && ./gradlew assembleRelease
```

`JAVA_HOME` et `ANDROID_HOME` doivent pointer sur le JDK et le SDK. Pour
embarquer une clé OpenAIP dans le binaire :

```bash
AEROVIGI_OPENAIP_KEY=votre_cle ./gradlew assembleRelease
```

Après un `npx expo prebuild` (qui régénère `android/` et écrase la
configuration de signature), relancer :

```bash
node tools/apply-signing.js
```

⚠️ La clé de signature vit dans `apps/mobile/keystore/` — **hors** de `android/`,
justement parce que `prebuild` régénère ce dossier. Elle n'est pas versionnée.
**Sauvegardez-la** : la perdre signifie que les mises à jour ne s'installeront
plus par-dessus la version précédente (désinstallation obligatoire côté
utilisateur), et qu'une publication Play Store ultérieure serait bloquée.

### Développement au quotidien

```bash
cd apps/mobile && npx expo start
```

### iOS

Le code est prêt : aucun module natif propre à Android, et le bloc `ios` de
`app.json` est renseigné (identifiant, icône sans canal alpha, chaîne
d'autorisation de localisation, conformité export). Il n'y a pas de dossier
`ios/` — le projet Xcode est généré à la demande.

Compiler pour iOS exige macOS, ce qui, depuis Windows, passe par EAS Build :

```bash
cd apps/mobile && eas build --platform ios --profile preview
```

Les prérequis, les différences de comportement et ce qu'Apple demande à la revue
sont détaillés dans [docs/02-ios-app-store.md](docs/02-ios-app-store.md). Deux
points de calendrier et de code y figurent : le compte Apple Developer coûte
99 $ par an et sa validation prend de quelques jours à deux semaines ; et la
**position approximative** d'iOS 14+ et d'Android 12+ produirait une maille DFCI
fausse — correctif à faire avant publication (§7 du même document).

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

### Ce qui a été vérifié sur appareil

Cet APK a été installé et parcouru de bout en bout sur un émulateur Android 15
avec position GPS simulée au-dessus d'Aix-en-Provence :

- code DFCI affiché **KD 44 F 0**, identique à ce que calcule le test hors
  ligne pour ces coordonnées ;
- marque verticale → écran de signalement → **composeur SMS ouvert sur le 114
  avec le message pré-rempli**, intention comprise ;
- écran de consignes affiché au retour, avec la position en gros caractères ;
- marqueur de feu posé sur la carte avec son heure ; appui dessus → fiche de
  suivi (« arrivée de véhicules », « feu maîtrisé ») sur la même position ;
- pointage carte : réticule, déplacement de la carte, validation, code DFCI
  distinct ;
- **réseau coupé** : retour depuis l'écran de signalement, la carte conserve
  ses tuiles ;
- icône visible au lanceur, correctement recadrée en cercle ;
- aucun plantage dans les journaux.

Ce qu'un émulateur ne peut pas valider : la réception réelle par le 114, la
qualité du GPS en vol, et la lisibilité en plein soleil.

### R8 en optimisation complète

Depuis la 1.2.0, `build.gradle` utilise `proguard-android-optimize.txt` au lieu
de `proguard-android.txt` (ce dernier contient `-dontoptimize`, qui désactive la
passe d'optimisation de R8 — seuls le rétrécissement et l'obfuscation des noms
s'appliquaient jusque-là). C'est un changement plus agressif que la simple
activation de R8 : testé de bout en bout sur appareil (installation, carte,
GPS, marque verticale, écran de signalement, ouverture du composeur SMS,
double appui retour pour quitter), aucune régression constatée.

### Recommandations Play Console non retenues

Trois points du rapport « Actions recommandées » de Play Console ne viennent
pas de notre code, mais de bibliothèques bundlées par React Native 0.86 /
Expo SDK 57 :

- **Appels dépréciés pour l'affichage bord à bord**
  (`Window.setStatusBarColor` etc.) : émis automatiquement par le cœur de
  React Native (`WindowUtilKt.enableEdgeToEdge`, `StatusBarModule`) et par
  Google Material Components, à l'initialisation de l'activité — pas par notre
  JS. Les journaux confirment que `StatusBarModule` neutralise déjà ces appels
  sous edge-to-edge (« Ignored status bar change ») : sans effet visuel, juste
  présents dans le bytecode. Une bibliothèque de remplacement existe
  (`react-native-edge-to-edge`), mais sa propre documentation déconseille de
  l'utiliser sur RN 0.81+ (on est déjà sur le mécanisme natif recommandé), et
  rien ne garantit qu'elle retirerait l'appel de `WindowUtilKt`, qui est interne
  au cœur de RN. Non tenté : changement de thème natif risqué pour un gain
  incertain.
- **Chargement d'images réseau non optimisé** (Fresco) : l'application n'a
  aucun composant `<Image>` chargeant une URL distante — la carte est une
  WebView (Chromium), pas le pipeline d'images de React Native. Fresco est
  bundlé par le cœur de RN qu'on l'utilise ou non.
- **AGP 9.0 ou ultérieur** : la version d'AGP est fixée par
  `@react-native/gradle-plugin` (8.12.0 pour RN 0.86), un fichier de
  `node_modules` régénéré à chaque installation — non modifiable sans une
  montée de version majeure de React Native.

Aucun de ces trois points n'est classé bloquant par Play Console (catégories
« Expérience utilisateur » / « Qualité technique »). Le verrouillage portrait
(cf. plus haut) n'est pas non plus retenu, pour la même raison de non-blocage
et un motif d'usage plus fort : testé en rotation, la mise en page casse
réellement (bouton d'alerte chevauchant la carte).

---

## Outils de génération

Les fichiers `src/data/*` et `src/lib/mapHtml.ts` sont **générés** — ne pas les
éditer à la main.

| Commande | Produit |
|---|---|
| `node tools/build-dfci-grid.js` | `src/data/dfciGrid.ts` — la grille DFCI dérivée du shapefile officiel, vérifiée sur ses 339 264 mailles, en 11 Ko. Le shapefile source (~130 Mo) n'est pas versionné : voir l'en-tête du script pour sa provenance |
| `node tools/build-map-html.js` | `src/lib/mapHtml.ts` — la page Leaflet embarquée (Leaflet 1.9.4 intégré, pour que la carte fonctionne sans réseau) |
| `node tools/apply-signing.js` | correctifs du projet Android généré : signature de release, activation de l'optimisation R8 complète (`proguard-android-optimize.txt`), report de la version d'`app.json` dans `build.gradle` (`versionName` et `versionCode`, que le prebuild seul ne met pas à jour), retrait des permissions déclarées par React Native mais inutilisées ici (dont `SYSTEM_ALERT_WINDOW`), et retrait des attributs de thème dépréciés pour l'affichage bord à bord (`android:statusBarColor` / `android:navigationBarColor`, déjà transparents par défaut sous edge-to-edge). À relancer après chaque `expo prebuild`, et après chaque changement de version |
| `powershell -File tools/build-icons.ps1` | les icônes de l'app, dérivées de `docs/Logo AeroVigi clean.png` (l'icône adaptative Android étant recadrée en cercle, le logo est réduit à 66 % pour tenir dans la zone garantie) |

---

## Limites connues

- **Envoi non automatique.** Android réserve l'envoi de SMS en arrière-plan aux
  applications de messagerie par défaut, et iOS l'interdit totalement. AeroVigi
  ouvre donc la messagerie avec le message prêt : il reste un appui sur
  « Envoyer ». C'est aussi ce qui empêche les fausses alertes.
- **Aucun accusé de réception.** Android ne remonte pas le statut d'envoi :
  l'historique indique « transmis » lorsque la fenêtre SMS a été ouverte avec le
  message, pas lorsque le SMS est arrivé.
- **Tuiles non mises en cache.** Sans réseau, la carte reste vide — mais le
  bandeau de position, le code DFCI et le bouton d'alerte, qui sont natifs et
  posés au-dessus de la carte, continuent de fonctionner normalement. La carte
  n'est jamais démontée une fois chargée : les écrans de signalement et de menu
  se superposent, de sorte qu'un signalement fait hors couverture ne fait pas
  perdre les tuiles déjà affichées.
- **Le 114 est un service dédié.** Il s'adresse d'abord aux personnes sourdes,
  malentendantes ou aphasiques, ainsi qu'à celles momentanément dans
  l'incapacité de parler — le cas d'un pilote au casque, moteur en marche. Les
  conditions affichées au premier lancement le rappellent, et invitent à
  appeler le 18 ou le 112 dès que la parole est possible. La destination est
  isolée dans une constante (`DESTINATION` dans `src/screens/ReportScreen.tsx`)
  et se change en une ligne.
- **Surcouche aéronautique conditionnée à une clé OpenAIP** — voir la section
  « Clé OpenAIP ». Sans clé, la carte n'affiche que le fond OpenStreetMap ; les
  alertes, elles, ne dépendent pas de la clé.
- **Altitude GPS, pas QNH.** Le récepteur rend une altitude rapportée à
  l'ellipsoïde ; l'écart avec l'altitude barométrique atteint environ 150 ft en
  France. Le message l'annonce explicitement (`3500ft GPS`) : c'est une hauteur
  d'observation indicative, pas une altitude de vol.
- **APK de 70 Mo** (toutes architectures dans un seul fichier) : trop lourd pour
  un envoi par courriel, à passer par câble USB ou par un partage de fichiers.
- **Verrouillage portrait volontairement conservé**, malgré la recommandation
  Play Console (« qualité technique ») de le retirer pour les grands écrans.
  Testé en rotation : le bouton MARQUE VERTICALE chevauche la carte et les
  commandes latérales se retrouvent tronquées — inacceptable sur une
  application de sécurité utilisée en vol. La recommandation reste affichée
  côté Play Console, elle n'est que documentaire, pas bloquante.
