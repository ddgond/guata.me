# Personal Homepage

Build with `npm run build`

Develop with live-updates with `npm run dev`

## Adding a project

Scaffold a new entry with `npm run new-project -- "Project Title" <games|dev|3d>`
(or run it with no arguments to be prompted). This creates a markdown file under
`src/content/projects/<category>/` with every field stubbed out and commented —
fill in the frontmatter, drop any images in `src/images/`, and write the
description as the markdown body. Frontmatter is validated against the schema in
`src/content.config.ts` at build time, so typos fail the build instead of
rendering wrong. Higher `order` values appear first on the page.

## Logo & favicon

`scripts/generate-logo.py [logo|favicon|all]` regenerates
`src/images/dan-dangond-logo.png` (needs Pillow) and `public/favicon.svg`
(needs fontTools).

## GeoGuessr maps for the quizzes

`npm run vali-maps [-- <quiz ...> --force]` generates a GeoGuessr map for
every playable drill of every map quiz — regions, the kabupaten quiz's
provinces, the Landkreise and Japanese cities bands, and each all-country
drill — with
[Vali](https://github.com/slashP/Vali), using the quiz boundary files in
`public/data/` as geometry filters. Vali comes from `nix-shell` (packaged in
`nix/vali.nix`) and downloads its per-country location pool to
`~/.cache/vali` on first use. Maps land in
`vali-maps/<quiz>/<drill>-locations.json`, ready to import into
[map-making.app](https://map-making.app/); drills whose boundaries haven't
changed since the last run are skipped, `--force` regenerates them anyway.
