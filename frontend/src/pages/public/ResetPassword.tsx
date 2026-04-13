import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useState } from "react";
import useModal from "src/hooks/useModal";
import useNotification from "src/hooks/useNotification";
import { AuthService } from "src/services/authService";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Eye, EyeOff, Lock } from "lucide-react";

const authService = AuthService.getInstance();

const validationSchema = Yup.object({
  password: Yup.string()
    .min(8, "Password must be at least 8 characters")
    .required("Password is required"),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref("password")], "Passwords must match")
    .required("Please confirm your password"),
});

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { toaster } = useNotification();
  const { pushModal, popModal } = useModal();

  useEffect(() => {
    if (!token) {
      toaster("Reset link is invalid or has expired.", { variant: "error" });
      // navigate("/forgot-password", { replace: true });
    }
  }, [token, toaster, navigate]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const modalId = pushModal(<ResetPasswordModal token={token} />);

    return () => {
      popModal(modalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md text-center space-y-3">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-semibold">
          <Lock className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground">
          Secure password reset
        </h1>
        <p className="text-muted-foreground">
          Follow the steps in the dialog to choose a new password. This page
          will redirect once you finish.
        </p>
      </div>
    </div>
  );
}

interface ResetPasswordModalProps {
  token: string;
}

function ResetPasswordModal({ token }: ResetPasswordModalProps) {
  const { popModal } = useModal();
  const { toaster } = useNotification();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const formik = useFormik({
    initialValues: {
      password: "",
      confirmPassword: "",
    },
    validationSchema,
    onSubmit: async ({ password }) => {
      setSubmitting(true);
      try {
        await authService.resetPassword(token, password.trim());
        toaster(
          "Password updated successfully. Please sign in with the new password.",
          {
            variant: "success",
          }
        );
        popModal();
        navigate("/login", { replace: true });
      } catch (error) {
        console.error("Reset password failed", error);
        const axiosError = error as {
          response?: { data?: { message?: string } };
          message?: string;
        };
        const message =
          axiosError?.response?.data?.message ||
          axiosError?.message ||
          "Unable to reset password. The link may have expired.";
        toaster(message, { variant: "error" });
      } finally {
        setSubmitting(false);
      }
    },
  });

  const handleCancel = () => {
    popModal();
    navigate("/login");
  };

  return (
    <div
      className="w-full max-w-lg px-4"
      onClick={(event) => event.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <Card className="shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-semibold">
            Choose a new password
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Your new password must be at least 8 characters long.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={formik.handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                New password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter new password"
                  value={formik.values.password}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  className={
                    formik.touched.password && formik.errors.password
                      ? "border-destructive pr-10"
                      : "pr-10"
                  }
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {formik.touched.password && formik.errors.password && (
                <p className="text-sm text-destructive">
                  {formik.errors.password}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirm password
              </label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  placeholder="Re-enter new password"
                  value={formik.values.confirmPassword}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  className={
                    formik.touched.confirmPassword &&
                    formik.errors.confirmPassword
                      ? "border-destructive pr-10"
                      : "pr-10"
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {formik.touched.confirmPassword &&
                formik.errors.confirmPassword && (
                  <p className="text-sm text-destructive">
                    {formik.errors.confirmPassword}
                  </p>
                )}
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="sm:w-auto"
                onClick={handleCancel}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" className="sm:w-auto" disabled={submitting}>
                {submitting ? "Updating..." : "Update password"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default ResetPassword;
