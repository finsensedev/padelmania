import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "react-query";
import api from "src/utils/api";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Badge } from "src/components/ui/badge";
import NewCourtModal from "src/components/admin/modals/NewCourtModal";
import useModal from "src/hooks/useModal";
import useTwoFASession from "src/hooks/useTwoFASession";
import useNotification from "src/hooks/useNotification";
import { Info } from "lucide-react";

type Court = {
  id?: string;
  name: string;
  surface?: string;
  description?: string | null;
  isActive?: boolean;
  displayOrder?: number;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    pricingRules: number;
  };
};

const AdminCourtManagement = () => {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { pushModal } = useModal();
  const { obtainSession } = useTwoFASession();
  const { toaster } = useNotification();

  const messageFromError = (err: unknown, fallback: string) => {
    if (typeof err === "object" && err) {
      const maybe = err as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      return maybe.response?.data?.message || maybe.message || fallback;
    }
    return fallback;
  };

  const {
    data: courts = [],
    isLoading: courtsLoading,
    isFetching: courtsFetching,
    error: courtsError,
  } = useQuery<Court[]>({
    queryKey: ["admin-courts-management"],
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get("/court");
      const data = res?.data?.data ?? res?.data ?? [];
      const baseList = Array.isArray(data) ? data : [];
      const courtsWithRules = await Promise.all(
        baseList.map(async (court: Court) => {
          if (!court.id) return court;
          try {
            const rulesRes = await api.get(
              `/court/pricing/rules?courtId=${court.id}`
            );
            const rules = rulesRes?.data?.data || [];
            return {
              ...court,
              _count: {
                pricingRules: rules.length,
              },
            };
          } catch {
            return court;
          }
        })
      );
      return courtsWithRules;
    },
  });

  const filteredCourts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courts;
    return courts.filter((c) =>
      [c.name, c.surface, c.description]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase())
        .some((v) => v.includes(q))
    );
  }, [courts, search]);

  const handleAdd = () => {
    pushModal(<NewCourtModal court={undefined} />);
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    if (!confirm("Delete this court? This cannot be undone.")) return;
    setSaving(true);
    setActionError(null);
    try {
      await api.delete(`/court/${id}` as const);
      await queryClient.invalidateQueries(["admin-courts-management"]);
    } catch (e: unknown) {
      setActionError(messageFromError(e, "Failed to delete court"));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (c: Court) => {
    if (!c?.id) return;

    // Require 2FA session for toggling court status
    const session = await obtainSession("permissions");
    if (!session) {
      toaster("2FA verification required to toggle court status", {
        variant: "error",
      });
      return;
    }

    setSaving(true);
    setActionError(null);
    try {
      try {
        await api.patch(`/court/${c.id}/toggle` as const, undefined, {
          headers: { "X-2FA-Session": session },
        });
      } catch {
        await api.put(
          `/court/${c.id}` as const,
          {
            ...c,
            isActive: !c.isActive,
          },
          {
            headers: { "X-2FA-Session": session },
          }
        );
      }
      await queryClient.invalidateQueries(["admin-courts-management"]);
      toaster(
        `Court ${c.isActive !== false ? "disabled" : "enabled"} successfully`,
        { variant: "success" }
      );
    } catch (e: unknown) {
      setActionError(messageFromError(e, "Failed to update status"));
      toaster(messageFromError(e, "Failed to update status"), {
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const loading = courtsLoading || courtsFetching;
  const errorMessage =
    actionError ||
    (courtsError
      ? messageFromError(courtsError, "Failed to load courts")
      : null);

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background h-full overflow-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center w-full justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold">
            Court Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage courts, surfaces, and pricing rules
          </p>
        </div>
        <Button
          onClick={handleAdd}
          className="bg-primary hover:bg-primary/90 w-full sm:w-auto"
        >
          Add New Court
        </Button>
      </div>

      {errorMessage && (
        <div className="w-full bg-destructive/10 text-destructive px-3 sm:px-4 py-2.5 sm:py-3 rounded-md text-xs sm:text-sm border border-destructive/20">
          {errorMessage}
        </div>
      )}

      <Card className="w-full shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="px-4 sm:px-6 border-b border-border bg-muted/30">
          <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg sm:text-xl">
              Courts ({filteredCourts.length})
            </CardTitle>
            <Input
              className="w-full sm:max-w-xs"
              placeholder="Search courts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-muted-foreground text-sm font-medium">
                Loading courts...
              </div>
            </div>
          ) : errorMessage ? (
            <div className="bg-destructive/10 text-destructive px-3 sm:px-4 py-2.5 sm:py-3 rounded-md text-xs sm:text-sm m-4 border border-destructive/20">
              {errorMessage}
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left py-3 px-4 font-semibold">
                        Name
                      </th>
                      <th className="text-left py-3 px-4 font-semibold">
                        Surface
                      </th>
                      <th className="text-left py-3 px-4 font-semibold">
                        Pricing Rules
                      </th>
                      <th className="text-left py-3 px-4 font-semibold">
                        Status
                      </th>
                      <th className="text-right py-3 px-4 font-semibold">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCourts.map((c) => (
                      <tr
                        key={String(c.id)}
                        className="border-b border-border hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-3 px-4 font-medium">{c.name}</td>
                        <td className="py-3 px-4">
                          {c.surface ? (
                            <Badge variant="outline" className="text-xs">
                              {c.surface}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              —
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {c._count?.pricingRules ? (
                            <div className="flex items-center gap-1.5">
                              <Info className="h-3.5 w-3.5 text-info" />
                              <span className="text-xs font-medium">
                                {c._count.pricingRules} rule
                                {c._count.pricingRules > 1 ? "s" : ""}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              No rules
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant={
                              c.isActive !== false ? "default" : "secondary"
                            }
                            className="text-xs"
                          >
                            {c.isActive !== false ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                pushModal(<NewCourtModal court={c} />)
                              }
                              disabled={saving}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggle(c)}
                              disabled={saving}
                            >
                              {c.isActive !== false ? "Disable" : "Enable"}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(c.id)}
                              disabled={saving}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredCourts.length === 0 && (
                      <tr>
                        <td
                          className="py-12 text-center text-muted-foreground"
                          colSpan={5}
                        >
                          <div className="flex flex-col items-center gap-2">
                            <Info className="h-12 w-12 opacity-50" />
                            <p className="font-medium">No courts found</p>
                            <p className="text-xs">
                              Try adjusting your search or add a new court
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="lg:hidden divide-y divide-border">
                {filteredCourts.map((c) => (
                  <div
                    key={String(c.id)}
                    className="p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm truncate mb-2">
                          {c.name}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {c.surface && (
                            <Badge variant="outline" className="text-xs">
                              {c.surface}
                            </Badge>
                          )}
                          <Badge
                            variant={
                              c.isActive !== false ? "default" : "secondary"
                            }
                            className="text-xs"
                          >
                            {c.isActive !== false ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {c._count?.pricingRules ? (
                      <div className="flex items-center gap-1.5 text-xs mb-3 bg-info/10 text-info px-2 py-1.5 rounded border border-info/20">
                        <Info className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="font-medium">
                          {c._count.pricingRules} active pricing rule
                          {c._count.pricingRules > 1 ? "s" : ""}
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground mb-3 bg-muted/50 px-2 py-1.5 rounded">
                        No custom pricing rules
                      </div>
                    )}

                    <div className="flex flex-col gap-2 pt-2 border-t border-border">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => pushModal(<NewCourtModal court={c} />)}
                          disabled={saving}
                          className="flex-1 text-xs h-8"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggle(c)}
                          disabled={saving}
                          className="flex-1 text-xs h-8"
                        >
                          {c.isActive !== false ? "Disable" : "Enable"}
                        </Button>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(c.id)}
                        disabled={saving}
                        className="w-full text-xs h-8"
                      >
                        Delete Court
                      </Button>
                    </div>
                  </div>
                ))}
                {filteredCourts.length === 0 && (
                  <div className="py-12 text-center text-muted-foreground">
                    <Info className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium text-sm">No courts found</p>
                    <p className="text-xs mt-1">
                      Try adjusting your search or add a new court
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
export default AdminCourtManagement;
