import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			// A project can appear on more than one page, e.g. [dev, games]
			categories: z.array(z.enum(['games', 'dev', '3d'])).nonempty(),
			status: z.enum(['completed', 'active development', 'experiment', 'abandoned']),
			timeframe: z.string(),
			// Higher numbers appear first on the page. `npm run new-project`
			// assigns max+1 so new projects land on top.
			order: z.number(),
			media: z
				.array(
					z.discriminatedUnion('type', [
						z.object({ type: z.literal('image'), src: image() }),
						z.object({ type: z.literal('video'), src: z.string() }),
						z.object({ type: z.literal('youtube'), src: z.string() }),
					])
				)
				.default([]),
			links: z.array(z.object({ href: z.string(), text: z.string() })).default([]),
			files: z
				.array(z.object({ href: z.string(), text: z.string(), size: z.string().optional() }))
				.default([]),
		}),
});

const posts = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
	schema: z
		.object({
			title: z.string(),
			// One-line blurb shown in post listings and the RSS feed
			description: z.string().optional(),
			// Posts tagged `geoguessr` appear on /geoguessr
			tags: z.array(z.string()).default([]),
			// Drafts render in dev but are excluded from production builds.
			// `npm run publish-post` flips this and stamps pubDate.
			draft: z.boolean().default(false),
			pubDate: z.coerce.date().optional(),
		})
		.refine((post) => post.draft || post.pubDate, {
			message: 'Published posts need a pubDate — publish drafts with `npm run publish-post`.',
		}),
});

export const collections = { projects, posts };
