#!/usr/bin/env node
// Publish a draft post: npm run publish-post -- <slug>
// Flips draft: true → false and stamps today's date as pubDate. With no
// slug, lists the current drafts and prompts for one.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content', 'posts');

const drafts = existsSync(CONTENT_DIR)
	? readdirSync(CONTENT_DIR)
			.filter((f) => f.endsWith('.md'))
			.filter((f) => /^draft:\s*true\b/m.test(readFileSync(join(CONTENT_DIR, f), 'utf8')))
			.map((f) => f.replace(/\.md$/, ''))
	: [];

let [slug] = process.argv.slice(2);
if (!slug) {
	if (!drafts.length) {
		console.error('No drafts to publish.');
		process.exit(1);
	}
	console.log('Drafts:');
	for (const d of drafts) console.log(`  ${d}`);
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	slug = (await rl.question('Slug to publish: ')).trim();
	rl.close();
}

const file = join(CONTENT_DIR, `${slug}.md`);
if (!existsSync(file)) {
	console.error(`${file} not found.${drafts.length ? ` Drafts: ${drafts.join(', ')}` : ''}`);
	process.exit(1);
}

let src = readFileSync(file, 'utf8');
if (!/^draft:\s*true\b/m.test(src)) {
	console.error(`${slug} is already published.`);
	process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
src = src.replace(/^draft:\s*true\b.*$/m, 'draft: false');
if (!/^pubDate:/m.test(src)) {
	// The stub leaves a "# pubDate is stamped by ..." comment to replace;
	// fall back to inserting after the draft line if it was deleted.
	src = /^# pubDate .*$/m.test(src)
		? src.replace(/^# pubDate .*$/m, `pubDate: ${today}`)
		: src.replace(/^draft: false$/m, `draft: false\npubDate: ${today}`);
}
writeFileSync(file, src);

if (!/^description:\s*\S/m.test(src)) {
	console.warn('Note: no description set — listings and the RSS feed will have no blurb.');
}
console.log(`Published ${slug} (pubDate ${today})`);
