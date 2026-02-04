/**
 * 复制文本到剪贴板。
 *
 * 说明：
 * - 优先使用现代 Clipboard API
 * - 若不可用（部分浏览器/权限限制），退回到 execCommand 方案
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") throw new Error("clipboard unavailable");
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.focus();
  el.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(el);
  if (!ok) throw new Error("copy failed");
}
