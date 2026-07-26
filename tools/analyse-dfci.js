// Analyse de la structure des codes DFCI présents dans le shapefile.
const fs = require('fs');
const path = require('path');

const BASE = path.join(
    __dirname,
    '..',
    'docs',
    'CARRO_DFCI_2x2_L93',
    'CARRO_DFCI_2x2_L93',
    'CARRO_DFCI_2X2_L93',
);

const dbf = fs.readFileSync(BASE + '.dbf');
const nRecords = dbf.readUInt32LE(4);
const headerLen = dbf.readUInt16LE(8);
const recordLen = dbf.readUInt16LE(10);

const pos = [new Set(), new Set(), new Set(), new Set(), new Set(), new Set()];
const lengths = new Set();
for (let i = 0; i < nRecords; i++) {
    const off = headerLen + i * recordLen;
    const name = dbf.toString('latin1', off + 1, off + 1 + 254).trim();
    lengths.add(name.length);
    for (let k = 0; k < name.length && k < 6; k++) pos[k].add(name[k]);
}

console.log('longueurs de code :', [...lengths]);
pos.forEach((s, i) => {
    const v = [...s].sort();
    console.log(`position ${i} (${v.length} valeurs) :`, v.join(''));
});
