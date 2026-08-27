import { useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import type { SystemPluginArtifactReviewOut } from "@arclayer/platform-openapi";

import { reviewManualArtifact } from "@/extensions/extensions-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingDialog } from "@/components/setting-dialog";
import { Textarea } from "@/components/ui/textarea";

export function PluginArtifactUploadDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("extensions");
  const [file, setFile] = useState<File | null>(null);
  const [signature, setSignature] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<SystemPluginArtifactReviewOut | null>(null);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setReview(null);
  };

  const submit = async () => {
    if (!file) {
      setError(t("ARTIFACT_FILE_REQUIRED"));
      return;
    }
    if (!signature.trim()) {
      setError(t("ARTIFACT_SIGNATURE_REQUIRED"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      setReview(await reviewManualArtifact(file, signature.trim()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("ARTIFACT_REVIEW_FAILED"));
    } finally {
      setPending(false);
    }
  };

  const close = () => {
    setFile(null);
    setSignature("");
    setReview(null);
    setError(null);
    props.onOpenChange(false);
  };

  return (
    <SettingDialog
      description={t("ARTIFACT_UPLOAD_DESCRIPTION")}
      footer={
        review ? (
          <Button onClick={close} variant="outline">
            {t("ARTIFACT_DONE")}
          </Button>
        ) : (
          <>
            <Button disabled={pending} onClick={close} variant="outline">
              {t("CANCEL")}
            </Button>
            <Button disabled={pending} form="plugin-artifact-form" type="submit">
              {pending ? t("ARTIFACT_REVIEWING") : t("ARTIFACT_UPLOAD")}
            </Button>
          </>
        )
      }
      onOpenChange={(open) => !open && !pending && close()}
      open={props.open}
      title={t("ARTIFACT_UPLOAD_TITLE")}
    >
      {review ? (
        <div className="grid gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{review.pluginName}</p>
            <Badge variant="secondary">{t("ARTIFACT_REVIEW_PASSED")}</Badge>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {t("ARTIFACT_PACKAGE_CHECKSUM")}: {review.packageChecksum.slice(0, 16)}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {t("ARTIFACT_SIGNER")}: {review.signerFingerprint.slice(0, 16)}
          </p>
          {review.permissions?.length ? (
            <p className="font-mono text-xs text-muted-foreground">
              {review.permissions.join(" · ")}
            </p>
          ) : null}
          <p className="text-muted-foreground">{t("ARTIFACT_REVIEW_NOTE", { id: review.id })}</p>
        </div>
      ) : (
        <form
          className="grid gap-4"
          id="plugin-artifact-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="plugin-artifact-file">{t("ARTIFACT_PACKAGE")}</Label>
            <Input accept=".zip" id="plugin-artifact-file" onChange={onFileChange} type="file" />
            <p className="text-xs text-muted-foreground">{t("ARTIFACT_PACKAGE_HELP")}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="plugin-artifact-signature">{t("ARTIFACT_SIGNATURE")}</Label>
            <Textarea
              id="plugin-artifact-signature"
              onChange={(event) => setSignature(event.target.value)}
              placeholder={t("ARTIFACT_SIGNATURE_PLACEHOLDER")}
              rows={4}
              value={signature}
            />
            <p className="text-xs text-muted-foreground">{t("ARTIFACT_SIGNATURE_HELP")}</p>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </form>
      )}
    </SettingDialog>
  );
}
