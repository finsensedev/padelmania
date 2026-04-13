import { useState } from "react";
import { useQuery } from "react-query";
import {
  BarChart,
  Download,
  Calendar,
  DollarSign,
  FileText,
  Users,
  CreditCard,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import { Badge } from "src/components/ui/badge";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import useNotification from "src/hooks/useNotification";
import { financeOfficerService } from "src/services/financeOfficer.service";
import { downloadBlob, defaultCsvName } from "src/utils/download";
import { useWithTwoFAExport } from "src/utils/withTwoFAExport";
import RangeSelect from "src/components/ui/RangeSelect";
import {
  type ExtendedRange,
  type CustomDateBounds,
  getExtendedRangeBounds,
  isRangeValid,
} from "src/utils/rangeUtils";
import { motion } from "framer-motion";

interface ReportData {
  id: string;
  name: string;
  type: "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
  dateRange: {
    from: string;
    to: string;
  };
  generatedAt: string;
  status: "GENERATING" | "READY" | "FAILED";
  fileSize?: string;
  downloadUrl?: string;
}

interface ReportMetrics {
  totalRevenue: number;
  totalTransactions: number;
  totalBookings: number;
  totalRefunds: number;
  averageTransactionValue: number;
  revenueChange: number;
  transactionChange: number;
  bookingChange: number;
}

type FoReportStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "READY"
  | "GENERATING";
interface FoReportItem {
  id: string;
  name: string;
  status: FoReportStatus;
  generatedAt?: string;
  fileSize?: string | number;
  downloadUrl?: string;
  range?: { from?: string; to?: string };
  dateRange?: { from: string; to: string };
  type?: string;
}
interface FoReportsResponse {
  reports: FoReportItem[];
  total?: number;
  page?: number;
  limit?: number;
}

export default function FinanceOfficerReports() {
  const { toaster } = useNotification();
  const with2FA = useWithTwoFAExport();
  const [range, setRange] = useState<ExtendedRange>("MONTH");
  const [customDates, setCustomDates] = useState<CustomDateBounds>({
    customFrom: "",
    customTo: "",
  });
  const [generatingReport, setGeneratingReport] = useState<string | null>(null);

  // Real metrics from FO endpoint
  const { data: metricsResp } = useQuery({
    queryKey: ["finance-report-metrics", range],
    queryFn: async () => {
      const { startDate, endDate } = getExtendedRangeBounds(range, customDates);
      return financeOfficerService.getReportMetrics({ startDate, endDate });
    },
    enabled: isRangeValid(range, customDates),
    keepPreviousData: true,
  });
  const metrics: ReportMetrics | undefined = metricsResp
    ? {
        totalRevenue: metricsResp.metrics.totalRevenue,
        totalTransactions: metricsResp.metrics.totalTransactions,
        totalBookings: metricsResp.metrics.totalBookings,
        totalRefunds: metricsResp.metrics.totalRefunds,
        averageTransactionValue: metricsResp.metrics.averageTransactionValue,
        revenueChange: metricsResp.metrics.revenueChange ?? 0,
        transactionChange: metricsResp.metrics.transactionChange ?? 0,
        bookingChange: metricsResp.metrics.bookingChange ?? 0,
      }
    : undefined;

  const { data: reports } = useQuery({
    queryKey: ["finance-reports", range],
    queryFn: async () => {
      const resp = (await financeOfficerService.getReports({
        page: 1,
        limit: 20,
      })) as FoReportsResponse;
      const formatBytes = (bytes: number) => {
        if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
        const units = ["B", "KB", "MB", "GB"];
        let i = 0;
        let n = bytes;
        while (n >= 1024 && i < units.length - 1) {
          n /= 1024;
          i++;
        }
        return `${n.toFixed(1)} ${units[i]}`;
      };
      return (resp.reports || []).map(
        (r: FoReportItem): ReportData => ({
          id: r.id,
          name: r.name,
          type: (r.type as ReportData["type"]) || "CUSTOM",
          dateRange: r.dateRange
            ? { from: r.dateRange.from, to: r.dateRange.to }
            : { from: new Date().toISOString(), to: new Date().toISOString() },
          generatedAt: r.generatedAt || new Date().toISOString(),
          status:
            r.status === "COMPLETED"
              ? "READY"
              : (r.status as ReportData["status"]) || "GENERATING",
          fileSize:
            typeof r.fileSize === "number"
              ? formatBytes(r.fileSize)
              : r.fileSize || undefined,
          downloadUrl: r.downloadUrl || undefined,
        }),
      );
    },
    keepPreviousData: true,
  });

  const handleGenerateReport = async (type: string) => {
    setGeneratingReport(type);

    const result = await with2FA(
      async (sessionToken) => {
        try {
          const { startDate, endDate } = getExtendedRangeBounds(
            range,
            customDates,
          );
          let blob: Blob | null = null;

          if (type === "REVENUE" || type === "TRANSACTIONS") {
            blob = await financeOfficerService.exportTransactions({
              startDate,
              endDate,
              sessionToken,
            });
          } else if (type === "BOOKINGS") {
            blob = await financeOfficerService.exportBookings({
              startDate,
              endDate,
              sessionToken,
            });
          } else if (type === "COMPREHENSIVE") {
            // For comprehensive report, export all data types
            // We'll export transactions which includes the most complete data
            blob = await financeOfficerService.exportTransactions({
              startDate,
              endDate,
              sessionToken,
            });
          }

          if (blob) {
            downloadBlob(blob, defaultCsvName(`${type.toLowerCase()}`));
            toaster("Report downloaded", { variant: "success" });
            return true;
          } else {
            toaster("No data to download", { variant: "warning" });
            return false;
          }
        } catch (error) {
          console.error("Report generation error:", error);
          toaster("Failed to generate report", { variant: "error" });
          return false;
        }
      },
      { cacheKey: `gen-${type}-${range}`, useResultCache: true },
    );

    // If result is undefined, 2FA was cancelled (no need to show additional error)
    setGeneratingReport(null);
    return result;
  };

  const handleDownloadReport = async (report: ReportData) => {
    const result = await with2FA(
      async (sessionToken) => {
        try {
          const { startDate, endDate } = getExtendedRangeBounds(
            range,
            customDates,
          );
          const name = report.name.toLowerCase();
          let blob: Blob | null = null;

          if (
            name.includes("transaction") ||
            name.includes("comprehensive") ||
            name.includes("full")
          ) {
            blob = await financeOfficerService.exportTransactions({
              startDate,
              endDate,
              sessionToken,
            });
            downloadBlob(blob, defaultCsvName("transactions"));
          } else if (name.includes("booking")) {
            blob = await financeOfficerService.exportBookings({
              startDate,
              endDate,
              sessionToken,
            });
            downloadBlob(blob, defaultCsvName("bookings"));
          } else if (name.includes("revenue")) {
            blob = await financeOfficerService.exportTransactions({
              startDate,
              endDate,
              sessionToken,
            });
            downloadBlob(blob, defaultCsvName("revenue"));
          } else {
            // Default to transactions for unknown report types
            blob = await financeOfficerService.exportTransactions({
              startDate,
              endDate,
              sessionToken,
            });
            downloadBlob(blob, defaultCsvName("report"));
          }

          if (blob) {
            toaster("Report downloaded", { variant: "success" });
            return true;
          } else {
            toaster("No data available", { variant: "warning" });
            return false;
          }
        } catch (error) {
          console.error("Download error:", error);
          toaster("Failed to download report", { variant: "error" });
          return false;
        }
      },
      { cacheKey: `dl-${report.id}`, useResultCache: true },
    );

    return result;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "READY":
        return "bg-green-100 text-green-800";
      case "GENERATING":
        return "bg-yellow-100 text-yellow-800";
      case "FAILED":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "DAILY":
        return "bg-blue-100 text-blue-800";
      case "WEEKLY":
        return "bg-purple-100 text-purple-800";
      case "MONTHLY":
        return "bg-orange-100 text-orange-800";
      case "QUARTERLY":
        return "bg-indigo-100 text-indigo-800";
      case "CUSTOM":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDateRange = (from: string, to: string) => {
    const fromDate = new Date(from).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const toDate = new Date(to).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${fromDate} - ${toDate}`;
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-3 md:p-6">
      {/* Header */}
      <motion.div
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Financial Reports
          </h1>
          <p className="text-muted-foreground text-xs md:text-sm">
            Generate and download comprehensive financial reports
          </p>
        </div>
        <RangeSelect
          value={range}
          onChange={setRange}
          customDates={customDates}
          onCustomDatesChange={setCustomDates}
          triggerClassName="w-32 md:w-40"
        />
      </motion.div>

      {/* Key Metrics Cards */}
      <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          whileHover={{ y: -4 }}
        >
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg hover:shadow-xl transition-shadow h-full">
            <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-white">
                Revenue
              </CardTitle>
              <DollarSign className="h-4 w-4 md:h-5 md:w-5 text-white/80" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-lg md:text-2xl font-bold text-white">
                KSh {metrics?.totalRevenue?.toLocaleString() || 0}
              </div>
              <p className="text-xs text-white/80 truncate">
                {metrics
                  ? `${
                      metrics.revenueChange >= 0 ? "+" : ""
                    }${metrics.revenueChange.toFixed(1)}% vs prev`
                  : "Selected period"}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          whileHover={{ y: -4 }}
        >
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-lg hover:shadow-xl transition-shadow h-full">
            <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-white">
                Transactions
              </CardTitle>
              <CreditCard className="h-4 w-4 md:h-5 md:w-5 text-white/80" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-lg md:text-2xl font-bold text-white">
                {metrics?.totalTransactions?.toLocaleString() || 0}
              </div>
              <p className="text-xs text-white/80 truncate">
                {metrics
                  ? `${
                      metrics.transactionChange >= 0 ? "+" : ""
                    }${metrics.transactionChange.toFixed(1)}% vs prev`
                  : "Selected period"}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          whileHover={{ y: -4 }}
        >
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg hover:shadow-xl transition-shadow h-full">
            <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-white">
                Bookings
              </CardTitle>
              <Calendar className="h-4 w-4 md:h-5 md:w-5 text-white/80" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-lg md:text-2xl font-bold text-white">
                {metrics?.totalBookings || 0}
              </div>
              <p className="text-xs text-white/80 truncate">
                {metrics
                  ? `${
                      metrics.bookingChange >= 0 ? "+" : ""
                    }${metrics.bookingChange.toFixed(1)}% vs prev`
                  : "Selected period"}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
          whileHover={{ y: -4 }}
          className="col-span-2 lg:col-span-1"
        >
          <Card className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg hover:shadow-xl transition-shadow h-full">
            <CardHeader className="relative z-10 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-white">
                Avg Value
              </CardTitle>
              <Users className="h-4 w-4 md:h-5 md:w-5 text-white/80" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-lg md:text-2xl font-bold text-white">
                KSh {metrics?.averageTransactionValue?.toFixed(2) || 0}
              </div>
              <p className="text-xs text-white/80">Per transaction</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Report Generation */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
              <FileText className="h-4 w-4 md:h-5 md:w-5" />
              Generate New Report
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Create financial reports for the selected period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="grid gap-2 md:gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={() => handleGenerateReport("REVENUE")}
                    disabled={generatingReport === "REVENUE"}
                    className="flex items-center justify-center gap-2 w-full"
                  >
                    <DollarSign className="w-4 h-4" />
                    <span className="text-xs md:text-sm">Revenue</span>
                  </Button>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={() => handleGenerateReport("TRANSACTIONS")}
                    disabled={generatingReport === "TRANSACTIONS"}
                    variant="outline"
                    className="flex items-center justify-center gap-2 w-full"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span className="text-xs md:text-sm">Transactions</span>
                  </Button>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={() => handleGenerateReport("BOOKINGS")}
                    disabled={generatingReport === "BOOKINGS"}
                    variant="outline"
                    className="flex items-center justify-center gap-2 w-full"
                  >
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs md:text-sm">Bookings</span>
                  </Button>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={() => handleGenerateReport("COMPREHENSIVE")}
                    disabled={generatingReport === "COMPREHENSIVE"}
                    variant="outline"
                    className="flex items-center justify-center gap-2 w-full"
                  >
                    <BarChart className="w-4 h-4" />
                    <span className="text-xs md:text-sm">Full Report</span>
                  </Button>
                </motion.div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Generated Reports */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6 }}
        whileHover={{ y: -4 }}
      >
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="text-lg md:text-xl">
              Generated Reports
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Previously generated financial reports available for download
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-2 md:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[150px]">Report Name</TableHead>
                    <TableHead className="min-w-[100px]">Type</TableHead>
                    <TableHead className="min-w-[150px]">Date Range</TableHead>
                    <TableHead className="min-w-[150px]">Generated</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                    <TableHead className="min-w-[80px]">Size</TableHead>
                    <TableHead className="text-right min-w-[120px]">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports?.map((report: ReportData, index: number) => (
                    <motion.tr
                      key={report.id}
                      className="border-b border-border hover:bg-muted/50 transition-colors"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.03 }}
                    >
                      <TableCell>
                        <p className="font-medium">{report.name}</p>
                      </TableCell>
                      <TableCell>
                        <Badge className={getTypeColor(report.type)}>
                          {report.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateRange(
                          report.dateRange.from,
                          report.dateRange.to,
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateTime(report.generatedAt)}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(report.status)}>
                          {/* Generating icon removed in simplified UI */}
                          {report.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {report.fileSize || "N/A"}
                      </TableCell>
                      <TableCell className="text-right">
                        {report.status === "READY" ? (
                          <motion.div
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadReport(report)}
                              className="text-xs"
                            >
                              <Download className="w-4 h-4 mr-1" />
                              <span className="hidden sm:inline">Download</span>
                            </Button>
                          </motion.div>
                        ) : report.status === "GENERATING" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled
                            className="text-xs"
                          >
                            <span className="hidden sm:inline">
                              Generating...
                            </span>
                            <span className="sm:hidden">...</span>
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled
                            className="text-xs"
                          >
                            Failed
                          </Button>
                        )}
                      </TableCell>
                    </motion.tr>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
