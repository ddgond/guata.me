// Shared engine for the find-on-map quizzes (kabupaten, area codes). Holds
// the <map-quiz> custom element: Leaflet map, quiz loop, progress tracking,
// and dialogs. Each quiz registers a QuizDef describing its data file,
// prompts, picker, and storage keys — see map-quiz-defs.ts. The markup the
// element expects lives in MapQuizShell.astro.

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
	/** Whether the Labels tile toggle renders; without it tiles stay labeled */
	labelsToggle: boolean;
	/** Toggle combinations tracked in the progress dialog, in column order */
	modes: ModeKey[];
	progressKey: string;
	skipConfirmKey: string;
	uiKey(scope: string | undefined): string;
	/** Options for the scope picker; omit for quizzes without one */
	pickerEntries?(scope: string | undefined, features: QuizFeature[]): PickerEntry[];
	filter(scope: string | undefined, selection: string | null, features: QuizFeature[]): QuizFeature[];
	scopeKey(scope: string | undefined, selection: string | null): string;
	progressRows(scope: string | undefined, features: QuizFeature[]): ProgressRow[];
	/** Explicit initial view for scopes whose natural bounds are unhelpful */
	fitBounds?(scope: string | undefined, selection: string | null): BoundsLiteral | null;
};

// The basemap tiles helloquiz uses: Google's roadmap endpoint, in a labeled
// and a label-free variant (the second styles all label elements off).
const TILES_LABELS =
	'https://www.google.com/maps/vt?pb=!1m7!8m6!1m3!1i{z}!2i{x}!3i{y}!2i9!3x1!2m2!1e0!2sm!3m3!2sen!3suk!5e18!4e0!5m4!1e0!8m2!1e1!1e1!6m6!1e12!2i2!11e0!39b0!44e0!50e0';
const TILES_NO_LABELS =
	'https://www.google.com/maps/vt?pb=!1m5!1m4!1i{z}!2i{x}!3i{y}!4i256!2m2!1e0!2sm!3m17!2sen!3sUK!5e18!12m4!1e68!2m2!1sset!2sRoadmap!12m3!1e37!2m1!1ssmartmaps!12m4!1e26!2m2!1sstyles!2ss.e:l%7Cp.v:off,s.t:1%7Cs.e:g.s%7Cp.v:off!5m1!5f1';

const STROKE = '#075985';
const FLASH_MS = 700;

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

const readStored = <T,>(key: string): T | null => {
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

const shuffle = <T,>(items: T[]) => {
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
	bordersBox!: HTMLInputElement;
	labelsBox: HTMLInputElement | null = null;
	picker: HTMLSelectElement | null = null;
	nameTip!: HTMLElement;
	progressOverlay!: HTMLElement;
	confirmOverlay!: HTMLElement;
	progressTable!: HTMLTableElement;
	dontAskBox!: HTMLInputElement;
	confirmResolve: ((confirmed: boolean) => void) | null = null;

	// Quiz state
	mode: 'explore' | 'quiz' = 'explore';
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
	runScopeKey = '';
	runStartedAt = 0;

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
		this.bordersBox = this.querySelector('.borders')!;
		this.labelsBox = this.querySelector('.labels');
		this.nameTip = this.querySelector('.name-tip')!;
		this.progressOverlay = this.querySelector('.progress-overlay')!;
		this.confirmOverlay = this.querySelector('.confirm-overlay')!;
		this.progressTable = this.querySelector('.progress-table')!;
		this.dontAskBox = this.querySelector('.dont-ask-box')!;
		const picker = (this.picker = this.querySelector<HTMLSelectElement>('.picker'));

		// Restore the selection and toggles this instance was last left on
		const savedUI = readStored<{ selection?: string; borders?: boolean; labels?: boolean }>(
			this.def.uiKey(this.dataset.scope),
		);
		if (savedUI?.borders !== undefined) this.bordersBox.checked = savedUI.borders;
		if (this.labelsBox && savedUI?.labels !== undefined) this.labelsBox.checked = savedUI.labels;

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
		if (this.labelsBox) {
			const labeled = L.tileLayer(TILES_LABELS, tileOptions);
			const unlabeled = L.tileLayer(TILES_NO_LABELS, tileOptions);
			(this.labelsBox.checked ? labeled : unlabeled).addTo(this.map);
			this.labelsBox.addEventListener('change', () =>
				this.toggleChanged(this.labelsBox!, () => {
					this.map.removeLayer(this.labelsBox!.checked ? unlabeled : labeled);
					this.map.addLayer(this.labelsBox!.checked ? labeled : unlabeled);
				}),
			);
		} else {
			L.tileLayer(TILES_LABELS, tileOptions).addTo(this.map);
		}

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
			const wanted = savedUI?.selection ?? this.dataset.initial;
			if (wanted && [...picker.options].some((option) => option.value === wanted))
				picker.value = wanted;
			picker.addEventListener('change', () => {
				this.persistUI();
				this.setScope();
			});
		}

		this.startButton.addEventListener('click', () => {
			if (this.mode === 'quiz') this.endQuiz();
			else this.startQuiz();
		});

		this.wireDialogs();

		this.setScope();
		this.startButton.disabled = false;
	}

	persistUI() {
		writeStored(this.def.uiKey(this.dataset.scope), {
			selection: this.picker?.value,
			borders: this.bordersBox.checked,
			labels: this.labelsBox?.checked,
		});
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
				box.checked = wanted;
				apply();
				this.persistUI();
			});
			return;
		}
		if (this.mode === 'quiz') this.runVoided = true;
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
					cell.textContent =
						record.seconds === undefined ? '✓' : formatSeconds(record.seconds);
				} else {
					cell.className = 'tried';
					cell.textContent = `${Math.floor((record.best / record.total) * 100)}%`;
				}
			}
		}
	}

	setScope() {
		const features = this.def.filter(
			this.dataset.scope,
			this.picker?.value ?? null,
			this.features,
		);
		this.endQuiz(true);
		this.review.clear();
		this.geoLayer?.remove();
		this.layers = [];
		this.geoLayer = L.geoJSON(features, {
			style: () => this.styleFor(null!),
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
		this.map.fitBounds(override ?? this.geoLayer.getBounds().pad(0.05));
		this.status.textContent = '';
	}

	// --- styling ---------------------------------------------------------

	styleFor(feature: QuizFeature, flash: string | null = null): L.PathOptions {
		const borders = this.bordersBox.checked;
		const tint = flash ?? this.review.get(feature) ?? null;
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
		this.runScopeKey = this.scopeKey();
		this.runStartedAt = Date.now();
		const byPrompt = new Map<string, Item>();
		for (const { feature } of this.layers) {
			for (const prompt of this.def.prompts(feature)) {
				const item = byPrompt.get(prompt);
				if (item) item.features.push(feature);
				else byPrompt.set(prompt, { prompt, features: [feature] });
			}
		}
		this.queue = shuffle([...byPrompt.values()]);
		this.total = this.queue.length;
		this.missed.clear();
		this.firstTry.clear();
		this.review.clear();
		this.completed = 0;
		this.revealed = null;
		this.nameTip.hidden = true;
		this.startButton.textContent = 'End Quiz';
		this.restyleAll();
		this.nextQuestion();
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
		this.startButton.textContent = 'Start Quiz';
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
			this.status.textContent = `Final score: ${score}/${this.total} in ${formatSeconds(elapsed)}.`;
			return;
		}
		this.current = next;
		this.showPrompt();
	}

	showPrompt() {
		this.status.innerHTML = '';
		this.status.append('Find ');
		const name = document.createElement('strong');
		name.textContent = this.current!.prompt;
		const count = ` · ${this.completed}/${this.total}`;
		if (!this.def.hint) {
			this.status.append(name, `.${count}`);
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
		this.status.append(name, ' ', hint, count);
	}

	clicked(layer: L.Path, feature: QuizFeature, event: L.LeafletMouseEvent) {
		if (this.mode !== 'quiz' || !this.current) return;

		if (this.awaiting === 'confirm') {
			if (this.isRevealed(feature)) {
				const targets = this.revealed!;
				this.revealed = null;
				for (const target of targets.features)
					this.flash(this.layerFor(target), target, 'gold');
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
			this.status.append('That was ', guess, '. ', name, ' is highlighted. Click it to continue.');
		}
	}
}
