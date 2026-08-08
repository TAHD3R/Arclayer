import { Github, Pencil, Plus, Search, Upload } from "lucide-react";
import { type FormEvent, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type {
  PlatformSkillGitHubImportRequest,
  PlatformSkillPackageCreateRequest,
  PlatformSkillPackageDetailOut,
  PlatformSkillPackageReplaceRequest,
  PlatformSkillPackageSummaryOut,
  PlatformSkillVersionCreateRequest,
} from "@arclayer/platform-openapi";

import {
  archivePlatformSkill,
  createPlatformSkill,
  createPlatformSkillVersion,
  getPlatformSkill,
  getPlatformSkillCapabilities,
  importPlatformSkillFromGitHub,
  importPlatformSkillZip,
  listPlatformSkills,
  replacePlatformSkill,
  restorePlatformSkill,
} from "@/ai/ai-skills-api";
import {
  PlatformSkillCreateDialog,
  PlatformSkillMetadataDialog,
  PlatformSkillVersionDialog,
} from "@/ai/ai-skill-dialogs";
import { PlatformSkillDetailDialog } from "@/ai/ai-skill-detail-dialog";
import {
  PlatformSkillGitHubImportDialog,
  PlatformSkillZipImportDialog,
} from "@/ai/ai-skill-import-dialogs";
import { PlatformSkillCatalog, localizedSkillName } from "@/ai/ai-skills-catalog";
import { PlatformPage, PlatformToolbar } from "@/components/platform-page";
import { useMonitoringQuery } from "@/monitoring/monitoring-ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SkillStatusFilter = "all" | "active" | "archived";
type DetailDialog = "view" | "edit" | "version" | null;
type ImportDialog = "github" | "zip" | null;

export function AiSkillsPage() {
  const { t, i18n } = useTranslation("ai");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState<SkillStatusFilter>("active");
  const [createOpen, setCreateOpen] = useState(false);
  const [importDialog, setImportDialog] = useState<ImportDialog>(null);
  const [detailDialog, setDetailDialog] = useState<DetailDialog>(null);
  const [selectedSkill, setSelectedSkill] = useState<PlatformSkillPackageDetailOut | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<PlatformSkillPackageSummaryOut | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const load = useCallback(
    () =>
      listPlatformSkills({
        page: 1,
        size: 100,
        q: appliedSearch || undefined,
        status: status === "all" ? undefined : status,
      }),
    [appliedSearch, status],
  );
  const { state, retry } = useMonitoringQuery(load, []);
  const loadCapabilities = useCallback(() => getPlatformSkillCapabilities(), []);
  const { state: capabilityState, retry: retryCapabilities } = useMonitoringQuery(
    loadCapabilities,
    [],
  );
  const capabilities = capabilityState.status === "ready" ? capabilityState.data : null;

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(search.trim());
  }

  async function openSkillDialog(skillId: string, dialog: Exclude<DetailDialog, null>) {
    setSelectedSkill(null);
    setDetailDialog(null);
    setPending(`load:${skillId}`);
    try {
      setSelectedSkill(await getPlatformSkill(skillId));
      setDetailDialog(dialog);
    } catch (error) {
      toast.error(t("SKILL_LOAD_FAILED"), { description: errorMessage(error) });
    } finally {
      setPending(null);
    }
  }

  async function createSkill(payload: PlatformSkillPackageCreateRequest) {
    setPending("create");
    try {
      await createPlatformSkill(payload, crypto.randomUUID());
      setCreateOpen(false);
      toast.success(t("SKILL_CREATED"));
      retry();
    } catch (error) {
      toast.error(t("SKILL_CREATE_FAILED"), { description: errorMessage(error) });
    } finally {
      setPending(null);
    }
  }

  async function updateSkill(payload: PlatformSkillPackageReplaceRequest) {
    if (!selectedSkill) return;
    setPending("edit");
    try {
      await replacePlatformSkill(selectedSkill.id, payload, crypto.randomUUID());
      setDetailDialog(null);
      toast.success(t("SKILL_UPDATED"));
      retry();
    } catch (error) {
      toast.error(t("SKILL_UPDATE_FAILED"), { description: errorMessage(error) });
    } finally {
      setPending(null);
    }
  }

  async function importGitHubSkill(payload: PlatformSkillGitHubImportRequest) {
    setPending("github");
    try {
      await importPlatformSkillFromGitHub(payload, crypto.randomUUID());
      setImportDialog(null);
      toast.success(t("SKILL_IMPORTED"));
      retry();
    } catch (error) {
      toast.error(t("SKILL_IMPORT_FAILED"), { description: errorMessage(error) });
    } finally {
      setPending(null);
    }
  }

  async function importZipSkill(file: File) {
    setPending("zip");
    try {
      await importPlatformSkillZip(file, crypto.randomUUID());
      setImportDialog(null);
      toast.success(t("SKILL_IMPORTED"));
      retry();
    } catch (error) {
      toast.error(t("SKILL_IMPORT_FAILED"), { description: errorMessage(error) });
    } finally {
      setPending(null);
    }
  }

  async function publishVersion(payload: PlatformSkillVersionCreateRequest) {
    if (!selectedSkill) return;
    setPending("version");
    try {
      await createPlatformSkillVersion(selectedSkill.id, payload, crypto.randomUUID());
      setDetailDialog(null);
      toast.success(t("SKILL_VERSION_CREATED"));
      retry();
    } catch (error) {
      toast.error(t("SKILL_VERSION_CREATE_FAILED"), { description: errorMessage(error) });
    } finally {
      setPending(null);
    }
  }

  async function archiveSkill() {
    if (!archiveTarget) return;
    setPending("archive");
    try {
      await archivePlatformSkill(archiveTarget.id, archiveTarget.metadataRevision);
      setArchiveTarget(null);
      toast.success(t("SKILL_ARCHIVED"));
      retry();
    } catch (error) {
      toast.error(t("SKILL_ARCHIVE_FAILED"), { description: errorMessage(error) });
    } finally {
      setPending(null);
    }
  }

  async function restoreSkill(skill: PlatformSkillPackageSummaryOut) {
    setPending("restore");
    try {
      await restorePlatformSkill(skill.id, skill.metadataRevision);
      toast.success(t("RESTORE"));
      retry();
    } catch (error) {
      toast.error(t("SKILL_ARCHIVE_FAILED"), { description: errorMessage(error) });
    } finally {
      setPending(null);
    }
  }

  return (
    <PlatformPage
      description={t("SKILLS_DESCRIPTION")}
      primaryAction={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button disabled={!capabilities}>
              <Plus aria-hidden="true" />
              {t("SKILL_ADD_ACTION")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
              <Pencil aria-hidden="true" />
              {t("SKILL_ADD_MANUALLY")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setImportDialog("github")}>
              <Github aria-hidden="true" />
              {t("SKILL_ADD_GITHUB")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setImportDialog("zip")}>
              <Upload aria-hidden="true" />
              {t("SKILL_ADD_ZIP")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
      title={t("SKILLS_TITLE")}
    >
      <PlatformToolbar>
        <form className="flex min-w-0 flex-1 gap-2" onSubmit={submitSearch}>
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-9"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("SKILL_SEARCH_PLACEHOLDER")}
              value={search}
            />
          </div>
          <Button type="submit" variant="outline">
            {t("SEARCH")}
          </Button>
        </form>
        <Select onValueChange={(value) => setStatus(value as SkillStatusFilter)} value={status}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t("SKILL_FILTER_ACTIVE")}</SelectItem>
            <SelectItem value="archived">{t("SKILL_FILTER_ARCHIVED")}</SelectItem>
            <SelectItem value="all">{t("SKILL_FILTER_ALL")}</SelectItem>
          </SelectContent>
        </Select>
      </PlatformToolbar>
      {capabilityState.status === "error" ? (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <span>{t("SKILL_CAPABILITIES_ERROR")}</span>
          <Button onClick={retryCapabilities} size="sm" variant="outline">
            {t("RETRY")}
          </Button>
        </div>
      ) : null}
      <PlatformSkillCatalog
        data={state.status === "ready" ? state.data : undefined}
        language={i18n.language}
        onCreate={() => capabilities && setCreateOpen(true)}
        onArchive={setArchiveTarget}
        onRestore={(skill) => void restoreSkill(skill)}
        onEdit={(skillId) => void openSkillDialog(skillId, "edit")}
        onVersion={(skillId) => void openSkillDialog(skillId, "version")}
        onView={(skillId) => void openSkillDialog(skillId, "view")}
        pending={pending}
        retry={retry}
        status={state.status}
      />
      {capabilities ? (
        <PlatformSkillCreateDialog
          capabilities={capabilities}
          onOpenChange={setCreateOpen}
          onSubmit={createSkill}
          open={createOpen}
          pending={pending === "create"}
        />
      ) : null}
      <PlatformSkillDetailDialog
        onOpenChange={(open) => !open && setDetailDialog(null)}
        open={detailDialog === "view"}
        skill={selectedSkill}
      />
      {capabilities ? (
        <>
          <PlatformSkillMetadataDialog
            capabilities={capabilities}
            onOpenChange={(open) => !open && setDetailDialog(null)}
            onSubmit={updateSkill}
            open={detailDialog === "edit"}
            pending={pending === "edit"}
            skill={selectedSkill}
          />
          <PlatformSkillVersionDialog
            capabilities={capabilities}
            onOpenChange={(open) => !open && setDetailDialog(null)}
            onSubmit={publishVersion}
            open={detailDialog === "version"}
            pending={pending === "version"}
            skill={selectedSkill}
          />
        </>
      ) : null}
      <PlatformSkillGitHubImportDialog
        onOpenChange={(open) => !open && setImportDialog(null)}
        onSubmit={importGitHubSkill}
        open={importDialog === "github"}
        pending={pending === "github"}
      />
      <PlatformSkillZipImportDialog
        onOpenChange={(open) => !open && setImportDialog(null)}
        onSubmit={importZipSkill}
        open={importDialog === "zip"}
        pending={pending === "zip"}
      />
      <AlertDialog
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        open={Boolean(archiveTarget)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("SKILL_ARCHIVE_TITLE")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("SKILL_ARCHIVE_DESCRIPTION", {
                name: archiveTarget ? localizedSkillName(t, archiveTarget) : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending === "archive"}>{t("CANCEL")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending === "archive"}
              onClick={(event) => {
                event.preventDefault();
                void archiveSkill();
              }}
            >
              {t("SKILL_ARCHIVE_ACTION")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PlatformPage>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : String(error);
}
