# VigiAero — Plan produit & technique

> Application mobile (Expo / React Native) permettant aux pilotes privés en vol de faire de
> la vigilance feux de forêt : alerte d'urgence en un geste, et planification/déconfliction
> des vols d'observation.
>
> Rédigé le 26/07/2026. Cible initiale : Android (France), puis iOS, puis Espagne.
>
> **Mise à jour du 26/07/2026 au soir** — le MVP de la fonction F1 est construit
> et compilé en APK. Décisions arrêtées par le porteur du projet, qui assume la
> responsabilité juridique à ce stade : destination **114** seule, **pas** de
> lien Google Maps (l'alerte doit partir sans couverture data), **pas** de
> référentiel communes — les CODIS travaillent au **carroyage DFCI**, complété
> des degrés décimaux. Voir [README](../README.md) pour l'état livré, et §4.2
> ci-dessous pour le format de message effectivement retenu.

---

## 1. Périmètre

| # | Fonction | Phase |
|---|---|---|
| F1 | Alerte feu en un geste → SMS pré-rempli vers le 114 (FR) | MVP |
| F2 | Planification de vol + zones d'observation partagées + déconfliction | V2 |
| F3 | Extension Espagne (i18n `es`, routage 112 régional, API My112 si accord) | V3 |
| F4 | iOS, cartes hors-ligne, export post-vol vers SDIS/association | V4 |

**Hors périmètre explicite** : détection automatique de feu, remplacement d'un moyen
d'alerte officiel, coordination opérationnelle des moyens de lutte.

---

## 2. Points bloquants à valider AVANT d'écrire du code

Ces trois points conditionnent la viabilité de F1. Ils sont d'ordre juridique/conventionnel,
pas technique — mais ils peuvent changer la cible du message.

### 2.1 Le 114 n'est pas un canal SMS d'urgence généraliste ⚠️

Le 114 est le numéro d'urgence **réservé aux personnes sourdes, malentendantes,
sourdaveugles, aphasiques et dysphasiques** — c'est-à-dire aux personnes en difficulté
pour entendre ou parler. Il est également ouvert aux personnes en incapacité momentanée de
parler (aphasie soudaine, panique extrême post-accident). Ce n'est pas, en l'état, un canal
« SMS vers les secours » ouvert à tous.

Un pilote en vol n'entre pas dans la cible officielle du service. Envoyer massivement des
signalements de feux au 114 sans accord préalable, c'est :
- risquer de saturer un service dimensionné pour un public spécifique ;
- risquer un rejet/blocage du service, donc une alerte qui n'arrive pas.

**Actions préalables (Phase 0)** :
1. Écrire au **CNR 114** (Centre National de Relais, CHU Grenoble) pour exposer le cas
   d'usage « pilote en vol, cabine bruyante, appel vocal impossible » et demander un avis
   écrit. Un pilote au casque, moteur en marche, ne *peut pas* physiquement tenir une
   conversation téléphonique — c'est l'argument central.
2. En parallèle, ouvrir une **convention avec un ou deux SDIS pilotes** (départements à
   risque : 13, 83, 84, 06, 34, 30, 66, 2A/2B). Un CODIS peut fournir un numéro de portable
   de salle opérationnelle acceptant les SMS — c'est souvent la voie la plus rapide et la
   plus fiable.
3. Rapprochement **FFA / fédération** et associations existantes de guet aérien bénévole
   pour capitaliser sur les conventions déjà signées.

**Conséquence d'architecture** : le destinataire de l'alerte ne doit **jamais** être codé en
dur. Voir §5.3 (« canaux d'alerte » configurables par zone géographique).

### 2.2 Usage du téléphone en vol

L'usage du réseau mobile à bord d'un aéronef en vol est encadré (mode avion attendu, et
la couverture réseau est de toute façon aléatoire en altitude). Deux conséquences produit :

- Le message doit pouvoir être **composé hors ligne**, mis en file d'attente, et parti dès
  que le réseau revient — avec un état visuel non ambigu (`EN ATTENTE RÉSEAU` / `ENVOYÉ`).
- L'app doit rappeler dans son onboarding que **la voie primaire de signalement en vol
  reste la radio** (FIS / organisme ATC en contact) et que le SMS est un complément
  fournissant les coordonnées exactes, pas un substitut.

À faire valider par l'assurance de l'association / le club porteur.

### 2.3 Envoi SMS programmatique impossible sur les stores

- **Android** : la permission `SEND_SMS` (envoi silencieux) est réservée par la Play Store
  policy aux applications SMS par défaut. Une app tierce qui la demande est rejetée.
- **iOS** : aucun envoi SMS programmatique, quelle que soit la configuration.

⇒ Le « un clic » réel est : **1 appui dans VigiAero → la fenêtre SMS native s'ouvre
pré-remplie (destinataire + texte) → 1 appui sur Envoyer**. Deux gestes, dont le second est
imposé par les stores. C'est aussi une sécurité anti-fausse-alerte, donc ce n'est pas un
mauvais compromis — mais il faut le concevoir ainsi dès le départ (module `expo-sms`).

**Avantage à conserver** : le SMS fonctionne sans data, sur du réseau dégradé, et la réponse
du 114/CODIS arrive sur le numéro du pilote → dialogue possible. Un relais serveur (l'app
envoie à un backend qui envoie le SMS) casserait ce dialogue : à écarter comme canal
primaire, à garder comme canal de secours/duplication.

---

## 3. Architecture générale

Dépôt autonome (VigiAero n'est pas un module Cumulus), mais qui **réutilise les briques
éprouvées de Cumulus** — notamment toute la mécanique carte.

```
VigiAero/
├── apps/mobile/          # Expo SDK 57 / RN 0.86 / expo-router / NativeWind / zustand
│   ├── app/              # routes : (tabs)/carte, (tabs)/plan, (tabs)/historique, profil
│   ├── assets/map/       # map.html + leaflet (bundlé, fonctionne hors ligne)
│   └── src/{components,lib,api,stores,db}
├── backend/              # NestJS 11 + PostgreSQL 16 + PostGIS (F2 uniquement)
├── shared/               # types + formatage coordonnées + template message (testés)
└── docs/
```

**Pourquoi ce stack** : strictement celui de Cumulus (Expo 57, expo-router, NativeWind,
react-query, zustand, NestJS/TypeORM/Postgres). Zéro coût d'apprentissage, patterns et
composants (`Button`, `Text`, `TextInput`, `theme.ts`) directement transposables, et
déploiement possible sur l'infra Scaleway existante avec une base séparée.

### 3.1 La carte — réutilisation directe de l'ops map Cumulus

L'ops map Cumulus n'est pas du natif : c'est **Leaflet dans une WebView**
(`apps/mobile/src/components/inflight/OpsMapTab.tsx`), pointant sur la route SPA
`/m/inflight-map`. Pour VigiAero on garde le principe mais on **embarque le HTML dans
l'app** (pas de dépendance au serveur Cumulus, fonctionne hors ligne, pas d'auth à injecter).

Fichiers Cumulus à copier/adapter :

| Source Cumulus | Usage VigiAero |
|---|---|
| `apps/mobile/src/lib/webShell.ts` → `NATIVE_GEOLOCATION_SHIM`, `ANTI_FLICKER_JS` | Le shim geoloc est **indispensable** : l'API Geolocation d'une WebView sur origine locale/http est bloquée ; la position vient d'`expo-location` et est injectée. L'anti-flicker règle le clignotement des tuiles au pinch-zoom Android. |
| `apps/mobile/src/lib/useWebViewGeolocation.ts` | Pont GPS natif → WebView, avec rejeu du dernier fix au `onLoadEnd`. |
| `frontend/src/lib/mapTiles.ts` | URLs fond de carte OSM (clair) / CartoDB dark + attributions. |
| `backend/src/preflight/pre-flight.service.ts:1214` | URL du **calque raster OpenAIP** déjà utilisée : `https://{s}.api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=…` |

**Couches VigiAero (volontairement minimales)** :
1. Fond OSM (clair) / CartoDB Dark Matter (nuit).
2. **Un seul calque OpenAIP raster** en overlay — conformément à la demande : pas de
   polygones GeoJSON, pas de filtrage 3D par limites verticales. On n'utilise donc **pas**
   `frontend/src/lib/openaipAirspacesLayer.ts` (rendu vectoriel canvas avec filtres
   d'altitude), qui est plus lourd et sans intérêt ici.
3. Position propre (avion) + trace.
4. Marqueurs de feux signalés (session locale + partagés en V2).
5. En V2 : routes et zones d'observation des autres vols planifiés.

⚠️ La clé API OpenAIP est actuellement **en dur dans le dépôt Cumulus**. Pour VigiAero :
clé dédiée, passée par `app.config.ts` / variable EAS, et rotation de la clé Cumulus à
prévoir (à signaler côté Cumulus).

**Hors ligne** : prévoir dès la conception un `TileLayer` custom lisant d'abord un cache
disque (`expo-file-system`), alimenté par un pré-téléchargement de zone choisie au sol
(« préparer ma zone »). Implémentation en Phase 4, mais l'abstraction dès la Phase 1.

---

## 4. F1 — Alerte feu

### 4.1 Parcours utilisateur

Écran carte, en vol, plein soleil, une main disponible :

- **Bouton « MARQUE VERTICALE »** (gros, en bas, pouce droit) : capture le fix GPS **à
  l'instant de l'appui** (horodaté), c'est-à-dire la position de l'avion à la verticale du
  feu. À 100 kt on parcourt ~50 m/s : le fix doit être pris sur l'événement `onPressIn`, pas
  après le rendu de l'écran suivant.
- **Ou appui long sur la carte** : extraction des coordonnées du point pointé (bridge
  `postMessage` WebView → natif). Utile quand on ne peut pas survoler à la verticale.
- Écran de confirmation en **une page, 4 champs pré-remplis** :
  - Type : `FEU DE FORÊT` / `FEU DE VÉGÉTATION` / `FEU DE BÂTIMENT` / `FUMÉE, ORIGINE
    INDÉTERMINÉE` (4 gros boutons, sélection = 1 appui) ;
  - Ampleur estimée (optionnel, 3 boutons : `DÉBUTANT` / `EN COURS` / `IMPORTANT`) ;
  - Position (modifiable, affichée dans les 3 formats) ;
  - Identité pilote/avion/fréquence (issue du profil, jamais à ressaisir).
- **Bouton ENVOYER** → ouverture du composeur SMS natif pré-rempli → appui « Envoyer ».
- Retour dans l'app : la fiche passe en `TRANSMIS` et est archivée dans l'historique local.

Ergonomie : mode « cockpit » (police large, contraste élevé, cibles tactiles ≥ 60 dp,
écran maintenu allumé, pas de dialogue modal fermable par erreur), verrouillage anti-appui
accidentel (appui maintenu 0,5 s sur le bouton d'alerte).

### 4.2 Contenu du message

Le message doit être **exploitable par un opérateur de CODIS**. Trois exigences qui priment
sur l'exhaustivité :

1. Le **carroyage DFCI** d'abord. C'est le référentiel de travail des CODIS pour les feux
   de forêt ; les degrés décimaux viennent en complément (et servent à tout autre
   destinataire). Ni degrés-minutes ni degrés-minutes-secondes : ils n'apportent rien ici
   et coûtent des caractères.
2. La **contrainte des 160 caractères** : au-delà, le SMS est découpé en segments dont le
   réassemblage et l'ordre d'arrivée ne sont pas garantis chez le destinataire.
   ⇒ **un seul segment**, garanti par construction (voir plus bas).
3. **ASCII strict** : un seul caractère hors GSM-7 (é, °, ') fait basculer le SMS en UCS-2
   et **réduit le segment à 70 caractères**.

**Message livré**

```
FEU DE FORET IMPORTANT vu d avion
DFCI KD44F0
43.52970N 005.44740E
S.BESNIER F-GXYZ radio 123.500
1432UTC 3500ft GPS
En vol, ne peux pas parler
```
143 caractères, 1 segment.

**Garantie du segment unique** : le message est assemblé par priorité. Les lignes
essentielles — nature du feu, DFCI, degrés décimaux, identité, heure — partent toujours ;
les lignes de confort (« point relevé sur carte », « en vol, ne peux pas parler ») ne sont
ajoutées que tant que le total reste sous 160 caractères, et l'écran de confirmation
affiche ce qui a été écarté. Un nom d'observateur long ne peut donc pas transformer
l'alerte en deux SMS.

**Le carroyage DFCI, hors ligne.** Le shapefile officiel `CARRO_DFCI_2X2_L93`
(339 264 mailles) est trop lourd à embarquer, et coder à la main la chaîne
WGS84 → NTF → Lambert II étendu, c'est trois occasions de se tromper de paramètre de datum
sans le voir. La grille est donc **dérivée du fichier source** : la reprojection
conique→conique étant conforme, elle se ramène à une similitude sur l'emprise d'un carré de
100 km, et l'on ajuste par moindres carrés une affine par carré. Résultat : **11 Ko
embarqués**, résidu maximal 4,47 m pour une maille de 2 000 m, et les 339 264 mailles du
fichier reconstruites à l'identique. Vérification rejouable : `node tools/test-dfci.js`.

**Champs du modèle de données** (`src/lib/storage.ts`) :
`at`, `lat`, `lon`, `altitudeM`, `fireType`, `severity`, `source` (verticale ou pointage
carte), `dfci`, `text`, `state`.

**Décision prise** : pas de lien Google Maps dans le SMS. Il suppose une data au CODIS et
coûterait un tiers de segment, alors que l'exigence première est de pouvoir alerter sans
couverture data.

### 4.3 Canaux d'alerte (abstraction centrale)

```ts
type AlertChannel = {
  id: string;                    // 'fr-114' | 'fr-sdis-13' | 'es-112-cv' | …
  label: string;
  country: 'FR' | 'ES';
  bbox?: GeoJSON.BBox;           // zone de compétence
  transport: 'sms' | 'voice' | 'api' | 'relay';
  recipient: string;             // '114', '+33…', endpoint
  template: 'fr-compact' | 'es-compact' | …;
  maxSegments: number;
};
```

Table livrée avec l'app, **rafraîchissable depuis le backend** sans mise à jour store
(important : un numéro de CODIS peut changer). Sélection automatique par position, avec
surcharge manuelle. Toujours afficher en clair « Alerte envoyée à : … » avant l'envoi.

Canal « **secours vocal** » : bouton d'appel direct 112/18 toujours visible, car c'est la
procédure de référence dès que le pilote est au sol ou peut parler.

### 4.4 Tests critiques

Le formatage des coordonnées et la génération du message sont du **code sûreté** : couverture
unitaire à 100 % dans `shared/`, incluant hémisphère sud, longitudes ouest, passage
59,999′, arrondis DMS, plafonnement 160/70 caractères, absence de caractères non GSM-7.

---

## 5. F2 — Planification & déconfliction

### 5.1 Besoin

Un pilote prépare son vol la veille : il veut voir **qui survole quoi, et quand**, pour
choisir une route et des zones que personne ne couvre sur son créneau.

### 5.2 Modèle de données (PostgreSQL + PostGIS)

### 5.1 bis — Feux partagés (demandé le 27/07/2026)

Les feux signalés sont déjà reportés sur la carte du téléphone qui les a émis, avec l'heure
du signalement, et un appui sur le marqueur rouvre la fiche pour un message de suivi. La
suite consiste à **remonter ces alertes au serveur pour les rendre visibles par tous les
utilisateurs**, avec date et heure.

Ce que cela apporte, au-delà du confort : un pilote qui arrive sur zone voit qu'un feu est
déjà signalé et **n'envoie pas un doublon au 114**. C'est l'argument le plus solide à
présenter aux services de secours.

Points à trancher au moment de le faire :
- **durée de vie d'un marqueur** : un feu signalé à 14 h n'a plus d'intérêt le lendemain ;
  proposer une extinction automatique (par exemple 12 h) plus l'état « maîtrisé » ;
- **confiance** : n'importe qui pouvant poser un marqueur, prévoir au minimum un compte
  identifié et la possibilité pour un coordinateur de retirer un signalement erroné ;
- **hors ligne** : la remontée doit être différée et rejouée, jamais bloquante pour
  l'alerte SMS elle-même.

### 5.2 Modèle de données

```
pilot(id, name, email, phone, org_id, …)
aircraft(id, registration, type, default_freq, owner_pilot_id)
mission(id, pilot_id, aircraft_id, dep_aerodrome, window tstzrange,
        radio_freq, status ∈ planned|flying|done|cancelled, remarks)
mission_leg(mission_id, seq, geom LINESTRING, eta_start, eta_end, alt_ft)
observation_zone(id, mission_id, geom POLYGON, window tstzrange, label)
fire_report(id, pilot_id, mission_id?, geom POINT, fire_type, severity,
            reported_at, channel_used, delivery_state)
```

- Index GiST sur toutes les géométries + `tstzrange` ; le conflit = `ST_Intersects(a,b)
  AND a.window && b.window`.
- Couverture / trous : grille H3 (résolution 6 ≈ 36 km²) sur la région ; une cellule est
  « couverte » si une zone d'observation active l'intersecte sur la fenêtre demandée.

### 5.3 Relais de tuiles OpenAIP

À prévoir en même temps que le serveur, pour la mise en accès libre (voir README, section
« Clé OpenAIP ») : un point d'entrée `/tiles/openaip/{z}/{x}/{y}.png` qui détient la clé et
relaie la requête. C'est la seule façon de ne pas diffuser la clé avec l'application. Un
cache disque devant le relais réduit fortement le trafic sortant — les pilotes d'une même
région demandent les mêmes tuiles.

### 5.4 API

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/missions?bbox&from&to` | Missions des autres (lecture régionale) |
| `GET` | `/coverage?bbox&from&to&res` | Cellules couvertes / non couvertes |
| `POST` | `/missions` | Dépôt d'un plan (route + zones + créneaux) |
| `PATCH` | `/missions/:id` | Décalage horaire, annulation, statut « en vol » |
| `POST` | `/fire-reports` | Journalisation du signalement (après envoi SMS) |
| `GET` | `/alert-channels` | Table des canaux, versionnée |

Auth JWT (email + mot de passe, ou lien magique), rôles `pilot` / `coordinator`
(association, SDIS invité) / `admin`.

### 5.5 UX de planification

- Carte + **curseur temporel** (slider horaire sur la journée) : on fait défiler l'heure, les
  routes et zones des autres missions apparaissent/disparaissent selon leur créneau.
- Superposition d'un **calque de couverture** : vert = déjà couvert sur le créneau, gris =
  personne. C'est ça, le produit — le pilote va dans le gris.
- Tracé de sa route (appuis successifs) + dessin de zones (cercle rayon N NM, ou polygone),
  calcul automatique des ETA à partir d'une vitesse sol saisie.
- Avertissement si conflit espace + temps avec une autre mission (< 5 NM et < 15 min).
- Publication → visible par tous ; notification aux missions en conflit.

### 5.6 Confidentialité

Position temps réel des avions : **hors périmètre V2** (surveillance des pilotes,
complexité, données sensibles). On partage des **intentions** (plans), pas du live. Un
partage live optionnel et explicitement consenti pourra venir en V4 si les coordinateurs
SDIS le demandent.

---

## 6. RGPD, sécurité, responsabilité

- **Données personnelles** : nom, téléphone, immatriculation, positions (= données de
  localisation d'une personne identifiée). Base légale : intérêt légitime / mission
  d'intérêt public selon le montage associatif. Registre de traitement + notice
  d'information obligatoires ; les gabarits DPIA de Cumulus (`docs/05-dm-dpia.md`) sont
  réutilisables.
- **Rétention** : plans de vol 12 mois, signalements 3 ans (valeur de preuve/statistique),
  traces GPS brutes non conservées côté serveur.
- **Hébergement** UE (Scaleway, comme Cumulus).
- **Responsabilité** : CGU explicites — VigiAero est un outil d'aide au signalement, ne
  garantit ni la transmission ni la prise en compte de l'alerte, et ne se substitue pas au
  112/18 ni à la radio. Écran d'acceptation au premier lancement, versionné.
- **Anti-fausse-alerte** : appui maintenu, écran de confirmation avec récapitulatif,
  compteur de signalements par vol, et journalisation locale horodatée.

---

## 7. Feuille de route

| Phase | Contenu | Charge dev | Dépendances |
|---|---|---|---|
| **0. Cadrage** | Courrier CNR 114, contact SDIS pilote, FFA, montage juridique, clé OpenAIP dédiée | — | Tiers (2–6 semaines calendaires) |
| **1. MVP alerte (Android/FR)** | Squelette Expo, carte WebView + OpenAIP, GPS natif, profil, marque verticale + point carte, formateur coordonnées testé, composeur SMS, file d'attente hors ligne, historique local, CGU | ~3 semaines | Aucune (peut démarrer en parallèle de la Phase 0) |
| **2. Planification** | Backend Nest + PostGIS, auth, dépôt de plan, curseur temporel, calque de couverture, détection de conflits, sync des signalements | ~4 semaines | Phase 1 |
| **3. Espagne** | i18n `fr`/`es`, table des canaux par comunidad, municipios hors ligne, gabarit de message ES, démarches My112 / 112 régionaux | ~2 semaines + démarches | Phase 1 |
| **4. Consolidation** | Build iOS + TestFlight, cartes hors ligne (pré-téléchargement de zone), photo du feu (upload différé + lien court), export post-vol PDF/CSV pour SDIS/association, décalage relèvement/distance (« feu à 3 NM au 090 ») | ~3 semaines | Phases 1–2 |

Estimations en développement effectif (un développeur assisté), hors délais tiers.

---

## 8. Décisions arrêtées (26/07/2026)

| Question | Décision |
|---|---|
| Porteur juridique | Assumée à titre personnel par le porteur du projet pour la mise en service immédiate. À reprendre (association / convention) dès que la saison le permet. |
| Destinataire | **114 seul** pour l'instant ; démarches API et conventions CODIS ensuite. La destination est une constante unique dans le code. |
| Lien Google Maps | **Non** — l'alerte doit partir sans couverture data. |
| Référentiel de position | **DFCI + degrés décimaux**, rien d'autre. Pas de commune, pas de DM ni DMS. |
| Lien Cumulus | Applications **dissociées**. On reprend de Cumulus ce qui fait gagner du temps (principe de la carte en WebView, shim de géolocalisation, calque OpenAIP raster), sans dépendance de code ni de serveur. |

Restent ouverts, à traiter hors urgence : courrier au CNR 114, convention avec un CODIS,
assurance, RGPD (§6), clé OpenAIP dédiée.

---

## 9. Sources

- [Le 114 — handicap.gouv.fr](https://handicap.gouv.fr/le-114-le-numero-durgence-pour-personnes-sourdes-ou-malentendantes)
- [Urgence 114 — site officiel du service](https://info.urgence114.fr/)
- [Le 114, numéro d'urgence — Ministère de l'Intérieur](https://www.interieur.gouv.fr/Archives/Archives-des-dossiers-de-presse/Le-114-numero-d-urgence-pour-les-personnes-sourdes-et-malentendantes)
- [My112 — application officielle des services 112 en Espagne](http://prevenfoc.es/my112-app-emergencias/)
- [APP GVA 112 Avisos — Generalitat Valenciana](https://www.112cv.gva.es/es/app-gva-112-avisos)
- [Incendios forestales — Comunidad de Madrid](https://www.comunidad.madrid/seguridad-emergencias-asem-112/incendios-forestales)
