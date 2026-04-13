import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "@arclayer/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Input } from "@arclayer/ui/input";
import { Label } from "@arclayer/ui/label";
import { PasswordInput } from "@arclayer/ui/password-input";
import { Textarea } from "@arclayer/ui/textarea";

function FormInputsStory() {
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="text-title3 text-label-primary">Input surface contract</CardTitle>
        <CardDescription>
          Shared form controls should inherit typography, border, and focus semantics from the
          package layer.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor="storybook-email">Email</Label>
          <Input id="storybook-email" defaultValue="design-system@arclayer.dev" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="storybook-password">Password</Label>
          <PasswordInput id="storybook-password" defaultValue="secret-passphrase" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="storybook-notes">Notes</Label>
          <Textarea
            id="storybook-notes"
            className="min-h-28"
            defaultValue="Shared controls should read well, focus clearly, and avoid page-local restyling."
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Button>Save changes</Button>
          <Button variant="outline">Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

const meta = {
  title: "Components/Form Inputs",
  component: FormInputsStory,
  parameters: {
    docs: {
      description: {
        component:
          "Focused reference for shared input primitives. Use this story to verify readable defaults, focus treatment, and textarea/input parity.",
      },
    },
  },
} satisfies Meta<typeof FormInputsStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
