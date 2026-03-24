# onchainos 在 Docker 容器内的 keyring 问题调查报告

**日期**：2026-03-25
**背景**：issue #131 / PR #132 — 为 `fetchWalletAddress()` 实现通过 docker exec 调用 onchainos CLI 获取链上钱包地址

---

## 问题描述

issue #131 的方案假设：在 OpenClaw 容器里通过 `docker exec` 安装 onchainos CLI，然后依次执行：

1. `onchainos wallet login` — 用 OKX_API_KEY/OKX_SECRET_KEY/OKX_PASSPHRASE 登录
2. `onchainos wallet addresses --chain 196` — 获取 X Layer 地址

但实际运行时，`wallet login` 始终返回失败，`wallet addresses` 报 "account not found"。

---

## 调查过程

### 第一步：复现症状

在运行中的 OpenClaw 容器里手动执行 login：

```
$ docker exec <container> onchainos wallet login
{
  "ok": false,
  "error": "failed to create keyring entry: Platform secure storage failure: Unknown(1): Unknown(1)"
}
```

注意：exit code 为 0，只有 JSON body 里的 `ok: false` 表示失败。`fetchWalletAddress()` 检查的是 `exitCode === 0`，所以会误判为成功，然后因为没有 address 而进入重试循环，最终返回 null。

---

### 第二步：误判方向 — D-Bus / gnome-keyring

"Platform secure storage failure" 在 Linux 上最常见的原因是 D-Bus secret service 不可用（gnome-keyring 的后端）。容器里确实没有 D-Bus，所以这个方向看起来合理。

尝试修复：

```bash
# 安装 dbus + gnome-keyring
apt-get install -y dbus-daemon gnome-keyring libsecret-tools

# 启动 D-Bus session + keyring，再跑 login
dbus-run-session -- sh -c '
  echo "" | gnome-keyring-daemon --unlock --components=secrets --daemonize
  sleep 1
  onchainos wallet login
'
```

用 `secret-tool` 验证 D-Bus secret service 本身是通的：

```bash
dbus-run-session -- sh -c '
  echo "" | gnome-keyring-daemon --unlock --components=secrets --daemonize
  sleep 1
  echo -n testvalue | secret-tool store --label=test service myservice account myaccount
  secret-tool lookup service myservice account myaccount
'
# 输出: testvalue  ✓
```

D-Bus + gnome-keyring 没问题。但 onchainos login **依然报同样的错误**。

---

### 第三步：关键线索 — strace

如果问题真的是 D-Bus，那 onchainos 应该在尝试连接 D-Bus socket（`AF_UNIX` 到 `/tmp/dbus-*`）时失败。用 strace 追踪网络和 socket 调用：

```bash
strace -e trace=network -f onchainos wallet login 2>&1 | grep -E "connect|AF_UNIX"
```

输出只有：

```
connect(9, {AF_INET, port=53, ...})       # DNS 查询
connect(9, {AF_INET, port=443, ...})      # HTTPS 连接 OKX API
```

**onchainos 完全没有尝试连接 D-Bus socket。** 这说明它根本不使用 D-Bus / secret service 后端，D-Bus 是个错误方向。

---

### 第四步：找到真正的后端 — linux-keyutils

用 `strings` 扫描 onchainos 二进制，过滤 keyring 相关字符串：

```bash
strings /home/node/.local/bin/onchainos | grep -iE "keyutils|keyring"
```

输出包含：

```
keyring-rs
KeyutilsCredential
session
persistent
```

`keyring-rs` 是 onchainos 使用的 Rust keyring 库（v3.6.3），而 `KeyutilsCredential` 明确说明它编译的是 **linux-keyutils 后端** —— 即通过 Linux 内核 keyring（`add_key` / `keyctl` 系统调用），完全不经过 D-Bus。

这解释了为什么装 gnome-keyring 没有任何效果。

---

### 第五步：确认根本原因 — Docker seccomp 屏蔽 `add_key`

安装 `keyutils` 工具包，直接测试内核 keyring 系统调用：

```bash
keyctl show
# Unable to dump key: Operation not permitted

keyctl add user testkey testval @s
# add_key: Operation not permitted
```

**Docker 默认 seccomp profile 屏蔽了 `add_key` 系统调用。**

这是完整的因果链：

```
onchainos wallet login
  → 调用 OKX API（成功）
  → 尝试用 add_key() 将 session key 存入内核 keyring
  → Docker seccomp 阻止 add_key 系统调用
  → "Platform secure storage failure: Unknown(1)"
  → login 失败，wallets.json 里 accounts 为空
  → wallet addresses → "account not found"
```

---

### 第六步：确认波及范围

不只是 `wallet login`，**所有需要读写凭证的 onchainos 操作都失败**：

```bash
onchainos wallet balance   # → keyring 错误
onchainos wallet addresses # → "account not found"（因为没有 login 成功的账号）
onchainos swap / send      # → 同样失败
```

**结论：在默认 Docker 配置下，onchainos CLI 完全不可用。** 这意味着 OpenClaw 容器内的 LLM 通过 SKILL.md 调用任何 onchainos 命令都会静默失败。

---

### 第七步：验证解决方案

在 `docker run` / `createContainer` 时加入 `--security-opt seccomp=unconfined`，关闭 seccomp 系统调用过滤：

```bash
docker run --rm --security-opt seccomp=unconfined \
  -e OKX_API_KEY=... -e OKX_SECRET_KEY=... -e OKX_PASSPHRASE=... \
  -e HOME=/home/node \
  ghcr.io/openclaw/openclaw:latest \
  sh -c '
    curl -sSL ... | sh   # 安装 onchainos
    onchainos wallet login
    onchainos wallet addresses --chain 196
  '
```

输出：

```json
{ "ok": true, "data": { "accountId": "edb95203-...", "accountName": "Account 1" } }

{
  "ok": true,
  "data": {
    "xlayer": [{ "address": "0xbe286a05380ecbef2fc489e254dd27752316d1ec", "chainIndex": "196" }]
  }
}
```

**全部通过。**

---

## onchainos 的架构分析

调查过程中对 onchainos 的内部机制有了更清晰的认识，记录如下。

### keyring 里存的是什么

`OKX_API_KEY/OKX_SECRET_KEY/OKX_PASSPHRASE` 是调用 OKX API 的长期凭证，**不会**存进 keyring。login 流程是：

```
OKX_API_KEY/SECRET/PASSPHRASE
  → POST /priapi/v5/wallet/agentic/auth/ak/init（OKX API）
  → OKX 返回短期 session token + session key pair
  → session.json 存 sessionCert、sessionKeyExpireAt、apiKey（明文）
  → session 签名私钥（encryptedSessionSk）存入 linux-keyutils（加密保护）
```

keyring 保护的是 **session 签名私钥**，用于后续每个 API 请求的签名验证，不是原始凭证。

### wallet 私钥在哪里

wallet 私钥**不在本地**，托管在 OKX 的 TEE（可信执行环境）里。证据：`session.json` 里的 `teeId` 字段，以及 binary 里的 `tempPubKey`、TEE 相关 API 路径。

流程是：

```
onchainos wallet add
  → OKX TEE 在安全飞地里生成私钥
  → 本地只存 accountId + 地址（wallets.json）
  → 签名交易时：把 tx 发给 TEE → TEE 用私钥签名 → 返回签名结果
```

私钥从不离开 OKX TEE，本地（包括容器）永远拿不到明文私钥。

### 为什么选 linux-keyutils 而不用 file 后端

从 OKX 开发者角度，这是合理的工程选择：

- `linux-keyutils`：密钥存在内核里，进程结束自动清除，不落磁盘，不会被 swap，其他进程无法直接读取
- `file` 后端：需要解决"用什么加密这个文件"的循环问题（固定密钥 = 形同明文，用户密码 = 需要交互，机器标识 = 换机失效）

onchainos 的设计目标是本地开发工具，`linux-keyutils` 在这个场景下兼顾了安全性和免配置。容器场景不在原始设计目标内。

### 对 OKX 的改进建议

最优解：**keyring 写入失败时自动降级到无状态模式**。

session key 本身是短期的、可重新生成的。当 `add_key` 返回 EPERM 时，CLI 可以不持久化 session key，改为每次命令执行前重新调用 `/auth/ak/init` 拿一个新 session，代价只是多一个网络请求。这样：

- 现有本地用户行为完全不变
- 容器/CI 环境无需任何配置，开箱即用
- 不降低安全性（env var 模式下安全性由调用方的 secret 管理负责）
- 符合"onchainos 服务 AI agent"的产品定位——agent 跑在服务器上，env var 才是标准凭证注入方式

---

## 结论

| 阶段 | 假设 | 验证结果 |
|------|------|---------|
| 初始 | D-Bus / gnome-keyring 缺失 | 错误 — onchainos 不用 D-Bus |
| 调查 | 安装 gnome-keyring 能解决 | 错误 — secret-tool 通了但 onchainos 依然失败 |
| 关键 | strace 没有 D-Bus socket 连接 | 正确 — 彻底排除 D-Bus 方向 |
| 定位 | binary strings 显示 linux-keyutils 后端 | 正确 — 用内核 keyring 不是 D-Bus |
| 根因 | Docker seccomp 屏蔽 `add_key` 系统调用 | 正确 — `keyctl add` 直接报 EPERM |
| 修复 | `seccomp=unconfined` 解除屏蔽 | 验证通过 ✓ |

**修复方案**：在 `createPetContainer` 的 `HostConfig` 里加 `SecurityOpt: ['seccomp=unconfined']`。

**安全权衡**：`seccomp=unconfined` 移除了所有系统调用过滤，但实际风险比预期小——即使攻击者从容器内拿到 session key，也只是一个短期凭证，wallet 私钥始终在 OKX TEE 里，永远不会暴露在容器环境中。长期可考虑只开放 `add_key` 的自定义 seccomp profile 进一步收窄攻击面。

**延伸影响**：SKILL.md 里所有依赖 onchainos 的技能（wallet、swap、payment）在加 `seccomp=unconfined` 之前对容器内的 LLM 来说是完全不可用的死代码。这是整套 onchain 架构能跑起来的前提条件。
