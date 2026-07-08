// Quiz definitions for the <map-quiz> element: the kabupaten quiz
// (/data/kabupaten.json, regenerate with scripts/kabupaten-data.mjs), the
// Japan/Brazil/US area-code quizzes (/data/area-codes-*.json, regenerate with
// scripts/area-code-data.mjs), the German Landkreise quiz
// (/data/landkreise.json, regenerate with scripts/landkreis-data.mjs), and
// the Japanese cities quiz (/data/japan-cities.json, regenerate with
// scripts/japan-cities-data.mjs). Importing this module registers them all.

import {
	registerQuizzes,
	type BoundsLiteral,
	type ProgressRow,
	type QuizDef,
	type QuizFeature,
} from './map-quiz';
import { dominicStorageKey, mnemonics as defaultMnemonics } from '../data/mnemonics';

// --- shared drill wiring ---------------------------------------------------

// Picker/filter/progress plumbing for quizzes whose only drill is a flat
// regions table plus an all-of-country row (landkreise, US area codes; the
// kabupaten quiz stays bespoke for its nested region/province drills).
// Progress cells are keyed `prefix:region` and `prefix:all`.
const regionDrill = (
	prefix: string,
	regions: Record<string, string>,
	allLabel: string,
	member: (feature: QuizFeature, region: string) => boolean,
): Pick<QuizDef, 'pickerEntries' | 'filter' | 'scopeKey' | 'progressRows'> => ({
	pickerEntries: () => [
		...Object.entries(regions).map(([value, label]) => ({ value, label })),
		{ value: 'all', label: allLabel },
	],
	filter: (_scope, selection, features) =>
		!selection || selection === 'all'
			? features
			: features.filter((f) => member(f, selection)),
	scopeKey: (_scope, selection) => `${prefix}:${selection ?? 'all'}`,
	progressRows: () => [
		...Object.entries(regions).map(([key, label]) => ({ label, key: `${prefix}:${key}` })),
		{ label: allLabel, key: `${prefix}:all` },
	],
});

// --- kabupaten -----------------------------------------------------------

// Region groupings for scope="region" and the optgroups of the province
// picker. Both pickers list entries in this order: regions run
// Java → Nusas → Sulawesi → Kalimantan → Sumatra, and provinces sweep each
// region naturally (west-to-east on Java and the Nusas,
// southeast-to-southwest-to-north on Sulawesi, northeast-to-west on
// Kalimantan, south-to-north on Sumatra).
const KABUPATEN_REGIONS: Record<string, { label: string; provinces: string[] }> = {
	java: {
		label: 'Java',
		provinces: [
			'Banten',
			'DKI Jakarta',
			'Jawa Barat',
			'Jawa Tengah',
			'Daerah Istimewa Yogyakarta',
			'Jawa Timur',
		],
	},
	nusas: {
		label: 'Bali & Nusa Tenggara',
		provinces: ['Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur'],
	},
	sulawesi: {
		label: 'Sulawesi & Maluku Utara',
		provinces: [
			'Sulawesi Tenggara',
			'Sulawesi Selatan',
			'Sulawesi Barat',
			'Sulawesi Tengah',
			'Gorontalo',
			'Sulawesi Utara',
			'Maluku Utara',
		],
	},
	kalimantan: {
		label: 'Kalimantan',
		provinces: [
			'Kalimantan Utara',
			'Kalimantan Timur',
			'Kalimantan Selatan',
			'Kalimantan Tengah',
			'Kalimantan Barat',
		],
	},
	sumatra: {
		label: 'Sumatra',
		provinces: [
			'Lampung',
			'Kepulauan Bangka Belitung',
			'Sumatera Selatan',
			'Bengkulu',
			'Jambi',
			'Riau',
			'Kepulauan Riau',
			'Sumatera Barat',
			'Sumatera Utara',
			'Aceh',
		],
	},
};

const kabupaten: QuizDef = {
	dataUrl: '/data/kabupaten.json',
	attribution:
		'Imagery © Google · Boundaries © <a href="https://gadm.org">GADM</a> via <a href="https://helloquiz.app">helloquiz</a>',
	label: (f) => f.properties.name,
	prompts: (f) => [f.properties.name],
	labelsToggle: true,
	modes: ['borders', 'neither', 'labels'],
	progressKey: 'kabupaten-progress',
	skipConfirmKey: 'kabupaten-skip-toggle-confirm',
	uiKey: (scope) => `kabupaten-ui:${scope}`,
	pickerEntries(scope, features) {
		if (scope === 'region')
			return Object.entries(KABUPATEN_REGIONS).map(([value, region]) => ({
				value,
				label: region.label,
			}));
		const provinces = new Set(features.map((f) => f.properties.province));
		// One dropdown covering every drill: whole country, whole regions, and
		// provinces. Values are the scope keys, so progress lines up with the
		// single-scope embeds in the blog post.
		if (scope === 'combined')
			return [
				{ value: 'all', label: 'All Indonesia' },
				...Object.entries(KABUPATEN_REGIONS).flatMap(([key, region]) => [
					{ value: `region:${key}`, label: `All ${region.label}`, group: region.label },
					...region.provinces
						.filter((province) => provinces.has(province))
						.map((province) => ({
							value: `province:${province}`,
							label: province,
							group: region.label,
						})),
				]),
			];
		return Object.values(KABUPATEN_REGIONS).flatMap((region) =>
			region.provinces
				.filter((province) => provinces.has(province))
				.map((province) => ({ value: province, label: province, group: region.label })),
		);
	},
	filter(scope, selection, features) {
		if (scope === 'combined') {
			if (!selection || selection === 'all') return features;
			[scope, selection] = selection.split(/:(.*)/s) as [string, string];
		}
		if (scope === 'province') return features.filter((f) => f.properties.province === selection);
		if (scope === 'region')
			return features.filter((f) =>
				KABUPATEN_REGIONS[selection!].provinces.includes(f.properties.province),
			);
		return features;
	},
	scopeKey: (scope, selection) =>
		scope === 'combined' ? (selection ?? 'all') : scope === 'all' ? 'all' : `${scope}:${selection}`,
	progressRows(scope, features) {
		if (scope === 'all') return [{ label: 'All Indonesia', key: 'all' }];
		if (scope === 'region')
			return Object.entries(KABUPATEN_REGIONS).map(([key, region]) => ({
				label: region.label,
				key: `region:${key}`,
			}));
		const provinces = new Set(features.map((f) => f.properties.province));
		if (scope === 'combined')
			return [
				{ label: 'All Indonesia', key: 'all' },
				...Object.entries(KABUPATEN_REGIONS).flatMap(([key, region]): ProgressRow[] => [
					{ group: region.label },
					{ label: `All ${region.label}`, key: `region:${key}` },
					...region.provinces
						.filter((province) => provinces.has(province))
						.map((province) => ({ label: province, key: `province:${province}` })),
				]),
			];
		return Object.values(KABUPATEN_REGIONS).flatMap((region) => [
			{ group: region.label },
			...region.provinces
				.filter((province) => provinces.has(province))
				.map((province) => ({ label: province, key: `province:${province}` })),
		]);
	},
};

// --- German Landkreise ---------------------------------------------------

// Labels for the region keys scripts/landkreis-data.mjs writes into the data:
// Bundesländer with the city-states and smallest states folded into a
// neighbor and Bayern split at the Franken/Oberpfalz line, swept roughly
// north-to-south
const LANDKREIS_REGIONS: Record<string, string> = {
	north: 'Schleswig-Holstein, Hamburg & MV',
	niedersachsen: 'Niedersachsen & Bremen',
	brandenburg: 'Berlin & Brandenburg',
	'sachsen-anhalt': 'Sachsen-Anhalt',
	sachsen: 'Sachsen',
	thueringen: 'Thüringen',
	nrw: 'Nordrhein-Westfalen',
	hessen: 'Hessen',
	'rlp-saarland': 'Rheinland-Pfalz & Saarland',
	bw: 'Baden-Württemberg',
	nordbayern: 'Nordbayern (Franken & Oberpfalz)',
	suedbayern: 'Südbayern',
};

const landkreise: QuizDef = {
	dataUrl: '/data/landkreise.json',
	attribution: 'Imagery © Google · Boundaries © <a href="https://gadm.org">GADM</a>',
	label: (f) => f.properties.name,
	prompts: (f) => [f.properties.name],
	labelsToggle: true,
	modes: ['borders', 'neither', 'labels'],
	progressKey: 'landkreis-progress',
	skipConfirmKey: 'landkreis-skip-toggle-confirm',
	uiKey: () => 'landkreis-ui',
	...regionDrill('de', LANDKREIS_REGIONS, 'All Germany', (f, region) => f.properties.region === region),
};

// --- Japanese cities -----------------------------------------------------

// Labels for the region keys scripts/japan-cities-data.mjs writes into the
// data: the classic regions with Tohoku folded into Hokkaido, Kanto split
// into North/Tokyo/South, Shikoku folded into Chugoku, and Okinawa into
// Kyushu, so every drill lands between 19 and 54 cities, swept north to south
const JAPAN_CITY_REGIONS: Record<string, string> = {
	'hokkaido-tohoku': 'Hokkaido & Tohoku',
	'kita-kanto': 'North Kanto',
	tokyo: 'Tokyo',
	'minami-kanto': 'South Kanto',
	chubu: 'Chubu',
	kansai: 'Kansai',
	'chugoku-shikoku': 'Chugoku & Shikoku',
	'kyushu-okinawa': 'Kyushu & Okinawa',
};

const japanCities: QuizDef = {
	dataUrl: '/data/japan-cities.json',
	attribution:
		'Imagery © Google · Boundaries © <a href="https://nlftp.mlit.go.jp/ksj/">MLIT Japan</a>',
	label: (f) => f.properties.name,
	// Prompts are the kanji names; the hint reveals the census romanization
	prompts: (f) => [f.properties.name],
	hint: (_prompt, features) => features[0].properties.romaji,
	tipHint: true,
	labelsToggle: true,
	modes: ['borders', 'neither', 'labels'],
	progressKey: 'japan-city-progress',
	skipConfirmKey: 'japan-city-skip-toggle-confirm',
	uiKey: () => 'japan-city-ui',
	...regionDrill('jp', JAPAN_CITY_REGIONS, 'All Japan', (f, region) => f.properties.region === region),
};

// --- area codes ----------------------------------------------------------

// Mirrors the Dominic builder's load(): the reader's saved list wins when
// present, and corrupted or missing state falls back to the default list.
// Read on every hint so builder edits apply without a reload.
const loadImages = () => {
	let entries: { number: string; person: string; action: string }[] = defaultMnemonics;
	const raw = localStorage.getItem(dominicStorageKey);
	if (raw) {
		try {
			const saved = JSON.parse(raw);
			entries = Object.entries(saved.entries ?? {}).map(([number, entry]) => ({
				number,
				person: String((entry as { person?: string })?.person ?? '').trim(),
				action: String((entry as { action?: string })?.action ?? '').trim(),
			}));
		} catch {
			// Corrupted saved state: hint from the defaults, like the builder
		}
	}
	return new Map(entries.map((entry) => [entry.number, entry]));
};

// Dominic System image for an area code: "6" → the 06 image, "78" → the 78
// image, and 3-digit codes duplicate the middle digit, taking the first
// pair's person and the second pair's action (213 → 21-13).
const dominicHint = (code: string): string => {
	const images = loadImages();
	const digits = code.padStart(2, '0');
	const first = digits.slice(0, 2);
	const second = digits.slice(-2);
	const person = images.get(first)?.person;
	const action = images.get(second)?.action;
	if (person && action) return `${person} ${action}`;
	const missing = [...new Set([person ? null : first, action ? null : second])].filter(
		(pair): pair is string => pair !== null,
	);
	return `No mnemonic saved for ${missing.join(' or ')}`;
};

// Hand-drawn multi-state groups sized for one drill session each (17–54
// codes), swept roughly east-to-west
const US_REGIONS: Record<string, { label: string; states: string[] }> = {
	newEngland: { label: 'New England', states: ['ME', 'NH', 'VT', 'MA', 'RI', 'CT'] },
	midAtlantic: { label: 'Mid-Atlantic', states: ['NY', 'NJ', 'PA', 'DE', 'MD', 'DC'] },
	southeast: {
		label: 'Southeast',
		states: ['VA', 'WV', 'NC', 'SC', 'GA', 'FL', 'PR', 'VI'],
	},
	southCentral: {
		label: 'South Central',
		states: ['KY', 'TN', 'AL', 'MS', 'AR', 'LA', 'OK'],
	},
	texas: { label: 'Texas', states: ['TX'] },
	greatLakes: { label: 'Great Lakes', states: ['OH', 'MI', 'IN', 'IL', 'WI'] },
	plains: { label: 'Plains', states: ['MN', 'IA', 'MO', 'ND', 'SD', 'NE', 'KS'] },
	mountain: { label: 'Mountain', states: ['MT', 'WY', 'CO', 'NM', 'AZ', 'UT', 'ID', 'NV'] },
	pacific: { label: 'Pacific', states: ['WA', 'OR', 'CA', 'AK', 'HI'] },
};

// The all-USA fit would otherwise span Alaska to the Virgin Islands; start
// on the lower 48 and let the player pan out for the rest
const LOWER_48: BoundsLiteral = [
	[24.4, -125.1],
	[49.6, -66.8],
];

const areaCodes = (country: string, countryLabel: string, overrides: Partial<QuizDef>): QuizDef => ({
	dataUrl: `/data/area-codes-${country}.json`,
	attribution:
		'Imagery © Google · Boundaries via <a href="https://super-duper.fr/geojson/">super-duper</a>',
	label: (f) => f.properties.code,
	// Overlay codes share a shape ("203/475") and are asked one at a time
	prompts: (f) => f.properties.code.split('/'),
	hint: dominicHint,
	labelsToggle: false,
	modes: ['borders', 'neither'],
	progressKey: 'area-code-progress',
	skipConfirmKey: 'area-code-skip-toggle-confirm',
	uiKey: () => `area-code-ui:${country}`,
	filter: (_scope, _selection, features) => features,
	scopeKey: () => country,
	progressRows: () => [{ label: countryLabel, key: country }],
	...overrides,
});

registerQuizzes({
	kabupaten,
	landkreise,
	'japan-cities': japanCities,
	'area-jp': areaCodes('jp', 'Japan', {}),
	'area-br': areaCodes('br', 'Brazil', {}),
	'area-us': areaCodes('us', 'United States', {
		// The US boundaries are helloquiz's own edit, not a super-duper mirror
		attribution: 'Imagery © Google · Boundaries via <a href="https://helloquiz.app">helloquiz</a>',
		...regionDrill(
			'us',
			Object.fromEntries(Object.entries(US_REGIONS).map(([key, region]) => [key, region.label])),
			'All United States',
			(f, region) => US_REGIONS[region].states.includes(f.properties.state),
		),
		fitBounds: (_scope, selection) => (!selection || selection === 'all' ? LOWER_48 : null),
	}),
});
