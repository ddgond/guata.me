#!/usr/bin/env node
// Manage blog posts: npm run blog -- <new|edit|publish> [args]
//   new "Title" [tag1,tag2]  scaffold a draft (no pubDate until published)
//   edit [slug]              open a post in $VISUAL/$EDITOR; draft picker if no slug
//   publish [slug]           set draft: false and stamp pubDate; draft picker if no slug
// Bare `npm run blog` asks which of the three you want.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content', 'posts');

const fail = (msg) => {
	console.error(msg);
	process.exit(1);
};

// rl.question drops lines that arrive between two questions (piped input EOFs
// and closes the interface mid-flow), so queue lines ourselves and prompt
// manually.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pendingLines = [];
const waiters = [];
let inputClosed = false;
rl.on('line', (line) => {
	const waiter = waiters.shift();
	waiter ? waiter(line) : pendingLines.push(line);
});
rl.on('close', () => {
	inputClosed = true;
	for (const waiter of waiters.splice(0)) waiter(null);
});

async function ask(prompt) {
	process.stdout.write(prompt);
	const line =
		pendingLines.shift() ??
		(inputClosed ? null : await new Promise((resolve) => waiters.push(resolve)));
	if (line === null) fail('\nNo input — aborted.');
	return line.trim();
}

const listDrafts = () =>
	existsSync(CONTENT_DIR)
		? readdirSync(CONTENT_DIR)
				.filter((f) => f.endsWith('.mdx'))
				.filter((f) => /^draft:\s*true\b/m.test(readFileSync(join(CONTENT_DIR, f), 'utf8')))
				.map((f) => f.replace(/\.mdx$/, ''))
		: [];

// Numbered picker over the current drafts; answer with a number or a slug.
async function pickDraft(verb) {
	const drafts = listDrafts();
	if (!drafts.length) fail('No drafts — start one with `npm run blog -- new`.');
	console.log('Drafts:');
	drafts.forEach((d, i) => console.log(`  ${i + 1}. ${d}`));
	const answer = await ask(`${verb} which? (1-${drafts.length} or slug): `);
	const slug = /^\d+$/.test(answer) ? drafts[Number(answer) - 1] : answer;
	if (!slug) fail('Invalid selection.');
	return slug;
}

const postFile = (slug) => {
	const file = join(CONTENT_DIR, `${slug}.mdx`);
	if (!existsSync(file)) fail(`${file} not found.`);
	return file;
};

function openInEditor(file) {
	const editor = process.env.VISUAL || process.env.EDITOR;
	if (!editor) fail('Set $VISUAL or $EDITOR to your editor command first.');
	// $EDITOR may include flags (e.g. "code --wait"), so run through the shell.
	const { status } = spawnSync(`${editor} ${JSON.stringify(file)}`, { shell: true, stdio: 'inherit' });
	return status ?? 0;
}

async function cmdNew(title, tags) {
	if (!title) title = await ask('Post title: ');
	if (tags === undefined) tags = await ask('Tags (comma-separated, optional): ');
	if (!title) fail('A title is required.');

	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	const tagList = tags
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);

	mkdirSync(CONTENT_DIR, { recursive: true });
	const file = join(CONTENT_DIR, `${slug}.mdx`);
	if (existsSync(file)) fail(`${file} already exists.`);

	const stub = `---
title: ${title}
# description: One-line blurb shown in post listings and the RSS feed — uncomment and write it.
tags: [${tagList.join(', ')}] # posts tagged geoguessr appear on /geoguessr
draft: true # drafts render in dev but are excluded from production builds
# pubDate is stamped by \`npm run blog -- publish ${slug}\`
---

Write the post here — it's MDX, so markdown formatting works and Astro
components can be imported. Delete these instructions when done.
`;
	writeFileSync(file, stub);
	console.log(`Created ${file} (draft — publish with \`npm run blog -- publish ${slug}\`)`);

	const open = (await ask('Open in editor? [Y/n] ')).toLowerCase();
	if (open === '' || open === 'y' || open === 'yes') return openInEditor(file);
	return 0;
}

async function cmdEdit(slug) {
	// The picker covers drafts (the working set); pass a slug to edit any post.
	if (!slug) slug = await pickDraft('Edit');
	return openInEditor(postFile(slug));
}

async function cmdPublish(slug) {
	if (!slug) slug = await pickDraft('Publish');
	const file = postFile(slug);

	let src = readFileSync(file, 'utf8');
	if (!/^draft:\s*true\b/m.test(src)) fail(`${slug} is already published.`);

	// A post can't publish without a listing/RSS blurb; prompt for one if missing.
	if (!/^description:\s*\S/m.test(src)) {
		const description = await ask('Description (blurb for listings and RSS; empty aborts): ');
		if (!description) fail(`Aborted — ${slug} left untouched.`);
		src = /^# description: .*$/m.test(src)
			? src.replace(/^# description: .*$/m, `description: ${description}`)
			: src.replace(/^title: .*$/m, `$&\ndescription: ${description}`);
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
	console.log(`Published ${slug} (pubDate ${today})`);
	return 0;
}

const COMMANDS = { new: cmdNew, edit: cmdEdit, publish: cmdPublish };

let [command, ...args] = process.argv.slice(2);
if (!command) {
	command = (await ask('What do you want to do? (new/edit/publish): ')).toLowerCase();
}
if (!COMMANDS[command]) {
	console.error(
		'Usage: npm run blog -- <new|edit|publish>\n' +
			'  new "Title" [tag1,tag2]  scaffold a draft\n' +
			'  edit [slug]              open a post in your editor\n' +
			'  publish [slug]           set draft: false and stamp pubDate'
	);
	process.exit(1);
}
const code = await COMMANDS[command](...args);
rl.close();
process.exit(code);
