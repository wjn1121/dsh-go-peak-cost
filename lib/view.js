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
    priceCaption: '高峰：周一至周五 09:00–12:00、14:00–18:00；其余为空闲价，约为高峰价一半。法定节假日按工作日估算。',
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
export function panelView(w, inChat) {
  const lead = inChat
    ? [{ type: 'metric', label: w.status, value: { $: 'data.stateLabel' } }]
    : [
        { type: 'metric', label: w.status, value: { $: 'data.stateLabel' } },
        { type: 'metric', label: w.active, value: { $: 'data.activeCount' } },
      ];
  return {
    type: 'stack',
    children: [
      {
        type: 'row',
        children: [
          ...lead,
          { type: 'metric', label: w.peak, value: { $: 'data.peak.label' } },
          { type: 'metric', label: w.nextSwitch, value: { $: 'data.peak.next' } },
          { type: 'metric', label: w.costToday, value: { $: 'data.today.cost' } },
        ],
      },
      { type: 'callout', tone: 'info', text: w.priceCaption },
      { type: 'text', text: w.rates, tone: 'muted' },
      { type: 'keyValue', items: { $: 'data.rates' } },
      { type: 'text', text: { $: 'data.ratesOther' }, tone: 'muted' },
      { type: 'text', text: w.sessionTurns, tone: 'muted' },
      { type: 'list', items: { $: 'data.turns' } },
      {
        type: 'progress',
        label: w.context,
        value: { $: 'data.ctx.percent' },
        caption: { $: 'data.ctx.caption' },
      },
      {
        type: 'chart',
        kind: 'bar',
        categories: { $: 'data.week.labels' },
        series: [{ name: 'tokens', values: { $: 'data.week.values' } }],
        caption: w.week,
      },
      {
        type: 'keyValue',
        items: [
          [w.tokens, { $: 'data.today.tokens' }],
          [w.output, { $: 'data.today.output' }],
          [w.hit, { $: 'data.today.hit' }],
          [w.turns, { $: 'data.today.turns' }],
        ],
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

/** 面板绑的数据：文字按 App 的语言取，数字和模型名；含峰谷时段与单价。 */
export function panelData(snap, locale, shift) {
  const w = words(locale);
  const state = keyOf(snap?.state);
  const { tokens, window } = snap?.ctx ?? {};
  const today = snap?.today ?? {};
  const week = snap?.week ?? {};
  const models = Array.isArray(snap?.models) ? snap.models : [];
  const peak = snap?.peak ?? {};
  const peakNow = peak.peak === true;
  const otherPeak = !peakNow;
  const nowRate = rateRows(snap?.model, peakNow ? 'peak' : 'offPeak', w);
  const otherRate = rateRows(snap?.model, otherPeak ? 'peak' : 'offPeak', w);
  const turns = Array.isArray(snap?.turns) ? snap.turns : [];
  return {
    stateLabel: LONG[state][w.code],
    activeCount: String(snap?.activeCount ?? 0),
    peak: {
      label: shiftShort(peak, w),
      next: shift?.nextLabel ? `→ ${shift.nextLabel}` : '—',
    },
    rates: nowRate,
    ratesOther: otherRate ? `${trimColon(w.ratesOther)}${w.code === 'zh' ? '：' : ': '}${otherRate.map(([, v]) => v).join(' / ')}` : '',
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
      values: Array.isArray(week.values) ? week.values : [],
    },
    models: models.slice(0, 8).map((m) => ({
      title: String(m.model ?? w.unknown),
      trailing: `${compact(m.tokens)} · ${yuan(m.cost)}`,
      icon: 'model',
    })),
    turns: turns.length
      ? turns.slice(-10).reverse().map((t) => ({
          title: w.code === 'zh' ? `第 ${t.turn} 轮` : `Turn ${t.turn}`,
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
  return [
    ['输入 · 未命中', price(r.miss)],
    ['输入 · 缓存命中', price(r.hit)],
    ['输出', price(r.out)],
  ];
}

const trimColon = (text) => String(text ?? '').replace(/[：:]\s*$/, '');

/**
 * 状态条这一行（≤ 24 字）。
 * 有任务：`峰时 · 思考中 ¥0.42`；空闲：`峰时 · 今日 ¥1.20`。
 */
export function stripData(snap, locale) {
  const w = words(locale);
  const state = keyOf(snap?.state);
  const parts = [shiftShort(snap?.peak, w)];
  const { tokens, window } = snap?.ctx ?? {};
  const pct = percent(tokens, window);
  if (pct > 0) parts.push(`${w.context} ${pct}%`);
  const cost = yuan(snap?.today?.cost);
  parts.push(state === 'idle' ? `${w.today} ${cost}` : cost);
  return { text: clamp(parts.join(' · '), 24), icon: ICON[state] ?? 'coin' };
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
    out[String(n)] = { text: clamp(`${tag}${yuan(turn.cost)}`, 16) };
  }
  return out;
}

/** 复制按钮写进剪贴板的纯文本。 */
export function summaryText(snap, data, shift, locale) {
  const w = words(locale);
  const lines = [
    `${w.status}: ${data.stateLabel}`,
    `${w.peak}: ${data.peak.label}${shift?.nextLabel ? ` · ${w.nextSwitch} ${shift.nextLabel}` : ''}`,
    `${w.rates}: ${data.rates.map(([k, v]) => `${k} ${v}`).join(' / ')}`,
    `${w.context}: ${data.ctx.caption}`,
    `${w.today}: ${data.today.tokens} tokens · ${data.today.cost} · ${w.hit} ${data.today.hit} · ${w.turns} ${data.today.turns}`,
  ];
  for (const m of data.models) lines.push(`- ${m.title}: ${m.trailing}`);
  for (const t of data.turns.slice(0, 10)) if (t.trailing) lines.push(`- ${t.title}: ${t.trailing}`);
  return lines.join('\n');
}
