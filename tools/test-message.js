/**
 * Vérification du formateur de coordonnées et du constructeur de message.
 * C'est le code qui décide de ce que les secours vont lire : il doit être
 * exact sur les cas limites, pas seulement sur le cas nominal.
 *
 * Lancement : node tools/test-message.js
 */
const fs = require('fs');
const path = require('path');

let failures = 0;
function check(label, ok, detail) {
    console.log(`${ok ? '  OK  ' : ' ÉCHEC'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures++;
}
const eq = (label, got, want) =>
    check(label, got === want, got === want ? '' : `obtenu « ${got} », attendu « ${want} »`);

const { importApp } = require('./_apptest');

(async () => {
    const { formatDD, toSmsAscii, smsInfo, hhmmUtc, metersToFt } = await importApp('lib/coords.ts');
    const message = await importApp('lib/message.ts');

    console.log('\n1. Degrés décimaux');
    eq('cas nominal', formatDD(43.5297, 5.4474), '43.52970N 005.44740E');
    eq('longitude à un chiffre', formatDD(44.0, 5.0), '44.00000N 005.00000E');
    eq('longitude ouest', formatDD(44.8283, -0.7156), '44.82830N 000.71560W');
    eq('hémisphère sud', formatDD(-21.1151, 55.5364), '21.11510S 055.53640E');
    eq('longitude à trois chiffres', formatDD(-17.55, -149.61), '17.55000S 149.61000W');
    eq('équateur / méridien', formatDD(0, 0), '0.00000N 000.00000E');
    eq('arrondi à la 5e décimale', formatDD(43.1234567, 5.9999999), '43.12346N 006.00000E');

    console.log('\n2. Réduction à l’ASCII (capacité SMS)');
    eq('accents', toSmsAscii('FEU DE FORÊT à Sète'), 'FEU DE FORET a Sete');
    eq('apostrophe typographique', toSmsAscii('l’avion'), "l'avion");
    eq('degré', toSmsAscii('cap 090°'), 'cap 090 deg');
    eq('ligatures', toSmsAscii('sœur et Æther'), 'soeur et AEther');
    check(
        'aucun caractère hors GSM-7 en sortie',
        smsInfo(toSmsAscii('Forêt brûlée — 5 °C, œufs, «guillemets»')).encoding === 'GSM-7',
        smsInfo(toSmsAscii('Forêt brûlée — 5 °C, œufs, «guillemets»')).encoding,
    );

    console.log('\n3. Segmentation SMS');
    let i = smsInfo('A'.repeat(160));
    check('160 caractères = 1 segment', i.segments === 1 && i.capacity === 160);
    i = smsInfo('A'.repeat(161));
    check('161 caractères = 2 segments de 153', i.segments === 2 && i.capacity === 306, `${i.segments}`);
    // « é » appartient à l'alphabet GSM-7 de base ; « ê » non — c'est ce
    // dernier qui fait basculer le message en UCS-2 et divise la capacité.
    check('« é » reste en GSM-7', smsInfo('é'.repeat(10)).encoding === 'GSM-7');
    i = smsInfo('ê'.repeat(70));
    check('70 caractères UCS-2 = 1 segment', i.segments === 1 && i.encoding === 'UCS-2');
    i = smsInfo('ê'.repeat(71));
    check('71 caractères UCS-2 = 2 segments', i.segments === 2, `${i.segments}`);
    i = smsInfo('{}[]');
    check('caractères d’extension comptés double', i.chars === 8, `${i.chars}`);

    console.log('\n4. Divers');
    eq('heure UTC', hhmmUtc(new Date(Date.UTC(2026, 6, 26, 4, 7))), '0407');
    eq('mètres → pieds arrondis', String(metersToFt(1066.8)), '3500');
    eq('altitude absente', String(metersToFt(null)), 'null');
    // Un récepteur sans solution verticale rend 0,0 m : ce n'est pas « au
    // niveau de la mer », c'est une absence de mesure. Constaté sur appareil.
    eq('altitude nulle traitée comme absente', String(metersToFt(0)), 'null');
    eq('altitude négative réelle conservée', String(metersToFt(-30)), '-100');

    console.log('\n5. Message d’alerte complet');
    const observer = {
        name: 'JO PILOTE',
        aircraftReg: 'F-GXYZ',
        radioFreq: '123.500',
        mentionInFlight: true,
    };
    const built = message.buildAlertMessage(
        {
            lat: 43.5297,
            lon: 5.4474,
            altitudeM: 1066.8,
            fireType: 'foret',
            severity: 'important',
            intention: 'reste',
            at: new Date(Date.UTC(2026, 6, 26, 14, 32)),
        },
        observer,
    );
    console.log('\n--- message ---\n' + built.text + '\n---------------');
    check('code DFCI présent', built.dfci === 'KD44F0', built.dfci);
    check('type de feu en tête', built.text.startsWith('FEU DE FORET IMPORTANT vu d avion'));
    check('degrés décimaux présents', built.text.includes('43.52970N 005.44740E'));
    check('immatriculation présente', built.text.includes('F-GXYZ'));
    check('fréquence présente', built.text.includes('123.500'));
    check('horodatage UTC présent', built.text.includes('1432UTC'));
    check('altitude présente', built.text.includes('3500ft GPS'));
    check('encodage GSM-7', built.sms.encoding === 'GSM-7', built.sms.encoding);
    check(
        'tient en un seul SMS',
        built.sms.segments === 1,
        `${built.sms.chars} caractères, ${built.sms.segments} segment(s)`,
    );

    check('intention transmise', built.text.includes('Je reste sur zone'), built.text);

    // L'intention dit au CODIS s'il peut compter sur un observateur au-dessus
    // du feu : les deux formulations doivent passer, y compris la plus longue.
    const leaving = message.buildAlertMessage(
        {
            lat: 43.5297,
            lon: 5.4474,
            altitudeM: 1066.8,
            fireType: 'batiment',
            severity: null,
            intention: 'poursuit',
            at: new Date(Date.UTC(2026, 6, 26, 14, 32)),
        },
        observer,
    );
    check('seconde intention transmise', leaving.text.includes('Je poursuis ma route'));
    check(
        'seconde intention tient en un SMS',
        leaving.sms.segments === 1,
        `${leaving.sms.chars} caractères`,
    );

    const noAlt = message.buildAlertMessage(
        {
            lat: 43.5297,
            lon: 5.4474,
            altitudeM: null,
            fireType: 'batiment',
            severity: null,
            intention: null,
            at: new Date(Date.UTC(2026, 6, 26, 14, 32)),
        },
        observer,
    );
    check('pas d’altitude si inconnue', !noAlt.text.includes('ft GPS'));

    console.log('\n5b. Messages de suivi');
    const update = message.buildAlertMessage(
        {
            lat: 43.5297,
            lon: 5.4474,
            altitudeM: 1066.8,
            fireType: 'vehicules',
            // Une ampleur résiduelle ne doit pas polluer un message de suivi.
            severity: 'important',
            intention: 'poursuit',
            at: new Date(Date.UTC(2026, 6, 26, 15, 10)),
        },
        observer,
    );
    console.log('\n--- suivi ---\n' + update.text + '\n-------------');
    check(
        'suivi « véhicules » en tête',
        update.text.startsWith('VEHICULES INTERVENTION SUR PLACE vu d avion'),
    );
    check('ampleur ignorée sur un suivi', !update.text.includes('IMPORTANT'));
    check('suivi : même position DFCI', update.dfci === 'KD44F0');
    check('suivi tient en un SMS', update.sms.segments === 1, `${update.sms.chars} caractères`);

    const contained = message.buildAlertMessage(
        {
            lat: 43.5297,
            lon: 5.4474,
            altitudeM: 1066.8,
            fireType: 'maitrise',
            severity: null,
            intention: 'poursuit',
            at: new Date(Date.UTC(2026, 6, 26, 15, 40)),
        },
        observer,
    );
    check('suivi « maîtrisé »', contained.text.startsWith('FEU SEMBLE MAITRISE vu d avion'));
    check('suivi « maîtrisé » tient en un SMS', contained.sms.segments === 1);

    // Cas défavorable : nom long, pour vérifier que le compteur reste juste.
    const long = message.buildAlertMessage(
        {
            lat: 43.5297,
            lon: 5.4474,
            altitudeM: 1066.8,
            fireType: 'fumee',
            severity: 'important',
            intention: 'poursuit',
            at: new Date(),
        },
        {
            name: 'JEAN-CHRISTOPHE DE LA TOUR DU PIN',
            aircraftReg: 'F-HABCD',
            radioFreq: '123.500',
            mentionInFlight: true,
        },
    );
    console.log(
        `        cas défavorable : ${long.sms.chars} caractères → ${long.sms.segments} segment(s)` +
            (long.omitted.length ? `, écarté : ${long.omitted.join(' / ')}` : ''),
    );
    check('cas défavorable reste en GSM-7', long.sms.encoding === 'GSM-7');
    check('cas défavorable tient en un SMS', long.sms.segments === 1, `${long.sms.segments}`);
    check(
        'les lignes essentielles survivent toujours',
        long.text.includes('DFCI') &&
            long.text.includes('43.52970N') &&
            long.text.includes('F-HABCD'),
    );

    // Un nom absurdement long ne doit pas non plus casser la garantie.
    const absurd = message.buildAlertMessage(
        {
            lat: 43.5297,
            lon: 5.4474,
            altitudeM: 1066.8,
            fireType: 'vegetation',
            severity: 'important',
            intention: 'reste',
            at: new Date(),
        },
        {
            name: 'X'.repeat(90),
            aircraftReg: 'F-HABCD',
            radioFreq: '123.500',
            mentionInFlight: true,
        },
    );
    check(
        'nom démesuré : les deux lignes facultatives sont écartées',
        absurd.omitted.length === 2,
        `${absurd.omitted.length} écartée(s), ${absurd.sms.segments} segment(s)`,
    );

    console.log(
        failures ? `\n${failures} vérification(s) en échec\n` : '\nToutes les vérifications passent\n',
    );
    process.exit(failures ? 1 : 0);
})();
