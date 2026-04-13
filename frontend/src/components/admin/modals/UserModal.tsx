/* eslint-disable @typescript-eslint/no-explicit-any */
// components/admin/users/UserModal.tsx
import { X, Save, Loader } from "lucide-react";
import { useMutation, useQueryClient } from "react-query";
import { userService } from "src/services/user.service";
import type {
  User,
  CreateUserInput,
  UpdateUserInput,
} from "src/types/user.types";
import useNotification from "src/hooks/useNotification";
import { useFormik } from "formik";
import * as Yup from "yup";
import useTwoFAPrompt from "src/hooks/useTwoFAPrompt";

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSuccess: () => void;
}

export default function UserModal({
  isOpen,
  onClose,
  user,
  onSuccess,
}: UserModalProps) {
  const queryClient = useQueryClient();
  const { toaster } = useNotification();
  const isEditing = !!user;
  const twoFAPrompt = useTwoFAPrompt();

  const createMutation = useMutation({
    mutationFn: async (payload: {
      data: CreateUserInput;
      twoFactorCode?: string;
    }) =>
      userService.createUser(payload.data, {
        twoFactorCode: payload.twoFactorCode,
      }),
    onSuccess: () => {
      toaster("User created successfully");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onSuccess();
    },
    onError: async (error: any, variables) => {
      const msg: string =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to create user";
      if (
        /two[- ]?factor|2fa/i.test(msg) ||
        /code is required/i.test(msg) ||
        [400, 401, 403].includes(error?.response?.status)
      ) {
        const code = await twoFAPrompt({
          title: "Authorize Creation",
          description:
            "Enter your 6-digit 2FA code to authorize creating a new user.",
          submitLabel: "Authorize",
        });
        if (!code) {
          toaster("Creation cancelled: 2FA code required", {
            variant: "error",
          });
          return;
        }
        try {
          await userService.createUser(variables.data, { twoFactorCode: code });
          toaster("User created successfully");
          queryClient.invalidateQueries({ queryKey: ["users"] });
          onSuccess();
          return;
        } catch (retryErr: any) {
          const retryMsg =
            retryErr?.response?.data?.message ||
            retryErr?.message ||
            "Failed to create user";
          toaster(retryMsg, { variant: "error" });
          return;
        }
      }
      toaster(msg, { variant: "error" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserInput }) =>
      userService.updateUser(id, data),
    onSuccess: () => {
      toaster("User updated successfully");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onSuccess();
    },
    onError: (error: any) => {
      toaster(error.response?.data?.message || "Failed to update user", {
        variant: "error",
      });
    },
  });

  const formik = useFormik<CreateUserInput | UpdateUserInput>({
    initialValues: {
      email: user?.email || "",
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      phone: user?.phone || "",
      role: user?.role || "CUSTOMER",
      isActive: user?.isActive ?? true,
      password: "",
      tags: user?.tags ?? [],
    },
    validationSchema: Yup.object({
      email: Yup.string()
        .email("Invalid email format")
        .required("Email is required"),
      firstName: Yup.string().required("First name is required"),
      lastName: Yup.string().required("Last name is required"),
      // Phone is optional, but if provided accept common KE formats (07..., 01..., +254...)
      // and general international formats (+[country][number]). Keep lenient since it's not critical.
      phone: Yup.string()
        .trim()
        .test(
          "valid-phone",
          "Enter a valid phone (e.g. 07XXXXXXXX, 01XXXXXXXX, +254XXXXXXXXX, or +[country code]...)",
          (value) => {
            if (!value) return true; // optional
            const v = value.trim();
            const digits = v.replace(/\D/g, "");

            // Accept Kenyan local formats 07XXXXXXXX or 01XXXXXXXX (10 digits)
            if (/^(07|01)\d{8}$/.test(digits)) return true;

            // Accept +254XXXXXXXXX (Kenya E.164)
            if (/^\+?254\d{9}$/.test(v.replace(/[^\d+]/g, ""))) return true;

            // Accept generic international in E.164: +[1-9][0-9]{6,14}
            const e164 = v.replace(/[^\d+]/g, "");
            if (/^\+[1-9]\d{6,14}$/.test(e164)) return true;

            // Fallback: allow 7-15 digits with common separators for other local formats
            const digitCount = digits.length;
            return digitCount >= 7 && digitCount <= 15;
          }
        ),
      password: !isEditing
        ? Yup.string()
            .min(8, "Password must be at least 8 characters")
            .required("Password is required")
        : Yup.string().notRequired(),
    }),
    enableReinitialize: true,
    onSubmit: async (values) => {
      // Sanitize optional phone: send undefined instead of empty string
      const submitValues = {
        ...values,
        phone: values.phone?.trim() || undefined,
      } as CreateUserInput & UpdateUserInput;
      if (isEditing && user) {
        await updateMutation.mutateAsync({
          id: user.id,
          data: submitValues as UpdateUserInput,
        });
      } else {
        await createMutation.mutateAsync({
          data: submitValues as CreateUserInput,
        });
      }
    },
  });

  const isLoading = createMutation.isLoading || updateMutation.isLoading;
  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="bg-card rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-border shadow-lg"
    >
      <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-card-foreground">
          {isEditing ? "Edit User" : "Create New User"}
        </h2>
        <button
          onClick={onClose}
          className="p-2 hover:bg-muted rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      <form onSubmit={formik.handleSubmit} className="p-6 space-y-6">
        {/* First Name */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              First Name *
            </label>
            <input
              type="text"
              {...formik.getFieldProps("firstName")}
              className={`w-full px-3 py-2.5 border rounded-lg ${
                formik.touched.firstName && formik.errors.firstName
                  ? "border-destructive"
                  : "border-input"
              }`}
              placeholder="Enter first name"
            />
            {formik.touched.firstName && formik.errors.firstName && (
              <p className="text-destructive text-xs mt-1">
                {formik.errors.firstName}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Last Name *
            </label>
            <input
              type="text"
              {...formik.getFieldProps("lastName")}
              className={`w-full px-3 py-2.5 border rounded-lg ${
                formik.touched.lastName && formik.errors.lastName
                  ? "border-destructive"
                  : "border-input"
              }`}
              placeholder="Enter last name"
            />
            {formik.touched.lastName && formik.errors.lastName && (
              <p className="text-destructive text-xs mt-1">
                {formik.errors.lastName}
              </p>
            )}
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium mb-2">Email *</label>
          <input
            type="email"
            {...formik.getFieldProps("email")}
            disabled={isEditing}
            className={`w-full px-3 py-2.5 border rounded-lg ${
              formik.touched.email && formik.errors.email
                ? "border-destructive"
                : "border-input"
            } ${isEditing ? "opacity-60 cursor-not-allowed" : ""}`}
            placeholder="Enter email"
          />
          {formik.touched.email && formik.errors.email && (
            <p className="text-destructive text-xs mt-1">
              {formik.errors.email}
            </p>
          )}
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium mb-2">Phone (optional)</label>
          <input
            type="tel"
            {...formik.getFieldProps("phone")}
            inputMode="tel"
            placeholder="e.g. 07XXXXXXXX, 01XXXXXXXX, +254XXXXXXXXX, +1 555 123 4567"
            className={`w-full px-3 py-2.5 border rounded-lg ${
              formik.touched.phone && formik.errors.phone
                ? "border-destructive"
                : "border-input"
            }`}
          />
          {formik.touched.phone && formik.errors.phone && (
            <p className="text-destructive text-xs mt-1">
              {formik.errors.phone}
            </p>
          )}
        </div>

        {/* Password (only when creating) */}
        {!isEditing && (
          <div>
            <label className="block text-sm font-medium mb-2">Password *</label>
            <input
              type="password"
              {...formik.getFieldProps("password")}
              className={`w-full px-3 py-2.5 border rounded-lg ${
                formik.touched.password && formik.errors.password
                  ? "border-destructive"
                  : "border-input"
              }`}
              placeholder="Enter password"
            />
            {formik.touched.password && formik.errors.password && (
              <p className="text-destructive text-xs mt-1">
                {formik.errors.password}
              </p>
            )}
          </div>
        )}

        {/* Role */}
        <div>
          <label className="block text-sm font-medium mb-2">User Role *</label>
          <select
            {...formik.getFieldProps("role")}
            className="w-full px-3 py-2.5 border border-input rounded-lg"
          >
            <option value="ADMIN">Admin</option>
            <option value="MANAGER">Manager</option>
            <option value="FINANCE_OFFICER">Finance Officer</option>
            <option value="BOOKING_OFFICER">Booking Officer</option>
            <option value="CUSTOMER">Customer</option>
          </select>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-6 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-border rounded-lg hover:bg-muted"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                {isEditing ? "Updating..." : "Creating..."}
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {isEditing ? "Update User" : "Create User"}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
