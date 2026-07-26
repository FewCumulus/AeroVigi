/**
 * Passerelle de test : Node exige une extension explicite dans les imports
 * ESM, Metro non. Plutôt que de tordre le code de l'app pour le testeur, on
 * duplique l'arborescence src/ dans un dossier temporaire — l'arborescence
 * étant conservée, les chemins relatifs restent valides — en ajoutant la seule
 * extension manquante. Le code testé est donc bien celui de l'application.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'apps', 'mobile', 'src');
const MIRROR = path.join(__dirname, '..', 'apps', 'mobile', `.src-nodetest-${process.pid}`);

function copyRewrite(from, to) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const a = path.join(from, entry.name);
        const b = path.join(to, entry.name);
        if (entry.isDirectory()) copyRewrite(a, b);
        else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
            const code = fs
                .readFileSync(a, 'utf8')
                .replace(/from '(\.[^']*?)'/g, (m, p) => `from '${p}.ts'`);
            fs.writeFileSync(b, code, 'utf8');
        }
    }
}

let mounted = false;

/** Importe un module de src/ (chemin relatif à src, ex. 'lib/message.ts'). */
async function importApp(relPath) {
    if (!mounted) {
        fs.rmSync(MIRROR, { recursive: true, force: true });
        copyRewrite(SRC, MIRROR);
        mounted = true;
        process.on('exit', () => fs.rmSync(MIRROR, { recursive: true, force: true }));
    }
    const target = path.join(MIRROR, relPath).replace(/\\/g, '/');
    return import('file:///' + target);
}

module.exports = { importApp };
