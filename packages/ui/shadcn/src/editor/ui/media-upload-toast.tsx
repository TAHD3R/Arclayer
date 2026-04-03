"use client";

import * as React from "react";

import { PlaceholderPlugin, UploadErrorCode } from "@platejs/media/react";
import { usePluginOption } from "platejs/react";
import { useTranslation } from "react-i18next";

import { message } from "@arclayer/ui/admin-toast";

type UploadError = {
  code: number;
  data?: {
    fileType?: string | null;
    files?: File[];
    maxFileCount?: number;
    maxFileSize?: string;
    minFileCount?: number;
  };
};

function getFileNames(error: UploadError) {
  return (
    error.data?.files
      ?.map((file) => file.name)
      .filter(Boolean)
      .join(", ") || ""
  );
}

export function MediaUploadToast() {
  const { t } = useTranslation("content");
  const uploadError = usePluginOption(PlaceholderPlugin, "error") as UploadError | null | undefined;

  React.useEffect(() => {
    if (!uploadError) return;

    const names = getFileNames(uploadError);

    if (uploadError.code === UploadErrorCode.INVALID_FILE_TYPE) {
      message.error(t("CONTENT_LIBRARY_EDITOR_MEDIA_UPLOAD_INVALID_TYPE", { names }));
      return;
    }
    if (
      uploadError.code === UploadErrorCode.INVALID_FILE_SIZE ||
      uploadError.code === UploadErrorCode.TOO_LARGE
    ) {
      message.error(
        t("CONTENT_LIBRARY_EDITOR_MEDIA_UPLOAD_INVALID_SIZE", {
          maxFileSize: uploadError.data?.maxFileSize,
          names,
        }),
      );
      return;
    }
    if (uploadError.code === UploadErrorCode.TOO_MANY_FILES) {
      message.error(
        t("CONTENT_LIBRARY_EDITOR_MEDIA_UPLOAD_TOO_MANY", {
          count: uploadError.data?.maxFileCount,
        }),
      );
      return;
    }
    if (uploadError.code === UploadErrorCode.TOO_LESS_FILES) {
      message.error(
        t("CONTENT_LIBRARY_EDITOR_MEDIA_UPLOAD_TOO_FEW", {
          count: uploadError.data?.minFileCount,
        }),
      );
      return;
    }

    message.error(t("CONTENT_LIBRARY_EDITOR_MEDIA_UPLOAD_FAILED", { name: names || "" }));
  }, [t, uploadError]);

  return null;
}
