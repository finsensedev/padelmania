/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useMutation, useQueryClient } from "react-query";
import api from "src/utils/api";
import useModal from "src/hooks/useModal";
import { Info } from "lucide-react";

interface Court {
  id?: string;
  name: string;
  surface?: string;
  location?: string;
  description?: string | null;
  isActive?: boolean;
  displayOrder?: number;
}

interface NewCourtModalProps {
  court?: Court;
}

function NewCourtModal({ court }: NewCourtModalProps) {
  const { popModal } = useModal();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: court?.name || "",
    surface: court?.surface || "ARTIFICIAL_GRASS",
    location: court?.location || "INDOOR",
    description: court?.description || "",
    isActive: court?.isActive !== false,
    displayOrder: court?.displayOrder || 0,
  });

  const createCourtMutation = useMutation({
    mutationFn: async (payload: any) => {
      return await api.post("/court", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["admin-courts-management"]);
      popModal();
    },
    onError: (err: any) => {
      setError(
        err?.response?.data?.message || err?.message || "Failed to create court"
      );
    },
  });

  const updateCourtMutation = useMutation({
    mutationFn: async (payload: any) => {
      return await api.put(`/court/${court?.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["admin-courts-management"]);
      popModal();
    },
    onError: (err: any) => {
      setError(
        err?.response?.data?.message || err?.message || "Failed to update court"
      );
    },
  });

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError("Court name is required");
      return;
    }

    setError(null);

    const payload = {
      name: formData.name.trim(),
      surface: formData.surface,
      location: formData.location,
      description: formData.description || null,
      isActive: formData.isActive,
      displayOrder: formData.displayOrder,
    };

    if (court?.id) {
      updateCourtMutation.mutate(payload);
    } else {
      createCourtMutation.mutate(payload);
    }
  };

  const loading =
    createCourtMutation.isLoading || updateCourtMutation.isLoading;

  return (
    <div
      className="bg-background p-4 sm:p-6 max-w-3xl rounded-lg shadow-2xl w-full max-h-[90vh] overflow-y-auto border border-border"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="mb-4 sm:mb-6 pb-4 border-b border-border">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground mb-1 sm:mb-2">
          {court?.id ? "Edit Court" : "Create New Court"}
        </h1>
        <p className="text-sm text-muted-foreground font-medium">
          {court?.id
            ? "Update the court details below."
            : "Fill in the details to create a new court."}
        </p>
      </div>

      <div className="space-y-4 sm:space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 sm:p-4">
            <div className="flex gap-2 sm:gap-3">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-destructive"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Form Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {/* Court Name */}
          <div className="sm:col-span-2">
            <label
              htmlFor="name"
              className="block text-xs sm:text-sm font-semibold text-foreground mb-1.5 sm:mb-2"
            >
              Court Name *
            </label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="e.g., Court 1 - Premium"
              required
              className="w-full px-3 py-2 text-sm border border-border rounded-md shadow-sm placeholder-muted-foreground bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
            />
          </div>

          {/* Surface Type */}
          <div>
            <label
              htmlFor="surface"
              className="block text-xs sm:text-sm font-semibold text-foreground mb-1.5 sm:mb-2"
            >
              Surface Type
            </label>
            <select
              id="surface"
              value={formData.surface}
              onChange={(e) =>
                setFormData({ ...formData, surface: e.target.value })
              }
              className="w-full px-3 py-2 text-sm border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
            >
              <option value="ARTIFICIAL_GRASS">Artificial Grass</option>
              <option value="CONCRETE">Concrete</option>
              <option value="SYNTHETIC">Synthetic</option>
            </select>
          </div>

          {/* Location */}
          <div>
            <label
              htmlFor="location"
              className="block text-xs sm:text-sm font-semibold text-foreground mb-1.5 sm:mb-2"
            >
              Location
            </label>
            <select
              id="location"
              value={formData.location}
              onChange={(e) =>
                setFormData({ ...formData, location: e.target.value })
              }
              className="w-full px-3 py-2 text-sm border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
            >
              <option value="INDOOR">Indoor</option>
              <option value="OUTDOOR">Outdoor</option>
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="description"
            className="block text-xs sm:text-sm font-semibold text-foreground mb-1.5 sm:mb-2"
          >
            Description
          </label>
          <textarea
            id="description"
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            placeholder="Optional description of the court..."
            rows={3}
            className="w-full px-3 py-2 text-sm border border-border rounded-md shadow-sm placeholder-muted-foreground bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary resize-none transition-colors"
          />
        </div>

        {/* Active Switch and Display Order */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 bg-muted/30 rounded-lg border border-border">
          {/* Active Switch */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setFormData({ ...formData, isActive: !formData.isActive })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shadow-sm ${
                formData.isActive ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background shadow transition-transform ${
                  formData.isActive ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <label className="text-sm font-semibold text-foreground">
              Court is Active
            </label>
          </div>

          {/* Display Order */}
          <div className="flex items-center gap-3">
            <label
              htmlFor="displayOrder"
              className="text-sm font-semibold text-foreground"
            >
              Display Order
            </label>
            <input
              id="displayOrder"
              type="number"
              className="w-20 px-3 py-2 text-sm border border-border rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
              value={formData.displayOrder}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  displayOrder: parseInt(e.target.value) || 0,
                })
              }
            />
          </div>
        </div>

        {/* Info Alert */}
        <div className="bg-info/10 border border-info/30 rounded-lg p-3 sm:p-4">
          <div className="flex gap-2 sm:gap-3">
            <div className="flex-shrink-0">
              <Info className="h-5 w-5 text-info" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm text-info font-medium leading-relaxed">
                Court pricing is managed through Pricing Rules. After creating
                the court, go to <strong>Courts → Pricing Rules</strong> to set
                up hourly rates and special discounts.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Buttons */}
      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-border">
        <button
          type="button"
          onClick={() => popModal()}
          disabled={loading}
          className="w-full sm:w-auto px-4 py-2 text-sm font-semibold text-foreground bg-background border border-border rounded-md shadow-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="w-full sm:w-auto px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary border border-transparent rounded-md shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Saving..." : court?.id ? "Update Court" : "Create Court"}
        </button>
      </div>
    </div>
  );
}

export default NewCourtModal;
