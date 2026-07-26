/**
 * Applique la configuration de signature de release au projet Android généré.
 *
 * `expo prebuild` régénère android/ à partir d'un gabarit, dans lequel la
 * variante release est signée avec la clé de debug — un APK signé par cette clé
 * ne peut pas être mis à jour proprement d'un poste à l'autre. Ce script est
 * idempotent : à relancer après chaque prebuild.
 *
 * Lancement : node tools/apply-signing.js
 */
const fs = require('fs');
const path = require('path');

const MOBILE = path.join(__dirname, '..', 'apps', 'mobile');
const ANDROID = path.join(MOBILE, 'android');
const GRADLE = path.join(ANDROID, 'app', 'build.gradle');
const PROPS = path.join(ANDROID, 'gradle.properties');
// La clé vit HORS de android/ : ce dossier est régénéré par `expo prebuild`,
// qui emporterait la clé avec lui. Perdre la clé de signature signifie que les
// mises à jour ne s'installent plus par-dessus la version précédente.
const KEYSTORE_SRC = path.join(MOBILE, 'keystore', 'vigiaero-release.keystore');
const KEYSTORE_DST = path.join(ANDROID, 'app', 'vigiaero-release.keystore');

if (!fs.existsSync(GRADLE)) {
    console.error('android/ absent — lancez d’abord : npx expo prebuild --platform android');
    process.exit(1);
}
if (!fs.existsSync(KEYSTORE_SRC)) {
    console.error(
        'Clé de signature absente. Générez-la avec :\n' +
            '  keytool -genkeypair -v -storetype PKCS12 \\\n' +
            '    -keystore apps/mobile/keystore/vigiaero-release.keystore \\\n' +
            '    -alias vigiaero -keyalg RSA -keysize 2048 -validity 10000',
    );
    process.exit(1);
}
fs.mkdirSync(path.dirname(KEYSTORE_DST), { recursive: true });
fs.copyFileSync(KEYSTORE_SRC, KEYSTORE_DST);

let gradle = fs.readFileSync(GRADLE, 'utf8');

if (!gradle.includes('vigiaeroRelease')) {
    gradle = gradle.replace(
        /(signingConfigs \{\s*\n)/,
        `$1        vigiaeroRelease {
            storeFile file(VIGIAERO_STORE_FILE)
            storePassword VIGIAERO_STORE_PASSWORD
            keyAlias VIGIAERO_KEY_ALIAS
            keyPassword VIGIAERO_KEY_PASSWORD
        }
`,
    );
}

// La variante release du gabarit Expo pointe sur la clé de debug.
gradle = gradle.replace(
    /(release \{\s*\n(?:\s*\/\/[^\n]*\n)*\s*)signingConfig signingConfigs\.debug/,
    '$1signingConfig signingConfigs.vigiaeroRelease',
);

if (!gradle.includes('signingConfigs.vigiaeroRelease')) {
    console.error('Impossible de rattacher la clé à la variante release — build.gradle inattendu.');
    process.exit(1);
}
fs.writeFileSync(GRADLE, gradle, 'utf8');

let props = fs.readFileSync(PROPS, 'utf8');
if (!props.includes('VIGIAERO_STORE_FILE')) {
    props +=
        '\n# Signature de release VigiAero (voir tools/apply-signing.js).\n' +
        '# Mot de passe volontairement en clair : cette clé ne protège pas un\n' +
        '# compte Play Store, elle garantit seulement la continuité des mises à\n' +
        '# jour entre deux APK installés à la main.\n' +
        'VIGIAERO_STORE_FILE=vigiaero-release.keystore\n' +
        'VIGIAERO_STORE_PASSWORD=vigiaero2026\n' +
        'VIGIAERO_KEY_ALIAS=vigiaero\n' +
        'VIGIAERO_KEY_PASSWORD=vigiaero2026\n';
    fs.writeFileSync(PROPS, props, 'utf8');
}

console.log('Signature de release appliquée.');
