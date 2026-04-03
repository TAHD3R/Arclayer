"use client";

import * as React from "react";

import { useTranslation } from "react-i18next";

import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { resolveDateFnsLocale } from "@/lib/time/date-fns-locale";
import { DateNodeLocalizationProvider, type DateNodeLocalization } from "@arclayer/ui/editor";
import {
  getDateKeyInTimeZone,
  zonedDateKeyToIso,
} from "./content-library-article-editor-date-localization";

function parseDateKey(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  return {
    day: Number(day),
    month: Number(month),
    year: Number(year),
  };
}

function getRelativeDateKey(params: { offsetDays: number; timeZone: string }) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + params.offsetDays);
  return getDateKeyInTimeZone(date, params.timeZone);
}

export function ContentLibraryArticleEditorDateLocalizationProvider(props: {
  children: React.ReactNode;
  workspaceId: string;
}) {
  const { t } = useTranslation("content");
  const formatter = useAdminDateTimeFormatter({ workspaceId: props.workspaceId });

  const localization = React.useMemo<DateNodeLocalization>(() => {
    const timeZone = formatter.localization.timeZone;

    return {
      calendarLocale: resolveDateFnsLocale(formatter.localization.locale),
      clearLabel: t("CONTENT_LIBRARY_EDITOR_DATE_CLEAR"),
      formatLabel(value) {
        if (!value) return t("CONTENT_LIBRARY_EDITOR_DATE_PICK");

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;

        const dateKey = getDateKeyInTimeZone(date, timeZone);
        if (dateKey === getRelativeDateKey({ offsetDays: 0, timeZone })) {
          return t("CONTENT_LIBRARY_EDITOR_DATE_TODAY");
        }
        if (dateKey === getRelativeDateKey({ offsetDays: -1, timeZone })) {
          return t("CONTENT_LIBRARY_EDITOR_DATE_YESTERDAY");
        }
        if (dateKey === getRelativeDateKey({ offsetDays: 1, timeZone })) {
          return t("CONTENT_LIBRARY_EDITOR_DATE_TOMORROW");
        }

        return formatter.formatDate(value, { emptyValue: t("CONTENT_LIBRARY_EDITOR_DATE_PICK") });
      },
      toCalendarDate(value) {
        if (!value) return undefined;

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return undefined;

        const parts = parseDateKey(getDateKeyInTimeZone(date, timeZone));
        if (!parts) return undefined;

        return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0);
      },
      toStoredDate(date) {
        if (!date) return undefined;

        const dateKey = [
          String(date.getFullYear()).padStart(4, "0"),
          String(date.getMonth() + 1).padStart(2, "0"),
          String(date.getDate()).padStart(2, "0"),
        ].join("-");

        return zonedDateKeyToIso(dateKey, timeZone);
      },
    };
  }, [formatter, t]);

  return (
    <DateNodeLocalizationProvider value={localization}>
      {props.children}
    </DateNodeLocalizationProvider>
  );
}
