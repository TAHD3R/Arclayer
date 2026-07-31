import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { formatNumber } from "@/monitoring/format";
import { getActivityTrend } from "@/monitoring/monitoring-api";
import {
  MonitoringPage,
  MonitoringQueryState,
  useMonitoringQuery,
} from "@/monitoring/monitoring-ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

export function MonitoringActivityPage() {
  const { t } = useTranslation("monitoring");
  const load = useCallback(() => getActivityTrend({ days: 30, metric: "auditEvents" }), []);
  const { state, retry } = useMonitoringQuery(load, []);
  return (
    <MonitoringPage description={t("ACTIVITY_DESCRIPTION")} title={t("ACTIVITY_TITLE")}>
      <MonitoringQueryState
        isEmpty={(data) => data.points.length === 0}
        retry={retry}
        state={state}
      >
        {(data) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("DATE")}</TableHead>
                <TableHead>{t("ACTIVITY_EVENTS")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.points.map((point) => (
                <TableRow key={point.date}>
                  <TableCell>{point.date}</TableCell>
                  <TableCell>{formatNumber(point.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </MonitoringQueryState>
    </MonitoringPage>
  );
}
