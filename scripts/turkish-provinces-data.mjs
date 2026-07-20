// Builds public/data/turkish-provinces.json for the Turkish provinces and
// province-codes quizzes.
//
// Downloads the OCHA COD-AB subnational boundaries of Türkiye (admin level 1)
// from HDX — the same archive belediye-data.mjs reads level 2 from: all 81
// provinces (il), current as of the dataset's 2022-01-01 validity date, one
// feature each.
//
// COD-AB's Turkish name fields (lang1 = "tr") have the same wrong-locale
// lowercasing as the district file, undone the same way: İ became
// "i"+U+0307 (restore to "i") and I became a plain "i" (restore to "ı").
// Only Eskişehir needs a rename — its caps source mixed İ and I
// ("ESKİŞEHIR"), which the inversion can't untangle.
//
// Each feature carries { name, code, region }: `code` is the province's
// two-digit plate code, taken from the adm1_pcode (TUR026 → "26" — the
// pcodes follow the plate numbering exactly); `region` is one of the seven
// standard geographic regions, from the same grouping the belediyesi quiz
// bands provinces by. The region table below doubles as the check that the
// source still contains exactly the 81 provinces we expect.
//
// Usage: node scripts/turkish-provinces-data.mjs

import { dataPath, fetchZippedJson, simplifyAndWrite } from './lib/quiz-data.mjs';

const SOURCE =
	'https://data.humdata.org/dataset/d74086a0-f398-4474-9e12-1b9a70907bd0/resource/470bd810-2240-4ce0-b5c4-17434112ce41/download/tur_admin_boundaries.geojson.zip';
const OUTPUT = dataPath('turkish-provinces.json');
const EXPECTED_COUNT = 81;

// Undo the wrong-locale lowercasing: "i"+U+0307 was İ (→ "i"), plain "i" was
// I (→ "ı")
const fixDotting = (s) =>
	s
		.replace(/i\u0307/g, '\uE000')
		.replace(/i/g, '\u0131')
		.replace(/\uE000/g, 'i');

// The one name fixDotting can't restore (caps source mixed İ and I:
// "ESKİŞEHIR"), keyed by adm1_pcode
const RENAME = {
	TUR026: 'Eskişehir',
};

// All 81 provinces grouped into the seven geographic regions, swept roughly
// west to east within each — the same grouping as the belediyesi quiz bands.
// Doubles as the guard that the source hasn't moved.
const REGIONS = {
	marmara: [
		'Edirne',
		'Kırklareli',
		'Tekirdağ',
		'İstanbul',
		'Çanakkale',
		'Balıkesir',
		'Bursa',
		'Yalova',
		'Kocaeli',
		'Sakarya',
		'Bilecik',
	],
	aegean: ['İzmir', 'Manisa', 'Aydın', 'Muğla', 'Denizli', 'Uşak', 'Kütahya', 'Afyonkarahisar'],
	mediterranean: [
		'Antalya',
		'Burdur',
		'Isparta',
		'Mersin',
		'Adana',
		'Osmaniye',
		'Hatay',
		'Kahramanmaraş',
	],
	central: [
		'Eskişehir',
		'Ankara',
		'Çankırı',
		'Kırıkkale',
		'Kırşehir',
		'Yozgat',
		'Sivas',
		'Kayseri',
		'Nevşehir',
		'Aksaray',
		'Niğde',
		'Konya',
		'Karaman',
	],
	blacksea: [
		'Bolu',
		'Düzce',
		'Zonguldak',
		'Karabük',
		'Bartın',
		'Kastamonu',
		'Sinop',
		'Çorum',
		'Amasya',
		'Samsun',
		'Tokat',
		'Ordu',
		'Giresun',
		'Gümüşhane',
		'Bayburt',
		'Trabzon',
		'Rize',
		'Artvin',
	],
	east: [
		'Erzincan',
		'Erzurum',
		'Kars',
		'Ardahan',
		'Iğdır',
		'Ağrı',
		'Malatya',
		'Elazığ',
		'Tunceli',
		'Bingöl',
		'Muş',
		'Bitlis',
		'Van',
		'Hakkari',
	],
	southeast: [
		'Gaziantep',
		'Kilis',
		'Adıyaman',
		'Şanlıurfa',
		'Diyarbakır',
		'Mardin',
		'Batman',
		'Siirt',
		'Şırnak',
	],
};

const regionOf = new Map(
	Object.entries(REGIONS).flatMap(([region, provinces]) =>
		provinces.map((province) => [province, region]),
	),
);
if (regionOf.size !== EXPECTED_COUNT) {
	throw new Error(`Region table lists ${regionOf.size} provinces, expected ${EXPECTED_COUNT}`);
}

const source = await fetchZippedJson(SOURCE, 'tur_admin1.geojson');

if (source.features.length !== EXPECTED_COUNT) {
	throw new Error(
		`Expected ${EXPECTED_COUNT} provinces, got ${source.features.length} — source data changed?`,
	);
}

const seen = new Set();
for (const feature of source.features) {
	const props = feature.properties;
	const name = RENAME[props.adm1_pcode] ?? fixDotting(props.adm1_name1);
	// Anything still carrying a combining dot or circumflex is missing a RENAME
	if (/\u0307|[âÂ]/.test(name)) {
		throw new Error(`Mangled name survived the rename table: ${name}`);
	}
	const region = regionOf.get(name);
	if (!region) throw new Error(`Province list changed: unexpected ${name}`);
	if (seen.has(name)) throw new Error(`Duplicate province: ${name}`);
	seen.add(name);
	// The pcodes follow the plate numbering: TUR001 Adana … TUR081 Düzce
	const code = props.adm1_pcode.match(/^TUR0(\d\d)$/)?.[1];
	if (!code) throw new Error(`Unexpected pcode for ${name}: ${props.adm1_pcode}`);
	feature.properties = { name, code, region };
}

const result = simplifyAndWrite({
	features: source.features,
	output: OUTPUT,
	simplify: '5%',
	expectedCount: EXPECTED_COUNT,
});
console.log(`Wrote ${OUTPUT} (${result.features.length} provinces, ${result.kb} KB)`);
