# 4D — 回响庭院 · W-Slice Web

**当前开发与试玩入口为原生网页游戏，无需 Unity。** 核心机制是 **W-Slice**：在同一 XYZ 位置切换 W，让不同平台、机关和桥的截面出现；机关跨层供能，遗物跨庭保留，冒险收益能改变后续路线。

## 网页试玩

```bash
cd web
npm start
```

打开 <http://127.0.0.1:4173/>。无需安装 npm 依赖，也不需要游戏引擎。`web/` 可作为静态网站部署；当前仅本地运行，未发布公网。

想先随便玩玩，可打开 [平面国](http://127.0.0.1:4173/flatland.html)。默认直接进入自由探索：换层越墙、找隐藏伙伴、靠近访客接光环、搬动截面做拓印。六个场景各有伙伴机关，收齐三枚花种会点亮并收藏该场景，六园齐开后伙伴戴上花冠。伙伴也会跟进庭院，需要线索时点它或按 H；闲置六秒只提示当前一步。计分挑战可随时主动切换，伙伴能力仅在探索生效。跳跳可用 C 换方向，庭院平台再次点击可直接稳行。

希望交给 LLM 试玩评审，可直接复制 [设计理念与试玩 Prompt](docs/playtests/llm-design-and-playtest-prompt.md)，其中包含当前分支、运行方式、设计目标和评审标准。

网页每局从 **四种机关模板中抽取三庭且不重复**，改变 W 层归属、空间朝向和花匣挑战。同位串联、双源汇流、远端折返、分源架桥有不同的供能关系与路线；三庭分别搭配单层回流、追层双涌、双层封锁。五种遗物跨庭累积或升阶：接力线圈让换层自动启动已蓄势机关，织桥种把冒险成果变成永久捷径，留影扣还能代为远程种桥。每庭第一次新冒险成功会让归响台、花匣、锚台逐站开花，最终在指定 W 层长出真正可走的花匣—锚台桥；仍需满足机关前置。

新增三种构筑专属隐藏路线：棱镜与线圈实际远程启动机关、留影与织桥实际完成代种、缓落壳与织桥完成种桥并通过花匣后，分别在不同锚台按本庭顺序切入三个真实 W 层，开启通往隐星台的桥。可自选投入 2 点随身回响，挑战三波各 2.8 秒、每波都须重新切入唯一安全层的隐星试炼；全部成功才得 9 点，失败不退投入。成功后晶柱、冠幕和庭门逐站展开，长出通向庭门的升庭桥，仍需三机关全部启动。

W 驱动预设四维实体的连续截面和通行规则。当前随机化来自手工模板的组合、层排列和经过投影间距筛选的朝向，并非任意程序生成地图或完整四维几何物理引擎。URL 的 `?seed=123` 可复玩同一旅程，“新一局”生成新种子。详见 [网页运行与规则](web/README.md)和[隐藏路线契约](web/HIDDEN-ROUTES-CONTRACT.md)；[遗物联动契约](web/SYNERGY-CONTRACT.md)保留上一轮基线。测试命令：`cd web && npm test`；自动化结果不替代真实玩家体验或主观听感验证。

[Roguelike 元素与组合设计](docs/roguelike-design.md)列出当前落地范围并保留最初设计库；局外成长、四房间流程及其他提案仍未实现。

## 历史 Unity 原型与证据

Unity 原型 `WSliceProto` 已在 PR #56 移出仓库，后续开发以 `web/` 为准；下面仅保留当时的历史记录。

**2026-10-23 历史迭代：** Unity 庭院新增三级连响、七个场景节点传播与开花、桥灯和分级晶体／音阶。见[连锁反应候选记录](docs/releases/courtyard-chain-reactions-candidate.md)及[风险反馈记录](docs/releases/courtyard-resonance-candidate.md)。该轮使用当前源码配合历史 Mono player 外壳实验运行。

**历史验收：** v0.4.0 本机独立应用验收通过。`190dd462` 通过 Unity 7 项校验、EditMode 130/130、PlayMode 74/74（含庭院 10/10）及 macOS 构建；同一应用完成三个启动尺寸目标的代理 GUI 回归，庭院共通关 4 次、旧五关各至少 2 次。五名陌生玩家试玩仍为 **0/5，未执行**。证据、尺寸口径和本机应用路径见[历史运行记录](docs/releases/v0.4-courtyard-runtime.md)。这些结果不作为网页版本的测试证据。

- [回响庭院实现与试玩说明](docs/courtyard-slice.md)
- [五人无指导试玩记录（目前 0/5）](docs/playtests/courtyard-five-player-template.md)

## 仓库结构

```
4D/
├── README.md                 ← 本文件（仓库入口）
├── web/                      ← 当前原生网页游戏、随机房间、规则与测试
├── docs/releases/            ← release checklist 与 tag 说明
└── scripts/                  ← 历史 Unity 原型遗留的证据校验脚本
```

## 文档索引

- [web/README.md](web/README.md) — 当前网页玩法、启动与测试
- [web/SYNERGY-CONTRACT.md](web/SYNERGY-CONTRACT.md) — 当前遗物构筑、永久捷径、场景连锁与失败边界
- [web/RANDOM-ROOMS-CONTRACT.md](web/RANDOM-ROOMS-CONTRACT.md) — 随机房间迭代基线；种子与模板规则继续适用，联动规则见上项

- [docs/releases/v0.4-courtyard-runtime.md](docs/releases/v0.4-courtyard-runtime.md) — 历史 Unity 原型的测试、构建与 GUI 验收记录
- [docs/releases/v0.3-wslice-demo.md](docs/releases/v0.3-wslice-demo.md) — v0.3 release checklist（历史）
- [docs/releases/v0.2-wslice-demo.md](docs/releases/v0.2-wslice-demo.md) — v0.2 release checklist（历史）
