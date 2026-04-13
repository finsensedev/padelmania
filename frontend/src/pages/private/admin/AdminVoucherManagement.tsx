/* eslint-disable @typescript-eslint/no-explicit-any */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  Edit3,
  Eye,
  CheckCircle2,
  Ban,
  Loader2,
  PlusCircle,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import voucherService, { type Voucher } from "src/services/voucher.service";
import useNotification from "src/hooks/useNotification";
import useModal from "src/hooks/useModal";
import useWithTwoFA from "src/hooks/useWithTwoFA";

type VoucherStatus =
  | "ACTIVE"
  | "SCHEDULED"
  | "EXPIRED"
  | "DISABLED"
  | "EXHAUSTED";

type FormState = {
  code: string;
  type: "AMOUNT" | "PERCENTAGE";
  value: string;
  startsAt: string;
  expiresAt: string;
  usageLimit: string;
};

const initialForm: FormState = {
  code: "",
  type: "AMOUNT",
  value: "",
  startsAt: "",
  expiresAt: "",
  usageLimit: "",
};

const STATUS_META: Record<VoucherStatus, { label: string; className: string }> =
  {
    ACTIVE: {
      label: "Active",
      className: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    },
    SCHEDULED: {
      label: "Scheduled",
      className: "bg-blue-100 text-blue-600 border border-blue-200",
    },
    EXPIRED: {
      label: "Expired",
      className: "bg-gray-200 text-gray-600 border border-gray-300",
    },
    DISABLED: {
      label: "Disabled",
      className: "bg-slate-200 text-slate-600 border border-slate-300",
    },
    EXHAUSTED: {
      label: "Exhausted",
      className: "bg-amber-100 text-amber-700 border border-amber-200",
    },
  };

const currencyFormatter = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 0,
});

function resolveStatusLocal(voucher: Voucher): VoucherStatus {
  const status = (voucher.status as VoucherStatus | undefined) ?? undefined;
  if (status) return status;
  if (!voucher.isActive) return "DISABLED";
  const now = new Date();
  if (voucher.startsAt && new Date(voucher.startsAt) > now) return "SCHEDULED";
  if (voucher.expiresAt && new Date(voucher.expiresAt) < now) return "EXPIRED";
  return "ACTIVE";
}

function toLocalInputValue(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDisplayDate(iso?: string | null) {
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
  if (value === null || value === undefined || Number.isNaN(Number(value)))
    return "—";
  return currencyFormatter.format(Number(value));
}

function getNumericError(
  value: string,
  options?: { min?: number; max?: number }
) {
  if (value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "Enter a valid number.";
  if (parsed < 0) return "Cannot be negative.";
  if (options?.min !== undefined && parsed < options.min)
    return `Must be at least ${options.min}.`;
  if (options?.max !== undefined && parsed > options.max)
    return `Must be at most ${options.max}.`;
  return null;
}

export default function AdminVoucherManagement() {
  const { toaster } = useNotification();
  const { pushModal, popModal } = useModal();
  const { withTwoFA } = useWithTwoFA();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [actingOnId, setActingOnId] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  // Search/filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<VoucherStatus | "ALL">(
    "ALL"
  );

  const load = useCallback(async () => {
    try {
      setIsFetching(true);
      const list = await voucherService.list();
      const sorted = [...list].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setVouchers(sorted);
    } catch (e: any) {
      toaster(e?.response?.data?.message || "Failed to load vouchers", {
        variant: "error",
      });
    } finally {
      setIsFetching(false);
    }
  }, [toaster]);

  useEffect(() => {
    void load();
  }, [load]);

  // Filter and search vouchers
  const filteredVouchers = useMemo(() => {
    let result = vouchers;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (v) =>
          v.code.toLowerCase().includes(query) ||
          v.type.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (statusFilter !== "ALL") {
      result = result.filter((v) => resolveStatusLocal(v) === statusFilter);
    }

    return result;
  }, [vouchers, searchQuery, statusFilter]);

  // Paginate filtered vouchers
  const paginatedVouchers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredVouchers.slice(startIndex, endIndex);
  }, [filteredVouchers, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredVouchers.length / itemsPerPage);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const summary = {
      total: vouchers.length,
      active: 0,
      upcoming: 0,
      inactive: 0,
    };
    vouchers.forEach((voucher) => {
      const status = resolveStatusLocal(voucher);
      if (status === "ACTIVE") summary.active += 1;
      else if (status === "SCHEDULED") summary.upcoming += 1;
      else summary.inactive += 1;
    });
    return summary;
  }, [vouchers]);

  const openVoucherModal = (voucher?: Voucher) => {
    pushModal(
      <VoucherFormModal
        voucher={voucher}
        onSuccess={() => {
          popModal();
          void load();
        }}
        withTwoFA={withTwoFA}
      />
    );
  };

  const openDetailsModal = (voucher: Voucher) => {
    pushModal(<VoucherDetailsModal voucher={voucher} />);
  };

  const handleToggleActive = async (voucher: Voucher) => {
    setActingOnId(voucher.id);
    try {
      await withTwoFA(
        async (sessionToken) => {
          await voucherService.update(
            voucher.id,
            {
              isActive: !voucher.isActive,
            },
            sessionToken
          );
          toaster(voucher.isActive ? "Voucher disabled" : "Voucher enabled", {
            variant: "success",
          });
          await load();
        },
        { scope: "vouchers" }
      );
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toaster(err?.response?.data?.message || "Failed to update voucher", {
        variant: "error",
      });
    } finally {
      setActingOnId(null);
    }
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background h-full overflow-auto">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Vouchers & Promo Codes</h1>
          <p className="text-sm text-muted-foreground">
            Create, schedule, and track discount codes in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openVoucherModal()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 font-medium"
          >
            <PlusCircle className="h-4 w-4" />
            Create voucher
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg hover:shadow-xl transition-shadow rounded-lg p-3">
          <div className="relative z-10">
            <p className="text-xs uppercase tracking-wide text-white/80">
              Total vouchers
            </p>
            <p className="mt-1 text-xl font-semibold text-white">
              {stats.total}
            </p>
          </div>
        </div>
        <div className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg hover:shadow-xl transition-shadow rounded-lg p-3">
          <div className="relative z-10">
            <p className="text-xs uppercase tracking-wide text-white/80">
              Active now
            </p>
            <p className="mt-1 text-xl font-semibold text-white">
              {stats.active}
            </p>
          </div>
        </div>
        <div className="relative overflow-hidden touch-manipulation border-0 bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg hover:shadow-xl transition-shadow rounded-lg p-3">
          <div className="relative z-10">
            <p className="text-xs uppercase tracking-wide text-white/80">
              Upcoming / inactive
            </p>
            <p className="mt-1 text-xl font-semibold text-white">
              {stats.upcoming + stats.inactive}
            </p>
          </div>
        </div>
      </div>

      {/* Search and Filter Section */}
      <section className="border  border-border  rounded p-4 bg-background space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by code or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2 border border-border  rounded-md text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as VoucherStatus | "ALL")
            }
            className="border border-border rounded-md px-3 py-2 text-sm"
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="EXPIRED">Expired</option>
            <option value="DISABLED">Disabled</option>
            <option value="EXHAUSTED">Exhausted</option>
          </select>
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {paginatedVouchers.length} of {filteredVouchers.length}{" "}
            vouchers
            {searchQuery || statusFilter !== "ALL"
              ? ` (filtered from ${vouchers.length} total)`
              : ""}
          </span>
        </div>
      </section>

      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="font-medium">Vouchers</h2>
          <span className="text-sm text-muted-foreground">
            {isFetching
              ? "Refreshing..."
              : `Page ${currentPage} of ${totalPages || 1}`}
          </span>
        </header>
        <div className="overflow-auto border border-border  rounded-lg">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="p-2 border border-border ">Code</th>
                <th className="p-2 border border-border ">Value</th>
                <th className="p-2 border border-border ">Usage</th>
                <th className="p-2 border border-border ">Status</th>
                <th className="p-2 border border-border ">Valid window</th>
                <th className="p-2 border border-border ">Updated</th>
                <th className="p-2 border border-border ">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedVouchers.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="p-6 text-center text-muted-foreground"
                  >
                    {isFetching
                      ? "Loading vouchers..."
                      : searchQuery || statusFilter !== "ALL"
                      ? "No vouchers match your filters."
                      : "No vouchers created yet."}
                  </td>
                </tr>
              ) : (
                paginatedVouchers.map((voucher) => {
                  const status = resolveStatusLocal(voucher);
                  const statusMeta = STATUS_META[status];
                  const isBusy = actingOnId === voucher.id;
                  const redemptionCount = voucher.redemptions?.length || 0;

                  return (
                    <Fragment key={voucher.id}>
                      <tr className="align-top transition-colors hover:bg-muted/20">
                        <td className="p-2 border border-border  font-mono text-sm">
                          {voucher.code}
                          {!voucher.isActive && voucher.disabledAt && (
                            <div className="text-[11px] text-muted-foreground">
                              Disabled {formatDisplayDate(voucher.disabledAt)}
                            </div>
                          )}
                        </td>
                        <td className="p-2 border border-border ">
                          <div className="font-medium">
                            {voucher.type === "PERCENTAGE"
                              ? `${voucher.value}%`
                              : formatKES(voucher.value)}
                          </div>
                        </td>
                        <td className="p-2 border border-border ">
                          <div>
                            {redemptionCount > 0 ? (
                              <span className="text-amber-600 font-medium">
                                {redemptionCount} redemption
                                {redemptionCount > 1 ? "s" : ""}
                              </span>
                            ) : (
                              <span className="text-emerald-600 font-medium">
                                Unused
                              </span>
                            )}
                          </div>
                          {voucher.usageLimit != null && (
                            <div className="text-xs text-muted-foreground">
                              Limit: {redemptionCount}/{voucher.usageLimit}
                            </div>
                          )}
                        </td>
                        <td className="p-2 border border-border ">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusMeta.className}`}
                          >
                            <span className="h-2 w-2 rounded-full bg-current/80" />
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="p-2 border border-border ">
                          <div>{formatDisplayDate(voucher.startsAt)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDisplayDate(voucher.expiresAt)}
                          </div>
                        </td>
                        <td className="p-2 border border-border ">
                          <div>{formatDisplayDate(voucher.updatedAt)}</div>
                          <div className="text-xs text-muted-foreground">
                            Created {formatDisplayDate(voucher.createdAt)}
                          </div>
                        </td>
                        <td className="p-2 border border-border ">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openVoucherModal(voucher)}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-md border border-border  text-xs hover:bg-muted"
                              disabled={isBusy}
                            >
                              <Edit3 className="h-3.5 w-3.5" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(voucher)}
                              className={`inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs text-white ${
                                voucher.isActive
                                  ? "bg-red-600 hover:bg-red-700"
                                  : "bg-emerald-600 hover:bg-emerald-700"
                              } disabled:opacity-60`}
                              disabled={isBusy}
                            >
                              {isBusy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : voucher.isActive ? (
                                <Ban className="h-3.5 w-3.5" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                              {voucher.isActive ? "Disable" : "Enable"}
                            </button>
                            <button
                              type="button"
                              onClick={() => openDetailsModal(voucher)}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-md border border-border text-xs hover:bg-muted"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Details
                            </button>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border ">
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 borderborder-border rounded-md text-sm hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-1.5 border border-border rounded-md text-sm ${
                        currentPage === pageNum
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 border border-border  rounded-md text-sm hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// Voucher Form Modal Component
function VoucherFormModal({
  voucher,
  onSuccess,

  withTwoFA,
}: {
  voucher?: Voucher;
  onSuccess: () => void;

  withTwoFA: <T>(
    action: (sessionToken: string) => Promise<T>,
    options: { scope: "vouchers" | "giftcards" }
  ) => Promise<T | undefined>;
}) {
  const { toaster } = useNotification();
  const { popModal } = useModal();
  const [form, setForm] = useState<FormState>(() => {
    if (voucher) {
      return {
        code: voucher.code,
        type: voucher.type,
        value: (voucher.value ?? 0).toString(),
        startsAt: toLocalInputValue(voucher.startsAt),
        expiresAt: toLocalInputValue(voucher.expiresAt),
        usageLimit:
          voucher.usageLimit != null ? voucher.usageLimit.toString() : "",
      };
    }
    return initialForm;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const valueError = useMemo(() => {
    if (!form.value.trim()) return "Value is required.";
    const base = getNumericError(form.value, { min: 0 });
    if (base) return base;
    const numericValue = Number(form.value);
    if (numericValue <= 0) return "Value must be greater than 0.";
    if (form.type === "PERCENTAGE" && numericValue > 100)
      return "Percentage cannot exceed 100.";
    return null;
  }, [form.type, form.value]);

  const usageLimitError = useMemo(
    () => getNumericError(form.usageLimit, { min: 1 }),
    [form.usageLimit]
  );

  const isSubmitDisabled =
    isSubmitting || !form.code.trim() || !!valueError || !!usageLimitError;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitDisabled) return;

    const payload: Partial<Voucher> & {
      code: string;
      type: string;
      value: number;
    } = {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value: Number(form.value),
    };

    if (form.startsAt) payload.startsAt = new Date(form.startsAt).toISOString();
    else if (voucher) payload.startsAt = null;

    if (form.expiresAt)
      payload.expiresAt = new Date(form.expiresAt).toISOString();
    else if (voucher) payload.expiresAt = null;

    const assignOptionalNumber = (key: keyof FormState, value: string) => {
      if (key === "code" || key === "type" || key === "value") return;
      if (value === "") {
        if (voucher) payload[key] = null;
        return;
      }
      (payload as any)[key] = Number(value);
    };

    assignOptionalNumber("usageLimit", form.usageLimit);

    try {
      setIsSubmitting(true);
      await withTwoFA(
        async (sessionToken) => {
          if (voucher) {
            await voucherService.update(voucher.id, payload, sessionToken);
            toaster("Voucher updated", { variant: "success" });
          } else {
            await voucherService.create(payload, sessionToken);
            toaster("Voucher created", { variant: "success" });
          }
          onSuccess();
        },
        { scope: "vouchers" }
      );
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toaster(err?.response?.data?.message || "Failed to save voucher", {
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="bg-card rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-border shadow-lg"
    >
      <div className="flex items-center justify-between p-4 border-b border-border ">
        <h2 className="text-lg font-semibold">
          {voucher ? "Edit Voucher" : "Create New Voucher"}
        </h2>
        <button
          type="button"
          onClick={() => popModal()}
          className="text-muted-foreground hover:text-foreground"
          disabled={isSubmitting}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Code *</label>
              <input
                className="border border-border rounded px-3 py-2 w-full"
                value={form.code}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, code: e.target.value }))
                }
                placeholder="SUMMER10"
                autoCapitalize="characters"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type *</label>
              <select
                className="border border-border rounded px-3 py-2 w-full"
                value={form.type}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    type: e.target.value as FormState["type"],
                  }))
                }
                disabled={isSubmitting}
              >
                <option value="AMOUNT">Amount (KES)</option>
                <option value="PERCENTAGE">Percentage (%)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Value *</label>
              <input
                type="number"
                min={0}
                className="border border-border rounded px-3 py-2 w-full"
                value={form.value}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, value: e.target.value }))
                }
                disabled={isSubmitting}
              />
              {valueError && (
                <p className="mt-1 text-xs text-destructive">{valueError}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                Starts at
              </label>
              <input
                type="datetime-local"
                className="border border-border rounded px-3 py-2 w-full"
                value={form.startsAt}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, startsAt: e.target.value }))
                }
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Expires at
              </label>
              <input
                type="datetime-local"
                className="border border-border rounded px-3 py-2 w-full"
                value={form.expiresAt}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, expiresAt: e.target.value }))
                }
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                Usage limit (total redemptions)
              </label>
              <input
                type="number"
                min={1}
                className="border border-border rounded px-3 py-2 w-full"
                value={form.usageLimit}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, usageLimit: e.target.value }))
                }
                placeholder="Unlimited"
                disabled={isSubmitting}
              />
              {usageLimitError && (
                <p className="mt-1 text-xs text-destructive">
                  {usageLimitError}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Total number of times this voucher can be redeemed across all
                users. Each user can still only use it once.
              </p>
            </div>
          </div>
        </div>
      </form>

      <div className="flex items-center justify-end gap-3 p-4 border-t border-border  bg-muted/20">
        <button
          type="button"
          onClick={() => popModal()}
          className="px-4 py-2 border border-border rounded-md text-sm hover:bg-muted"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          onClick={handleSubmit as any}
          disabled={isSubmitDisabled}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              {voucher ? "Update" : "Create"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// Voucher Details Modal Component
function VoucherDetailsModal({ voucher }: { voucher: Voucher }) {
  const redemptionCount = voucher.redemptions?.length || 0;
  const { popModal } = useModal();
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="bg-card rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-border shadow-lg"
    >
      <div className="flex items-center justify-between p-4 border-b border-border ">
        <div>
          <h2 className="text-lg font-semibold">Voucher Details</h2>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            {voucher.code}
          </p>
        </div>
        <button
          type="button"
          onClick={() => popModal()}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Redemption History */}
          <div className="space-y-3">
            <h3 className="font-medium text-base flex items-center gap-2">
              Redemption History
              {redemptionCount > 0 && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  {redemptionCount} redemption{redemptionCount > 1 ? "s" : ""}
                </span>
              )}
            </h3>
            {voucher.redemptions && voucher.redemptions.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {voucher.redemptions.map((r, idx) => (
                  <div
                    key={idx}
                    className="border border-border rounded-lg bg-background/80 px-4 py-3 space-y-2"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-muted-foreground">
                        User:{" "}
                        <span className="font-medium text-foreground">
                          {r.userName || "Unknown User"}
                        </span>
                      </span>
                      {r.userEmail && (
                        <span className="text-xs text-muted-foreground">
                          ({r.userEmail})
                        </span>
                      )}
                    </div>
                    {r.bookingId && typeof r.bookingId === "string" && (
                      <div className="text-sm text-muted-foreground">
                        Booking:{" "}
                        <span className="font-mono font-medium text-foreground">
                          {r.bookingId}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-4 flex-wrap text-sm">
                      <span className="text-muted-foreground">
                        Amount:{" "}
                        <span className="font-semibold text-emerald-600">
                          {formatKES(r.amountDiscounted)}
                        </span>
                      </span>
                      <span className="text-muted-foreground">
                        Date:{" "}
                        <span className="font-medium text-foreground">
                          {formatDisplayDate(r.at)}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground bg-muted/30 p-4 rounded-lg">
                No redemptions yet.
              </p>
            )}
          </div>

          {/* Voucher Configuration */}
          <div className="space-y-3">
            <h3 className="font-medium text-base">Voucher Configuration</h3>
            <div className="space-y-3 bg-muted/30 p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Type:</span>
                <span className="font-medium text-foreground">
                  {voucher.type === "PERCENTAGE"
                    ? `${voucher.value}% discount`
                    : `${formatKES(voucher.value)} off`}
                </span>
              </div>
              {voucher.usageLimit != null && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Usage limit:
                  </span>
                  <span className="font-medium text-foreground">
                    {redemptionCount}/{voucher.usageLimit} redemptions
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Status:</span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    STATUS_META[resolveStatusLocal(voucher)].className
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-current/80" />
                  {STATUS_META[resolveStatusLocal(voucher)].label}
                </span>
              </div>
            </div>

            {/* Timestamps */}
            <div className="space-y-2 bg-muted/20 p-4 rounded-lg text-sm">
              <h4 className="font-medium text-foreground mb-2">Timeline</h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-xs text-muted-foreground">
                    Created
                  </span>
                  <span className="text-sm font-medium">
                    {formatDisplayDate(voucher.createdAt)}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground">
                    Updated
                  </span>
                  <span className="text-sm font-medium">
                    {formatDisplayDate(voucher.updatedAt)}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground">
                    Starts at
                  </span>
                  <span className="text-sm font-medium">
                    {formatDisplayDate(voucher.startsAt)}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground">
                    Expires at
                  </span>
                  <span className="text-sm font-medium">
                    {formatDisplayDate(voucher.expiresAt)}
                  </span>
                </div>
                {voucher.disabledAt && (
                  <div className="col-span-2">
                    <span className="block text-xs text-muted-foreground">
                      Disabled at
                    </span>
                    <span className="text-sm font-medium text-red-600">
                      {formatDisplayDate(voucher.disabledAt)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 p-4 border-t border-border bg-muted/20">
        <button
          type="button"
          onClick={() => popModal()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 font-medium"
        >
          Close
        </button>
      </div>
    </div>
  );
}
