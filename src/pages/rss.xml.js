import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
	// Drafts never appear in the feed, not even in dev
	const posts = (await getCollection('posts', (post) => !post.data.draft)).sort(
		(a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime(),
	);
	return rss({
		title: 'Dan Dangond · Blog',
		description: 'Posts from Dan Dangond',
		site: context.site,
		items: posts.map((post) => ({
			title: post.data.title,
			pubDate: post.data.pubDate,
			description: post.data.description,
			link: `/blog/${post.id}/`,
		})),
	});
}
