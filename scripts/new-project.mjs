#!/usr/bin/env node
// Scaffold a new project entry: npm run new-project -- "Project Title" <games|dev|3d>
// Prompts for anything not passed as an argument. The new project gets
// order = max + 1 within its category so it appears at the top of the page.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';

const CATEGORIES = ['games', 'dev', '3d'];
const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content', 'projects');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

let [title, category] = process.argv.slice(2);
if (!title) title = (await rl.question('Project title: ')).trim();
while (!CATEGORIES.includes(category)) {
	category = (await rl.question(`Category (${CATEGORIES.join('/')}): `)).trim();
}
rl.close();

if (!title) {
	console.error('A title is required.');
	process.exit(1);
}

const slug = title
	.toLowerCase()
	.replace(/[^a-z0-9]+/g, '-')
	.replace(/^-+|-+$/g, '');

const categoryDir = join(CONTENT_DIR, category);
mkdirSync(categoryDir, { recursive: true });

const file = join(categoryDir, `${slug}.md`);
if (existsSync(file)) {
	console.error(`${file} already exists.`);
	process.exit(1);
}

// order = max + 1 among projects in this category → new project renders first.
// Projects can list multiple categories, so scan every directory and match on
// the frontmatter rather than trusting the directory a file lives in.
const maxOrder = CATEGORIES.flatMap((dir) => {
	const d = join(CONTENT_DIR, dir);
	if (!existsSync(d)) return [];
	return readdirSync(d)
		.filter((f) => f.endsWith('.md'))
		.map((f) => readFileSync(join(d, f), 'utf8'));
})
	.filter((src) =>
		src
			.match(/^categories:\s*\[([^\]]*)\]/m)?.[1]
			.split(',')
			.map((c) => c.trim())
			.includes(category)
	)
	.map((src) => Number(src.match(/^order:\s*(\d+)/m)?.[1] ?? 0))
	.reduce((a, b) => Math.max(a, b), 0);

const stub = `---
title: ${title}
categories: [${category}] # a project can appear on more than one page, e.g. [dev, games]
status: active development # one of: completed | active development | experiment | abandoned
timeframe: Month Year – present # freeform display text, e.g. "July 2025" or "July 2025 – present"
order: ${maxOrder + 1} # higher numbers appear first on the page
media: # any mix of the three types below, shown in order; delete unused examples
  - type: image
    src: ../../../images/REPLACE-ME.png # put the image in src/images/
  # - type: video
  #   src: /videos/REPLACE-ME.mp4 # put the video in public/videos/
  # - type: youtube
  #   src: https://www.youtube.com/embed/VIDEO_ID
links: # external links shown under the description; use [] if none
  - href: https://example.com
    text: Website
files: [] # downloadable files from public/files/, e.g. { href: /files/x.zip, text: x.zip }
---

Write the project description here — it's markdown, so paragraphs, links, and
formatting all work. Delete these instructions when done.
`;

writeFileSync(file, stub);
console.log(`Created ${file} (order ${maxOrder + 1})`);
