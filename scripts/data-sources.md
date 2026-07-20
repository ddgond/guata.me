# Boundary data sources: emily.bz vs the originals

Findings from comparing the emily.bz files our data scripts download (helloquiz's
boundary host) against their nearest public originals — GADM for subdivisions,
super-duper.fr (flamby's collection) for area codes. Verified 2026-07 by
`compare-sources.mjs`; re-run it if either side may have drifted (it exits
nonzero when a relationship below no longer holds).

Status as of 2026-07: **the exact-match quizzes are migrated.** Germany
builds from GADM directly and Japan/Brazil from super-duper.fr; their
emily.bz mirrors are the documented fallback if those hosts are down. The US
(hand-edited derivative) and Indonesia (no public counterpart) still build
from emily.bz.

## Per-quiz verdicts

### Germany subdivisions (`landkreis-data.mjs`)

`emily.bz/geojson/subdivision/DE_2.json` is a **byte-identical mirror** of
GADM 4.1's `gadm41_DEU_2.json` (served zipped from geodata.ucdavis.edu).
Everything the script keys on (`CC_2` Kreisschlüssel, `NAME_1`, `TYPE_2`) is
GADM's own schema. **Migrated:** the script fetches GADM directly; swap the
URL back to the emily.bz mirror if geodata.ucdavis.edu is down or throttling.

### Japan & Brazil area codes (`area-code-data.mjs`)

`emily.bz/geojson/phone/JP_2.json` / `BR_2.json` are super-duper's
`japan_areacodes.geojson` / `brazil_areacodes.geojson` with the extra props
stripped (super-duper also carries `City` and label anchor points): same
features, same order, same geometry, same `AreaCode` values. **Migrated:**
the script fetches super-duper directly and reads codes from the `AreaCode`
props — the helloquiz question list matched them 1:1, so it's no longer
fetched for these two. The emily.bz mirrors remain the fallback.

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

### Japanese cities (`japan-cities-data.mjs`)

Built from 国土数値情報 N03 (MLIT's official administrative boundaries),
fetched per-prefecture and pinned to the N03-20210101 edition so the
boundaries match the October 2020 census the city selection is frozen from.
GADM was evaluated first and rejected: `gadm41_JPN_2.json` (which
`emily.bz/geojson/subdivision/JP_2.json` mirrors **byte-identically**)
predates the 2010–2011 municipal mergers (Nagahama at 21% of its real area,
Kuki 24%, Inzai 37%, Tochigi 38%, …) and modern coastal reclamation (Urayasu
is a 1.6 km² sliver of its real 17.3 km²), and its `CC_2`/`NL_NAME_2` fields
are unreliable (no JIS codes; wrong kanji for Kushiro and Misato). N03
carries the JIS municipality code in `N03_007`, which joins the census table
exactly. The census population/name source is e-Stat's
都道府県・市区町村別の主な結果 table
(`e-stat.go.jp/stat-search/file-download?statInfId=000032143614&fileKind=0`),
frozen into the script.

### Turkish belediyesi (`belediye-data.mjs`)

Built from OCHA's COD-AB Türkiye admin-2 boundaries on HDX
(`data.humdata.org/dataset/cod-ab-tur`), which carry the current 973-district
structure (valid 2022-01-01) and stable `adm2_pcode` keys. GADM 4.1 was
evaluated first and rejected: `gadm41_TUR_2.json` (which
`emily.bz/geojson/subdivision/TR_2.json` mirrors **byte-identically**) is a
pre-2008 snapshot — 929 districts, 72 undifferentiated "Merkez" entries,
Antalya unsplit, none of the 2012 metropolitan-reform districts — with
mistyped names ("Kinkkale", "Zinguldak", "ŞultanKoçhisar"). COD-AB's Turkish
names need the dotted/dotless-i restoration and rename table the script
documents; every output name was verified against Turkish Wikipedia titles
and the municipalities' own .bel.tr spellings.

### Turkish provinces (`turkish-provinces-data.mjs`)

The admin-1 layer of the same COD-AB archive: 81 provinces with the same
wrong-locale lowercasing (only Eskişehir needs a rename). The `adm1_pcode`s
follow the license-plate numbering exactly (TUR001 Adana … TUR081 Düzce), so
the plate-code quiz's codes are read straight from them.

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
