/**
 * Correctifs appliqués au projet Android généré : signature de release, et
 * retrait des permissions inutilisées.
 *
 * `expo prebuild` régénère android/ à partir d'un gabarit, dans lequel :
 *  - la variante release est signée avec la clé de debug — un APK signé par
 *    cette clé ne peut pas être mis à jour proprement d'un poste à l'autre ;
 *  - le manifeste hérite de permissions déclarées par le cœur de React Native
 *    et jamais utilisées ici, dont SYSTEM_ALERT_WINDOW (« afficher par-dessus
 *    les autres applications »), qui est visible par l'utilisateur sur la fiche
 *    du magasin et attire les questions en revue.
 *
 * `android.blockedPermissions` dans app.json fait le même travail, mais suppose
 * que le prebuild aboutisse. Le faire ici aussi rend le résultat indépendant de
 * cette étape. Le script est idempotent : à relancer après chaque prebuild.
 *
 * Lancement : node tools/apply-signing.js
 */
const fs = require('fs');
const path = require('path');

const MOBILE = path.join(__dirname, '..', 'apps', 'mobile');
const ANDROID = path.join(MOBILE, 'android');
const GRADLE = path.join(ANDROID, 'app', 'build.gradle');
const PROPS = path.join(ANDROID, 'gradle.properties');
const MANIFEST = path.join(ANDROID, 'app', 'src', 'main', 'AndroidManifest.xml');

/** Permissions héritées de React Native, dont AeroVigi ne se sert pas. */
const UNUSED_PERMISSIONS = [
    'android.permission.SYSTEM_ALERT_WINDOW',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.VIBRATE',
];
// La clé vit HORS de android/ : ce dossier est régénéré par `expo prebuild`,
// qui emporterait la clé avec lui. Perdre la clé de signature signifie que les
// mises à jour ne s'installent plus par-dessus la version précédente.
const KEYSTORE_SRC = path.join(MOBILE, 'keystore', 'aerovigi-release.keystore');
const KEYSTORE_DST = path.join(ANDROID, 'app', 'aerovigi-release.keystore');

if (!fs.existsSync(GRADLE)) {
    console.error('android/ absent — lancez d’abord : npx expo prebuild --platform android');
    process.exit(1);
}
if (!fs.existsSync(KEYSTORE_SRC)) {
    console.error(
        'Clé de signature absente. Générez-la avec :\n' +
            '  keytool -genkeypair -v -storetype PKCS12 \\\n' +
            '    -keystore apps/mobile/keystore/aerovigi-release.keystore \\\n' +
            '    -alias vigiaero -keyalg RSA -keysize 2048 -validity 10000\n' +
            '  (alias historique conservé : voir plus bas)',
    );
    process.exit(1);
}
fs.mkdirSync(path.dirname(KEYSTORE_DST), { recursive: true });
fs.copyFileSync(KEYSTORE_SRC, KEYSTORE_DST);

let gradle = fs.readFileSync(GRADLE, 'utf8');

if (!gradle.includes('aerovigiRelease')) {
    gradle = gradle.replace(
        /(signingConfigs \{\s*\n)/,
        `$1        aerovigiRelease {
            storeFile file(AEROVIGI_STORE_FILE)
            storePassword AEROVIGI_STORE_PASSWORD
            keyAlias AEROVIGI_KEY_ALIAS
            keyPassword AEROVIGI_KEY_PASSWORD
        }
`,
    );
}

// La variante release du gabarit Expo pointe sur la clé de debug.
gradle = gradle.replace(
    /(release \{\s*\n(?:\s*\/\/[^\n]*\n)*\s*)signingConfig signingConfigs\.debug/,
    '$1signingConfig signingConfigs.aerovigiRelease',
);

if (!gradle.includes('signingConfigs.aerovigiRelease')) {
    console.error('Impossible de rattacher la clé à la variante release — build.gradle inattendu.');
    process.exit(1);
}
fs.writeFileSync(GRADLE, gradle, 'utf8');

let props = fs.readFileSync(PROPS, 'utf8');
if (!props.includes('AEROVIGI_STORE_FILE')) {
    props +=
        '\n# Signature de release AeroVigi (voir tools/apply-signing.js).\n' +
        '# Mot de passe volontairement en clair : cette clé ne protège pas un\n' +
        '# compte Play Store, elle garantit seulement la continuité des mises à\n' +
        '# jour entre deux APK installés à la main.\n' +
        // L'alias et le mot de passe sont ceux inscrits DANS le fichier de clé,
        // créé avant le changement de nom : ils restent « vigiaero ». Les
        // renommer ici casserait la signature. Seuls les noms de propriétés et
        // le nom du fichier suivent le nouveau nom de l'application.
        'AEROVIGI_STORE_FILE=aerovigi-release.keystore\n' +
        'AEROVIGI_STORE_PASSWORD=vigiaero2026\n' +
        'AEROVIGI_KEY_ALIAS=vigiaero\n' +
        'AEROVIGI_KEY_PASSWORD=vigiaero2026\n';
    fs.writeFileSync(PROPS, props, 'utf8');
}

console.log('Signature de release appliquée.');

// --- Version ----------------------------------------------------------------
// `versionName` et `versionCode` viennent de build.gradle, figé au dernier
// prebuild : modifier `version` dans app.json ne suffit donc pas à changer la
// version de l'APK. On les resynchronise ici.
//
// `versionCode` est dérivé du numéro de version (0.1.1 → 10101) : Play exige
// qu'il augmente strictement à chaque téléversement, et une valeur calculée
// évite de l'oublier.
{
    const appJson = JSON.parse(fs.readFileSync(path.join(MOBILE, 'app.json'), 'utf8'));
    const version = appJson.expo.version;
    const [maj, min, pat] = version.split('.').map((n) => parseInt(n, 10) || 0);
    const code = maj * 10000 + min * 100 + pat;

    let g = fs.readFileSync(GRADLE, 'utf8');
    const before = g;
    g = g.replace(/versionCode\s+\d+/, `versionCode ${code}`);
    g = g.replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
    if (g === before && !g.includes(`versionName "${version}"`)) {
        console.error('Impossible de fixer la version — build.gradle inattendu.');
        process.exit(1);
    }
    fs.writeFileSync(GRADLE, g, 'utf8');
    console.log(`Version fixée : ${version} (versionCode ${code}).`);
}

// --- Retrait des permissions inutilisées ------------------------------------
if (fs.existsSync(MANIFEST)) {
    let manifest = fs.readFileSync(MANIFEST, 'utf8');

    // Supprimer la ligne ne suffit pas : la fusion de manifestes réinjecte les
    // permissions déclarées par les bibliothèques (c'est le cas des permissions
    // de stockage). Il faut un marqueur tools:node="remove", qui indique au
    // fusionneur d'écarter la déclaration d'où qu'elle vienne.
    const marker = (perm) => `  <uses-permission android:name="${perm}" tools:node="remove"/>`;
    const lineOf = (perm) =>
        new RegExp(
            `[ \\t]*<uses-permission[^>]*android:name="${perm.replace(/\./g, '\\.')}"[^>]*/>\\r?\\n?`,
            'g',
        );

    for (const perm of UNUSED_PERMISSIONS) manifest = manifest.replace(lineOf(perm), '');
    const markers = UNUSED_PERMISSIONS.map(marker).join('\n');
    manifest = manifest.replace(/(<manifest[^>]*>\r?\n)/, `$1${markers}\n`);

    fs.writeFileSync(MANIFEST, manifest, 'utf8');
    console.log(
        `Permissions inutilisées écartées : ${UNUSED_PERMISSIONS.map((p) =>
            p.replace('android.permission.', ''),
        ).join(', ')}.`,
    );
} else {
    console.error('AndroidManifest.xml introuvable — permissions non vérifiées.');
    process.exit(1);
}
