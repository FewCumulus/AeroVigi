// Inspection du shapefile DFCI 2x2 (lecture DBF + SHP sans dépendance).
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

// --- DBF ---
const dbfFd = fs.openSync(BASE + '.dbf', 'r');
const head = Buffer.alloc(32);
fs.readSync(dbfFd, head, 0, 32, 0);
const nRecords = head.readUInt32LE(4);
const headerLen = head.readUInt16LE(8);
const recordLen = head.readUInt16LE(10);
const nFields = Math.floor((headerLen - 33) / 32);
const fields = [];
let off = 32;
for (let i = 0; i < nFields; i++) {
    const b = Buffer.alloc(32);
    fs.readSync(dbfFd, b, 0, 32, off);
    fields.push({
        name: b.toString('latin1', 0, 11).replace(/\0.*$/, ''),
        type: b.toString('latin1', 11, 12),
        len: b[16],
        dec: b[17],
    });
    off += 32;
}
console.log('DBF records:', nRecords, 'recordLen:', recordLen);
console.log('fields:', JSON.stringify(fields));

function readRecord(i) {
    const b = Buffer.alloc(recordLen);
    fs.readSync(dbfFd, b, 0, recordLen, headerLen + i * recordLen);
    const out = {};
    let p = 1;
    for (const f of fields) {
        out[f.name] = b.toString('latin1', p, p + f.len).trim();
        p += f.len;
    }
    return out;
}

// --- SHP : bbox de chaque enregistrement via l'index .shx ---
const shxFd = fs.openSync(BASE + '.shx', 'r');
const shpFd = fs.openSync(BASE + '.shp', 'r');
function readShapeBBox(i) {
    const idx = Buffer.alloc(8);
    fs.readSync(shxFd, idx, 0, 8, 100 + i * 8);
    const offsetWords = idx.readInt32BE(0);
    const recOff = offsetWords * 2;
    const b = Buffer.alloc(8 + 4 + 32);
    fs.readSync(shpFd, b, 0, b.length, recOff);
    const type = b.readInt32LE(8);
    return {
        type,
        xmin: b.readDoubleLE(12),
        ymin: b.readDoubleLE(20),
        xmax: b.readDoubleLE(28),
        ymax: b.readDoubleLE(36),
    };
}

const samples = [0, 1, 2, 3, 100, 1000, 50000, nRecords - 1];
for (const i of samples) {
    console.log(i, JSON.stringify(readRecord(i)), JSON.stringify(readShapeBBox(i)));
}
