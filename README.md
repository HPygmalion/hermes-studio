# Hermes Studio LTS

**Hermes Agent 的轻量 Web 控制台（长期稳定版）**，单容器内跑通 `hermes-agent + gateway + WebUI`。

基于上游 [EKKOLearnAI/hermes-studio](https://github.com/EKKOLearnAI/hermes-studio) **v0.6.4**（Web UI）定制，
并内嵌 [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) **v0.21.0 (2026.8.31)**
（当前最新版，原生内置 **OpenCode Free** 匿名免费供应商，无需任何 API key）。

- [构建版本与基线](#构建版本与基线)
- [本地改动](#本地改动)
- [快速开始](#快速开始)
- [部署方式](#部署方式)
  - [1. 独立安装（npm / 源码）](#1-独立安装npm--源码)
  - [2. Docker](#2-docker)
  - [3. Docker Compose](#3-docker-compose)
  - [4. Quadlet（Podman + systemd，推荐生产）](#4-quadletpodman--systemd推荐生产)
- [OpenCode Free 国内网络说明](#opencode-free--国内网络说明)
- [回滚](#回滚)
- [版本体系](#版本体系)

---

## 构建版本与基线

| 组件 | 来源 | 版本 |
| --- | --- | --- |
| Web UI | EKKOLearnAI/hermes-studio | **v0.6.4** |
| Hermes Agent | NousResearch/hermes-agent | **v0.21.0 (2026.8.31)**（agent 镜像 `nousresearch/hermes-agent@sha256:81e8bd...`） |
| Web UI 前端 | Vue 3 + Naive UI | 随 0.6.4 |

> 说明：v0.6.4 的 agent 底层镜像 `nousresearch/hermes-agent` 本身就是随 `latest` 拉取的最新版
> （构建时 `Dockerfile` 以该 digest 固定）。因此容器内的 Hermes Agent 始终是 **v0.21.0**，
> 并原生支持 **OpenCode Free**——这正是不需要额外安装任何插件/密钥的原因。

---

## 本地改动

相对上游 **v0.6.4** 的定制（去广告 / 精简 / 定位为纯粹 Hermes WebUI）：

### 移除推广与冗余
- 移除侧栏「中转站 / API Relay」推广入口及其 `apikey.fun/register?aff=LIBAPI` 外链；
- 移除模型管理里的 `apikey.fun` 引流链接；
- 移除 `packages/website`（官网营销站）及其构建配置；
- 移除侧栏「工具」空分组（原「版本预览」占位入口）。

### 移除 Studio 独有 / 非 Hermes 定位的功能
- **整块移除「群聊」**（beta）：侧栏入口、路由、客户端 store / 组件 / 视图 / i18n，
  服务端路由 / 服务 / 数据库表，并将聊天 Socket.IO 从 `GroupChatServer` 解耦（改用独立 `Server`）；
- 移除侧栏「工具 / 版本预览」占位入口。

### 适配 OpenCode Free（关键）
- 在 `PROVIDER_ENV_MAP` / `PROVIDER_PRESETS` / `buildAvailableForProfile` 中新增
  **OpenCode Free**（keyless，匿名免费层，`api_key_env: ''` 恒展示）；
- 模型列表**实时**从 agent 的 `hermes_cli.models.provider_model_ids("opencode-free")`
  拉取（5 分钟进程内缓存 + 静态回退），免费模型变更自动感知，无需改代码。

### 其他定制
- `check_for_updates` 默认关闭（不再轮询上游仓库）；
- `bot_name` 默认 `Hermes Studio`；
- **默认头像**：改用 hermes-agent 官方图标（替换随机 `multiavatar` 人像）；
- **左下角品牌**：`Hermes Studio LTS` 纯文字（不再点击弹出更新日志，不指向任何仓库链接/版本号）；
- `TZ=Asia/Shanghai`；默认 `PORT=6060`；双栈监听（`BIND_HOST=::`）。

---

## 快速开始

```bash
# Docker 最快上手
docker run -d --name hermes-webui -p 6060:6060 \
  -v "$HOME/.hermes":/home/agent/.hermes \
  ghcr.io/hpygmalion/hermes-studio:latest
```

打开 http://localhost:6060 ，默认账号 `admin / 123456`（首次登录后请修改）。

---

## 部署方式

### 1. 独立安装（npm / 源码）

> 与上游 v0.6.4 相同，此仓库即为源码。需要 Node.js ≥ 23。

```bash
git clone https://github.com/HPygmalion/hermes-studio.git
cd hermes-studio
npm ci --ignore-scripts && npm rebuild node-pty
npm run build
NODE_ENV=production node dist/server/index.js
```

> 独立安装需本机已装 Hermes Agent（`hermes` 在 PATH 或设置 `HERMES_BIN`）。
> 仅用于开发调试；**生产推荐 Docker / Quadlet**（已内嵌 agent，开箱即用）。

### 2. Docker

镜像已内置 `hermes-agent`（v0.21.0）+ gateway，无需额外装 agent：

```bash
docker pull ghcr.io/hpygmalion/hermes-studio:lts

docker run -d --name hermes-webui \
  -p 6060:6060 \
  -v "$HOME/.hermes":/home/agent/.hermes \
  -e HERMES_WEB_UI_MANAGED_GATEWAY=1 \
  -e HERMES_ALLOW_ROOT_GATEWAY=1 \
  ghcr.io/hpygmalion/hermes-studio:lts
```

数据持久化于 `$HOME/.hermes`（含 config / 会话 / 技能 / 记忆 / OpenCode Free 配置）。
Web UI 状态目录：`$HOME/.hermes/hermes-web-ui`。

### 3. Docker Compose

```yaml
# docker-compose.yml
services:
  hermes-webui:
    image: ghcr.io/hpygmalion/hermes-studio:lts
    container_name: hermes-webui
    restart: unless-stopped
    ports:
      - "6060:6060"
    environment:
      - PORT=6060
      - BIND_HOST=::
      - HERMES_HOME=/home/agent/.hermes
      - HERMES_WEB_UI_MANAGED_GATEWAY=1
      - HERMES_ALLOW_ROOT_GATEWAY=1
      - TZ=Asia/Shanghai
    volumes:
      - ./hermes_data:/home/agent/.hermes
```

```bash
docker compose up -d
```

### 4. Quadlet（Podman + systemd，推荐生产）

**rootless Podman + systemd 用户单元**，支持开机自启、健康检查、IPv6 双栈。

先创建数据目录（属主与运行用户一致，rootless 下通常为 `core` uid `1000`）：

```bash
mkdir -p ~/hermes_data/hermes-web-ui ~/workspace
chown -R 1000:1000 ~/hermes_data ~/workspace
```

写入 Quadlet 单元（`~/.config/containers/systemd/hermes-webui.container`）：

```ini
[Unit]
Description=Hermes Studio LTS (hermes-agent + gateway + webui)
Documentation=https://github.com/HPygmalion/hermes-studio/releases/tag/lts
After=network-online.target
Wants=network-online.target

[Container]
Image=ghcr.io/hpygmalion/hermes-studio:lts
ContainerName=hermes-webui
Network=pasta:--address,2001:db8::2/64
PublishPort=6060:6060
Environment=WANTED_UID=1000
Environment=WANTED_GID=1000
Environment=PORT=6060
Environment=BIND_HOST=::
Environment=HERMES_HOME=/home/agent/.hermes
Environment=HERMES_WEB_UI_MANAGED_GATEWAY=1
Environment=HERMES_ALLOW_ROOT_GATEWAY=1
Environment=TZ=Asia/Shanghai
HealthCmd=curl -fsS http://127.0.0.1:6060/health >/dev/null 2>&1
HealthInterval=30s
HealthTimeout=8s
HealthStartPeriod=30s
HealthRetries=3
Volume=/var/home/core/hermes_data:/home/agent/.hermes:Z
Volume=/var/home/core/hermes_data/hermes-web-ui:/home/agent/.hermes-web-ui:Z
Volume=/var/home/core/workspace:/workspace:Z

[Service]
Restart=always
TimeoutStartSec=0

[Install]
WantedBy=default.target
```

加载并启用：

```bash
systemctl --user daemon-reload
systemctl --user enable hermes-webui   # 开启用户服务开机自启需先 loginctl enable-linger <user>
systemctl --user start hermes-webui
```

> **IPv6 说明**：`Network=pasta:--address,2001:db8::2/64` 让 rootless 容器获得 IPv6，
> 容器内 `BIND_HOST=::` 双栈监听，使 `localhost` / `::1` / IPv4 均可达
> （解决 Cloudflare Tunnel 等以 `localhost` 反代时连接被拒的问题）。

---

## OpenCode Free 与国内网络说明

- **OpenCode Free** 为匿名的 keyless 免费层，模型端点 `https://opencode.ai/zen/v1`。
  无需任何 API key；可在「模型」页直接选 **OpenCode Free** 下的免费模型。
- 由于大陆访问 `opencode.ai` 可能不稳定，建议为服务器配置可用的代理 / 隧道
  （或后续自行改为其他 provider）。
- 若 `opencode.ai` 拉取免费模型失败，WebUI 会**回退到内置静态清单**，不会报错。

---

## 回滚

旧版镜像与已弃的 nesquena 方案均已清理，仅保留当前 `lts`/`latest`（适配版）。
回滚到历史版本：从上游 tag 或早前镜像重新构建即可。

---

## 版本体系

| 分支 | Tag | 说明 |
| --- | --- | --- |
| `lts`（默认） | `lts` | 当前长期稳定版（本 README） |
