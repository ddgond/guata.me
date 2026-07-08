// Builds public/data/landkreise.json for the German Landkreise quiz.
//
// Downloads the GADM 4.1 level-2 boundaries of Germany (the same file
// helloquiz.app's "Germany subdivisions (lvl2)" quiz,
// https://helloquiz.app/quiz/erVfCvEjr9Y9, is built on), with three
// adjustments: the Bodensee waterbody shape is
// dropped, kreisfreie Städte with a same-named surrounding Landkreis are
// dissolved into it so each name is one shape (the kota treatment from
// kabupaten-data.mjs), and two districts GADM still shows but Germany has
// since merged away are dissolved into their absorbers (Eisenach →
// Wartburgkreis in 2021, Osterode am Harz → Göttingen in 2016). GADM's NAME_2
// values arrive space-collapsed and sometimes truncated ("FrankfurtamMain",
// "NeustadtanderAisch-BadWindsh"), so display names are restored from a table
// keyed by CC_2 — the official five-digit Kreisschlüssel. Geometry is
// simplified with mapshaper so the whole file stays a few hundred KB.
//
// Each feature carries { name, region }, where region is one of the twelve
// drill groups the quiz picker offers: Bundesländer, with the city-states and
// the smallest states folded into a neighbor and Bayern split between Franken
// & Oberpfalz and the southern Bezirke (the Kreisschlüssel's third digit is
// the Regierungsbezirk, so 093xx–096xx is the north).
//
// Usage: node scripts/landkreis-data.mjs

import { dataPath, fetchZippedJson, simplifyAndWrite } from './lib/quiz-data.mjs';

// emily.bz/geojson/subdivision/DE_2.json mirrors this byte-for-byte if GADM
// is unreachable (see data-sources.md)
const SOURCE = 'https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_DEU_2.json.zip';
const OUTPUT = dataPath('landkreise.json');

// Districts that no longer exist, dissolved into the Kreis that absorbed them
const MERGED_AWAY = {
	16056: '16063', // Eisenach → Wartburgkreis (2021)
	'03156': '03152', // Osterode am Harz → Göttingen (2016)
};

// Proper names for the GADM entries whose NAME_2 is space-collapsed (or, for
// Neustadt an der Aisch, truncated outright), keyed by Kreisschlüssel
const RENAME = {
	'01053': 'Herzogtum Lauenburg',
	'03241': 'Region Hannover',
	'03256': 'Nienburg (Weser)',
	'03357': 'Rotenburg (Wümme)',
	'03456': 'Grafschaft Bentheim',
	'05117': 'Mülheim an der Ruhr',
	'05162': 'Rhein-Kreis Neuss',
	'05334': 'Städteregion Aachen',
	'05374': 'Oberbergischer Kreis',
	'05378': 'Rheinisch-Bergischer Kreis',
	'05962': 'Märkischer Kreis',
	'06412': 'Frankfurt am Main',
	'06413': 'Offenbach am Main',
	'07132': 'Altenkirchen (Westerwald)',
	'07133': 'Bad Kreuznach',
	'07232': 'Eifelkreis Bitburg-Prüm',
	'07311': 'Frankenthal (Pfalz)',
	'07313': 'Landau in der Pfalz',
	'07314': 'Ludwigshafen am Rhein',
	'07316': 'Neustadt an der Weinstraße',
	'07332': 'Bad Dürkheim',
	'07337': 'Südliche Weinstraße',
	'08127': 'Schwäbisch Hall',
	'08311': 'Freiburg im Breisgau',
	'09172': 'Berchtesgadener Land',
	'09173': 'Bad Tölz-Wolfratshausen',
	'09181': 'Landsberg am Lech',
	'09183': 'Mühldorf am Inn',
	'09186': 'Pfaffenhofen an der Ilm',
	'09363': 'Weiden in der Oberpfalz',
	'09373': 'Neumarkt in der Oberpfalz',
	'09374': 'Neustadt an der Waldnaab',
	'09479': 'Wunsiedel im Fichtelgebirge',
	'09574': 'Nürnberger Land',
	'09575': 'Neustadt an der Aisch-Bad Windsheim',
	'09672': 'Bad Kissingen',
	'09763': 'Kempten (Allgäu)',
	'09773': 'Dillingen an der Donau',
	'09776': 'Lindau (Bodensee)',
	10041: 'Regionalverband Saarbrücken',
	10046: 'St. Wendel',
	12051: 'Brandenburg an der Havel',
	12053: 'Frankfurt (Oder)',
	13071: 'Mecklenburgische Seenplatte',
	14628: 'Sächsische Schweiz-Osterzgebirge',
	15002: 'Halle (Saale)',
	15081: 'Altmarkkreis Salzwedel',
	15086: 'Jerichower Land',
	16071: 'Weimarer Land',
	16077: 'Altenburger Land',
};

// Drill groups: Bundesländer with Hamburg, Mecklenburg-Vorpommern, Bremen,
// Berlin, and Saarland folded into a neighbor, and Bayern split in half
const STATE_REGIONS = {
	'Schleswig-Holstein': 'north',
	Hamburg: 'north',
	'Mecklenburg-Vorpommern': 'north',
	Niedersachsen: 'niedersachsen',
	Bremen: 'niedersachsen',
	Berlin: 'brandenburg',
	Brandenburg: 'brandenburg',
	'Sachsen-Anhalt': 'sachsen-anhalt',
	Sachsen: 'sachsen',
	Thüringen: 'thueringen',
	'Nordrhein-Westfalen': 'nrw',
	Hessen: 'hessen',
	'Rheinland-Pfalz': 'rlp-saarland',
	Saarland: 'rlp-saarland',
	'Baden-Württemberg': 'bw',
};
const NORTH_BAYERN_BEZIRKE = new Set(['093', '094', '095', '096']); // Oberpfalz + the three Franken
const regionFor = (props) =>
	props.NAME_1 === 'Bayern'
		? NORTH_BAYERN_BEZIRKE.has(props.CC_2.slice(0, 3))
			? 'nordbayern'
			: 'suedbayern'
		: STATE_REGIONS[props.NAME_1];

// Keep the drill sizes honest: a count change here means GADM's file (or a
// district reform) moved under us and the groupings deserve a fresh look
const EXPECTED_REGIONS = {
	north: 23,
	niedersachsen: 45,
	brandenburg: 19,
	'sachsen-anhalt': 14,
	sachsen: 12,
	thueringen: 22,
	nrw: 53,
	hessen: 25,
	'rlp-saarland': 41,
	bw: 42,
	nordbayern: 37,
	suedbayern: 44,
};
const EXPECTED_COUNT = Object.values(EXPECTED_REGIONS).reduce((a, b) => a + b, 0);

const source = await fetchZippedJson(SOURCE);

// "München(KreisfreieStadt)" → "München"; the closing paren is optional
// because Kaiserslautern's suffix hits GADM's name-length truncation
const stripType = (name) => name.replace(/\((KreisfreieStadt|Stadtkreis)\)?$/, '');
const isCity = (props) => ['KreisfreieStadt', 'Stadtkreis'].includes(props.TYPE_2);

const features = source.features.filter((f) => f.properties.NAME_2 !== 'Bodensee');

// Kreise by state+name, for matching each kreisfreie Stadt to a same-named
// surrounding Landkreis it should dissolve into
const kreisByName = new Map(
	features
		.filter((f) => !isCity(f.properties))
		.map((f) => [`${f.properties.NAME_1}|${f.properties.NAME_2}`, f]),
);
const byCode = new Map(features.map((f) => [f.properties.CC_2, f]));
if (byCode.size !== features.length) throw new Error('CC_2 codes are not unique');

const mergedInto = (feature) => {
	const absorbed = MERGED_AWAY[feature.properties.CC_2];
	if (absorbed) return byCode.get(absorbed);
	if (!isCity(feature.properties)) return null;
	return (
		kreisByName.get(`${feature.properties.NAME_1}|${stripType(feature.properties.NAME_2)}`) ?? null
	);
};

// Resolve every feature's dissolve target before rewriting any properties —
// a city's parent Kreis may come earlier in the file
const targets = features.map((feature) => (mergedInto(feature) ?? feature).properties);
const cityMerges = [];
features.forEach((feature, i) => {
	const props = targets[i];
	if (props !== feature.properties) {
		cityMerges.push(`${feature.properties.NAME_2} → ${props.NAME_2} (${props.NAME_1})`);
	}
	feature.properties = {
		key: props.CC_2,
		name: RENAME[props.CC_2] ?? stripType(props.NAME_2),
		region: regionFor(props),
	};
});
console.log(`Dissolving ${cityMerges.length} shapes into their Kreis:`);
for (const merge of cityMerges) console.log(`  ${merge}`);

const distinct = new Map(features.map((f) => [f.properties.key, f.properties]));
if (distinct.size !== EXPECTED_COUNT) {
	throw new Error(`Expected ${EXPECTED_COUNT} Kreise, got ${distinct.size} — source data changed?`);
}
const names = new Set([...distinct.values()].map((p) => p.name));
if (names.size !== distinct.size) throw new Error('District names are not unique after merges');
for (const { name } of distinct.values()) {
	// Anything still space-collapsed ("FrankfurtamMain") is missing a RENAME
	if (/[a-zäöüß][A-ZÄÖÜ]/.test(name) || /\([^)]*$/.test(name)) {
		throw new Error(`Mangled name survived the rename table: ${name}`);
	}
}
const regionCounts = {};
for (const { region } of distinct.values()) regionCounts[region] = (regionCounts[region] ?? 0) + 1;
for (const [region, expected] of Object.entries(EXPECTED_REGIONS)) {
	if (regionCounts[region] !== expected) {
		throw new Error(`Expected ${expected} Kreise in ${region}, got ${regionCounts[region]}`);
	}
}

const result = simplifyAndWrite({
	features,
	output: OUTPUT,
	dissolve: { key: 'key', copyFields: ['name', 'region'] },
	simplify: '25%',
	expectedCount: EXPECTED_COUNT,
});
console.log(`Wrote ${OUTPUT} (${result.features.length} Kreise, ${result.kb} KB)`);
