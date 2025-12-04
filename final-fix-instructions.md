# CCS模型连接问题修复指南

## 问题诊断结果

✅ **GLM/Kimi配置正常**：API密钥有效，连接正常
✅ **CLIProxy认证正常**：认证文件存在且未过期
❌ **模型配置不匹配**：`iflow`配置中的模型名称与CLIProxy不支持的模型

## 根本原因

您的`~/.ccs/iflow.settings.json`配置文件中的`ANTHROPIC_DEFAULT_HAIKU_MODEL`设置为`"minimax-m2"`，但CLIProxy不支持这个模型，导致返回错误：
```
unknown provider for model MiniMax-M2
```

## 完整修复步骤

### 步骤1：修复iflow配置
```bash
# 备份原配置
cp ~/.ccs/iflow.settings.json ~/.ccs/iflow.settings.json.backup

# 修复模型配置 - 替换所有模型为CLIProxy支持的deepseek-v3.2-chat
cat > ~/.ccs/iflow.settings.json << 'EOF'
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:8317/api/provider/iflow",
    "ANTHROPIC_AUTH_TOKEN": "ccs-internal-managed",
    "ANTHROPIC_MODEL": "deepseek-v3.2-chat",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "deepseek-v3.2-chat",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "deepseek-v3.2-chat",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "deepseek-v3.2-chat"
  }
}
EOF
```

### 步骤2：重启CLIProxy服务
```bash
# 停止所有CLIProxy进程
killall cli-proxy-api

# 等待进程完全停止
sleep 3

# 从用户目录启动CLIProxy（重要：必须在~目录启动才能找到config.yaml）
cd ~
~/.ccs/cliproxy/bin/cli-proxy-api &

# 等待服务启动
sleep 5
```

### 步骤3：验证修复
```bash
# 测试CLIProxy服务
curl -s "http://127.0.0.1:8317/health"

# 测试iflow模型
curl -s -X POST "http://127.0.0.1:8317/api/provider/iflow/v1/messages" \
  -H "Authorization: Bearer ccs-internal-managed" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-v3.2-chat","messages":[{"role":"user","content":"hello"}],"max_tokens":5}'
```

### 步骤4：测试所有模型
```bash
# 测试各个模型
ccs iflow "hello"
ccs glm "hello"
ccs kimi "hello"
```

## 预期结果

修复后应该看到：
- ✅ `ccs iflow` 正常响应（不再出现"hello Unable to connect to API"错误）
- ✅ `ccs glm` 正常工作
- ✅ `ccs kimi` 正常工作

## 如果仍有问题

1. **检查CLIProxy日志**：
   ```bash
   tail -20 ~/.ccs/cliproxy/logs/*.log
   ```

2. **检查CLIProxy进程**：
   ```bash
   ps aux | grep cli-proxy-api
   ```

3. **检查端口占用**：
   ```bash
   lsof -i :8317
   ```

4. **重新认证（如果需要）**：
   ```bash
   ccs iflow --auth
   ```

## 修复原理

这个问题的核心是**模型配置不匹配**：
- 原始配置：`ANTHROPIC_DEFAULT_HAIKU_MODEL": "minimax-m2"`
- 修复后配置：`ANTHROPIC_DEFAULT_HAIKU_MODEL": "deepseek-v3.2-chat"`

CLIProxy只支持特定的模型名称，使用不支持的模型名称会导致"unknown provider"错误。