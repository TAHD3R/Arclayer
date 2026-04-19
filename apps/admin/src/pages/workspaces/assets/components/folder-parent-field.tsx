import { useMemo } from "react";

import type { AdminAssetFolder } from "@/types/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialogField } from "@arclayer/ui/setting-dialog-field";

import { buildFolderById, buildFolderPath } from "./assets-folder-rail-utils";

export const ROOT_FOLDER_VALUE = "__root__";

type FolderParentOption = { value: string; label: string };

function buildFolderPathLabel(
  folderId: string,
  folderById: ReadonlyMap<string, AdminAssetFolder>,
): string {
  return buildFolderPath(folderId, folderById)
    .map((folder) => folder.name)
    .join(" / ");
}

export function FolderParentField(props: {
  title: string;
  description: string;
  placeholder: string;
  rootLabel: string;
  folders: AdminAssetFolder[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  excludedFolderIds?: ReadonlySet<string>;
}) {
  const folderById = useMemo(() => buildFolderById(props.folders), [props.folders]);
  const options = useMemo<FolderParentOption[]>(() => {
    const nextOptions: FolderParentOption[] = [
      { value: ROOT_FOLDER_VALUE, label: props.rootLabel },
    ];

    for (const folder of props.folders) {
      const folderId = String(folder.id);
      if (props.excludedFolderIds?.has(folderId)) continue;
      nextOptions.push({
        value: folderId,
        label: buildFolderPathLabel(folderId, folderById) || folder.name,
      });
    }

    return nextOptions.sort((a, b) => a.label.localeCompare(b.label));
  }, [folderById, props.excludedFolderIds, props.folders, props.rootLabel]);

  return (
    <SettingDialogField title={props.title} description={props.description}>
      <Select value={props.value} onValueChange={props.onValueChange} disabled={props.disabled}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={props.placeholder} />
        </SelectTrigger>
        <SelectContent position="popper" align="start" className="max-h-80">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingDialogField>
  );
}
