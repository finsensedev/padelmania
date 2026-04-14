/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useFormik } from "formik";
import * as Yup from "yup";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import api from "src/utils/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Button } from "src/components/ui/button";
import useModal from "src/hooks/useModal";
import { Eye, EyeOff, FileText, ExternalLink } from "lucide-react";
import { TermsContent } from "src/components/shared/TermsContent";

const registerSchema = Yup.object({
  firstName: Yup.string().required("First name is required"),
  lastName: Yup.string().required("Last name is required"),
  email: Yup.string().email("Invalid email").required("Email is required"),
  phone: Yup.string().required("Phone number is required"),
  password: Yup.string()
    .min(8, "Password must be at least 8 characters")
    .required("Password is required"),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref("password")], "Passwords must match")
    .required("Please confirm your password"),
});

function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const referralCode = searchParams.get("ref");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const { pushModal } = useModal();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  const formik = useFormik({
    initialValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
    },
    validationSchema: registerSchema,
    onSubmit: async (values) => {
      setSubmitError("");
      try {
        await api.post("/auth/register", {
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          phone: values.phone || undefined,
          password: values.password,
          referralCode: referralCode || undefined,
        });
        setIsSubmitted(true);
      } catch (error: unknown) {
        const axiosError = error as {
          response?: { data?: { message?: string } };
        };
        setSubmitError(
          axiosError.response?.data?.message ||
            "Registration failed. Please try again.",
        );
      }
    },
  });

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-3 sm:p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center p-4 sm:p-6">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 sm:w-16 sm:h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <svg
                  className="w-7 h-7 sm:w-8 sm:h-8 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </div>
            <CardTitle className="text-xl sm:text-2xl">
              Check Your Email
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center p-4 sm:p-6">
            <p className="text-sm sm:text-base text-muted-foreground mb-4">
              We've sent a verification link to{" "}
              <span className="font-medium break-words">
                {formik.values.email}
              </span>
              . Click the link in your email to verify your account.
            </p>
            <div
              className="bg-white dark:bg-white/5 border border-border rounded-lg p-3 mb-6 text-left"
              style={{ borderLeft: "3px solid hsl(268 68% 45%)" }}
            >
              <p className="text-xs sm:text-sm text-foreground font-semibold mb-1">
                Can't find the email?
              </p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>
                  Check your <strong className="text-foreground">Spam</strong>{" "}
                  or <strong className="text-foreground">Junk</strong> folder
                </li>
                <li>
                  If you use iCloud, Apple Mail, or Outlook, the email may take
                  a few minutes
                </li>
                <li>
                  Make sure{" "}
                  <strong className="text-foreground">
                    {formik.values.email}
                  </strong>{" "}
                  is correct
                </li>
              </ul>
            </div>
            <div className="space-y-3">
              <Button
                onClick={() => navigate("/login")}
                className="w-full h-10 sm:h-auto text-sm touch-manipulation"
              >
                Go to Login
              </Button>
              <Button
                onClick={async () => {
                  setResendLoading(true);
                  setResendMessage("");
                  try {
                    await api.post("/auth/resend-verification", {
                      email: formik.values.email,
                    });
                    setResendMessage(
                      "Verification email resent! Check your inbox.",
                    );
                  } catch {
                    setResendMessage(
                      "Failed to resend. Please try again later.",
                    );
                  } finally {
                    setResendLoading(false);
                  }
                }}
                variant="outline"
                disabled={resendLoading}
                className="w-full h-10 sm:h-auto text-sm touch-manipulation"
              >
                {resendLoading ? "Sending..." : "Resend Verification Email"}
              </Button>
              {resendMessage && (
                <p className="text-xs text-muted-foreground">{resendMessage}</p>
              )}
              <Button
                onClick={() => setIsSubmitted(false)}
                variant="ghost"
                className="w-full h-10 sm:h-auto text-sm touch-manipulation"
              >
                Back to Registration
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
        <CardHeader className="text-center p-4 sm:p-6">
          <div className="flex justify-center mb-3 sm:mb-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-primary rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-xl sm:text-2xl">
                T
              </span>
            </div>
          </div>
          <CardTitle className="text-2xl sm:text-3xl font-bold">
            Create Account
          </CardTitle>
          <p className="text-sm sm:text-base text-muted-foreground">
            Join Padel Mania today
          </p>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();

              formik.handleSubmit(e);
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label
                  htmlFor="firstName"
                  className="text-xs sm:text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  First Name
                </label>
                <Input
                  id="firstName"
                  name="firstName"
                  type="text"
                  placeholder="First name"
                  className={
                    formik.touched.firstName && formik.errors.firstName
                      ? "border-destructive"
                      : ""
                  }
                  value={formik.values.firstName}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                />
                {formik.touched.firstName && formik.errors.firstName && (
                  <p className="text-sm text-destructive">
                    {formik.errors.firstName}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="lastName"
                  className="text-xs sm:text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Last Name
                </label>
                <Input
                  id="lastName"
                  name="lastName"
                  type="text"
                  placeholder="Last name"
                  className={
                    formik.touched.lastName && formik.errors.lastName
                      ? "border-destructive"
                      : ""
                  }
                  value={formik.values.lastName}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                />
                {formik.touched.lastName && formik.errors.lastName && (
                  <p className="text-sm text-destructive">
                    {formik.errors.lastName}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-xs sm:text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Email Address
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Email address"
                className={
                  formik.touched.email && formik.errors.email
                    ? "border-destructive"
                    : ""
                }
                value={formik.values.email}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
              />
              {formik.touched.email && formik.errors.email && (
                <p className="text-sm text-destructive">
                  {formik.errors.email}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="phone"
                className="text-xs sm:text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Phone Number
              </label>
              <PhoneInput
                international
                defaultCountry="KE"
                placeholder="Enter phone number"
                value={formik.values.phone}
                onChange={(value) => formik.setFieldValue("phone", value || "")}
                onBlur={() => formik.setFieldTouched("phone", true)}
                className={`phone-input-custom bg-input/30 focus:outline-none px-1 py-2 rounded-md border border-border ${
                  formik.touched.phone && formik.errors.phone
                    ? "border-destructive"
                    : ""
                }`}
              />
              {formik.touched.phone && formik.errors.phone && (
                <p className="text-sm text-destructive">
                  {formik.errors.phone}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="text-xs sm:text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Password"
                  className={
                    formik.touched.password && formik.errors.password
                      ? "border-destructive pr-10"
                      : "pr-10"
                  }
                  value={formik.values.password}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
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
              <label
                htmlFor="confirmPassword"
                className="text-xs sm:text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Confirm Password
              </label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Confirm password"
                  className={
                    formik.touched.confirmPassword &&
                    formik.errors.confirmPassword
                      ? "border-destructive pr-10"
                      : "pr-10"
                  }
                  value={formik.values.confirmPassword}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                </button>
              </div>
              {formik.touched.confirmPassword &&
                formik.errors.confirmPassword && (
                  <p className="text-sm text-destructive">
                    {formik.errors.confirmPassword}
                  </p>
                )}
            </div>

            <div className="space-y-3">
              <div className="flex items-start space-x-2 sm:space-x-3">
                <input
                  type="checkbox"
                  id="acceptTerms"
                  name="acceptTerms"
                  readOnly
                  onClick={() => {
                    // Open modal to read terms; accepting there will mark acceptTerms and submit
                    pushModal(<TermsAndConditionsModal formik={formik} />);
                  }}
                  className={`h-4 w-4 text-primary focus:ring-primary border-border rounded mt-0.5 sm:mt-1 cursor-pointer touch-manipulation`}
                />
                <div className="flex-1 min-w-0">
                  <label
                    htmlFor="acceptTerms"
                    className="text-xs sm:text-sm text-muted-foreground cursor-pointer leading-relaxed"
                  >
                    I agree to the{" "}
                    <span className="text-primary hover:text-primary/80 underline font-medium">
                      Terms and Conditions & Privacy Policy
                    </span>
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-muted-foreground/80">
                      Click above to read our terms, or{" "}
                      <button
                        type="button"
                        onClick={() =>
                          window.open("/terms-and-conditions", "_blank")
                        }
                        className="text-primary hover:text-primary/80 underline inline-flex items-center gap-1 touch-manipulation"
                      >
                        view full page
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {submitError && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive px-3 sm:px-4 py-2 sm:py-3 rounded-md text-xs sm:text-sm">
                {submitError}
              </div>
            )}

            <div className="text-center">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Already have an account?{" "}
                <Button
                  variant="link"
                  onClick={() => navigate("/login")}
                  className="p-0 h-auto text-xs sm:text-sm text-primary hover:text-primary/80 touch-manipulation"
                >
                  Sign in
                </Button>
              </p>
            </div>
          </form>
          <div className="mt-6 sm:mt-8 text-center text-xs text-muted-foreground">
            Powered by{" "}
            <a
              href="https://www.finsense.co.ke/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-destructive hover:text-destructive/80 touch-manipulation"
            >
              FinSense Africa
            </a>{" "}
            ❤️⚡
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default Register;

const TermsAndConditionsModal = ({ formik }: { formik: any }) => {
  const { popModal } = useModal();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [isButtonClicked, setIsButtonClicked] = useState(false);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (element) {
      const { scrollTop, scrollHeight, clientHeight } = element;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
      setHasScrolledToBottom(isAtBottom);
    }
  };

  useEffect(() => {
    const element = scrollRef.current;
    if (element) {
      element.addEventListener("scroll", handleScroll);
      return () => element.removeEventListener("scroll", handleScroll);
    }
  }, []);

  const handleAccept = async () => {
    try {
      setIsButtonClicked(true);
      await new Promise((resolve) => setTimeout(resolve, 100));

      //   await formik.validateForm();
      await formik.submitForm();

      popModal();
    } catch (error) {
      console.error("Error during form submission:", error);
      popModal();
    } finally {
      setIsButtonClicked(false);
    }
  };

  const handleCancel = () => {
    popModal();
  };

  const openFullPage = () => {
    window.open("/terms-and-conditions", "_blank");
  };

  return (
    <div
      className="w-full bg-background max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden mx-1 sm:mx-4 my-1 sm:my-4 rounded-xl shadow-2xl border border-border"
      onClick={(e) => e.stopPropagation()}
    >
      <CardHeader className="px-3 sm:px-6 py-3 sm:py-5 border-b border-border bg-gradient-to-r from-primary/5 to-accent/5">
        <div className="flex items-start sm:items-center justify-between gap-2">
          <div className="flex items-start sm:items-center gap-2 sm:gap-3 flex-1">
            <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg flex-shrink-0">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-sm sm:text-lg lg:text-xl font-semibold leading-tight">
                Terms and Conditions & Privacy Policy
              </CardTitle>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 leading-tight">
                Please review our terms before creating your account
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={openFullPage}
            className="flex items-center gap-1 sm:gap-2 text-xs px-2 sm:px-3 py-1 sm:py-2 flex-shrink-0"
          >
            <ExternalLink className="w-3 h-3" />
            <span className="hidden sm:inline">Full Page</span>
            <span className="sm:hidden">Full</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
        <div
          ref={scrollRef}
          className="max-h-60 sm:max-h-72 lg:max-h-80 overflow-y-auto border border-muted/50 rounded-lg p-3 sm:p-5 mb-3 sm:mb-4 bg-muted/20 touch-manipulation"
          style={{
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "thin",
          }}
          onScroll={handleScroll}
        >
          <TermsContent compact />
        </div>

        {!hasScrolledToBottom && (
          <div className="bg-primary/10 border border-primary/30 rounded-md p-2 sm:p-3 mb-3 sm:mb-4">
            <p className="text-xs sm:text-sm text-foreground font-medium text-center leading-tight">
              Please scroll to the bottom to enable Accept & Create Account
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:gap-3">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="w-full h-10 sm:h-11 touch-manipulation text-sm"
            disabled={formik.isSubmitting || isButtonClicked}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAccept}
            disabled={
              !hasScrolledToBottom || formik.isSubmitting || isButtonClicked
            }
            className="w-full h-10 sm:h-11 relative transition-all duration-200 hover:shadow-lg disabled:shadow-none touch-manipulation text-sm"
          >
            {formik.isSubmitting || isButtonClicked ? (
              <div className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span>
                  {isButtonClicked && !formik.isSubmitting
                    ? "Processing..."
                    : "Creating Account..."}
                </span>
              </div>
            ) : (
              "Accept & Create Account"
            )}
          </Button>
        </div>
      </CardContent>
    </div>
  );
};
