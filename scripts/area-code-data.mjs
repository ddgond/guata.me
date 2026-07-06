// Builds public/data/area-codes-{jp,br,us}.json for the AreaCodeQuiz component.
//
// Each helloquiz area-code quiz pairs a boundary file (emily.bz geojson) with
// a hand-maintained question list on helloquiz's API; the questions are the
// source of truth for which codes a shape answers. The geojson's AreaCode
// labels lag it — the US file predates the 2023/24 overlays and mislabels
// Houston ("713/831/282") — so each shape's `code` property is rebuilt from
// the questions: the shape's still-valid geojson codes first (the legacy
// ones), then newer question-only codes ascending. A question can hold an
// array of answer shapes (917 covers both NYC shapes); every listed shape
// carries that code.
//
// US adjustments: the Pacific territories (Guam, American Samoa, Northern
// Marianas) are dropped so 3 codes don't force a world-spanning map, and
// Alaska polygons east of the antimeridian (far Aleutian islets) go for the
// same reason. Geometry is simplified with mapshaper to keep each file a few
// hundred KB.
//
// Usage: node scripts/area-code-data.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const COUNTRIES = {
	jp: {
		source: 'https://emily.bz/geojson/phone/JP_2.json',
		quiz: 'HYn74vk076sz',
		expectedShapes: 59,
		expectedCodes: 59,
	},
	br: {
		source: 'https://emily.bz/geojson/phone/BR_2.json',
		quiz: 'ktGyB5qaJTWb',
		expectedShapes: 67,
		expectedCodes: 67,
	},
	us: {
		source: 'https://emily.bz/geojson/phone/US_3.json',
		quiz: 'iOpDvN7pVTzY',
		expectedShapes: 241,
		expectedCodes: 362,
	},
};

const DROP_STATES = new Set(['GU', 'AS', 'MP']);

mkdirSync(new URL('../public/data', import.meta.url).pathname, { recursive: true });

for (const [country, { source, quiz, expectedShapes, expectedCodes }] of Object.entries(
	COUNTRIES,
)) {
	console.log(`Fetching ${source} ...`);
	const geojson = await (await fetch(source)).json();
	const questions = (
		await (await fetch(`https://helloquiz.app/api/quiz/${quiz}/question`)).json()
	).message;

	// Codes per feature index, in question-list order
	const codesByFeature = new Map();
	for (const question of questions) {
		for (const answer of [question.answer].flat()) {
			const index = Number(answer);
			if (!codesByFeature.has(index)) codesByFeature.set(index, []);
			codesByFeature.get(index).push(question.question);
		}
	}

	let relabeled = 0;
	const features = geojson.features.filter((f, i) => {
		if (DROP_STATES.has(f.properties.STATE)) return false;
		const asked = codesByFeature.get(i);
		if (!asked?.length) {
			throw new Error(`${country}: feature ${i} (${f.properties.AreaCode}) has no questions`);
		}
		const legacy = f.properties.AreaCode.split('/').filter((c) => asked.includes(c));
		const added = asked.filter((c) => !legacy.includes(c)).sort((a, b) => a - b);
		const code = [...legacy, ...added].join('/');
		if (code !== f.properties.AreaCode) relabeled++;
		const { STATE } = f.properties;
		f.properties = STATE ? { code, state: STATE } : { code };
		return true;
	});
	if (relabeled) console.log(`  relabeled ${relabeled} shapes from the quiz's question list`);
	if (features.length !== expectedShapes) {
		throw new Error(
			`${country}: expected ${expectedShapes} shapes, got ${features.length} — source data changed?`,
		);
	}
	const distinctCodes = new Set(features.flatMap((f) => f.properties.code.split('/')));
	if (distinctCodes.size !== expectedCodes) {
		throw new Error(
			`${country}: expected ${expectedCodes} codes, got ${distinctCodes.size} — quiz questions changed?`,
		);
	}

	const alaska = features.find((f) => f.properties.state === 'AK');
	if (alaska) {
		const before = alaska.geometry.coordinates.length;
		alaska.geometry.coordinates = alaska.geometry.coordinates.filter((polygon) =>
			polygon[0].every(([lon]) => lon < 0),
		);
		console.log(
			`  dropped ${before - alaska.geometry.coordinates.length} Alaska polygons east of the antimeridian`,
		);
	}

	const filtered = join(tmpdir(), `area-codes-${country}-filtered.json`);
	writeFileSync(filtered, JSON.stringify({ type: 'FeatureCollection', features }));

	const output = new URL(`../public/data/area-codes-${country}.json`, import.meta.url).pathname;
	execFileSync(
		'npx',
		[
			'mapshaper',
			filtered,
			'-simplify', 'weighted', '40%', 'keep-shapes',
			'-o', 'precision=0.001', 'format=geojson', output,
		],
		{ stdio: 'inherit' },
	);

	const result = JSON.parse(readFileSync(output, 'utf8'));
	if (result.features.length !== expectedShapes) {
		throw new Error(`${country}: simplify changed the feature count: ${result.features.length}`);
	}
	const kb = Math.round(statSync(output).size / 1024);
	console.log(
		`Wrote ${output} (${result.features.length} shapes, ${distinctCodes.size} codes, ${kb} KB)`,
	);
}
