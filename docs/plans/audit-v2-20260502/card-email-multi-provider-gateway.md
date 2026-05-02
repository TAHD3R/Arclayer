# Plan: 多 Provider 邮件网关 — 统一抽象 + 运行时热切换

> **审计来源**: `docs/plans/audit-v2-20260502/AUDIT_REPORT.md` §6 (AUDIT-06)
> **创建日期**: 2026-05-02 | **优先级**: P1 | **估时**: 2 周
> **依赖**: 无 (独立可执行)

---

## 1. 问题定义

当前 `EmailService` 硬编码 `fastapi-mail` (SMTP only)，仅支持单一 SMTP 连接。无 provider 抽象层，无运行时热切换能力，无发送队列和重试逻辑。

**验收目标**: 实现 `EmailProvider` 抽象接口 + 至少 3 种 Provider (SMTP/SES → Resend/Cloudflare) + `DynamicMailService` 运行时路由分发 + 4 种标准模板 (验证码/重置/欢迎/安全告警)。

---

## 2. 现状分析

### 2.1 已具备的能力

| 组件 | 文件 | 说明 |
|------|------|------|
| `EmailService` | `common/email/service.py` (882 行) | 6 种邮件发送方法 |
| `EmailSettings` | `settings/env_models.py:188-224` | SMTP env 配置 |
| `core.mail.*` | `settings/core_schema.py:281-358` | DB 存储的邮件设置 |
| Admin 邮件设置页 | `admin/src/pages/system/email/page.tsx` (448 行) | SMTP 配置 + 测试发送 |
| `AdminMailService` | `modules/system/mail/service.py` | Admin 邮件测试 |
| 邮件模板 | `static/templates/emails/` | 6 个 Jinja2 模板 |
| `boto3` 依赖 | `pyproject.toml` | 已安装 (仅用于 S3) |

### 2.2 核心问题

1.  `EmailService._build_connection_config()` 硬编码 `fastapi_mail.ConnectionConfig` (SMTP only)
2.  无 `EmailProvider` 接口 / 抽象基类
3.  无 provider 选择逻辑 (active/fallback/provider priority)
4.  无重试逻辑 (仅 `send_login_code` 向上传播异常)
5.  `validate_certs` / `suppress_send` 为 env-only，Admin UI 不暴露
6.  无发送队列 / 速率限制

---

## 3. 架构设计

### 3.1 Provider 抽象

```
EmailProvider (ABC)
├── provider_id: str          # "smtp" | "resend" | "cloudflare" | "ses"
├── provider_label: str       # Human-readable
├── is_available() -> bool    # Health check
├── send(message) -> SendResult
└── validate_config(config) -> bool

EmailMessage (dataclass)
├── to: str
├── subject: str
├── html_body: str | None
├── text_body: str | None
├── template_id: str          # 模板标识符
├── template_vars: dict
├── reply_to: str | None
├── attachments: list | None
└── metadata: dict | None     # 追踪元数据

SendResult (dataclass)
├── success: bool
├── provider_id: str
├── message_id: str | None
├── error: str | None
└── latency_ms: float
```

### 3.2 Provider 实现

```
SmtpEmailProvider(EmailProvider)
  - 现有 fastapi-mail 逻辑迁移
  - 保持 Jinja2 模板兼容

ResendEmailProvider(EmailProvider)
  - HTTP API: POST https://api.resend.com/emails
  - API Key 认证
  - 原生 React 模板支持 (可选)

CloudflareEmailProvider(EmailProvider)
  - HTTP API: POST https://api.mailchannels.com/... (Cloudflare Workers)
  - 或 Cloudflare Email Routing API
  - API Token 认证

SesEmailProvider(EmailProvider)
  - boto3 sesv2 client
  - AWS credential chain (env/IAM)
  - Template + raw send 两种模式
```

### 3.3 DynamicMailService

```python
class DynamicMailService:
    def __init__(self, settings, providers: dict[str, EmailProvider]):
        self._providers = providers
        self._active_provider_id: str  # 从 DB 读取
        self._fallback_chain: list[str]  # 优先级列表

    async def send(self, message: EmailMessage) -> SendResult:
        # 1. 尝试 active provider
        # 2. 失败 → 尝试 fallback chain 中的下一个
        # 3. 全部失败 → 抛出最后的错误
        # 4. 记录发送结果到 audit log

    async def switch_provider(self, provider_id: str) -> None:
        # 运行时热切换 (更新 DB 设置 + 刷新内存状态)

    async def get_available_providers(self) -> list[ProviderInfo]:
        # 返回所有 provider 及其状态
```

### 3.4 配置 Schema 扩展

`core.mail.*` DB 设置新增:

```json
{
  "mail": {
    "enabled": true,
    "provider": "resend",           // 新增
    "providers": {                   // 新增
      "smtp": { "server": "...", "port": 587, ... },
      "resend": { "api_key": "re_...", "domain": "arclayer.com" },
      "cloudflare": { "api_token": "...", "zone_id": "..." },
      "ses": { "region": "us-east-1", "from_arn": "..." }
    },
    "fallback_chain": ["smtp"],      // 新增
    "retry": {                       // 新增
      "max_attempts": 3,
      "backoff_seconds": [5, 15, 60]
    }
  }
}
```

---

## 4. 实现步骤

### Step 1: Provider 接口 + 基础类型 (后端)

**新建**:
- `apps/api/src/common/email/provider.py` — `EmailProvider` ABC, `EmailMessage`, `SendResult`
- `apps/api/src/common/email/providers/__init__.py` — Provider registry

### Step 2: SMTP Provider (迁移)

**新建** — `apps/api/src/common/email/providers/smtp.py`:
- `SmtpEmailProvider(EmailProvider)`
- 将 `EmailService._build_connection_config()` 逻辑迁移到此
- 保持 Jinja2 模板兼容

### Step 3: Resend Provider

**新建** — `apps/api/src/common/email/providers/resend.py`:
- `ResendEmailProvider(EmailProvider)`
- HTTP POST to `https://api.resend.com/emails`
- Header: `Authorization: Bearer {api_key}`
- 请求体: `{"from": "...", "to": "...", "subject": "...", "html": "...", "text": "..."}`

### Step 4: Cloudflare Provider

**新建** — `apps/api/src/common/email/providers/cloudflare.py`:
- `CloudflareEmailProvider(EmailProvider)`
- 使用 Cloudflare Email Routing API 或 MailChannels

### Step 5: SES Provider

**新建** — `apps/api/src/common/email/providers/ses.py`:
- `SesEmailProvider(EmailProvider)`
- `boto3.client('sesv2')` — `send_email()`
- 已有 `boto3` 依赖

### Step 6: DynamicMailService

**新建** — `apps/api/src/common/email/dynamic_service.py`:
- `DynamicMailService` 类
- Provider 路由 + fallback + 重试逻辑
- 运行时热切换: `switch_provider(provider_id)`
- 发送结果记录到 audit log

### Step 7: 重构 EmailService

**修改** — `apps/api/src/common/email/service.py`:
- `EmailService` 改为使用 `DynamicMailService`
- 保留 6 个业务方法接口 (`send_reset_password`, `send_welcome`, ...)
- 内部委托给 `DynamicMailService.send()`
- 向后兼容: 现有调用方无需修改

### Step 8: 设置 Schema 扩展

**修改** — `apps/api/src/settings/core_schema.py`:
- `core.mail.*` 新增 `provider`, `providers`, `fallback_chain`, `retry` 字段

**修改** — `apps/api/src/settings/env_models.py`:
- `EmailSettings` 新增 `default_provider`, `resend_api_key` 等

### Step 9: Admin 邮件设置页面扩展

**修改** — `apps/admin/src/pages/system/email/page.tsx`:
- Provider 选择器 (下拉菜单: SMTP / Resend / Cloudflare / SES)
- 每个 Provider 的配置表单 (条件渲染)
- Provider 连接测试按钮
- Fallback chain 配置
- 重试设置

### Step 10: 安全告警模板

**新建** — `static/templates/emails/security_alert.html` + `security_alert.txt`:
- 登录通知 (新设备/IP/位置)
- 密码变更通知
- 账户异常通知

### Step 11: 后端 — 安全告警发送逻辑

**修改** — 各 auth 模块:
- `auth/login/service.py`: 新设备登录触发 `send_security_alert`
- `auth/password/`: 密码变更触发
- `auth/account_deletion/`: 账户删除触发

### Step 12: 测试

| 测试文件 | 覆盖 |
|---------|------|
| `tests/common/email/test_provider_interface.py` | ABC 接口契约 |
| `tests/common/email/test_smtp_provider.py` | SMTP 发送 + 连接测试 |
| `tests/common/email/test_resend_provider.py` | Resend API (mock HTTP) |
| `tests/common/email/test_dynamic_service.py` | 路由分发 + fallback + 重试 |
| `tests/common/email/test_provider_switch.py` | 运行时热切换 |
| `tests/modules/system/test_admin_mail_multi_provider.py` | 端到端集成测试 |

---

## 5. 涉及文件清单

### 后端 (新建)

| 文件 | 说明 |
|------|------|
| `apps/api/src/common/email/provider.py` | `EmailProvider` ABC + `EmailMessage` + `SendResult` |
| `apps/api/src/common/email/providers/__init__.py` | Provider registry |
| `apps/api/src/common/email/providers/smtp.py` | SMTP Provider |
| `apps/api/src/common/email/providers/resend.py` | Resend Provider |
| `apps/api/src/common/email/providers/cloudflare.py` | Cloudflare Provider |
| `apps/api/src/common/email/providers/ses.py` | SES Provider |
| `apps/api/src/common/email/dynamic_service.py` | `DynamicMailService` |

### 后端 (修改)

| 文件 | 变更 |
|------|------|
| `apps/api/src/common/email/service.py` | 委托给 DynamicMailService |
| `apps/api/src/settings/core_schema.py` | 新增 provider/fallback/retry schema |
| `apps/api/src/settings/env_models.py` | 新增 env vars |
| `apps/api/src/modules/auth/login/service.py` | 安全告警触发 |
| `apps/api/src/modules/auth/password/service.py` | 安全告警触发 |

### 前端 (修改)

| 文件 | 变更 |
|------|------|
| `apps/admin/src/pages/system/email/page.tsx` | Provider 选择器 + 各配置表单 |
| `apps/admin/src/api/mail.ts` | 新增 API 调用 |

### 模板 (新建)

| 文件 | 说明 |
|------|------|
| `static/templates/emails/security_alert.html` | 安全告警 HTML |
| `static/templates/emails/security_alert.txt` | 安全告警 Plain Text |

---

## 6. 验收标准

1.  [ ] `EmailProvider` 抽象基类定义完整的 `send()` 接口
2.  [ ] 至少实现 SMTP + Resend 两种 Provider (Cloudflare/SES 作为可选扩展)
3.  [ ] Admin UI 支持选择 Provider 并配置对应凭证
4.  [ ] Provider 连接测试功能可用
5.  [ ] `DynamicMailService` 支持运行时热切换 provider
6.  [ ] Fallback chain: active provider 失败自动切换到下一个
7.  [ ] 重试逻辑: 最多 3 次，指数退避
8.  [ ] 现有 6 种邮件方法全部保持可用
9.  [ ] 安全告警模板已实现并集成到登录/密码变更流程
10. [ ] 现有测试全部通过 + 新增测试覆盖 provider 切换和 fallback

---

## 7. 风险

| 风险 | 概率 | 缓解 |
|------|------|------|
| Resend/Cloudflare API 变更 | 低 | Provider 接口隔离，变更仅影响单个 provider |
| SMTP Provider 重构破坏现有功能 | 中 | 保持 `EmailService` 公开 API 不变，内部委托 |
| SES 需要额外 AWS 配置 | 低 | SES 标记为可选 (Phase 2) |

---

## 8. 估时

| Step | 估时 |
|------|------|
| Step 1-2: Provider 接口 + SMTP 迁移 | 2 天 |
| Step 3-5: Resend + Cloudflare + SES Provider | 3 天 |
| Step 6-7: DynamicMailService + 重构 | 2 天 |
| Step 8: 设置 schema | 1 天 |
| Step 9: 前端 | 2 天 |
| Step 10-11: 安全告警模板 + 逻辑 | 1.5 天 |
| Step 12: 测试 | 2 天 |
| **总计** | **~2 周** |

---

## 9. Execution Log

### 2026-05-02

**Status**: verified

**Implemented**

- Added the backend email provider contract: `EmailProvider`, `EmailMessage`, and `SendResult`.
- Added SMTP, Resend, Cloudflare, and Amazon SES provider implementations.
- Added `DynamicMailService` with active-provider routing, fallback chain, retry attempts, and runtime provider switching.
- Refactored `EmailService` to delegate delivery through `DynamicMailService` while preserving existing public business send methods.
- Added security alert email templates and wired security alerts into password login, password reset, and password change flows.
- Extended core mail settings and validation for `provider`, nested `providers`, `fallback_chain`, and `retry`.
- Added system mail API responses and endpoints for provider listing and provider switching.
- Expanded the Admin system email settings page with provider selection, provider-specific credential sheets, fallback chain, retry policy, and localized copy.
- Added provider/unit coverage for dynamic routing, fallback, switching, Resend payloads, nested SMTP config, and SMTP HTML template subtype.

**Files changed**

- Backend provider layer: `apps/api/src/common/email/provider.py`, `apps/api/src/common/email/dynamic_service.py`, `apps/api/src/common/email/providers/__init__.py`, `apps/api/src/common/email/providers/smtp.py`, `apps/api/src/common/email/providers/resend.py`, `apps/api/src/common/email/providers/cloudflare.py`, `apps/api/src/common/email/providers/ses.py`.
- Backend services/settings: `apps/api/src/common/email/service.py`, `apps/api/src/modules/auth/login/service.py`, `apps/api/src/modules/auth/service.py`, `apps/api/src/modules/system/mail/router.py`, `apps/api/src/modules/system/mail/schema.py`, `apps/api/src/modules/system/mail/service.py`, `apps/api/src/settings/core_schema.py`, `apps/api/src/settings/env_models.py`, `apps/api/src/settings/validation.py`.
- Admin/locales/templates: `apps/admin/src/api/mail.ts`, `apps/admin/src/pages/system/email/page.tsx`, `locales/en-US/auth.json`, `locales/en-US/settings.json`, `locales/zh-CN/auth.json`, `locales/zh-CN/settings.json`, `static/templates/emails/security_alert.html`, `static/templates/emails/security_alert.txt`.
- Tests: `apps/api/tests/common/email/test_dynamic_service.py`, `apps/api/tests/common/email/test_resend_provider.py`, `apps/api/tests/common/email/test_smtp_provider.py`, `apps/api/tests/modules/auth/test_auth_login_2fa_unit.py`, `apps/api/tests/modules/auth/test_auth_password_flows_unit.py`, `apps/api/tests/modules/system/test_admin_mail_service_unit.py`.

**Verification**

- `timeout 60s env MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/common/email/test_dynamic_service.py tests/common/email/test_resend_provider.py tests/common/email/test_smtp_provider.py tests/modules/system/test_admin_mail_service_unit.py tests/modules/auth/test_auth_password_flows_unit.py::test_request_remove_password_maps_mail_delivery_failures_to_api_error tests/modules/auth/test_auth_login_2fa_unit.py::test_request_login_email_code_maps_mail_delivery_failures_to_api_error` — 16 passed.
- `pnpm -C apps/api typecheck` — passed.
- `pnpm -C apps/admin typecheck` — passed.
- `pnpm -C apps/admin test -- test/components/layout/admin-side-nav.test.tsx -t "switches to expanded-tree behavior when the collapsed sidebar is hover-expanded"` — 232 files / 955 tests passed.
- `pnpm admin:check` — passed: lint, format, typecheck, and 232 files / 955 tests.
- `pnpm api:check` — passed: lint, format, typecheck, and 641 passed / 198 skipped.

**Known verification note**

- `timeout 60s env RUN_INTEGRATION_TESTS=1 MAIL__ENABLED=1 MAIL__SUPPRESS_SEND=1 pnpm -C apps/api uv -- pytest -q tests/modules/system/test_admin_mail_integration.py` is blocked at test database fixture setup before mail assertions: Tortoise schema generation reports cyclic FK references, followed by global fallback context reuse after the failed init. The default `pnpm api:check` gate skips integration tests and passed.
