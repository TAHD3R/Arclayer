import { projectPath } from "@/lib/api";
import { api } from "@/lib/http";
import type {
  ProjectSourceFile,
  ProjectSourceFileDelete,
  ProjectSourceFileUpsertInput,
  ProjectSourceManifest,
} from "@arclayer/openapi/admin-types";

function sourceFilePath(filePath: string): string {
  return filePath
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export async function getProjectSourceManifest(projectId: string): Promise<ProjectSourceManifest> {
  return api.get<ProjectSourceManifest>(projectPath(projectId, "/source/manifest"));
}

export async function getProjectSourceFile(
  projectId: string,
  filePath: string,
): Promise<ProjectSourceFile> {
  return api.get<ProjectSourceFile>(
    projectPath(projectId, `/source/files/${sourceFilePath(filePath)}`),
  );
}

export async function upsertProjectSourceFile(
  projectId: string,
  filePath: string,
  payload: ProjectSourceFileUpsertInput,
): Promise<ProjectSourceFile> {
  return api.put<ProjectSourceFile>(
    projectPath(projectId, `/source/files/${sourceFilePath(filePath)}`),
    payload,
  );
}

export async function deleteProjectSourceFile(
  projectId: string,
  filePath: string,
): Promise<ProjectSourceFileDelete> {
  return api.delete<ProjectSourceFileDelete>(
    projectPath(projectId, `/source/files/${sourceFilePath(filePath)}`),
  );
}
