import { Button, Drawer, InputNumber, Select, Space, Typography } from "antd";
import { Controller, useForm } from "react-hook-form";
import type { FieldErrors, Resolver } from "react-hook-form";
import { z } from "zod";
import { useTranslation } from "react-i18next";

import type { WorkspacePageMoveIn, WorkspacePageTreeNode } from "@/types/api";

const formSchema = z.object({
  parentId: z.string().trim().nullable(),
  sortOrder: z.number().int().min(0),
});

type FormValues = z.infer<typeof formSchema>;

const resolver: Resolver<FormValues> = async (values) => {
  const parsed = formSchema.safeParse(values);
  if (parsed.success) return { values: parsed.data, errors: {} };

  const errors: FieldErrors<FormValues> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path?.[0] ?? "").trim();
    if (!key) continue;
    if (key in errors) continue;
    (errors as Record<string, unknown>)[key] = {
      type: issue.code,
      message: issue.message,
    };
  }
  return { values: {}, errors };
};

export type PageMoveDrawerProps = {
  open: boolean;
  page: WorkspacePageTreeNode | null | undefined;
  pages: WorkspacePageTreeNode[];
  disabledParentIds?: Set<string>;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (payload: WorkspacePageMoveIn) => Promise<void> | void;
};

function flattenTree(
  nodes: WorkspacePageTreeNode[],
  depth = 0,
): Array<{ node: WorkspacePageTreeNode; depth: number }> {
  const out: Array<{ node: WorkspacePageTreeNode; depth: number }> = [];
  for (const n of nodes) {
    out.push({ node: n, depth });
    if (n.children?.length) out.push(...flattenTree(n.children, depth + 1));
  }
  return out;
}

export function PageMoveDrawer(props: PageMoveDrawerProps) {
  const { t } = useTranslation(["editor"]);

  const page = props.page;
  const flat = flattenTree(props.pages);

  const form = useForm<FormValues>({
    resolver,
    values: page
      ? {
          parentId: page.parentId ?? null,
          sortOrder: page.sortOrder ?? 0,
        }
      : { parentId: null, sortOrder: 0 },
  });

  const parentOptions = [
    { value: "__root__", label: t("editor:EDITOR_PAGE_MOVE_ROOT") },
    ...flat.map(({ node, depth }) => ({
      value: node.id,
      label: `${" ".repeat(depth * 2)}${node.title || t("editor:EDITOR_PAGES_UNTITLED")} (${node.path})`,
      disabled: Boolean(props.disabledParentIds?.has(node.id)),
    })),
  ];

  const onSave = async () => {
    const ok = await form.trigger();
    if (!ok) return;
    const values = form.getValues();
    const parentId = values.parentId === "__root__" ? null : values.parentId || null;
    await props.onSubmit({ parentId, sortOrder: values.sortOrder });
  };

  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      title={t("editor:EDITOR_PAGE_MOVE_TITLE")}
      width={420}
      destroyOnClose
    >
      {!page ? (
        <Typography.Text type="secondary">{t("editor:EDITOR_PAGE_MOVE_EMPTY")}</Typography.Text>
      ) : (
        <Space direction="vertical" size={12} className="w-full">
          <div>
            <Typography.Text strong>{t("editor:EDITOR_PAGE_MOVE_PARENT")}</Typography.Text>
            <Controller
              control={form.control}
              name="parentId"
              render={({ field }) => (
                <div className="mt-2">
                  <Select
                    value={field.value ?? "__root__"}
                    onChange={(v) => field.onChange(v === "__root__" ? "__root__" : v)}
                    options={parentOptions}
                    className="w-full"
                  />
                </div>
              )}
            />
          </div>

          <div>
            <Typography.Text strong>{t("editor:EDITOR_PAGE_MOVE_SORT")}</Typography.Text>
            <Controller
              control={form.control}
              name="sortOrder"
              render={({ field, fieldState }) => (
                <div className="mt-2">
                  <InputNumber
                    value={field.value}
                    onChange={(v) => field.onChange(typeof v === "number" ? v : 0)}
                    min={0}
                    precision={0}
                    className="w-full"
                    status={fieldState.error ? "error" : ""}
                  />
                </div>
              )}
            />
          </div>

          <div className="mt-2 flex justify-end">
            <Space>
              <Button onClick={props.onClose}>{t("editor:EDITOR_PAGE_MOVE_CANCEL")}</Button>
              <Button type="primary" onClick={() => void onSave()} loading={props.saving}>
                {t("editor:EDITOR_PAGE_MOVE_SAVE")}
              </Button>
            </Space>
          </div>
        </Space>
      )}
    </Drawer>
  );
}
