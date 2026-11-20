# 发布 / 分享文案

> 说明：当前仓库里的图是示例数据的示意图（`docs/preview.png` / `docs/social-preview.png`），不是真实截图。发帖时可以直接附这两张图；如果用真实面板截图，请先隐藏金额、tokens、模型名等个人信息。

## 中文 · 群聊短版

【开源插件】DSH Go 峰谷费用：本会话 / 今日花费 + 24 小时、每轮、7 天图表

平时用 DSH Go 手机版，DeepSeek 峰谷价差两倍，但界面只给 token 不给钱，月底看账单很难知道花在哪个会话、哪个时段。这个原生小插件补上：

- 输入框上方：`峰时 · 会话¥1.64 · 今日¥2.53`，峰/谷用颜色区分
- 面板：本会话 / 今日、今日 24 小时柱状图、本会话每轮柱状图、近 7 天折线、按模型
- 每轮回复末尾：`峰 ¥0.06` / `谷 ¥0.02`
- 纯本地、零依赖、不联网、不读密钥；账本不含对话正文

安装（手机本机引擎，装完在 App「引擎」页重启一次）：

```sh
P="${DSH_HOME:-$HOME/.dsh}/dsh-go/plugins/local-peak-cost"
mkdir -p "$(dirname "$P")"
git clone https://github.com/wjn1121/dsh-go-peak-cost.git "$P"
dsh plugin --profile web add "$P"
```

仓库：https://github.com/wjn1121/dsh-go-peak-cost
Release：https://github.com/wjn1121/dsh-go-peak-cost/releases/tag/v0.2.2

如果对你有用，求个 Star 或转发给用 DSH Go 的朋友；有问题直接开 Issue。

## 中文 · 社区长版（V2EX / 知乎 / DSH 社区）

### 标题

给 DSH Go 写了个原生峰谷费用插件：本会话 / 今日分开看，带 24 小时和每轮图表

### 正文

DSH Go 的会话界面有 token，但没有「这轮/这场/今天花了多少钱」。DeepSeek 又是峰谷两档价（高峰约空闲的两倍），跨过 18:00 或周末，同样 token 的钱不一样。

所以我基于 `dsh-island-go` 的 MIT 数据链，写了一个手机原生插件 **local-peak-cost**：

- **两种花费**：状态条和面板顶部同时显示「本会话」和「今日」，不把一场对话和全天混在一起。
- **峰谷可见**：状态条、面板、回合脚注用颜色区分；面板显示下次切换时间和倒计时。
- **图表**：今日 24 小时柱状图（进行中的轮次计入当前小时）、本会话每轮柱状图、近 7 天折线、按模型汇总；口径参考 DeepSeek 开放平台用量页。
- **每轮脚注**：`峰 ¥0.06` / `谷 ¥0.02`，按轮开始时刻判断。
- **自动回填**：装之前的会话会按本机会话日志补算；旧账本里的 0 费用也会重算。
- **隐私**：纯本地、零依赖、不联网、不读 API Key；账本只存标题、模型、tokens、费用和时间。

安装（DSH Go 手机本机引擎）：

```sh
P="${DSH_HOME:-$HOME/.dsh}/dsh-go/plugins/local-peak-cost"
mkdir -p "$(dirname "$P")"
git clone https://github.com/wjn1121/dsh-go-peak-cost.git "$P"
dsh plugin --profile web add "$P"
```

装完在 App 的「引擎」页重启一次，等 3–10 秒回填。

已知限制：只在 DSH Go 手机本机引擎显示原生状态条/面板；网页版/远程主机只记账不显示。价格按 2026-11-19 官方价目，法定节假日暂按工作日估算，以 DeepSeek 账单为准。

仓库：https://github.com/wjn1121/dsh-go-peak-cost
Release：https://github.com/wjn1121/dsh-go-peak-cost/releases/tag/v0.2.2

功能、价格、隐私和 FAQ 都写在 README；如果你也在用 DSH Go，欢迎试一下并提反馈。

## English · short (Reddit / Discord)

I built a native **DSH Go** plugin for DeepSeek peak/off-peak cost:

- Composer strip: **this chat** and **today**, with peak/off-peak color and next-switch countdown.
- Panel: today's 24-hour cost bars, per-turn cost for this chat, 7-day line, by-model split.
- Turn footer: `Peak ¥0.06` / `Off ¥0.02`.
- Local only, zero dependencies, no API keys, no message content in the ledger.

Install on the phone host, then restart the engine:

```sh
P="${DSH_HOME:-$HOME/.dsh}/dsh-go/plugins/local-peak-cost"
mkdir -p "$(dirname "$P")"
git clone https://github.com/wjn1121/dsh-go-peak-cost.git "$P"
dsh plugin --profile web add "$P"
```

Repo: https://github.com/wjn1121/dsh-go-peak-cost
Release: https://github.com/wjn1121/dsh-go-peak-cost/releases/tag/v0.2.2

If you use DSH Go, give it a try and tell me what is missing. A ⭐ helps others find it.

## 目录站状态

- **dsh.so**：已通过提交接口接收（后台队列，非公开 issue）。
- **dshbase**：已提交收录 issue：[ylwl1997/dshbase#350](https://github.com/ylwl1997/dshbase/issues/350)，等待处理/每日同步。
- **dshplugin.online**：已收录：[local-peak-cost](https://dshplugin.online/plugins/wjn1121--local-peak-cost)。
- **plugin.dshdesk.com**：已收录：[local-peak-cost](https://plugin.dshdesk.com/plugins/wjn1121/local-peak-cost/)。

## 发帖小建议

- 附 `docs/preview.png`（示意图）或真实截图；真实截图请先遮掉金额、tokens、模型名。
- 标题里保留「DSH Go」「峰谷」「每轮花费」这类用户会搜的词。
- 不要只放链接；先说清楚解决什么问题、适合谁。
- 发完把链接补到 README 的 Star / 分享区（可选），形成外链。
