# BifrostWrite

<p align="center">
  <img width="100%" alt="BifrostWrite 工作区" src="https://github.com/user-attachments/assets/83968dc3-cfb9-41b5-ad99-bfea4305447b" />
</p>

<p align="center">
  <strong>面向写作、知识管理与 AI 协作的本地优先工作区。</strong><br />
  在一个桌面应用中管理 Markdown 知识库、文档、智能体会话、变更审阅与网页采集。
</p>

<p align="center">
  <a href="https://github.com/bifrost-proxy/BifrostWrite/issues">反馈问题</a>
  ·
  <a href="https://github.com/bifrost-proxy/BifrostWrite/discussions">参与讨论</a>
  ·
  <a href="LICENSE">Apache-2.0 许可证</a>
</p>

## 项目定位

BifrostWrite 是一个基于 Tauri 2、React 和 Rust 构建的桌面知识工作区。应用直接读写用户选择的本地知识库，不要求把文档上传到托管服务；编辑、检索、智能体协作和 AI 变更审阅都围绕同一份本地文件展开。

当前桌面发行版面向 macOS 12 及以上版本，同时提供 Apple Silicon 与 Intel 安装包。

## 主要能力

- **多格式写作**：编辑 Markdown、Mermaid、CSV、文本和代码文件，并可查看 PDF、图片及 Excalidraw 概念图；Markdown 实时预览支持安全、主题自适应的行内与块级 HTML。
- **知识关联**：支持双向链接、反向链接、正文 `#标签`、全文检索、书签以及 2D/3D 知识图谱。
- **智能体协作**：当前支持 Codex 与 Claude 智能体会话，并保存附件、会话记录和本地历史。
- **可控的 AI 修改**：在编辑器、聊天或独立审阅页中检查差异，按文件或代码块接受、拒绝修改。
- **多窗口工作流**：支持标签页拆分、独立窗口、跨窗口事件以及单实例深链路由。
- **网页采集**：浏览器扩展通过本机认证接口，将网页、选区或链接保存到知识库。
- **本地优先**：渲染层没有任意文件系统和进程权限，所有敏感操作都经过受控的原生接口。

## Tag 使用

Tag 直接写在 Markdown 正文中，格式为 `#标签`。它可以出现在任意文本位置，不要求井号前有空格，例如：

```markdown
这是一条关于正文#项目 的记录，也属于 #研发/编辑器 #本周
```

- 支持中文、英文、数字、下划线、连字符和 `/` 分层写法。
- 空格或标点会结束当前 Tag；多个 Tag 使用空格分隔。
- Tag 在渲染模式和源码编辑模式中都会以主题色圆角标签显示。
- 围栏代码块、行内代码、转义的 `\#文本` 和 URL 锚点不会进入 Tag 索引。
- 文档顶部 frontmatter 中的 `tag` 或 `tags` 字段不属于 Tag，也不会被读取、迁移或建立索引。
- 左侧 Tags 面板会自动汇总正文 Tag；搜索和知识图谱筛选使用不带 `#` 的 `tag:项目`。
- 网页采集器的 Tags 输入框也遵循同一规则，按空格、回车或逗号结束一个 Tag，并将结果写入正文而不是 frontmatter。

更完整的规则和示例见 [Tag 使用指南](docs/tags.md)。

## 安装

推荐使用 Homebrew Cask 安装：

```bash
brew tap bifrost-proxy/bifrost
brew install --cask bifrostwrite
```

升级或卸载：

```bash
brew upgrade --cask bifrostwrite
brew uninstall --cask bifrostwrite
```

也可以从 [GitHub Releases](https://github.com/bifrost-proxy/BifrostWrite/releases) 下载与本机架构对应的 DMG，并使用同页提供的 SHA-256 文件校验安装包。

## 技术方案

BifrostWrite 使用操作系统 WebView 承载 React 界面，以 Tauri 2 作为轻量桌面壳，并通过 Rust Sidecar 承载文件、索引、终端和智能体等领域能力。发行包不携带独立浏览器、Node.js 或智能体运行时，因此能够显著降低安装体积和空闲资源占用。主程序不集成任何遥测或崩溃上报 SDK；由应用启动的 Claude/Codex 进程也会强制关闭非必要遥测与错误上报。

```text
React 19 + TypeScript + Vite
        │
        ▼
前端运行时抽象（Tauri API、窗口与事件）
        │
        ▼
Tauri 2 Rust 桌面壳
        │  JSON Lines RPC
        ▼
Rust 原生 Sidecar
        │
        ├─ 本地知识库、检索、索引与文件监听
        ├─ 终端、拼写检查与语法服务
        └─ ACP 智能体运行时、会话和历史记录
```

核心目录：

```text
apps/desktop/src/             React 渲染层与运行时抽象
apps/desktop/src-tauri/       Tauri 桌面壳、预览协议与网页采集接口
apps/desktop/native-backend/  Rust 领域 Sidecar
apps/desktop/scripts/         原生运行时装配、构建与冒烟测试
apps/web-clipper/             浏览器网页采集扩展
crates/                       共享 Rust 领域模块
vendor/                       ACP 协议兼容代码与开发期参考实现
```

## 技术设计

### 权限与进程边界

React 渲染层不直接访问文件系统或启动进程。文件对话框、打开外部路径、窗口管理、深链和跨窗口通信由 Tauri API 提供；知识库、搜索、终端和 AI 相关命令统一通过 `backend_invoke` 发送给 Sidecar。桌面壳维护单个 Sidecar 生命周期、关联请求编号，并把原生事件广播给各个 WebView 窗口。

### 本地文件预览

知识库附件通过受限的 `bifrostwrite-file://` 自定义协议读取。协议处理器会验证已授权知识库范围、规范化路径并设置内容安全策略，避免渲染层绕过权限边界访问任意本地文件。

### 深链与单实例

应用注册 `bifrostwrite://` 协议。首个实例负责接收后续启动请求，并把打开文件、窗口导航和网页采集动作路由到正确窗口，避免多个桌面进程同时操作同一份应用状态。

### 网页采集

桌面壳仅在 `127.0.0.1:32145` 启动网页采集服务。扩展必须提供配对 Token，并通过扩展身份、Origin 与 CORS 校验；Firefox 场景还会绑定 Origin 并轮换 Token。采集内容最终仍由 Sidecar 写入用户授权的知识库。

### 更新与分发

版本标签触发 GitHub Actions，分别构建 Apple Silicon 和 Intel DMG，执行原生签名结构、Sidecar 与运行时冒烟检查后发布到 GitHub Release。应用会按稳定版或测试版通道自动检查更新；用户确认后，更新器按当前架构下载 DMG 与 SHA-256，等待旧进程退出，验证签名和版本，将新应用暂存后原子替换，并在失败时恢复备份。Homebrew Tap 仓库同时维护 `Casks/bifrostwrite.rb`，也可通过 `brew upgrade --cask bifrostwrite` 完成升级。

## 本地开发

### 环境要求

- Node.js 22.12 或更高版本，以及 npm
- Rust stable 与 Cargo
- macOS 下的 Xcode Command Line Tools
- 开发网页采集扩展时需要 pnpm 10.33.0

启动桌面应用：

```bash
git clone https://github.com/bifrost-proxy/BifrostWrite.git
cd BifrostWrite/apps/desktop
npm install
npm run dev
```

首次启动会编译 Rust 原生后端。应用设置页可配置 Codex 或 Claude；应用会优先复用本机已有的兼容 ACP 运行时，缺失时可按需安装；如果已安装普通 Codex CLI，只下载 ACP 适配层并直接复用它，不再重复下载 Codex 平台二进制。BifrostWrite 主程序不依赖 Node.js；如果按需运行时确实需要 Node.js 且本机没有兼容版本，应用会把经过固定 SHA-256 校验的 Node.js 22 下载到自身应用数据目录，不修改系统 Node.js 环境。部分身份验证方式还要求已有 CLI 登录或 API Key。

开发版本使用独立的应用配置，可与已安装的正式版同时运行。若两个版本打开同一个知识库，库内文件与隐藏状态仍然共享；并行测试写入或审阅流程时建议使用临时知识库。

## 测试与构建

```bash
# 前端单元测试、静态检查与生产构建
cd apps/desktop
npm test
npm run lint
npm run renderer:build

# Rust 工作区与 Tauri 桌面壳
cd ../..
cargo test --workspace
cd apps/desktop/src-tauri
cargo clippy --all-targets --all-features -- -D warnings

# 构建本机 DMG
cd ..
npm run tauri:build:dmg
```

更完整的测试矩阵、深链约定和数据边界请参阅：

- [Tag 使用指南](docs/tags.md)
- [Markdown 中的 HTML](docs/markdown-html.md)
- [测试与验证](docs/testing.md)
- [项目架构](docs/project-architecture.md)
- [深链设计](docs/deep-links.md)
- [数据与隐私](docs/data-and-privacy.md)
- [故障排查](docs/troubleshooting.md)

## 许可证

BifrostWrite 使用 [Apache License 2.0](LICENSE) 开源。
