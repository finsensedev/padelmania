import { useState } from "react";
import { useQuery } from "react-query";
import paymentService from "src/services/payment.service";
import { format } from "date-fns";
import { Card } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Button } from "src/components/ui/button";
import { Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

interface RefundTx {
  id: string;
  transactionId: string;
  providerRef?: string | null;
  amount: number;
  refundAmount?: number | null;
  refundedAt?: string | null;
  refundReason?: string | null;
  status: string;
  createdAt: string;
  user?: { email?: string | null } | null;
  booking?: { court?: { name: string }; startTime?: string } | null;
}

export default function PaymentsRefundsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery(["refunds", page, search], () =>
    paymentService.listTransactions({
      page,
      limit: 25,
      search: search || undefined,
      status: "REFUNDED",
    })
  );

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background h-full overflow-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Refunds</h1>
          <p className="text-muted-foreground">
            View all refunded transactions and their details
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search receipt/email"
            className="pl-10 w-64"
          />
        </div>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  Transaction ID
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  Receipt
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  User
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  Court
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  Slot
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  Amount Paid
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  Refunded
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  Refunded At
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr>
                  <td
                    colSpan={9}
                    className="p-6 text-center text-muted-foreground"
                  >
                    <div className="flex items-center justify-center">
                      <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                      Loading refunds...
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && data?.data?.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="p-6 text-center text-muted-foreground"
                  >
                    No refunds found
                  </td>
                </tr>
              )}
              {data?.data?.map((tx: RefundTx) => (
                <tr key={tx.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-mono">
                    {tx.transactionId}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {tx.providerRef ? (
                      <span className="font-mono text-muted-foreground">
                        {tx.providerRef}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">{tx.user?.email || "—"}</td>
                  <td className="px-4 py-3 text-sm">
                    {tx.booking?.court?.name || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {tx.booking?.startTime
                      ? format(new Date(tx.booking.startTime), "MMM d, HH:mm")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold">
                    KSH {tx.amount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-destructive">
                    KSH {tx.refundAmount?.toFixed(2) || "0.00"}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {tx.refundedAt
                      ? format(new Date(tx.refundedAt), "MMM d, yyyy HH:mm")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm max-w-[200px] truncate">
                    {tx.refundReason ? (
                      <span title={tx.refundReason}>{tx.refundReason}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.meta && (
          <div className="flex items-center justify-between p-4 border-t border-border bg-muted/50">
            <div className="text-sm text-muted-foreground">
              Page {data.meta.page} of {data.meta.totalPages} •{" "}
              {data.meta.total} total refunds
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={data.meta.page >= data.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <div className="text-sm text-muted-foreground bg-white dark:bg-muted/50 p-4 rounded-lg border border-border">
        <p>
          <strong>Note:</strong> Refund actions require 2FA authentication and
          automatically restore court availability.
        </p>
      </div>
    </div>
  );
}
