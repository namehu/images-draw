# Image Draw · 在线绘图

轻量的 GPT Image 网页客户端。Vue 3 + TypeScript + Vite，部署为静态文件，复用本站 sub2api 的认证、计费和图片接口。

本应用已迁移到 `apps/draw`；根目录统一命令见 [仓库说明](../../README.md)。以下命令在当前应用目录执行。

## 本地开发

需要 Node.js 22.12+（或 24+）。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开 http://127.0.0.1:5173/draw/ 。开发服务器只监听本机，将 `/v1` 代理到 `https://sub.velunest.top`。可以用 仓库根目录的 `.env.local` 中的 `DRAW_DEV_UPSTREAM` 修改开发代理；生产始终使用同源 `/v1`。

```sh
pnpm build
pnpm test
pnpm test:e2e
```

浏览器测试可先用 `pnpm exec playwright install chromium` 安装浏览器，也可用 `DRAW_CHROMIUM_PATH` 指定已有 Chromium。`dist/` 是部署产物。单元测试覆盖 SSE 分包、错误响应、本机历史清理和凭据隔离；浏览器测试采用模拟接口，不产生图片费用。

## 功能与数据

- 灵感模板、文字生图、一张参考图编辑、预览和原图下载。
- 默认 `gpt-image-2`、每次一张、质量自动。文字生图使用 SSE；参考图编辑使用完整 JSON 返回，兼容当前上游的编辑接口。
- GPT Image 1/1.5 提供自动、1:1、2:3、3:2；2 系列另提供 16:9、9:16。模型来自用户 Key 的 `/v1/models`，实际权限由网关决定。
- 参考图接受 PNG/JPEG/WebP，最大 10 MB、4000 万像素，支持文件选择、拖放及粘贴。
- Key 只保存在当前标签页的 `sessionStorage`；不写入构建产物、URL、日志或历史数据库。会话恢复行为受浏览器控制，可随时“清除连接”。不读取平台 JWT。
- 最近 20 条作品保存在当前浏览器 IndexedDB，合计最多 100 MB。超限淘汰最旧记录；存储不可用时仍可下载。历史属于当前浏览器，不是云端账号图库，不同 Key 也可看到同一浏览器的作品。
- 生成中的操作不会自动重试。停止等待、断网或刷新不能保证上游停止计费；请到平台用量页确认后再重试。
- 所有脚本与样式本地托管；模板封面是用户所提供参考截图的演示裁剪素材，可单独替换。详见 `public/templates/README.md`。

## 真实接口测试

在仓库根目录的 `.env.test.local` 中配置 `DRAW_TEST_API_KEY=...`（已被 Git 忽略）。不要使用 `VITE_` 前缀，不要提交密钥。`scripts/live-check.mjs <密钥文件> <输出目录>` 会消耗真实额度：生成一张图片，再进行一次参考图编辑。它需要本地开发服务器，且不会自动重试。一般回归使用模拟测试即可。

## Zgo 部署

站点入口：https://sub.velunest.top/draw/

1. 构建，将 **dist 内部内容** 打成 tar.gz；只上传静态产物、`deploy/image-draw.conf`、`deploy/install.py` 和 `deploy/rollback.py`。
2. 在服务器执行 `python3 install.py <产物包> <image-draw.conf>`。脚本创建 `/var/www/image-draw/releases/<时间>`，备份配置，原子切换 `current`，通过 `nginx -t` 后平滑加载。
3. 验证 `/draw/`、静态资源、`/health` 和现有首页，测试已连接 Key 的图片调用。
4. 回滚：`python3 rollback.py /var/www/image-draw/backups/<该次时间>`。检测到后续 Nginx 编辑时会拒绝覆盖，需要人工合并。

只向已有 `sub.velunest.top` HTTPS server 添加一条 snippet include；不变更其他站点、`/v1/`、Docker、数据库、Redis 或 Cloudflare 配置。Nginx 的现有图片流式代理保活和禁用缓冲配置继续生效。

**现有部署特别说明：**容器镜像标签是 0.2.15，但其 `/app/sub2api` 已在容器内替换，运行版本报告 0.2.19。本项目不重建容器；不要为了部署静态页面执行 Docker Compose 重建。

## 平台公告入口

由平台管理员发布 `../../docs/announcement.md` 的文案，使用普通链接。不要把 API Key 或平台登录 token 放入链接参数。
