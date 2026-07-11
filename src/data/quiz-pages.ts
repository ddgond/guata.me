// The standalone quiz pages under /geoguessr/quizzes: each entry maps a URL
// slug to a registered map-quiz definition (map-quiz-defs.ts) plus the
// MapQuizShell props the page embeds it with. The listing page groups
// entries by `section` and shows the `stats` line under each link.

export type QuizPageDef = {
	slug: string;
	title: string;
	/** Listing section the quiz appears under */
	section: 'subdivisions' | 'cities' | 'area-codes';
	/** Factual one-liner for the listing: prompt count and drill scopes */
	stats: string;
	/** Intro's first sentence; doubles as the page's meta description */
	description: string;
	/** Rest of the intro paragraph, rendered as HTML after `description` */
	intro: string;
	quiz: string;
	scope?: string;
	pickerLabel?: string;
	labelsToggle?: boolean;
};

const studyPost = (subject: string) =>
	`Read <a href="/blog/memorizing-kabupaten">this post</a> to learn my recommended approach ` +
	`for studying ${subject}.`;
const areaCodeLinks =
	'Read <a href="/blog/memorizing-area-codes">this post</a> to learn my recommended approach ' +
	'for studying these. Manage the Dominic System-based hints ' +
	'<a href="/geoguessr/dominic">here</a>.';

export const quizPages: QuizPageDef[] = [
	{
		slug: 'landkreise',
		title: 'German Landkreise',
		section: 'subdivisions',
		stats: '377 districts · by region, north/central/south, or all of Germany',
		description:
			'377 districts (cities merged with their parents to avoid redundancy), grouped into ' +
			"manageable region sizes so you don't have to learn them all at once.",
		intro: studyPost('subdivisions'),
		quiz: 'landkreise',
		pickerLabel: 'Choose a region',
		labelsToggle: true,
	},
	{
		slug: 'kabupaten',
		title: 'Indonesian Kabupaten',
		section: 'subdivisions',
		stats: '406 kabupaten · by province, region, or all of Indonesia',
		description:
			'All kabupaten covered by street view, grouped into provinces and larger regions so ' +
			"you don't have to learn them all at once.",
		intro: studyPost('these'),
		quiz: 'kabupaten',
		scope: 'combined',
		pickerLabel: 'Choose an area',
		labelsToggle: true,
	},
	{
		slug: 'thai-provinces',
		title: 'Thai Provinces',
		section: 'subdivisions',
		stats: '77 provinces · by region or all of Thailand',
		description:
			"All 77 provinces of Thailand, grouped into regions so you don't have to learn them " +
			'all at once.',
		intro: studyPost('these'),
		quiz: 'thai-provinces',
		pickerLabel: 'Choose a region',
		labelsToggle: true,
	},
	{
		slug: 'thai-provinces-thai',
		title: 'Thai Provinces in Thai',
		section: 'subdivisions',
		stats: '77 provinces · Thai-script prompts · by region or all of Thailand',
		description:
			'The same 77 provinces of Thailand, prompted by their Thai-script names to train ' +
			'recognizing them on the map.',
		intro: 'Prompts are the Thai names; use the hint to reveal the romanized name.',
		quiz: 'thai-provinces-thai',
		pickerLabel: 'Choose a region',
		labelsToggle: true,
	},
	{
		slug: 'belediyesi',
		title: 'Turkish Belediyesi',
		section: 'subdivisions',
		stats: '973 districts · by province, region, or all of Türkiye',
		description:
			"All 973 districts of Türkiye, grouped into provinces and larger regions so you don't " +
			'have to learn them all at once.',
		intro: studyPost('these'),
		quiz: 'belediyesi',
		pickerLabel: 'Choose an area',
		labelsToggle: true,
	},
	{
		slug: 'japan-cities',
		title: 'Japanese Cities',
		section: 'cities',
		stats: '284 cities & wards · by region, east/central/west, or all of Japan',
		description:
			"Every Japanese city with at least 100,000 residents, plus Tokyo's 23 special wards, " +
			"grouped into regions so you don't have to learn them all at once.",
		intro: 'Prompts are the kanji names; use the hint to reveal the romanized name.',
		quiz: 'japan-cities',
		pickerLabel: 'Choose a region',
		labelsToggle: true,
	},
	{
		slug: 'area-codes-us',
		title: 'US Area Codes',
		section: 'area-codes',
		stats: '362 codes · by region or all of the United States',
		description:
			"All US area codes, grouped into regions so you don't have to learn them all at once.",
		intro: areaCodeLinks,
		quiz: 'area-us',
		pickerLabel: 'Choose a region',
	},
	{
		slug: 'area-codes-jp',
		title: 'Japanese Area Codes',
		section: 'area-codes',
		stats: '59 codes · whole country',
		description: 'All Japanese area codes.',
		intro: areaCodeLinks,
		quiz: 'area-jp',
	},
	{
		slug: 'area-codes-br',
		title: 'Brazilian Area Codes',
		section: 'area-codes',
		stats: '67 codes · whole country',
		description: 'All Brazilian area codes.',
		intro: areaCodeLinks,
		quiz: 'area-br',
	},
];
