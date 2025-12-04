# IFLOW.md - CCS (Claude Code Switch)

## 项目概述

CCS (Claude Code Switch) 是一个 CLI 工具，用于在多个 Claude AI 账户和替代模型（GLM、Kimi、Gemini、Codex、Antigravity）之间进行即时切换。它解决了开发者在达到 Claude 使用限制时的工作流中断问题，支持并行工作流和成本优化的任务委派。

**核心功能：**
- 即时切换 Claude 账户和 AI 模型
- 支持 OAuth 认证的零配置提供商（Gemini、Codex、Antigravity）
- 支持 API 密钥模型（GLM、Kimi）
- 成本优化的任务委派系统
- 跨平台支持（macOS、Linux、Windows）

## 技术栈

- **语言**: TypeScript (主包) + Bash/PowerShell (原生脚本)
- **包管理器**: Bun (主要) / npm / yarn / pnpm
- **构建工具**: TypeScript 编译器
- **代码质量**: ESLint + Prettier + TypeScript 严格模式
- **测试框架**: Mocha
- **CI/CD**: GitHub Actions

## 项目结构

```
/
├── src/                    # TypeScript 源代码
│   ├── ccs.ts             # 主入口点
│   ├── auth/              # 认证相关
│   ├── cliproxy/          # CLIProxy 集成 (OAuth 提供商)
│   ├── commands/          # CLI 命令处理
│   ├── delegation/        # 任务委派系统
│   ├── glmt/              # GLM 思考模式支持
│   ├── management/        # 实例管理
│   ├── types/             # TypeScript 类型定义
│   └── utils/             # 工具函数
├── dist/                  # 编译后的 JavaScript (npm 包)
├── lib/                   # 原生 shell 脚本 (bash/PowerShell)
├── scripts/               # 构建和安装脚本
├── config/                # 配置文件模板
├── docs/                  # 项目文档
├── tests/                 # 测试文件
└── .claude/               # Claude Code 配置
```

## 构建和运行

### 开发环境设置

```bash
# 安装依赖 (使用 bun)
bun install

# 编译 TypeScript
bun run build

# 开发模式 (监听文件变化)
bun run build:watch
```

### 代码质量检查

```bash
# 类型检查
bun run typecheck

# 代码格式化检查
bun run format:check

# 代码格式化修复
bun run format

# 代码检查
bun run lint

# 代码检查并自动修复
bun run lint:fix

# 完整验证 (类型检查 + 代码检查 + 格式化 + 测试)
bun run validate
```

### 测试

```bash
# 运行所有测试
bun run test

# 运行单元测试
bun run test:unit

# 运行 npm 包测试
bun run test:npm

# 运行原生脚本测试
bun run test:native
```

### 发布准备

```bash
# 发布前验证 (自动运行)
bun run prepublishOnly

# 打包前验证 (自动运行)
bun run prepack
```

## 开发约定

### 代码风格

1. **TypeScript 严格模式**: 所有严格标志已启用
2. **ESLint 规则**: 所有规则都是错误级别
   - 禁止使用 `any` 类型
   - 禁止非空断言 (`!`)
   - 未使用变量检查 (忽略 `_` 前缀)
3. **命名约定**: 使用英文驼峰命名法
4. **函数长度**: 单行不超过 80 字符
5. **注释**: 公共 API 必须有文档注释

### 项目原则

- **YAGNI**: 不添加"以防万一"的功能
- **KISS**: 保持简单，使用 bash/PowerShell/Node.js
- **DRY**: 单一数据源 (config.json)
- **CLI-First**: 所有功能必须有 CLI 接口

### 提交规范

项目使用 commitlint 和 conventional commits:

```bash
# 有效的提交消息格式
feat: 添加新功能
fix: 修复 bug
docs: 更新文档
style: 代码格式化
refactor: 代码重构
test: 添加或修改测试
chore: 构建过程或辅助工具的变动
```

## 配置文件

### 用户配置
- `~/.ccs/config.json` - 主配置文件
- `~/.ccs/*.settings.json` - 各模型的 API 密钥设置
- `~/.ccs/cliproxy/auth/` - OAuth 令牌缓存

### 项目配置
- `package.json` - 项目元数据和脚本
- `tsconfig.json` - TypeScript 配置
- `eslint.config.mjs` - ESLint 配置
- `.prettierrc` - Prettier 配置
- `commitlint.config.cjs` - Commitlint 配置

## 关键命令

### 用户命令
```bash
# 基本使用
ccs [profile] [prompt]          # 使用指定配置文件
ccs --help                      # 显示帮助
ccs --version                   # 显示版本

# 账户管理
ccs auth create <profile>       # 创建新账户配置文件
ccs auth list                   # 列出所有账户

# 健康检查
ccs doctor                      # 运行诊断检查
ccs sync                        # 同步 CCS 项目

# 任务委派
ccs glm -p "task"               # 委派任务到 GLM
ccs kimi -p "task"              # 委派任务到 Kimi
```

### 开发命令
```bash
# 安装依赖
bun install

# 构建项目
bun run build

# 运行测试
bun run test

# 代码质量检查
bun run validate
```

## 测试策略

### 测试类型
1. **单元测试**: `tests/unit/` - 测试单个模块
2. **集成测试**: `tests/integration/` - 测试跨模块交互
3. **npm 包测试**: `tests/npm/` - 测试安装和 CLI 功能
4. **原生脚本测试**: `tests/native/` - 测试 bash/PowerShell 脚本

### 测试覆盖率要求
- 新增代码覆盖率 ≥ 90%
- TDD 流程: 红线 → 绿线 → 重构

## 部署和发布

### 发布流程
1. 代码合并到 main 分支
2. Semantic Release 自动:
   - 生成变更日志
   - 更新版本号
   - 发布到 npm
   - 创建 GitHub Release

### CI/CD 管道
- **GitHub Actions**: 自动运行测试和发布
- **工作流文件**: `.github/workflows/`
  - `release.yml` - 发布流程
  - `deploy-ccs-worker.yml` - 部署工作器
  - `publish-npm.yml.deprecated` - 已弃用的发布流程

## 故障排除

### 常见问题
1. **Claude CLI 路径问题**: 设置 `CCS_CLAUDE_PATH` 环境变量
2. **Windows 符号链接**: 启用开发者模式以获得更好的性能
3. **端口冲突**: 端口 8317 被占用时运行 `ccs doctor`
4. **OAuth 超时**: 使用 `--headless` 模式进行手动认证

### 调试
```bash
# 启用调试日志
export CCS_DEBUG_LOG=1

# 详细输出
ccs --verbose

# 检查日志文件
ls ~/.ccs/logs/
```

## 贡献指南

### 开发流程
1. 从 GitHub Issues 选择任务
2. 创建功能分支
3. 实现功能并添加测试
4. 运行 `bun run validate`
5. 提交符合规范的提交消息
6. 创建 Pull Request

### 代码审查清单
- [ ] SOLID 原则: 每个接口只有一个变更理由
- [ ] KISS: 无重复抽象，无"未来可能用"的代码
- [ ] DRY: 相同逻辑 >1 行即抽公共函数/配置
- [ ] YAGNI: 没有当前需求对应的代码/字段/配置一律删除

### 安全检查清单
- [ ] 无硬编码密钥、密码、内网 IP
- [ ] 无动态拼接 SQL/Shell/URL
- [ ] 无反序列化不可信数据
- [ ] 第三方库版本已扫漏洞

## 相关文档

- [README.md](./README.md) - 用户文档
- [CLAUDE.md](./CLAUDE.md) - AI 开发指南
- [CONTRIBUTING.md](./CONTRIBUTING.md) - 贡献指南
- [docs/](./docs/) - 详细技术文档
- [系统架构](./docs/system-architecture.md) - 架构设计

## 环境要求

- **Node.js**: ≥14.0.0
- **Bun**: ≥1.0.0 (推荐)
- **操作系统**: macOS, Linux, Windows
- **Claude CLI**: 已安装并配置

## 许可证

MIT 许可证 - 详见 [LICENSE](./LICENSE) 文件