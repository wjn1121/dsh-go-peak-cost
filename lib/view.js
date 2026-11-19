// 折成 App 能画的三样东西：输入框上方状态条（≤ 24 字）、面板的视图与数据、每轮费用的尾注。
// 纯函数，不碰 ctx，方便单测：index.js 只负责把引擎侧的快照喂进来。
import { rates } from './pricing.js';

const SHORT = {
  idle: { zh: '空闲', en: 'Idle' },
  thinking: { zh: '思考中', en: 'Thinking' },
  streaming: { zh: '回答中', en: 'Replying' },
  tools: { zh: '执行中', en: 'Tools' },
  waiting: { zh: '待确认', en: 'Waiting' },
  completed: { zh: '已完成', en: 'Done' },
  paused: { zh: '已暂停', en: 'Paused' },
  error: { zh: '出错', en: 'Error' },
  reconnecting: { zh: '重试中', en: 'Retrying' },
  compacting: { zh: '整理中', en: 'Compacting' },
  offline: { zh: '已断开', en: 'Offline' },
};

const LONG = {
  idle: { zh: '随时待命', en: 'Idle' },
  thinking: { zh: '正在思考', en: 'Thinking' },
  streaming: { zh: '正在回答', en: 'Replying' },
  tools: { zh: '正在执行', en: 'Running tools' },
  waiting: { zh: '等待你确认', en: 'Waiting for you' },
  completed: { zh: '已完成', en: 'Done' },
  paused: { zh: '已暂停', en: 'Paused' },
  error: { zh: '需要留意', en: 'Needs attention' },
  reconnecting: { zh: '正在重试', en: 'Retrying' },
  compacting: { zh: '整理上下文', en: 'Compacting' },
  offline: { zh: '连接已断开', en: 'Offline' },
};

const ICON = {
  idle: 'clock',
  thinking: 'lightbulb',
  streaming: 'chat',
  tools: 'wrench',
  waiting: 'question',
  completed: 'check',
  paused: 'pause',
  error: 'warning',
  reconnecting: 'refresh',
  compacting: 'archive',
  offline: 'power',
};

const WORDS = {
  zh: {
    code: 'zh',
    status: '状态',
    active: '进行中',
    context: '上下文',
    today: '今日',
    costToday: '今日费用',
    sessionCost: '本会话',
    todayCost: '今日',
    model: '当前模型',
    noData: '暂无数据',
    todayChart: '今日 24 小时花费',
    todayChartCaption: '0–23 时 · 金额（元）',
    sessionChart: '本会话 · 每轮花费',
    sessionChartCaption: '按轮次 · 金额（元）',
    sessionList: '最近轮次',
    todayOverview: '今日概览',
    weekCost: '近 7 天花费',
    weekCaption: '每天 · 金额（元）',
    cost: '费用',
    unit: '元',
    tokens: 'tokens',
    output: '输出',
    hit: '缓存命中',
    turns: '轮次',
    week: '近 7 天 · tokens',
    models: '按模型',
    unknown: '未知模型',
    copy: '复制摘要',
    copied: '已复制',
    refresh: '刷新',
    empty: '暂无数据',
    peak: '计费时段',
    peakValue: '峰时',
    offValue: '谷时',
    nextSwitch: '下次切换',
    rates: '当前单价（元 / 百万 tokens）',
    ratesOther: '另一时段',
    priceCaption: '高峰：北京时间周一至周五 09:00–12:00、14:00–18:00；其余为空闲价，约为高峰价一半。法定节假日暂按工作日估算。',
    sessionTurns: '本会话 · 每轮花费',
    noTurns: '还没有完成的轮次',
    priced: '估价',
    source: '价格来自 DeepSeek 官方价目（2026-11-19 查询），仅供参考，以账单为准。',
  },
  en: {
    code: 'en',
    status: 'Status',
    active: 'Active',
    context: 'Context',
    today: 'Today',
    costToday: 'Cost today',
    sessionCost: 'Chat',
    todayCost: 'Today',
    model: 'Model',
    noData: 'No data',
    todayChart: 'Today · cost by hour',
    todayChartCaption: '0–23 local time · CNY',
    sessionChart: 'This chat · cost per turn',
    sessionChartCaption: 'By turn · CNY',
    sessionList: 'Recent turns',
    todayOverview: 'Today at a glance',
    weekCost: 'Last 7 days · cost',
    weekCaption: 'Per day · CNY',
    cost: 'Cost',
    unit: 'CNY',
    tokens: 'tokens',
    output: 'Output',
    hit: 'Cache hits',
    turns: 'Turns',
    week: 'Last 7 days · tokens',
    models: 'By model',
    unknown: 'Unknown model',
    copy: 'Copy summary',
    copied: 'Copied',
    refresh: 'Refresh',
    empty: 'No data',
    peak: 'Billing period',
    peakValue: 'Peak',
    offValue: 'Off-peak',
    nextSwitch: 'Next switch',
    rates: 'Current rate (CNY / M tokens)',
    ratesOther: 'Other period',
    priceCaption: 'Peak: Mon–Fri 09:00–12:00 and 14:00–18:00 Beijing time; everything else is off-peak at about half price. Holidays are approximated as weekdays.',
    sessionTurns: 'This session · per turn',
    noTurns: 'No finished turns yet',
    priced: 'estimate',
    source: 'Prices from DeepSeek official pricing (checked 2026-11-19); estimates only, billing prevails.',
  },
};

/** zh 除非 App 说是英文。 */
export function words(locale) {
  return typeof locale === 'string' && locale.toLowerCase().startsWith('en') ? WORDS.en : WORDS.zh;
}

const clamp = (text, max) => {
  const chars = Array.from(String(text ?? ''));
  return chars.length > max ? `${chars.slice(0, Math.max(0, max - 1)).join('')}…` : chars.join('');
};

/** 1234 → 1.2K；1234567 → 1.23M；1000000 → 1M。 */
export function compact(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  const trim = (text) => text.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  if (n < 1000) return String(Math.round(n));
  if (n < 1e6) return `${trim((n / 1e3).toFixed(n < 1e4 ? 1 : 0))}K`;
  return `${trim((n / 1e6).toFixed(n < 1e7 ? 2 : 1))}M`;
}

/** 费用：不到一分钱时多留一位，免得全显示 ¥0.00。 */
export function yuan(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '¥0.00';
  if (n < 0.01) return `¥${n.toFixed(3)}`;
  if (n < 1000) return `¥${n.toFixed(2)}`;
  return `¥${Math.round(n)}`;
}

/** 状态条用的紧凑金额：10.00 → ¥10，10.50 → ¥10.5；面板仍用 yuan。 */
export function stripYuan(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '¥0';
  if (n < 0.01) return `¥${n.toFixed(3)}`;
  if (n < 1) return `¥${n.toFixed(2)}`;
  if (n < 1000) return `¥${parseFloat(n.toFixed(2))}`;
  return `¥${Math.round(n)}`;
}

/** 单价：整数就去掉小数，否则保留两位有效位。 */
export function price(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '¥0';
  if (n >= 10) return `¥${Math.round(n)}`;
  return `¥${parseFloat(n.toFixed(3))}`;
}

const percent = (tokens, window) => {
  if (!Number.isFinite(tokens) || !Number.isFinite(window) || window <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((tokens / window) * 100)));
};

/** 当前时段的短标签：峰时 / 谷时。 */
export function shiftShort(peakInfo, w) {
  const peak = peakInfo?.peak === true;
  return peak ? (w.code === 'zh' ? '峰时' : 'Peak') : (w.code === 'zh' ? '谷时' : 'Off-peak');
}

/** 面板的视图：结构固定，数字都是对 data 的绑定，桥接只推增量。 */
export function panelView(w) {
  return {
    type: 'stack',
    children: [
      {
        type: 'row',
        children: [
          { type: 'metric', label: w.sessionCost, value: { $: 'data.sessionCost' } },
          { type: 'metric', label: w.todayCost, value: { $: 'data.today.cost' } },
          { type: 'metric', label: w.peak, value: { $: 'data.peak.label' }, tone: { $: 'data.peak.tone' } },
          { type: 'metric', label: w.nextSwitch, value: { $: 'data.peak.next' } },
        ],
      },
      { type: 'text', text: w.todayChart, tone: 'muted' },
      {
        type: 'chart',
        kind: 'bar',
        categories: { $: 'data.todayHours.labels' },
        series: [{ name: w.cost, values: { $: 'data.todayHours.values' } }],
        unit: w.unit,
        caption: { $: 'data.todayChartCaption' },
      },
      { type: 'text', text: w.sessionChart, tone: 'muted' },
      {
        type: 'chart',
        kind: 'bar',
        categories: { $: 'data.sessionChart.labels' },
        series: [{ name: w.cost, values: { $: 'data.sessionChart.values' } }],
        unit: w.unit,
        caption: { $: 'data.sessionChartCaption' },
      },
      { type: 'text', text: w.sessionList, tone: 'muted' },
      { type: 'list', items: { $: 'data.turns' } },
      { type: 'text', text: w.rates, tone: 'muted' },
      { type: 'text', text: { $: 'data.modelLabel' }, tone: 'muted' },
      { type: 'keyValue', items: { $: 'data.rates' } },
      { type: 'text', text: { $: 'data.ratesOther' }, tone: 'muted' },
      { type: 'text', text: w.priceCaption, tone: 'muted' },
      { type: 'text', text: w.todayOverview, tone: 'muted' },
      {
        type: 'keyValue',
        items: [
          [w.tokens, { $: 'data.today.tokens' }],
          [w.output, { $: 'data.today.output' }],
          [w.hit, { $: 'data.today.hit' }],
          [w.turns, { $: 'data.today.turns' }],
        ],
      },
      {
        type: 'progress',
        label: w.context,
        value: { $: 'data.ctx.percent' },
        caption: { $: 'data.ctx.caption' },
      },
      { type: 'text', text: w.weekCost, tone: 'muted' },
      {
        type: 'chart',
        kind: 'line',
        categories: { $: 'data.week.labels' },
        series: [{ name: w.cost, values: { $: 'data.week.values' } }],
        unit: w.unit,
        caption: w.weekCaption,
      },
      { type: 'text', text: w.models, tone: 'muted' },
      { type: 'list', items: { $: 'data.models' } },
      {
        type: 'actions',
        items: [
          { label: w.copy, icon: 'summary', action: 'copy' },
          { label: w.refresh, icon: 'refresh', action: 'refresh' },
        ],
      },
      { type: 'callout', tone: 'info', text: w.source },
    ],
  };
}

const keyOf = (state) => (typeof state === 'string' && SHORT[state] ? state : 'idle');
const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

/** 面板绑的数据：文字按 App 的语言取，数字和模型名；含峰谷时段与单价。 */
export function panelData(snap, locale, shift) {
  const w = words(locale);
  const state = keyOf(snap?.state);
  const { tokens, window } = snap?.ctx ?? {};
  const today = snap?.today ?? {};
  const week = snap?.week ?? {};
  const todayHours = snap?.todayHours ?? {};
  const models = Array.isArray(snap?.models) ? snap.models : [];
  const peak = snap?.peak ?? {};
  const peakNow = peak.peak === true;
  const otherPeak = !peakNow;
  const nowRate = rateRows(snap?.model, peakNow ? 'peak' : 'offPeak', w);
  const otherRate = rateRows(snap?.model, otherPeak ? 'peak' : 'offPeak', w);
  const turns = Array.isArray(snap?.turns) ? snap.turns : [];
  const recentTurns = turns.slice(-24);
  const todayCostRaw = Number(today.cost) || 0;
  const nextAt = Number(peak.nextAt);
  const mins = Number.isFinite(nextAt) ? Math.max(0, Math.round((nextAt - Date.now()) / 60000)) : null;
  const nextIn = mins == null ? '' : mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? `${mins % 60}m` : ''}` : `${mins}m`;
  return {
    stateLabel: LONG[state][w.code],
    activeCount: String(snap?.activeCount ?? 0),
    sessionCost: snap?.sessionCost == null ? '—' : yuan(snap.sessionCost),
    peak: {
      label: shiftShort(peak, w),
      next: shift?.nextLabel ? `→ ${shift.nextLabel}${nextIn ? ` · ${nextIn}` : ''}` : '—',
      tone: peakNow ? 'warn' : 'good',
    },
    modelLabel: `${w.model} · ${snap?.model || w.unknown}`,
    todayHours: {
      labels: Array.isArray(todayHours.labels) ? todayHours.labels : [],
      values: Array.isArray(todayHours.values) ? todayHours.values.map(round4) : [],
    },
    sessionChart: {
      labels: recentTurns.map((t) => String(t.turn ?? '')),
      values: recentTurns.map((t) => round4(t.cost)),
    },
    todayChartCaption: todayCostRaw > 0 ? w.todayChartCaption : w.noData,
    sessionChartCaption: turns.length ? w.sessionChartCaption : w.noData,
    rates: nowRate,
    ratesOther: otherRate
      ? `${trimColon(w.ratesOther)}${w.code === 'zh' ? '：' : ': '}${otherRate.map(([k, v]) => `${k} ${v}`).join(' / ')}`
      : '',
    ctx: {
      percent: percent(tokens, window),
      text: percent(tokens, window) ? `${percent(tokens, window)}%` : '—',
      caption: window > 0 ? `${compact(tokens)} / ${compact(window)}` : compact(tokens),
    },
    today: {
      cost: yuan(today.cost),
      tokens: compact(today.tokens),
      output: compact(today.output),
      hit: Number.isFinite(today.cacheRate) ? `${today.cacheRate}%` : '—',
      turns: String(today.turns ?? 0),
    },
    week: {
      labels: Array.isArray(week.labels) ? week.labels : [],
      values: Array.isArray(week.values) ? week.values.map(round4) : [],
    },
    models: models.slice(0, 8).map((m) => ({
      title: String(m.model ?? w.unknown),
      trailing: `${compact(m.tokens)} · ${yuan(m.cost)}`,
      icon: 'model',
    })),
    turns: turns.length
      ? turns.slice(-6).reverse().map((t) => ({
          title: w.code === 'zh' ? `第 ${t.turn} 轮` : `Turn ${t.turn}`,
          subtitle: t.peak === true ? w.peakValue : t.peak === false ? w.offValue : undefined,
          trailing: yuan(t.cost),
          icon: 'coin',
        }))
      : [{ title: w.noTurns, subtitle: w.empty, icon: 'info' }],
  };
}

/** 单价三行；未知模型给一行提示。 */
function rateRows(model, period, w) {
  const r = rates(model, period === 'peak');
  if (!r) return [[w.unknown, '—']];
  const labels = w.code === 'zh'
    ? ['输入 · 未命中', '输入 · 缓存命中', '输出']
    : ['Input · Miss', 'Input · Cached', 'Output'];
  return [
    [labels[0], price(r.miss)],
    [labels[1], price(r.hit)],
    [labels[2], price(r.out)],
  ];
}

const trimColon = (text) => String(text ?? '').replace(/[：:]\s*$/, '');

/**
 * 状态条这一行（≤ 24 字）。
 * 中文：`峰时 · 会话 ¥0.42 · 今日 ¥2.53`；英文：`Peak · ¥0.42 / ¥2.53`。
 * 费用变长时依次降级，保证两个金额都不会被截掉。
 */
export function stripData(snap, locale) {
  const w = words(locale);
  const state = keyOf(snap?.state);
  const shift = shiftShort(snap?.peak, w);
  const session = snap?.sessionCost == null ? '' : stripYuan(snap.sessionCost);
  const today = stripYuan(snap?.today?.cost);
  let text = w.code === 'en'
    ? [shift, [session, today].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')
    : [shift, session ? `会话${session}` : '', `今日${today}`].filter(Boolean).join(' · ');
  if (Array.from(text).length > 24) text = [shift, session, today].filter(Boolean).join(' · ');
  if (Array.from(text).length > 24) text = [session, today].filter(Boolean).join(' / ');
  return { text: clamp(text, 24), icon: ICON[state] ?? 'coin', tone: snap?.peak?.peak === true ? 'warn' : 'good' };
}

/** 每轮费用尾注：{ 轮次: { text } }，≤ 16 字；带峰/谷标记。 */
export function turnNotes(snap, locale) {
  const w = words(locale);
  const turns = Array.isArray(snap?.turns) ? snap.turns : [];
  const out = {};
  for (const turn of turns.slice(-64)) {
    const n = Number.isFinite(turn?.turn) ? turn.turn : null;
    if (n === null) continue;
    const atPeak = turn?.peak;
    const tag = atPeak === undefined ? '' : atPeak ? (w.code === 'zh' ? '峰 ' : 'Peak ') : (w.code === 'zh' ? '谷 ' : 'Off ');
    const tone = atPeak === true ? 'warn' : atPeak === false ? 'good' : undefined;
    out[String(n)] = { text: clamp(`${tag}${yuan(turn.cost)}`, 16), ...(tone ? { tone } : {}) };
  }
  return out;
}

/** 复制按钮写进剪贴板的纯文本。 */
export function summaryText(snap, data, shift, locale) {
  const w = words(locale);
  const weekTotal = (data.week?.values ?? []).reduce((n, v) => n + (Number(v) || 0), 0);
  const lines = [
    `${w.status}: ${data.stateLabel}`,
    `${w.sessionCost}: ${data.sessionCost}`,
    `${w.todayCost}: ${data.today.cost}`,
    `${w.peak}: ${data.peak.label}${shift?.nextLabel ? ` · ${w.nextSwitch} ${shift.nextLabel}` : ''}`,
    `${w.rates}: ${data.rates.map(([k, v]) => `${k} ${v}`).join(' / ')}`,
    ...(data.ratesOther ? [data.ratesOther] : []),
    `${w.context}: ${data.ctx.caption}`,
    `${w.todayOverview}: ${data.today.tokens} tokens · ${data.today.cost} · ${w.hit} ${data.today.hit} · ${w.turns} ${data.today.turns}`,
    `${w.weekCost}: ${yuan(weekTotal)}`,
  ];
  for (const m of data.models) lines.push(`- ${m.title}: ${m.trailing}`);
  for (const t of data.turns.slice(0, 10)) {
    if (t.trailing) lines.push(`- ${t.title}${t.subtitle ? ` (${t.subtitle})` : ''}: ${t.trailing}`);
  }
  return lines.join('\n');
}
