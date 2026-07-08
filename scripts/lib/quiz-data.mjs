// Shared plumbing for the quiz data scripts (scripts/*-data.mjs): fetching a
// boundary source, and the mapshaper tail every script ends with — write the
// tweaked features to a temp file, optionally dissolve shapes that share a
// key, simplify, and verify the feature count survived the round trip. The
// quiz-specific part (filters, renames, merges, expected counts) stays in
// each script; this is only the machinery around it.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

export const fetchJson = async (url) => {
	console.log(`Fetching ${url} ...`);
	return (await fetch(url)).json();
};

/** Absolute path of a file under public/data, where quiz data files live */
export const dataPath = (file) => new URL(`../../public/data/${file}`, import.meta.url).pathname;

/**
 * Run the features through mapshaper into `output` and return the parsed
 * result (with `kb` for the summary log). `dissolve` merges features sharing
 * `key`, keeping `copyFields`; `simplify` is the weighted retention ("25%").
 * Throws if the output feature count differs from `expectedCount` — a
 * dissolve or simplify that changes the count means the tweaks upstream and
 * the geometry no longer agree.
 */
export function simplifyAndWrite({ features, output, dissolve, simplify, expectedCount }) {
	const tmp = join(tmpdir(), `${basename(output, '.json')}-filtered.json`);
	writeFileSync(tmp, JSON.stringify({ type: 'FeatureCollection', features }));

	mkdirSync(dirname(output), { recursive: true });
	execFileSync(
		'npx',
		[
			'mapshaper',
			tmp,
			...(dissolve
				? ['-dissolve', `fields=${dissolve.key}`, `copy-fields=${dissolve.copyFields.join(',')}`,
					'-each', `delete ${dissolve.key}`]
				: []),
			'-simplify', 'weighted', simplify, 'keep-shapes',
			'-o', 'precision=0.001', 'format=geojson', output,
		],
		{ stdio: 'inherit' },
	);

	const result = JSON.parse(readFileSync(output, 'utf8'));
	if (result.features.length !== expectedCount) {
		throw new Error(`${output}: mapshaper changed the feature count: ${result.features.length}`);
	}
	result.kb = Math.round(statSync(output).size / 1024);
	return result;
}
