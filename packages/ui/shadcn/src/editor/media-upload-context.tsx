"use client";

import * as React from "react";

export type MediaUploadResult = {
  isUpload?: boolean;
  name?: string;
  url: string;
};

type MediaUploadContextValue = {
  uploadFile: (params: {
    file: File;
    mediaType: string;
    onProgress?: (payload: { progress: number; totalBytes: number; uploadedBytes: number }) => void;
    signal?: AbortSignal;
  }) => Promise<MediaUploadResult>;
};

const MediaUploadContext = React.createContext<MediaUploadContextValue | null>(null);

export function MediaUploadProvider(props: {
  children: React.ReactNode;
  value: MediaUploadContextValue;
}) {
  return (
    <MediaUploadContext.Provider value={props.value}>{props.children}</MediaUploadContext.Provider>
  );
}

export function useMediaUploadContext() {
  const value = React.useContext(MediaUploadContext);

  if (!value) {
    throw new Error(
      "MediaUploadProvider is required when PlaceholderPlugin media nodes are enabled.",
    );
  }

  return value;
}
