// Gera data/cidades.json a partir do pacote npm all-the-cities (GeoNames, CC BY 4.0).
// Uso: npm i all-the-cities@3.1.0 pbf@3  &&  node scripts/gerar-cidades.js
const fs = require("fs"), path = require("path");
const Pbf = require("pbf");
const pbfPath = process.argv[2] || require.resolve("all-the-cities/cities.pbf");
const pbf = new Pbf(fs.readFileSync(pbfPath));
let lastLat = 0, lastLon = 0; const cs = [];
function rd(tag, c, p) {
  if (tag === 2) c.name = p.readString(); else if (tag === 3) c.cc = p.readString();
  else if (tag === 7) c.fc = p.readString(); else if (tag === 8) c.adm = p.readString();
  else if (tag === 9) c.pop = p.readVarint();
  else if (tag === 10) { lastLon += p.readSVarint(); c.lon = lastLon / 1e5; }
  else if (tag === 11) { lastLat += p.readSVarint(); c.lat = lastLat / 1e5; }
  else if (tag === 1) p.readSVarint(); else if (tag >= 4 && tag <= 6) p.readString();
}
while (pbf.pos < pbf.length) cs.push(pbf.readMessage(rd, { name: "", cc: "", fc: "", adm: "", pop: 0 }));
// nomes em português para cidades conhecidas (país|nome em inglês)
const PT = require("./nomes-pt.json");
const keep = cs.filter(c => !["PPLX", "PPLH", "PPLQ", "PPLW", "PPLCH"].includes(c.fc) &&
  (c.pop >= 5000 || (c.cc === "BR" && c.pop >= 1000) || ["PPLC", "PPLA"].includes(c.fc)));
keep.sort((a, b) => b.pop - a.pop);
let tr = 0;
const out = keep.map(c => {
  const pt = PT[c.cc + "|" + c.name];
  const row = [pt || c.name, c.cc, c.cc === "BR" ? c.adm : "", c.pop, Math.round(c.lat * 1e3) / 1e3, Math.round(c.lon * 1e3) / 1e3];
  if (pt) { row.push(c.name); tr++; }
  return row;
});
fs.writeFileSync(path.join(__dirname, "..", "data", "cidades.json"), JSON.stringify(out));
console.log(`${out.length} cidades, ${tr} nomes traduzidos`);
const missing = Object.keys(PT).filter(k => !keep.some(c => c.cc + "|" + c.name === k));
if (missing.length) console.log("Sem correspondência:", missing.join(", "));
