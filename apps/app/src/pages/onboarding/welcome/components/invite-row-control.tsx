import { useTranslation } from "react-i18next";

import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import type { RoleOption } from "../types";

export function InviteRowControl(props: {
  email: string;
  roleCode: string;
  roleOptions: RoleOption[];
  error: string | null;
  disabled?: boolean;
  onEmailChange: (value: string) => void;
  onRoleCodeChange: (value: string) => void;
}) {
  const { t } = useTranslation("onboarding");

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[minmax(0,1fr)_10rem] gap-2">
        <Input
          value={props.email}
          onChange={(event) => props.onEmailChange(event.target.value)}
          placeholder={t("WELCOME_INVITE_EMAIL_PLACEHOLDER")}
          disabled={props.disabled}
          aria-invalid={Boolean(props.error)}
        />
        <Select
          value={props.roleCode}
          onValueChange={props.onRoleCodeChange}
          disabled={props.disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("WELCOME_INVITE_ROLE_PLACEHOLDER")} />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            {props.roleOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {props.error ? <div className="text-footnote text-destructive">{props.error}</div> : null}
    </div>
  );
}
