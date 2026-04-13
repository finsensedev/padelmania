import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "src/utils/api";
import { Info, Plus, Edit, Trash2 } from "lucide-react";
import useNotification from "src/hooks/useNotification";
import PricingRuleModal from "src/components/admin/modals/PricingRuleModal";
import useModal from "src/hooks/useModal";
import { useMutation, useQuery, useQueryClient } from "react-query";

interface Court {
  id: string;
  name: string;
  type: string;
  surface: string;
  location: string;
  isActive: boolean;
}

interface PricingRule {
  id: string;
  name: string;
  description?: string;
  pricingType: string;
  priceValue: number;
  courtId?: string | null;
  priority: number;
  dayOfWeek?: number[];
  startTime?: string;
  endTime?: string;
  validFrom?: string;
  validUntil?: string;
  isActive: boolean;
}

function AdminPricingRules() {
  const navigate = useNavigate();
  const { toaster } = useNotification();
  const { pushModal } = useModal();
  const queryClient = useQueryClient();

  // Queries
  const { data: rules = [], isLoading: rulesLoading } = useQuery<PricingRule[]>(
    ["pricing-rules"],
    async () => {
      const res = await api.get("/court/pricing/rules");
      return res.data?.data ?? [];
    },
    {
      onError: () =>
        toaster("Failed to load pricing rules", { variant: "error" }),
    }
  );

  const { data: courts = [], isLoading: courtsLoading } = useQuery<Court[]>(
    ["courts"],
    async () => {
      const res = await api.get("/court");
      return res.data?.data ?? [];
    },
    {
      onError: () => toaster("Failed to load courts", { variant: "error" }),
    }
  );

  const loading = rulesLoading || courtsLoading;

  const refetchAll = useCallback(() => {
    queryClient.invalidateQueries(["pricing-rules"]);
    // Courts are mostly static but invalidate in case pricing rules modal changed associations
    queryClient.invalidateQueries(["courts"]);
  }, [queryClient]);

  // Mutations
  const deleteRuleMutation = useMutation(
    async (id: string) => {
      return api.delete(`/court/pricing/rules/${id}`);
    },
    {
      onSuccess: () => {
        toaster("Pricing rule deleted successfully", { variant: "success" });
        queryClient.invalidateQueries(["pricing-rules"]);
      },
      onError: () => {
        toaster("Failed to delete pricing rule", { variant: "error" });
      },
    }
  );

  const handleDeleteRule = (id: string) => {
    if (!confirm("Are you sure you want to delete this pricing rule?")) return;
    deleteRuleMutation.mutate(id);
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 2,
    }).format(amount);

  const getCourtName = (courtId?: string | null) => {
    if (!courtId) return "All courts";
    const court = courts.find((c) => c.id === courtId);
    return court?.name || "Unknown";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">
            Loading pricing rules...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Pricing Rules
              </h1>
              <p className="text-gray-600 mt-1">
                Manage dynamic pricing for courts
              </p>
            </div>
            <button
              onClick={() => {
                pushModal(<PricingRuleModal onSuccess={refetchAll} />);
              }}
              className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">New Pricing Rule</span>
              <span className="sm:hidden">New Rule</span>
            </button>
          </div>
        </div>

        {/* Dynamic Pricing Rules */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                <Plus className="w-4 h-4 text-blue-600" />
              </div>
              Dynamic Pricing Rules
            </h2>
            <p className="text-sm text-gray-600 mt-2">
              Configure automated pricing adjustments based on conditions
            </p>
          </div>

          {/* Mobile Card View - Hidden on desktop */}
          <div className="block lg:hidden">
            {rules.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Plus className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500 font-medium">
                  No pricing rules yet
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  Create your first rule to get started
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {rules.map((rule: PricingRule) => (
                  <div key={rule.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">
                          {rule.name}
                        </h3>
                        {rule.description && (
                          <p className="text-xs text-gray-500 mt-1">
                            {rule.description}
                          </p>
                        )}
                      </div>
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          rule.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {rule.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                      <div>
                        <span className="text-gray-500">Type:</span>
                        <span className="ml-1 font-medium text-gray-900">
                          {rule.pricingType}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Value:</span>
                        <span className="ml-1 font-medium text-gray-900">
                          {rule.pricingType === "PERCENTAGE"
                            ? `${rule.priceValue}%`
                            : formatCurrency(rule.priceValue)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Priority:</span>
                        <span className="ml-1 font-medium text-gray-900">
                          {rule.priority}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Court:</span>
                        <span className="ml-1 font-medium text-gray-900">
                          {getCourtName(rule.courtId)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => {
                          pushModal(
                            <PricingRuleModal
                              rule={rule}
                              onSuccess={refetchAll}
                            />
                          );
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Desktop Table View - Hidden on mobile */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rule Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Courts
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rules.map((rule: PricingRule) => (
                  <tr
                    key={rule.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {rule.name}
                        </div>
                        {rule.description && (
                          <div className="text-xs text-gray-500 mt-1">
                            {rule.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-800 rounded-full">
                        {rule.pricingType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-gray-900">
                        {rule.pricingType === "PERCENTAGE"
                          ? `${rule.priceValue}%`
                          : formatCurrency(rule.priceValue)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900 font-medium">
                        {rule.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">
                        {getCourtName(rule.courtId)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          rule.isActive
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {rule.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => {
                            pushModal(
                              <PricingRuleModal
                                rule={rule}
                                onSuccess={refetchAll}
                              />
                            );
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Court Status Overview */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                <Info className="w-4 h-4 text-green-600" />
              </div>
              Court Status Overview
            </h2>
            <p className="text-sm text-gray-600 mt-2">
              View court details and active pricing rules
            </p>
          </div>

          {/* Mobile Card View - Hidden on desktop */}
          <div className="block lg:hidden">
            {courts.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Info className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500 font-medium">No courts available</p>
                <p className="text-sm text-gray-400 mt-1">
                  Add courts to see them here
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {courts.map((court: Court) => {
                  const courtRules = rules.filter(
                    (r: PricingRule) => r.courtId === court.id
                  ).length;
                  return (
                    <div key={court.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">
                            {court.name}
                          </h3>
                          <div className="flex items-center mt-1 space-x-2">
                            <span className="inline-flex px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-800 rounded-full">
                              {court.surface}
                            </span>
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                court.isActive
                                  ? "bg-green-100 text-green-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {court.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 text-sm mb-3">
                        <div>
                          <span className="text-gray-500">Surface:</span>
                          <span className="ml-1 font-medium text-gray-900">
                            {court.surface?.replace(/_/g, " ") || "N/A"}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Location:</span>
                          <span className="ml-1 font-medium text-gray-900">
                            {court.location}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <span className="text-gray-500">Active Rules:</span>
                          <span className="ml-1 font-medium text-gray-900">
                            {courtRules}
                          </span>
                          {courtRules > 0 && (
                            <Info className="ml-2 h-4 w-4 text-blue-500" />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-end">
                        <button
                          onClick={() =>
                            navigate(
                              `/admin/courts/availability?court=${court.id}`
                            )
                          }
                          className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          View Schedule
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Desktop Table View - Hidden on mobile */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Court Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Surface
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Active Rules
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {courts.map((court: Court) => {
                  const courtRules = rules.filter(
                    (r: PricingRule) => r.courtId === court.id
                  ).length;
                  return (
                    <tr
                      key={court.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {court.name}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {court.surface?.replace(/_/g, " ") || "N/A"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {court.location}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <span className="text-sm text-gray-900 font-medium">
                            {courtRules}
                          </span>
                          {courtRules > 0 && (
                            <Info className="ml-2 h-4 w-4 text-blue-500" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            court.isActive
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {court.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium">
                        <button
                          onClick={() =>
                            navigate(
                              `/admin/courts/availability?court=${court.id}`
                            )
                          }
                          className="px-3 py-1 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          View Schedule
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminPricingRules;
