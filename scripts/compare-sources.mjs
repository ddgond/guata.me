// Compares the emily.bz boundary files our data scripts build from against
// their nearest public originals (GADM for subdivisions, super-duper.fr for
// area codes), so we know per quiz what skipping the helloquiz intermediary
// would take. scripts/data-sources.md records the verdicts; re-run this if
// either side may have drifted. Downloads everything fresh (~15 MB).
//
// Usage: node scripts/compare-sources.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

// geodata.ucdavis.edu (GADM) throttles hard after a few downloads, so retry
// with a pause, and honor COMPARE_SOURCES_CACHE=<dir> holding files by URL
// basename for offline re-runs while iterating
const fetchBytes = async (url) => {
	const cached = process.env.COMPARE_SOURCES_CACHE
		? join(process.env.COMPARE_SOURCES_CACHE, basename(url))
		: null;
	if (cached && existsSync(cached)) {
		console.log(`Using cached ${basename(url)} ...`);
		return readFileSync(cached);
	}
	console.log(`Fetching ${url} ...`);
	for (let attempt = 1; ; attempt++) {
		try {
			const res = await fetch(url);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return Buffer.from(await res.arrayBuffer());
		} catch (err) {
			if (attempt === 3) throw new Error(`${url}: ${err.cause ?? err}`);
			console.log(`  attempt ${attempt} failed (${err.cause ?? err}), retrying in 30s ...`);
			await new Promise((resolve) => setTimeout(resolve, 30_000));
		}
	}
};

// GADM only serves its geojson zipped; unzip -p keeps the bytes untouched so
// the byte-identity check below stays meaningful
const fetchZippedJson = async (url) => {
	const zip = join(tmpdir(), 'compare-sources-gadm.zip');
	writeFileSync(zip, await fetchBytes(url));
	return execFileSync('unzip', ['-p', zip], { maxBuffer: 64 * 1024 * 1024 });
};

const geomKey = (f) => JSON.stringify(f.geometry.coordinates);
const parse = (bytes) => JSON.parse(bytes.toString('utf8'));

const results = [];
const report = (name, ok, detail) => {
	results.push(ok);
	console.log(`${ok ? '✓' : '✗'} ${name}: ${detail}\n`);
};

// --- Germany: emily.bz mirrors GADM 4.1 byte-for-byte --------------------

{
	const emily = await fetchBytes('https://emily.bz/geojson/subdivision/DE_2.json');
	const gadm = await fetchZippedJson(
		'https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_DEU_2.json.zip',
	);
	report(
		'Germany (emily DE_2 vs GADM 4.1 DEU_2)',
		emily.equals(gadm),
		emily.equals(gadm)
			? 'byte-identical — the emily.bz file is an unmodified GADM mirror'
			: 'files differ — the mirror relationship broke, re-inspect before trusting either',
	);
}

// --- Japan & Brazil: emily.bz strips super-duper's extra props -----------

// Same features in the same order; emily.bz keeps only the AreaCode prop
// (super-duper also carries City and label anchors). Geometry + code
// identity is the whole relationship.
for (const [name, emilyUrl, sdUrl] of [
	[
		'Japan',
		'https://emily.bz/geojson/phone/JP_2.json',
		'https://super-duper.fr/geojson/japan_areacodes.geojson',
	],
	[
		'Brazil',
		'https://emily.bz/geojson/phone/BR_2.json',
		'https://super-duper.fr/geojson/brazil_areacodes.geojson',
	],
]) {
	const emily = parse(await fetchBytes(emilyUrl)).features;
	const sd = parse(await fetchBytes(sdUrl)).features;
	const same =
		emily.length === sd.length &&
		emily.every(
			(f, i) =>
				geomKey(f) === geomKey(sd[i]) && f.properties.AreaCode === sd[i].properties.AreaCode,
		);
	report(
		`${name} area codes (emily vs super-duper)`,
		same,
		same
			? `${emily.length} features, geometry and codes identical in the same order`
			: `diverged — ${emily.length} vs ${sd.length} features; compare per-index before trusting`,
	);
}

// --- US: emily.bz is a hand-edited derivative of us_areacodes_3 ----------

// Verified 2026-07: 234/244 emily shapes appear verbatim in super-duper's
// us_areacodes_3.geojson (293 features), 193 of those with the same code;
// the rest are helloquiz's own merges/relabels. This check just watches
// whether that partial overlap collapses (i.e. one side rebuilt its file).
{
	const emily = parse(await fetchBytes('https://emily.bz/geojson/phone/US_3.json')).features;
	const sd = parse(
		await fetchBytes('https://super-duper.fr/geojson/us_areacodes_3.geojson'),
	).features;
	const sdCodeByGeom = new Map(sd.map((f) => [geomKey(f), f.properties.AreaCode]));
	const matched = emily.filter((f) => sdCodeByGeom.has(geomKey(f)));
	const sameCode = matched.filter((f) => sdCodeByGeom.get(geomKey(f)) === f.properties.AreaCode);
	report(
		'US area codes (emily vs super-duper us_areacodes_3)',
		matched.length / emily.length > 0.9,
		`${matched.length}/${emily.length} emily geometries found verbatim in super-duper ` +
			`(${sd.length} features there), ${sameCode.length} with the same code`,
	);
}

// --- Indonesia: no public counterpart -------------------------------------

// Verified 2026-07: emily.bz's ID_2 is a bespoke helloquiz build — simplified
// GADM-family geometry at full float precision (GADM 4.1's own geojson is
// rounded to 4 decimals), custom props (name/province/mhid/isGeo), and the
// post-2012 kabupaten present. Nothing public matches it shape-for-shape.
// This check watches feature counts and confirms the geometry still shares
// nothing with GADM 4.1 (if it ever does, a real migration path opened up).
{
	const emily = parse(await fetchBytes('https://emily.bz/geojson/subdivision/ID_2.json')).features;
	const gadm = parse(
		await fetchZippedJson('https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_IDN_2.json.zip'),
	).features;
	const gadmGeoms = new Set(gadm.map(geomKey));
	const shared = emily.filter((f) => gadmGeoms.has(geomKey(f))).length;
	report(
		'Indonesia (emily ID_2 vs GADM 4.1 IDN_2)',
		emily.length === 510 && shared === 0,
		`emily ${emily.length} features (expect 510), GADM ${gadm.length}; ` +
			`${shared} shared geometries (expect 0 — bespoke helloquiz build, no public counterpart)`,
	);
}

const failed = results.filter((ok) => !ok).length;
console.log(
	failed
		? `${failed} relationship(s) changed since data-sources.md was written`
		: 'All source relationships hold',
);
process.exitCode = failed ? 1 : 0;
