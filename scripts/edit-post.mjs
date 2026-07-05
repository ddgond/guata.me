#!/usr/bin/env node
// Edit a blog post: npm run edit-post [-- <slug>]
// With no slug, lists the current drafts and prompts to pick one, then
// opens the post in your editor ($VISUAL or $EDITOR).

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content', 'posts');

const editor = process.env.VISUAL || process.env.EDITOR;
if (!editor) {
	console.error('Set $VISUAL or $EDITOR to your editor command first.');
	process.exit(1);
}

let [slug] = process.argv.slice(2);
if (!slug) {
	const drafts = existsSync(CONTENT_DIR)
		? readdirSync(CONTENT_DIR)
				.filter((f) => f.endsWith('.md'))
				.filter((f) => /^draft:\s*true\b/m.test(readFileSync(join(CONTENT_DIR, f), 'utf8')))
				.map((f) => f.replace(/\.md$/, ''))
		: [];
	if (!drafts.length) {
		console.error('No drafts to edit — start one with `npm run new-post`.');
		process.exit(1);
	}
	console.log('Drafts:');
	drafts.forEach((d, i) => console.log(`  ${i + 1}. ${d}`));
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	const answer = (await rl.question(`Edit which? (1-${drafts.length} or slug): `)).trim();
	rl.close();
	slug = /^\d+$/.test(answer) ? drafts[Number(answer) - 1] : answer;
	if (!slug) {
		console.error('Invalid selection.');
		process.exit(1);
	}
}

const file = join(CONTENT_DIR, `${slug}.md`);
if (!existsSync(file)) {
	console.error(`${file} not found.`);
	process.exit(1);
}

// $EDITOR may include flags (e.g. "code --wait"), so run through the shell.
const { status } = spawnSync(`${editor} ${JSON.stringify(file)}`, { shell: true, stdio: 'inherit' });
process.exit(status ?? 0);
