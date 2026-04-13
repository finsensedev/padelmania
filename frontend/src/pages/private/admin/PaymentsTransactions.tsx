import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import paymentService from "src/services/payment.service";
import useTwoFASession from "src/hooks/useTwoFASession";
import useNotification from "src/hooks/useNotification";
import { format } from "date-fns";
import { Card } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Button } from "src/components/ui/button";
import { Badge } from "src/components/ui/badge";
import { Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

interface CourtLite {
  id: string;
  name: string;
}
interface BookingLite {
  id: string;
  code?: string;
  court?: CourtLite | null;
  startTime?: string;
  endTime?: string;
  status: string;
}
interface UserLite {
  id: string;
  email?: string | null;
  name?: string;
  role?: string;
}
interface PaymentTx {
  id: string;
  transactionId: string;
  providerRef?: string | null;
  amount: number;
  status: string;
  method?: string;
  provider?: string;
  createdAt: string;
  booking?: BookingLite | null;
  user?: UserLite | null;
  metadata?: {
    voucher?: {
      code?: string;
      discount?: number;
    };
    giftcard?: {
      code?: string;
      applied?: number;
    };
  };
}
interface TransactionRowProps {
  tx: PaymentTx;
  onRefund: (id: string) => void;
}

const getStatusVariant = (
  status: string
): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "COMPLETED":
      return "default";
    case "PENDING":
      return "secondary";
    case "FAILED":
    case "CANCELLED":
      return "destructive";
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return "outline";
    default:
      return "outline";
  }
};

const TransactionRow = ({ tx, onRefund }: TransactionRowProps) => {
  const voucherDiscount = tx.metadata?.voucher?.discount || 0;
  const voucherCode = tx.metadata?.voucher?.code;
  const giftCardAmount = tx.metadata?.giftcard?.applied || 0;
  const giftCardCode = tx.metadata?.giftcard?.code;

  // For gift card only payments (provider=INTERNAL, method=WALLET),
  // the amount field contains the gift card amount, not M-Pesa amount
  const isGiftCardOnly = tx.provider === "INTERNAL" && tx.method === "WALLET";
  const mpesaAmount = isGiftCardOnly ? 0 : tx.amount;

  // Check if there are any discounts/credits applied
  const hasBreakdown = voucherDiscount > 0 || giftCardAmount > 0;
  const subtotal = hasBreakdown
    ? mpesaAmount + voucherDiscount + giftCardAmount
    : mpesaAmount;

  // Check if the game has already been played (booking end time has passed)
  const isGamePlayed = tx.booking?.endTime
    ? new Date(tx.booking.endTime) < new Date()
    : false;

  return (
    <tr className="hover:bg-muted/50 transition-colors">
      <td className="px-4 py-3 text-sm font-mono">{tx.transactionId}</td>
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
      <td className="px-4 py-3 text-sm">{tx.booking?.court?.name || "—"}</td>
      <td className="px-4 py-3 text-sm">
        {tx.booking?.startTime
          ? format(new Date(tx.booking.startTime), "MMM d, HH:mm")
          : "—"}
      </td>
      <td className="px-4 py-3 text-sm">
        {hasBreakdown ? (
          <div className="space-y-0.5">
            <div className="font-semibold">KSH {subtotal.toFixed(2)}</div>
            {voucherDiscount > 0 && (
              <div className="text-xs text-emerald-600">
                - Voucher {voucherCode ? `(${voucherCode})` : ""}: KSH{" "}
                {voucherDiscount.toFixed(2)}
              </div>
            )}
            {giftCardAmount > 0 && (
              <div className="text-xs text-emerald-600">
                - Gift Card {giftCardCode ? `(${giftCardCode})` : ""}: KSH{" "}
                {giftCardAmount.toFixed(2)}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              M-Pesa: KSH {mpesaAmount.toFixed(2)}
            </div>
          </div>
        ) : (
          <div className="font-semibold">KSH {mpesaAmount.toFixed(2)}</div>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        <Badge variant={getStatusVariant(tx.status)}>
          {tx.status.replace("_", " ")}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {format(new Date(tx.createdAt), "MMM d, yyyy HH:mm")}
      </td>
      <td className="px-4 py-3 text-sm text-right">
        {(tx.status === "COMPLETED" || tx.status === "PARTIALLY_REFUNDED") &&
        tx.providerRef &&
        !isGamePlayed ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRefund(tx.id)}
            className="text-primary hover:text-primary/80"
          >
            Refund
          </Button>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
};

export default function PaymentsTransactionsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const { obtainSession } = useTwoFASession();
  const { toaster } = useNotification();
  const qc = useQueryClient();

  const { data, isLoading, isFetching } = useQuery(
    ["payments", page, search, status],
    () =>
      paymentService.listTransactions({
        page,
        limit: 25,
        search: search || undefined,
        status: status || undefined,
      }),
    { keepPreviousData: true }
  );

  const refundMutation = useMutation(
    async (paymentId: string) => {
      const session = await obtainSession("permissions");
      if (!session) {
        throw new Error("2FA_CANCELLED");
      }
      return paymentService.refundPayment(paymentId, {
        sessionToken: session,
      });
    },
    {
      onSuccess: (result) => {
        if (result === undefined) return;
        toaster("Refund processed", { variant: "success" });
        qc.invalidateQueries("payments");
      },
      onError: (e: unknown) => {
        if (e instanceof Error && e.message === "2FA_CANCELLED") {
          return;
        }
        const msg = e instanceof Error ? e.message : "Refund failed";
        toaster(msg, { variant: "error" });
      },
    }
  );

  const onRefund = (id: string) => {
    refundMutation.mutate(id);
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background h-full overflow-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Transactions</h1>
          <p className="text-muted-foreground">
            Manage and view all payment transactions
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search user/email/receipt"
              className="pl-10 w-64"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">All Status</option>
            <option value="COMPLETED">Completed</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="REFUNDED">Refunded</option>
            {/* <option value="PARTIALLY_REFUNDED">Partial</option> */}
          </select>
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
                  Amount
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  Created
                </th>
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                  Actions
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
                      Loading transactions...
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
                    No transactions found
                  </td>
                </tr>
              )}
              {data?.data?.map((tx: PaymentTx) => (
                <TransactionRow key={tx.id} tx={tx} onRefund={onRefund} />
              ))}
            </tbody>
          </table>
        </div>
        {data?.meta && (
          <div className="flex items-center justify-between p-4 border-t border-border bg-muted/50">
            <div className="text-sm text-muted-foreground">
              Page {data.meta.page} of {data.meta.totalPages} •{" "}
              {data.meta.total} total transactions
              {isFetching && (
                <span className="ml-2">
                  <RefreshCw className="w-3 h-3 animate-spin inline mr-1" />
                  Refreshing...
                </span>
              )}
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
    </div>
  );
}
