import { useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useNavigate } from "react-router-dom";
import useNotification from "src/hooks/useNotification";
import { AuthService } from "src/services/authService";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Button } from "src/components/ui/button";

const authService = AuthService.getInstance();

const validationSchema = Yup.object({
  email: Yup.string()
    .email("Enter a valid email address")
    .required("Email is required"),
});

function ForgotPassword() {
  const navigate = useNavigate();
  const { toaster } = useNotification();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const formik = useFormik({
    initialValues: { email: "" },
    validationSchema,
    onSubmit: async ({ email }) => {
      setLoading(true);
      try {
        await authService.requestPasswordReset(email.trim());
        setSubmitted(true);
        toaster(
          "If the email exists, we sent a reset link with the next steps.",
          { variant: "success" }
        );
      } catch (error: unknown) {
        console.error("Password reset request failed", error);
        const axiosError = error as {
          response?: { data?: { message?: string } };
          message?: string;
        };
        const message =
          axiosError?.response?.data?.message ||
          axiosError?.message ||
          "We couldn't process that request. Please try again.";
        toaster(message, { variant: "error" });
      } finally {
        setLoading(false);
      }
    },
  });

  if (submitted) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background p-3 sm:p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2 p-4 sm:p-6">
            <div className="flex justify-center">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl sm:text-2xl font-semibold">
                📧
              </div>
            </div>
            <CardTitle className="text-xl sm:text-2xl font-semibold">
              Check your inbox
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6 text-center text-sm sm:text-base text-muted-foreground p-4 sm:p-6">
            <p>
              We sent a secure link to{" "}
              <span className="font-medium break-words">
                {formik.values.email}
              </span>{" "}
              if it matches an account. Follow the link within the next hour to
              finish resetting your password.
            </p>
            <div className="space-y-3">
              <Button
                className="w-full h-10 sm:h-auto text-sm touch-manipulation"
                onClick={() => navigate("/login")}
              >
                Return to login
              </Button>
              <Button
                variant="outline"
                className="w-full h-10 sm:h-auto text-sm touch-manipulation"
                onClick={() => setSubmitted(false)}
              >
                Try another email
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-3 sm:p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2 p-4 sm:p-6">
          <div className="flex justify-center">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary text-white flex items-center justify-center text-xl sm:text-2xl font-bold">
              T
            </div>
          </div>
          <CardTitle className="text-2xl sm:text-3xl font-semibold">
            Forgot password
          </CardTitle>
          <p className="text-sm sm:text-base text-muted-foreground">
            Enter your email and we&apos;ll send a reset link if it matches an
            account.
          </p>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <form onSubmit={formik.handleSubmit} className="space-y-4">
            <div className="space-y-2 text-left">
              <label
                htmlFor="email"
                className="text-xs sm:text-sm font-medium leading-none"
              >
                Email address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={formik.values.email}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className={
                  formik.touched.email && formik.errors.email
                    ? "border-destructive"
                    : ""
                }
              />
              {formik.touched.email && formik.errors.email && (
                <p className="text-xs sm:text-sm text-destructive">
                  {formik.errors.email}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-10 sm:h-auto text-sm touch-manipulation"
              disabled={loading}
            >
              {loading ? "Sending link..." : "Send reset link"}
            </Button>

            <div className="text-center text-xs sm:text-sm text-muted-foreground">
              Remembered your password?{" "}
              <Button
                variant="link"
                onClick={() => navigate("/login")}
                className="p-0 h-auto text-xs sm:text-sm text-primary hover:text-primary/80 touch-manipulation"
              >
                Back to login
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default ForgotPassword;
