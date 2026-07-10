// Builds public/data/belediyesi.json for the Turkish belediyesi quiz.
//
// Downloads the OCHA COD-AB subnational boundaries of Türkiye (admin level 2)
// from HDX: all 973 districts (ilçe), current as of the dataset's 2022-01-01
// validity date, one feature each. GADM 4.1 was evaluated first and rejected:
// its TUR_2 file is a pre-2008 snapshot (929 districts, Antalya still a
// single "Merkez", none of the 2012 metropolitan-reform districts like
// Antakya/Defne or Merkezefendi/Pamukkale) with space-collapsed and outright
// mistyped names ("ŞultanKoçhisar", "Kinkkale", "Zinguldak").
//
// COD-AB's Turkish name fields (lang1 = "tr") were lowercased from an
// ALL-CAPS source with the wrong locale, which is invertible: İ became
// "i"+U+0307 (restore to "i") and I became a plain "i" (restore to "ı").
// A rename table keyed by the stable adm2_pcode covers the rest: names whose
// caps source used ASCII "I" where İ was meant (the province-eponymous
// central districts: ARTVIN → "Artvın" instead of "Artvin"), plus a few
// spellings where the source disagrees with Google's map labels and the
// municipalities' own names ("Gazi̇ Osmanpaşa" → Gaziosmanpaşa, "Kâhta" →
// Kahta). Every restored name was checked against Turkish Wikipedia titles;
// the ambiguous ones (circumflexes, Bahşılı, Marmaraereğlisi) follow the
// municipality's self-spelling on its .bel.tr site.
//
// Each feature carries { name, province }, where province is the display name
// of one of the 81 provinces; the quiz definition groups provinces into the
// seven geographic-region bands. The province table below doubles as the
// check that the source still contains exactly the provinces we expect.
//
// Usage: node scripts/belediye-data.mjs

import { dataPath, fetchZippedJson, simplifyAndWrite } from './lib/quiz-data.mjs';

const SOURCE =
	'https://data.humdata.org/dataset/d74086a0-f398-4474-9e12-1b9a70907bd0/resource/470bd810-2240-4ce0-b5c4-17434112ce41/download/tur_admin_boundaries.geojson.zip';
const OUTPUT = dataPath('belediyesi.json');
const EXPECTED_COUNT = 973;

// Undo the wrong-locale lowercasing: "i"+U+0307 was İ (→ "i"), plain "i" was
// I (→ "ı")
const fixDotting = (s) =>
	s
		.replace(/i\u0307/g, '\uE000')
		.replace(/i/g, '\u0131')
		.replace(/\uE000/g, 'i');

// Names fixDotting can't restore, keyed by adm2_pcode. The twenty
// province-eponymous central districts were capitalized with ASCII "I"
// (ARTVIN), so their dotted i's come out dotless; the rest are spelling
// disagreements resolved toward Google's labels and the municipalities' own
// names.
const RENAME = {
	TUR003001: 'Afyonkarahisar',
	TUR008003: 'Artvin',
	TUR011001: 'Bilecik',
	TUR012002: 'Bingöl',
	TUR013003: 'Bitlis',
	TUR022001: 'Edirne',
	TUR024002: 'Erzincan',
	TUR028009: 'Giresun',
	TUR030002: 'Hakkari',
	TUR039003: 'Kırklareli',
	TUR040006: 'Kırşehir',
	TUR050007: 'Nevşehir',
	TUR051005: 'Niğde',
	TUR053012: 'Rize',
	TUR056005: 'Siirt',
	TUR057008: 'Sinop',
	TUR058012: 'Sivas',
	TUR062008: 'Tunceli',
	TUR079002: 'Kilis',
	TUR080005: 'Osmaniye',
	TUR002006: 'Kahta', // COD "Kâhta"; kahta.bel.tr and Google drop the circumflex
	TUR017011: 'Lapseki', // COD "Lâpseki"
	TUR019008: 'Laçin', // COD "Lâçin"
	TUR034021: 'Gaziosmanpaşa', // COD "Gazi̇ Osmanpaşa"
	TUR037009: 'Devrekani', // COD "Devrekâni"
	TUR046009: 'Onikişubat', // COD "Oni̇ki̇ Şubat"
	TUR058014: 'Şarkışla', // COD "Sarkışla"
	TUR059007: 'Marmaraereğlisi', // COD "Marmara Ereğli̇si̇"; one word officially
	TUR071001: 'Bahşılı', // COD "Bahşili"
};

// The one province name fixDotting can't restore (caps source mixed İ and I:
// "ESKİŞEHIR"), keyed by adm1_pcode
const RENAME_PROVINCE = {
	TUR026: 'Eskişehir',
};

// All 81 provinces by display name — the guard that the source hasn't moved
const PROVINCES = [
	'Adana',
	'Adıyaman',
	'Afyonkarahisar',
	'Ağrı',
	'Aksaray',
	'Amasya',
	'Ankara',
	'Antalya',
	'Ardahan',
	'Artvin',
	'Aydın',
	'Balıkesir',
	'Bartın',
	'Batman',
	'Bayburt',
	'Bilecik',
	'Bingöl',
	'Bitlis',
	'Bolu',
	'Burdur',
	'Bursa',
	'Çanakkale',
	'Çankırı',
	'Çorum',
	'Denizli',
	'Diyarbakır',
	'Düzce',
	'Edirne',
	'Elazığ',
	'Erzincan',
	'Erzurum',
	'Eskişehir',
	'Gaziantep',
	'Giresun',
	'Gümüşhane',
	'Hakkari',
	'Hatay',
	'Iğdır',
	'Isparta',
	'İstanbul',
	'İzmir',
	'Kahramanmaraş',
	'Karabük',
	'Karaman',
	'Kars',
	'Kastamonu',
	'Kayseri',
	'Kırıkkale',
	'Kırklareli',
	'Kırşehir',
	'Kilis',
	'Kocaeli',
	'Konya',
	'Kütahya',
	'Malatya',
	'Manisa',
	'Mardin',
	'Mersin',
	'Muğla',
	'Muş',
	'Nevşehir',
	'Niğde',
	'Ordu',
	'Osmaniye',
	'Rize',
	'Sakarya',
	'Samsun',
	'Siirt',
	'Sinop',
	'Sivas',
	'Şanlıurfa',
	'Şırnak',
	'Tekirdağ',
	'Tokat',
	'Trabzon',
	'Tunceli',
	'Uşak',
	'Van',
	'Yalova',
	'Yozgat',
	'Zonguldak',
];

const source = await fetchZippedJson(SOURCE, 'tur_admin2.geojson');

if (source.features.length !== EXPECTED_COUNT) {
	throw new Error(
		`Expected ${EXPECTED_COUNT} districts, got ${source.features.length} — source data changed?`,
	);
}

const byProvince = new Map();
for (const feature of source.features) {
	const props = feature.properties;
	const name = RENAME[props.adm2_pcode] ?? fixDotting(props.adm2_name1);
	const province = RENAME_PROVINCE[props.adm1_pcode] ?? fixDotting(props.adm1_name1);
	// Anything still carrying a combining dot or circumflex is missing a RENAME
	if (/\u0307|[\u00e2\u00c2]/.test(name + province)) {
		throw new Error(`Mangled name survived the rename table: ${name} (${province})`);
	}
	if (!byProvince.has(province)) byProvince.set(province, new Set());
	if (byProvince.get(province).has(name)) {
		throw new Error(`Duplicate district in ${province}: ${name}`);
	}
	byProvince.get(province).add(name);
	feature.properties = { name, province };
}

const expected = new Set(PROVINCES);
if (byProvince.size !== PROVINCES.length || [...byProvince.keys()].some((p) => !expected.has(p))) {
	const got = [...byProvince.keys()].filter((p) => !expected.has(p));
	throw new Error(`Province list changed: unexpected ${got.join(', ') || '(none)'}`);
}

const result = simplifyAndWrite({
	features: source.features,
	output: OUTPUT,
	simplify: '5%',
	expectedCount: EXPECTED_COUNT,
});
console.log(`Wrote ${OUTPUT} (${result.features.length} districts, ${result.kb} KB)`);
