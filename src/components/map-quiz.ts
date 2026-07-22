// Shared engine for the find-on-map quizzes (kabupaten, area codes). Holds
// the <map-quiz> custom element: Leaflet map, quiz loop, hands-free autoplay,
// progress tracking, share links, and dialogs. Each quiz registers a QuizDef
// describing its data file, prompts, picker, and storage keys — see
// map-quiz-defs.ts. The markup the element expects lives in MapQuizShell.astro.

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

export type QuizFeature = Feature<Polygon | MultiPolygon, Record<string, string>>;

// One quiz question. Prompts are usually unique to a shape, but a few US
// overlay codes span two shapes (917 covers both NYC shapes) — clicking any
// carrier of the prompted code is correct.
type Item = { prompt: string; features: QuizFeature[] };

export type ModeKey = 'borders' | 'neither' | 'labels';
/** seconds is the fastest perfect-run time; absent until a 100% run finishes */
type CellRecord = { best: number; total: number; seconds?: number };
type ProgressStore = Record<string, Partial<Record<ModeKey, CellRecord>>>;

export type PickerEntry = { value: string; label: string; group?: string };
export type ProgressRow = { label: string; key: string } | { group: string };
export type BoundsLiteral = [[number, number], [number, number]];

export type QuizDef = {
	dataUrl: string;
	attribution: string;
	/** Text shown for a shape in tooltips and the wrong-guess message */
	label(feature: QuizFeature): string;
	/** The quiz prompts a shape answers ("203/475" → ["203", "475"]) */
	prompts(feature: QuizFeature): string[];
	/**
	 * On-demand hint text for a prompt; omit for quizzes without hints. Also
	 * receives the shapes answering the prompt, for hints stored as feature
	 * properties (e.g. a romanization) rather than derived from the prompt.
	 */
	hint?(prompt: string, features: QuizFeature[]): string;
	/** Append the hint to tooltips while browsing the map before a quiz run */
	tipHint?: boolean;
	/**
	 * Custom matcher for the Find input, given the input's value as typed.
	 * Without it the input accepts digit wildcard patterns matched against the
	 * prompts — the area-code behavior (see matchesFind).
	 */
	findMatch?(feature: QuizFeature, query: string): boolean;
	/**
	 * Typeface choices for the Font picker (quizzes whose prompts train script
	 * recognition, where reading unfamiliar typefaces is part of the drill).
	 * The chosen face applies everywhere the quiz renders a shape name: the
	 * prompt, the wrong-guess message, and tooltips. `family` is the CSS font
	 * stack (its faces must be imported where the quiz is defined), null for
	 * the page default. The shell renders the picker markup only when its
	 * fontPicker prop is set.
	 */
	fonts?: { label: string; family: string | null }[];
	/** Whether the Labels tile toggle renders; without it tiles stay labeled */
	labelsToggle: boolean;
	/** Toggle combinations tracked in the progress dialog, in column order */
	modes: ModeKey[];
	progressKey: string;
	skipConfirmKey: string;
	uiKey(scope: string | undefined): string;
	/** Options for the scope picker; omit for quizzes without one */
	pickerEntries?(scope: string | undefined, features: QuizFeature[]): PickerEntry[];
	filter(
		scope: string | undefined,
		selection: string | null,
		features: QuizFeature[],
	): QuizFeature[];
	scopeKey(scope: string | undefined, selection: string | null): string;
	progressRows(scope: string | undefined, features: QuizFeature[]): ProgressRow[];
	/** Explicit initial view for scopes whose natural bounds are unhelpful */
	fitBounds?(scope: string | undefined, selection: string | null): BoundsLiteral | null;
	/** Completion share text: the quiz title, the standalone page the link
	 * opens, and the page's ?drill= value for a run (null omits the param) */
	share: {
		title: string;
		path: string;
		drill(scope: string | undefined, selection: string | null): string | null;
	};
};

// The basemap tiles helloquiz uses: Google's roadmap endpoint, in a labeled
// and a label-free variant (the second styles all label elements off).
const TILES_LABELS =
	'https://www.google.com/maps/vt?pb=!1m7!8m6!1m3!1i{z}!2i{x}!3i{y}!2i9!3x1!2m2!1e0!2sm!3m3!2sen!3suk!5e18!4e0!5m4!1e0!8m2!1e1!1e1!6m6!1e12!2i2!11e0!39b0!44e0!50e0';
const TILES_NO_LABELS =
	'https://www.google.com/maps/vt?pb=!1m5!1m4!1i{z}!2i{x}!3i{y}!4i256!2m2!1e0!2sm!3m17!2sen!3sUK!5e18!12m4!1e68!2m2!1sset!2sRoadmap!12m3!1e37!2m1!1ssmartmaps!12m4!1e26!2m2!1sstyles!2ss.e:l%7Cp.v:off,s.t:1%7Cs.e:g.s%7Cp.v:off!5m1!5f1';

const STROKE = '#075985';
const FLASH_MS = 700;

// Hands-free pacing: stepper bounds and defaults, all in seconds. The reveal
// fade itself is CSS (see MapQuizShell); HF_FADE_MS just outlives it so the
// layer isn't removed mid-fade.
const HF_MIN_SECONDS = 0.5;
const HF_MAX_SECONDS = 30;
const HF_STEP_SECONDS = 0.5;
const HF_FADE_MS = 300;
const HF_DEFAULTS = { prompt: 5, zoom: 2, linger: 4 };
type HFDurations = typeof HF_DEFAULTS;
const clampDuration = (value: unknown, fallback: number) =>
	typeof value === 'number' && Number.isFinite(value)
		? Math.min(HF_MAX_SECONDS, Math.max(HF_MIN_SECONDS, Math.round(value * 2) / 2))
		: fallback;

// Inline icons for the toggles and the progress-table columns: a dashed
// circle for borders, a map pin for labels, an X for neither
const icon = (paths: string) =>
	`<svg class="icon" viewBox="0 0 16 16" aria-hidden="true">${paths}</svg>`;
export const ICONS: Record<ModeKey, string> = {
	borders: icon(
		'<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.4 2.31"/>',
	),
	neither: icon(
		'<path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
	),
	labels: icon(
		'<path d="M8 1.5A4.5 4.5 0 0 0 3.5 6c0 3.2 4.5 8.5 4.5 8.5S12.5 9.2 12.5 6A4.5 4.5 0 0 0 8 1.5Z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="6" r="1.6" fill="currentColor"/>',
	),
};
const MODE_LABELS: Record<ModeKey, string> = {
	borders: 'Borders',
	neither: 'Neither',
	labels: 'Labels',
};
const modeFromToggles = (borders: boolean, labels: boolean): ModeKey | null =>
	labels ? (borders ? null : 'labels') : borders ? 'borders' : 'neither';

// Perfect-run times render as "4m32s"; anything over an hour just caps out
const formatSeconds = (seconds: number) =>
	seconds >= 3600 ? '>1h' : `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;

const readStored = <T>(key: string): T | null => {
	try {
		return JSON.parse(localStorage.getItem(key) ?? 'null');
	} catch {
		return null;
	}
};
const writeStored = (key: string, value: unknown) => {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Private mode / quota: the quiz works, progress just doesn't persist
	}
};

const dataCache = new Map<string, Promise<QuizFeature[]>>();
const loadData = (url: string) => {
	let promise = dataCache.get(url);
	if (!promise) {
		promise = fetch(url)
			.then((r) => r.json())
			.then((geojson) => geojson.features as QuizFeature[]);
		dataCache.set(url, promise);
	}
	return promise;
};

const shuffle = <T>(items: T[]) => {
	for (let i = items.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[items[i], items[j]] = [items[j], items[i]];
	}
	return items;
};

const registry = new Map<string, QuizDef>();

export function registerQuizzes(defs: Record<string, QuizDef>) {
	for (const [name, def] of Object.entries(defs)) registry.set(name, def);
	if (!customElements.get('map-quiz')) customElements.define('map-quiz', MapQuiz);
}

class MapQuiz extends HTMLElement {
	def!: QuizDef;
	map!: L.Map;
	geoLayer: L.GeoJSON | null = null;
	features: QuizFeature[] = [];
	layers: { layer: L.Path; feature: QuizFeature }[] = [];
	status!: HTMLElement;
	startButton!: HTMLButtonElement;
	hfButton!: HTMLButtonElement;
	hfTransport!: HTMLElement;
	hfControls!: HTMLElement;
	pauseButton!: HTMLButtonElement;
	tilesLabeled!: L.TileLayer;
	tilesUnlabeled: L.TileLayer | null = null;
	bordersBox!: HTMLInputElement;
	labelsBox: HTMLInputElement | null = null;
	picker: HTMLSelectElement | null = null;
	fontPicker: HTMLSelectElement | null = null;
	findInput: HTMLInputElement | null = null;
	findPattern = '';
	nameTip!: HTMLElement;
	progressOverlay!: HTMLElement;
	confirmOverlay!: HTMLElement;
	progressTable!: HTMLTableElement;
	dontAskBox!: HTMLInputElement;
	confirmResolve: ((confirmed: boolean) => void) | null = null;

	// Quiz state
	mode: 'explore' | 'quiz' | 'handsfree' = 'explore';
	queue: Item[] = [];
	current: Item | null = null;
	awaiting: 'answer' | 'confirm' = 'answer';
	missed = new Set<Item>();
	firstTry = new Set<Item>();
	// Post-quiz review tint per shape: green for first-try, red for missed
	review = new Map<QuizFeature, string>();
	completed = 0;
	total = 0;
	revealed: Item | null = null;
	// Which progress cell this run counts toward once finished; a run is
	// voided (records nothing) when started on an untracked toggle combo or
	// when a toggle changes mid-run
	runMode: ModeKey | null = null;
	runVoided = true;
	// Separate from voiding: a mid-run toggle flip also drops the Share
	// button, since the final toggles no longer describe the whole run.
	// Untracked combos stay shareable.
	runToggled = false;
	runScopeKey = '';
	runStartedAt = 0;

	// Hands-free state. The phase machine runs on wall-clock timers (the
	// durations are the source of truth, not Leaflet's moveend), so pausing
	// stores the time left and resuming re-arms it; the in-flight zoom is
	// halted with map.stop() and resumed by flying the rest of the way.
	hfPhase: 'prompt' | 'zoomin' | 'linger' | 'zoomout' = 'prompt';
	hfItems: Item[] = [];
	hfItem: Item | null = null;
	hfLayer: L.GeoJSON | null = null;
	// Every scoped shape's outline, kept on the map for the whole session and
	// faded in/out with the reveal so neighbors give the answer context
	hfBorders: L.GeoJSON | null = null;
	hfTarget: L.LatLngBounds | null = null;
	hfPaused = false;
	hfTimer: number | null = null;
	hfDeadline = 0;
	hfRemaining = 0;
	hfStep: (() => void) | null = null;
	hfDurations: HFDurations = { ...HF_DEFAULTS };
	// The scope's full-extent view, kept for the hands-free zoom-out leg
	homeBounds: L.LatLngBoundsExpression | null = null;

	connectedCallback() {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer.disconnect();
					this.init();
				}
			},
			{ rootMargin: '300px' },
		);
		observer.observe(this);
	}

	async init() {
		this.def = registry.get(this.dataset.quiz!)!;
		this.status = this.querySelector('.status')!;
		this.startButton = this.querySelector('.start')!;
		this.hfButton = this.querySelector('.hf-btn')!;
		this.hfTransport = this.querySelector('.hf-transport')!;
		this.hfControls = this.querySelector('.hf-controls')!;
		this.pauseButton = this.querySelector('.hf-pause')!;
		this.bordersBox = this.querySelector('.borders')!;
		this.labelsBox = this.querySelector('.labels');
		this.nameTip = this.querySelector('.name-tip')!;
		this.progressOverlay = this.querySelector('.progress-overlay')!;
		this.confirmOverlay = this.querySelector('.confirm-overlay')!;
		this.progressTable = this.querySelector('.progress-table')!;
		this.dontAskBox = this.querySelector('.dont-ask-box')!;
		const picker = (this.picker = this.querySelector<HTMLSelectElement>('.picker'));

		// Restore the selection and toggles this instance was last left on
		const savedUI = readStored<{
			selection?: string;
			borders?: boolean;
			labels?: boolean;
			font?: string;
		}>(this.def.uiKey(this.dataset.scope));
		if (savedUI?.borders !== undefined) this.bordersBox.checked = savedUI.borders;
		if (this.labelsBox && savedUI?.labels !== undefined) this.labelsBox.checked = savedUI.labels;

		// A share link's params reproduce the shared run: they beat the saved
		// UI for this load, and normal persistence takes over from there
		const params = new URLSearchParams(location.search);
		const urlBorders = params.get('borders');
		if (urlBorders !== null) this.bordersBox.checked = urlBorders !== '0';
		const urlLabels = params.get('labels');
		if (this.labelsBox && urlLabels !== null) this.labelsBox.checked = urlLabels !== '0';

		this.bordersBox.insertAdjacentHTML('afterend', ICONS.borders);
		this.labelsBox?.insertAdjacentHTML('afterend', ICONS.labels);

		this.features = await loadData(this.def.dataUrl);

		this.map = L.map(this.querySelector<HTMLElement>('.map')!, {
			attributionControl: true,
			zoomSnap: 0.5,
			maxZoom: 15,
			minZoom: 3,
			fadeAnimation: false,
		});
		this.map.attributionControl.setPrefix(false);
		// The tip is anchored to a container point, so it goes stale as soon
		// as the view changes; hide it and let the next mousemove replace it
		this.map.on('movestart zoomstart', () => (this.nameTip.hidden = true));

		const tileOptions = { attribution: this.def.attribution, maxZoom: 15 };
		this.tilesLabeled = L.tileLayer(TILES_LABELS, tileOptions);
		this.tilesUnlabeled = this.labelsBox ? L.tileLayer(TILES_NO_LABELS, tileOptions) : null;
		this.syncTiles();
		this.labelsBox?.addEventListener('change', () =>
			this.toggleChanged(this.labelsBox!, () => this.syncTiles()),
		);

		this.bordersBox.addEventListener('change', () =>
			this.toggleChanged(this.bordersBox, () => this.restyleAll()),
		);

		if (picker) {
			const entries = this.def.pickerEntries!(this.dataset.scope, this.features);
			let group: HTMLOptGroupElement | null = null;
			for (const entry of entries) {
				const option = new Option(entry.label, entry.value);
				if (!entry.group) {
					group = null;
					picker.append(option);
				} else {
					if (group?.label !== entry.group) {
						group = document.createElement('optgroup');
						group.label = entry.group;
						picker.append(group);
					}
					group.append(option);
				}
			}
			const wanted = params.get('drill') ?? savedUI?.selection ?? this.dataset.initial;
			if (wanted && [...picker.options].some((option) => option.value === wanted))
				picker.value = wanted;
			picker.addEventListener('change', () => {
				this.persistUI();
				this.setScope();
			});
		}

		const fontPicker = (this.fontPicker = this.querySelector<HTMLSelectElement>('.font-picker'));
		if (fontPicker && this.def.fonts) {
			for (const { label, family } of this.def.fonts) {
				const option = new Option(label, family ?? '');
				// Each option demonstrates its own face where the browser styles
				// options (desktop Chrome/Firefox); elsewhere it's plain text
				if (family) option.style.fontFamily = family;
				fontPicker.append(option);
			}
			if (savedUI?.font && [...fontPicker.options].some((option) => option.value === savedUI.font))
				fontPicker.value = savedUI.font;
			// Fonts are practice difficulty, not a tracked dimension: switching
			// mid-run restyles live and never voids progress
			fontPicker.addEventListener('change', () => {
				this.applyFont();
				this.persistUI();
			});
			this.applyFont();
		}

		const findInput = (this.findInput = this.querySelector<HTMLInputElement>('.find'));
		if (findInput) {
			// Live match highlight while exploring. With the default code
			// matcher, characters outside the pattern alphabet (digits and the
			// wildcards) are dropped as typed; a findMatch definition takes the
			// value as-is
			findInput.addEventListener('input', () => {
				if (!this.def.findMatch) {
					const clean = findInput.value.replace(/[^0-9xX*]/g, '');
					if (clean !== findInput.value) findInput.value = clean;
				}
				this.findPattern = findInput.value;
				this.restyleAll();
			});
		}

		this.startButton.addEventListener('click', () => {
			if (this.mode === 'quiz') this.endQuiz();
			else this.startQuiz();
		});

		const savedDurations = readStored<Partial<HFDurations>>(this.hfStoreKey());
		for (const key of ['prompt', 'zoom', 'linger'] as const)
			this.hfDurations[key] = clampDuration(savedDurations?.[key], HF_DEFAULTS[key]);
		for (const stepper of this.querySelectorAll<HTMLElement>('.hf-stepper'))
			this.wireStepper(stepper);
		this.hfButton.addEventListener('click', () => this.startHandsFree());
		this.pauseButton.addEventListener('click', () => {
			if (!this.hfPaused) this.hfPause();
			else if (this.hfStep) this.hfResume();
			else {
				// First Play after entering hands-free: the armed state exists so
				// the durations can be adjusted before the loop starts
				this.hfSetPaused(false);
				this.hfNext();
			}
		});
		this.querySelector('.hf-skip')!.addEventListener('click', () => this.hfSkip());
		this.querySelector('.hf-stop')!.addEventListener('click', () => this.stopHandsFree());

		this.wireDialogs();

		this.setScope();
		this.startButton.disabled = false;
		this.hfButton.disabled = false;
	}

	persistUI() {
		writeStored(this.def.uiKey(this.dataset.scope), {
			selection: this.picker?.value,
			borders: this.bordersBox.checked,
			labels: this.labelsBox?.checked,
			font: this.fontPicker?.value,
		});
	}

	// The shell's name elements (prompt, wrong-guess names, tooltip) read this
	// custom property; unset falls back to the page font
	applyFont() {
		const family = this.fontPicker?.value;
		if (family) this.style.setProperty('--name-font', family);
		else this.style.removeProperty('--name-font');
	}

	// Route toggle flips through the progress guard: during a quiz the first
	// flip voids the run's progress credit, so it asks first (unless the
	// user opted out of the prompt for good)
	toggleChanged(box: HTMLInputElement, apply: () => void) {
		if (this.mode === 'quiz' && !this.runVoided && !readStored(this.def.skipConfirmKey)) {
			const wanted = box.checked;
			box.checked = !wanted;
			this.askConfirm().then((confirmed) => {
				if (!confirmed) return;
				if (this.dontAskBox.checked) writeStored(this.def.skipConfirmKey, true);
				this.runVoided = true;
				this.runToggled = true;
				box.checked = wanted;
				apply();
				this.persistUI();
			});
			return;
		}
		if (this.mode === 'quiz') {
			this.runVoided = true;
			this.runToggled = true;
		}
		apply();
		this.persistUI();
	}

	// --- progress dialogs --------------------------------------------------

	wireDialogs() {
		this.querySelector('.progress-btn')!.addEventListener('click', () => {
			this.buildProgressTable();
			this.nameTip.hidden = true;
			this.progressOverlay.hidden = false;
			this.querySelector<HTMLButtonElement>('.close')!.focus();
		});
		this.querySelector('.close')!.addEventListener(
			'click',
			() => (this.progressOverlay.hidden = true),
		);
		this.progressOverlay.addEventListener('click', (e) => {
			if (e.target === this.progressOverlay) this.progressOverlay.hidden = true;
		});

		this.querySelector('.cancel')!.addEventListener('click', () => this.resolveConfirm(false));
		this.querySelector('.confirm')!.addEventListener('click', () => this.resolveConfirm(true));
		this.confirmOverlay.addEventListener('click', (e) => {
			if (e.target === this.confirmOverlay) this.resolveConfirm(false);
		});

		document.addEventListener('keydown', (e) => {
			if (e.key !== 'Escape') return;
			if (!this.confirmOverlay.hidden) this.resolveConfirm(false);
			else if (!this.progressOverlay.hidden) this.progressOverlay.hidden = true;
			else if (this.mode === 'handsfree') this.stopHandsFree();
		});
	}

	askConfirm(): Promise<boolean> {
		this.dontAskBox.checked = false;
		this.progressOverlay.hidden = true;
		this.nameTip.hidden = true;
		this.confirmOverlay.hidden = false;
		this.querySelector<HTMLButtonElement>('.cancel')!.focus();
		return new Promise((resolve) => (this.confirmResolve = resolve));
	}

	resolveConfirm(confirmed: boolean) {
		this.confirmOverlay.hidden = true;
		this.confirmResolve?.(confirmed);
		this.confirmResolve = null;
	}

	scopeKey() {
		return this.def.scopeKey(this.dataset.scope, this.picker?.value ?? null);
	}

	// A finished run with its toggles locked to a tracked combo updates that
	// cell when it beats the stored best: a higher score, or — once both runs
	// are perfect — a faster time
	recordRun(score: number, elapsed: number) {
		if (!this.runMode || this.runVoided) return;
		const store = readStored<ProgressStore>(this.def.progressKey) ?? {};
		const cells = (store[this.runScopeKey] ??= {});
		const prev = cells[this.runMode];
		const seconds = score >= this.total ? elapsed : undefined;
		const beatsScore = !prev || score / this.total > prev.best / prev.total;
		const beatsTime =
			seconds !== undefined &&
			prev !== undefined &&
			prev.best >= prev.total &&
			(prev.seconds === undefined || seconds < prev.seconds);
		if (beatsScore || beatsTime) {
			cells[this.runMode] =
				seconds === undefined
					? { best: score, total: this.total }
					: { best: score, total: this.total, seconds };
			writeStored(this.def.progressKey, store);
		}
	}

	buildProgressTable() {
		const store = readStored<ProgressStore>(this.def.progressKey) ?? {};
		this.progressTable.innerHTML = '';
		const head = this.progressTable.createTHead().insertRow();
		head.append(document.createElement('th'));
		for (const mode of this.def.modes) {
			const th = document.createElement('th');
			th.innerHTML = ICONS[mode];
			th.title = MODE_LABELS[mode];
			th.setAttribute('aria-label', MODE_LABELS[mode]);
			head.append(th);
		}

		const body = this.progressTable.createTBody();
		for (const row of this.def.progressRows(this.dataset.scope, this.features)) {
			if ('group' in row) {
				const groupRow = body.insertRow();
				groupRow.className = 'group';
				const groupCell = groupRow.insertCell();
				groupCell.colSpan = this.def.modes.length + 1;
				groupCell.textContent = row.group;
				continue;
			}
			const tableRow = body.insertRow();
			const rowHead = document.createElement('th');
			rowHead.scope = 'row';
			rowHead.textContent = row.label;
			tableRow.append(rowHead);
			for (const mode of this.def.modes) {
				const cell = tableRow.insertCell();
				const record = store[row.key]?.[mode];
				if (!record) continue;
				if (record.best >= record.total) {
					cell.className = 'done';
					// Pre-timing perfect records keep the plain checkmark
					cell.textContent = record.seconds === undefined ? '✓' : formatSeconds(record.seconds);
				} else {
					cell.className = 'tried';
					cell.textContent = `${Math.floor((record.best / record.total) * 100)}%`;
				}
			}
		}
	}

	// --- share -------------------------------------------------------------

	// Three lines: quiz + drill, the result with the toggles spelled out, and
	// a link whose params reproduce the run for the recipient
	shareText(score: number, elapsed: number) {
		const drillLabel = this.picker?.selectedOptions[0]?.label;
		const toggles = [`borders ${this.bordersBox.checked ? 'on' : 'off'}`];
		if (this.labelsBox) toggles.push(`labels ${this.labelsBox.checked ? 'on' : 'off'}`);
		const drill = this.def.share.drill(this.dataset.scope, this.picker?.value ?? null);
		// Keep drill values readable in the link: spaces become +, colons stay
		const query = drill
			? [`drill=${encodeURIComponent(drill).replace(/%3A/gi, ':').replace(/%20/g, '+')}`]
			: [];
		query.push(`borders=${this.bordersBox.checked ? 1 : 0}`);
		if (this.labelsBox) query.push(`labels=${this.labelsBox.checked ? 1 : 0}`);
		return [
			this.def.share.title + (drillLabel ? ` · ${drillLabel}` : ''),
			`${score}/${this.total} · ${formatSeconds(elapsed)} · ${toggles.join(', ')}`,
			`https://guata.me${this.def.share.path}?${query.join('&')}`,
		].join('\n');
	}

	shareButton(score: number, elapsed: number) {
		const text = this.shareText(score, elapsed);
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'share';
		button.textContent = 'Share';
		button.addEventListener('click', () => {
			navigator.clipboard.writeText(text).then(() => {
				button.textContent = 'Copied!';
				setTimeout(() => (button.textContent = 'Share'), 2000);
			});
		});
		return button;
	}

	setScope() {
		const features = this.def.filter(this.dataset.scope, this.picker?.value ?? null, this.features);
		this.stopHandsFree(true);
		this.endQuiz(true);
		this.review.clear();
		this.geoLayer?.remove();
		this.layers = [];
		this.geoLayer = L.geoJSON(features, {
			style: (feature) => this.styleFor(feature as QuizFeature),
			onEachFeature: (feature: QuizFeature, layer) => {
				const path = layer as L.Path;
				this.layers.push({ layer: path, feature });
				layer.on('mouseover', () => this.hover(path, feature, true));
				layer.on('mousemove', (e) => this.moveTip(e as L.LeafletMouseEvent, feature));
				layer.on('mouseout', () => this.hover(path, feature, false));
				layer.on('click', (e) => this.clicked(path, feature, e as L.LeafletMouseEvent));
			},
		}).addTo(this.map);
		const override = this.def.fitBounds?.(this.dataset.scope, this.picker?.value ?? null);
		this.homeBounds = override ?? this.geoLayer.getBounds().pad(0.05);
		this.map.fitBounds(this.homeBounds);
		this.status.textContent = '';
	}

	// --- styling ---------------------------------------------------------

	// Find-input matching. A definition's findMatch hook wins; the default is
	// a wildcard prefix match: *, x, and X each stand for one digit, and the
	// pattern anchors at the start of the code — "9" is every code starting
	// with 9, "*4" any code whose second digit is 4. A pattern longer than
	// the code can't match it. Overlay shapes match on any of their codes.
	matchesFind(feature: QuizFeature) {
		if (this.def.findMatch) return this.def.findMatch(feature, this.findPattern);
		return this.def
			.prompts(feature)
			.some(
				(code) =>
					code.length >= this.findPattern.length &&
					[...this.findPattern].every((ch, i) => '*xX'.includes(ch) || code[i] === ch),
			);
	}

	styleFor(feature: QuizFeature, flash: string | null = null): L.PathOptions {
		const borders = this.bordersBox.checked;
		// An active Find pattern beats the post-run review tints (the input is
		// cleared while a quiz is running, so it never competes with the quiz)
		const find = this.findPattern && this.matchesFind(feature) ? 'gold' : null;
		const tint = flash ?? find ?? this.review.get(feature) ?? null;
		return {
			color: STROKE,
			weight: 1.2,
			opacity: borders ? 0.9 : 0,
			fillColor: tint ?? '#000',
			// Transparent black tint alongside borders; with borders off the
			// fill stays invisible but keeps shapes clickable. Flash and
			// review colors show regardless of the Borders toggle.
			fillOpacity: flash ? 0.5 : tint ? 0.35 : borders ? 0.12 : 0,
			fill: true,
		};
	}

	isRevealed(feature: QuizFeature) {
		return this.revealed?.features.includes(feature) ?? false;
	}

	layerFor(feature: QuizFeature) {
		return this.layers.find((entry) => entry.feature === feature)!.layer;
	}

	restyleAll() {
		for (const { layer, feature } of this.layers) {
			layer.setStyle(this.styleFor(feature, this.isRevealed(feature) ? 'gold' : null));
		}
	}

	flash(layer: L.Path, feature: QuizFeature, color: string) {
		layer.setStyle(this.styleFor(feature, color));
		setTimeout(() => {
			if (!this.isRevealed(feature)) layer.setStyle(this.styleFor(feature));
		}, FLASH_MS);
	}

	hover(layer: L.Path, feature: QuizFeature, over: boolean) {
		if (!over) this.nameTip.hidden = true;
		if (this.isRevealed(feature)) return;
		// No hover highlight with borders off — it would give shapes away
		// during the no-borders drill stage
		if (over && this.bordersBox.checked) {
			const style = this.styleFor(feature);
			layer.setStyle({ ...style, fillOpacity: (style.fillOpacity ?? 0) + 0.16 });
		} else layer.setStyle(this.styleFor(feature));
	}

	// Hand-rolled name tooltip: Leaflet's bindTooltip leaks focus handlers
	// when unbound (Leaflet #8297), and we'd be rebinding every quiz start
	showTip(event: L.LeafletMouseEvent, name: string) {
		this.nameTip.textContent = name;
		this.nameTip.style.left = `${event.containerPoint.x + 14}px`;
		this.nameTip.style.top = `${event.containerPoint.y + 14}px`;
		this.nameTip.hidden = false;
	}

	moveTip(event: L.LeafletMouseEvent, feature: QuizFeature) {
		if (this.mode !== 'explore') {
			this.nameTip.hidden = true;
			return;
		}
		const hint =
			this.def.tipHint && this.def.hint
				? ` · ${this.def.hint(this.def.prompts(feature)[0], [feature])}`
				: '';
		this.showTip(event, this.def.label(feature) + hint);
	}

	// --- quiz ------------------------------------------------------------

	startQuiz() {
		this.mode = 'quiz';
		this.runMode = modeFromToggles(this.bordersBox.checked, this.labelsBox?.checked ?? false);
		if (this.runMode && !this.def.modes.includes(this.runMode)) this.runMode = null;
		this.runVoided = this.runMode === null;
		this.runToggled = false;
		this.runScopeKey = this.scopeKey();
		this.runStartedAt = Date.now();
		this.queue = shuffle(this.buildItems());
		this.total = this.queue.length;
		this.missed.clear();
		this.firstTry.clear();
		this.review.clear();
		this.completed = 0;
		this.revealed = null;
		if (this.findInput) {
			this.findInput.value = '';
			this.findPattern = '';
			this.findInput.closest('label')!.hidden = true;
		}
		this.nameTip.hidden = true;
		this.startButton.textContent = 'End Quiz';
		this.hfButton.hidden = true;
		this.restyleAll();
		this.nextQuestion();
	}

	// Group the scoped shapes into question items, one per distinct prompt
	// (overlay codes shared by two shapes collapse into a single item)
	buildItems(): Item[] {
		const byPrompt = new Map<string, Item>();
		for (const { feature } of this.layers) {
			for (const prompt of this.def.prompts(feature)) {
				const item = byPrompt.get(prompt);
				if (item) item.features.push(feature);
				else byPrompt.set(prompt, { prompt, features: [feature] });
			}
		}
		return [...byPrompt.values()];
	}

	endQuiz(silent = false) {
		if (this.mode === 'quiz') {
			// Review tint: what you got on the first try vs. what you missed
			// (red wins on shapes whose overlay codes went both ways)
			for (const item of this.firstTry)
				for (const feature of item.features) this.review.set(feature, '#16a34a');
			for (const item of this.missed)
				for (const feature of item.features) this.review.set(feature, '#dc2626');
		}
		this.mode = 'explore';
		this.current = null;
		this.revealed = null;
		if (this.findInput) this.findInput.closest('label')!.hidden = false;
		this.startButton.textContent = 'Start Quiz';
		this.hfButton.hidden = false;
		if (this.layers.length) this.restyleAll();
		if (!silent) this.status.textContent = '';
	}

	nextQuestion() {
		this.revealed = null;
		this.awaiting = 'answer';
		const next = this.queue.shift();
		if (!next) {
			const score = this.total - this.missed.size;
			const elapsed = Math.round((Date.now() - this.runStartedAt) / 1000);
			this.recordRun(score, elapsed);
			this.endQuiz(true);
			this.status.innerHTML = '';
			const message = document.createElement('span');
			message.textContent = `Final score: ${score}/${this.total} in ${formatSeconds(elapsed)}.`;
			this.status.append(message);
			if (!this.runToggled) this.status.append(this.shareButton(score, elapsed));
			return;
		}
		this.current = next;
		this.showPrompt();
	}

	showPrompt() {
		// The status bar is a flex row (message left, optional Skip right), so
		// the message text always goes inside a single wrapper span
		this.status.innerHTML = '';
		const message = document.createElement('span');
		this.status.append(message);
		message.append('Find ');
		const name = document.createElement('strong');
		name.textContent = this.current!.prompt;
		const count = ` · ${this.completed}/${this.total}`;
		if (!this.def.hint) {
			message.append(name, `.${count}`);
			return;
		}
		// The hint stays hidden until asked for, and resets on every question
		// (including recycled misses). Any status rewrite discards the button,
		// so it can only fire while its own question is the current one.
		const hint = document.createElement('button');
		hint.type = 'button';
		hint.className = 'hint';
		hint.textContent = '(hint)';
		hint.addEventListener('click', () =>
			hint.replaceWith(` · ${this.def.hint!(this.current!.prompt, this.current!.features)}`),
		);
		message.append(name, ' ', hint, count);
	}

	clicked(layer: L.Path, feature: QuizFeature, event: L.LeafletMouseEvent) {
		if (this.mode !== 'quiz' || !this.current) return;

		if (this.awaiting === 'confirm') {
			if (this.isRevealed(feature)) {
				const targets = this.revealed!;
				this.revealed = null;
				for (const target of targets.features) this.flash(this.layerFor(target), target, 'gold');
				this.queue.push(this.current);
				this.nextQuestion();
			} else {
				// Let the player probe adjacent shapes for their names while
				// the answer is highlighted
				this.showTip(event, this.def.label(feature));
			}
			return;
		}

		if (this.current.features.includes(feature)) {
			if (!this.missed.has(this.current)) this.firstTry.add(this.current);
			this.flash(layer, feature, '#16a34a');
			this.completed++;
			this.nextQuestion();
		} else {
			this.missed.add(this.current);
			this.flash(layer, feature, '#dc2626');
			this.revealed = this.current;
			for (const target of this.current.features)
				this.layerFor(target).setStyle(this.styleFor(target, 'gold'));
			this.awaiting = 'confirm';
			this.status.innerHTML = '';
			const guess = document.createElement('strong');
			guess.textContent = this.def.label(feature);
			const name = document.createElement('strong');
			name.textContent = this.current.prompt;
			// Skip hunting down the highlighted answer; the miss still recycles
			// to the end of the queue. Rewriting the status discards the button,
			// so like the hint it can only fire on its own question.
			const skip = document.createElement('button');
			skip.type = 'button';
			skip.className = 'skip';
			skip.textContent = 'Skip';
			skip.addEventListener('click', () => {
				const item = this.current!;
				this.revealed = null;
				for (const target of item.features) this.layerFor(target).setStyle(this.styleFor(target));
				this.queue.push(item);
				this.nextQuestion();
			});
			const message = document.createElement('span');
			message.append('That was ', guess, '. ', name, ' is highlighted. Click it to continue.');
			this.status.append(message, skip);
		}
	}

	// --- hands-free ------------------------------------------------------

	// Hands-free forces the labeled tiles (scanning the map's own labels is
	// the whole game); outside it the Labels toggle rules, and quizzes
	// without the toggle are always labeled
	syncTiles() {
		if (!this.tilesUnlabeled) return;
		const wantLabeled = this.mode === 'handsfree' || !this.labelsBox || this.labelsBox.checked;
		const want = wantLabeled ? this.tilesLabeled : this.tilesUnlabeled;
		const other = wantLabeled ? this.tilesUnlabeled : this.tilesLabeled;
		if (this.map.hasLayer(other)) this.map.removeLayer(other);
		if (!this.map.hasLayer(want)) this.map.addLayer(want);
	}

	// Durations are a per-quiz preference, keyed by the registry name so
	// every page embedding the same quiz shares them
	hfStoreKey() {
		return `hf-durations:${this.dataset.quiz}`;
	}

	wireStepper(stepper: HTMLElement) {
		const key = stepper.dataset.dur as keyof HFDurations;
		const value = stepper.querySelector('.hf-value')!;
		const render = () => {
			const v = this.hfDurations[key];
			value.textContent = `${v % 1 ? v.toFixed(1) : v}s`;
		};
		const nudge = (delta: number) => {
			this.hfDurations[key] = clampDuration(this.hfDurations[key] + delta, HF_DEFAULTS[key]);
			writeStored(this.hfStoreKey(), this.hfDurations);
			render();
		};
		// Press-and-hold repeats after a beat. The chevrons stay enabled at
		// the clamp bounds: a disabled button stops firing pointer events, so
		// disabling mid-hold would strand the repeat interval.
		const wire = (button: HTMLButtonElement, delta: number) => {
			let hold = 0;
			let repeat = 0;
			const clear = () => {
				clearTimeout(hold);
				clearInterval(repeat);
			};
			button.addEventListener('pointerdown', (event) => {
				event.preventDefault();
				nudge(delta);
				hold = window.setTimeout(() => (repeat = window.setInterval(() => nudge(delta), 120)), 450);
			});
			for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const)
				button.addEventListener(type, clear);
			// Keyboard activation arrives as a click with detail 0 (pointer
			// clicks already stepped on pointerdown)
			button.addEventListener('click', (event) => {
				if (event.detail === 0) nudge(delta);
			});
		};
		wire(stepper.querySelector<HTMLButtonElement>('.hf-dec')!, -HF_STEP_SECONDS);
		wire(stepper.querySelector<HTMLButtonElement>('.hf-inc')!, HF_STEP_SECONDS);
		render();
	}

	startHandsFree() {
		if (this.mode !== 'explore' || !this.geoLayer) return;
		this.hfItems = this.buildItems();
		if (!this.hfItems.length) return;
		this.mode = 'handsfree';
		this.nameTip.hidden = true;
		if (this.findInput) {
			this.findInput.value = '';
			this.findPattern = '';
			this.findInput.closest('label')!.hidden = true;
		}
		// The region layer comes off the map entirely: the prompt phase shows
		// nothing but the labeled basemap, and only the answer gets drawn
		this.geoLayer.remove();
		this.syncTiles();
		this.startButton.hidden = true;
		this.hfButton.hidden = true;
		this.hfTransport.hidden = false;
		this.hfControls.hidden = false;
		this.bordersBox.closest('label')!.hidden = true;
		if (this.labelsBox) this.labelsBox.closest('label')!.hidden = true;
		this.querySelector<HTMLElement>('.progress-btn')!.hidden = true;
		this.hfBorders = L.geoJSON(
			this.layers.map((entry) => entry.feature),
			{
				interactive: false,
				// The quiz's borders-on look: stroked shapes with the faint tint
				style: {
					color: STROKE,
					weight: 1.2,
					opacity: 0.9,
					fillColor: '#000',
					fillOpacity: 0.12,
					className: 'hf-reveal',
				},
			},
		).addTo(this.map);
		this.map.fitBounds(this.homeBounds!);
		// Armed, not playing: the loop waits for Play so the durations can be
		// tweaked first
		this.hfStep = null;
		this.hfSetPaused(true);
	}

	// rebuilding is setScope tearing things down before it refits the new
	// scope itself — skip the layer/view restoration it's about to redo
	stopHandsFree(rebuilding = false) {
		if (this.mode !== 'handsfree') return;
		this.mode = 'explore';
		if (this.hfTimer !== null) clearTimeout(this.hfTimer);
		this.hfTimer = null;
		this.hfItem = null;
		this.hfStep = null;
		this.hfSetPaused(false);
		this.map.stop();
		this.hfLayer?.remove();
		this.hfLayer = null;
		this.hfBorders?.remove();
		this.hfBorders = null;
		this.hfTransport.hidden = true;
		this.hfControls.hidden = true;
		this.startButton.hidden = false;
		this.hfButton.hidden = false;
		this.bordersBox.closest('label')!.hidden = false;
		if (this.labelsBox) this.labelsBox.closest('label')!.hidden = false;
		if (this.findInput) this.findInput.closest('label')!.hidden = false;
		this.querySelector<HTMLElement>('.progress-btn')!.hidden = false;
		this.status.textContent = '';
		this.syncTiles();
		if (!rebuilding) {
			this.geoLayer?.addTo(this.map);
			this.map.fitBounds(this.homeBounds!);
		}
	}

	hfSchedule(seconds: number, step: () => void) {
		this.hfStep = step;
		this.hfRemaining = seconds * 1000;
		this.hfDeadline = Date.now() + this.hfRemaining;
		this.hfTimer = window.setTimeout(step, this.hfRemaining);
	}

	hfNext() {
		this.hfPhase = 'prompt';
		// With replacement, but never the same prompt twice in a row (unless
		// the scope only has one)
		const pool =
			this.hfItems.length > 1 ? this.hfItems.filter((item) => item !== this.hfItem) : this.hfItems;
		const item = pool[Math.floor(Math.random() * pool.length)];
		this.hfItem = item;
		this.status.innerHTML = '';
		const message = document.createElement('span');
		message.append('Find ');
		const name = document.createElement('strong');
		name.textContent = item.prompt;
		message.append(name, '.');
		this.status.append(message);
		this.hfSchedule(this.hfDurations.prompt, () => this.hfZoomIn());
	}

	hfZoomIn() {
		this.hfPhase = 'zoomin';
		const layer = L.geoJSON(this.hfItem!.features, {
			interactive: false,
			// The quiz's gold reveal style; the class hooks the snappy CSS fade
			style: {
				color: STROKE,
				weight: 1.2,
				opacity: 0.9,
				fillColor: 'gold',
				fillOpacity: 0.35,
				className: 'hf-reveal',
			},
		}).addTo(this.map);
		this.hfLayer = layer;
		// Two frames so the paths paint at opacity 0 before the class flips —
		// flipping in the same frame would skip the fade transition. The
		// neighbor outlines fade in alongside the gold answer.
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				layer.eachLayer((sub) => (sub as L.Path).getElement()?.classList.add('hf-on'));
				this.hfBorders?.eachLayer((sub) => (sub as L.Path).getElement()?.classList.add('hf-on'));
			}),
		);
		this.hfTarget = layer.getBounds().pad(0.35);
		this.map.flyToBounds(this.hfTarget, { duration: this.hfDurations.zoom });
		this.hfSchedule(this.hfDurations.zoom, () => this.hfLinger());
	}

	hfLinger() {
		this.hfPhase = 'linger';
		this.hfSchedule(this.hfDurations.linger, () => this.hfZoomOut());
	}

	hfZoomOut() {
		this.hfPhase = 'zoomout';
		const layer = this.hfLayer;
		this.hfLayer = null;
		if (layer) {
			layer.eachLayer((sub) => (sub as L.Path).getElement()?.classList.remove('hf-on'));
			setTimeout(() => layer.remove(), HF_FADE_MS);
		}
		this.hfBorders?.eachLayer((sub) => (sub as L.Path).getElement()?.classList.remove('hf-on'));
		this.map.flyToBounds(this.homeBounds!, { duration: this.hfDurations.zoom });
		this.hfSchedule(this.hfDurations.zoom, () => this.hfNext());
	}

	hfSetPaused(paused: boolean) {
		this.hfPaused = paused;
		this.pauseButton.classList.toggle('paused', paused);
		// No hfStep yet means the armed just-entered state: Play, not Resume
		const label = paused ? (this.hfStep ? 'Resume' : 'Play') : 'Pause';
		this.pauseButton.setAttribute('aria-label', label);
		this.pauseButton.title = label;
	}

	hfPause() {
		if (this.mode !== 'handsfree' || this.hfPaused) return;
		this.hfSetPaused(true);
		if (this.hfTimer !== null) clearTimeout(this.hfTimer);
		this.hfTimer = null;
		this.hfRemaining = Math.max(0, this.hfDeadline - Date.now());
		this.map.stop();
	}

	hfResume() {
		if (this.mode !== 'handsfree' || !this.hfPaused) return;
		this.hfSetPaused(false);
		// A zoom leg frozen mid-flight flies the rest of the way in the time
		// it had left; hold phases just re-arm the timer
		const seconds = Math.max(this.hfRemaining / 1000, 0.05);
		if (this.hfPhase === 'zoomin') this.map.flyToBounds(this.hfTarget!, { duration: seconds });
		else if (this.hfPhase === 'zoomout')
			this.map.flyToBounds(this.homeBounds!, { duration: seconds });
		this.hfDeadline = Date.now() + this.hfRemaining;
		this.hfTimer = window.setTimeout(this.hfStep!, this.hfRemaining);
	}

	// Skip cuts straight to the next prompt: reveal gone, view snapped back
	// to full extent, no zoom-out leg. Inert until the first Play.
	hfSkip() {
		if (this.mode !== 'handsfree' || !this.hfStep) return;
		if (this.hfPaused) this.hfSetPaused(false);
		if (this.hfTimer !== null) clearTimeout(this.hfTimer);
		this.hfTimer = null;
		this.map.stop();
		this.hfLayer?.remove();
		this.hfLayer = null;
		this.hfBorders?.eachLayer((sub) => (sub as L.Path).getElement()?.classList.remove('hf-on'));
		this.map.fitBounds(this.homeBounds!, { animate: false });
		this.hfNext();
	}
}
