# 升维验证 · 2026-10-24

实现第六关 `ascend`：平面房间复习 → 4 秒升维过渡 → 换 W 逃出三维房间 → 正式庭院入口。六关现均可完成。没有修改正式庭院的规则模型；本轮只给正式入口添加衔接文案。本地改动尚未提交或推送。

## 规则与表现

- 第一段必须实际触到低处的旗：S=4 越过墙，走到 (17,6) 附近，再回到 S=1。仅升高或走到高处的旗子位置不能跳过。
- 4 秒过渡把 XY 平面转为等距的 XYZ 空间，Z 标签渐变为 W；文字说明“你刚才对平面生物做的事，四维生物也能对你做”。演出阶段锁定输入，结束时清除旧输入，初始化独立的三维房间。减少动态效果使用两个关键画面。
- 轴对齐四维棱柱在 W 上的截面是三维盒体。房间有四面墙、屋顶与贯穿 W 的地板；墙/屋顶 W∈[0,.58]，出口 W∈[0,.32]。玩家沿地板 X/Z 行走，Y=.4；换 W 保持 XYZ，不能靠调 W 自动到达出口。不是任意四维物理引擎。
- 碰撞使用球与三维盒体；换 W 按 .005 步长扫描并细分接触边界。进入墙体前停住并闪红、提示移开；即使当前切片中墙尚未出现，也短暂显示阻挡体。普通移动也不能穿过存在的墙。只碰撞反馈，不判死亡。
- 完成两次逃离才结算星级、显示正式入口。三颗星分别为完成、总切片手势≤4、没有阻挡；S 净变化≥.3、W≥.05 才计手势。重开清除阶段、计数和旧输入，最高星级按稳定 ID 保存。
- 正式入口 `./?from=flatland` 在有 `ascend` 通关记录时显示学习衔接和操作说明。照常创建新 `GameModel`，照常选择起手遗物，没有从教学注入货币、机关或遗物。普通入口仍显示原有说明。关卡切换会同步 `level` URL。

## 自动化

`cd web && npm test`：**189 / 189 通过，0 失败、0 跳过**。原庭院 120 项、平面国 69 项。本轮新增 12 项：规则/几何/入口 11 项、渲染与指针反投影 1 项。完整输出见 [tests.txt](tests.txt)。

覆盖真实两段通关、过渡输入锁定/大帧限制/单次初始化、W 保持 XYZ、墙/屋顶/地板的三维碰撞、出口 W 条件、切片阻挡恢复、普通移动阻挡、手势阈值、重开三种阶段、快照隔离、W 提示、旧进度解锁和入口存档校验。渲染覆盖 1000×560 与 380×600、减少动态效果、红色阻挡反馈、出口完成态和指针投影往返。

渲染测试曾捕获“阻挡发生在墙出现之前，红色反馈没画出”的问题，现已修复并通过。入口和新增模块语法检查、`git diff --check` 均通过。源码 SHA-256 见 [source-sha256.txt](source-sha256.txt)。

## 浏览器实玩

内置 Chromium，1280×720，`http://127.0.0.1:4180/flatland.html?level=ascend`。使用可见按钮、滑块、原生键盘移动，没有注入模型状态。截图与可访问性文本同名保存。

| 流程 | 实际结果 | 证据 |
| --- | --- | --- |
| 从镜之锁的章节导航进入升维 | 第六关已解锁，旧五关星级保留 | [01-flat-room.txt](01-flat-room.txt) |
| S=4 出墙，S=1 触旗 | 进入过渡，移动/切片暂时禁用，Z→W 画面变化 | [02-dimension-transition.png](02-dimension-transition.png)、[06-transition-input-locked.txt](06-transition-input-locked.txt) |
| 原地 W=.18→.82 | XYZ 始终 (10,.40,6)，墙和屋顶消失 | [03-volume-room.txt](03-volume-room.txt)、[04-w-change-keeps-xyz.txt](04-w-change-keeps-xyz.txt) |
| 高 W 走到门外，再切 W=.18 | 三星，4 次切片改变，0 次阻挡，显示正式入口 | [05-three-stars.png](05-three-stars.png)、[05-three-stars.txt](05-three-stars.txt) |
| 高 W 走到墙内投影处，再尝试切 W=.18 | 在 .58 边界上方停住（UI 两位小数显示 .58），XYZ 不变；红色阻挡体和恢复提示可见 | [07-w-wall-blocked.png](07-w-wall-blocked.png) |
| 在阻挡边缘继续移到门外，再切回低 W | 仍可通关；本次 5 次切片、1 次阻挡，1 星；此前最高三星保留 | [08-recovered-completion.txt](08-recovered-completion.txt)、[14-best-stars-preserved.txt](14-best-stars-preserved.txt) |
| 点通关页“进入正式庭院” | 出现专用衔接文案和正常五种起手遗物选择 | [09-formal-chapter-entry.png](09-formal-chapter-entry.png) |
| 选缓落壳，进入种子 457664250 的远端折返庭 | 起始回响 0、回程结 3、机关 0/3 | [10-courtyard-fresh-run.txt](10-courtyard-fresh-run.txt) |
| 启程泵→锚台换层→远端回声台→原地换层反照花 | 三机关实际启动，庭门打开 | [11-first-mechanism.txt](11-first-mechanism.txt)、[12-formal-chain-complete.txt](12-formal-chain-complete.txt) |
| 沿桥折返归响台→归途庭门 | 第一庭完成、带回 7 枚回响；出现第二庭“分源架桥庭”遗物选择 | [13-formal-first-courtyard-cleared.png](13-formal-first-courtyard-cleared.png) |
| 无 `from` 参数打开普通庭院 | 原有起手介绍正常，没有升维专用文案 | [15-normal-entry-unchanged.txt](15-normal-entry-unchanged.txt) |

01–05 验证正常三星流程；06–13 使用补齐红色阻挡反馈后的代码验证恢复流程与正式首庭。其后仅缩短窄画布标题/说明，完整渲染测试再次通过。章节导航回到镜之锁时能清除 W 面板，URL 同步为 `level=mirror`。最终留下升维初始页和正式首庭完成页。

两个实玩标签捕获的警告和错误均为空，见 [console.json](console.json)、[console-preview.json](console-preview.json)。本轮浏览器走通的是升维和正式第一庭，未重走正式第二、第三庭；既有自动化仍覆盖三庭流程。用时含读屏与截图停顿，不是玩家完成时长。窄屏和减少动态效果经过渲染测试，没有手机触屏实玩；未做主观听感评价。代理操作与自动化不证明真人理解度或趣味性。此前各关的验证文件保持原样。
