# Sub2API 页面 · pnpm workspace

同一仓库管理在线绘图页和可粘贴到 sub2api 后台的首页。沿用白底、黑色按钮、细边框与圆角卡片的设计。仓库地址和 Git 历史不变。

## 目录

```text
apps/
  draw/                 Vue 3 + TypeScript + Vite 在线绘图页
    deploy/             原有 Nginx 安装、备份和回滚脚本
    scripts/            真实接口测试与产物检查
  home/                 无运行时依赖的 HTML + CSS 首页
    home-content.html   首页内容唯一编辑源，可直接粘贴到后台
    scripts/            预览、构建与浏览器验证
docs/                   配置说明、修复记录、设计与验证记录
pnpm-workspace.yaml
pnpm-lock.yaml          唯一依赖锁文件
.env.test.local         本机测试 Key，继续留在根目录，已被 Git 忽略
```

采用轻量 pnpm workspace：两个页面可独立开发和构建，统一依赖锁定与检查命令。暂不引入 Turborepo 或共享组件包；首页需要纯 HTML，绘图页是 Vue 应用，强行共享组件会增加发布复杂度。

## 开发与构建

Node.js 22.12+；使用本机已有的 pnpm 8.15.9，版本已记录在 `packageManager`。

```sh
pnpm install --frozen-lockfile
pnpm dev:draw       # http://127.0.0.1:5173/draw/
pnpm dev:home       # http://127.0.0.1:5174，编辑后刷新
pnpm build         # 构建两个页面
pnpm build:draw
pnpm build:home
pnpm test          # 绘图页单元测试
pnpm test:e2e      # 绘图页模拟接口浏览器测试，不消耗图片额度
pnpm check:home    # 在隔离浏览器中预览首页，不保存平台设置
```

浏览器测试需要 Chromium。可以用 `DRAW_CHROMIUM_PATH` 指向已有浏览器，或执行 `pnpm --filter @velunest/draw exec playwright install chromium`。当前机器可使用：

```powershell
$env:DRAW_CHROMIUM_PATH='C:\Users\pc\AppData\Local\ms-playwright\chromium-1223\chrome-win64\chrome.exe'
```

`pnpm check:home` 仅访问公开站点，在该浏览器里替换公开设置响应，模拟真实 `v-html` 容器。所有非 GET/HEAD 请求都被拦截；不会登录管理后台或修改服务器。截图输出在 `apps/home/test-results/`。

## 发布

- **首页：** `pnpm build:home` 后，将 `apps/home/dist/home-content.html` 的全部内容粘贴到管理后台“首页内容”，手动保存。`dist/index.html` 是可双击打开的预览，不是建议粘贴的文件。详见 [首页配置说明](docs/首页配置说明.md)。
- **绘图页：** 仍然部署在 `/draw/`。产物路径改为 `apps/draw/dist/`，安装脚本位于 `apps/draw/deploy/`；此次目录迁移不触发任何服务器部署。

两种发布方式互相独立。首页示例图复用现有 `/draw/templates/interior.webp`、`product.webp`；保持这两个静态资源可访问即可。

## 环境与凭据

`.env.local`、`.env.test.local` 继续放仓库根目录。绘图页的 Vite 配置从根目录读取 `DRAW_DEV_UPSTREAM`；生产仍使用同源 `/v1`。不要为 Key 使用 `VITE_` 前缀，也不要提交任何凭据。

真实接口脚本会消耗额度，不属于日常测试命令。在仓库根目录运行，例如：

```sh
node apps/draw/scripts/check-models.mjs .env.test.local
node apps/draw/scripts/live-edit-check.mjs .env.test.local <参考图路径> https://sub.velunest.top/draw/
pnpm check:bundle
```

真实生图脚本未在此次首页制作和 monorepo 迁移中执行。

## 相关说明

- [v0.2.20 适配与图片质量说明](docs/v0.2.20适配与图片质量.md)
- [参考图编辑修复说明](docs/参考图编辑修复说明.md)
- [首页配置说明](docs/首页配置说明.md)
- [迁移与设计记录](docs/monorepo与首页设计.md)
- [绘图页验证记录](docs/verification.md)
- [平台公告文案](docs/announcement.md)
