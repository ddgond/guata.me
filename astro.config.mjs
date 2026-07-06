import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
	// @astrojs/rss needs this to build absolute URLs in the feed
	site: 'https://guata.me',
	integrations: [mdx()],
});
