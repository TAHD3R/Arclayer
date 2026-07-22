import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, UserRoundX } from "lucide-react";
import { useTranslation } from "react-i18next";

import { listSystemDirectoryUsers } from "@/api/system-directory";
import type { FeedbackUser } from "@/api/feedback";
import { UserAvatar } from "@/components/common/entity-avatar";
import { Alert, AlertDescription } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@arclayer/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@arclayer/ui/popover";
import { Spinner } from "@arclayer/ui/spinner";

const USER_SEARCH_DEBOUNCE_MS = 250;
const USER_OPTION_PAGE_SIZE = 20;

function userLabel(user: FeedbackUser): string {
  return user.displayName || user.username || user.email || user.id;
}

export function FeedbackUserPicker(props: {
  id?: string;
  value: FeedbackUser | null;
  placeholder: string;
  clearLabel: string;
  disabled?: boolean;
  onChange: (user: FeedbackUser | null) => void;
}) {
  const { t } = useTranslation(["common", "platform"]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      USER_SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  const usersQuery = useQuery({
    queryKey: ["system", "feedback", "assignee-options", debouncedSearch] as const,
    enabled: open,
    queryFn: () =>
      listSystemDirectoryUsers({
        q: debouncedSearch || undefined,
        page: 1,
        size: USER_OPTION_PAGE_SIZE,
        isSuperAdmin: true,
        ordering: "username",
      }),
    retry: false,
    meta: { silent: true },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={props.id}
          type="button"
          variant="outline"
          className="w-full justify-between"
          disabled={props.disabled}
        >
          <span className="flex min-w-0 items-center gap-2">
            {props.value ? (
              <UserAvatar
                name={userLabel(props.value)}
                assetRef={props.value.avatarUrl}
                size={20}
              />
            ) : (
              <UserRoundX data-icon="inline-start" />
            )}
            <span className="truncate">
              {props.value ? userLabel(props.value) : props.placeholder}
            </span>
          </span>
          <ChevronsUpDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,90vw)] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            id="feedback-assignee-search"
            name="feedbackAssigneeSearch"
            value={search}
            aria-label={props.placeholder}
            placeholder={props.placeholder}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandGroup>
              <CommandItem
                value="unassigned"
                onSelect={() => {
                  props.onChange(null);
                  setOpen(false);
                }}
              >
                <UserRoundX />
                <span className="flex-1">{props.clearLabel}</span>
                {!props.value ? <Check /> : null}
              </CommandItem>
            </CommandGroup>

            {usersQuery.isLoading ? (
              <div className="flex justify-center py-6">
                <Spinner className="size-4 text-label-secondary" />
              </div>
            ) : usersQuery.error ? (
              <Alert variant="destructive" className="m-2 w-auto">
                <AlertDescription className="flex items-center justify-between gap-3">
                  <span>{t("common:REQUEST_FAILED")}</span>
                  <Button size="sm" variant="outline" onClick={() => void usersQuery.refetch()}>
                    {t("common:RETRY")}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <CommandEmpty>{t("platform:FEEDBACK_USER_EMPTY")}</CommandEmpty>
                <CommandGroup>
                  {(usersQuery.data?.items ?? []).map((user) => {
                    const option: FeedbackUser = {
                      id: user.userId,
                      email: user.email || null,
                      username: user.username || user.email || user.userId,
                      displayName: user.displayName ?? null,
                      avatarUrl: user.avatarUrl ?? null,
                      status: user.status,
                      isSuperAdmin: Boolean(user.isSuperAdmin),
                      lastLoginAt: user.lastLoginAt ?? null,
                      createdAt: user.createdAt,
                    };
                    return (
                      <CommandItem
                        key={user.userId}
                        value={user.userId}
                        onSelect={() => {
                          props.onChange(option);
                          setOpen(false);
                        }}
                      >
                        <UserAvatar
                          name={userLabel(option)}
                          assetRef={option.avatarUrl}
                          size={24}
                        />
                        <span className="min-w-0 flex-1 truncate">{userLabel(option)}</span>
                        {props.value?.id === user.userId ? <Check /> : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
