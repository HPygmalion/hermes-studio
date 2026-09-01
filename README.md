# Hermes Web UI — LTS (no ads, no other agents)

基于上游 `EKKOLearnAI/hermes-web-ui` **v0.6.4** 的长期稳定定制版。

## 版本选型

- 基线：**v0.6.4** —— 最后一个**不包含其他 Agent**（Claude Code / Codex / Ekko / Pi）的版本，纯 Hermes Agent，最精简稳定。
- 未采用 0.7.x：0.7.0 起为大型重构（Ekko 独立 Agent 合并等），起步阶段 bug 较多；0.6.x 更收敛、更贴合“长期稳定”诉求。

## 本地改动

- 移除侧栏“中转站 / API Relay”推广入口
  （`AppSidebar.vue` 中的 `apikey.fun/register?aff=LIBAPI` 外链及其 `apiRelay` 多语言键）；
- 移除模型管理里的 `apikey.fun/register?aff=LIBAPI` “获取 API Key” 引流链接
  （`ProviderFormModal.vue` 的 `funProviderLink` 及相关提示/CSS，以及各语言 `models.getApiKey` 不再被使用）。

> v0.6.4 本身不含“小方盒”与“设备互联”模块，故无需额外隐藏。
> 其余 `apikey.fun` 引用为功能性识别/内置 provider 预设/版本更新说明文案，属正常功能，未改动。

## 构建（amd64）

基础运行时固定为 `nousresearch/hermes-agent@sha256:81e8bd19525500ff1bfab2f5bfe9e00ffca408610bc75923fae5f9f833168db6`（linux/amd64），避免 `latest` 漂移。

```bash
docker build --platform linux/amd64 \
  -t ghcr.io/hpygmalion/hermes-studio:0.6.4-lts \
  -t ghcr.io/hpygmalion/hermes-studio:latest .
```

## 运行时

挂载宿主机 Hermes 数据目录到 `/home/agent/.hermes`，并保持原有环境变量与网络配置。示例：

```bash
docker run -d --name hermes-webui --restart=unless-stopped \
  -p 6060:6060 -e PORT=6060 \
  -e HERMES_HOME=/home/agent/.hermes \
  -e HERMES_BIN=/opt/hermes/.venv/bin/hermes \
  -e HERMES_WEB_UI_MANAGED_GATEWAY=1 \
  -e HERMES_ALLOW_ROOT_GATEWAY=1 \
  -v "$HOME/.hermes":/home/agent/.hermes \
  ghcr.io/hpygmalion/hermes-studio:0.6.4-lts
```
