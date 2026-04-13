/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import api from "src/utils/api";
import useModal from "src/hooks/useModal";
import useNotification from "src/hooks/useNotification";
import { X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "react-query";

interface Court {
  id: string;
  name: string;
}

interface PricingRule {
  id?: string;
  name: string;
  description?: string;
  pricingType: string;
  priceValue: number;
  racketPricingType?: string | null;
  racketPriceValue?: number | null;
  courtId?: string | null;
  priority: number;
  dayOfWeek?: number[];
  startTime?: string;
  endTime?: string;
  validFrom?: string;
  validUntil?: string;
  isActive: boolean;
}

interface PricingRuleModalProps {
  rule?: PricingRule;
  onSuccess?: () => void;
}

function PricingRuleModal({ rule, onSuccess }: PricingRuleModalProps) {
  const { popModal } = useModal();
  const { toaster } = useNotification();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: rule?.name || "",
    description: rule?.description || "",
    pricingType: rule?.pricingType || "FIXED",
    priceValue: rule?.priceValue || 0,
    racketPricingType: rule?.racketPricingType || "", // empty means not set
    racketPriceValue: rule?.racketPriceValue ?? null,
    courtId: rule?.courtId || "",
    priority: rule?.priority || 1,
    dayOfWeek: rule?.dayOfWeek || [],
    startTime: rule?.startTime || "",
    endTime: rule?.endTime || "",
    validFrom: rule?.validFrom || "",
    validUntil: rule?.validUntil || "",
    isActive: rule?.isActive !== false,
  });

  // Fetch courts via react-query
  const courtsQuery = useQuery<Court[]>(
    ["courts"],
    async () => {
      const res = await api.get("/court");
      return res.data.data || [];
    },
    {
      staleTime: 5 * 60 * 1000,
      retry: 2,
    }
  );

  const mutation = useMutation(
    async () => {
      const payload = {
        ...formData,
        courtId: formData.courtId || null,
        dayOfWeek: formData.dayOfWeek.length > 0 ? formData.dayOfWeek : null,
        startTime: formData.startTime || null,
        endTime: formData.endTime || null,
        validFrom: formData.validFrom || null,
        validUntil: formData.validUntil || null,
        // Normalize racket fields: send nulls when unset
        racketPricingType:
          formData.racketPricingType && formData.racketPricingType !== ""
            ? formData.racketPricingType
            : null,
        racketPriceValue:
          formData.racketPriceValue !== null &&
          formData.racketPriceValue !== undefined
            ? formData.racketPriceValue
            : null,
      };

      if (rule?.id) {
        await api.put(`/court/pricing/rules/${rule.id}`, payload);
      } else {
        await api.post("/court/pricing/rules", payload);
      }
    },
    {
      onSuccess: () => {
        toaster(
          rule?.id
            ? "Pricing rule updated successfully"
            : "Pricing rule created successfully",
          { variant: "success" }
        );
        // Invalidate pricing rules list (assuming a query key)
        queryClient.invalidateQueries(["pricing-rules"]);
        onSuccess?.();
        popModal();
      },
      onError: (error: any) => {
        console.error(error);
        toaster(
          error?.response?.data?.message || "Failed to save pricing rule",
          {
            variant: "error",
          }
        );
      },
    }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toaster("Rule name is required", { variant: "error" });
      return;
    }
    mutation.mutate();
  };

  const toggleDay = (day: number) => {
    setFormData((prev) => ({
      ...prev,
      dayOfWeek: prev.dayOfWeek.includes(day)
        ? prev.dayOfWeek.filter((d) => d !== day)
        : [...prev.dayOfWeek, day],
    }));
  };

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div
      className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">
          {rule?.id ? "Edit Pricing Rule" : "Create Pricing Rule"}
        </h2>
        <button
          onClick={() => popModal()}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Rule Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Rule Name *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., Weekend Peak Hours"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={2}
            placeholder="Describe what this rule does..."
          />
        </div>

        {/* Pricing */}
        <div className="space-y-2">
          <div className="text-sm font-semibold text-gray-800">Pricing</div>
          <p className="text-xs text-gray-500 -mt-1">
            Choose how this rule adjusts prices, then set the value.
          </p>
        </div>

        {/* Pricing Type and Value */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Pricing Type
            </label>
            <select
              value={formData.pricingType}
              onChange={(e) =>
                setFormData({ ...formData, pricingType: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="FIXED">Fixed Amount</option>
              <option value="PERCENTAGE">Percentage Discount</option>
              <option value="MULTIPLIER">Multiplier</option>
              <option value="ADDITION">Addition</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Value
            </label>
            <div className="relative">
              {/* Prefix */}
              {(formData.pricingType === "FIXED" ||
                formData.pricingType === "ADDITION") && (
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                  KES
                </span>
              )}
              {formData.pricingType === "MULTIPLIER" && (
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                  ×
                </span>
              )}
              <input
                type="number"
                value={formData.priceValue}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    priceValue: Number(e.target.value),
                  })
                }
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  formData.pricingType === "PERCENTAGE" ? "pr-10" : ""
                } ${
                  formData.pricingType === "MULTIPLIER" ||
                  formData.pricingType === "FIXED" ||
                  formData.pricingType === "ADDITION"
                    ? "pl-8"
                    : ""
                }`}
                placeholder={
                  formData.pricingType === "PERCENTAGE"
                    ? "e.g., 20"
                    : formData.pricingType === "MULTIPLIER"
                    ? "e.g., 1.5"
                    : "e.g., 3000"
                }
                step={
                  formData.pricingType === "PERCENTAGE" ||
                  formData.pricingType === "MULTIPLIER"
                    ? "0.01"
                    : "1"
                }
                required
              />
              {/* Suffix */}
              {formData.pricingType === "PERCENTAGE" && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                  %
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              {formData.pricingType === "FIXED" &&
                "Overrides the base hourly rate with a fixed price."}
              {formData.pricingType === "PERCENTAGE" &&
                "Applies a discount (e.g., 20 = 20% off)."}
              {formData.pricingType === "MULTIPLIER" &&
                "Multiplies the base rate (e.g., 1.5 = increase by 50%)."}
              {formData.pricingType === "ADDITION" &&
                "Adds a fixed amount on top of the base rate."}
            </p>
          </div>
        </div>

        {/* Rackets Pricing */}
        <div className="mt-2 space-y-2">
          <div className="text-sm font-semibold text-gray-800">
            Rackets Pricing (optional)
          </div>
          <p className="text-xs text-gray-500 -mt-1">
            If set, this rule also adjusts the unit price for racket rentals.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rackets Pricing Type
            </label>
            <select
              value={formData.racketPricingType || ""}
              onChange={(e) =>
                setFormData({ ...formData, racketPricingType: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">None</option>
              <option value="FIXED">Fixed Amount</option>
              <option value="PERCENTAGE">Percentage Discount</option>
              <option value="MULTIPLIER">Multiplier</option>
              <option value="ADDITION">Addition</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rackets Value
            </label>
            <div className="relative">
              {(formData.racketPricingType === "FIXED" ||
                formData.racketPricingType === "ADDITION") && (
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                  KES
                </span>
              )}
              {formData.racketPricingType === "MULTIPLIER" && (
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                  ×
                </span>
              )}
              <input
                type="number"
                value={formData.racketPriceValue ?? 0}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    racketPriceValue:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  formData.racketPricingType === "PERCENTAGE" ? "pr-10" : ""
                } ${
                  formData.racketPricingType === "MULTIPLIER" ||
                  formData.racketPricingType === "FIXED" ||
                  formData.racketPricingType === "ADDITION"
                    ? "pl-8"
                    : ""
                }`}
                placeholder={
                  formData.racketPricingType === "PERCENTAGE"
                    ? "e.g., 20"
                    : formData.racketPricingType === "MULTIPLIER"
                    ? "e.g., 1.5"
                    : "e.g., 300"
                }
                step={
                  formData.racketPricingType === "PERCENTAGE" ||
                  formData.racketPricingType === "MULTIPLIER"
                    ? "0.01"
                    : "1"
                }
                disabled={!formData.racketPricingType}
              />
              {formData.racketPricingType === "PERCENTAGE" && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                  %
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              {formData.racketPricingType === "FIXED" &&
                "Overrides the racket unit price with a fixed price."}
              {formData.racketPricingType === "PERCENTAGE" &&
                "Applies a discount to racket unit price (e.g., 20 = 20% off)."}
              {formData.racketPricingType === "MULTIPLIER" &&
                "Multiplies the racket unit price (e.g., 1.5 = increase by 50%)."}
              {formData.racketPricingType === "ADDITION" &&
                "Adds a fixed amount on top of the racket unit price."}
            </p>
          </div>
        </div>

        {/* Court Selection and Priority */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Apply to Court
            </label>
            <select
              value={formData.courtId}
              onChange={(e) =>
                setFormData({ ...formData, courtId: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Courts</option>
              {courtsQuery.data?.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name}
                </option>
              ))}
            </select>
            {courtsQuery.isLoading && (
              <p className="text-xs text-gray-500 mt-1">Loading courts...</p>
            )}
            {courtsQuery.isError && (
              <p className="text-xs text-red-500 mt-1">Failed to load courts</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Priority (Higher priority rules apply first)
            </label>
            <input
              type="number"
              value={formData.priority}
              onChange={(e) =>
                setFormData({ ...formData, priority: Number(e.target.value) })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="1"
              required
            />
          </div>
        </div>

        {/* Days of Week */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Apply to Days
          </label>
          <div className="flex flex-wrap gap-2">
            {dayNames.map((day, index) => (
              <button
                key={index}
                type="button"
                onClick={() => toggleDay(index)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  formData.dayOfWeek.includes(index)
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {day}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Leave unchecked to apply to all days.
          </p>
        </div>

        {/* Time Range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Time
            </label>
            <input
              type="time"
              value={formData.startTime}
              onChange={(e) =>
                setFormData({ ...formData, startTime: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              End Time
            </label>
            <input
              type="time"
              value={formData.endTime}
              onChange={(e) =>
                setFormData({ ...formData, endTime: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Validity Period */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Valid From
            </label>
            <input
              type="date"
              value={formData.validFrom}
              onChange={(e) =>
                setFormData({ ...formData, validFrom: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Valid Until
            </label>
            <input
              type="date"
              value={formData.validUntil}
              onChange={(e) =>
                setFormData({ ...formData, validUntil: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Active Status */}
        <div className="flex items-center">
          <input
            type="checkbox"
            id="isActive"
            checked={formData.isActive}
            onChange={(e) =>
              setFormData({ ...formData, isActive: e.target.checked })
            }
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label
            htmlFor="isActive"
            className="ml-2 text-sm font-medium text-gray-700"
          >
            Active
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={() => popModal()}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            disabled={mutation.isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
            disabled={mutation.isLoading}
          >
            {mutation.isLoading
              ? "Saving..."
              : rule?.id
              ? "Update Rule"
              : "Create Rule"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default PricingRuleModal;
