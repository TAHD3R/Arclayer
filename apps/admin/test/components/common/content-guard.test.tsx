import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContentGuard } from "@/components/common/content-guard";
import { ApiError } from "@/lib/http";
import { usePreferencesStore } from "@/stores/use-preference-store";
import type { IllustrationProps } from "@arclayer/ui/illustrations";
import type { ComponentType } from "react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@arclayer/ui/illustrations", () => {
  function createIllustration(label: string): ComponentType<IllustrationProps> {
    return function MockIllustration(props: IllustrationProps) {
      return (
        <div
          data-testid={label}
          data-reduced-motion={String(Boolean(props.reducedMotion))}
          data-class-name={props.className ?? ""}
        />
      );
    };
  }

  return {
    Illust401LockedTerminal: createIllustration("illustration-401"),
    Illust403ForbiddenGateway: createIllustration("illustration-403"),
    Illust404BrokenLink: createIllustration("illustration-404"),
    Illust422MalformedPacket: createIllustration("illustration-422"),
    Illust429OverloadedGauge: createIllustration("illustration-429"),
    Illust500CrashedServer: createIllustration("illustration-500"),
    IllustEmptyContainer: createIllustration("illustration-empty"),
  };
});

describe("ContentGuard", () => {
  beforeEach(() => {
    usePreferencesStore.setState({ reduceMotion: false });
  });

  it("passes admin reduced-motion preference into route-guard illustrations", () => {
    usePreferencesStore.setState({ reduceMotion: true });

    render(
      <ContentGuard
        loading={false}
        error={new ApiError({ status: 403, message: "forbidden" })}
        container="admin-route"
      />,
    );

    expect(screen.getByTestId("illustration-403")).toHaveAttribute("data-reduced-motion", "true");
  });
});
