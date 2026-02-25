import { Pagination } from "antd";
import { type Table as ReactTable } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { DataTablePresenter } from "@/components/data-table";
import type { PageData } from "@/components/data-table";
import { cn } from "@/lib/utils";
import type { OrganizationMember } from "@/api/organization-members";

interface OrganizationMembersTableSectionProps {
  table: ReactTable<OrganizationMember>;
  pageData: PageData<OrganizationMember> | undefined;
  onPaginationChange: (nextPage: number, nextSize: number) => void;
}

export function OrganizationMembersTableSection({
  table,
  pageData,
  onPaginationChange,
}: OrganizationMembersTableSectionProps) {
  const { t } = useTranslation(["team"]);

  return (
    <>
      <DataTablePresenter
        table={table}
        emptyText={t("team:TEAM_EMPTY_TABLE")}
        rowClassName={(_row, rowIndex) =>
          cn(rowIndex % 2 === 1 ? "bg-muted/20" : "bg-card", "transition-colors hover:bg-muted/40")
        }
      />

      {pageData ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="text-label-secondary text-footnote">
            {t("team:TEAM_PAGINATION_TOTAL", {
              total: pageData.total,
              from: pageData.total ? (pageData.page - 1) * pageData.size + 1 : 0,
              to: Math.min(pageData.page * pageData.size, pageData.total),
            })}
          </div>
          <Pagination
            current={pageData.page}
            pageSize={pageData.size}
            total={pageData.total}
            showSizeChanger
            pageSizeOptions={[10, 20, 50, 100]}
            onChange={(nextPage, nextSize) => onPaginationChange(nextPage, nextSize)}
          />
        </div>
      ) : null}
    </>
  );
}
