import zhCommon from "@locales/zh-CN/common.json";
import zhNav from "@locales/zh-CN/nav.json";
import zhSetup from "@locales/zh-CN/setup.json";
import zhSettings from "@locales/zh-CN/settings.json";
import zhAccount from "@locales/zh-CN/account.json";
import zhNotifications from "@locales/zh-CN/notifications.json";
import zhCommand from "@locales/zh-CN/command.json";
import zhAssets from "@locales/zh-CN/assets.json";
import zhErrors from "@locales/zh-CN/errors.json";
import zhAuth from "@locales/zh-CN/auth.json";
import zhInvite from "@locales/zh-CN/invite.json";
import zhOnboarding from "@locales/zh-CN/onboarding.json";
import zhTeam from "@locales/zh-CN/team.json";
import zhActivity from "@locales/zh-CN/activity.json";
import zhAppearance from "@locales/zh-CN/appearance.json";
import zhRbac from "@locales/zh-CN/rbac.json";
import zhContent from "@locales/zh-CN/content.json";
import zhAi from "@locales/zh-CN/ai.json";
import zhPlatform from "@locales/zh-CN/platform.json";
import zhCommerce from "@locales/zh-CN/commerce.json";

import enCommon from "@locales/en-US/common.json";
import enNav from "@locales/en-US/nav.json";
import enSetup from "@locales/en-US/setup.json";
import enSettings from "@locales/en-US/settings.json";
import enAccount from "@locales/en-US/account.json";
import enNotifications from "@locales/en-US/notifications.json";
import enCommand from "@locales/en-US/command.json";
import enAssets from "@locales/en-US/assets.json";
import enErrors from "@locales/en-US/errors.json";
import enAuth from "@locales/en-US/auth.json";
import enInvite from "@locales/en-US/invite.json";
import enOnboarding from "@locales/en-US/onboarding.json";
import enTeam from "@locales/en-US/team.json";
import enActivity from "@locales/en-US/activity.json";
import enAppearance from "@locales/en-US/appearance.json";
import enRbac from "@locales/en-US/rbac.json";
import enContent from "@locales/en-US/content.json";
import enAi from "@locales/en-US/ai.json";
import enPlatform from "@locales/en-US/platform.json";
import enCommerce from "@locales/en-US/commerce.json";

import type { AppLocale } from "@arclayer/web/i18n";

export const I18N_NAMESPACES = [
  "common",
  "nav",
  "rbac",
  "setup",
  "onboarding",
  "invite",
  "team",
  "activity",
  "appearance",
  "settings",
  "account",
  "notifications",
  "command",
  "assets",
  "content",
  "errors",
  "auth",
  "ai",
  "platform",
  "commerce",
] as const;

export const i18nResources = {
  "zh-CN": {
    common: zhCommon,
    nav: zhNav,
    rbac: zhRbac,
    setup: zhSetup,
    onboarding: zhOnboarding,
    invite: zhInvite,
    team: zhTeam,
    activity: zhActivity,
    appearance: zhAppearance,
    settings: zhSettings,
    account: zhAccount,
    notifications: zhNotifications,
    command: zhCommand,
    assets: zhAssets,
    content: zhContent,
    errors: zhErrors,
    auth: zhAuth,
    ai: zhAi,
    platform: zhPlatform,
    commerce: zhCommerce,
  },
  "en-US": {
    common: enCommon,
    nav: enNav,
    rbac: enRbac,
    setup: enSetup,
    onboarding: enOnboarding,
    invite: enInvite,
    team: enTeam,
    activity: enActivity,
    appearance: enAppearance,
    settings: enSettings,
    account: enAccount,
    notifications: enNotifications,
    command: enCommand,
    assets: enAssets,
    content: enContent,
    errors: enErrors,
    auth: enAuth,
    ai: enAi,
    platform: enPlatform,
    commerce: enCommerce,
  },
} as const;

export type { AppLocale };

// Ensure resources cover all supported locales.
const _resourcesCoverAllLocales = i18nResources satisfies Record<AppLocale, unknown>;
void _resourcesCoverAllLocales;
