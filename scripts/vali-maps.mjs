// Generates a GeoGuessr practice map for every drill region of every map
// quiz (plus each quiz's all-country drill) with Vali
// (https://github.com/slashP/Vali). Each quiz boundary file in public/data
// becomes a set of Vali geometry filters — one map per region, containing
// only street view locations inside that region's quiz shapes — so a drill
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

// Region groupings for the two quizzes whose data files don't carry a region
// property (kabupaten features have a province, US area codes a state).
// Copied from the drill tables in src/components/map-quiz-defs.ts — keep in
// sync; a feature that maps to no region fails the run below.
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
const invert = (groups) =>
	Object.fromEntries(
		Object.entries(groups).flatMap(([region, members]) => members.map((m) => [m, region])),
	);
const KABUPATEN_REGION_BY_PROVINCE = invert(KABUPATEN_REGIONS);
const US_REGION_BY_STATE = invert(US_REGIONS);

// regionOf keys each feature into a drill region; quizzes without one only
// get the all-country map
const QUIZZES = {
	landkreise: { data: 'landkreise.json', country: 'DE', regionOf: (p) => p.region },
	'japan-cities': { data: 'japan-cities.json', country: 'JP', regionOf: (p) => p.region },
	kabupaten: {
		data: 'kabupaten.json',
		country: 'ID',
		regionOf: (p) => KABUPATEN_REGION_BY_PROVINCE[p.province],
	},
	'area-us': {
		data: 'area-codes-us.json',
		country: 'US',
		regionOf: (p) => US_REGION_BY_STATE[p.state],
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
	const { data, country, regionOf } = QUIZZES[quiz];
	const outDir = new URL(`../vali-maps/${quiz}/`, import.meta.url).pathname;
	mkdirSync(outDir, { recursive: true });

	const { features } = JSON.parse(readFileSync(dataPath(data), 'utf8'));
	const regions = new Map();
	if (regionOf) {
		for (const feature of features) {
			const region = regionOf(feature.properties);
			if (!region) {
				throw new Error(
					`${quiz}: no region for ${JSON.stringify(feature.properties)} — is the grouping table above out of sync with map-quiz-defs.ts?`,
				);
			}
			if (!regions.has(region)) regions.set(region, []);
			regions.get(region).push(feature);
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
