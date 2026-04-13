import { useState, useEffect } from "react";
import { useQuery } from "react-query";
import { auditService, type AuditLogItem } from "src/services/audit.service";
import type { PagedResult } from "src/services/audit.service";
import { format } from "date-fns";
import { Card, CardContent } from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import {
  RefreshCw,
  Download,
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import AuditLogModal from "src/components/admin/modals/AuditLogModal";
import useModal from "src/hooks/useModal";
import { Switch } from "src/components/ui/switch";
import { Label } from "src/components/ui/label";

export default function AdminAuditLogs() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [showReadActions, setShowReadActions] = useState(false);
  const { pushModal } = useModal();

  const query = useQuery<PagedResult<AuditLogItem>>({
    queryKey: [
      "audit-logs",
      {
        page,
        limit,
        search,
        action,
        entity,
        from: dateFrom,
        to: dateTo,
        includeRead: showReadActions,
      },
    ],
    queryFn: (): Promise<PagedResult<AuditLogItem>> =>
      auditService.list({
        page,
        limit,
        search: search || undefined,
        action: action || undefined,
        entity: entity || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        sortBy: "createdAt",
        sortOrder: "desc",
        includeRead: showReadActions,
      }),
  });

  const suppressedCount = query.data?.meta.suppressed ?? 0;
  const logs = query.data?.data ?? [];

  // Reset page to 1 if it exceeds totalPages
  useEffect(() => {
    const totalPages = query.data?.meta.totalPages ?? 1;
    if (page > totalPages && totalPages > 0) {
      setPage(1);
    }
  }, [query.data?.meta.totalPages, page]);

  const onExport = async () => {
    const blob = await auditService.exportCsv({
      search: search || undefined,
      action: action || undefined,
      entity: entity || undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
      includeRead: showReadActions,
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Audit Logs
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Monitor system activities and user actions
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            variant="outline"
            onClick={() => query.refetch()}
            className="flex-1 sm:flex-initial"
          >
            <RefreshCw className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button onClick={onExport} className="flex-1 sm:flex-initial">
            <Download className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>
      </div>

      <Card className="shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="space-y-4 p-4 sm:p-6">
          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search logs..."
                className="pl-10"
              />
            </div>
            <Input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="Filter by action"
            />
            <Input
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              placeholder="Filter by entity"
            />
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="pl-10"
                placeholder="From date"
              />
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="pl-10"
                placeholder="To date"
              />
            </div>
          </div>

          {/* Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
            <div className="flex items-center gap-3">
              <Switch
                id="show-read-actions"
                checked={showReadActions}
                onCheckedChange={(value) => {
                  setShowReadActions(Boolean(value));
                  setPage(1);
                }}
              />
              <Label
                htmlFor="show-read-actions"
                className="text-sm font-medium cursor-pointer"
              >
                Show read-only requests
              </Label>
            </div>
            {!showReadActions && suppressedCount > 0 && (
              <div className="text-xs sm:text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-md">
                Suppressed {suppressedCount} GET/HEAD logs. Toggle to show.
              </div>
            )}
          </div>

          <div className="border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <Table className="min-w-full">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="whitespace-nowrap font-semibold">
                      Time
                    </TableHead>
                    <TableHead className="w-[200px] max-w-[200px] font-semibold">
                      Action
                    </TableHead>
                    <TableHead className="whitespace-nowrap font-semibold">
                      Entity
                    </TableHead>
                    <TableHead className="w-[150px] max-w-[150px] font-semibold">
                      Entity ID
                    </TableHead>
                    <TableHead className="whitespace-nowrap font-semibold">
                      User
                    </TableHead>
                    <TableHead className="whitespace-nowrap font-semibold">
                      IP
                    </TableHead>
                    <TableHead className="w-[80px] font-semibold">
                      Details
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isLoading && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-muted-foreground"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span className="font-medium">
                            Loading audit logs...
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {query.isError && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-destructive"
                      >
                        <span className="font-medium">
                          Failed to load audit logs
                        </span>
                      </TableCell>
                    </TableRow>
                  )}
                  {!query.isLoading &&
                    logs.length === 0 &&
                    !showReadActions &&
                    suppressedCount > 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center py-8 text-muted-foreground"
                        >
                          <span className="font-medium">
                            All read-only logs are hidden. Enable "Show
                            read-only requests" to display them.
                          </span>
                        </TableCell>
                      </TableRow>
                    )}
                  {!query.isLoading &&
                    logs.length === 0 &&
                    (showReadActions || suppressedCount === 0) && (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center py-8 text-muted-foreground"
                        >
                          <span className="font-medium">
                            No audit logs found
                          </span>
                        </TableCell>
                      </TableRow>
                    )}

                  {logs.map((log: AuditLogItem) => (
                    <TableRow
                      key={log.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="whitespace-nowrap text-xs sm:text-sm">
                        {format(new Date(log.createdAt), "yyyy-MM-dd HH:mm:ss")}
                      </TableCell>
                      <TableCell className="font-medium w-[200px] max-w-[200px]">
                        <div
                          className="truncate cursor-pointer hover:text-primary transition-colors"
                          title={log.action}
                        >
                          {log.action}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium">
                          {log.entity}
                        </span>
                      </TableCell>
                      <TableCell className="w-[150px] max-w-[150px]">
                        <div
                          className="truncate cursor-pointer font-mono text-xs hover:text-primary transition-colors"
                          title={log.entityId}
                        >
                          {log.entityId}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="font-medium">
                          {log.user
                            ? `${log.user.firstName ?? ""} ${
                                log.user.lastName ?? ""
                              }`.trim() ||
                              log.user.email ||
                              log.user.id
                            : "System"}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {log.ipAddress ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            pushModal(<AuditLogModal selected={log} />)
                          }
                          className="hover:bg-primary hover:text-primary-foreground transition-colors"
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-t border-border bg-muted/30 rounded-b-xl">
            <div className="text-xs sm:text-sm text-muted-foreground font-medium">
              Page {query.data?.meta.page ?? page} of{" "}
              {query.data?.meta.totalPages ?? 1} • {query.data?.meta.total ?? 0}{" "}
              total logs
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                disabled={(query.data?.meta.page ?? page) <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex-1 sm:flex-initial"
              >
                <ChevronLeft className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Previous</span>
              </Button>
              <Select
                value={limit.toString()}
                onValueChange={(value) => {
                  setLimit(parseInt(value));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-24 sm:w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((n) => (
                    <SelectItem key={n} value={n.toString()}>
                      {n} per page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  (query.data?.meta.page ?? page) >=
                  (query.data?.meta.totalPages ?? 1)
                }
                onClick={() => setPage((p) => p + 1)}
                className="flex-1 sm:flex-initial"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="w-4 h-4 sm:ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
