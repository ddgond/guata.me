# Boundary data sources: emily.bz vs the originals

Findings from comparing the emily.bz files our data scripts download (helloquiz's
boundary host) against their nearest public originals — GADM for subdivisions,
super-duper.fr (flamby's collection) for area codes. Verified 2026-07 by
`compare-sources.mjs`; re-run it if either side may have drifted (it exits
nonzero when a relationship below no longer holds).

Decision as of 2026-07: **no migration.** All five quizzes keep building from
emily.bz. This doc exists so we know our fallbacks if emily.bz disappears, and
which direct sources future quizzes can pull from without waiting for a
helloquiz quiz to exist.

## Per-quiz verdicts

### Germany subdivisions (`landkreis-data.mjs`)

`emily.bz/geojson/subdivision/DE_2.json` is a **byte-identical mirror** of
GADM 4.1's `gadm41_DEU_2.json` (served zipped from geodata.ucdavis.edu).
Migration is a URL swap plus an unzip step. Everything the script keys on
(`CC_2` Kreisschlüssel, `NAME_1`, `TYPE_2`) is GADM's own schema.

### Japan & Brazil area codes (`area-code-data.mjs`)

`emily.bz/geojson/phone/JP_2.json` / `BR_2.json` are super-duper's
`japan_areacodes.geojson` / `brazil_areacodes.geojson` with the extra props
stripped (super-duper also carries `City` and label anchor points): same
features, same order, same geometry, same `AreaCode` values. Migration is a
URL swap. The helloquiz question API would still be needed only if we want
their curated question lists; for JP/BR the codes in the geojson match the
questions 1:1 already.

### US area codes (`area-code-data.mjs`)

`emily.bz/geojson/phone/US_3.json` (244 features) is a **hand-edited
derivative** of super-duper's `us_areacodes_3.geojson` (293 features): 234 of
244 emily shapes appear verbatim there, but only 193 keep the same code — the
rest are helloquiz's own merges and overlay relabels, and our script further
rebuilds every shape's codes from the helloquiz question API (the geojson
labels lag the overlay reality). Migration would mean redoing that curation
against super-duper's file, which itself carries newer splits. Highest-cost
migration of the five; also the least urgent, since two independent hosts
would both have to vanish.

### Indonesia kabupaten (`kabupaten-data.mjs`)

`emily.bz/geojson/subdivision/ID_2.json` has **no public counterpart**. It is
a bespoke helloquiz build: GADM-family geometry simplified to ~1% of the
vertices but kept at full float precision (GADM 4.1's own geojson is rounded
to 4 decimals — zero shared geometry), custom props (`name`, `province`,
`mhid`, `isGeo`), and the post-2012 kabupaten (Pangandaran, Malaka, Mahakam
Ulu, …) that GADM 3.6 lacked. Neither GADM 4.1/3.6 nor super-duper's
`indonesia_kabupaten_final.geojson` (306 features, different schema) matches
it. Migration would be a full rebuild from GADM 4.1: re-keying the script's
index-based EXCLUDE/INCLUDE/PROMOTE sets to `GID_2` codes and re-deriving the
street-view coverage curation that `isGeo` encodes. Archive this file if
emily.bz ever looks shaky.

## Sources for future quizzes

- **Subdivisions**: GADM 4.1 directly
  (`https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_<ISO3>_<level>.json.zip`).
  Stable IDs in `GID_<level>`/`CC_<level>`; Japan's municipalities are level 2.
  The server throttles hard after a few downloads — cache locally while
  iterating.
- **Area codes / postcodes**: super-duper.fr directly
  (`https://super-duper.fr/geojson/<country>_areacodes.geojson`, ~40
  countries, plus postcodes and more). Codes live in feature properties, so
  no helloquiz question API needed.
- Attribution for GADM-direct quizzes drops the "via helloquiz" credit;
  super-duper files should credit flamby's site.
