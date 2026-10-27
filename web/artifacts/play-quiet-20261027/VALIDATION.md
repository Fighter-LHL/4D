# play-quiet · 庭院收口与提示减扰

基线：`defe5b85e86d50aba741c926331e262b45a2ecc6`；分支：`codex/play-fun-quiet-20261027`。本轮仅在 `/tmp/4d-play-quiet-20261027/web` 修改。

## 完成的四项

1. **首次稳行落地后收口。** FriendGuide 只观察真实穿越快照；安全穿越抵达目标、脚下稳定后，同帧撤回提示，本庭不再自动触发六秒闲置说明。失败或冒险穿越不算稳行落地。主动按 H／点「问问伙伴／请求提示」仍显示原有四秒单步提示，暂停冻结；新庭恢复既有提示规则。不新增教程或玩法。
2. **靠近提示之间多留空白。** 区域间冷却从 2.4 秒延至 3.6 秒。每区域本页面会话仍只提示一次，重试／回访不重复；冷却及到达旁白不会消耗新区首次 cue。保留 feel 的距离、真实可见性与旁白互斥条件。
3. **窄屏发现短字避让。** 实际 Canvas 宽度 ≤480px 时，伙伴／花种发现短字的基线轻移到发现物体下方 24 CSS px（靠边仍夹取），取消向上漂移，避让上方物体标签。原有窄屏 1.35 秒发现、1.3 秒靠近时长不变，桌面位置／时长不变；没有整体布局调整。
4. **首次发现音防回退。** 音频实现逐字节未改。现有测试补充相对旧 gain 的 +25%～28% 范围断言，覆盖实际 +25% 伙伴／约 +27% 花种；保留相对 hop／最强 chirp、master=0.6、静音不发声的检查。

## 自动化

- `npm test`：**285 / 285 通过，0 失败、0 跳过**。基线 281 条保留，新增 4 条行为回归；[完整输出](tests.txt)。
- 针对性测试 **40 / 40 通过**：[输出](focused-tests.txt)。新增检查覆盖稳行后自动提示退出及主动请求、失败／冒险不误收口、连续区域冷却不消耗首次提示、两种窄画布在普通／减少动态下的标签间距与无漂移。
- `git diff --check` 和改动 JS／MJS 语法检查通过。
- [范围核对](scope-check.json)：9 个业务／测试／验证脚本文件均在本树 web/；5 份合同与 8 个模型、房间、关卡、伙伴、发现及音频文件和基线逐字节一致。未改合同语义、计分或 rooms 几何。

## 浏览器实测

| 脚本 | 1280×900 | 390×844 | 320×844 | 收据 |
| --- | --- | --- | --- | --- |
| verify-penpal | 通过 | 通过 | 通过，减少动态 | [receipt.json](browser-penpal/receipt.json) |
| verify-top5 | 通过 | 通过 | 通过，减少动态＋发现期间静音 | [receipt.json](browser-top5/receipt.json) |

两套脚本的 console warning / error、pageerror 均为空。新建隔离档，通过真实 DOM／键盘／Canvas 指针／range 事件操作，未预写收藏，未直接改模型。测试观察器只读快照、事件、Canvas 实际文本绘制和 Web Audio 音符启动。

- penpal 保留遗物、平台预览／稳行、穿越中 E 灰显、双源启动与「去辉光源」、三类帮助、访客戳球／暂停／下一拍、到达旁白消退；新增落地安静及 H 可用检查。
- top5 在三宽度都先实际收集跳跳，再带入庭院；第一次稳行后即时无 friendGuide，静置 6.2 个游戏秒越过旧闲置触发点仍安静；主动 H 可显示，约四个游戏秒后消失。
- seed=42 越墙开局站桩至 4.2 秒仍无靠近 cue；主动显出伙伴后，首次 cue 均在约 4.01 秒、旁白结束后出现，每区域只一次。保留暂停冻结、消退、存档／同题重来、HUD、挑战切换、首次发现仅一次和访客共存检查。
- 花种短字与同帧探测标签实测字形间距：390px：41.6px；320px：33.4px（断言下限 4px）。截图检查桌面／390／320 的发现短字，以及 320 庭院静置状态；本轮目标短字已分开，无横向溢出。仍可能有原有「花苞醒了」与探测标签短暂靠近，不宣称所有物体标签在任意场景都完全无重叠。

选定截图：[320 花种](browser-top5/320-seed-found.png)、[320 伙伴](browser-top5/320-friend-found.png)、[390 花种](browser-top5/390-seed-found.png)、[桌面花种](browser-top5/1280-seed-found.png)、[320 稳行后静置](browser-top5/320-courtyard-settled-quiet.png)、[320 主动提示消退](browser-top5/320-courtyard-requested-help-cleared.png)。

## 复现

本机 macOS；Node v24.12.0；npm 11.6.2；Chromium 130.0.6723.31。本轮服务为 `http://127.0.0.1:4194`，仅监听回环地址。

```sh
cd /tmp/4d-play-quiet-20261027/web
npm test
PORT=4194 node serve.js
# 服务已运行时直接执行下面两项。另建输出目录以保留本轮证据。
BASE_URL=http://127.0.0.1:4194 ARTIFACT_DIR=artifacts/play-quiet-20261027/browser-penpal-rerun node scripts/verify-penpal.mjs
BASE_URL=http://127.0.0.1:4194 ARTIFACT_DIR=artifacts/play-quiet-20261027/browser-top5-rerun node scripts/verify-top5.mjs
```

## 交付边界

提交包含 web/ 业务改动、测试／验证脚本、此说明和选定验证证据。CODEX_TASK、LAUNCHED、pid、运行日志、node_modules 链接及推送日志不纳入提交；DONE 不记录自身提交 SHA，避免自引用。推送时取消 `HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy`。

仍建议真人使用手机／桌面试玩：判断首次稳行后是否还需要更多帮助、3.6 秒间隔是否让线索难以察觉、短字位置与阅读时间是否自然；扬声器／耳机听感也需真人判断。本轮自动化与截图只能证明对应路径和布局表现，不能证明理解度、趣味性或真实触控体验。未重跑六园全收集，未操作 Unity、Cloud Agents 或公网部署。
