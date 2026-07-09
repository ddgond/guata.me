// Builds public/data/thai-provinces.json for the Thai provinces quiz.
//
// Downloads the GADM 4.1 level-1 boundaries of Thailand: all 77 provinces
// (76 changwat plus Bangkok), one feature each, so no dissolving is needed.
// GADM's NAME_1 values arrive space-collapsed ("AmnatCharoen"); display names
// are recovered by splitting at the case boundaries, which yields the split
// RTGS forms Google's map labels use ("Buri Ram", "Chon Buri", "Si Sa Ket").
// A rename table covers the two exceptions: Bangkok Metropolis → Bangkok,
// and Phangnga (fused in GADM, no case boundary to split) → Phang Nga. CC_1
// can't key that table (GADM leaves it "NA" for Bueng Kan and Chanthaburi),
// so it's keyed by NAME_1, which is unique.
//
// Each feature carries { name, region }, where region is one of the six
// standard geographic regions (the National Geographical Committee grouping):
// North, Northeast (Isan), Central, West, East, South. The membership table
// below lists every province by display name and doubles as the check that
// the source still contains exactly the 77 provinces we expect.
//
// Usage: node scripts/thai-provinces-data.mjs

import { dataPath, fetchZippedJson, simplifyAndWrite } from './lib/quiz-data.mjs';

const SOURCE = 'https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_THA_1.json.zip';
const OUTPUT = dataPath('thai-provinces.json');

// The two provinces where the case-split of GADM's NAME_1 isn't the display
// name, keyed by NAME_1
const RENAME = {
	BangkokMetropolis: 'Bangkok',
	Phangnga: 'Phang Nga',
};

// The six-region membership by display name, each region swept roughly
// north-to-south, west-to-east
const REGIONS = {
	north: [
		'Mae Hong Son',
		'Chiang Rai',
		'Chiang Mai',
		'Phayao',
		'Nan',
		'Lamphun',
		'Lampang',
		'Phrae',
		'Uttaradit',
	],
	isan: [
		'Loei',
		'Nong Khai',
		'Bueng Kan',
		'Udon Thani',
		'Nong Bua Lam Phu',
		'Sakon Nakhon',
		'Nakhon Phanom',
		'Khon Kaen',
		'Kalasin',
		'Mukdahan',
		'Chaiyaphum',
		'Maha Sarakham',
		'Roi Et',
		'Yasothon',
		'Amnat Charoen',
		'Nakhon Ratchasima',
		'Buri Ram',
		'Surin',
		'Si Sa Ket',
		'Ubon Ratchathani',
	],
	central: [
		'Sukhothai',
		'Phitsanulok',
		'Kamphaeng Phet',
		'Phichit',
		'Phetchabun',
		'Nakhon Sawan',
		'Uthai Thani',
		'Chai Nat',
		'Sing Buri',
		'Lop Buri',
		'Suphan Buri',
		'Ang Thong',
		'Saraburi',
		'Phra Nakhon Si Ayutthaya',
		'Nakhon Pathom',
		'Pathum Thani',
		'Nonthaburi',
		'Nakhon Nayok',
		'Bangkok',
		'Samut Sakhon',
		'Samut Prakan',
		'Samut Songkhram',
	],
	west: ['Tak', 'Kanchanaburi', 'Ratchaburi', 'Phetchaburi', 'Prachuap Khiri Khan'],
	east: ['Prachin Buri', 'Sa Kaeo', 'Chachoengsao', 'Chon Buri', 'Rayong', 'Chanthaburi', 'Trat'],
	south: [
		'Chumphon',
		'Ranong',
		'Surat Thani',
		'Phang Nga',
		'Phuket',
		'Krabi',
		'Nakhon Si Thammarat',
		'Trang',
		'Phatthalung',
		'Satun',
		'Songkhla',
		'Pattani',
		'Yala',
		'Narathiwat',
	],
};

const regionEntries = Object.entries(REGIONS).flatMap(([region, names]) =>
	names.map((name) => [name, region]),
);
const regionByName = new Map(regionEntries);
if (regionByName.size !== regionEntries.length) {
	throw new Error('A province is listed in more than one region');
}
const EXPECTED_COUNT = regionByName.size;

const source = await fetchZippedJson(SOURCE);

// "AmnatCharoen" → "Amnat Charoen"
const splitName = (name) => name.replace(/([a-z])([A-Z])/g, '$1 $2');

if (source.features.length !== EXPECTED_COUNT) {
	throw new Error(
		`Expected ${EXPECTED_COUNT} provinces, got ${source.features.length} — source data changed?`,
	);
}

for (const feature of source.features) {
	const name = RENAME[feature.properties.NAME_1] ?? splitName(feature.properties.NAME_1);
	const region = regionByName.get(name);
	if (!region) throw new Error(`Province not in the region table: ${name}`);
	feature.properties = { name, region };
}

const names = new Set(source.features.map((f) => f.properties.name));
if (names.size !== EXPECTED_COUNT) throw new Error('Province names are not unique');

const result = simplifyAndWrite({
	features: source.features,
	output: OUTPUT,
	simplify: '25%',
	expectedCount: EXPECTED_COUNT,
});
console.log(`Wrote ${OUTPUT} (${result.features.length} provinces, ${result.kb} KB)`);
