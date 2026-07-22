import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@arclayer/ui/accordion";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialogField } from "@arclayer/ui/setting-dialog-field";
import { Textarea } from "@arclayer/ui/textarea";

import type { SkillAuthoringValues } from "./workspace-skill-authoring-model";

type AuthoringForm = UseFormReturn<SkillAuthoringValues>;

export function WorkspaceSkillReferenceFields({ form }: { form: AuthoringForm }) {
  const { t } = useTranslation(["settings", "common"]);
  const references = useFieldArray({ control: form.control, name: "references" });
  return (
    <SettingDialogField
      title={t("settings:SETTINGS_WORKSPACE_SKILLS_REFERENCES_LABEL")}
      description={t("settings:SETTINGS_WORKSPACE_SKILLS_REFERENCES_HELP")}
      error={
        form.formState.errors.references
          ? t("settings:SETTINGS_WORKSPACE_SKILLS_ACTION_REQUIRED")
          : undefined
      }
    >
      <div className="flex flex-col gap-3">
        {references.fields.map((field, index) => (
          <div key={field.id} className="grid gap-3 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Input
                aria-label={t("settings:SETTINGS_WORKSPACE_SKILLS_REFERENCE_PATH_LABEL")}
                placeholder="references/voice.md"
                aria-invalid={Boolean(form.formState.errors.references?.[index]?.path)}
                {...form.register(`references.${index}.path`)}
              />
              <RemoveButton
                label={t("settings:SETTINGS_WORKSPACE_SKILLS_REMOVE_REFERENCE")}
                onClick={() => references.remove(index)}
              />
            </div>
            <Textarea
              className="min-h-28 font-mono"
              aria-label={t("settings:SETTINGS_WORKSPACE_SKILLS_REFERENCE_CONTENT_LABEL")}
              aria-invalid={Boolean(form.formState.errors.references?.[index]?.content)}
              {...form.register(`references.${index}.content`)}
            />
          </div>
        ))}
        <AddButton
          label={t("settings:SETTINGS_WORKSPACE_SKILLS_ADD_REFERENCE")}
          onClick={() => references.append({ path: "", content: "" })}
        />
      </div>
    </SettingDialogField>
  );
}

export function WorkspaceSkillAdvancedFields({ form }: { form: AuthoringForm }) {
  const { t } = useTranslation(["settings", "common"]);
  const tools = useFieldArray({ control: form.control, name: "requiredTools" });
  const permissions = useFieldArray({ control: form.control, name: "permissions" });
  const egress = useFieldArray({ control: form.control, name: "dataEgress" });
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="declarations" className="rounded-lg border px-4">
        <AccordionTrigger>
          {t("settings:SETTINGS_WORKSPACE_SKILLS_ADVANCED_TITLE")}
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-5">
          <SettingDialogField
            title={t("settings:SETTINGS_WORKSPACE_SKILLS_CAPABILITY_TAGS_LABEL")}
            description={t("settings:SETTINGS_WORKSPACE_SKILLS_CAPABILITY_TAGS_HELP")}
          >
            <Input
              placeholder="content.editorial, brand.voice"
              {...form.register("capabilityTags")}
            />
          </SettingDialogField>

          <DeclarationCollection
            title={t("settings:SETTINGS_WORKSPACE_SKILLS_TOOLS_LABEL")}
            addLabel={t("settings:SETTINGS_WORKSPACE_SKILLS_ADD_TOOL")}
            onAdd={() => tools.append({ toolId: "", versionRange: ">=1", intendedUse: "" })}
          >
            {tools.fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 sm:grid-cols-[1fr_8rem_auto]">
                <Input
                  aria-label={t("settings:SETTINGS_WORKSPACE_SKILLS_TOOL_ID_LABEL")}
                  placeholder="human.request_input"
                  {...form.register(`requiredTools.${index}.toolId`)}
                />
                <Input
                  aria-label={t("settings:SETTINGS_WORKSPACE_SKILLS_VERSION_RANGE_LABEL")}
                  {...form.register(`requiredTools.${index}.versionRange`)}
                />
                <RemoveButton
                  label={t("settings:SETTINGS_WORKSPACE_SKILLS_REMOVE_TOOL")}
                  onClick={() => tools.remove(index)}
                />
                <Textarea
                  className="min-h-20 sm:col-span-3"
                  aria-label={t("settings:SETTINGS_WORKSPACE_SKILLS_PURPOSE_LABEL")}
                  {...form.register(`requiredTools.${index}.intendedUse`)}
                />
              </div>
            ))}
          </DeclarationCollection>

          <DeclarationCollection
            title={t("settings:SETTINGS_WORKSPACE_SKILLS_PERMISSIONS_LABEL")}
            addLabel={t("settings:SETTINGS_WORKSPACE_SKILLS_ADD_PERMISSION")}
            onAdd={() => permissions.append({ action: "", purpose: "" })}
          >
            {permissions.fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input
                  aria-label={t("settings:SETTINGS_WORKSPACE_SKILLS_PERMISSION_ACTION_LABEL")}
                  placeholder="content.read"
                  {...form.register(`permissions.${index}.action`)}
                />
                <RemoveButton
                  label={t("settings:SETTINGS_WORKSPACE_SKILLS_REMOVE_PERMISSION")}
                  onClick={() => permissions.remove(index)}
                />
                <Textarea
                  className="min-h-20 sm:col-span-2"
                  aria-label={t("settings:SETTINGS_WORKSPACE_SKILLS_PURPOSE_LABEL")}
                  {...form.register(`permissions.${index}.purpose`)}
                />
              </div>
            ))}
          </DeclarationCollection>

          <DeclarationCollection
            title={t("settings:SETTINGS_WORKSPACE_SKILLS_EGRESS_LABEL")}
            addLabel={t("settings:SETTINGS_WORKSPACE_SKILLS_ADD_EGRESS")}
            onAdd={() => egress.append({ destination: "", purpose: "", dataClasses: "" })}
          >
            {egress.fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input
                  aria-label={t("settings:SETTINGS_WORKSPACE_SKILLS_EGRESS_DESTINATION_LABEL")}
                  placeholder="api.example.com"
                  {...form.register(`dataEgress.${index}.destination`)}
                />
                <RemoveButton
                  label={t("settings:SETTINGS_WORKSPACE_SKILLS_REMOVE_EGRESS")}
                  onClick={() => egress.remove(index)}
                />
                <Input
                  className="sm:col-span-2"
                  aria-label={t("settings:SETTINGS_WORKSPACE_SKILLS_DATA_CLASSES_LABEL")}
                  placeholder="content.public, analytics.aggregate"
                  {...form.register(`dataEgress.${index}.dataClasses`)}
                />
                <Textarea
                  className="min-h-20 sm:col-span-2"
                  aria-label={t("settings:SETTINGS_WORKSPACE_SKILLS_PURPOSE_LABEL")}
                  {...form.register(`dataEgress.${index}.purpose`)}
                />
              </div>
            ))}
          </DeclarationCollection>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function DeclarationCollection(props: {
  title: string;
  addLabel: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={props.title}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-headline text-label-primary">{props.title}</h3>
        <AddButton label={props.addLabel} onClick={props.onAdd} />
      </div>
      {props.children}
    </section>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" size="sm" variant="outline" className="self-start" onClick={onClick}>
      <Plus data-icon="inline-start" />
      {label}
    </Button>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" size="icon" variant="ghost" aria-label={label} onClick={onClick}>
      <Trash2 aria-hidden="true" />
    </Button>
  );
}
