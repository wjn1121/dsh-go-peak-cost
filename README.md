# local-peak-cost · DeepSeek 峰谷费用

给 **DSH Go**（DeepSeek Harness 手机 App）的原生插件：在输入框上方显示 DeepSeek 峰谷时段与今日花费，在每条回复的回合脚注显示这一轮花了多少钱，点开面板还能看到当前单价、下一段切换时间和本会话每轮花费。

> 纯 JavaScript、零依赖、不联网、不读密钥；只读引擎自己的会话事件，账本里不含对话正文。

## 界面

| 位置 | 显示 |
| --- | --- |
| 输入框上方状态条 | `峰时 · 今日 ¥0.28`；生成中 `谷时 · 思考中 ¥0.42` |
| 回合脚注 | `峰 ¥0.02` / `谷 ¥0.02` |
| 面板（对话详情 › 插件，或「全部功能」） | 当前计费时段、下次切换、当前生效单价、本会话每轮花费、上下文占用、近 7 天 tokens、按模型汇总 |

## 价格与峰谷

价格来自 [DeepSeek 官方价目](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)（2026-11-19 查询），单位：元 / 百万 tokens。

| 模型 | 时段 | 输入（缓存命中） | 输入（缓存未命中） | 输出 |
| --- | --- | --- | --- | --- |
| `deepseek-flash` | 高峰 | ¥0.04 | ¥2 | ¥8 |
| `deepseek-flash` | 空闲 | ¥0.02 | ¥1 | ¥4 |
| `deepseek-v4-pro` | 高峰 | ¥0.30 | ¥9 | ¥27 |
| `deepseek-v4-pro` | 空闲 | ¥0.15 | ¥4.5 | ¥13.5 |

峰谷规则：**北京时间周一至周五 9:00–12:00、14:00–18:00 为高峰时段；其余时间（含周末全天）为空闲时段**，空闲价约为高峰价的一半。法定节假日目前按工作日估算，尚未接入节假日表。

改价只需编辑 `lib/pricing.js` 里的 `TABLE`；改完在 App 的「引擎」页重启一次引擎。

## 安装

插件目录放在 DSH Go 的插件目录（引擎重置时会保留）：

```sh
git clone https://github.com/wjn1121/local-peak-cost.git "$DSH_HOME/dsh-go/plugins/local-peak-cost"
dsh plugin --profile web add "$DSH_HOME/dsh-go/plugins/local-peak-cost"
```

装完在 App 的「引擎」页**重启一次引擎**（宿主侧插件只在引擎启动时加载）。重启后输入框上方出现状态条。

已安装的文件是指向该目录的链接，所以目录不能删。卸载：

```sh
dsh plugin --profile web remove local-peak-cost
rm -rf "$DSH_HOME/dsh-go/plugins/local-peak-cost"
```

## 口径

- 数据来自会话事件里 `assistant/message` 的 usage：`input = 未命中缓存输入`、`cacheRead = 命中缓存输入`、`output = 输出`；`cacheWrite` 按未命中计价。
- 会话标题生成、记忆压缩这类不写进 `assistant/message` 的辅助调用不计入。
- 子智能体是独立会话：计入「今日 / 近 7 天」，不计入「本会话」。
- 每轮费用按该轮开始时刻判断峰谷；跨峰谷切换的一轮按开始时刻计。
- 估算仅供参考，以 DeepSeek 账单为准。

## 开发

```sh
node "$DSH_HOME/skills/dsh-go-plugin/kit/bin/check.mjs" . --load
```

`--load` 会在隔离环境里加载代码，检查清单、处理函数和视图能不能被 App 画出来。

## 致谢

引擎侧的数据链（会话事件折叠、账本、回填）改写自 [dsh-island-go](https://github.com/a961282799-crypto/dsh-island-go)（MIT，Copyright (c) 2026 dsh-island contributors）。本仓库在其基础上增加了峰谷时段判定、单价展示和每轮峰谷标记。

## 许可

[MIT](LICENSE)
