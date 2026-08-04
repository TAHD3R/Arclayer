import {
  Archive,
  BookOpenCheck,
  Eye,
  FilePlus2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
} from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type {
  PageDataPlatformSkillPackageSummaryOut,
  PlatformSkillPackageSummaryOut,
} from "@arclayer/platform-openapi";

import { PlatformSurface } from "@/components/platform-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function PlatformSkillCatalog({
  status,
  data,
  language,
  pending,
  retry,
  onCreate,
  onView,
  onEdit,
  onVersion,
  onArchive,
}: Readonly<{
  status: string;
  data?: PageDataPlatformSkillPackageSummaryOut;
  language: string;
  pending: string | null;
  retry: () => void;
  onCreate: () => void;
  onView: (skillId: string) => void;
  onEdit: (skillId: string) => void;
  onVersion: (skillId: string) => void;
  onArchive: (skill: PlatformSkillPackageSummaryOut) => void;
}>) {
  const { t } = useTranslation("ai");
  if (status === "loading") {
    return (
      <div aria-busy="true" className="space-y-3" role="status">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <RefreshCw aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("SKILL_ERROR_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("SKILL_ERROR_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={retry} variant="outline">
            {t("RETRY")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }
  if (!data || (data.items ?? []).length === 0) {
    return (
      <Empty className="min-h-72 border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookOpenCheck aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("SKILL_EMPTY_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("SKILL_EMPTY_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onCreate}>
            <Plus aria-hidden="true" />
            {t("SKILL_CREATE_ACTION")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <PlatformSurface>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("SKILL_COLUMN_SKILL")}</TableHead>
            <TableHead>{t("STATUS")}</TableHead>
            <TableHead>{t("SKILL_UPDATED_AT")}</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">{t("ACTIONS")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data.items ?? []).map((skill) => (
            <TableRow key={skill.id}>
              <TableCell>
                <button
                  className="max-w-md text-left"
                  disabled={pending === `load:${skill.id}`}
                  onClick={() => onView(skill.id)}
                  type="button"
                >
                  <span className="block font-medium hover:underline">
                    {localizedSkillName(t, skill)}
                  </span>
                  <span className="mt-1 block line-clamp-2 text-sm text-muted-foreground">
                    {localizedSkillDescription(t, skill)}
                  </span>
                </button>
              </TableCell>
              <TableCell>
                <StatusBadge status={skill.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(skill.updatedAt).toLocaleString(language)}
              </TableCell>
              <TableCell>
                <SkillActions
                  disabled={pending === `load:${skill.id}`}
                  onArchive={() => onArchive(skill)}
                  onEdit={() => onEdit(skill.id)}
                  onVersion={() => onVersion(skill.id)}
                  onView={() => onView(skill.id)}
                  skill={skill}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PlatformSurface>
  );
}

function SkillActions({
  skill,
  disabled,
  onView,
  onEdit,
  onVersion,
  onArchive,
}: Readonly<{
  skill: PlatformSkillPackageSummaryOut;
  disabled: boolean;
  onView: () => void;
  onEdit: () => void;
  onVersion: () => void;
  onArchive: () => void;
}>) {
  const { t } = useTranslation("ai");
  const archived = skill.status === "archived";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={disabled} size="icon-sm" variant="ghost">
          <MoreHorizontal aria-hidden="true" />
          <span className="sr-only">{t("ACTIONS")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onView}>
          <Eye aria-hidden="true" />
          {t("SKILL_VIEW")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={archived} onSelect={onEdit}>
          <Pencil aria-hidden="true" />
          {t("SKILL_EDIT_ACTION")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={archived} onSelect={onVersion}>
          <FilePlus2 aria-hidden="true" />
          {t("SKILL_VERSION_CREATE_ACTION")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" disabled={archived} onSelect={onArchive}>
          <Archive aria-hidden="true" />
          {t("SKILL_ARCHIVE_ACTION")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusBadge({ status }: Readonly<{ status: string }>) {
  const { t } = useTranslation("ai");
  return (
    <Badge variant={status === "active" ? "secondary" : "outline"}>
      {t(status === "active" ? "SKILL_STATUS_ACTIVE" : "SKILL_STATUS_ARCHIVED")}
    </Badge>
  );
}

export function localizedSkillName(
  t: TFunction<"ai">,
  skill: Pick<PlatformSkillPackageSummaryOut, "displayName" | "displayNameKey">,
) {
  return skill.displayNameKey ? t(skill.displayNameKey) : skill.displayName;
}

function localizedSkillDescription(
  t: TFunction<"ai">,
  skill: Pick<PlatformSkillPackageSummaryOut, "description" | "descriptionKey">,
) {
  return skill.descriptionKey ? t(skill.descriptionKey) : skill.description;
}
