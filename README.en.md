# local-peak-cost · DeepSeek peak / off-peak cost

A native plugin for **DSH Go** (the DeepSeek Harness mobile app): shows DeepSeek's peak / off-peak billing period and today's cost above the composer, the cost of each turn in the turn footnote, and a panel with current rates, the next switch and per-turn costs of the session.

> Plain JavaScript, zero dependencies, no network, no secrets. It only reads the engine's own session events; the ledger contains no message text.

## Where it shows

| Slot | Content |
| --- | --- |
| Composer strip | `Peak · Today ¥0.28`; while running `Off-peak · Thinking ¥0.42` |
| Turn footnote | `Peak ¥0.02` / `Off ¥0.02` |
| Panel (chat details › Plugins, or All features) | Current period, next switch, current rates, per-turn costs, context usage, last 7 days tokens, per-model totals |

## Pricing and peak hours

Prices are from the [official DeepSeek pricing page](https://api-docs.deepseek.com/quick_start/pricing) (checked 2026-11-19), in CNY per million tokens.

| Model | Period | Input (cache hit) | Input (cache miss) | Output |
| --- | --- | --- | --- | --- |
| `deepseek-flash` | Peak | ¥0.04 | ¥2 | ¥8 |
| `deepseek-flash` | Off-peak | ¥0.02 | ¥1 | ¥4 |
| `deepseek-v4-pro` | Peak | ¥0.30 | ¥9 | ¥27 |
| `deepseek-v4-pro` | Off-peak | ¥0.15 | ¥4.5 | ¥13.5 |

Peak hours: **Beijing time, Monday–Friday (excluding Chinese public holidays), 09:00–12:00 and 14:00–18:00; all other times (including weekends and holidays) are off-peak** at roughly half the peak price.

To change prices, edit `TABLE` in `lib/pricing.js`, then restart the engine from the app's Engine page.

## Install

Keep the plugin directory under DSH Go's plugin folder (preserved across engine resets):

```sh
git clone https://github.com/wjn1121/local-peak-cost.git "$DSH_HOME/dsh-go/plugins/local-peak-cost"
dsh plugin --profile web add "$DSH_HOME/dsh-go/plugins/local-peak-cost"
```

Restart the engine once from the app's Engine page (host-side plugins load at engine start). Uninstall:

```sh
dsh plugin --profile web remove local-peak-cost
rm -rf "$DSH_HOME/dsh-go/plugins/local-peak-cost"
```

## Scope

- Usage comes from `assistant/message` events: `input` = uncached prompt tokens, `cacheRead` = cache hits, `output` = output tokens; `cacheWrite` is billed as a miss.
- Helper calls that never appear in `assistant/message` (title generation, compaction) are not counted.
- Sub-agents are separate sessions: counted in today / 7 days, not in "this session".
- A turn is priced using the period at its start time.
- Estimates only; DeepSeek's bill prevails.

## Development

```sh
node "$DSH_HOME/skills/dsh-go-plugin/kit/bin/check.mjs" . --load
```

## Credits

The engine-side data chain (session event folding, ledger, backfill) is adapted from [dsh-island-go](https://github.com/a961282799-crypto/dsh-island-go) (MIT, Copyright (c) 2026 dsh-island contributors). This repository adds peak/off-peak period detection, rate display and per-turn period tags.

## License

[MIT](LICENSE)
