# VigiAero — portage iOS et publication App Store

> Guide de développement. Mis à jour le 27/07/2026, sur la base de l'état réel
> du dépôt à cette date.
>
> À lire d'abord si vous venez de la version Android : §1 (ce qui est déjà
> prêt), §2 (les délais que vous ne maîtrisez pas), §5 (ce qu'Apple va demander).

---

## 1. État des lieux

Le portage est **simple sur le plan technique** : l'application n'utilise aucun
module natif propre à Android, et rien dans le code métier n'est spécifique à
une plateforme.

| Brique | iOS |
|---|---|
| Carroyage DFCI, formatage, message SMS | JavaScript pur — identique |
| Carte (Leaflet dans une WebView) | `react-native-webview` → WKWebView |
| Position | `expo-location` → CoreLocation |
| Envoi SMS | `expo-sms` → `MFMessageComposeViewController` |
| Écran maintenu allumé | `expo-keep-awake` → `isIdleTimerDisabled` |
| Stockage local | AsyncStorage → fichiers de l'app |
| Marges d'écran | `react-native-safe-area-context` — déjà utilisé partout |

Déjà en place dans le dépôt :

- `apps/mobile/app.json` → bloc `ios` : identifiant `fr.vigiaero.app`,
  `supportsTablet: false`, icône dédiée sans canal alpha, chaîne d'autorisation
  de localisation, `ITSAppUsesNonExemptEncryption: false` ;
- `apps/mobile/eas.json` → profils `development`, `preview`, `production` pour
  les deux plateformes ;
- `apps/mobile/assets/icon-ios.png` → 1024×1024, **24 bits sans canal alpha**
  (voir §4.1, c'est un motif de rejet fréquent) ;
- orientation verrouillée en portrait, comme sur Android.

Il n'y a **pas** de dossier `ios/` : le projet reste en configuration gérée
(*Continuous Native Generation*). Le projet Xcode est fabriqué à la demande par
`expo prebuild`, que la compilation soit locale ou sur EAS. Ne le versionnez
pas : il serait à régénérer à chaque changement de configuration.

---

## 2. Prérequis hors code — à lancer en premier

Ce sont les seuls éléments à délai long. Le reste se fait en une journée.

### 2.1 Compte Apple Developer Program

**99 $ par an**, obligatoire pour distribuer, même gratuitement, même en
TestFlight. L'inscription demande une vérification d'identité qui prend de
quelques jours à deux semaines. Pour une association, il faut en plus un
identifiant D-U-N-S, dont l'obtention peut à elle seule prendre une à deux
semaines.

**Compte individuel ou organisation ?** L'individuel est immédiat et suffit
pour publier ; le nom du développeur affiché sur la fiche sera votre nom.
L'organisation affiche le nom de l'association et sera mieux perçue pour une
application de sécurité — mais ajoute le délai D-U-N-S. Si le compte
association est le but, ouvrez le dossier D-U-N-S maintenant et publiez
entre-temps en individuel : le transfert d'application entre comptes est
possible.

### 2.2 Machine de compilation

Compiler pour iOS **exige macOS et Xcode**. Vous êtes sur Windows, donc deux
options :

- **EAS Build** (recommandé) : la compilation tourne sur les machines macOS
  d'Expo. Nécessite un compte Expo — gratuit, avec un quota mensuel de
  compilations ; les files d'attente gratuites peuvent atteindre plusieurs
  dizaines de minutes en heure de pointe.
- **Un Mac**, même d'occasion ou emprunté : `npx expo run:ios`. Utile pour
  déboguer, indispensable si vous voulez itérer vite.

À la différence d'Android, il n'existe **aucun contournement** : pas de
chaîne locale possible sous Windows.

### 2.3 Identifiants de signature

Contrairement à Android où nous gérons nous-mêmes la clé, EAS peut créer et
conserver les certificats et profils de provisionnement Apple pour vous
(`eas credentials`). C'est le plus simple. Sauvegardez malgré tout l'accès au
compte Apple : c'est lui, et non le certificat, qui est irremplaçable.

---

## 3. Chaîne de compilation

```bash
npm install -g eas-cli
cd apps/mobile
eas login
eas init                     # rattache le projet au compte Expo
```

Compilation d'essai, installable sur vos appareils déclarés :

```bash
eas build --platform ios --profile preview
```

Compilation de production, à envoyer sur App Store Connect :

```bash
eas build --platform ios --profile production
eas submit --platform ios --latest
```

### 3.1 Clé OpenAIP

Ne la mettez pas dans le dépôt (voir README, section « Clé OpenAIP »). Pour une
compilation EAS :

```bash
eas secret:create --scope project --name VIGIAERO_OPENAIP_KEY --value <cle>
```

Rappel : la clé se retrouve dans le binaire, donc dans l'IPA téléchargeable
depuis l'App Store. Pour une diffusion publique, **ne définissez pas ce
secret** : chaque pilote saisit la sienne dans *Menu → Profil*.

### 3.2 Numéro de version

`eas.json` utilise `appVersionSource: "remote"` : EAS incrémente lui-même le
`buildNumber` à chaque compilation de production. Le numéro visible par
l'utilisateur reste `version` dans `app.json`, à monter à la main pour chaque
livraison (0.1.0 → 0.2.0…).

---

## 4. Différences de comportement à connaître

### 4.1 Icône — motif de rejet classique

App Store Connect **refuse toute icône comportant un canal alpha**, même
entièrement opaque. C'est un rejet à la validation du binaire, donc après la
compilation : quelques heures perdues à chaque fois.

`assets/icon-ios.png` est produit exprès en 24 bits sans alpha par
`tools/build-icons.ps1`, et `app.json` pointe dessus via `ios.icon`. Si vous
régénérez les icônes, vérifiez :

```powershell
Add-Type -AssemblyName System.Drawing
([System.Drawing.Image]::FromFile("apps\mobile\assets\icon-ios.png")).PixelFormat
# doit afficher Format24bppRgb, jamais Format32bppArgb
```

Piège rencontré ici : le rééchantillonnage bicubique de GDI+ échantillonne
au-delà des bords de l'image source et y laisse des pixels semi-transparents,
même en partant d'une source totalement opaque. D'où le `WrapMode.TileFlipXY`
dans le générateur.

### 4.2 SMS

`expo-sms` ouvre le composeur natif, exactement comme sur Android : le message
et le destinataire sont pré-remplis, l'envoi reste un geste de l'utilisateur.
Aucune API ne permet l'envoi silencieux sur iOS, quelle que soit
l'autorisation — ce n'est pas une limitation d'Expo.

Deux différences en votre faveur :

- iOS **renvoie un vrai résultat** (`sent` ou `cancelled`), là où Android répond
  toujours `unknown`. Le code enregistre déjà ce résultat ; sur iOS l'historique
  sera donc plus fiable et l'écran de consignes ne s'affichera qu'après un envoi
  réellement confirmé ;
- pas de politique de magasin restreignant la permission SMS, contrairement à
  la Play Store.

À vérifier sur appareil : `SMS.isAvailableAsync()` renvoie **toujours `false`
sur le simulateur**. Ne concluez pas à une panne — testez sur un iPhone réel.

### 4.3 Localisation

`Accuracy.BestForNavigation` correspond à `kCLLocationAccuracyBestForNavigation`
et suppose que l'appareil est alimenté. C'est le bon réglage en vol, mais il
consomme : prévoyez l'alimentation à bord, comme sur Android.

L'application ne demande que l'autorisation *quand l'app est utilisée* — pas de
localisation en arrière-plan, pas de `UIBackgroundModes`. C'est volontaire :
demander « Toujours » déclenche un examen supplémentaire d'Apple et une
justification écrite, pour un besoin que nous n'avons pas.

Depuis iOS 14, l'utilisateur peut n'accorder qu'une **position approximative**.
Le carroyage DFCI ayant une maille de 2 km, une position approximative
(quelques kilomètres) donnerait une **maille fausse**. À traiter avant
publication : lire `CLLocationManager.accuracyAuthorization`, et si elle est
réduite, soit demander une précision temporaire complète, soit afficher un
avertissement franc à la place du code DFCI. Voir §7.

### 4.4 Carte

La page Leaflet est chargée dans WKWebView via `source={{ html, baseUrl }}`.
Les tuiles OpenStreetMap et OpenAIP sont servies en HTTPS : rien à déclarer au
titre d'*App Transport Security*. Si un jour vous ajoutez une source en HTTP,
il faudra une exception dans `NSAppTransportSecurity` — et la justifier à la
revue.

### 4.5 Manifeste de confidentialité

Apple exige un `PrivacyInfo.xcprivacy` déclarant l'usage des API dites « à
raison requise ». Expo en génère un et les modules de l'écosystème déclarent les
leurs — AsyncStorage passe par `UserDefaults`, qui en fait partie. À vérifier
après la première compilation : App Store Connect signale les manquements par
courriel après l'envoi du binaire, sans bloquer immédiatement.

---

## 5. Ce qu'Apple va demander

La revue est **manuelle**. Une application dont la fonction est d'alerter les
secours est examinée par un humain, dans un pays qui n'est pas la France, sur un
appareil sans carte SIM française. Préparez ces trois points, ils évitent
l'essentiel des allers-retours.

### 5.1 Notes de revue

Le champ *Notes for Review* d'App Store Connect. Texte à adapter :

> VigiAero is used by private pilots in France to report forest fires they see
> from the air. Tapping the alert button opens the **system Messages composer**
> pre-filled with the fire's coordinates and the French DFCI grid reference.
> The app never sends anything by itself — the user must tap Send.
>
> To test: allow location, tap "MARQUE VERTICALE", pick a fire type, then tap
> "ENVOYER AU 114". The Messages composer will open. **Please do not send the
> message** — 114 is a live French emergency number. Closing the composer
> returns to the app and is enough to complete the flow.
>
> The app has no account, no server and no backend. Nothing leaves the device
> except the SMS the user sends from their own Messages app.

Le point décisif est la phrase demandant au relecteur de **ne pas envoyer** le
message : sans elle, un relecteur consciencieux le fera.

### 5.2 Confidentialité (App Privacy)

Le questionnaire d'App Store Connect. Réponse exacte pour l'état actuel du
code : **« Data Not Collected »** pour toutes les catégories.

Justification, à conserver au cas où : l'application ne dispose d'aucun serveur.
Le nom, l'immatriculation, la fréquence et les positions sont stockés
localement, et ne quittent l'appareil que dans le SMS que l'utilisateur rédige
et envoie lui-même depuis sa propre messagerie. Apple considère qu'il n'y a pas
collecte lorsque le développeur ne reçoit rien.

⚠️ **Cette réponse deviendra fausse le jour où le serveur existera** (partage
des feux entre pilotes, cf. [plan §5.1 bis](00-plan-produit.md)). Il faudra
alors déclarer *Location — Precise* et *Contact Info — Name*, liées à
l'identité, à l'usage « App Functionality ». Mettre à jour le questionnaire
**avant** de publier la version qui remonte des données : une déclaration
inexacte est un motif de retrait.

### 5.3 Le rapport au 114

Attendez-vous à une question sur votre relation avec le service. Une
application qui adresse un numéro d'urgence national sans démontrer d'accord
peut se voir demander des justificatifs, et la fiche ne doit en aucun cas
laisser croire à un partenariat officiel.

Trois mesures concrètes :

1. **Ne rien laisser entendre d'officiel.** Ni dans le nom, ni dans le
   sous-titre, ni dans les captures d'écran, ni dans la description : pas de
   logo des secours, pas de « service officiel », pas de « en partenariat
   avec ». Décrivez un outil d'aide à la rédaction du message.
2. **Joindre tout accord écrit** que vous obtiendrez — courrier du CNR 114,
   convention avec un CODIS — dans les notes de revue. C'est ce qui débloque le
   plus sûrement ce type de dossier.
3. **Faire figurer l'avertissement dans la fiche**, pas seulement dans
   l'application : « ne remplace pas un appel au 18 ou au 112 ». Les conditions
   affichées au premier lancement jouent déjà ce rôle côté application.

Ces exigences ne s'appliquent pas au dépôt GitHub ni à la distribution directe
de l'APK — seulement aux magasins.

### 5.4 Complétude

Le relecteur doit pouvoir se servir de l'application sans carte SIM française.
Vérifiez qu'aucun écran ne reste bloqué ni vide dans ce cas : hors de France,
le bandeau affiche « Hors carroyage DFCI » et les degrés décimaux restent
corrects — comportement attendu, pas une panne. C'est également ce que voit un
pilote au-dessus de l'Espagne.

---

## 6. Liste de contrôle avant envoi

**Compte et projet**

- [ ] Apple Developer Program actif, contrats fiscaux et bancaires signés dans
      App Store Connect (une application gratuite exige quand même le contrat
      d'application gratuite)
- [ ] Identifiant `fr.vigiaero.app` enregistré dans le portail Apple
- [ ] Projet Expo créé (`eas init`), secret OpenAIP décidé (défini ou non)

**Binaire**

- [ ] `npx tsc --noEmit` sans erreur
- [ ] `node tools/test-dfci.js` et `node tools/test-message.js` au vert
- [ ] `version` incrémentée dans `app.json`
- [ ] `icon-ios.png` en `Format24bppRgb` (voir §4.1)
- [ ] `eas build --platform ios --profile production` terminé sans erreur

**Fiche App Store**

- [ ] Captures d'écran 6,7" et 6,1" (obligatoires) — carte, écran de
      signalement, écran de consignes
- [ ] Description sans mention d'un caractère officiel (§5.3)
- [ ] Mots-clés : feu de forêt, pilote, aviation, DFCI, signalement, vigilance
- [ ] Catégorie : Navigation, ou Météo en second choix
- [ ] Classification d'âge : 4+
- [ ] **URL de politique de confidentialité — obligatoire**, y compris sans
      collecte. Une page GitHub Pages suffit ; reprendre le texte des conditions
      d'utilisation de l'application
- [ ] Questionnaire App Privacy rempli (§5.2)
- [ ] Notes de revue rédigées, avec la consigne de ne pas envoyer le SMS (§5.1)
- [ ] Conformité export : déjà répondu par `ITSAppUsesNonExemptEncryption`

**Essais réels**

- [ ] Testé sur un iPhone physique, pas seulement sur simulateur (§4.2)
- [ ] Testé avec la localisation refusée, puis en précision réduite (§4.3)
- [ ] Testé en mode avion : le composeur SMS s'ouvre, le message part à la
      reconnexion
- [ ] Un vol d'essai réel avant de publier

---

## 7. Reste à faire dans le code

Rien ne bloque une première compilation iOS. Ces points sont à traiter avant la
publication publique.

| # | Sujet | Pourquoi |
|---|---|---|
| 1 | **Précision réduite (§4.3)** | Une position approximative produit une maille DFCI fausse — le seul défaut du portage qui puisse tromper les secours. À traiter en premier. |
| 2 | Écran de démarrage | Aucun n'est configuré ; iOS affichera un écran blanc. `expo-splash-screen` avec `assets/splash-icon.png`. |
| 3 | Vérifier `PrivacyInfo.xcprivacy` | Après la première compilation, §4.5. |
| 4 | Page de politique de confidentialité | Obligatoire pour la fiche, à héberger. |
| 5 | Essai du composeur SMS sur iPhone | `isAvailableAsync` étant faux sur simulateur, ce chemin n'est vérifiable qu'en réel. |

Le point 1 concerne aussi Android : depuis Android 12, l'utilisateur peut lui
aussi n'accorder qu'une position approximative. Le correctif est à faire dans
`useAircraftPosition.ts`, une fois, pour les deux plateformes.
