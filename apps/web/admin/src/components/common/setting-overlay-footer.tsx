import { Button } from "antd";
import type { ReactNode } from "react";

type AsyncAction = () => void | Promise<void>;

type SettingOverlayFooterProps = {
  /**
   * close：由外部 overlay 控制器提供，统一关闭 overlay。
   */
  close: () => void;

  /**
   * 关闭按钮文案（一般是“返回”）。
   */
  backText: ReactNode;

  /**
   * 保存按钮文案（一般是“保存”）。
   */
  saveText: ReactNode;

  /**
   * 保存动作：成功后自动 close；失败则保持打开。
   */
  onSave: AsyncAction;
  saveLoading?: boolean;

  /**
   * 可选重置动作：成功后自动 close；失败则保持打开。
   */
  onReset?: AsyncAction;
  resetText?: ReactNode;
  resetVisible?: boolean;
  resetLoading?: boolean;

  disabled?: boolean;
};

/**
 * SettingOverlayFooter：设置页 overlay（Dialog/Sheet）底部按钮区的统一实现。
 *
 * 约定：
 * - back：总是关闭
 * - save/reset：成功关闭，失败保持打开（便于用户修正表单/重试）
 */
export function SettingOverlayFooter({
  close,
  backText,
  saveText,
  onSave,
  saveLoading,
  onReset,
  resetText,
  resetVisible,
  resetLoading,
  disabled,
}: SettingOverlayFooterProps) {
  const handleSave = async () => {
    try {
      await onSave();
      close();
    } catch {
      // 保持打开，让用户修正/重试
    }
  };

  const handleReset = async () => {
    if (!onReset) return;
    try {
      await onReset();
      close();
    } catch {
      // 保持打开，让用户修正/重试
    }
  };

  return (
    <div className="flex w-full items-center justify-end gap-2">
      <Button type="text" onClick={close}>
        {backText}
      </Button>

      {resetVisible && onReset ? (
        <Button loading={resetLoading} disabled={disabled} onClick={() => void handleReset()}>
          {resetText}
        </Button>
      ) : null}

      <Button
        type="primary"
        loading={saveLoading}
        disabled={disabled}
        onClick={() => void handleSave()}
      >
        {saveText}
      </Button>
    </div>
  );
}
