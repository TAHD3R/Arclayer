export function shouldApplyExternalDocumentSync(params: {
  appliedDocumentKey: string;
  externalSerialized: string;
  lastSyncedDocumentKey: string;
}) {
  return (
    params.appliedDocumentKey !== params.externalSerialized &&
    params.externalSerialized !== params.lastSyncedDocumentKey
  );
}

export function isEditorDocumentHydrated(params: {
  appliedDocumentKey: string;
  externalSerialized: string;
  lastSyncedDocumentKey: string;
}) {
  return (
    params.appliedDocumentKey === params.externalSerialized ||
    params.externalSerialized === params.lastSyncedDocumentKey
  );
}
