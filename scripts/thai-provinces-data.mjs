// Builds public/data/thai-provinces.json for the Thai provinces quiz.
//
// Downloads the GADM 4.1 level-1 boundaries of Thailand: all 77 provinces
// (76 changwat plus Bangkok), one feature each, so no dissolving is needed.
// GADM's NAME_1 values arrive space-collapsed ("AmnatCharoen"); display names
// are recovered by splitting at the case boundaries, which yields the split
// RTGS forms Google's map labels use ("Buri Ram", "Chon Buri", "Si Sa Ket").
// A rename table covers the two exceptions: Bangkok Metropolis → Bangkok,
// and Phangnga (fused in GADM, no case boundary to split) → Phang Nga. CC_1
// can't key that table (GADM leaves it "NA" for Bueng Kan and Chanthaburi),
// so it's keyed by NAME_1, which is unique.
//
// Each feature carries { name, thai, region, abbr }: `thai` is the Thai-script
// name from the table below (checked against GADM's NL_NAME_1 where it has
// one), for the Thai-script variant of the quiz, region is one of the six
// standard geographic regions (the National Geographical Committee grouping):
// North, Northeast (Isan), Central, West, East, South, and `abbr` is the
// official two-letter abbreviation seen on kilometer markers — every province
// except Bangkok, which the abbreviations quiz leaves unprompted. The
// membership table below lists every province by display name and doubles as
// the check that the source still contains exactly the 77 provinces we
// expect.
//
// Usage: node scripts/thai-provinces-data.mjs

import { dataPath, fetchZippedJson, simplifyAndWrite } from './lib/quiz-data.mjs';

const SOURCE = 'https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_THA_1.json.zip';
const OUTPUT = dataPath('thai-provinces.json');

// The two provinces where the case-split of GADM's NAME_1 isn't the display
// name, keyed by NAME_1
const RENAME = {
	BangkokMetropolis: 'Bangkok',
	Phangnga: 'Phang Nga',
};

// The six-region membership by display name, each region swept roughly
// north-to-south, west-to-east
const REGIONS = {
	north: [
		'Mae Hong Son',
		'Chiang Rai',
		'Chiang Mai',
		'Phayao',
		'Nan',
		'Lamphun',
		'Lampang',
		'Phrae',
		'Uttaradit',
	],
	isan: [
		'Loei',
		'Nong Khai',
		'Bueng Kan',
		'Udon Thani',
		'Nong Bua Lam Phu',
		'Sakon Nakhon',
		'Nakhon Phanom',
		'Khon Kaen',
		'Kalasin',
		'Mukdahan',
		'Chaiyaphum',
		'Maha Sarakham',
		'Roi Et',
		'Yasothon',
		'Amnat Charoen',
		'Nakhon Ratchasima',
		'Buri Ram',
		'Surin',
		'Si Sa Ket',
		'Ubon Ratchathani',
	],
	central: [
		'Sukhothai',
		'Phitsanulok',
		'Kamphaeng Phet',
		'Phichit',
		'Phetchabun',
		'Nakhon Sawan',
		'Uthai Thani',
		'Chai Nat',
		'Sing Buri',
		'Lop Buri',
		'Suphan Buri',
		'Ang Thong',
		'Saraburi',
		'Phra Nakhon Si Ayutthaya',
		'Nakhon Pathom',
		'Pathum Thani',
		'Nonthaburi',
		'Nakhon Nayok',
		'Bangkok',
		'Samut Sakhon',
		'Samut Prakan',
		'Samut Songkhram',
	],
	west: ['Tak', 'Kanchanaburi', 'Ratchaburi', 'Phetchaburi', 'Prachuap Khiri Khan'],
	east: ['Prachin Buri', 'Sa Kaeo', 'Chachoengsao', 'Chon Buri', 'Rayong', 'Chanthaburi', 'Trat'],
	south: [
		'Chumphon',
		'Ranong',
		'Surat Thani',
		'Phang Nga',
		'Phuket',
		'Krabi',
		'Nakhon Si Thammarat',
		'Trang',
		'Phatthalung',
		'Satun',
		'Songkhla',
		'Pattani',
		'Yala',
		'Narathiwat',
	],
};

// Thai-script names by display name, matching the Thai labels on Google's
// tiles (Bangkok is the full ceremonial-short form กรุงเทพมหานคร, as labeled)
const THAI = {
	'Mae Hong Son': 'แม่ฮ่องสอน',
	'Chiang Rai': 'เชียงราย',
	'Chiang Mai': 'เชียงใหม่',
	Phayao: 'พะเยา',
	Nan: 'น่าน',
	Lamphun: 'ลำพูน',
	Lampang: 'ลำปาง',
	Phrae: 'แพร่',
	Uttaradit: 'อุตรดิตถ์',
	Loei: 'เลย',
	'Nong Khai': 'หนองคาย',
	'Bueng Kan': 'บึงกาฬ',
	'Udon Thani': 'อุดรธานี',
	'Nong Bua Lam Phu': 'หนองบัวลำภู',
	'Sakon Nakhon': 'สกลนคร',
	'Nakhon Phanom': 'นครพนม',
	'Khon Kaen': 'ขอนแก่น',
	Kalasin: 'กาฬสินธุ์',
	Mukdahan: 'มุกดาหาร',
	Chaiyaphum: 'ชัยภูมิ',
	'Maha Sarakham': 'มหาสารคาม',
	'Roi Et': 'ร้อยเอ็ด',
	Yasothon: 'ยโสธร',
	'Amnat Charoen': 'อำนาจเจริญ',
	'Nakhon Ratchasima': 'นครราชสีมา',
	'Buri Ram': 'บุรีรัมย์',
	Surin: 'สุรินทร์',
	'Si Sa Ket': 'ศรีสะเกษ',
	'Ubon Ratchathani': 'อุบลราชธานี',
	Sukhothai: 'สุโขทัย',
	Phitsanulok: 'พิษณุโลก',
	'Kamphaeng Phet': 'กำแพงเพชร',
	Phichit: 'พิจิตร',
	Phetchabun: 'เพชรบูรณ์',
	'Nakhon Sawan': 'นครสวรรค์',
	'Uthai Thani': 'อุทัยธานี',
	'Chai Nat': 'ชัยนาท',
	'Sing Buri': 'สิงห์บุรี',
	'Lop Buri': 'ลพบุรี',
	'Suphan Buri': 'สุพรรณบุรี',
	'Ang Thong': 'อ่างทอง',
	Saraburi: 'สระบุรี',
	'Phra Nakhon Si Ayutthaya': 'พระนครศรีอยุธยา',
	'Nakhon Pathom': 'นครปฐม',
	'Pathum Thani': 'ปทุมธานี',
	Nonthaburi: 'นนทบุรี',
	'Nakhon Nayok': 'นครนายก',
	Bangkok: 'กรุงเทพมหานคร',
	'Samut Sakhon': 'สมุทรสาคร',
	'Samut Prakan': 'สมุทรปราการ',
	'Samut Songkhram': 'สมุทรสงคราม',
	Tak: 'ตาก',
	Kanchanaburi: 'กาญจนบุรี',
	Ratchaburi: 'ราชบุรี',
	Phetchaburi: 'เพชรบุรี',
	'Prachuap Khiri Khan': 'ประจวบคีรีขันธ์',
	'Prachin Buri': 'ปราจีนบุรี',
	'Sa Kaeo': 'สระแก้ว',
	Chachoengsao: 'ฉะเชิงเทรา',
	'Chon Buri': 'ชลบุรี',
	Rayong: 'ระยอง',
	Chanthaburi: 'จันทบุรี',
	Trat: 'ตราด',
	Chumphon: 'ชุมพร',
	Ranong: 'ระนอง',
	'Surat Thani': 'สุราษฎร์ธานี',
	'Phang Nga': 'พังงา',
	Phuket: 'ภูเก็ต',
	Krabi: 'กระบี่',
	'Nakhon Si Thammarat': 'นครศรีธรรมราช',
	Trang: 'ตรัง',
	Phatthalung: 'พัทลุง',
	Satun: 'สตูล',
	Songkhla: 'สงขลา',
	Pattani: 'ปัตตานี',
	Yala: 'ยะลา',
	Narathiwat: 'นราธิวาส',
};

// Official two-letter province abbreviations (the ones on kilometer markers),
// keyed by display name. Bangkok is deliberately absent: markers around the
// capital use กทม, and the quiz leaves it unprompted.
const ABBR = {
	'Mae Hong Son': 'มส',
	'Chiang Rai': 'ชร',
	'Chiang Mai': 'ชม',
	Phayao: 'พย',
	Nan: 'นน',
	Lamphun: 'ลพ',
	Lampang: 'ลป',
	Phrae: 'พร',
	Uttaradit: 'อต',
	Loei: 'ลย',
	'Nong Khai': 'นค',
	'Bueng Kan': 'บก',
	'Udon Thani': 'อด',
	'Nong Bua Lam Phu': 'นภ',
	'Sakon Nakhon': 'สน',
	'Nakhon Phanom': 'นพ',
	'Khon Kaen': 'ขก',
	Kalasin: 'กส',
	Mukdahan: 'มห',
	Chaiyaphum: 'ชย',
	'Maha Sarakham': 'มค',
	'Roi Et': 'รอ',
	Yasothon: 'ยส',
	'Amnat Charoen': 'อจ',
	'Nakhon Ratchasima': 'นม',
	'Buri Ram': 'บร',
	Surin: 'สร',
	'Si Sa Ket': 'ศก',
	'Ubon Ratchathani': 'อบ',
	Sukhothai: 'สท',
	Phitsanulok: 'พล',
	'Kamphaeng Phet': 'กพ',
	Phichit: 'พจ',
	Phetchabun: 'พช',
	'Nakhon Sawan': 'นว',
	'Uthai Thani': 'อน',
	'Chai Nat': 'ชน',
	'Sing Buri': 'สห',
	'Lop Buri': 'ลบ',
	'Suphan Buri': 'สพ',
	'Ang Thong': 'อท',
	Saraburi: 'สบ',
	'Phra Nakhon Si Ayutthaya': 'อย',
	'Nakhon Pathom': 'นฐ',
	'Pathum Thani': 'ปท',
	Nonthaburi: 'นบ',
	'Nakhon Nayok': 'นย',
	'Samut Sakhon': 'สค',
	'Samut Prakan': 'สป',
	'Samut Songkhram': 'สส',
	Tak: 'ตก',
	Kanchanaburi: 'กจ',
	Ratchaburi: 'รบ',
	Phetchaburi: 'พบ',
	'Prachuap Khiri Khan': 'ปข',
	'Prachin Buri': 'ปจ',
	'Sa Kaeo': 'สก',
	Chachoengsao: 'ฉช',
	'Chon Buri': 'ชบ',
	Rayong: 'รย',
	Chanthaburi: 'จบ',
	Trat: 'ตร',
	Chumphon: 'ชพ',
	Ranong: 'รน',
	'Surat Thani': 'สฎ',
	'Phang Nga': 'พง',
	Phuket: 'ภก',
	Krabi: 'กบ',
	'Nakhon Si Thammarat': 'นศ',
	Trang: 'ตง',
	Phatthalung: 'พท',
	Satun: 'สต',
	Songkhla: 'สข',
	Pattani: 'ปน',
	Yala: 'ยล',
	Narathiwat: 'นธ',
};

const regionEntries = Object.entries(REGIONS).flatMap(([region, names]) =>
	names.map((name) => [name, region]),
);
const regionByName = new Map(regionEntries);
if (regionByName.size !== regionEntries.length) {
	throw new Error('A province is listed in more than one region');
}
const EXPECTED_COUNT = regionByName.size;

const abbrs = Object.values(ABBR);
if (abbrs.length !== EXPECTED_COUNT - 1 || new Set(abbrs).size !== abbrs.length) {
	throw new Error('Expected a unique abbreviation for every province but Bangkok');
}

const source = await fetchZippedJson(SOURCE);

// "AmnatCharoen" → "Amnat Charoen"
const splitName = (name) => name.replace(/([a-z])([A-Z])/g, '$1 $2');

if (source.features.length !== EXPECTED_COUNT) {
	throw new Error(
		`Expected ${EXPECTED_COUNT} provinces, got ${source.features.length} — source data changed?`,
	);
}

for (const feature of source.features) {
	const name = RENAME[feature.properties.NAME_1] ?? splitName(feature.properties.NAME_1);
	const region = regionByName.get(name);
	if (!region) throw new Error(`Province not in the region table: ${name}`);
	const thai = THAI[name];
	if (!thai) throw new Error(`Province not in the Thai-name table: ${name}`);
	const abbr = ABBR[name];
	if (!abbr && name !== 'Bangkok') {
		throw new Error(`Province not in the abbreviation table: ${name}`);
	}
	// GADM's NL_NAME_1 carries a จังหวัด ("province") prefix, and five entries
	// are wrong outright (Bangkok is labeled Chiang Mai, Chaiyaphum is labeled
	// Chai Nat, and three name their capital district instead) — so a mismatch
	// only warns
	const sourceThai = feature.properties.NL_NAME_1?.replace(/^จังหวัด/, '');
	if (sourceThai && sourceThai !== 'NA' && sourceThai !== thai) {
		console.warn(`Thai name differs from GADM for ${name}: ours ${thai}, NL_NAME_1 ${sourceThai}`);
	}
	feature.properties = abbr ? { name, thai, region, abbr } : { name, thai, region };
}

const names = new Set(source.features.map((f) => f.properties.name));
if (names.size !== EXPECTED_COUNT) throw new Error('Province names are not unique');

const result = simplifyAndWrite({
	features: source.features,
	output: OUTPUT,
	simplify: '25%',
	expectedCount: EXPECTED_COUNT,
});
console.log(`Wrote ${OUTPUT} (${result.features.length} provinces, ${result.kb} KB)`);
