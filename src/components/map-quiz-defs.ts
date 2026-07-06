// Quiz definitions for the <map-quiz> element: the kabupaten quiz
// (/data/kabupaten.json, regenerate with scripts/kabupaten-data.mjs) and the
// Japan/Brazil/US area-code quizzes (/data/area-codes-*.json, regenerate with
// scripts/area-code-data.mjs). Importing this module registers them all.

import { registerQuizzes, type BoundsLiteral, type QuizDef, type QuizFeature } from './map-quiz';

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
		return Object.values(KABUPATEN_REGIONS).flatMap((region) =>
			region.provinces
				.filter((province) => provinces.has(province))
				.map((province) => ({ value: province, label: province, group: region.label })),
		);
	},
	filter(scope, selection, features) {
		if (scope === 'province') return features.filter((f) => f.properties.province === selection);
		if (scope === 'region')
			return features.filter((f) =>
				KABUPATEN_REGIONS[selection!].provinces.includes(f.properties.province),
			);
		return features;
	},
	scopeKey: (scope, selection) => (scope === 'all' ? 'all' : `${scope}:${selection}`),
	progressRows(scope, features) {
		if (scope === 'all') return [{ label: 'All Indonesia', key: 'all' }];
		if (scope === 'region')
			return Object.entries(KABUPATEN_REGIONS).map(([key, region]) => ({
				label: region.label,
				key: `region:${key}`,
			}));
		const provinces = new Set(features.map((f) => f.properties.province));
		return Object.values(KABUPATEN_REGIONS).flatMap((region) => [
			{ group: region.label },
			...region.provinces
				.filter((province) => provinces.has(province))
				.map((province) => ({ label: province, key: `province:${province}` })),
		]);
	},
};

// --- area codes ----------------------------------------------------------

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
	attribution: 'Imagery © Google · Boundaries via <a href="https://helloquiz.app">helloquiz</a>',
	label: (f) => f.properties.code,
	// Overlay codes share a shape ("203/475") and are asked one at a time
	prompts: (f) => f.properties.code.split('/'),
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
	'area-jp': areaCodes('jp', 'Japan', {}),
	'area-br': areaCodes('br', 'Brazil', {}),
	'area-us': areaCodes('us', 'United States', {
		pickerEntries: () => [
			...Object.entries(US_REGIONS).map(([value, region]) => ({ value, label: region.label })),
			{ value: 'all', label: 'All United States' },
		],
		filter: (_scope, selection, features) =>
			!selection || selection === 'all'
				? features
				: features.filter((f: QuizFeature) =>
						US_REGIONS[selection].states.includes(f.properties.state),
					),
		scopeKey: (_scope, selection) => `us:${selection ?? 'all'}`,
		progressRows: () => [
			...Object.entries(US_REGIONS).map(([key, region]) => ({
				label: region.label,
				key: `us:${key}`,
			})),
			{ label: 'All United States', key: 'us:all' },
		],
		fitBounds: (_scope, selection) => (!selection || selection === 'all' ? LOWER_48 : null),
	}),
});
