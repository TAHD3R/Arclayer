import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus } from "lucide-react";

import { Button, type ButtonProps } from "@arclayer/ui/button";

const meta = {
  title: "Components/Button",
  component: Button,
  args: {
    children: "Create item",
    loading: false,
    size: "default",
    variant: "default",
  },
  argTypes: {
    children: {
      control: "text",
    },
    size: {
      control: "inline-radio",
      options: ["default", "sm", "lg", "icon", "icon-sm", "icon-lg", "xs"],
    },
    variant: {
      control: "select",
      options: ["default", "accent", "destructive", "outline", "secondary", "ghost", "link"],
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Primary shared action primitive. Validate semantic variants, density, icon composition, and loading behavior here before introducing any page-level wrapper.",
      },
    },
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const WithLeadingIcon: Story = {
  args: {
    children: "New content",
  },
  render: (args) => (
    <Button {...args}>
      <Plus />
      {args.children}
    </Button>
  ),
};

export const LoadingState: Story = {
  args: {
    children: "Saving",
    loading: true,
  },
};

export const VariantMatrix: Story = {
  render: () => (
    <div className="grid gap-3 md:grid-cols-3">
      {["default", "accent", "secondary", "outline", "ghost", "destructive"].map((variant) => (
        <div key={variant} className="rounded-xl border bg-card p-4">
          <div className="text-caption text-label-secondary mb-3">{variant}</div>
          <Button variant={variant as NonNullable<ButtonProps["variant"]>}>{variant}</Button>
        </div>
      ))}
    </div>
  ),
};
