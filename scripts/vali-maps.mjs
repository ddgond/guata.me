// Generates a GeoGuessr practice map for every playable drill of every map
// quiz — each quiz's regions, any finer or coarser tiers it drills (the
// kabupaten quiz's provinces, the Landkreise and Japanese cities quizzes'
// bands), and the all-country drill — with Vali
// (https://github.com/slashP/Vali). Each quiz boundary file in public/data
// becomes a set of Vali geometry filters — one map per drill, containing
// only street view locations inside that drill's quiz shapes — so a drill
// you just studied can be played in GeoGuessr with the same boundaries.
//
// Vali is provided by nix-shell (nix/vali.nix) and keeps its per-country
// location pool under $VALI_DOWNLOAD_FOLDER (exported by shell.nix; multi-GB,
// downloaded on first use per country). Outputs land in vali-maps/<quiz>/:
// <region>.json is the Vali map definition, <region>-geometry.json the
// region's shapes, and <region>-locations.json the generated map, ready to
// import into map-making.app or GeoGuessr. A <region>.hash file records the
// definition + geometry that produced the map, so regions whose source hasn't
// changed are skipped on the next run.
//
// Usage: node scripts/vali-maps.mjs [quiz ...] [--force]
//   quiz     one or more of: landkreise, japan-cities, kabupaten, area-us,
//            area-jp, area-br (default: all)
//   --force  regenerate even when the source hash matches

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { dataPath } from './lib/quiz-data.mjs';

// Every map aims for the same size, on the large side of Vali's own examples
// (12k–80k for single countries): locations spread area-proportionally, so a
// big goal is what keeps the smallest shapes (city-Kreise, Tokyo wards) from
// rounding down to zero locations in the all-country maps. Small drills just
// saturate their pool and fall short of the goal, which is fine. The min
// distance is low for the same reason.
const LOCATION_GOAL = 50000;
const MIN_MIN_DISTANCE = 25;

// Drill groupings the data files don't carry directly: kabupaten features
// have a province and US area codes a state (their regions are groups of
// those), and the Landkreise bands are groups of the region property. Copied
// from the drill tables in src/components/map-quiz-defs.ts — keep in sync; a
// feature that maps to no group fails the run below.
const KABUPATEN_REGIONS = {
	java: [
		'Banten',
		'DKI Jakarta',
		'Jawa Barat',
		'Jawa Tengah',
		'Daerah Istimewa Yogyakarta',
		'Jawa Timur',
	],
	nusas: ['Bali', 'Nusa Tenggara Barat', 'Nusa Tenggara Timur'],
	sulawesi: [
		'Sulawesi Tenggara',
		'Sulawesi Selatan',
		'Sulawesi Barat',
		'Sulawesi Tengah',
		'Gorontalo',
		'Sulawesi Utara',
		'Maluku Utara',
	],
	kalimantan: [
		'Kalimantan Utara',
		'Kalimantan Timur',
		'Kalimantan Selatan',
		'Kalimantan Tengah',
		'Kalimantan Barat',
	],
	sumatra: [
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
};
const US_REGIONS = {
	newEngland: ['ME', 'NH', 'VT', 'MA', 'RI', 'CT'],
	midAtlantic: ['NY', 'NJ', 'PA', 'DE', 'MD', 'DC'],
	southeast: ['VA', 'WV', 'NC', 'SC', 'GA', 'FL', 'PR', 'VI'],
	southCentral: ['KY', 'TN', 'AL', 'MS', 'AR', 'LA', 'OK'],
	texas: ['TX'],
	greatLakes: ['OH', 'MI', 'IN', 'IL', 'WI'],
	plains: ['MN', 'IA', 'MO', 'ND', 'SD', 'NE', 'KS'],
	mountain: ['MT', 'WY', 'CO', 'NM', 'AZ', 'UT', 'ID', 'NV'],
	pacific: ['WA', 'OR', 'CA', 'AK', 'HI'],
};
// The band- prefix mirrors the quiz's band: scope keys and keeps the North
// band from colliding with the north region's files
const LANDKREIS_BANDS = {
	'band-north': ['north', 'niedersachsen', 'brandenburg', 'sachsen-anhalt', 'sachsen'],
	'band-central': ['thueringen', 'nrw', 'hessen', 'rlp-saarland'],
	'band-south': ['bw', 'nordbayern', 'suedbayern'],
};
const JAPAN_CITY_BANDS = {
	'band-east': ['hokkaido-tohoku', 'kita-kanto', 'tokyo'],
	'band-central': ['minami-kanto', 'chubu'],
	'band-west': ['kansai', 'chugoku-shikoku', 'kyushu-okinawa'],
};
const invert = (groups) =>
	Object.fromEntries(
		Object.entries(groups).flatMap(([region, members]) => members.map((m) => [m, region])),
	);
const KABUPATEN_REGION_BY_PROVINCE = invert(KABUPATEN_REGIONS);
const US_REGION_BY_STATE = invert(US_REGIONS);
const LANDKREIS_BAND_BY_REGION = invert(LANDKREIS_BANDS);
const JAPAN_CITY_BAND_BY_REGION = invert(JAPAN_CITY_BANDS);

// File-safe map name for drills keyed by a display name ("DKI Jakarta")
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// Each grouping keys every feature into one map per drill of that tier;
// quizzes with no groupings only get the all-country map
const QUIZZES = {
	landkreise: {
		data: 'landkreise.json',
		country: 'DE',
		groupings: [(p) => p.region, (p) => LANDKREIS_BAND_BY_REGION[p.region]],
	},
	'japan-cities': {
		data: 'japan-cities.json',
		country: 'JP',
		groupings: [(p) => p.region, (p) => JAPAN_CITY_BAND_BY_REGION[p.region]],
	},
	kabupaten: {
		data: 'kabupaten.json',
		country: 'ID',
		groupings: [(p) => KABUPATEN_REGION_BY_PROVINCE[p.province], (p) => slug(p.province)],
	},
	'area-us': {
		data: 'area-codes-us.json',
		country: 'US',
		groupings: [(p) => US_REGION_BY_STATE[p.state]],
	},
	'area-jp': { data: 'area-codes-jp.json', country: 'JP' },
	'area-br': { data: 'area-codes-br.json', country: 'BR' },
};

const args = process.argv.slice(2);
const force = args.includes('--force');
const selected = args.filter((arg) => arg !== '--force');
for (const quiz of selected) {
	if (!QUIZZES[quiz]) {
		console.error(`Unknown quiz "${quiz}". Valid quizzes: ${Object.keys(QUIZZES).join(', ')}`);
		process.exit(1);
	}
}
const quizzes = selected.length ? selected : Object.keys(QUIZZES);

// Same default shell.nix exports, so the script also works outside nix-shell
// as long as vali is on the PATH
const downloadBase =
	process.env.VALI_DOWNLOAD_FOLDER ??
	join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'vali');
const env = { ...process.env, VALI_DOWNLOAD_FOLDER: downloadBase };

// A crash is the only failure vali's exit code reports — it exits 0 even on
// validation errors (the handlers set exit code 100 on success, but Program.cs
// never returns it), so generation success is judged by the output file below
const vali = (valiArgs, cwd) => {
	const result = spawnSync('vali', valiArgs, { cwd, env, stdio: 'inherit' });
	if (result.error?.code === 'ENOENT') {
		throw new Error('vali is not on the PATH — run inside nix-shell (see shell.nix)');
	}
	if (result.status !== 0) {
		throw new Error(`vali ${valiArgs.join(' ')} failed (exit code ${result.status})`);
	}
};

// Vali appends "Vali" to the download folder and keeps one directory per
// country; fetch any country we need that isn't there yet
const ensureCountryData = (country) => {
	const dir = join(downloadBase, 'Vali', country);
	if (existsSync(dir) && readdirSync(dir).length > 0) return;
	if (!process.stdin.isTTY) {
		// 'vali download' polls the keyboard for its "press s to stop" and
		// crashes when stdin is not a terminal
		throw new Error(
			`No Vali data for ${country} and downloading needs an interactive terminal — run: vali download --country ${country}`,
		);
	}
	console.log(`No Vali data for ${country} yet, downloading ...`);
	vali(['download', '--country', country]);
	if (!existsSync(dir) || readdirSync(dir).length === 0) {
		throw new Error(`Downloading Vali data for ${country} failed`);
	}
};

let generated = 0;
let skipped = 0;
for (const quiz of quizzes) {
	const { data, country, groupings = [] } = QUIZZES[quiz];
	const outDir = new URL(`../vali-maps/${quiz}/`, import.meta.url).pathname;
	mkdirSync(outDir, { recursive: true });

	const { features } = JSON.parse(readFileSync(dataPath(data), 'utf8'));
	const regions = new Map();
	for (const groupOf of groupings) {
		const groups = new Map();
		for (const feature of features) {
			const group = groupOf(feature.properties);
			if (!group) {
				throw new Error(
					`${quiz}: no group for ${JSON.stringify(feature.properties)} — is a grouping table above out of sync with map-quiz-defs.ts?`,
				);
			}
			if (!groups.has(group)) groups.set(group, []);
			groups.get(group).push(feature);
		}
		for (const [group, groupFeatures] of groups) {
			if (regions.has(group) || group === 'all') {
				throw new Error(`${quiz}: two drills would share the map name "${group}"`);
			}
			regions.set(group, groupFeatures);
		}
	}
	regions.set('all', features);

	for (const [region, regionFeatures] of regions) {
		// Paths inside the definition are relative to outDir (vali runs there:
		// it resolves geometry files against the cwd and writes
		// <definition>-locations.json next to the definition file)
		const definition = {
			countryCodes: [country],
			distributionStrategy: {
				key: 'FixedCountByMaxMinDistance',
				locationCountGoal: LOCATION_GOAL,
				minMinDistance: MIN_MIN_DISTANCE,
				// Without this, the goal is split across the country's
				// subdivisions before the geometry filter applies, and regional
				// maps come out nearly empty
				treatCountriesAsSingleSubdivision: [country],
			},
			geometryFilters: [{ filePath: `${region}-geometry.json` }],
		};
		// A location qualifies when it falls inside any feature, so the quiz
		// shapes can go in as-is; properties are dropped (Vali only reads
		// geometry) to keep the hash blind to prop-only changes
		const geometry = {
			type: 'FeatureCollection',
			features: regionFeatures.map((f) => ({
				type: 'Feature',
				properties: {},
				geometry: f.geometry,
			})),
		};

		const hash = createHash('sha256')
			.update(JSON.stringify([definition, geometry]))
			.digest('hex');
		const hashFile = join(outDir, `${region}.hash`);
		const locationsFile = join(outDir, `${region}-locations.json`);
		if (
			!force &&
			existsSync(locationsFile) &&
			existsSync(hashFile) &&
			readFileSync(hashFile, 'utf8').trim() === hash
		) {
			console.log(`${quiz}/${region}: unchanged, skipping (--force to regenerate)`);
			skipped++;
			continue;
		}

		ensureCountryData(country);
		writeFileSync(join(outDir, `${region}-geometry.json`), JSON.stringify(geometry));
		writeFileSync(join(outDir, `${region}.json`), JSON.stringify(definition, null, '\t') + '\n');
		console.log(`${quiz}/${region}: generating from ${regionFeatures.length} shapes ...`);
		// Cleared first because a fresh output file is the only success signal
		// vali gives (see above)
		rmSync(locationsFile, { force: true });
		vali(['generate', '--file', `${region}.json`], outDir);

		if (!existsSync(locationsFile)) {
			throw new Error(
				`${quiz}/${region}: vali wrote no ${region}-locations.json — see its output above`,
			);
		}
		const count = JSON.parse(readFileSync(locationsFile, 'utf8')).length;
		if (count === 0) {
			console.warn(`${quiz}/${region}: WARNING — 0 locations generated, not caching`);
			continue;
		}
		writeFileSync(hashFile, hash + '\n');
		console.log(
			`${quiz}/${region}: ${count} locations → vali-maps/${quiz}/${region}-locations.json`,
		);
		generated++;
	}
}
console.log(`Done: ${generated} map(s) generated, ${skipped} unchanged.`);
