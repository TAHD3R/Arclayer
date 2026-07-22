from __future__ import annotations

from dataclasses import dataclass

from src.common.email.template_renderer import (
    validate_email_html_template,
    validate_email_template_source,
)
from src.models.system.email_template import EmailTemplateRecord


@dataclass(frozen=True, slots=True)
class DefaultEmailTemplate:
    key: str
    locale: str
    name: str
    subject: str
    html: str
    text: str
    variables: tuple[str, ...]


def _html(title: str, body: str) -> str:
    return (
        '<!doctype html><html><body style="margin:0;background:#f5f5f5;padding:32px 16px;">'
        '<main style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;'
        'border-radius:12px;padding:32px;font-family:Arial,sans-serif;color:#171717;">'
        f'<h1 style="font-size:24px;margin:0 0 20px;">{title}</h1>{body}'
        '<p style="margin:28px 0 0;color:#737373;font-size:13px;">Arclayer</p>'
        "</main></body></html>"
    )


def _templates(locale: str) -> tuple[DefaultEmailTemplate, ...]:
    zh = locale == "zh-CN"
    return (
        DefaultEmailTemplate(
            "reset_password",
            locale,
            "重置密码" if zh else "Reset password",
            "重置你的 Arclayer 密码" if zh else "Reset your Arclayer password",
            _html(
                "重置密码" if zh else "Reset your password",
                (
                    "<p>我们收到了你的密码重置请求。</p>"
                    if zh
                    else "<p>We received a request to reset your password.</p>"
                )
                + '{% if reset_url %}<p><a href="{{ reset_url }}">'
                + ("继续重置密码" if zh else "Continue resetting your password")
                + "</a></p>{% endif %}"
                + (
                    "<p>重置码：<strong>{{ reset_token }}</strong></p>"
                    if zh
                    else "<p>Reset code: <strong>{{ reset_token }}</strong></p>"
                )
                + (
                    "<p>该链接或重置码将在 {{ expires_in }} 秒后失效。</p>"
                    if zh
                    else "<p>This link or code expires in {{ expires_in }} seconds.</p>"
                ),
            ),
            (
                "重置链接：{{ reset_url }}\n重置码：{{ reset_token }}\n有效期：{{ expires_in }} 秒。"
                if zh
                else "Reset link: {{ reset_url }}\nReset code: {{ reset_token }}\nExpires in {{ expires_in }} seconds."
            ),
            ("reset_url", "reset_token", "expires_in"),
        ),
        DefaultEmailTemplate(
            "welcome",
            locale,
            "欢迎邮件" if zh else "Welcome email",
            "欢迎加入 Arclayer" if zh else "Welcome to Arclayer",
            _html(
                "欢迎加入 Arclayer" if zh else "Welcome to Arclayer",
                "<p>你好，{{ username }}，你的账号已创建成功。</p>"
                if zh
                else "<p>Hello {{ username }}, your account is ready.</p>",
            ),
            "欢迎加入 Arclayer，{{ username }}。" if zh else "Welcome to Arclayer, {{ username }}.",
            ("username",),
        ),
        DefaultEmailTemplate(
            "email_change_code",
            locale,
            "邮箱变更验证码" if zh else "Email change code",
            "验证你的新邮箱" if zh else "Verify your new email address",
            _html(
                "验证你的新邮箱" if zh else "Verify your new email",
                (
                    "<p>验证码：<strong>{{ code }}</strong></p><p>{{ expires_in }} 秒后失效。</p>"
                    if zh
                    else "<p>Verification code: <strong>{{ code }}</strong></p><p>Expires in {{ expires_in }} seconds.</p>"
                ),
            ),
            "验证码：{{ code }}\n有效期：{{ expires_in }} 秒。"
            if zh
            else "Verification code: {{ code }}\nExpires in {{ expires_in }} seconds.",
            ("code", "expires_in"),
        ),
        DefaultEmailTemplate(
            "registration_verification",
            locale,
            "注册验证" if zh else "Registration verification",
            "验证你的邮箱" if zh else "Verify your email",
            _html(
                "验证你的邮箱" if zh else "Verify your email",
                '{% if verification_url %}<p><a href="{{ verification_url }}">'
                + ("完成邮箱验证" if zh else "Verify email")
                + "</a></p>{% endif %}"
                + (
                    "<p>验证 Token：<strong>{{ verification_token }}</strong></p>"
                    if zh
                    else "<p>Verification token: <strong>{{ verification_token }}</strong></p>"
                )
                + ("<p>{{ expires_in }} 秒后失效。</p>" if zh else "<p>Expires in {{ expires_in }} seconds.</p>"),
            ),
            (
                "验证链接：{{ verification_url }}\n验证 Token：{{ verification_token }}\n有效期：{{ expires_in }} 秒。"
                if zh
                else "Verification link: {{ verification_url }}\nVerification token: {{ verification_token }}\nExpires in {{ expires_in }} seconds."
            ),
            ("verification_url", "verification_token", "expires_in"),
        ),
        DefaultEmailTemplate(
            "login_code",
            locale,
            "登录验证码" if zh else "Login code",
            "你的 Arclayer 登录验证码" if zh else "Your Arclayer login code",
            _html(
                "登录验证码" if zh else "Login code",
                (
                    "<p>验证码：<strong>{{ code }}</strong></p><p>{{ expires_in }} 秒后失效。</p>"
                    if zh
                    else "<p>Your code is <strong>{{ code }}</strong>.</p><p>It expires in {{ expires_in }} seconds.</p>"
                ),
            ),
            "登录验证码：{{ code }}\n有效期：{{ expires_in }} 秒。"
            if zh
            else "Login code: {{ code }}\nExpires in {{ expires_in }} seconds.",
            ("code", "expires_in"),
        ),
        DefaultEmailTemplate(
            "security_alert",
            locale,
            "安全提醒" if zh else "Security alert",
            "Arclayer 账号安全提醒" if zh else "Security alert for your Arclayer account",
            _html(
                "{{ title }}",
                "<p>{{ intro }}</p><p>"
                + ("事件" if zh else "Event")
                + ": {{ event_label }}<br>"
                + ("时间" if zh else "Time")
                + ": {{ occurred_at }}<br>IP: {{ ip_address }}<br>"
                + ("设备" if zh else "Device")
                + ": {{ user_agent }}</p>",
            ),
            "{{ title }}\n\n{{ intro }}\n\n{{ event_label }}\n{{ occurred_at }}\nIP: {{ ip_address }}\n{{ user_agent }}",
            ("title", "intro", "event_label", "occurred_at", "ip_address", "user_agent"),
        ),
        DefaultEmailTemplate(
            "invitation",
            locale,
            "组织邀请" if zh else "Organization invitation",
            "邀请加入 {{ organization_name }}" if zh else "Invitation to join {{ organization_name }}",
            _html(
                "邀请加入 {{ organization_name }}" if zh else "Join {{ organization_name }}",
                '{% if invite_url %}<p><a href="{{ invite_url }}">'
                + ("接受邀请" if zh else "Accept invitation")
                + "</a></p>{% endif %}<p>Token: <strong>{{ invite_token }}</strong></p>"
                + (
                    "{% if expires_at %}<p>过期时间：{{ expires_at }}（UTC）</p>"
                    "{% else %}<p>该邀请不会过期。</p>{% endif %}"
                    if zh
                    else "{% if expires_at %}<p>Expires at {{ expires_at }} (UTC).</p>"
                    "{% else %}<p>This invitation does not expire.</p>{% endif %}"
                ),
            ),
            (
                "组织：{{ organization_name }}\n邀请链接：{{ invite_url }}\nToken：{{ invite_token }}\n"
                "{% if expires_at %}过期时间：{{ expires_at }}（UTC）{% else %}该邀请不会过期。{% endif %}"
                if zh
                else "Organization: {{ organization_name }}\nInvitation link: {{ invite_url }}\n"
                "Token: {{ invite_token }}\n{% if expires_at %}Expires at {{ expires_at }} (UTC)."
                "{% else %}This invitation does not expire.{% endif %}"
            ),
            ("organization_name", "invite_url", "invite_token", "expires_at"),
        ),
        DefaultEmailTemplate(
            "workspace_invitation",
            locale,
            "工作空间邀请" if zh else "Workspace invitation",
            "邀请加入工作空间 {{ workspace_name }}" if zh else "Invitation to join {{ workspace_name }}",
            _html(
                "邀请加入 {{ workspace_name }}" if zh else "Join {{ workspace_name }}",
                (
                    "{% if inviter_name %}<p>{{ inviter_name }} 邀请你加入工作空间。</p>{% endif %}"
                    if zh
                    else "{% if inviter_name %}<p>{{ inviter_name }} invited you to join the workspace.</p>{% endif %}"
                )
                + '{% if invite_url %}<p><a href="{{ invite_url }}">'
                + ("接受邀请" if zh else "Accept invitation")
                + "</a></p>{% endif %}<p>Token: <strong>{{ invite_token }}</strong></p>"
                + (
                    "{% if expires_at %}<p>过期时间：{{ expires_at }}（UTC）</p>"
                    "{% else %}<p>该邀请不会过期。</p>{% endif %}"
                    if zh
                    else "{% if expires_at %}<p>Expires at {{ expires_at }} (UTC).</p>"
                    "{% else %}<p>This invitation does not expire.</p>{% endif %}"
                ),
            ),
            (
                "工作空间：{{ workspace_name }}\n邀请人：{{ inviter_name }}\n邀请链接：{{ invite_url }}\n"
                "Token：{{ invite_token }}\n{% if expires_at %}过期时间：{{ expires_at }}（UTC）"
                "{% else %}该邀请不会过期。{% endif %}"
                if zh
                else "Workspace: {{ workspace_name }}\nInvited by: {{ inviter_name }}\n"
                "Invitation link: {{ invite_url }}\nToken: {{ invite_token }}\n"
                "{% if expires_at %}Expires at {{ expires_at }} (UTC)."
                "{% else %}This invitation does not expire.{% endif %}"
            ),
            ("workspace_name", "inviter_name", "invite_url", "invite_token", "expires_at"),
        ),
        DefaultEmailTemplate(
            "test",
            locale,
            "测试邮件" if zh else "Test email",
            "Arclayer 邮件发送测试" if zh else "Arclayer email delivery test",
            _html(
                "邮件发送正常" if zh else "Email delivery is working",
                "<p>如果你收到这封邮件，说明当前邮件服务提供商配置有效。</p>"
                if zh
                else "<p>If you received this message, the active email provider is configured correctly.</p>",
            ),
            "如果你收到这封邮件，说明当前邮件服务提供商配置有效。"
            if zh
            else "If you received this message, the active email provider is configured correctly.",
            (),
        ),
        DefaultEmailTemplate(
            "notification",
            locale,
            "系统通知" if zh else "System notification",
            "{{ title }}",
            _html(
                "{{ title }}",
                "{% if body %}<p>{{ body }}</p>{% endif %}"
                '{% if action_to %}<p><a href="{{ action_to }}">'
                "{{ action_label or action_to }}</a></p>{% endif %}",
            ),
            "{{ title }}{% if body %}\n\n{{ body }}{% endif %}"
            "{% if action_to %}\n\n{{ action_label or action_to }}: {{ action_to }}{% endif %}",
            ("title", "body", "action_to", "action_label"),
        ),
    )


DEFAULT_EMAIL_TEMPLATES = _templates("zh-CN") + _templates("en-US")


async def ensure_default_email_templates() -> None:
    for template in DEFAULT_EMAIL_TEMPLATES:
        validate_email_template_source(template.subject)
        validate_email_html_template(template.html)
        validate_email_template_source(template.text)
        await EmailTemplateRecord.get_or_create(
            key=template.key,
            locale=template.locale,
            defaults={
                "name": template.name,
                "description": None,
                "subject_template": template.subject,
                "html_template": template.html,
                "text_template": template.text,
                "variables": list(template.variables),
                "is_enabled": True,
                "version": 1,
            },
        )
