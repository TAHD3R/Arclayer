import type { Meta, StoryObj } from "@storybook/react-vite";

import BookmarkIcon from "@arclayer/ui/icons/bookmark-icon";
import GoogleIcon from "@arclayer/ui/icons/google-icon";
import SettingsIcon from "@arclayer/ui/icons/settings-icon";
import SupportIcon from "@arclayer/ui/icons/support-icon";

import { StoryLinkItem, StoryPage, StorySection } from "../_internal/storybook-docs";

const iconCards = [
  {
    title: "BookmarkIcon",
    description: "Interactive line/fill bookmark glyph with hover-aware motion.",
    render: <BookmarkIcon size={30} isFilled />,
  },
  {
    title: "SettingsIcon",
    description: "Loop-capable settings glyph for toolbar and preferences surfaces.",
    render: <SettingsIcon size={30} loop />,
  },
  {
    title: "SupportIcon",
    description: "Question/help glyph with subtle motion for assistance affordances.",
    render: <SupportIcon size={30} loop />,
  },
  {
    title: "GoogleIcon",
    description: "Brand asset for authentication and identity provider affordances.",
    render: <GoogleIcon size={26} />,
  },
] as const;

function IconGallery() {
  return (
    <StoryPage
      eyebrow="Shared icons"
      title="Animated icons and brand marks belong to the shared UI package, not ad-hoc page SVGs."
      description="This gallery gives a quick read on sizing, visual balance, and motion behavior for package-owned icon assets."
    >
      <StorySection
        title="Gallery"
        description="Use this as a sanity check for sizing, legibility, and motion before wiring icons into shared controls."
      >
        <div className="grid gap-2">
          {iconCards.map((icon) => (
            <div
              key={icon.title}
              className="border-border/70 grid gap-4 border-b py-5 last:border-b-0 lg:grid-cols-[180px_1fr]"
            >
              <div className="flex min-h-24 items-center justify-start text-label-primary">
                {icon.render}
              </div>
              <StoryLinkItem
                title={icon.title}
                description={icon.description}
                hrefLabel="Icon asset"
              />
            </div>
          ))}
        </div>
      </StorySection>
    </StoryPage>
  );
}

const meta = {
  title: "Icons/Icon Gallery",
  component: IconGallery,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Gallery for package-owned icons and brand marks. Validate sizing, motion behavior, and visual consistency here before reuse.",
      },
    },
  },
} satisfies Meta<typeof IconGallery>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
