import { useAuthStore } from "@/stores/use-auth-store";

export async function downloadWithAuth(params: { url: string; filename: string }) {
  const token = useAuthStore.getState().accessToken;
  const headers = new Headers();
  if (token) headers.set("authorization", token.startsWith("Bearer ") ? token : `Bearer ${token}`);

  const res = await fetch(params.url, { headers });
  if (!res.ok) throw new Error("download failed");
  const blob = await res.blob();

  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = params.filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  }
}
