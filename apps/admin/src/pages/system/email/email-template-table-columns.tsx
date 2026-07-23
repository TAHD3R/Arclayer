import type { ColumnDef } from "@tanstack/react-table";
import {
  Copy,
  Eye,
  History,
  Languages,
  MoreHorizontal,
  PencilLine,
  Power,
  PowerOff,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";

import type { MailTemplateGroup } from "@/api/mail";
import {
  buildDataTableActionsColumnMeta,
  DataTableActionsCell,
} from "@/components/common/data-table-actions-cell";
import { LocaleFlag } from "@/components/ui/tags";
import { BaseTag } from "@/components/ui/tags";
import { getLocaleMetadata } from "@/lib/i18n";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

type TemplateLocale = MailTemplateGroup["locales"][number];
type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export type EmailTemplateTableActions = {
  preferredLocale: (group: MailTemplateGroup) => TemplateLocale;
  onEdit: (locale: TemplateLocale) => void;
  onPreview: (locale: TemplateLocale) => void;
  onTestSend: (locale: TemplateLocale) => void;
  onAddLanguage: (locale: TemplateLocale) => void;
  onDuplicate: (locale: TemplateLocale) => void;
  onHistory: (group: MailTemplateGroup) => void;
  onToggle: (locale: TemplateLocale) => void;
  onRestore: (locale: TemplateLocale) => void;
  onDelete: (group: MailTemplateGroup, locale: TemplateLocale) => void;
  pendingId: string | null;
};

function TemplateIdentity(props: { group: MailTemplateGroup; t: TranslateFn }) {
  const { group, t } = props;
  return (
    <div className="min-w-0 py-1">
      <div className="truncate text-callout font-semibold text-label-primary">{group.name}</div>
      <div className="mt-1 truncate font-mono text-caption text-label-secondary">{group.key}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <BaseTag color="default" textStyle="footnote">
          {t(`settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_CATEGORY_${group.category.toUpperCase()}`)}
        </BaseTag>
        <BaseTag color={group.owner === "builtin" ? "blue" : "default"} textStyle="footnote">
          {t(`settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_OWNER_${group.owner.toUpperCase()}`)}
        </BaseTag>
        {group.isRequired ? (
          <BaseTag color="gold" textStyle="footnote">
            {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_REQUIRED_STATUS")}
          </BaseTag>
        ) : null}
      </div>
    </div>
  );
}

function LocaleList(props: {
  locales: TemplateLocale[];
  t: TranslateFn;
  onEdit: (locale: TemplateLocale) => void;
}) {
  return (
    <div className="flex min-w-[15rem] flex-col gap-1 py-1">
      {props.locales.map((locale) => {
        const metadata = getLocaleMetadata(locale.locale, props.t);
        const valid = locale.validationState === "valid";
        return (
          <button
            key={locale.id}
            type="button"
            className="group flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => props.onEdit(locale)}
          >
            <LocaleFlag locale={locale.locale} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate text-footnote font-medium text-label-primary">
              {metadata.label}
            </span>
            <span className="shrink-0 font-mono text-caption text-label-secondary">
              {locale.locale}
            </span>
            <BaseTag
              color={!valid ? "red" : locale.isEnabled ? "green" : "default"}
              textStyle="footnote"
            >
              {!valid
                ? props.t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_INVALID_STATUS")
                : locale.isEnabled
                  ? props.t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_ENABLED_STATUS")
                  : props.t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_DISABLED_STATUS")}
            </BaseTag>
          </button>
        );
      })}
    </div>
  );
}

function ActionsCell(props: {
  group: MailTemplateGroup;
  actions: EmailTemplateTableActions;
  t: TranslateFn;
}) {
  const locale = props.actions.preferredLocale(props.group);
  const pending = props.actions.pendingId === locale.id;
  const canRestore = locale.sourceState === "overridden";
  const canDelete = props.group.owner === "custom" && locale.sourceState === "custom";
  const canToggle = !props.group.isRequired || !locale.isEnabled;
  return (
    <DataTableActionsCell>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        loading={pending}
        disabled={Boolean(props.actions.pendingId)}
        onClick={() => props.actions.onEdit(locale)}
      >
        <PencilLine className="size-4" />
        {props.t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_EDIT_ACTION")}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={Boolean(props.actions.pendingId)}
            aria-label={props.t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_ACTIONS_LABEL")}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuIconItem
              icon={<Eye className="size-4" />}
              onSelect={() => props.actions.onPreview(locale)}
            >
              {props.t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_PREVIEW_ACTION")}
            </DropdownMenuIconItem>
            <DropdownMenuIconItem
              icon={<Send className="size-4" />}
              onSelect={() => props.actions.onTestSend(locale)}
            >
              {props.t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_TEST_SEND_ACTION")}
            </DropdownMenuIconItem>
            <DropdownMenuIconItem
              icon={<Languages className="size-4" />}
              onSelect={() => props.actions.onAddLanguage(locale)}
            >
              {props.t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_ADD_LANGUAGE_ACTION")}
            </DropdownMenuIconItem>
            <DropdownMenuIconItem
              icon={<Copy className="size-4" />}
              onSelect={() => props.actions.onDuplicate(locale)}
            >
              {props.t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_DUPLICATE_ACTION")}
            </DropdownMenuIconItem>
            <DropdownMenuIconItem
              icon={<History className="size-4" />}
              onSelect={() => props.actions.onHistory(props.group)}
            >
              {props.t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_HISTORY_ACTION")}
            </DropdownMenuIconItem>
            <DropdownMenuSeparator />
            <DropdownMenuIconItem
              icon={
                locale.isEnabled ? <PowerOff className="size-4" /> : <Power className="size-4" />
              }
              onSelect={() => props.actions.onToggle(locale)}
              disabled={!canToggle}
            >
              {!canToggle
                ? props.t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_REQUIRED_DISABLE_UNAVAILABLE")
                : locale.isEnabled
                  ? props.t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_DISABLE_ACTION")
                  : props.t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_ENABLE_ACTION")}
            </DropdownMenuIconItem>
            {canRestore ? (
              <DropdownMenuIconItem
                icon={<RotateCcw className="size-4" />}
                onSelect={() => props.actions.onRestore(locale)}
              >
                {props.t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_RESTORE_ACTION")}
              </DropdownMenuIconItem>
            ) : null}
            {canDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuIconItem
                  icon={<Trash2 className="size-4" />}
                  variant="destructive"
                  onSelect={() => props.actions.onDelete(props.group, locale)}
                >
                  {props.t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_DELETE_ACTION")}
                </DropdownMenuIconItem>
              </>
            ) : null}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </DataTableActionsCell>
  );
}

export function buildEmailTemplateColumns(options: {
  t: TranslateFn;
  formatDateTime: (value: string) => string;
  actions: EmailTemplateTableActions;
}): Array<ColumnDef<MailTemplateGroup, unknown>> {
  const { t } = options;
  return [
    {
      id: "template",
      size: 280,
      minSize: 240,
      header: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_COLUMN_TEMPLATE"),
      cell: ({ row }) => <TemplateIdentity group={row.original} t={t} />,
      meta: {
        title: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_COLUMN_TEMPLATE"),
        sortKey: "name",
        kind: "primary",
      },
    },
    {
      id: "languages",
      size: 360,
      minSize: 300,
      header: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_COLUMN_LANGUAGES"),
      cell: ({ row }) => (
        <LocaleList locales={row.original.locales} t={t} onEdit={options.actions.onEdit} />
      ),
      meta: { title: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_COLUMN_LANGUAGES") },
    },
    {
      id: "status",
      size: 150,
      minSize: 130,
      header: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_COLUMN_STATUS"),
      cell: ({ row }) => (
        <BaseTag
          color={
            row.original.health === "healthy"
              ? "green"
              : row.original.health === "invalid"
                ? "red"
                : "gold"
          }
          textStyle="footnote"
        >
          {t(`settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_HEALTH_${row.original.health.toUpperCase()}`)}
        </BaseTag>
      ),
      meta: {
        title: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_COLUMN_STATUS"),
        sortKey: "health",
      },
    },
    {
      id: "version",
      size: 190,
      minSize: 160,
      header: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_COLUMN_VERSION"),
      cell: ({ row }) => (
        <span className="font-mono text-caption text-label-secondary">
          {row.original.locales.map((item) => `${item.locale} v${item.version}`).join(" · ")}
        </span>
      ),
      meta: {
        title: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_COLUMN_VERSION"),
        sortKey: "version",
      },
    },
    {
      id: "updatedAt",
      size: 190,
      minSize: 170,
      header: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_COLUMN_UPDATED"),
      cell: ({ row }) => <span>{options.formatDateTime(row.original.updatedAt)}</span>,
      meta: {
        title: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_COLUMN_UPDATED"),
        sortKey: "updated_at",
        kind: "time",
      },
    },
    {
      id: "actions",
      size: 160,
      minSize: 150,
      header: "",
      cell: ({ row }) => <ActionsCell group={row.original} actions={options.actions} t={t} />,
      meta: buildDataTableActionsColumnMeta("right", "right"),
      enableSorting: false,
      enableHiding: false,
    },
  ];
}
