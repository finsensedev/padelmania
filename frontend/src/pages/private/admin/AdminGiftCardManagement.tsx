/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useMemo, useState, memo } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { format } from "date-fns";
import {
  RefreshCw,
  PlusCircle,
  Loader2,
  Wallet,
  FileText,
  PiggyBank,
  Copy,
  Check,
  Gift,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Badge } from "src/components/ui/badge";
import adminGiftcardService, {
  type AdminGiftCard,
  type GiftCardLedgerEntry,
  type GiftCardStatus,
  type LedgerEntryType,
} from "src/services/adminGiftcard.service";
import useNotification from "src/hooks/useNotification";
import useModal from "src/hooks/useModal";
import useTwoFAPrompt from "src/hooks/useTwoFAPrompt";

// Constants
const STATUS_LABELS: Record<GiftCardStatus, string> = {
  ISSUED: "Issued",
  REDEEMED: "Redeemed",
  EXHAUSTED: "Exhausted",
  CANCELLED: "Cancelled",
};

const STATUS_BADGE_VARIANT: Record<
  GiftCardStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  ISSUED: "default",
  REDEEMED: "secondary",
  EXHAUSTED: "outline",
  CANCELLED: "destructive",
};

const PAGE_LIMIT = 20;
const LEDGER_LIMIT = 10;

const currencyFormatter = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 0,
});

// Utility functions
function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return format(date, "dd MMM yyyy HH:mm");
  } catch {
    return "—";
  }
}

function formatKES(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return currencyFormatter.format(Number(value));
}

function renderLedgerType(type: LedgerEntryType) {
  const types: Record<LedgerEntryType, string> = {
    CREDIT: "Credit",
    DEBIT: "Debit",
    ADJUSTMENT: "Adjustment",
  };
  return types[type] || type;
}

// Extracted Components
interface CopyCodeButtonProps {
  code: string;
  isCopied: boolean;
  onCopy: (code: string) => void;
}

const CopyCodeButton = memo(
  ({ code, isCopied, onCopy }: CopyCodeButtonProps) => (
    <button
      onClick={() => onCopy(code)}
      className="font-mono text-xs hover:text-foreground transition-colors flex items-center gap-1.5 group"
      title="Click to copy"
    >
      <span>{code}</span>
      {isCopied ? (
        <Check className="h-3 w-3 text-green-600" />
      ) : (
        <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  )
);
CopyCodeButton.displayName = "CopyCodeButton";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

const Pagination = memo(
  ({
    page,
    totalPages,
    total,
    limit,
    onPageChange,
    disabled,
  }: PaginationProps) => (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border">
      <span className="text-sm text-muted-foreground">
        Showing {(page - 1) * limit + 1} - {Math.min(page * limit, total)} of{" "}
        {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(page - 1, 1))}
          disabled={page === 1 || disabled}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(page + 1, totalPages))}
          disabled={page === totalPages || disabled}
        >
          Next
        </Button>
      </div>
    </div>
  )
);
Pagination.displayName = "Pagination";

interface LedgerTableProps {
  entries: GiftCardLedgerEntry[];
  isLoading?: boolean;
}

const LedgerTable = memo(({ entries, isLoading }: LedgerTableProps) => {
  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-primary" />
        <p className="text-sm">Loading ledger...</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <div className="p-4 bg-muted/30 rounded-full w-fit mx-auto mb-3">
          <FileText className="h-12 w-12 opacity-50" />
        </div>
        <p className="font-medium text-foreground">
          No ledger activity recorded yet
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile View */}
      <div className="block lg:hidden space-y-3">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="border border-border rounded-lg p-4 space-y-2 hover:shadow-md transition-shadow bg-card"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <Badge variant="outline" className="mb-2">
                  {renderLedgerType(entry.type as LedgerEntryType)}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {formatDate(entry.createdAt)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-lg">
                  {formatKES(entry.amount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Balance: {formatKES(entry.balanceAfter)}
                </p>
              </div>
            </div>
            {entry.note && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground mb-1">Note</p>
                <p className="text-sm">{entry.note}</p>
              </div>
            )}
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground mb-1">Performed By</p>
              <p className="text-sm">
                {entry.performedBy?.email || entry.performedByUserId || "—"}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop View */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-3 px-4 font-medium text-sm">When</th>
              <th className="pb-3 px-4 font-medium text-sm">Type</th>
              <th className="pb-3 px-4 font-medium text-sm text-right">
                Amount
              </th>
              <th className="pb-3 px-4 font-medium text-sm text-right">
                Balance After
              </th>
              <th className="pb-3 px-4 font-medium text-sm">Note</th>
              <th className="pb-3 px-4 font-medium text-sm">Performed By</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className="border-b last:border-0 border-border hover:bg-muted/30 transition-colors"
              >
                <td className="py-3 px-4 text-sm">
                  {formatDate(entry.createdAt)}
                </td>
                <td className="py-3 px-4 text-sm">
                  <Badge variant="outline">
                    {renderLedgerType(entry.type as LedgerEntryType)}
                  </Badge>
                </td>
                <td className="py-3 px-4 text-sm text-right font-medium">
                  {formatKES(entry.amount)}
                </td>
                <td className="py-3 px-4 text-sm text-right font-semibold">
                  {formatKES(entry.balanceAfter)}
                </td>
                <td className="py-3 px-4 text-sm text-muted-foreground">
                  {entry.note || "—"}
                </td>
                <td className="py-3 px-4 text-sm">
                  {entry.performedBy?.email || entry.performedByUserId || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
});
LedgerTable.displayName = "LedgerTable";

// Main Component
export default function AdminGiftCardManagement() {
  const queryClient = useQueryClient();
  const { toaster } = useNotification();
  const { pushModal } = useModal();
  const twoFAPrompt = useTwoFAPrompt();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<GiftCardStatus | "">("");
  const [activationFilter, setActivationFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [issueForm, setIssueForm] = useState({
    amount: "",
    currency: "KES",
    recipientEmail: "",
    message: "",
    expiresAt: "",
    assignToUserId: "",
    purchasedByUserId: "",
    code: "",
  });
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const copyToClipboard = useCallback(
    async (code: string) => {
      try {
        await navigator.clipboard.writeText(code);
        setCopiedCode(code);
        toaster(`Code ${code} copied to clipboard`, { variant: "success" });
        setTimeout(() => setCopiedCode(null), 2000);
      } catch {
        toaster("Failed to copy code", { variant: "error" });
      }
    },
    [toaster]
  );

  const toggleCardExpanded = useCallback((cardId: string) => {
    setExpandedCards((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        newSet.delete(cardId);
      } else {
        newSet.add(cardId);
      }
      return newSet;
    });
  }, []);

  const listQueryKey = useMemo(
    () => ["admin-giftcards", { page, search, statusFilter, activationFilter }],
    [page, search, statusFilter, activationFilter]
  );

  const {
    data: cardsResponse,
    isLoading,
    isFetching,
    refetch,
  } = useQuery(listQueryKey, async () => {
    const response = await adminGiftcardService.list({
      page,
      limit: PAGE_LIMIT,
      search: search.trim() || undefined,
      status: statusFilter || undefined,
      isActive:
        activationFilter === "all" ? undefined : activationFilter === "active",
    });
    return response;
  });

  const cards = cardsResponse?.data ?? [];
  const meta = cardsResponse?.meta;

  const issueMutation = useMutation(
    ({ payload, twoFACode }: { payload: any; twoFACode?: string }) =>
      adminGiftcardService.issue(payload, twoFACode),
    {
      onSuccess: (created) => {
        toaster(`Gift card ${created.code} issued successfully`, {
          variant: "success",
        });
        setIssueForm({
          amount: "",
          currency: "KES",
          recipientEmail: "",
          message: "",
          expiresAt: "",
          assignToUserId: "",
          purchasedByUserId: "",
          code: "",
        });
        queryClient.invalidateQueries("admin-giftcards");
      },
      onError: async (error: any, variables) => {
        const message =
          error?.response?.data?.message || "Failed to issue gift card";
        const code = error?.response?.data?.code;

        // Handle 2FA requirement
        if (
          code === "TWO_FACTOR_REQUIRED" ||
          code === "TWO_FACTOR_INVALID" ||
          code === "TWO_FACTOR_SESSION_INVALID" ||
          /two[- ]?factor|2fa/i.test(message) ||
          /code is required/i.test(message)
        ) {
          const twoFACode = await twoFAPrompt({
            title: "Authorize Gift Card Issuance",
            description:
              "Enter your 6-digit 2FA code to authorize issuing this gift card.",
            submitLabel: "Authorize",
          });

          if (!twoFACode) {
            toaster("Gift card issuance cancelled: 2FA code required", {
              variant: "error",
            });
            return;
          }

          try {
            const result = await adminGiftcardService.issue(
              variables.payload,
              twoFACode
            );
            toaster(`Gift card ${result.code} issued successfully`, {
              variant: "success",
            });
            setIssueForm({
              amount: "",
              currency: "KES",
              recipientEmail: "",
              message: "",
              expiresAt: "",
              assignToUserId: "",
              purchasedByUserId: "",
              code: "",
            });
            queryClient.invalidateQueries("admin-giftcards");
            return;
          } catch (retryErr: any) {
            const retryMsg =
              retryErr?.response?.data?.message ||
              "Failed to issue gift card after 2FA";
            toaster(retryMsg, { variant: "error" });
            return;
          }
        }

        toaster(message, { variant: "error" });
      },
    }
  );

  const revokeMutation = useMutation(
    ({
      id,
      note,
      twoFACode,
    }: {
      id: string;
      note?: string;
      twoFACode?: string;
    }) => adminGiftcardService.revoke(id, note ? { note } : {}, twoFACode),
    {
      onSuccess: (updated) => {
        toaster(`Gift card ${updated.code} revoked`, { variant: "success" });
        queryClient.invalidateQueries("admin-giftcards");
        queryClient.invalidateQueries(["admin-giftcard-ledger", updated.id]);
      },
      onError: async (error: any, variables) => {
        const message =
          error?.response?.data?.message || "Failed to revoke gift card";
        const code = error?.response?.data?.code;

        // Handle 2FA requirement
        if (
          code === "TWO_FACTOR_REQUIRED" ||
          code === "TWO_FACTOR_INVALID" ||
          code === "TWO_FACTOR_SESSION_INVALID" ||
          /two[- ]?factor|2fa/i.test(message) ||
          /code is required/i.test(message)
        ) {
          const twoFACode = await twoFAPrompt({
            title: "Authorize Gift Card Revocation",
            description:
              "Enter your 6-digit 2FA code to authorize revoking this gift card.",
            submitLabel: "Authorize",
          });

          if (!twoFACode) {
            toaster("Gift card revocation cancelled: 2FA code required", {
              variant: "error",
            });
            return;
          }

          try {
            const result = await adminGiftcardService.revoke(
              variables.id,
              variables.note ? { note: variables.note } : {},
              twoFACode
            );
            toaster(`Gift card ${result.code} revoked`, {
              variant: "success",
            });
            queryClient.invalidateQueries("admin-giftcards");
            queryClient.invalidateQueries(["admin-giftcard-ledger", result.id]);
            return;
          } catch (retryErr: any) {
            const retryMsg =
              retryErr?.response?.data?.message ||
              "Failed to revoke gift card after 2FA";
            toaster(retryMsg, { variant: "error" });
            return;
          }
        }

        toaster(message, { variant: "error" });
      },
    }
  );

  const handleIssueSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const numericAmount = Number(issueForm.amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        toaster("Amount must be greater than zero", { variant: "error" });
        return;
      }
      issueMutation.mutate({
        payload: {
          amount: numericAmount,
          currency: issueForm.currency || "KES",
          recipientEmail: issueForm.recipientEmail || undefined,
          message: issueForm.message || undefined,
          expiresAt: issueForm.expiresAt || undefined,
          assignToUserId: issueForm.assignToUserId || undefined,
          purchasedByUserId: issueForm.purchasedByUserId || undefined,
          code: issueForm.code || undefined,
        },
      });
    },
    [issueForm, issueMutation, toaster]
  );

  const handleRevoke = useCallback(
    (card: AdminGiftCard) => {
      const note = window.prompt(
        `Provide a note for revoking gift card ${card.code} (optional)`,
        "Gift card revoked"
      );
      if (note !== null) {
        revokeMutation.mutate({ id: card.id, note: note || undefined });
      }
    },
    [revokeMutation]
  );

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(event.target.value);
      setPage(1);
    },
    []
  );

  const handleStatusFilterChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setStatusFilter(event.target.value as GiftCardStatus | "");
      setPage(1);
    },
    []
  );

  const handleActivationFilterChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setActivationFilter(event.target.value as "all" | "active" | "inactive");
      setPage(1);
    },
    []
  );

  return (
    <div className="p-4 md:p-6 space-y-6 bg-background min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Gift Card Management
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Issue, adjust, revoke, and review ledger activity for gift cards
          </p>
        </div>
        <Button
          onClick={() => refetch()}
          variant="outline"
          size="sm"
          disabled={isFetching}
          className="transition-all"
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 transition-transform ${
              isFetching ? "animate-spin" : ""
            }`}
          />
          {isFetching ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {/* Issue New Gift Card */}
      <Card className="border-primary/20 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <PlusCircle className="h-5 w-5 text-primary" />
            </div>
            <CardTitle>Issue New Gift Card</CardTitle>
          </div>
          <CardDescription>
            Create a new gift card with custom parameters
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleIssueSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (KES)</Label>
                <Input
                  id="amount"
                  required
                  min={1}
                  type="number"
                  value={issueForm.amount}
                  onChange={(e) =>
                    setIssueForm((prev) => ({
                      ...prev,
                      amount: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Input
                  id="currency"
                  type="text"
                  value={issueForm.currency}
                  onChange={(e) =>
                    setIssueForm((prev) => ({
                      ...prev,
                      currency: e.target.value.toUpperCase(),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipientEmail">
                  Recipient Email (optional)
                </Label>
                <Input
                  id="recipientEmail"
                  type="email"
                  value={issueForm.recipientEmail}
                  onChange={(e) =>
                    setIssueForm((prev) => ({
                      ...prev,
                      recipientEmail: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="message">Message (optional)</Label>
                <Input
                  id="message"
                  type="text"
                  value={issueForm.message}
                  onChange={(e) =>
                    setIssueForm((prev) => ({
                      ...prev,
                      message: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiresAt">Expires At (optional)</Label>
                <Input
                  id="expiresAt"
                  type="datetime-local"
                  value={issueForm.expiresAt}
                  onChange={(e) =>
                    setIssueForm((prev) => ({
                      ...prev,
                      expiresAt: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assignToUserId">
                  Assign to User ID (optional)
                </Label>
                <Input
                  id="assignToUserId"
                  type="text"
                  value={issueForm.assignToUserId}
                  onChange={(e) =>
                    setIssueForm((prev) => ({
                      ...prev,
                      assignToUserId: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchasedByUserId">
                  Purchased By User ID (optional)
                </Label>
                <Input
                  id="purchasedByUserId"
                  type="text"
                  value={issueForm.purchasedByUserId}
                  onChange={(e) =>
                    setIssueForm((prev) => ({
                      ...prev,
                      purchasedByUserId: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Custom Code (optional)</Label>
                <Input
                  id="code"
                  type="text"
                  value={issueForm.code}
                  onChange={(e) =>
                    setIssueForm((prev) => ({
                      ...prev,
                      code: e.target.value.toUpperCase(),
                    }))
                  }
                />
              </div>
            </div>
            <div className="flex items-center justify-end pt-4">
              <Button
                type="submit"
                disabled={issueMutation.isLoading}
                className="bg-primary hover:bg-primary/90 transition-all"
              >
                {issueMutation.isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Issuing...
                  </>
                ) : (
                  <>
                    <PiggyBank className="h-4 w-4 mr-2" />
                    Issue Gift Card
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Filters and Gift Cards List */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-accent/10 rounded-lg">
              <Gift className="h-5 w-5 text-accent" />
            </div>
            <div>
              <CardTitle>Gift Cards</CardTitle>
              <CardDescription>
                Search, filter and manage all gift cards
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                type="search"
                placeholder="Code, email, message..."
                value={search}
                onChange={handleSearchChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="statusFilter">Status</Label>
              <select
                id="statusFilter"
                className="flex h-10 w-full rounded-md border  border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={statusFilter}
                onChange={handleStatusFilterChange}
              >
                <option value="">All statuses</option>
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="activationFilter">Active State</Label>
              <select
                id="activationFilter"
                className="flex h-10 w-full rounded-md border  border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={activationFilter}
                onChange={handleActivationFilterChange}
              >
                <option value="all">All cards</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>
            </div>
          </div>

          {meta && (
            <div className="text-sm text-muted-foreground">
              Page {meta.page} of {meta.totalPages} · {meta.total} total
            </div>
          )}

          {/* Loading State */}
          {isLoading && cards.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-primary" />
              <p className="text-sm">Loading gift cards...</p>
            </div>
          ) : cards.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="p-4 bg-muted/30 rounded-full w-fit mx-auto mb-3">
                <Gift className="h-12 w-12 opacity-50" />
              </div>
              <p className="font-medium text-foreground">No gift cards found</p>
              <p className="text-sm mt-1">
                Try adjusting your filters or issue a new gift card
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="block lg:hidden space-y-4">
                {cards.map((card) => {
                  const isExpanded = expandedCards.has(card.id);
                  return (
                    <div
                      key={card.id}
                      className="border border-border rounded-lg p-4 space-y-3 hover:shadow-md transition-shadow bg-card"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <CopyCodeButton
                          code={card.code}
                          isCopied={copiedCode === card.code}
                          onCopy={copyToClipboard}
                        />
                        <Badge variant={STATUS_BADGE_VARIANT[card.status]}>
                          {STATUS_LABELS[card.status]}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Balance
                          </p>
                          <p className="font-semibold text-sm">
                            {formatKES(card.balance)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Original
                          </p>
                          <p className="font-medium text-sm">
                            {formatKES(card.amount)}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => toggleCardExpanded(card.id)}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-full justify-center py-2 border-t border-border"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="h-4 w-4" />
                            Hide Details
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4" />
                            Show Details
                          </>
                        )}
                      </button>

                      {isExpanded && (
                        <div className="space-y-3 pt-3 border-border border-t">
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <p className="text-muted-foreground mb-1">
                                Recipient
                              </p>
                              <p className="break-words">
                                {card.recipientEmail || "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground mb-1">
                                Expires
                              </p>
                              <p className="break-words">
                                {formatDate(card.expiresAt)}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground mb-1">
                                Purchased By
                              </p>
                              <p className="break-words">
                                {card.purchasedBy?.email || "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground mb-1">
                                Redeemed By
                              </p>
                              <p className="break-words">
                                {card.redeemedBy?.email || "—"}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 pt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                pushModal(<AdjustGiftCardModal card={card} />)
                              }
                              className="hover:bg-primary/10 hover:text-primary hover:border-primary transition-colors"
                            >
                              <Wallet className="h-3 w-3 mr-1" />
                              Adjust
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                pushModal(<LedgerEntryModal card={card} />)
                              }
                              className=" hover:opacity-60 "
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              View Ledger
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRevoke(card)}
                              disabled={
                                card.status === "CANCELLED" ||
                                card.status === "EXHAUSTED"
                              }
                              title={
                                card.status === "EXHAUSTED"
                                  ? "Cannot revoke exhausted gift card"
                                  : card.status === "CANCELLED"
                                  ? "Already cancelled"
                                  : "Revoke gift card"
                              }
                              className="transition-all"
                            >
                              Revoke
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-border border-b text-left">
                      <th className="pb-3 px-4 font-medium text-sm">Code</th>
                      <th className="pb-3 px-4 font-medium text-sm">Status</th>
                      <th className="pb-3 px-4 font-medium text-sm text-right">
                        Balance
                      </th>
                      <th className="pb-3 px-4 font-medium text-sm">
                        Recipient
                      </th>
                      <th className="pb-3 px-4 font-medium text-sm">
                        Purchased By
                      </th>
                      <th className="pb-3 px-4 font-medium text-sm">Expires</th>
                      <th className="pb-3 px-4 font-medium text-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cards.map((card) => (
                      <tr
                        key={card.id}
                        className="border-border border-b last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <CopyCodeButton
                            code={card.code}
                            isCopied={copiedCode === card.code}
                            onCopy={copyToClipboard}
                          />
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={STATUS_BADGE_VARIANT[card.status]}>
                            {STATUS_LABELS[card.status]}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex flex-col">
                            <span className="font-semibold">
                              {formatKES(card.balance)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              of {formatKES(card.amount)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm">
                          <div className="flex flex-col">
                            <span>{card.recipientEmail || "—"}</span>
                            {card.message && (
                              <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {card.message}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {card.purchasedBy?.email || "—"}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {formatDate(card.expiresAt)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                pushModal(<AdjustGiftCardModal card={card} />)
                              }
                              className="hover:bg-primary/10 hover:text-primary hover:border-primary transition-colors"
                            >
                              Adjust
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                pushModal(<LedgerEntryModal card={card} />)
                              }
                              className="hover:opacity-60"
                            >
                              View Ledger
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRevoke(card)}
                              disabled={
                                card.status === "CANCELLED" ||
                                card.status === "EXHAUSTED"
                              }
                              title={
                                card.status === "EXHAUSTED"
                                  ? "Cannot revoke exhausted gift card"
                                  : card.status === "CANCELLED"
                                  ? "Already cancelled"
                                  : "Revoke gift card"
                              }
                              className="transition-all"
                            >
                              Revoke
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              limit={meta.limit}
              onPageChange={setPage}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Modal Components
const AdjustGiftCardModal = memo(({ card }: { card: AdminGiftCard }) => {
  const { popModal } = useModal();
  const { toaster } = useNotification();
  const queryClient = useQueryClient();
  const twoFAPrompt = useTwoFAPrompt();
  const [adjustForm, setAdjustForm] = useState({
    direction: "DEBIT" as "CREDIT" | "DEBIT",
    amount: "",
    note: "",
  });

  const adjustMutation = useMutation(
    ({
      id,
      payload,
      twoFACode,
    }: {
      id: string;
      payload: { direction: "CREDIT" | "DEBIT"; amount: number; note?: string };
      twoFACode?: string;
    }) => adminGiftcardService.adjust(id, payload, twoFACode),
    {
      onSuccess: (updated) => {
        toaster(`Gift card ${updated.code} updated`, { variant: "success" });
        queryClient.invalidateQueries("admin-giftcards");
        queryClient.invalidateQueries(["admin-giftcard-ledger", updated.id]);
        popModal();
      },
      onError: async (error: any, variables) => {
        const message =
          error?.response?.data?.message || "Failed to adjust gift card";
        const code = error?.response?.data?.code;

        // Handle 2FA requirement
        if (
          code === "TWO_FACTOR_REQUIRED" ||
          code === "TWO_FACTOR_INVALID" ||
          code === "TWO_FACTOR_SESSION_INVALID" ||
          /two[- ]?factor|2fa/i.test(message) ||
          /code is required/i.test(message)
        ) {
          const twoFACode = await twoFAPrompt({
            title: "Authorize Gift Card Adjustment",
            description:
              "Enter your 6-digit 2FA code to authorize this adjustment.",
            submitLabel: "Authorize",
          });

          if (!twoFACode) {
            toaster("Adjustment cancelled: 2FA code required", {
              variant: "error",
            });
            return;
          }

          try {
            const result = await adminGiftcardService.adjust(
              variables.id,
              variables.payload,
              twoFACode
            );
            toaster(`Gift card ${result.code} updated`, {
              variant: "success",
            });
            queryClient.invalidateQueries("admin-giftcards");
            queryClient.invalidateQueries(["admin-giftcard-ledger", result.id]);
            popModal();
            return;
          } catch (retryErr: any) {
            const retryMsg =
              retryErr?.response?.data?.message ||
              "Failed to adjust gift card after 2FA";
            toaster(retryMsg, { variant: "error" });
            return;
          }
        }

        toaster(message, { variant: "error" });
      },
    }
  );

  const handleAdjustSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const numericAmount = Number(adjustForm.amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        toaster("Adjustment amount must be greater than zero", {
          variant: "error",
        });
        return;
      }
      adjustMutation.mutate({
        id: card.id,
        payload: {
          direction: adjustForm.direction,
          amount: numericAmount,
          note: adjustForm.note || undefined,
        },
      });
    },
    [card.id, adjustForm, adjustMutation, toaster]
  );

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="bg-card rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-border shadow-lg mx-2 sm:mx-0"
    >
      <Card className="border-0 shadow-none pt-0 mt-0">
        <CardHeader className="bg-warning/10 border-b border-warning/20 p-4 sm:p-6">
          <div className="flex items-start sm:items-center justify-between gap-2">
            <div className="flex items-start sm:items-center gap-2 flex-1 min-w-0">
              <div className="p-1.5 sm:p-2 bg-warning/20 rounded-lg shrink-0">
                <Wallet className="h-4 w-4 sm:h-5 sm:w-5 text-warning" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-foreground text-base sm:text-lg truncate">
                  Adjust Gift Card
                </CardTitle>
                <p className="text-xs sm:text-sm font-mono text-muted-foreground mt-0.5 truncate">
                  {card.code}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => popModal()}
              className="shrink-0 h-8 w-8 p-0 sm:h-auto sm:w-auto sm:px-3"
            >
              <span className="hidden sm:inline">Cancel</span>
              <span className="sm:hidden text-lg">✕</span>
            </Button>
          </div>
          <CardDescription className="mt-2 text-xs sm:text-sm">
            Current balance: {formatKES(card.balance)} · Status:{" "}
            {STATUS_LABELS[card.status]}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <form
            onSubmit={handleAdjustSubmit}
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="space-y-2">
              <Label htmlFor="direction" className="text-sm">
                Direction
              </Label>
              <select
                id="direction"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={adjustForm.direction}
                onChange={(e) =>
                  setAdjustForm((prev) => ({
                    ...prev,
                    direction: e.target.value as "CREDIT" | "DEBIT",
                  }))
                }
              >
                <option value="CREDIT">Credit (increase balance)</option>
                <option value="DEBIT">Debit (reduce balance)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjustAmount" className="text-sm">
                Amount
              </Label>
              <Input
                id="adjustAmount"
                type="number"
                min={1}
                required
                value={adjustForm.amount}
                onChange={(e) =>
                  setAdjustForm((prev) => ({ ...prev, amount: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="adjustNote" className="text-sm">
                Note (optional)
              </Label>
              <Input
                id="adjustNote"
                type="text"
                value={adjustForm.note}
                onChange={(e) =>
                  setAdjustForm((prev) => ({ ...prev, note: e.target.value }))
                }
              />
            </div>
            <div className="sm:col-span-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 pt-2">
              <Button
                type="submit"
                disabled={adjustMutation.isLoading}
                className="bg-warning hover:bg-warning/90 text-warning-foreground transition-all w-full sm:w-auto"
              >
                {adjustMutation.isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <Wallet className="h-4 w-4 mr-2" />
                    Apply Adjustment
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => popModal()}
                disabled={adjustMutation.isLoading}
                className="transition-colors w-full sm:w-auto"
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
});
AdjustGiftCardModal.displayName = "AdjustGiftCardModal";

const LedgerEntryModal = memo(({ card }: { card: AdminGiftCard }) => {
  const { popModal } = useModal();
  const [ledgerPage, setLedgerPage] = useState(1);

  const ledgerQueryKey = useMemo(
    () => ["admin-giftcard-ledger", card.id, ledgerPage],
    [card.id, ledgerPage]
  );

  const { data: ledgerResponse, isFetching: isLedgerFetching } = useQuery(
    ledgerQueryKey,
    () =>
      adminGiftcardService.ledger(card.id, {
        page: ledgerPage,
        limit: LEDGER_LIMIT,
      }),
    { keepPreviousData: true }
  );

  const ledgerEntries = ledgerResponse?.data ?? [];
  const ledgerMeta = ledgerResponse?.meta;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="bg-card rounded-lg w-full max-w-5xl max-h-[90vh] overflow-y-auto border border-border shadow-lg mx-2 sm:mx-0"
    >
      <Card className="border-0 shadow-none">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex items-start sm:items-center justify-between gap-2">
            <div className="flex items-start sm:items-center gap-2 flex-1 min-w-0">
              <div className="p-1.5 sm:p-2 bg-accent/10 rounded-lg shrink-0">
                <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base sm:text-lg truncate">
                  Ledger · {card.code}
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm mt-1">
                  Balance {formatKES(card.balance)} · Created{" "}
                  {formatDate(card.createdAt)}
                </CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => popModal()}
              className="hover:bg-muted transition-colors shrink-0 h-8 w-8 p-0 sm:h-auto sm:w-auto sm:px-3"
            >
              <span className="hidden sm:inline">Close</span>
              <span className="sm:hidden text-lg">✕</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          <LedgerTable
            entries={ledgerEntries}
            isLoading={isLedgerFetching && ledgerEntries.length === 0}
          />

          {ledgerMeta && ledgerMeta.totalPages > 1 && (
            <Pagination
              page={ledgerMeta.page}
              totalPages={ledgerMeta.totalPages}
              total={ledgerMeta.total}
              limit={ledgerMeta.limit}
              onPageChange={setLedgerPage}
              disabled={isLedgerFetching}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
});
LedgerEntryModal.displayName = "LedgerEntryModal";
