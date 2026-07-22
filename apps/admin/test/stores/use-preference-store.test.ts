import { beforeEach, describe, expect, it } from "vitest";

import { STORAGE_KEYS } from "@/constants/storage";
import {
  initializePreferences,
  teardownPreferences,
  usePreferencesStore,
} from "@/stores/use-preference-store";

describe("usePreferencesStore layout width preferences", () => {
  beforeEach(() => {
    document.head.innerHTML =
      '<link rel="icon" type="image/svg+xml" href="/logo.svg" data-theme-favicon />';
    window.localStorage.clear();
    teardownPreferences();
  });

  it("initializes sidebar width from localStorage and falls back to 220px when absent", () => {
    initializePreferences();

    expect(usePreferencesStore.getState().sidebarWidthPx).toBe(220);

    teardownPreferences();
    window.localStorage.setItem(STORAGE_KEYS.sidebarWidthPx, "305");

    initializePreferences();

    expect(usePreferencesStore.getState().sidebarWidthPx).toBe(305);
  });

  it("clamps persisted and updated sidebar width into the 180-320px range", () => {
    window.localStorage.setItem(STORAGE_KEYS.sidebarWidthPx, "999");

    initializePreferences();

    expect(usePreferencesStore.getState().sidebarWidthPx).toBe(320);

    usePreferencesStore.getState().setSidebarWidthPx(120);
    expect(usePreferencesStore.getState().sidebarWidthPx).toBe(180);
    expect(window.localStorage.getItem(STORAGE_KEYS.sidebarWidthPx)).toBe("180");

    usePreferencesStore.getState().setSidebarWidthPx(420);
    expect(usePreferencesStore.getState().sidebarWidthPx).toBe(320);
    expect(window.localStorage.getItem(STORAGE_KEYS.sidebarWidthPx)).toBe("320");
  });

  it("initializes and persists AI drawer width in localStorage", () => {
    initializePreferences();

    expect(usePreferencesStore.getState().aiDrawerWidthPx).toBe(320);

    teardownPreferences();
    window.localStorage.setItem(STORAGE_KEYS.aiDrawerWidthPx, "456");

    initializePreferences();

    expect(usePreferencesStore.getState().aiDrawerWidthPx).toBe(456);

    usePreferencesStore.getState().setAiDrawerWidthPx(512);
    expect(usePreferencesStore.getState().aiDrawerWidthPx).toBe(512);
    expect(window.localStorage.getItem(STORAGE_KEYS.aiDrawerWidthPx)).toBe("512");
  });

  it("clamps persisted and updated AI drawer width into the supported range", () => {
    window.localStorage.setItem(STORAGE_KEYS.aiDrawerWidthPx, "1200");

    initializePreferences();

    expect(usePreferencesStore.getState().aiDrawerWidthPx).toBe(960);

    usePreferencesStore.getState().setAiDrawerWidthPx(240);
    expect(usePreferencesStore.getState().aiDrawerWidthPx).toBe(320);
    expect(window.localStorage.getItem(STORAGE_KEYS.aiDrawerWidthPx)).toBe("320");
  });
});
