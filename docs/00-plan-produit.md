# VigiAero — Plan produit & technique

> Application mobile (Expo / React Native) permettant aux pilotes privés en vol de faire de
> la vigilance feux de forêt : alerte en un geste, et — à venir — partage des feux signalés
> et planification des vols d'observation.
>
> Cible initiale : Android (France), puis iOS, puis Espagne.
> État au 27/07/2026 : **F1 livrée** (voir [README](../README.md)), F2 à faire.

---

## 1. Périmètre

| # | Fonction | État |
|---|---|---|
| F1 | Alerte feu en un geste → SMS pré-rempli au 114 | **livrée** |
| F2 | Feux partagés entre pilotes + planification et déconfliction des vols | à faire |
| F3 | Extension Espagne (i18n `es`, routage 112 régional) | à faire |
| F4 | iOS, cartes hors ligne, export post-vol | à faire |

**Hors périmètre explicite** : détection automatique de feu, remplacement d'un moyen
d'alerte officiel, coordination opérationnelle des moyens de lutte.

---

## 2. Contraintes structurantes

Trois contraintes déterminent la forme de l'application. Elles sont techniques : aucune
n'est contournable par un choix d'implémentation.

### 2.1 L'envoi de SMS par programme est impossible

- **Android** : la permission `SEND_SMS` (envoi silencieux) est réservée par la politique
  du Play Store aux applications de messagerie par défaut. Une application tierce qui la
  demande est rejetée.
- **iOS** : aucun envoi par programme, quelle que soit la configuration.

Le « un geste » réel est donc : **1 appui dans VigiAero → la fenêtre SMS du système s'ouvre
pré-remplie (destinataire et texte) → 1 appui sur Envoyer**. Le second geste est imposé par
les magasins ; il fait aussi office de sécurité anti-fausse-alerte.

Ce que le SMS apporte en échange : il part sans données mobiles, sur un réseau dégradé, et
la réponse du destinataire arrive sur le numéro du pilote — un dialogue reste possible. Un
relais serveur (l'application envoie à un serveur qui envoie le SMS) casserait ce dialogue :
écarté comme canal principal.

### 2.2 Hors ligne d'abord

La couverture réseau est aléatoire en altitude. Tout ce qui conditionne l'alerte fonctionne
donc sans réseau : calcul du carroyage DFCI, formatage du message, composeur SMS. Seules les
tuiles de la carte demandent une connexion.

Conséquence de conception : le bandeau de position et le bouton d'alerte sont des composants
natifs **posés au-dessus** de la carte, jamais dans la page web. Si la carte ne charge pas,
le pilote garde ses coordonnées, son code DFCI et son bouton. La carte n'est par ailleurs
jamais démontée une fois chargée — les autres écrans se superposent — pour qu'un
signalement fait hors couverture ne fasse pas perdre les tuiles déjà affichées.

### 2.3 Le destinataire n'est pas figé

Un numéro de salle opérationnelle peut changer, et l'extension à l'Espagne suppose plusieurs
destinataires régionaux. La destination est aujourd'hui une constante unique
(`DESTINATION` dans `src/screens/ReportScreen.tsx`) ; l'abstraction prévue est décrite en
§4.4.

---

## 3. Architecture

```
VigiAero/
├── apps/mobile/            # Expo SDK 57, React Native 0.86, TypeScript
│   ├── App.tsx             # machine à états à cinq écrans (pas de routeur)
│   ├── assets/             # icônes générées
│   └── src/
│       ├── components/     # Btn
│       ├── data/           # dfciGrid.ts (généré)
│       ├── lib/            # dfci, coords, message, storage, mapHtml (généré), theme…
│       └── screens/        # Map, Report, Advice, Profile, Menu, Disclaimer
├── docs/
└── tools/                  # générateurs et vérifications (Node, sans dépendances)
```

Choix volontaires, motivés par le délai de mise en service et par la fiabilité :

- **pas de routeur** — cinq écrans, aucune URL à partager, une chaîne d'outils en moins ;
- **pas de framework de style** — `StyleSheet` seul ;
- **aucune dépendance de production hors Expo** : `expo-location`, `expo-sms`,
  `expo-keep-awake`, `react-native-webview`, `react-native-safe-area-context`,
  AsyncStorage ;
- **tests en Node pur**, sans lanceur de tests (voir §4.5).

### 3.1 La carte

Leaflet dans une WebView, la page HTML étant **embarquée dans l'application** — Leaflet
compris — plutôt que chargée depuis un serveur : l'interface reste utilisable sans réseau, et
il n'y a ni dépendance externe ni authentification à injecter.

Couches, volontairement minimales :

1. fond OpenStreetMap ;
2. **un seul calque raster OpenAIP** en surcouche — pas de polygones GeoJSON, pas de
   filtrage par limites verticales ;
3. position de l'avion, orientée ;
4. marqueurs des feux signalés, avec l'heure.

La WebView n'ayant pas accès à l'API Geolocation sur une origine locale, la position est
poussée depuis le natif (`expo-location`) par injection de script. Les panneaux de tuiles
sont forcés sur leur propre couche GPU, faute de quoi elles clignotent au pinch-zoom sur
Android.

**Hors ligne (à faire)** : un `TileLayer` lisant d'abord un cache disque
(`expo-file-system`), alimenté par un pré-téléchargement de zone au sol.

---

## 4. F1 — Alerte feu

### 4.1 Parcours

Écran carte, en vol, plein soleil, une main disponible :

- **MARQUE VERTICALE** : capture le point GPS **à l'instant de l'appui**, c'est-à-dire la
  position de l'avion à la verticale du feu. À 100 kt on parcourt 50 m par seconde : le point
  est lu dans une `ref` alimentée en continu, sans attendre un rendu.
- **Pointer sur la carte** : réticule fixe au centre, on déplace la carte dessous et on
  valide. Plus praticable qu'un appui précis en turbulence.
- **Écran de confirmation**, tout pré-rempli : nature du feu (4 choix), ampleur
  (facultative), **intention** — « je reste sur zone » / « je poursuis ma route » —, et le
  texte exact qui partira avec son décompte de caractères.
- **Envoi** → composeur SMS du système, pré-rempli.
- **Consignes** au retour : maintenir 3 000 ft au-dessus du feu, transmettre les coordonnées
  et le DFCI à l'organisme de contrôle ou à Info FIR par radio, quitter la zone à l'arrivée
  des moyens aériens. La position y figure en gros caractères, pour la lecture radio.
- Le feu est reporté sur la carte avec son heure ; un appui rouvre la fiche pour un message
  de suivi (« véhicules d'intervention sur place », « feu semble maîtrisé »).

Ergonomie : police large, contraste élevé, cibles tactiles ≥ 60 dp, écran maintenu allumé.

### 4.2 Contenu du message

Le message doit être exploitable par un opérateur de CODIS. Trois exigences priment sur
l'exhaustivité :

1. Le **carroyage DFCI** d'abord — c'est le référentiel de travail des CODIS pour les feux de
   forêt ; les degrés décimaux viennent en complément. Ni degrés-minutes ni
   degrés-minutes-secondes : ils n'apportent rien ici et coûtent des caractères.
2. La **contrainte des 160 caractères** : au-delà, le SMS est découpé en segments dont le
   réassemblage et l'ordre d'arrivée ne sont pas garantis chez le destinataire.
3. **ASCII strict** : un seul caractère hors GSM-7 (é, °, ') fait basculer le message en
   UCS-2 et réduit le segment à 70 caractères.

```
FEU DE FORET IMPORTANT vu d avion
DFCI KD44F0
43.52970N 005.44740E
JO PILOTE F-GXYZ radio 123.500
1432UTC 3500ft GPS
Je reste sur zone
Appel vocal impossible
```
157 caractères, 1 segment.

**Garantie du segment unique** : le message est assemblé par priorité. Les lignes
essentielles — nature, DFCI, degrés décimaux, identité, heure — partent toujours ; les lignes
de confort (intention, mention « appel vocal impossible ») ne sont ajoutées que tant que le
total tient en un segment, et l'écran affiche ce qui a été écarté. Un nom d'observateur long
ne peut donc pas transformer l'alerte en deux SMS.

L'altitude est annoncée `GPS` : le récepteur la rapporte à l'ellipsoïde, l'écart avec
l'altitude barométrique atteint 150 ft en France. C'est une hauteur d'observation, pas une
altitude de vol.

### 4.3 Le carroyage DFCI, hors ligne

Le fichier officiel `CARRO_DFCI_2X2_L93` compte 339 264 mailles : trop lourd à embarquer. Et
coder à la main la chaîne WGS84 → NTF → Lambert II étendu, c'est trois occasions de se
tromper de paramètre de datum sans le voir.

La grille est donc **dérivée du fichier source**. La reprojection conique → conique étant
conforme, elle se ramène à une similitude sur l'emprise d'un carré de 100 km : on ajuste par
moindres carrés une transformation affine par carré. Résultat : **11 Ko embarqués**, résidu
maximal 4,47 m pour une maille de 2 000 m, et les 339 264 mailles du fichier reconstruites à
l'identique.

Reproductible : `node tools/build-dfci-grid.js`, vérifiable par `node tools/test-dfci.js`.

### 4.4 Canaux d'alerte (prévu)

```ts
type AlertChannel = {
  id: string;                    // 'fr-114' | 'fr-sdis-13' | 'es-112-cv' | …
  label: string;
  country: 'FR' | 'ES';
  bbox?: GeoJSON.BBox;           // zone de compétence
  transport: 'sms' | 'voice' | 'api';
  recipient: string;             // '114', '+33…', point d'entrée
  template: 'fr-compact' | 'es-compact' | …;
};
```

Table livrée avec l'application et **rafraîchissable depuis le serveur** sans mise à jour du
magasin. Sélection automatique par position, surcharge manuelle possible, et affichage en
clair du destinataire avant l'envoi.

Un **appel direct au 18 ou au 112** reste accessible à tout moment : c'est la procédure de
référence dès que le pilote peut parler.

### 4.5 Vérifications

Le calcul de position et la génération du message décident de l'endroit où les secours vont
chercher. Ils sont couverts par deux vérifications rejouables, écrites en Node pur :

- `tools/test-dfci.js` — invariants de la projection Lambert 93, aller-retours
  WGS84 ↔ L93, puis 40 000 mailles tirées au sort dans le fichier officiel, converties de
  bout en bout et comparées à leur code réel ;
- `tools/test-message.js` — degrés décimaux (hémisphère sud, longitudes ouest, arrondis),
  réduction à l'ASCII, segmentation GSM-7 / UCS-2, garantie du segment unique y compris avec
  un nom d'observateur long.

---

## 5. F2 — Feux partagés & planification

### 5.1 Besoin

Deux besoins distincts, servis par le même serveur :

- **en vol** : voir les feux déjà signalés par d'autres pilotes ;
- **au sol** : préparer un vol en voyant qui survole quoi, et quand, pour choisir une route
  et des zones que personne ne couvre sur son créneau.

### 5.2 Feux partagés

Les feux signalés sont déjà reportés sur la carte du téléphone qui les a émis, avec l'heure,
et un appui sur le marqueur permet un message de suivi. La suite consiste à **remonter ces
alertes au serveur pour les rendre visibles par tous les utilisateurs**, avec date et heure.

Au-delà du confort : un pilote qui arrive sur zone voit qu'un feu est déjà signalé et
**n'envoie pas un doublon**. C'est l'argument le plus solide à présenter aux services de
secours.

Points à trancher au moment de le faire :

- **durée de vie d'un marqueur** — un feu signalé à 14 h n'a plus d'intérêt le lendemain :
  extinction automatique (12 h par exemple) en plus de l'état « maîtrisé » ;
- **confiance** — n'importe qui pouvant poser un marqueur, prévoir au minimum un compte
  identifié et la possibilité pour un coordinateur de retirer un signalement erroné ;
- **hors ligne** — la remontée doit être différée et rejouée, jamais bloquante pour l'alerte
  SMS elle-même.

### 5.3 Modèle de données (PostgreSQL + PostGIS)

```
pilot(id, name, email, phone, org_id, …)
aircraft(id, registration, type, default_freq, owner_pilot_id)
mission(id, pilot_id, aircraft_id, dep_aerodrome, window tstzrange,
        radio_freq, status ∈ planned|flying|done|cancelled, remarks)
mission_leg(mission_id, seq, geom LINESTRING, eta_start, eta_end, alt_ft)
observation_zone(id, mission_id, geom POLYGON, window tstzrange, label)
fire_report(id, pilot_id, mission_id?, geom POINT, fire_type, severity,
            reported_at, parent_id?, state)
```

- Index GiST sur les géométries et les `tstzrange` ; conflit =
  `ST_Intersects(a, b) AND a.window && b.window`.
- Couverture et trous : grille H3 (résolution 6 ≈ 36 km²) ; une cellule est couverte si une
  zone d'observation active l'intersecte sur la fenêtre demandée.

### 5.4 Relais de tuiles OpenAIP

Un point d'entrée `/tiles/openaip/{z}/{x}/{y}.png` détenant la clé et relayant la requête,
de sorte que l'application n'ait pas besoin d'en connaître une. Un cache disque devant le
relais réduit fortement le trafic sortant : les pilotes d'une même région demandent les
mêmes tuiles.

### 5.5 API

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/fires?bbox&since` | Feux signalés, visibles par tous |
| `POST` | `/fires` | Remontée d'un signalement (après envoi du SMS) |
| `GET` | `/missions?bbox&from&to` | Missions des autres pilotes |
| `POST` | `/missions` | Dépôt d'un plan (route, zones, créneaux) |
| `PATCH` | `/missions/:id` | Décalage, annulation, statut « en vol » |
| `GET` | `/coverage?bbox&from&to&res` | Cellules couvertes / non couvertes |
| `GET` | `/alert-channels` | Table des canaux, versionnée (§4.4) |

Authentification par jeton (courriel + mot de passe, ou lien à usage unique), rôles `pilot` /
`coordinator` / `admin`.

### 5.6 UX de planification

- Carte et **curseur temporel** : on fait défiler l'heure, les routes et zones des autres
  missions apparaissent et disparaissent selon leur créneau.
- **Calque de couverture** : vert = déjà couvert sur le créneau, gris = personne. C'est le
  produit — le pilote va dans le gris.
- Tracé de la route par appuis successifs, zones en cercle ou en polygone, ETA calculées à
  partir d'une vitesse sol saisie.
- Avertissement en cas de conflit espace + temps avec une autre mission (< 5 NM et < 15 min).

### 5.7 Confidentialité

Position temps réel des avions : **hors périmètre**. On partage des intentions — des plans —
et des feux, pas la trajectoire des pilotes. Un partage en direct, optionnel et explicitement
consenti, ne pourra venir que si les coordinateurs le demandent.

---

## 6. Données personnelles

État actuel (F1) : **aucune donnée ne quitte le téléphone**. Nom, immatriculation, fréquence
et positions sont stockés localement et ne partent que dans le SMS que l'utilisateur rédige
et envoie depuis sa propre messagerie.

Ce qui devra être en place avant la première remontée au serveur (F2) :

- **Base légale et registre** — nom, téléphone, immatriculation et positions constituent des
  données de localisation rattachées à une personne identifiée.
- **Rétention** — plans de vol 12 mois, signalements 3 ans (valeur de preuve et
  statistique), traces GPS brutes non conservées côté serveur.
- **Hébergement** dans l'Union européenne.
- **Mise à jour de la déclaration de confidentialité** des magasins d'applications, qui
  déclare aujourd'hui l'absence de collecte — voir
  [02-ios-app-store.md §5.2](02-ios-app-store.md).

L'application affiche au premier lancement des conditions d'utilisation versionnées : elle
est un outil d'aide au signalement, ne garantit ni la transmission ni la prise en compte de
l'alerte, et ne se substitue ni au 18/112 ni à la radio.

---

## 7. Feuille de route

| Phase | Contenu | État |
|---|---|---|
| **1. MVP alerte (Android / FR)** | Carte embarquée + OpenAIP, GPS natif, profil, marque verticale et pointage carte, carroyage DFCI hors ligne, composeur SMS, consignes, feux et suivis sur la carte, historique local | **fait** |
| **2. Serveur** | Feux partagés entre pilotes, relais de tuiles, comptes, remontée différée | à faire |
| **3. Planification** | Dépôt de plans, curseur temporel, calque de couverture, détection de conflits | à faire |
| **4. Espagne** | i18n `fr`/`es`, table des canaux par communauté autonome, gabarit de message | à faire |
| **5. Consolidation** | iOS et TestFlight, cartes hors ligne, photo du feu, export post-vol, position approximative (cf. [02-ios-app-store.md §7](02-ios-app-store.md)) | à faire |

---

## 8. Sources

- [Le 114 — handicap.gouv.fr](https://handicap.gouv.fr/le-114-le-numero-durgence-pour-personnes-sourdes-ou-malentendantes)
- [Urgence 114 — site officiel du service](https://info.urgence114.fr/)
- [My112 — application des services 112 en Espagne](http://prevenfoc.es/my112-app-emergencias/)
- [APP GVA 112 Avisos — Generalitat Valenciana](https://www.112cv.gva.es/es/app-gva-112-avisos)
- [Incendios forestales — Comunidad de Madrid](https://www.comunidad.madrid/seguridad-emergencias-asem-112/incendios-forestales)
