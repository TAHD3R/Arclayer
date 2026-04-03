"use client";

import * as React from "react";

import type { Locale } from "date-fns";

type DateNodeLocalization = {
  calendarLocale?: Locale;
  clearLabel: string;
  formatLabel: (value?: string) => string;
  toCalendarDate: (value?: string) => Date | undefined;
  toStoredDate: (date?: Date) => string | undefined;
};

function isSameDay(left: Date, right: Date) {
  return (
    left.getDate() === right.getDate() &&
    left.getMonth() === right.getMonth() &&
    left.getFullYear() === right.getFullYear()
  );
}

const defaultDateNodeLocalization: DateNodeLocalization = {
  clearLabel: "Clear",
  formatLabel(value) {
    if (!value) return "Pick a date";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    if (isSameDay(date, today)) return "Today";
    if (isSameDay(date, yesterday)) return "Yesterday";
    if (isSameDay(date, tomorrow)) return "Tomorrow";

    return date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  },
  toCalendarDate(value) {
    if (!value) return undefined;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;

    return date;
  },
  toStoredDate(date) {
    if (!date) return undefined;
    return date.toISOString();
  },
};

const DateNodeLocalizationContext = React.createContext<DateNodeLocalization>(
  defaultDateNodeLocalization,
);

export function DateNodeLocalizationProvider(props: {
  children: React.ReactNode;
  value: DateNodeLocalization;
}) {
  return (
    <DateNodeLocalizationContext.Provider value={props.value}>
      {props.children}
    </DateNodeLocalizationContext.Provider>
  );
}

export function useDateNodeLocalization() {
  return React.useContext(DateNodeLocalizationContext);
}

export type { DateNodeLocalization };
