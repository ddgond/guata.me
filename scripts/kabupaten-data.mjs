// Builds public/data/kabupaten.json for the KabupatenQuiz component.
//
// Downloads the GADM level-2 boundaries of Indonesia that helloquiz.app uses
// and filters them to the "Indonesia Kabupaten Geoguessr only" quiz
// (https://helloquiz.app/quiz/1eV4Nh3ZbpDJ), with two adjustments: excluded
// kota enclaves are dissolved into their same-named surrounding kabupaten so
// they don't leave holes, and enclave kota with no such parent stay quizzable
// as their own shapes. Geometry is simplified with mapshaper so the whole
// file stays a few hundred KB.
//
// Usage: node scripts/kabupaten-data.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SOURCE = 'https://emily.bz/geojson/subdivision/ID_2.json';
const OUTPUT = new URL('../public/data/kabupaten.json', import.meta.url).pathname;

// The quiz's hand-tuned tweaks on top of the isGeo flag, by feature index in
// the source file. Excludes are mostly kota enclaves (city shapes inside a
// same-named kabupaten) and remote island groups; includes force in a few
// shapes whose isGeo flag lags their GeoGuessr coverage.
const EXCLUDE = new Set([
	196, 55, 195, 197, 90, 184, 203, 201, 204, 202, 205, 228, 272, 269, 225, 271, 224, 226, 231,
	227, 152, 151, 147, 68, 262, 257, 258, 261, 260, 259, 67, 313, 440, 459, 12,
]);
const INCLUDE = new Set([396, 7, 3, 148, 149]);

// Excluded kota that sit inside a same-named kabupaten get dissolved into it
// ("Kota Kupang" → "Kupang"). These have no same-named parent, so instead of
// leaving holes in the map they stay quizzable as their own shapes:
const PROMOTE = new Set([
	90, // Medan (inside Deli Serdang)
	67, // Kota Jambi (inside Muaro Jambi)
	68, // Kota Yogyakarta (between Sleman and Bantul)
	184, // Kota Bengkulu
	272, // Tangerang Selatan
	203, // Jakarta Pusat
	201, // Jakarta Selatan
	204, // Jakarta Barat
	202, // Jakarta Timur
	205, // Jakarta Utara
]);
// Kota the quiz keeps as separate entries even though a same-named kabupaten
// surrounds them (both have coverage). One shape per name is less confusing,
// so dissolve the kota into its kabupaten. (Kota Pontianak is not one of
// these: its GADM neighbor "Pontianak" is really Mempawah, renamed below.)
const MERGE_NESTED = new Set([
	256, // Kota Kediri (Jawa Timur)
	150, // Kota Semarang (Jawa Tengah)
	110, // Kota Solok (Sumatera Barat)
	291, // Kota Bima (Nusa Tenggara Barat)
]);
// GADM names that are stale or ambiguous on a map
const RENAME = {
	317: 'Mempawah', // Kabupaten Pontianak was renamed Mempawah in 2014
	232: 'Kota Banjar', // distinguish the Jawa Barat city from Kab. Banjar (Kalimantan Selatan)
};
// The quiz's 399, plus the promoted kota, minus the nested kota dissolved away
const EXPECTED_COUNT = 399 + PROMOTE.size - MERGE_NESTED.size;

console.log(`Fetching ${SOURCE} ...`);
const source = await (await fetch(SOURCE)).json();

const normalizeProvince = (province) =>
	// One Aceh feature still carries the pre-2009 province name; GADM also
	// title-cases the DKI acronym
	({ 'Nanggroe Aceh Darussalam': 'Aceh', 'Dki Jakarta': 'DKI Jakarta' })[province] ?? province;
const isIncluded = (feature, i) =>
	!MERGE_NESTED.has(i) &&
	(INCLUDE.has(i) || PROMOTE.has(i) || (!EXCLUDE.has(i) && feature.properties.isGeo === '1'));

const included = [];
source.features.forEach((feature, i) => {
	if (!isIncluded(feature, i)) return;
	feature.properties = {
		key: i,
		name: RENAME[i] ?? feature.properties.name,
		province: normalizeProvince(feature.properties.province),
	};
	included.push(feature);
});
if (included.length !== EXPECTED_COUNT) {
	throw new Error(`Expected ${EXPECTED_COUNT} kabupaten, got ${included.length} — source data changed?`);
}

// Dissolve excluded kota into their parent kabupaten instead of leaving holes
const merged = [];
const unmerged = [];
source.features.forEach((feature, i) => {
	const droppedExclude = EXCLUDE.has(i) && !PROMOTE.has(i);
	if (!droppedExclude && !MERGE_NESTED.has(i)) return;
	const { name } = feature.properties;
	const province = normalizeProvince(feature.properties.province);
	const parentName = name.replace(/^Kota /, '');
	const parents = included.filter(
		(p) => p.properties.province === province && p.properties.name === parentName,
	);
	if (parents.length === 1) {
		feature.properties = { ...parents[0].properties };
		merged.push({ name, province, parent: parentName });
	} else {
		unmerged.push({ name, province, candidates: parents.length });
	}
});
console.log(`Merging ${merged.length} kota into their parent kabupaten:`);
for (const m of merged) console.log(`  ${m.name} → ${m.parent} (${m.province})`);
console.log(`${unmerged.length} exclusions left out (no unambiguous parent):`);
for (const u of unmerged) console.log(`  ${u.name} (${u.province})`);

const features = [
	...included,
	...source.features.filter(
		(f, i) => (EXCLUDE.has(i) || MERGE_NESTED.has(i)) && f.properties.key !== undefined,
	),
];

const filtered = join(tmpdir(), 'kabupaten-filtered.json');
writeFileSync(filtered, JSON.stringify({ type: 'FeatureCollection', features }));

mkdirSync(new URL('../public/data', import.meta.url).pathname, { recursive: true });
execFileSync(
	'npx',
	[
		'mapshaper',
		filtered,
		'-dissolve', 'fields=key', 'copy-fields=name,province',
		'-each', 'delete key',
		'-simplify', 'weighted', '25%', 'keep-shapes',
		'-o', `precision=0.001`, 'format=geojson', OUTPUT,
	],
	{ stdio: 'inherit' },
);

const result = JSON.parse(readFileSync(OUTPUT, 'utf8'));
if (result.features.length !== EXPECTED_COUNT) {
	throw new Error(`Dissolve changed the feature count: ${result.features.length}`);
}
const kb = Math.round(statSync(OUTPUT).size / 1024);
console.log(`Wrote ${OUTPUT} (${result.features.length} kabupaten, ${kb} KB)`);
