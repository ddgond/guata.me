// Builds public/data/vietnam-pre-reform-provinces.json for the Vietnam
// pre-reform provinces quiz.
//
// Downloads a pinned gist copy of geoBoundaries' Vietnam ADM1 layer: the 63
// provinces and municipalities as they stood before the 2025 reform (the
// January 2025 Huế conversion and the June 2025 mergers down to 34), one
// feature each. The gist URL carries the commit hash, so the bytes can't
// drift under us; geoboundaries.org itself now serves the post-reform layer,
// which is why this quiz pins a historical copy instead.
//
// The shapeName values are used untouched — full Vietnamese diacritics, with
// "Ho Chi Minh" the source's one undiacritic'd name. Each feature carries
// { name, region }: `region` is one of the eight standard geographic
// regions. The region table below doubles as the check that the source
// contains exactly the 63 provinces we expect.
//
// Usage: node scripts/vietnam-pre-reform-provinces-data.mjs

import { dataPath, fetchJson, simplifyAndWrite } from './lib/quiz-data.mjs';

const SOURCE =
	'https://gist.githubusercontent.com/wayfu/448f9731a1c6e20efbe2de57b4836fce/raw/17e212d9b17148711aa27ca32c86c42880387850/geoBoundaries-VNM-ADM1.geojson';
const OUTPUT = dataPath('vietnam-pre-reform-provinces.json');

// All 63 provinces grouped into the eight standard geographic regions, swept
// roughly north to south within each. Doubles as the guard that the source
// hasn't changed.
const REGIONS = {
	northwest: ['Lào Cai', 'Lai Châu', 'Điện Biên', 'Yên Bái', 'Sơn La', 'Hòa Bình'],
	northeast: [
		'Hà Giang',
		'Cao Bằng',
		'Bắc Kạn',
		'Lạng Sơn',
		'Tuyên Quang',
		'Thái Nguyên',
		'Phú Thọ',
		'Bắc Giang',
		'Quảng Ninh',
	],
	'red-river': [
		'Hà Nội',
		'Vĩnh Phúc',
		'Bắc Ninh',
		'Hải Dương',
		'Hải Phòng',
		'Hưng Yên',
		'Thái Bình',
		'Hà Nam',
		'Nam Định',
		'Ninh Bình',
	],
	'north-central': ['Thanh Hóa', 'Nghệ An', 'Hà Tĩnh', 'Quảng Bình', 'Quảng Trị', 'Thừa Thiên Huế'],
	'south-central': [
		'Đà Nẵng',
		'Quảng Nam',
		'Quảng Ngãi',
		'Bình Định',
		'Phú Yên',
		'Khánh Hòa',
		'Ninh Thuận',
		'Bình Thuận',
	],
	highlands: ['Kon Tum', 'Gia Lai', 'Đắk Lắk', 'Đắk Nông', 'Lâm Đồng'],
	southeast: ['Bình Phước', 'Tây Ninh', 'Bình Dương', 'Đồng Nai', 'Bà Rịa–Vũng Tàu', 'Ho Chi Minh'],
	mekong: [
		'Long An',
		'Tiền Giang',
		'Bến Tre',
		'Trà Vinh',
		'Vĩnh Long',
		'Đồng Tháp',
		'An Giang',
		'Kiên Giang',
		'Cần Thơ',
		'Hậu Giang',
		'Sóc Trăng',
		'Bạc Liêu',
		'Cà Mau',
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
if (EXPECTED_COUNT !== 63) {
	throw new Error(`Region table lists ${EXPECTED_COUNT} provinces, expected 63`);
}

const source = await fetchJson(SOURCE);

if (source.features.length !== EXPECTED_COUNT) {
	throw new Error(
		`Expected ${EXPECTED_COUNT} provinces, got ${source.features.length} — source data changed?`,
	);
}

const seen = new Set();
for (const feature of source.features) {
	const name = feature.properties.shapeName;
	const region = regionByName.get(name);
	if (!region) throw new Error(`Province not in the region table: ${name}`);
	if (seen.has(name)) throw new Error(`Duplicate province: ${name}`);
	seen.add(name);
	feature.properties = { name, region };
}

const result = simplifyAndWrite({
	features: source.features,
	output: OUTPUT,
	// The gist geometry is already coarse (~720 KB raw for 63 provinces), so
	// most of the size win comes from the precision rounding — shave only
	// lightly on top of it
	simplify: '80%',
	expectedCount: EXPECTED_COUNT,
});
console.log(`Wrote ${OUTPUT} (${result.features.length} provinces, ${result.kb} KB)`);
