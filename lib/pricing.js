// DeepSeek 官方 API 价格（人民币 / 百万 tokens），用于估算费用与展示峰谷价。
// 来源：https://api-docs.deepseek.com/zh-cn/quick_start/pricing （2026-11-19 查询）。
// 峰谷：北京时间周一至周五（不含中国法定节假日）9:00–12:00、14:00–18:00 为高峰时段，
// 其余时间（含周末、法定节假日全天）为空闲时段；空闲价为高峰价的一半。
export const PRICES_AS_OF = '2026-11-19';
export const PRICE_SOURCE = 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing';

const TABLE = {
  'deepseek-flash': { offPeak: { hit: 0.02, miss: 1, out: 4 }, peak: { hit: 0.04, miss: 2, out: 8 } },
  'deepseek-v4-pro': { offPeak: { hit: 0.15, miss: 4.5, out: 13.5 }, peak: { hit: 0.30, miss: 9, out: 27 } }
};
// 已下线、但仍按 Flash 计费的旧模型名。
const ALIASES = { 'deepseek-v4-flash': 'deepseek-flash', 'deepseek-v4-flash-vision-exp': 'deepseek-flash' };

const MIN = 60e3;
const DAY = 86400e3;
const PEAK_WINDOWS = [[9 * 60, 12 * 60], [14 * 60, 18 * 60]];

/** The priced model id for a model name, or null when no official price is known. */
export function pricedModel(model) {
  if (typeof model !== 'string') return null;
  const id = model.trim().toLowerCase();
  if (TABLE[id]) return id;
  if (ALIASES[id]) return ALIASES[id];
  return null;
}

/** 北京时间（UTC+8，无夏令时）的 Date。 */
const beijing = (time) => new Date(time + 8 * 3600e3);
const pad = (n) => String(n).padStart(2, '0');

/** Whether a moment falls in DeepSeek's peak period. */
export function isPeak(time) {
  const d = beijing(time);
  const day = d.getUTCDay();
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (day === 0 || day === 6) return false;
  return PEAK_WINDOWS.some(([start, end]) => minutes >= start && minutes < end);
}

/**
 * 当前计费时段与下一次切换。
 * @returns {{peak: boolean, nextAt: number|null}}
 */
export function shiftInfo(time) {
  const now = Number.isFinite(time) ? time : Date.now();
  const peak = isPeak(now);
  let nextAt = null;
  const start = Math.ceil(now / MIN) * MIN + MIN;
  for (let t = start; t <= now + 8 * DAY; t += MIN) {
    if (isPeak(t) !== peak) { nextAt = t; break; }
  }
  return { peak, nextAt };
}

/** 北京时间当天 HH:MM，或跨天的「周X HH:MM」。 */
export function shiftLabel(time, locale) {
  if (!Number.isFinite(time)) return '';
  const d = beijing(time);
  const now = beijing(Date.now());
  const sameDay = d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth() && d.getUTCDate() === now.getUTCDate();
  const zh = !(typeof locale === 'string' && locale.toLowerCase().startsWith('en'));
  const weekday = zh
    ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getUTCDay()]
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const hm = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return sameDay ? hm : `${weekday} ${hm}`;
}

/** 某模型在峰时或谷时的单价（元 / 百万 tokens）；未知模型返回 null。 */
export function rates(model, peak) {
  const id = pricedModel(model);
  if (!id) return null;
  const p = TABLE[id][peak ? 'peak' : 'offPeak'];
  return { hit: p.hit, miss: p.miss, out: p.out };
}

/** 官方价目表（供面板展示）。 */
export function rateTable() {
  return Object.entries(TABLE).map(([model, price]) => ({ model, ...price }));
}

/**
 * Estimated cost in CNY of one model call.
 * Harness usage: inputTokens are uncached prompt tokens, cacheReadTokens hit the cache,
 * cacheWriteTokens are billed as cache misses, outputTokens include reasoning.
 * @returns the cost, or null when the model has no official price.
 */
export function estimateCost({ model, time, inputTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0, outputTokens = 0 }) {
  const id = pricedModel(model);
  if (!id) return null;
  const p = TABLE[id][isPeak(time) ? 'peak' : 'offPeak'];
  return ((inputTokens + cacheWriteTokens) * p.miss + cacheReadTokens * p.hit + outputTokens * p.out) / 1e6;
}
