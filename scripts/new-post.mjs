#!/usr/bin/env node
// Scaffold a new blog post: npm run new-post -- "Post Title" [tag1,tag2]
// Prompts for anything not passed as an argument. Posts start as drafts
// (no pubDate); publish with `npm run publish-post -- <slug>`.

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content', 'posts');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

let [title, tags] = process.argv.slice(2);
if (!title) title = (await rl.question('Post title: ')).trim();
if (tags === undefined) tags = (await rl.question('Tags (comma-separated, optional): ')).trim();
rl.close();

if (!title) {
	console.error('A title is required.');
	process.exit(1);
}

const slug = title
	.toLowerCase()
	.replace(/[^a-z0-9]+/g, '-')
	.replace(/^-+|-+$/g, '');

const tagList = tags
	.split(',')
	.map((t) => t.trim())
	.filter(Boolean);

mkdirSync(CONTENT_DIR, { recursive: true });

const file = join(CONTENT_DIR, `${slug}.md`);
if (existsSync(file)) {
	console.error(`${file} already exists.`);
	process.exit(1);
}

const stub = `---
title: ${title}
# description: One-line blurb shown in post listings and the RSS feed — uncomment and write it.
tags: [${tagList.join(', ')}] # posts tagged geoguessr appear on /geoguessr
draft: true # drafts render in dev but are excluded from production builds
# pubDate is stamped by \`npm run publish-post -- ${slug}\`
---

Write the post here — it's markdown, so paragraphs, links, and formatting all
work. Delete these instructions when done.
`;

writeFileSync(file, stub);
console.log(`Created ${file} (draft — publish with \`npm run publish-post -- ${slug}\`)`);
