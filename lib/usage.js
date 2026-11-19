// 用量账本：把会话事件折叠成“每轮”记录（模型、tokens、估算费用、时长、结果），
// 历史会话通过读取宿主自己的会话日志补算，之后跟随实时事件更新，并保存在本地。
import { readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { estimateCost, isPeak, pricedModel } from './pricing.js';

const DAY = 86400e3;
const num = v => Number.isFinite(v) && v > 0 ? v : 0;
const clip = (v, n) => typeof v === 'string' ? v.replace(/[\x00-\x1f]/g, ' ').trim().slice(0, n) : '';
const END_STATE = { completed: 'completed', aborted: 'paused' };

/** Folds one session's events into per-turn usage records. Events must arrive in log order. */
export class TurnFold {
  constructor(seed = {}) {
    this.title = seed.title ?? ''; this.model = seed.model ?? ''; this.turns = seed.turns ? [...seed.turns] : [];
    this.lastSeq = Number.isInteger(seed.lastSeq) ? seed.lastSeq : -1; this.open = null;
  }
  push(event) {
    if (!event || typeof event.type !== 'string') return false;
    if (Number.isInteger(event.seq)) { if (event.seq <= this.lastSeq) return false; this.lastSeq = event.seq; }
    const d = event.data ?? {}, t = Number.isFinite(event.time) ? event.time : Date.now();
    switch (event.type) {
      case 'session/title': if (typeof d.title === 'string') this.title = clip(d.title, 100); return true;
      case 'model/selection': { const m = typeof d.model === 'string' ? d.model : d.model?.id ?? d.selection?.model; if (typeof m === 'string') this.model = clip(m, 40); return false; }
      case 'assistant/attempt': if (typeof d.source?.model === 'string') this.model = clip(d.source.model, 40); return false;
      case 'turn/start':
        this.open = { turn: Number.isInteger(d.turn) ? d.turn : this.turns.length + 1, start: t, end: 0, state: 'running', model: this.model, calls: 0, tools: 0,
          inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, cost: 0, priced: true };
        return true;
      case 'tool/call': if (this.open) this.open.tools += 1; return false;
      case 'assistant/message': {
        const u = d.usage, turn = this.open;
        if (!turn || !u || typeof u !== 'object') return false;
        const usage = { inputTokens: num(u.inputTokens), cacheReadTokens: num(u.cacheReadTokens), cacheWriteTokens: num(u.cacheWriteTokens), outputTokens: num(u.outputTokens) };
        for (const k of Object.keys(usage)) turn[k] += usage[k];
        // 0.2.2 把模型放在 data.message.source.model（部分版本在 data.source.model）。
        const srcModel = d.message?.source?.model ?? d.source?.model;
        if (typeof srcModel === 'string' && srcModel) this.model = clip(srcModel, 40);
        const model = this.model || turn.model;
        if (model) turn.model = model;
        // 每轮按开始时刻判断峰谷，和回合脚注的峰/谷标记保持一致。
        const cost = estimateCost({ model, time: turn.start, ...usage });
        if (cost === null) turn.priced = false; else turn.cost += cost;
        turn.calls += 1;
        return true;
      }
      case 'turn/end': {
        const turn = this.open;
        if (!turn) return false;
        turn.end = t; turn.state = END_STATE[d.reason?.kind] ?? 'error';
        turn.peak = isPeak(turn.start);
        this.turns.push(turn); this.open = null;
        return true;
      }
    }
    return false;
  }
}


/**
 * 从宿主自己的会话日志补齐历史（不依赖 sessionQuery 返回的事件形状）。
 * 目录形如 `<DSH_HOME>/sessions/<workspace>/<session-id>/session.v*.jsonl.zstd`。
 * @returns 读到的会话数
 */
export function backfillFromFiles(ledger, sessionsDir, { days = 30, limit = 300, now = Date.now } = {}) {
  const since = now() - days * DAY;
  let read = 0, seen = 0;
  let workspaces = [];
  try { workspaces = readdirSync(sessionsDir); } catch { return 0; }
  for (const ws of workspaces) {
    let ids = [];
    try { ids = readdirSync(join(sessionsDir, ws)); } catch { continue; }
    for (const id of ids) {
      if (seen >= limit) return read;
      const known = ledger.sessions.get(id);
      if (known?.scanned) continue;
      const dir = join(sessionsDir, ws, id);
      let file;
      try {
        file = readdirSync(dir).filter((f) => /^session\.v\d+\.jsonl\.zstd$/.test(f)).sort().at(-1);
      } catch { continue; }
      if (!file) continue;
      const full = join(dir, file);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.mtimeMs < since) continue;
      let fold;
      try {
        const text = zstdDecompressSync(readFileSync(full)).toString('utf8');
        fold = new TurnFold();
        for (const line of text.split('\n')) { if (!line) continue; try { fold.push(JSON.parse(line)); } catch { /* 半行忽略 */ } }
      } catch { continue; }   // 正在写入或压缩未完成：下次再试
      if (!fold.turns.length) continue;
      // 文件里的轮次优先：旧账本里模型为空、费用为 0 的同轮记录会被替换掉。
      for (const turn of known?.fold.turns ?? []) if (!fold.turns.some((t) => t.turn === turn.turn)) fold.turns.push(turn);
      fold.turns.sort((a, b) => (a.turn ?? 0) - (b.turn ?? 0));
      if (known?.fold.open && !fold.open) fold.open = known.fold.open;
      fold.lastSeq = Math.max(fold.lastSeq, known?.fold.lastSeq ?? -1);
      ledger.sessions.set(id, { createdAt: st.birthtimeMs || fold.turns[0]?.start || 0, scanned: true, fold });
      read += 1; seen += 1;
    }
  }
  if (read) { ledger.version += 1; ledger.save(); }
  return read;
}

const tokensOf = t => t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens + t.outputTokens;

export class UsageLedger {
  /** @param options.file - where to keep the ledger; options.now - clock for tests. */
  constructor({ file, now = Date.now, keepDays = 35 } = {}) {
    this.file = file; this.now = now; this.keepDays = keepDays; this.sessions = new Map(); this.version = 0; this.saveTimer = undefined;
  }
  load() {
    if (!this.file) return this;
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8'));
      for (const [id, s] of Object.entries(data.sessions ?? {})) {
        const turns = (s.turns ?? []).map((t) => ({ ...t, peak: t.peak ?? isPeak(t.start) }));
        // 旧账本里由“模型名为空”写下的 0 费用轮次：下一轮回填时按会话日志重算。
        const needsReprice = turns.some((t) => !t.priced || !t.model);
        this.sessions.set(id, {
          createdAt: s.createdAt ?? 0,
          scanned: !!s.scanned && !needsReprice,
          fold: new TurnFold({ ...s, turns }),
        });
      }
    } catch {}
    return this;
  }
  save() {
    if (!this.file) return;
    clearTimeout(this.saveTimer); this.saveTimer = undefined;
    const cutoff = this.now() - this.keepDays * DAY, sessions = {};
    for (const [id, s] of this.sessions) {
      const turns = s.fold.turns.filter(t => t.end >= cutoff);
      if (!turns.length && s.createdAt < cutoff) continue;
      sessions[id] = { createdAt: s.createdAt, scanned: s.scanned, title: s.fold.title, model: s.fold.model, lastSeq: s.fold.lastSeq, turns };
    }
    try { mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(this.file + '.tmp', JSON.stringify({ version: 1, sessions })); renameSync(this.file + '.tmp', this.file); } catch {}
  }
  scheduleSave() { if (!this.saveTimer) { this.saveTimer = setTimeout(() => this.save(), 5000); this.saveTimer.unref?.(); } }
  entry(id, createdAt = 0) {
    if (!this.sessions.has(id)) this.sessions.set(id, { createdAt, scanned: false, fold: new TurnFold() });
    return this.sessions.get(id);
  }
  /** Follow one live session event. */
  ingest(sessionId, event) {
    if (!sessionId) return;
    if (this.entry(sessionId, this.now()).fold.push(event) && event.type === 'turn/end') { this.version += 1; this.scheduleSave(); }
    else if (event?.type === 'session/title') this.version += 1;
  }
  /** Every finished turn since a moment, newest first. */
  turns(since = 0) {
    const out = [];
    for (const [id, s] of this.sessions) for (const t of s.fold.turns) if (t.end >= since) out.push({ ...t, sessionId: id, title: s.fold.title });
    return out.sort((a, b) => b.end - a.end);
  }
  /** Numbers for the island panel: today, the last 24 hours by hour, recent turns. */
  panel() {
    const now = this.now(), midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
    const day = this.turns(now - DAY), today = day.filter(t => t.end >= midnight.getTime());
    const hours = Array.from({ length: 24 }, () => 0);
    for (const t of day) hours[Math.max(0, 23 - Math.floor((now - t.end) / 3600e3))] += tokensOf(t);
    const input = day.reduce((n, t) => n + t.inputTokens + t.cacheWriteTokens, 0), cache = day.reduce((n, t) => n + t.cacheReadTokens, 0);
    return {
      today: { count: today.filter(t => t.state === 'completed').length, runs: today.length, ms: today.reduce((n, t) => n + Math.max(0, t.end - t.start), 0),
        tokens: today.reduce((n, t) => n + tokensOf(t), 0), outputTokens: today.reduce((n, t) => n + t.outputTokens, 0), cost: today.reduce((n, t) => n + t.cost, 0) },
      day: { hours, tokens: hours.reduce((a, b) => a + b, 0), cacheRate: input + cache > 0 ? Math.round(cache / (input + cache) * 100) : null },
      recent: day.slice(0, 4).map(t => ({ key: `${t.sessionId}:${t.end}`, title: t.title, state: t.state, started: t.start, ended: t.end }))
    };
  }
  /**
   * Statistics for the usage window.
   * @param range - 'today' (by hour), '7d' or '30d' (by day).
   */
  stats(range = '7d') {
    const now = this.now(), start = new Date(now); start.setHours(0, 0, 0, 0);
    const days = range === '30d' ? 30 : range === '7d' ? 7 : 1;
    start.setDate(start.getDate() - (days - 1));
    const from = start.getTime(), turns = this.turns(from);
    const byHour = range === 'today';
    const buckets = [];
    if (byHour) for (let h = 0; h < 24; h++) buckets.push({ start: from + h * 3600e3, label: `${h}:00` });
    else for (let i = 0; i < days; i++) { const d = new Date(from); d.setDate(d.getDate() + i); buckets.push({ start: d.getTime(), label: `${d.getMonth() + 1}/${d.getDate()}` }); }
    for (const b of buckets) Object.assign(b, { cacheRead: 0, input: 0, output: 0, cost: 0, turns: 0 });
    const bucketOf = time => { for (let i = buckets.length - 1; i >= 0; i--) if (time >= buckets[i].start) return buckets[i]; return null; };
    const totals = { tokens: 0, input: 0, cacheRead: 0, output: 0, cost: 0, unpricedTokens: 0, turns: 0, completed: 0, ms: 0 };
    const models = new Map(), sessions = new Map();
    for (const t of turns) {
      const b = bucketOf(t.end); if (!b) continue;
      const input = t.inputTokens + t.cacheWriteTokens, all = tokensOf(t);
      b.cacheRead += t.cacheReadTokens; b.input += input; b.output += t.outputTokens; b.cost += t.cost; b.turns += 1;
      totals.tokens += all; totals.input += input; totals.cacheRead += t.cacheReadTokens; totals.output += t.outputTokens; totals.cost += t.cost;
      if (!t.priced) totals.unpricedTokens += all;
      totals.turns += 1; if (t.state === 'completed') totals.completed += 1; totals.ms += Math.max(0, t.end - t.start);
      const mk = t.model || '未知模型', m = models.get(mk) ?? { model: mk, priced: !!pricedModel(mk), tokens: 0, cost: 0, turns: 0 };
      m.tokens += all; m.cost += t.cost; m.turns += 1; models.set(mk, m);
      const s = sessions.get(t.sessionId) ?? { id: t.sessionId, title: t.title, tokens: 0, cost: 0, turns: 0, last: 0, items: [] };
      s.tokens += all; s.cost += t.cost; s.turns += 1; s.last = Math.max(s.last, t.end);
      if (s.items.length < 40) s.items.push({ turn: t.turn, start: t.start, end: t.end, state: t.state, model: t.model, calls: t.calls, tools: t.tools, input, cacheRead: t.cacheReadTokens, output: t.outputTokens, cost: t.cost, priced: t.priced });
      sessions.set(t.sessionId, s);
    }
    totals.cacheRate = totals.input + totals.cacheRead > 0 ? Math.round(totals.cacheRead / (totals.input + totals.cacheRead) * 100) : null;
    return {
      range, from, to: now, byHour, totals, buckets,
      models: [...models.values()].sort((a, b) => b.tokens - a.tokens),
      sessions: [...sessions.values()].sort((a, b) => b.last - a.last).slice(0, 60),
      scanned: [...this.sessions.values()].filter(s => s.scanned).length
    };
  }
}
