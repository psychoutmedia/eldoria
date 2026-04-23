const fs = require('fs');

const DUMP = 'H:/claude-practice/node_dump.dmp';
const OUT_DIR = 'H:/claude-practice/recovered/';
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

console.log('Loading dump...');
const buf = fs.readFileSync(DUMP);
console.log('Dump size:', buf.length);

function findAll(haystack, needle) {
  const results = [];
  let idx = 0;
  while (idx <= haystack.length - needle.length) {
    const hit = haystack.indexOf(needle, idx);
    if (hit < 0) break;
    results.push(hit);
    idx = hit + 1;
  }
  return results;
}

// V8 stored as UCS-2 — scan with UTF-16LE markers.
const MARKERS_UTF16 = [
  "const net = require('net');",
  "// TIER 2: Endgame",
  "function handleTier2Command",
  "handleCampaign",
  "rollCastSuccess",
  "CAMPAIGN_COOLDOWN_MS",
  "storyFlags",
  "The Shattered Realms MUD"
];

for (const m of MARKERS_UTF16) {
  const needle = Buffer.from(m, 'utf16le');
  const hits = findAll(buf, needle);
  console.log(`UTF16 "${m}" => ${hits.length} hits`);
}

// Also try Latin-1 again with smaller, more specific markers.
const MARKERS_LATIN = [
  "function handleTier2Command",
  "handleCampaign",
  "CAMPAIGN_COOLDOWN_MS",
  "rollCastSuccess",
  "// TIER 2: Endgame",
  "function handleMail",
  "storyFlags"
];
for (const m of MARKERS_LATIN) {
  const needle = Buffer.from(m, 'latin1');
  const hits = findAll(buf, needle);
  console.log(`LATIN "${m}" => ${hits.length} hits`);
}

// Extract around the UTF-16 main marker.
const mainNeedle = Buffer.from("const net = require('net');", 'utf16le');
const mainHits = findAll(buf, mainNeedle);
console.log(`\nMain UTF-16 hits: ${mainHits.length}`);

function extractUTF16(buf, start) {
  // Walk forward reading 2 bytes at a time; stop on non-printable run.
  const MAX = 2_500_000; // bytes = ~1.25M chars
  const end = Math.min(buf.length, start + MAX);
  let lastGoodEnd = start;
  let badRun = 0;
  for (let i = start; i + 1 < end; i += 2) {
    const lo = buf[i], hi = buf[i + 1];
    if (hi !== 0) {
      // non-ASCII high byte; could be valid BMP — but in our source it's unusual.
      // Allow it if followed by more ASCII; be tolerant.
      badRun++;
      if (badRun > 20) break;
      continue;
    }
    const b = lo;
    const printable = (b >= 32 && b <= 126) || b === 9 || b === 10 || b === 13 || b === 0;
    if (printable) {
      if (b !== 0) lastGoodEnd = i + 2;
      badRun = 0;
    } else {
      badRun++;
      if (badRun > 8) break;
    }
  }
  return buf.slice(start, lastGoodEnd);
}

let idx = 0;
for (const h of mainHits) {
  const slice = extractUTF16(buf, h);
  // Decode UTF-16LE
  const text = slice.toString('utf16le');
  const out = OUT_DIR + `candidate_${idx}_at_${h}.js`;
  fs.writeFileSync(out, text);
  console.log(`Candidate ${idx}: offset=${h} bytes=${slice.length} chars=${text.length} -> ${out}`);
  idx++;
}
console.log('Done.');
