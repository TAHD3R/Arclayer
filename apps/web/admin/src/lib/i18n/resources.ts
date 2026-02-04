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
import zhPlugin from "@locales/zh-CN/plugin.json";
import zhInvite from "@locales/zh-CN/invite.json";
import zhTeam from "@locales/zh-CN/team.json";
import zhDebug from "@locales/zh-CN/debug.json";
import zhActivity from "@locales/zh-CN/activity.json";

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
import enPlugin from "@locales/en-US/plugin.json";
import enInvite from "@locales/en-US/invite.json";
import enTeam from "@locales/en-US/team.json";
import enDebug from "@locales/en-US/debug.json";
import enActivity from "@locales/en-US/activity.json";

export const I18N_NAMESPACES = [
  "common",
  "nav",
  "setup",
  "invite",
  "team",
  "debug",
  "activity",
  "settings",
  "account",
  "notifications",
  "command",
  "assets",
  "errors",
  "auth",
  "plugin",
] as const;

export const i18nResources = {
  "zh-CN": {
    common: zhCommon,
    nav: zhNav,
    setup: zhSetup,
    invite: zhInvite,
    team: zhTeam,
    debug: zhDebug,
    activity: zhActivity,
    settings: zhSettings,
    account: zhAccount,
    notifications: zhNotifications,
    command: zhCommand,
    assets: zhAssets,
    errors: zhErrors,
    auth: zhAuth,
    plugin: zhPlugin,
  },
  "en-US": {
    common: enCommon,
    nav: enNav,
    setup: enSetup,
    invite: enInvite,
    team: enTeam,
    debug: enDebug,
    activity: enActivity,
    settings: enSettings,
    account: enAccount,
    notifications: enNotifications,
    command: enCommand,
    assets: enAssets,
    errors: enErrors,
    auth: enAuth,
    plugin: enPlugin,
  },
} as const;

export type AppLocale = keyof typeof i18nResources;
