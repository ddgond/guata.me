// Builds public/data/japan-cities.json for the Japanese cities quiz.
//
// Downloads the 47 per-prefecture 国土数値情報 N03 administrative boundary
// files from MLIT (the N03-20210101 edition, boundaries as of 2021-01-01 to
// match the October 2020 census) and keeps the municipalities in CITIES: every
// city with at least 100,000 residents in the 2020 census plus all 23 Tokyo
// special wards (Chiyoda is under the cutoff but the wards are a closed set).
// GADM was rejected for this quiz: its Japan level-2 file predates the
// 2010–2011 municipal mergers and modern coastal reclamation — see
// data-sources.md. Each feature carries { name, romaji, region }: the kanji
// name the quiz prompts with, the census romanization the hint reveals, and
// one of the eight drill groups (classic regions merged/split so every drill
// lands between 19 and 54 cities: Tohoku joins Hokkaido, Kanto splits into
// North/Tokyo/South, Shikoku joins Chugoku, Okinawa joins Kyushu).
//
// N03 splits designated cities into wards (there is no 01100 Sapporo feature,
// only its wards' codes); those dissolve into the city via N03_003, which
// names the designated city a ward belongs to. Tokyo's special wards are
// their own quiz entries and join by their own code like any city.
//
// The 47 zips (~250 MB) are cached in the system temp dir across runs.
//
// Usage: node scripts/japan-cities-data.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dataPath, simplifyAndWrite } from './lib/quiz-data.mjs';

const EDITION = 'N03-20210101';
const SOURCE_DIR = 'https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2021';
const OUTPUT = dataPath('japan-cities.json');

// [JIS code, kanji name, census romanization, 2020 census population] for
// every entry in the quiz, frozen from the e-Stat 都道府県・市区町村別の主な
// 結果 table (see data-sources.md). Codes 131xx are the Tokyo special wards.
const CITIES = [
	['01100', '札幌市', 'Sapporo', 1973395],
	['01202', '函館市', 'Hakodate', 251084],
	['01203', '小樽市', 'Otaru', 111299],
	['01204', '旭川市', 'Asahikawa', 329306],
	['01206', '釧路市', 'Kushiro', 165077],
	['01207', '帯広市', 'Obihiro', 166536],
	['01208', '北見市', 'Kitami', 115480],
	['01213', '苫小牧市', 'Tomakomai', 170113],
	['01217', '江別市', 'Ebetsu', 121056],
	['02201', '青森市', 'Aomori', 275192],
	['02202', '弘前市', 'Hirosaki', 168466],
	['02203', '八戸市', 'Hachinohe', 223415],
	['03201', '盛岡市', 'Morioka', 289731],
	['03209', '一関市', 'Ichinoseki', 111932],
	['03215', '奥州市', 'Oshu', 112937],
	['04100', '仙台市', 'Sendai', 1096704],
	['04202', '石巻市', 'Ishinomaki', 140151],
	['04215', '大崎市', 'Osaki', 127330],
	['05201', '秋田市', 'Akita', 307672],
	['06201', '山形市', 'Yamagata', 247590],
	['06203', '鶴岡市', 'Tsuruoka', 122347],
	['06204', '酒田市', 'Sakata', 100273],
	['07201', '福島市', 'Fukushima', 282693],
	['07202', '会津若松市', 'Aizuwakamatsu', 117376],
	['07203', '郡山市', 'Koriyama', 327692],
	['07204', 'いわき市', 'Iwaki', 332931],
	['08201', '水戸市', 'Mito', 270685],
	['08202', '日立市', 'Hitachi', 174508],
	['08203', '土浦市', 'Tsuchiura', 142074],
	['08204', '古河市', 'Koga', 139344],
	['08217', '取手市', 'Toride', 104524],
	['08220', 'つくば市', 'Tsukuba', 241656],
	['08221', 'ひたちなか市', 'Hitachinaka', 156581],
	['08227', '筑西市', 'Chikusei', 100753],
	['09201', '宇都宮市', 'Utsunomiya', 518757],
	['09202', '足利市', 'Ashikaga', 144746],
	['09203', '栃木市', 'Tochigi', 155549],
	['09204', '佐野市', 'Sano', 116228],
	['09208', '小山市', 'Oyama', 166666],
	['09213', '那須塩原市', 'Nasushiobara', 115210],
	['10201', '前橋市', 'Maebashi', 332149],
	['10202', '高崎市', 'Takasaki', 372973],
	['10203', '桐生市', 'Kiryu', 106445],
	['10204', '伊勢崎市', 'Isesaki', 211850],
	['10205', '太田市', 'Ota', 223014],
	['11100', 'さいたま市', 'Saitama', 1324025],
	['11201', '川越市', 'Kawagoe', 354571],
	['11202', '熊谷市', 'Kumagaya', 194415],
	['11203', '川口市', 'Kawaguchi', 594274],
	['11208', '所沢市', 'Tokorozawa', 342464],
	['11210', '加須市', 'Kazo', 111623],
	['11214', '春日部市', 'Kasukabe', 229792],
	['11215', '狭山市', 'Sayama', 148699],
	['11217', '鴻巣市', 'Konosu', 116828],
	['11218', '深谷市', 'Fukaya', 141268],
	['11219', '上尾市', 'Ageo', 226940],
	['11221', '草加市', 'Soka', 248304],
	['11222', '越谷市', 'Koshigaya', 341621],
	['11224', '戸田市', 'Toda', 140899],
	['11225', '入間市', 'Iruma', 145651],
	['11227', '朝霞市', 'Asaka', 141083],
	['11230', '新座市', 'Niiza', 166017],
	['11232', '久喜市', 'Kuki', 150582],
	['11235', '富士見市', 'Fujimi', 111859],
	['11237', '三郷市', 'Misato', 142145],
	['11239', '坂戸市', 'Sakado', 100275],
	['11245', 'ふじみ野市', 'Fujimino', 113597],
	['12100', '千葉市', 'Chiba', 974951],
	['12203', '市川市', 'Ichikawa', 496676],
	['12204', '船橋市', 'Funabashi', 642907],
	['12206', '木更津市', 'Kisarazu', 136166],
	['12207', '松戸市', 'Matsudo', 498232],
	['12208', '野田市', 'Noda', 152638],
	['12211', '成田市', 'Narita', 132906],
	['12212', '佐倉市', 'Sakura', 168743],
	['12216', '習志野市', 'Narashino', 176197],
	['12217', '柏市', 'Kashiwa', 426468],
	['12219', '市原市', 'Ichihara', 269524],
	['12220', '流山市', 'Nagareyama', 199849],
	['12221', '八千代市', 'Yachiyo', 199498],
	['12222', '我孫子市', 'Abiko', 130510],
	['12224', '鎌ケ谷市', 'Kamagaya', 109932],
	['12227', '浦安市', 'Urayasu', 171362],
	['12231', '印西市', 'Inzai', 102609],
	['13101', '千代田区', 'Chiyoda', 66680],
	['13102', '中央区', 'Chuo', 169179],
	['13103', '港区', 'Minato', 260486],
	['13104', '新宿区', 'Shinjuku', 349385],
	['13105', '文京区', 'Bunkyo', 240069],
	['13106', '台東区', 'Taito', 211444],
	['13107', '墨田区', 'Sumida', 272085],
	['13108', '江東区', 'Koto', 524310],
	['13109', '品川区', 'Shinagawa', 422488],
	['13110', '目黒区', 'Meguro', 288088],
	['13111', '大田区', 'Ota', 748081],
	['13112', '世田谷区', 'Setagaya', 943664],
	['13113', '渋谷区', 'Shibuya', 243883],
	['13114', '中野区', 'Nakano', 344880],
	['13115', '杉並区', 'Suginami', 591108],
	['13116', '豊島区', 'Toshima', 301599],
	['13117', '北区', 'Kita', 355213],
	['13118', '荒川区', 'Arakawa', 217475],
	['13119', '板橋区', 'Itabashi', 584483],
	['13120', '練馬区', 'Nerima', 752608],
	['13121', '足立区', 'Adachi', 695043],
	['13122', '葛飾区', 'Katsushika', 453093],
	['13123', '江戸川区', 'Edogawa', 697932],
	['13201', '八王子市', 'Hachioji', 579355],
	['13202', '立川市', 'Tachikawa', 183581],
	['13203', '武蔵野市', 'Musashino', 150149],
	['13204', '三鷹市', 'Mitaka', 195391],
	['13205', '青梅市', 'Ome', 133535],
	['13206', '府中市', 'Fuchu', 262790],
	['13207', '昭島市', 'Akishima', 113949],
	['13208', '調布市', 'Chofu', 242614],
	['13209', '町田市', 'Machida', 431079],
	['13210', '小金井市', 'Koganei', 126074],
	['13211', '小平市', 'Kodaira', 198739],
	['13212', '日野市', 'Hino', 190435],
	['13213', '東村山市', 'Higashimurayama', 151815],
	['13214', '国分寺市', 'Kokubunji', 129242],
	['13222', '東久留米市', 'Higashikurume', 115271],
	['13224', '多摩市', 'Tama', 146951],
	['13229', '西東京市', 'Nishitokyo', 207388],
	['14100', '横浜市', 'Yokohama', 3777491],
	['14130', '川崎市', 'Kawasaki', 1538262],
	['14150', '相模原市', 'Sagamihara', 725493],
	['14201', '横須賀市', 'Yokosuka', 388078],
	['14203', '平塚市', 'Hiratsuka', 258422],
	['14204', '鎌倉市', 'Kamakura', 172710],
	['14205', '藤沢市', 'Fujisawa', 436905],
	['14206', '小田原市', 'Odawara', 188856],
	['14207', '茅ヶ崎市', 'Chigasaki', 242389],
	['14211', '秦野市', 'Hadano', 162439],
	['14212', '厚木市', 'Atsugi', 223705],
	['14213', '大和市', 'Yamato', 239169],
	['14214', '伊勢原市', 'Isehara', 101780],
	['14215', '海老名市', 'Ebina', 136516],
	['14216', '座間市', 'Zama', 132325],
	['15100', '新潟市', 'Niigata', 789275],
	['15202', '長岡市', 'Nagaoka', 266936],
	['15222', '上越市', 'Joetsu', 188047],
	['16201', '富山市', 'Toyama', 413938],
	['16202', '高岡市', 'Takaoka', 166393],
	['17201', '金沢市', 'Kanazawa', 463254],
	['17203', '小松市', 'Komatsu', 106216],
	['17210', '白山市', 'Hakusan', 110408],
	['18201', '福井市', 'Fukui', 262328],
	['19201', '甲府市', 'Kofu', 189591],
	['20201', '長野市', 'Nagano', 372760],
	['20202', '松本市', 'Matsumoto', 241145],
	['20203', '上田市', 'Ueda', 154055],
	['21201', '岐阜市', 'Gifu', 402557],
	['21202', '大垣市', 'Ogaki', 158286],
	['21204', '多治見市', 'Tajimi', 106732],
	['21213', '各務原市', 'Kakamigahara', 144521],
	['22100', '静岡市', 'Shizuoka', 693389],
	['22130', '浜松市', 'Hamamatsu', 790718],
	['22203', '沼津市', 'Numazu', 189386],
	['22206', '三島市', 'Mishima', 107783],
	['22207', '富士宮市', 'Fujinomiya', 128105],
	['22210', '富士市', 'Fuji', 245392],
	['22211', '磐田市', 'Iwata', 166672],
	['22212', '焼津市', 'Yaizu', 136845],
	['22213', '掛川市', 'Kakegawa', 114954],
	['22214', '藤枝市', 'Fujieda', 141342],
	['23100', '名古屋市', 'Nagoya', 2332176],
	['23201', '豊橋市', 'Toyohashi', 371920],
	['23202', '岡崎市', 'Okazaki', 384654],
	['23203', '一宮市', 'Ichinomiya', 380073],
	['23204', '瀬戸市', 'Seto', 127792],
	['23205', '半田市', 'Handa', 117884],
	['23206', '春日井市', 'Kasugai', 308681],
	['23207', '豊川市', 'Toyokawa', 184661],
	['23210', '刈谷市', 'Kariya', 153834],
	['23211', '豊田市', 'Toyota', 422330],
	['23212', '安城市', 'Anjo', 187990],
	['23213', '西尾市', 'Nishio', 169046],
	['23219', '小牧市', 'Komaki', 148831],
	['23220', '稲沢市', 'Inazawa', 134751],
	['23222', '東海市', 'Tokai', 113787],
	['24201', '津市', 'Tsu', 274537],
	['24202', '四日市市', 'Yokkaichi', 305424],
	['24203', '伊勢市', 'Ise', 122765],
	['24204', '松阪市', 'Matsusaka', 159145],
	['24205', '桑名市', 'Kuwana', 138613],
	['24207', '鈴鹿市', 'Suzuka', 195670],
	['25201', '大津市', 'Otsu', 345070],
	['25202', '彦根市', 'Hikone', 113647],
	['25203', '長浜市', 'Nagahama', 113636],
	['25206', '草津市', 'Kusatsu', 143913],
	['25213', '東近江市', 'Higashiomi', 112819],
	['26100', '京都市', 'Kyoto', 1463723],
	['26204', '宇治市', 'Uji', 179630],
	['27100', '大阪市', 'Osaka', 2752412],
	['27140', '堺市', 'Sakai', 826161],
	['27202', '岸和田市', 'Kishiwada', 190658],
	['27203', '豊中市', 'Toyonaka', 401558],
	['27204', '池田市', 'Ikeda', 104993],
	['27205', '吹田市', 'Suita', 385567],
	['27207', '高槻市', 'Takatsuki', 352698],
	['27209', '守口市', 'Moriguchi', 143096],
	['27210', '枚方市', 'Hirakata', 397289],
	['27211', '茨木市', 'Ibaraki', 287730],
	['27212', '八尾市', 'Yao', 264642],
	['27213', '泉佐野市', 'Izumisano', 100131],
	['27214', '富田林市', 'Tondabayashi', 108699],
	['27215', '寝屋川市', 'Neyagawa', 229733],
	['27216', '河内長野市', 'Kawachinagano', 101692],
	['27217', '松原市', 'Matsubara', 117641],
	['27218', '大東市', 'Daito', 119367],
	['27219', '和泉市', 'Izumi', 184495],
	['27220', '箕面市', 'Minoh', 136868],
	['27222', '羽曳野市', 'Habikino', 108736],
	['27223', '門真市', 'Kadoma', 119764],
	['27227', '東大阪市', 'Higashiosaka', 493940],
	['28100', '神戸市', 'Kobe', 1525152],
	['28201', '姫路市', 'Himeji', 530495],
	['28202', '尼崎市', 'Amagasaki', 459593],
	['28203', '明石市', 'Akashi', 303601],
	['28204', '西宮市', 'Nishinomiya', 485587],
	['28207', '伊丹市', 'Itami', 198138],
	['28210', '加古川市', 'Kakogawa', 260878],
	['28214', '宝塚市', 'Takarazuka', 226432],
	['28217', '川西市', 'Kawanishi', 152321],
	['28219', '三田市', 'Sanda', 109238],
	['29201', '奈良市', 'Nara', 354630],
	['29205', '橿原市', 'Kashihara', 120922],
	['29209', '生駒市', 'Ikoma', 116675],
	['30201', '和歌山市', 'Wakayama', 356729],
	['31201', '鳥取市', 'Tottori', 188465],
	['31202', '米子市', 'Yonago', 147317],
	['32201', '松江市', 'Matsue', 203616],
	['32203', '出雲市', 'Izumo', 172775],
	['33100', '岡山市', 'Okayama', 724691],
	['33202', '倉敷市', 'Kurashiki', 474592],
	['34100', '広島市', 'Hiroshima', 1200754],
	['34202', '呉市', 'Kure', 214592],
	['34205', '尾道市', 'Onomichi', 131170],
	['34207', '福山市', 'Fukuyama', 460930],
	['34212', '東広島市', 'Higashihiroshima', 196608],
	['34213', '廿日市市', 'Hatsukaichi', 114173],
	['35201', '下関市', 'Shimonoseki', 255051],
	['35202', '宇部市', 'Ube', 162570],
	['35203', '山口市', 'Yamaguchi', 193966],
	['35206', '防府市', 'Hofu', 113979],
	['35208', '岩国市', 'Iwakuni', 129125],
	['35215', '周南市', 'Shunan', 137540],
	['36201', '徳島市', 'Tokushima', 252391],
	['37201', '高松市', 'Takamatsu', 417496],
	['37202', '丸亀市', 'Marugame', 109513],
	['38201', '松山市', 'Matsuyama', 511192],
	['38202', '今治市', 'Imabari', 151672],
	['38205', '新居浜市', 'Niihama', 115938],
	['38206', '西条市', 'Saijo', 104791],
	['39201', '高知市', 'Kochi', 326545],
	['40100', '北九州市', 'Kitakyushu', 939029],
	['40130', '福岡市', 'Fukuoka', 1612392],
	['40202', '大牟田市', 'Omuta', 111281],
	['40203', '久留米市', 'Kurume', 303316],
	['40205', '飯塚市', 'Iizuka', 126364],
	['40217', '筑紫野市', 'Chikushino', 103311],
	['40218', '春日市', 'Kasuga', 111023],
	['40219', '大野城市', 'Onojo', 102085],
	['41201', '佐賀市', 'Saga', 233301],
	['41202', '唐津市', 'Karatsu', 117373],
	['42201', '長崎市', 'Nagasaki', 409118],
	['42202', '佐世保市', 'Sasebo', 243223],
	['42204', '諫早市', 'Isahaya', 133852],
	['43100', '熊本市', 'Kumamoto', 738865],
	['43202', '八代市', 'Yatsushiro', 123067],
	['44201', '大分市', 'Oita', 475614],
	['44202', '別府市', 'Beppu', 115321],
	['45201', '宮崎市', 'Miyazaki', 401339],
	['45202', '都城市', 'Miyakonojo', 160640],
	['45203', '延岡市', 'Nobeoka', 118394],
	['46201', '鹿児島市', 'Kagoshima', 593128],
	['46203', '鹿屋市', 'Kanoya', 101096],
	['46218', '霧島市', 'Kirishima', 123135],
	['47201', '那覇市', 'Naha', 317625],
	['47205', '宜野湾市', 'Ginowan', 100125],
	['47208', '浦添市', 'Urasoe', 115690],
	['47211', '沖縄市', 'Okinawa', 142752],
	['47213', 'うるま市', 'Uruma', 125303],
];

// Drill groups by prefecture (leading two code digits), swept north to south
const REGIONS = {
	'hokkaido-tohoku': {
		label: 'Hokkaido & Tohoku',
		prefectures: ['01', '02', '03', '04', '05', '06', '07'],
	},
	'kita-kanto': { label: 'North Kanto', prefectures: ['08', '09', '10'] },
	tokyo: { label: 'Tokyo', prefectures: ['13'] },
	'minami-kanto': { label: 'South Kanto', prefectures: ['11', '12', '14'] },
	chubu: { label: 'Chubu', prefectures: ['15', '16', '17', '18', '19', '20', '21', '22', '23'] },
	kansai: { label: 'Kansai', prefectures: ['24', '25', '26', '27', '28', '29', '30'] },
	'chugoku-shikoku': {
		label: 'Chugoku & Shikoku',
		prefectures: ['31', '32', '33', '34', '35', '36', '37', '38', '39'],
	},
	'kyushu-okinawa': {
		label: 'Kyushu & Okinawa',
		prefectures: ['40', '41', '42', '43', '44', '45', '46', '47'],
	},
};
const regionByPrefecture = new Map(
	Object.entries(REGIONS).flatMap(([key, { prefectures }]) => prefectures.map((p) => [p, key])),
);

// Keep the drill sizes honest: a count change here means the census table or
// the groupings moved and the drills deserve a fresh look
const EXPECTED_REGIONS = {
	'hokkaido-tohoku': 26,
	'kita-kanto': 19,
	tokyo: 40,
	'minami-kanto': 54,
	chubu: 42,
	kansai: 49,
	'chugoku-shikoku': 26,
	'kyushu-okinawa': 28,
};
const EXPECTED_COUNT = Object.values(EXPECTED_REGIONS).reduce((a, b) => a + b, 0);

// The frozen table should already satisfy the selection rule
const entries = CITIES.map(([code, kanji, romaji, pop]) => ({ code, kanji, romaji, pop }));
if (entries.length !== EXPECTED_COUNT)
	throw new Error(`Expected ${EXPECTED_COUNT} entries, got ${entries.length}`);
if (new Set(entries.map((e) => e.code)).size !== entries.length)
	throw new Error('JIS codes are not unique');
for (const { code, kanji, pop } of entries) {
	if (pop < 100_000 && !code.startsWith('131'))
		throw new Error(`${kanji} is below the 100k cutoff`);
	if (!regionByPrefecture.has(code.slice(0, 2)))
		throw new Error(`${kanji}: prefecture ${code.slice(0, 2)} has no region`);
}

const byCode = new Map(entries.map((e) => [e.code, e]));
// Designated-city wards join on the city named in N03_003 instead of a code
const byPrefectureKanji = new Map(entries.map((e) => [`${e.code.slice(0, 2)}|${e.kanji}`, e]));

// One zip per prefecture, cached in the temp dir — a full re-download is
// ~250 MB, so the cache matters while iterating
const fetchPrefecture = async (prefecture) => {
	const name = `${EDITION}_${prefecture}_GML.zip`;
	const file = join(tmpdir(), name);
	if (!existsSync(file) || statSync(file).size === 0) {
		console.log(`Fetching ${SOURCE_DIR}/${name} ...`);
		writeFileSync(file, Buffer.from(await (await fetch(`${SOURCE_DIR}/${name}`)).arrayBuffer()));
	}
	return JSON.parse(
		execFileSync('unzip', ['-p', file, '*.geojson'], { maxBuffer: 1024 * 1024 * 1024 }),
	);
};

const features = [];
const matched = new Set();
for (const prefecture of [...new Set(entries.map((e) => e.code.slice(0, 2)))]) {
	const source = await fetchPrefecture(prefecture);
	let kept = 0;
	for (const feature of source.features) {
		const props = feature.properties;
		const entry = props.N03_003?.endsWith('市')
			? byPrefectureKanji.get(`${prefecture}|${props.N03_003}`)
			: byCode.get(props.N03_007);
		if (!entry) continue;
		matched.add(entry.code);
		kept++;
		feature.properties = {
			key: entry.code,
			name: entry.kanji,
			romaji: entry.romaji,
			region: regionByPrefecture.get(entry.code.slice(0, 2)),
		};
		features.push(feature);
	}
	console.log(`${prefecture}: kept ${kept} of ${source.features.length} polygons`);
}

const missing = entries.filter((e) => !matched.has(e.code));
if (missing.length)
	throw new Error(`No boundary matched: ${missing.map((e) => `${e.code} ${e.kanji}`).join(', ')}`);

const regionCounts = {};
for (const code of matched) regionCounts[regionByPrefecture.get(code.slice(0, 2))] ??= 0;
for (const code of matched) regionCounts[regionByPrefecture.get(code.slice(0, 2))]++;
for (const [region, expected] of Object.entries(EXPECTED_REGIONS)) {
	if (regionCounts[region] !== expected) {
		throw new Error(`Expected ${expected} cities in ${region}, got ${regionCounts[region]}`);
	}
}

const result = simplifyAndWrite({
	features,
	output: OUTPUT,
	dissolve: { key: 'key', copyFields: ['name', 'romaji', 'region'] },
	simplify: '1.5%',
	expectedCount: EXPECTED_COUNT,
});
console.log(`Wrote ${OUTPUT} (${result.features.length} cities, ${result.kb} KB)`);
