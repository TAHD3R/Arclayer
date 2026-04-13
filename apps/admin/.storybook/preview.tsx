import type { Preview } from "@storybook/react-vite";
import "./storybook.css";

import { withUiPreviewProviders } from "./storybook-preview-providers";

const preview: Preview = {
  decorators: [withUiPreviewProviders],
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    controls: {
      expanded: true,
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: {
      toc: true,
    },
    options: {
      storySort: {
        order: [
          "Introduction",
          "Theme",
          "Design System",
          "Components",
          "Icons",
          "Hooks",
          "Providers",
        ],
      },
    },
    a11y: {
      test: "todo",
    },
  },
  initialGlobals: {
    direction: "ltr",
    locale: "en-US",
    theme: "light",
  },
  globalTypes: {
    theme: {
      description: "Preview theme",
      toolbar: {
        icon: "mirror",
        items: [
          { title: "Light", value: "light" },
          { title: "Dark", value: "dark" },
        ],
      },
    },
    direction: {
      description: "Preview direction",
      toolbar: {
        icon: "transfer",
        items: [
          { title: "LTR", value: "ltr" },
          { title: "RTL", value: "rtl" },
        ],
      },
    },
    locale: {
      description: "Preview locale",
      toolbar: {
        icon: "globe",
        items: [
          { title: "English", value: "en-US" },
          { title: "中文", value: "zh-CN" },
        ],
      },
    },
  },
};

export default preview;
