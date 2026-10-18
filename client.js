window.__ModuleLoader__.load({
	id: "dsh-usage-insights",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const h = React.createElement;
		const { useCallback, useEffect, useMemo, useRef, useState } = React;

		const NS = "dsh-usage-insights";
		const API = "/dsh-usage/api/v1";
		const ORANGE = "#ff7a1a";
		const BLUE = "#57a9ff";
		let gradientSeq = 0;

		//#region copy
		const zh = {
			nav: "用量查询",
			title: "用量",
			intro: "统计所有接口（官方与第三方）的请求次数、Token 与费用估算。",
			range: "时间维度",
			range7: "近 7 天",
			range30: "近 30 天",
			range90: "近 90 天",
			rangeAll: "全部时间",
			allProviders: "全部接口",
			official: "官方",
			third: "第三方",
			allModels: "全部模型",
			export: "导出",
			refresh: "刷新",
			pricing: "价格设置",
			cost: "消费金额",
			requests: "API 请求次数",
			tokens: "Tokens",
			costChart: "消费金额（CNY）",
			requestsChart: "API 请求次数",
			tokensChart: "Tokens",
			byModel: "按模型",
			recent: "最近请求",
			loading: "加载中…",
			refreshing: "更新中…",
			failed: "加载失败",
			retry: "重试",
			empty: "暂无用量数据",
			emptyHint: "下一次模型请求会自动记录；已有历史会话会在后台汇总。",
			backfilling: "正在汇总历史记录…",
			backfillDone: "历史记录已汇总",
			estimated: "预估",
			time: "时间",
			model: "模型",
			provider: "接口",
			total: "合计",
			fee: "费用",
			type: "类型",
			kindTurn: "对话",
			kindCompaction: "压缩",
			kindTitle: "标题",
			unit: "元",
			perMillion: "元 / 百万 tokens",
			priceHelp: "单价单位：元 / 百万 tokens。未单独定价的模型按 DeepSeek Flash 价估算；官方 DeepSeek 模型按北京时间的峰谷价计费。",
			priceModel: "模型",
			priceHit: "缓存命中",
			priceMiss: "未命中输入",
			priceOut: "输出",
			input: "输入",
			output: "输出",
			save: "保存",
			saved: "已保存",
			reset: "恢复默认",
			close: "关闭",
			custom: "自定义",
			defaultPrice: "默认估算",
			peak: "峰时",
			note: "费用为估算值，仅供参考。数据只保存在本机。",
			requestsUnit: "次",
			modelsCount: "个模型",
			sessionsCount: "个会话",
			officialCost: "官方",
			thirdCost: "第三方",
			tableHint: "最近 40 条",
			priceTitle: "模型单价",
			priceEmpty: "还没有可定价的模型。",
			loadFailedRetry: "重试",
			noPrice: "—",
		};
		const en = {
			nav: "Usage",
			title: "Usage",
			intro: "Requests, tokens, and estimated cost across every route — official and third-party.",
			range: "Range",
			range7: "Last 7 days",
			range30: "Last 30 days",
			range90: "Last 90 days",
			rangeAll: "All time",
			allProviders: "All routes",
			official: "Official",
			third: "Third-party",
			allModels: "All models",
			export: "Export",
			refresh: "Refresh",
			pricing: "Pricing",
			cost: "Spend",
			requests: "API requests",
			tokens: "Tokens",
			costChart: "Spend (CNY)",
			requestsChart: "API requests",
			tokensChart: "Tokens",
			byModel: "By model",
			recent: "Recent requests",
			loading: "Loading…",
			refreshing: "Updating…",
			failed: "Failed to load",
			retry: "Retry",
			empty: "No usage yet",
			emptyHint: "The next model call is recorded automatically; existing sessions are folded in the background.",
			backfilling: "Folding history…",
			backfillDone: "History folded",
			estimated: "est.",
			time: "Time",
			model: "Model",
			provider: "Route",
			total: "Total",
			fee: "Cost",
			type: "Kind",
			kindTurn: "Turn",
			kindCompaction: "Compaction",
			kindTitle: "Title",
			unit: "CNY",
			perMillion: "CNY / million tokens",
			priceHelp: "Rates are CNY per million tokens. Unpriced models use the DeepSeek Flash rate; official DeepSeek models bill peak hours at twice the rate.",
			priceModel: "Model",
			priceHit: "Cache hit",
			priceMiss: "Cache miss",
			priceOut: "Output",
			input: "Input",
			output: "Output",
			save: "Save",
			saved: "Saved",
			reset: "Reset",
			close: "Close",
			custom: "Custom",
			defaultPrice: "Estimated",
			peak: "peak",
			note: "Costs are estimates. Data stays on this machine.",
			requestsUnit: "req",
			modelsCount: "models",
			sessionsCount: "sessions",
			officialCost: "Official",
			thirdCost: "Third-party",
			tableHint: "Latest 40",
			priceTitle: "Model rates",
			priceEmpty: "No models to price yet.",
			loadFailedRetry: "Retry",
			noPrice: "—",
		};
		//#endregion

		//#region format
		function fmtInt(value) {
			const n = Number(value) || 0;
			return n.toLocaleString("zh-CN");
		}
		function fmtMoney(value) {
			const n = Number(value) || 0;
			if (n === 0) return "0.00";
			if (n < 0.01) return n.toFixed(4);
			return n.toFixed(2);
		}
		function fmtAxis(value) {
			const n = Number(value) || 0;
			if (n === 0) return "0";
			if (n >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1) + "M";
			if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "K";
			if (n < 0.01) return n.toFixed(3);
			if (n < 1) return n.toFixed(2);
			return String(Math.round(n * 10) / 10);
		}
		function fmtClock(ts) {
			const date = new Date(ts);
			const pad = (n) => String(n).padStart(2, "0");
			return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
		}
		function niceCeil(value) {
			if (!(value > 0)) return 0;
			const power = Math.pow(10, Math.floor(Math.log10(value)));
			const scaled = value / power;
			const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
			return step * power;
		}
		function pick(value, digits) {
			return Math.round((Number(value) || 0) * Math.pow(10, digits)) / Math.pow(10, digits);
		}
		//#endregion

		//#region charts
		function BarChart(props) {
			const { labels, values, formatValue, formatAxisValue, color } = props;
			const wrapRef = useRef(null);
			const [width, setWidth] = useState(720);
			useEffect(() => {
				const node = wrapRef.current;
				if (!node || typeof ResizeObserver === "undefined") return undefined;
				const observer = new ResizeObserver((entries) => {
					const next = entries[0] && entries[0].contentRect ? entries[0].contentRect.width : 0;
					if (next > 0) setWidth(Math.max(300, Math.floor(next)));
				});
				observer.observe(node);
				return () => observer.disconnect();
			}, []);
			const W = width;
			const H = 236;
			const padL = 46;
			const padR = 10;
			const padT = 14;
			const padB = 26;
			const plotW = W - padL - padR;
			const plotH = H - padT - padB;
			const max = niceCeil(Math.max(0, ...values));
			const count = Math.max(1, values.length);
			const slot = plotW / count;
			const barW = Math.max(2, Math.min(13, slot * 0.52));
			const [hover, setHover] = useState(null);
			const yOf = (value) => padT + plotH - (max === 0 ? 0 : (value / max) * plotH);
			const ticks = [0, max / 2, max];
			const labelEvery = Math.max(1, Math.ceil(count / 6));

			const bars = values.map((value, index) => {
				const height = max === 0 ? 0 : (value / max) * plotH;
				const x = padL + slot * index + (slot - barW) / 2;
				const active = hover === null || hover === index;
				return h("rect", {
					key: "bar-" + index,
					x,
					y: padT + plotH - height,
					width: barW,
					height: Math.max(value > 0 ? 2 : 0, height),
					rx: 2,
					fill: color,
					opacity: active ? 0.95 : 0.4,
					onMouseEnter: () => setHover(index),
					onMouseLeave: () => setHover(null),
				});
			});

			const xLabels = labels.map((label, index) => {
				if (index % labelEvery !== 0 && index !== count - 1) return null;
				return h("text", {
					key: "x-" + index,
					x: padL + slot * index + slot / 2,
					y: H - 8,
					textAnchor: "middle",
					fontSize: 11,
					fill: "var(--dsw-alias-label-tertiary)",
				}, label);
			});

			const grid = ticks.map((tick, index) => h("g", { key: "grid-" + index },
				h("line", {
					x1: padL,
					x2: W - padR,
					y1: yOf(tick),
					y2: yOf(tick),
					stroke: "var(--dsw-alias-border-l2)",
					strokeWidth: 1,
					strokeDasharray: index === 0 ? "" : "2 4",
				}),
				h("text", {
					x: padL - 8,
					y: yOf(tick) + 4,
					textAnchor: "end",
					fontSize: 11,
					fill: "var(--dsw-alias-label-tertiary)",
				}, formatAxisValue(tick)),
			));

			const tip = hover === null ? null : h("div", {
				className: "dsu-tip",
				style: {
					left: `${((padL + slot * hover + slot / 2) / W) * 100}%`,
					top: `${(Math.max(padT, yOf(values[hover]) - 8) / H) * 100}%`,
				},
			}, `${labels[hover]} · ${formatValue(values[hover])}`);

			return h("div", { className: "dsu-chart", ref: wrapRef },
				h("svg", {
					viewBox: `0 0 ${W} ${H}`,
					width: W,
					height: H,
					role: "img",
				}, grid, bars, xLabels),
				tip,
			);
		}

		function Sparkline(props) {
			const values = props.values && props.values.length > 0 ? props.values : [0];
			const wrapRef = useRef(null);
			const [width, setWidth] = useState(300);
			useEffect(() => {
				const node = wrapRef.current;
				if (!node || typeof ResizeObserver === "undefined") return undefined;
				const observer = new ResizeObserver((entries) => {
					const next = entries[0] && entries[0].contentRect ? entries[0].contentRect.width : 0;
					if (next > 0) setWidth(Math.max(120, Math.floor(next)));
				});
				observer.observe(node);
				return () => observer.disconnect();
			}, []);
			const W = width;
			const H = 84;
			const padL = 34;
			const padR = 4;
			const padT = 8;
			const padB = 8;
			const plotW = W - padL - padR;
			const max = Math.max(1, ...values);
			const count = values.length;
			const points = values.map((value, index) => {
				const x = padL + (count === 1 ? plotW / 2 : (index / (count - 1)) * plotW);
				const y = H - padB - (value / max) * (H - padT - padB);
				return [x, y];
			});
			const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join(" ");
			const area = `${line} L${W - padR} ${H} L${padL} ${H} Z`;
			const id = "dsu-grad-" + (gradientSeq += 1);
			const axis = [
				h("text", { key: "y-max", x: padL - 6, y: padT + 4, textAnchor: "end", fontSize: 10, fill: "var(--dsw-alias-label-tertiary)" }, fmtAxis(max)),
				h("text", { key: "y-zero", x: padL - 6, y: H - padB + 3, textAnchor: "end", fontSize: 10, fill: "var(--dsw-alias-label-tertiary)" }, "0"),
			];
			return h("div", { className: "dsu-spark", ref: wrapRef },
				h("svg", {
					viewBox: `0 0 ${W} ${H}`,
					width: W,
					height: H,
					role: "img",
				},
					h("defs", null,
						h("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 },
							h("stop", { offset: "0%", stopColor: BLUE, stopOpacity: 0.42 }),
							h("stop", { offset: "100%", stopColor: BLUE, stopOpacity: 0.03 }),
						),
					),
					axis,
					h("path", { d: area, fill: `url(#${id})` }),
					h("path", { d: line, fill: "none", stroke: BLUE, strokeWidth: 1.6, strokeLinejoin: "round", strokeLinecap: "round" }),
				),
			);
		}
		//#endregion

		//#region pieces
		function StatCard(props) {
			return h("div", { className: "dsu-card" },
				h("span", { className: "dsu-card-label" }, props.label),
				h("div", { className: "dsu-card-value" },
					props.value,
					props.unit ? h("span", { className: "dsu-card-unit" }, props.unit) : null,
				),
				props.hint ? h("span", { className: "dsu-card-hint" }, props.hint) : null,
			);
		}

		function Toolbar(props) {
			const { t, days, onDays, provider, onProvider, model, onModel, options, onExport, onRefresh, onPricing, busy } = props;
			const range = h("label", { className: "dsu-range" },
				h("span", { className: "dsu-range-label" }, t("range")),
				h("select", {
					className: "dsu-select",
					value: String(days),
					onChange: (event) => onDays(Number(event.target.value)),
				},
					h("option", { value: "7" }, t("range7")),
					h("option", { value: "30" }, t("range30")),
					h("option", { value: "90" }, t("range90")),
					h("option", { value: "0" }, t("rangeAll")),
				),
			);
			const providerSelect = h("select", {
				className: "dsu-select",
				value: provider,
				onChange: (event) => onProvider(event.target.value),
				"aria-label": t("provider"),
			},
				h("option", { value: "all" }, t("allProviders")),
				h("option", { value: "official" }, t("official")),
				h("option", { value: "third" }, t("third")),
				...options.providers
					.filter((entry) => entry.id !== "unknown")
					.map((entry) => h("option", { key: entry.id, value: entry.id }, `${entry.id}${entry.official ? " · " + t("official") : ""}`)),
			);
			const modelSelect = h("select", {
				className: "dsu-select",
				value: model,
				onChange: (event) => onModel(event.target.value),
				"aria-label": t("model"),
			},
				h("option", { value: "all" }, t("allModels")),
				...options.models.map((entry) => h("option", { key: entry.name, value: entry.name }, entry.name)),
			);
			return h("div", { className: "dsu-toolbars" },
				h("div", { className: "dsu-toolbar" },
					range,
					h("div", { className: "dsu-spacer" }),
					h("button", { type: "button", className: "dsu-btn", onClick: onPricing }, t("pricing")),
					h("button", { type: "button", className: "dsu-btn", onClick: onExport }, t("export")),
					h("button", {
						type: "button",
						className: "dsu-btn dsu-icon-btn",
						onClick: onRefresh,
						title: t("refresh"),
						"aria-label": t("refresh"),
						disabled: busy,
					}, h("svg", { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 1.4 },
						h("path", { d: "M13 8a5 5 0 1 1-1.6-3.7" }),
						h("path", { d: "M13 2.6V5.4H10.2" }),
					)),
				),
				h("div", { className: "dsu-toolbar" }, providerSelect, modelSelect),
			);
		}
		//#endregion

		//#region pricing panel
		function PricingPanel(props) {
			const { t, onClose } = props;
			const [state, setState] = useState({ status: "loading", rows: [], error: null });
			const [draft, setDraft] = useState({});
			const [saving, setSaving] = useState("");
			const [saved, setSaved] = useState("");

			const load = useCallback(async () => {
				try {
					const response = await fetch(`${API}/pricing`, { headers: { accept: "application/json" } });
					const body = await response.json();
					if (!response.ok) throw new Error(body.error || "HTTP " + response.status);
					setState({ status: "ready", rows: body.models || [], error: null });
				} catch (error) {
					setState({ status: "error", rows: [], error: String(error.message || error) });
				}
			}, []);
			useEffect(() => { load(); }, [load]);

			const valueOf = (row, field) => {
				const key = row.model;
				if (draft[key] && draft[key][field] !== undefined) return draft[key][field];
				return String(row.price[field]);
			};
			const change = (model, field, value) => {
				setDraft((current) => ({ ...current, [model]: { ...(current[model] || {}), [field]: value } }));
			};
			const save = async (row, reset) => {
				setSaving(row.model);
				setSaved("");
				try {
					const payload = reset
						? { model: row.model, reset: true }
						: { model: row.model, hit: Number(valueOf(row, "hit")), miss: Number(valueOf(row, "miss")), out: Number(valueOf(row, "out")) };
					const response = await fetch(`${API}/pricing`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(payload),
					});
					const body = await response.json();
					if (!response.ok) throw new Error(body.error || "HTTP " + response.status);
					setDraft((current) => {
						const next = { ...current };
						delete next[row.model];
						return next;
					});
					setSaved(row.model);
					await load();
					props.onChanged();
				} catch (error) {
					setState((current) => ({ ...current, error: String(error.message || error) }));
				} finally {
					setSaving("");
				}
			};

			return h("div", { className: "dsu-panel dsu-pricing" },
				h("div", { className: "dsu-panel-head" },
					h("span", { className: "dsu-panel-title" }, t("priceTitle")),
					h("button", { type: "button", className: "dsu-link-btn", onClick: onClose }, t("close")),
				),
				h("p", { className: "dsu-note" }, t("priceHelp")),
				state.status === "error" ? h("p", { className: "dsu-error" }, state.error) : null,
				state.rows.length === 0 ? h("p", { className: "dsu-note" }, t("priceEmpty")) : null,
				state.rows.length > 0 ? h("div", { className: "dsu-price-table" },
					h("div", { className: "dsu-price-head" },
						h("span", null, t("priceModel")),
						h("span", null, t("priceHit")),
						h("span", null, t("priceMiss")),
						h("span", null, t("priceOut")),
						h("span", null, ""),
					),
					state.rows.map((row) => h("div", { className: "dsu-price-row", key: row.model },
						h("div", { className: "dsu-price-name" },
							h("span", { className: "dsu-price-model" }, row.model),
							h("span", { className: "dsu-price-meta" },
								row.providers.join(" · "),
								row.price.custom ? " · " + t("custom") : " · " + t("defaultPrice"),
							),
						),
						["hit", "miss", "out"].map((field) => h("input", {
							key: field,
							className: "dsu-input",
							type: "number",
							min: "0",
							step: "0.001",
							value: valueOf(row, field),
							onChange: (event) => change(row.model, field, event.target.value),
							"aria-label": `${row.model} ${t("price" + field[0].toUpperCase() + field.slice(1))}`,
						})),
						h("div", { className: "dsu-price-actions" },
							h("button", {
								type: "button",
								className: "dsu-btn dsu-btn-small",
								disabled: saving === row.model,
								onClick: () => save(row, false),
							}, saving === row.model ? "…" : t("save")),
							row.price.custom || draft[row.model]
								? h("button", {
									type: "button",
									className: "dsu-link-btn",
									disabled: saving === row.model,
									onClick: () => save(row, true),
								}, t("reset"))
								: null,
							saved === row.model ? h("span", { className: "dsu-saved" }, t("saved")) : null,
						),
					)),
				) : null,
			);
		}
		//#endregion

		//#region section
		function UsageSection(props) {
			const t = props.t;
			const [days, setDays] = useState(30);
			const [provider, setProvider] = useState("all");
			const [model, setModel] = useState("all");
			const [metric, setMetric] = useState("cost");
			const [state, setState] = useState({ status: "loading", data: null, error: null });
			const [pricingOpen, setPricingOpen] = useState(false);
			const requestSeq = useRef(0);

			const load = useCallback(async (rescan) => {
				const seq = (requestSeq.current += 1);
				setState((current) => ({ ...current, status: current.data ? "refreshing" : "loading", error: null }));
				try {
					const qs = new URLSearchParams({ days: String(days), provider, model });
					if (rescan) qs.set("rescan", "1");
					const response = await fetch(`${API}/summary?${qs.toString()}`, { headers: { accept: "application/json" } });
					const body = await response.json();
					if (!response.ok) throw new Error(body.error || "HTTP " + response.status);
					if (seq !== requestSeq.current) return;
					setState({ status: "ready", data: body, error: null });
				} catch (error) {
					if (seq !== requestSeq.current) return;
					setState((current) => ({ status: "error", data: current.data, error: String(error.message || error) }));
				}
			}, [days, provider, model]);

			useEffect(() => { load(false); }, [load]);

			const running = Boolean(state.data && state.data.meta && state.data.meta.backfill && state.data.meta.backfill.running);
			useEffect(() => {
				if (!running) return undefined;
				const timer = setTimeout(() => load(false), 1400);
				return () => clearTimeout(timer);
			}, [running, state.data, load]);

			const data = state.data;
			const totals = data ? data.totals : null;
			const options = data ? data.available : { providers: [], models: [] };

			const openExport = () => {
				const qs = new URLSearchParams({ days: String(days), provider, model });
				const link = document.createElement("a");
				link.href = `${API}/export?${qs.toString()}`;
				link.download = "";
				document.body.appendChild(link);
				link.click();
				link.remove();
			};

			const metricConfig = metric === "tokens"
				? { label: t("tokensChart"), key: "tokens", formatValue: fmtInt, formatAxis: fmtAxis, color: BLUE }
				: metric === "requests"
					? { label: t("requestsChart"), key: "requests", formatValue: (v) => fmtInt(v) + " " + t("requestsUnit"), formatAxis: fmtAxis, color: BLUE }
					: { label: t("costChart"), key: "cost", formatValue: (v) => "¥" + fmtMoney(v), formatAxis: fmtAxis, color: ORANGE };

			const chartValues = data ? data.series.map((row) => row[metricConfig.key]) : [];
			const chartTitle = metric === "cost"
				? `¥${fmtMoney(totals ? totals.cost : 0)}`
				: metric === "tokens"
					? fmtInt(totals ? totals.tokens : 0)
					: fmtInt(totals ? totals.requests : 0);

			const header = h("div", { className: "dsu-head" },
				h("div", null,
					h("h2", { className: "dsu-title" }, t("title")),
					h("p", { className: "dsu-sub" }, t("intro")),
				),
			);

			const toolbar = h(Toolbar, {
				t,
				days,
				onDays: setDays,
				provider,
				onProvider: setProvider,
				model,
				onModel: setModel,
				options,
				onExport: openExport,
				onRefresh: () => load(true),
				onPricing: () => setPricingOpen((open) => !open),
				busy: state.status === "refreshing",
			});

			const statusLine = running
				? h("div", { className: "dsu-status" },
					h("span", { className: "dsu-spinner" }),
					`${t("backfilling")} ${data.meta.backfill.scanned}/${data.meta.backfill.total}`,
				)
				: null;

			const cards = totals
				? h("div", { className: "dsu-cards" },
					h(StatCard, {
						label: t("cost"),
						value: "¥" + fmtMoney(totals.cost),
						unit: "CNY",
						hint: `${t("officialCost")} ¥${fmtMoney(totals.officialCost)} · ${t("thirdCost")} ¥${fmtMoney(totals.thirdCost)}`,
					}),
					h(StatCard, {
						label: t("requests"),
						value: fmtInt(totals.requests),
						hint: `${fmtInt(totals.sessions)} ${t("sessionsCount")}`,
					}),
					h(StatCard, {
						label: t("tokens"),
						value: fmtInt(totals.tokens),
						hint: `${t("input")} ${fmtInt(totals.input)} · ${t("output")} ${fmtInt(totals.output)}`,
					}),
				)
				: null;

			const chartPanel = data
				? h("div", { className: "dsu-panel" },
					h("div", { className: "dsu-panel-head" },
						h("div", { className: "dsu-chart-title" },
							h("span", { className: "dsu-panel-title" }, metricConfig.label),
							h("span", { className: "dsu-chart-value" }, chartTitle),
						),
						h("div", { className: "dsu-metrics" }, [
							["cost", t("cost")],
							["tokens", t("tokens")],
							["requests", t("requests")],
						].map(([key, label]) => h("button", {
							key,
							type: "button",
							className: "dsu-metric",
							"data-active": String(metric === key),
							onClick: () => setMetric(key),
						}, label))),
					),
					data.totals.requests === 0
						? h("div", { className: "dsu-empty" },
							h("p", { className: "dsu-empty-title" }, t("empty")),
							h("p", { className: "dsu-note" }, t("emptyHint")),
						)
						: h(BarChart, {
							labels: data.axis.labels,
							values: chartValues,
							formatValue: metricConfig.formatValue,
							formatAxisValue: metricConfig.formatAxis,
							color: metricConfig.color,
						}),
				)
				: null;

			const models = data && data.models.length > 0
				? h("div", { className: "dsu-models" },
					h("h3", { className: "dsu-section-title" }, t("byModel")),
					data.models.map((row) => h("div", { className: "dsu-model", key: row.model },
						h("div", { className: "dsu-model-head" },
							h("span", { className: "dsu-model-name" }, row.model),
							h("span", { className: "dsu-tag" }, ...row.providers.map((id) => h("span", { key: id, className: "dsu-tag-item" }, id))),
							h("span", { className: "dsu-model-spend" }, `¥${fmtMoney(row.cost)}`),
						),
						h("div", { className: "dsu-model-grid" },
							h("div", { className: "dsu-card dsu-mini" },
								h("div", { className: "dsu-mini-head" },
									h("span", { className: "dsu-card-label" }, t("requests")),
									h("span", { className: "dsu-mini-value" }, fmtInt(row.requests)),
								),
								h(Sparkline, { values: row.series.requests }),
							),
							h("div", { className: "dsu-card dsu-mini" },
								h("div", { className: "dsu-mini-head" },
									h("span", { className: "dsu-card-label" }, t("tokens")),
									h("span", { className: "dsu-mini-value" }, fmtInt(row.tokens)),
								),
								h(Sparkline, { values: row.series.tokens }),
							),
						),
					)),
				)
				: null;

			const recent = data && data.recent.length > 0
				? h("div", { className: "dsu-panel" },
					h("div", { className: "dsu-panel-head" },
						h("span", { className: "dsu-panel-title" }, t("recent")),
						h("span", { className: "dsu-note" }, t("tableHint")),
					),
					h("div", { className: "dsu-table-wrap" },
						h("table", { className: "dsu-table" },
							h("thead", null, h("tr", null,
								h("th", null, t("time")),
								h("th", null, t("model")),
								h("th", null, t("provider")),
								h("th", { className: "num" }, t("tokens")),
								h("th", { className: "num" }, t("fee")),
							)),
							h("tbody", null, data.recent.map((row, index) => h("tr", { key: index },
								h("td", { className: "muted" }, fmtClock(row.ts)),
								h("td", null,
									row.model,
									row.kind !== "turn" ? h("span", { className: "dsu-kind" }, t(row.kind === "compaction" ? "kindCompaction" : "kindTitle")) : null,
								),
								h("td", { className: "muted" }, row.provider + (row.peak ? " · " + t("peak") : "")),
								h("td", { className: "num" }, fmtInt(row.tokens)),
								h("td", { className: "num" }, "¥" + fmtMoney(row.cost)),
							))),
						),
					),
				)
				: null;

			const footer = h("p", { className: "dsu-foot" },
				t("note"),
				data && data.meta && data.meta.events > 0
					? ` · ${fmtInt(data.meta.events)} 条记录${data.meta.firstDay ? " · " + data.meta.firstDay + " 起" : ""}`
					: "",
			);

			const body = state.status === "loading" && !data
				? h("div", { className: "dsu-panel dsu-loading" }, h("span", { className: "dsu-spinner" }), t("loading"))
				: state.status === "error" && !data
					? h("div", { className: "dsu-panel dsu-loading" },
						h("span", { className: "dsu-error" }, `${t("failed")}: ${state.error}`),
						h("button", { type: "button", className: "dsu-btn", onClick: () => load(false) }, t("retry")),
					)
					: null;

			return h("div", { className: "dsu-root" },
				header,
				toolbar,
				statusLine,
				state.status === "error" && data ? h("p", { className: "dsu-error" }, `${t("failed")}: ${state.error}`) : null,
				pricingOpen ? h(PricingPanel, { t, onClose: () => setPricingOpen(false), onChanged: () => load(false) }) : null,
				body,
				cards,
				chartPanel,
				models,
				recent,
				footer,
			);
		}
		//#endregion

		//#region styles
		const CSS = `
.dsu-root{max-width:760px;color:var(--dsw-alias-label-primary,#1f2329);display:flex;flex-direction:column;gap:16px;font-size:14px;line-height:1.5}
.dsu-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.dsu-title{margin:0;font-size:16px;font-weight:500;line-height:24px}
.dsu-sub{margin:4px 0 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary,#8a9099)}
.dsu-toolbars{display:flex;flex-direction:column;gap:8px}
.dsu-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsu-range{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 4px 0 10px;border-radius:8px;background:var(--dsw-alias-settings-card-fill,#f4f4f5)}
.dsu-range-label{font-size:13px;color:var(--dsw-alias-label-secondary,#5c6470);white-space:nowrap}
.dsu-select{appearance:none;-webkit-appearance:none;height:32px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));background-color:var(--dsw-alias-bg-module-platform,#fff);color:inherit;font:inherit;font-size:13px;padding:0 28px 0 10px;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 3.5 5 6.5 8 3.5' fill='none' stroke='%238a9099' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;outline:none}
.dsu-range .dsu-select{height:24px;border:none;background-color:transparent;font-size:13px;color:var(--dsw-alias-label-primary,#1f2329)}
.dsu-select:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4f8cff))}
.dsu-spacer{flex:1}
.dsu-btn{box-sizing:border-box;height:32px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));background:transparent;color:inherit;font:inherit;font-size:13px;padding:0 12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
.dsu-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04))}
.dsu-btn:disabled{opacity:.45;cursor:default}
.dsu-btn-small{height:26px;padding:0 10px;font-size:12px}
.dsu-icon-btn{width:32px;padding:0}
.dsu-link-btn{border:none;background:transparent;color:var(--dsw-alias-state-business-primary,#4f8cff);font:inherit;font-size:12px;cursor:pointer;padding:0 2px}
.dsu-link-btn:disabled{opacity:.45;cursor:default}
.dsu-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.dsu-card{background:var(--dsw-alias-settings-card-fill,#f4f4f5);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:4px;min-width:0}
.dsu-card-label{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#5c6470);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsu-card-value{font-size:24px;line-height:32px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;display:flex;align-items:baseline;gap:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsu-card-unit{font-size:11px;font-weight:400;color:var(--dsw-alias-label-tertiary,#8a9099)}
.dsu-card-hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#8a9099);font-variant-numeric:tabular-nums}
.dsu-panel{background:var(--dsw-alias-settings-card-fill,#f4f4f5);border-radius:14px;padding:16px}
.dsu-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
.dsu-panel-title{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary,#5c6470)}
.dsu-chart-title{display:flex;flex-direction:column;gap:2px}
.dsu-chart-value{font-size:20px;line-height:28px;font-weight:600;font-variant-numeric:tabular-nums}
.dsu-metrics{display:inline-flex;gap:2px;padding:2px;border-radius:8px;background:var(--dsw-alias-bg-module-platform,#fff)}
.dsu-metric{border:none;background:transparent;color:var(--dsw-alias-label-secondary,#5c6470);font:inherit;font-size:12px;line-height:18px;padding:3px 8px;border-radius:6px;cursor:pointer;white-space:nowrap}
.dsu-metric[data-active="true"]{background:var(--dsw-alias-settings-card-fill,#f4f4f5);color:var(--dsw-alias-label-primary,#1f2329);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.dsu-chart{position:relative;margin-top:4px}
.dsu-tip{position:absolute;transform:translate(-50%,-100%);background:var(--dsw-alias-label-primary,#1f2329);color:var(--dsw-alias-bg-module-platform,#fff);font-size:12px;line-height:18px;padding:5px 8px;border-radius:7px;white-space:nowrap;pointer-events:none;z-index:3}
.dsu-status{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-tertiary,#8a9099)}
.dsu-spinner{width:12px;height:12px;border-radius:50%;border:2px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));border-top-color:var(--dsw-alias-label-secondary,#5c6470);display:inline-block;animation:dsu-spin .8s linear infinite}
@keyframes dsu-spin{to{transform:rotate(360deg)}}
.dsu-models{display:flex;flex-direction:column;gap:14px}
.dsu-section-title{margin:0;font-size:14px;font-weight:500;line-height:22px}
.dsu-model{display:flex;flex-direction:column;gap:8px}
.dsu-model-head{display:flex;align-items:center;gap:8px;min-width:0}
.dsu-model-name{font-size:15px;font-weight:500;line-height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsu-tag{display:inline-flex;gap:4px;flex-wrap:wrap;min-width:0}
.dsu-tag-item{font-size:11px;line-height:16px;padding:1px 6px;border-radius:4px;border:.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));color:var(--dsw-alias-label-tertiary,#8a9099)}
.dsu-model-spend{margin-left:auto;font-size:13px;color:var(--dsw-alias-label-secondary,#5c6470);font-variant-numeric:tabular-nums}
.dsu-model-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.dsu-mini{padding:14px 16px;gap:8px}
.dsu-mini-head{display:flex;flex-direction:column;align-items:flex-start;gap:1px}
.dsu-mini-value{font-size:20px;line-height:28px;font-weight:600;font-variant-numeric:tabular-nums}
.dsu-table-wrap{overflow-x:auto;margin:0 -6px}
.dsu-table{width:100%;border-collapse:collapse;font-size:12px}
.dsu-table th{text-align:left;font-weight:400;color:var(--dsw-alias-label-tertiary,#8a9099);padding:6px;border-bottom:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));white-space:nowrap}
.dsu-table td{padding:7px 6px;border-bottom:.5px solid var(--dsw-alias-border-l1,rgba(0,0,0,.05));white-space:nowrap;font-variant-numeric:tabular-nums}
.dsu-table tr:last-child td{border-bottom:none}
.dsu-table .num{text-align:right}
.dsu-table .muted{color:var(--dsw-alias-label-tertiary,#8a9099)}
.dsu-kind{margin-left:6px;font-size:10px;line-height:14px;padding:0 4px;border-radius:3px;background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.05));color:var(--dsw-alias-label-tertiary,#8a9099)}
.dsu-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:180px;gap:4px}
.dsu-empty-title{margin:0;font-size:14px;font-weight:500}
.dsu-note{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a9099)}
.dsu-foot{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a9099)}
.dsu-error{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary,#e5484d)}
.dsu-loading{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-secondary,#5c6470)}
.dsu-pricing{display:flex;flex-direction:column;gap:10px}
.dsu-price-table{display:flex;flex-direction:column}
.dsu-price-head,.dsu-price-row{display:grid;grid-template-columns:minmax(0,1fr) 82px 82px 82px 104px;gap:8px;align-items:center}
.dsu-price-head{padding:0 0 6px;font-size:11px;color:var(--dsw-alias-label-tertiary,#8a9099);border-bottom:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08))}
.dsu-price-row{padding:8px 0;border-bottom:.5px solid var(--dsw-alias-border-l1,rgba(0,0,0,.05))}
.dsu-price-row:last-child{border-bottom:none}
.dsu-price-name{display:flex;flex-direction:column;min-width:0;gap:1px}
.dsu-price-model{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsu-price-meta{font-size:11px;color:var(--dsw-alias-label-tertiary,#8a9099);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsu-price-actions{display:flex;align-items:center;gap:6px;justify-content:flex-end;flex-wrap:wrap}
.dsu-saved{font-size:11px;color:var(--dsw-alias-state-success-primary,#2f9e44)}
.dsu-input{box-sizing:border-box;width:100%;height:28px;border-radius:6px;border:.5px solid var(--dsw-alias-border-l3,rgba(0,0,0,.12));background:var(--dsw-alias-bg-module-platform,#fff);color:inherit;font:inherit;font-size:12px;padding:0 6px;font-variant-numeric:tabular-nums}
.dsu-input:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4f8cff))}
@media (max-width:640px){.dsu-cards{grid-template-columns:1fr}.dsu-model-grid{grid-template-columns:1fr}.dsu-price-head,.dsu-price-row{grid-template-columns:minmax(0,1fr) 70px 70px 70px}.dsu-price-head span:last-child,.dsu-price-actions{grid-column:1/-1;justify-content:flex-start}}
`;
		//#endregion

		//#region nav icon
		const NAV_ROW_SELECTOR = '[role="dialog"] nav button';
		const NAV_MARKER = "data-dsh-usage-nav";
		const NAV_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="2" y="8" width="3" height="6" rx=".8" fill="#000"/><rect x="6.5" y="4.5" width="3" height="9.5" rx=".8" fill="#000"/><rect x="11" y="2" width="3" height="12" rx=".8" fill="#000"/></svg>`;
		function navIconCss() {
			const url = `data:image/svg+xml,${encodeURIComponent(NAV_SVG)}`;
			return [
				`[${NAV_MARKER}] > svg { display: none; }`,
				`[${NAV_MARKER}]::before { content: ''; flex: none; width: 16px; height: 16px; background-color: currentColor;`,
				`  -webkit-mask-image: url("${url}"); mask-image: url("${url}"); -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;`,
				`  -webkit-mask-position: center; mask-position: center; -webkit-mask-size: 16px 16px; mask-size: 16px 16px; }`,
			].join("\n");
		}
		function installNavIcon(ctx, resolveLabel) {
			if (typeof document === "undefined") return;
			ctx.effect(() => {
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-usage-insights";
				tag.textContent = navIconCss();
				document.head.appendChild(tag);
				let disposed = false;
				let scheduled = false;
				const sync = () => {
					scheduled = false;
					if (disposed) return;
					const wanted = resolveLabel();
					for (const row of document.querySelectorAll(NAV_ROW_SELECTOR)) {
						const text = String(row.textContent || "").trim();
						if (text === wanted) row.setAttribute(NAV_MARKER, "");
						else row.removeAttribute(NAV_MARKER);
					}
				};
				const schedule = () => {
					if (scheduled || disposed) return;
					scheduled = true;
					queueMicrotask(sync);
				};
				sync();
				const observer = new MutationObserver(schedule);
				observer.observe(document.body, { childList: true, subtree: true, characterData: true });
				return () => {
					disposed = true;
					observer.disconnect();
					for (const row of document.querySelectorAll(`[${NAV_MARKER}]`)) row.removeAttribute(NAV_MARKER);
					tag.remove();
				};
			}, "dsh-usage-insights: settings nav icon");
		}
		//#endregion

		//#region plugin
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-usage-insights: copy dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.effect(() => {
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-usage-insights";
				tag.textContent = CSS;
				document.head.appendChild(tag);
				return () => tag.remove();
			}, "dsh-usage-insights: styles");
			installNavIcon(ctx, () => t("nav"));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "usage",
				order: 12,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({ t }),
			}, UsageSection));
		}
		const inject = ["slots", "locale"];
		exports.apply = apply;
		exports.inject = inject;
		exports.name = NS;
		exports.UsageSection = UsageSection;
		return module.exports;
	}
});
