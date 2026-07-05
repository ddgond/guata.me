import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	// @astrojs/rss needs this to build absolute URLs in the feed
	site: 'https://guata.me',
});
