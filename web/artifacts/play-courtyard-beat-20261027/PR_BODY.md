首次携收藏进庭院时，原有 welcome 照亮出生平台，且会被初始 friendGuide 占用。本次将它收束为一个可完成的首拍：选好遗物后 1.2 秒照亮可达的下一平台，配合唯一稳行 CTA；玩家真实安全抵达后给予一次短辉光，随后安静收尾。

复用现有 momentum、绘制和入口存档预算。首次这一庭不再追加自动闲置求助或 landing/onward 续拍；H 即时让位，回访不重播。运行代码仅改 `web/src/courtyard-momentum.js` 和 `web/src/main.js`。

- `npm test`：302/302 PASS。
- `verify-penpal`、`verify-top5`：1280/390/320 全 PASS，无浏览器 warning/error 或 pageerror；覆盖真实新档发现、6.5 秒静置、一次兑现、H 中断、暂停、回访和 reduced motion。
- 34 个受保护文件与基线逐字节一致；#36 提示参数、模型/计分/几何、合同、Unity 与 visitor-next-beat 不变。
- 验证详情和截图：`web/artifacts/play-courtyard-beat-20261027/VALIDATION.md`。

仍建议真人试玩；陌生玩家理解度和完成感尚未验证。
