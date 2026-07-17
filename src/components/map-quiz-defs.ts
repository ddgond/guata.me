// Quiz definitions for the <map-quiz> element: the kabupaten quiz
// (/data/kabupaten.json, regenerate with scripts/kabupaten-data.mjs), the
// Japan/Brazil/US area-code quizzes (/data/area-codes-*.json, regenerate with
// scripts/area-code-data.mjs), the German Landkreise quiz
// (/data/landkreise.json, regenerate with scripts/landkreis-data.mjs), and
// the Japanese cities quiz (/data/japan-cities.json, regenerate with
// scripts/japan-cities-data.mjs), the three Thai provinces quizzes —
// romanized, Thai-script, and kilometer-marker abbreviations — (all
// /data/thai-provinces.json, regenerate with scripts/thai-provinces-data.mjs),
// and the Turkish belediyesi quiz (/data/belediyesi.json, regenerate with
// scripts/belediye-data.mjs). Importing this module registers them all.

import {
	registerQuizzes,
	type BoundsLiteral,
	type ProgressRow,
	type QuizDef,
	type QuizFeature,
} from './map-quiz';
// The Thai-script quiz's Font picker faces. Static imports land the
// @font-face rules (a few KB, inlined by Astro) on every page with a quiz
// embed, but each rule is unicode-range-subset and a font file only downloads
// once its family actually renders text — so only that quiz fetches any.
// (Dynamic import would scope the CSS to the one page, but Astro inlines
// css-only dynamic imports while the preload helper still requests the
// unemitted chunks, 404ing on every load.)
import '@fontsource/sarabun/400.css';
import '@fontsource/prompt/400.css';
import '@fontsource/kanit/400.css';
import '@fontsource/charm/400.css';
import '@fontsource/itim/400.css';
import { dominicStorageKey, mnemonics as defaultMnemonics } from '../data/mnemonics';
import { quizPages } from '../data/quiz-pages';

// Share info for the completion Share button, from the standalone-page
// registry: the page title plus the /geoguessr/quizzes/ path the link opens.
// `drill` maps a finished run's scope and picker selection to that page's
// ?drill= value; the default fits quizzes whose picker values are the same
// everywhere, and null omits the param (no-picker quizzes).
const share = (
	quiz: string,
	drill: QuizDef['share']['drill'] = (_scope, selection) => selection ?? 'all',
): QuizDef['share'] => {
	const page = quizPages.find((page) => page.quiz === quiz)!;
	return { title: page.title, path: `/geoguessr/quizzes/${page.slug}`, drill };
};

// --- shared drill wiring ---------------------------------------------------

// Picker/filter/progress plumbing for quizzes whose only drill is a flat
// regions table plus an all-of-country row (landkreise, US area codes; the
// kabupaten quiz stays bespoke for its nested region/province drills).
// Progress cells are keyed `prefix:region` and `prefix:all`. Passing `bands`
// adds a playable tier between the regions and the whole country: the picker
// groups regions under one optgroup per band with an "All <band>" entry, the
// progress table mirrors that grouping, and band cells are keyed
// `prefix:band:<band>` (picker values are `band:<band>`, so region and band
// keys can never collide).
const regionDrill = (
	prefix: string,
	regions: Record<string, string>,
	allLabel: string,
	member: (feature: QuizFeature, region: string) => boolean,
	bands?: Record<string, { label: string; regions: string[] }>,
): Pick<QuizDef, 'pickerEntries' | 'filter' | 'scopeKey' | 'progressRows'> => ({
	pickerEntries: () => [
		...(bands
			? Object.entries(bands).flatMap(([key, band]) => [
					{ value: `band:${key}`, label: `All ${band.label}`, group: band.label },
					...band.regions.map((region) => ({
						value: region,
						label: regions[region],
						group: band.label,
					})),
				])
			: Object.entries(regions).map(([value, label]) => ({ value, label }))),
		{ value: 'all', label: allLabel },
	],
	filter: (_scope, selection, features) => {
		if (!selection || selection === 'all') return features;
		const band = selection.startsWith('band:') ? bands?.[selection.slice(5)] : undefined;
		return band
			? features.filter((f) => band.regions.some((region) => member(f, region)))
			: features.filter((f) => member(f, selection));
	},
	scopeKey: (_scope, selection) => `${prefix}:${selection ?? 'all'}`,
	progressRows: () => [
		...(bands
			? Object.entries(bands).flatMap(([key, band]): ProgressRow[] => [
					{ group: band.label },
					{ label: `All ${band.label}`, key: `${prefix}:band:${key}` },
					...band.regions.map((region) => ({
						label: regions[region],
						key: `${prefix}:${region}`,
					})),
				])
			: Object.entries(regions).map(([key, label]) => ({ label, key: `${prefix}:${key}` }))),
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

// Scope keys double as the combined picker's values, so they also serve as
// share-link drill params no matter which embed a run happened on
const kabupatenScopeKey: QuizDef['scopeKey'] = (scope, selection) =>
	scope === 'combined' ? (selection ?? 'all') : scope === 'all' ? 'all' : `${scope}:${selection}`;

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
	scopeKey: kabupatenScopeKey,
	share: share('kabupaten', kabupatenScopeKey),
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
// Bundesländer with the city-states and Mecklenburg-Vorpommern folded into a
// neighbor, Bayern split at the Franken/Oberpfalz line, and
// Nordrhein-Westfalen split at the Landschaftsverband line, swept roughly
// north-to-south
const LANDKREIS_REGIONS: Record<string, string> = {
	north: 'Schleswig-Holstein, Hamburg & MV',
	niedersachsen: 'Niedersachsen & Bremen',
	brandenburg: 'Berlin & Brandenburg',
	'sachsen-anhalt': 'Sachsen-Anhalt',
	sachsen: 'Sachsen',
	thueringen: 'Thüringen',
	westfalen: 'Westfalen-Lippe',
	rheinland: 'Rheinland',
	hessen: 'Hessen',
	'rheinland-pfalz': 'Rheinland-Pfalz',
	saarland: 'Saarland',
	bw: 'Baden-Württemberg',
	nordbayern: 'Nordbayern (Franken & Oberpfalz)',
	suedbayern: 'Südbayern',
};

// Playable bands across the country between the regions and all-Germany
// tiers, sized 113/141/123 districts. Sachsen goes north (not Thüringen's
// band) to keep Central at a manageable size, so North dips around Thüringen
// rather than being a clean latitude stripe.
const LANDKREIS_BANDS: Record<string, { label: string; regions: string[] }> = {
	north: {
		label: 'North Germany',
		regions: ['north', 'niedersachsen', 'brandenburg', 'sachsen-anhalt', 'sachsen'],
	},
	central: {
		label: 'Central Germany',
		regions: ['thueringen', 'westfalen', 'rheinland', 'hessen', 'rheinland-pfalz', 'saarland'],
	},
	south: {
		label: 'South Germany',
		regions: ['bw', 'nordbayern', 'suedbayern'],
	},
};

const landkreise: QuizDef = {
	dataUrl: '/data/landkreise.json?v=2',
	attribution: 'Imagery © Google · Boundaries © <a href="https://gadm.org">GADM</a>',
	label: (f) => f.properties.name,
	prompts: (f) => [f.properties.name],
	labelsToggle: true,
	modes: ['borders', 'neither', 'labels'],
	progressKey: 'landkreis-progress',
	skipConfirmKey: 'landkreis-skip-toggle-confirm',
	uiKey: () => 'landkreis-ui',
	share: share('landkreise'),
	...regionDrill(
		'de',
		LANDKREIS_REGIONS,
		'All Germany',
		(f, region) => f.properties.region === region,
		LANDKREIS_BANDS,
	),
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

// Playable bands along the archipelago between the regions and all-Japan
// tiers, sized 85/96/103 cities. South Kanto rides with Chubu (not the rest
// of Kanto) to keep the bands near-even, so East ends at Tokyo rather than
// at the usual East/West Japan line.
const JAPAN_CITY_BANDS: Record<string, { label: string; regions: string[] }> = {
	east: {
		label: 'East Japan',
		regions: ['hokkaido-tohoku', 'kita-kanto', 'tokyo'],
	},
	central: {
		label: 'Central Japan',
		regions: ['minami-kanto', 'chubu'],
	},
	west: {
		label: 'West Japan',
		regions: ['kansai', 'chugoku-shikoku', 'kyushu-okinawa'],
	},
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
	share: share('japan-cities'),
	...regionDrill(
		'jp',
		JAPAN_CITY_REGIONS,
		'All Japan',
		(f, region) => f.properties.region === region,
		JAPAN_CITY_BANDS,
	),
};

// --- Thai provinces --------------------------------------------------------

// Labels for the region keys scripts/thai-provinces-data.mjs writes into the
// data: the six standard geographic regions, swept roughly north to south.
// At 5–22 provinces each, every region is a single drill — no bands needed.
const THAI_PROVINCE_REGIONS: Record<string, string> = {
	north: 'North',
	isan: 'Northeast (Isan)',
	central: 'Central',
	west: 'West',
	east: 'East',
	south: 'South',
};

// The data files keep stable URLs across deploys and the host serves them
// without cache-control, so browsers heuristically cache them and can hold a
// stale copy for days. The abbreviations quiz needs the `abbr` property added
// in v2, and a pre-v2 copy leaves it promptless (an instant 0/0 run) — bump
// the version whenever a regeneration changes the properties the defs read.
const THAI_PROVINCES_DATA = '/data/thai-provinces.json?v=2';

const thaiProvinces: QuizDef = {
	dataUrl: THAI_PROVINCES_DATA,
	attribution: 'Imagery © Google · Boundaries © <a href="https://gadm.org">GADM</a>',
	label: (f) => f.properties.name,
	prompts: (f) => [f.properties.name],
	labelsToggle: true,
	modes: ['borders', 'neither', 'labels'],
	progressKey: 'thai-province-progress',
	skipConfirmKey: 'thai-province-skip-toggle-confirm',
	uiKey: () => 'thai-province-ui',
	share: share('thai-provinces'),
	...regionDrill(
		'th',
		THAI_PROVINCE_REGIONS,
		'All Thailand',
		(f, region) => f.properties.region === region,
	),
};

// Thai-script variant: same data and drills, but prompts are the Thai names,
// with the hint revealing the RTGS form — the Japanese-cities arrangement.
// Progress is tracked separately from the romanized quiz.
const thaiProvincesThai: QuizDef = {
	dataUrl: THAI_PROVINCES_DATA,
	attribution: 'Imagery © Google · Boundaries © <a href="https://gadm.org">GADM</a>',
	label: (f) => f.properties.thai,
	prompts: (f) => [f.properties.thai],
	hint: (_prompt, features) => features[0].properties.name,
	tipHint: true,
	// The sign-reading spectrum: looped body text (Sarabun) through loopless
	// Latin-like sans (Prompt, Kanit) to handwritten display (Charm, Itim),
	// imported from @fontsource at the top of this module
	fonts: [
		{ label: 'Default', family: null },
		{ label: 'Sarabun', family: "'Sarabun', sans-serif" },
		{ label: 'Prompt', family: "'Prompt', sans-serif" },
		{ label: 'Kanit', family: "'Kanit', sans-serif" },
		{ label: 'Charm', family: "'Charm', cursive" },
		{ label: 'Itim', family: "'Itim', cursive" },
	],
	labelsToggle: true,
	modes: ['borders', 'neither', 'labels'],
	progressKey: 'thai-province-thai-progress',
	skipConfirmKey: 'thai-province-thai-skip-toggle-confirm',
	uiKey: () => 'thai-province-thai-ui',
	share: share('thai-provinces-thai'),
	...regionDrill(
		'th',
		THAI_PROVINCE_REGIONS,
		'All Thailand',
		(f, region) => f.properties.region === region,
	),
};

// Abbreviations variant: same data and drills, prompted by the official
// two-letter abbreviations from kilometer markers. Bangkok carries no `abbr`
// (markers around the capital use กทม), so it draws on the map — and clicking
// it is a miss — but is never asked. The label pairs the abbreviation with
// the Thai name for explore-mode hovers and wrong-guess callouts; romanized
// names are already on Google's tiles, so the in-quiz hint is what adds them.
const thaiProvincesAbbr: QuizDef = {
	dataUrl: THAI_PROVINCES_DATA,
	attribution: 'Imagery © Google · Boundaries © <a href="https://gadm.org">GADM</a>',
	label: (f) =>
		f.properties.abbr ? `${f.properties.abbr} · ${f.properties.thai}` : f.properties.thai,
	prompts: (f) => (f.properties.abbr ? [f.properties.abbr] : []),
	hint: (_prompt, features) => `${features[0].properties.thai} · ${features[0].properties.name}`,
	labelsToggle: true,
	modes: ['borders', 'neither', 'labels'],
	progressKey: 'thai-province-abbr-progress',
	skipConfirmKey: 'thai-province-abbr-skip-toggle-confirm',
	uiKey: () => 'thai-province-abbr-ui',
	share: share('thai-provinces-abbreviations'),
	...regionDrill(
		'th',
		THAI_PROVINCE_REGIONS,
		'All Thailand',
		(f, region) => f.properties.region === region,
	),
};

// --- Turkish belediyesi ----------------------------------------------------

// Province drills grouped into the seven standard geographic-region bands,
// swept roughly west to east within each band. Provinces run 3–39 districts,
// bands 82–197. A few district names repeat across provinces (Kemer, Kale,
// Pazar, …) exactly as they do on Google's labels; in band and all-Türkiye
// runs the engine folds same-named shapes into one prompt, like overlay area
// codes.
const BELEDIYE_BANDS: Record<string, { label: string; regions: string[] }> = {
	marmara: {
		label: 'Marmara',
		regions: [
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
	},
	aegean: {
		label: 'Aegean',
		regions: ['İzmir', 'Manisa', 'Aydın', 'Muğla', 'Denizli', 'Uşak', 'Kütahya', 'Afyonkarahisar'],
	},
	mediterranean: {
		label: 'Mediterranean',
		regions: [
			'Antalya',
			'Burdur',
			'Isparta',
			'Mersin',
			'Adana',
			'Osmaniye',
			'Hatay',
			'Kahramanmaraş',
		],
	},
	central: {
		label: 'Central Anatolia',
		regions: [
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
	},
	blacksea: {
		label: 'Black Sea',
		regions: [
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
	},
	east: {
		label: 'Eastern Anatolia',
		regions: [
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
	},
	southeast: {
		label: 'Southeastern Anatolia',
		regions: [
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
	},
};

// Province drill keys are the province display names themselves, like the
// kabupaten quiz
const BELEDIYE_PROVINCES: Record<string, string> = Object.fromEntries(
	Object.values(BELEDIYE_BANDS)
		.flatMap((band) => band.regions)
		.map((province) => [province, province]),
);

const belediyesi: QuizDef = {
	dataUrl: '/data/belediyesi.json',
	attribution:
		'Imagery © Google · Boundaries © <a href="https://data.humdata.org/dataset/cod-ab-tur">OCHA COD-AB</a>',
	label: (f) => f.properties.name,
	prompts: (f) => [f.properties.name],
	labelsToggle: true,
	modes: ['borders', 'neither', 'labels'],
	progressKey: 'belediye-progress',
	skipConfirmKey: 'belediye-skip-toggle-confirm',
	uiKey: () => 'belediye-ui',
	share: share('belediyesi'),
	...regionDrill(
		'tr',
		BELEDIYE_PROVINCES,
		'All Türkiye',
		(f, region) => f.properties.province === region,
		BELEDIYE_BANDS,
	),
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

const areaCodes = (
	country: string,
	countryLabel: string,
	overrides: Partial<QuizDef>,
): QuizDef => ({
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
	share: share(`area-${country}`, () => null),
	filter: (_scope, _selection, features) => features,
	scopeKey: () => country,
	progressRows: () => [{ label: countryLabel, key: country }],
	...overrides,
});

registerQuizzes({
	kabupaten,
	landkreise,
	'japan-cities': japanCities,
	'thai-provinces': thaiProvinces,
	'thai-provinces-thai': thaiProvincesThai,
	'thai-provinces-abbreviations': thaiProvincesAbbr,
	belediyesi,
	'area-jp': areaCodes('jp', 'Japan', {}),
	'area-br': areaCodes('br', 'Brazil', {}),
	'area-us': areaCodes('us', 'United States', {
		// The US boundaries are helloquiz's own edit, not a super-duper mirror
		attribution: 'Imagery © Google · Boundaries via <a href="https://helloquiz.app">helloquiz</a>',
		share: share('area-us'),
		...regionDrill(
			'us',
			Object.fromEntries(Object.entries(US_REGIONS).map(([key, region]) => [key, region.label])),
			'All United States',
			(f, region) => US_REGIONS[region].states.includes(f.properties.state),
		),
		fitBounds: (_scope, selection) => (!selection || selection === 'all' ? LOWER_48 : null),
	}),
});
