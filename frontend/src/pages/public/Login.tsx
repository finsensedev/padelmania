/* eslint-disable @typescript-eslint/no-explicit-any */
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "src/redux/store";

import { clearSession } from "src/redux/slicers/sessionSlice";
import { AuthService } from "src/services/authService";
import { useFormik } from "formik";
import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ChangeEvent,
} from "react";
import useNotification from "src/hooks/useNotification";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Button } from "src/components/ui/button";
import { resolvePostLoginPath } from "src/lib/route";
import type { UserRole } from "src/types/user.types";
import { Eye, EyeOff } from "lucide-react";
import { formatDuration } from "src/utils/formatDuration";

const authService = AuthService.getInstance();

function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [sessionPending, setSessionPending] = useState(true);
  const [canResend, setCanResend] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(() => {
    // Check for existing cooldown on mount
    const stored = sessionStorage.getItem("resendCooldown");
    if (!stored) return 0;

    try {
      const { expiresAt } = JSON.parse(stored);
      const now = Date.now();

      if (now < expiresAt) {
        const remainingSeconds = Math.ceil((expiresAt - now) / 1000);
        return remainingSeconds;
      }
    } catch (e) {
      console.error("Failed to parse cooldown:", e);
    }

    // Expired or invalid, clear it
    sessionStorage.removeItem("resendCooldown");
    return 0;
  });
  const [resendMessage, setResendMessage] = useState("");
  const { sessionActive } = useSelector(
    (state: RootState) => state.userSession
  );
  const dispatch: AppDispatch = useDispatch();
  const { user } = useSelector((state: RootState) => state.userState);
  const { toaster } = useNotification();
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Cooldown timer for resend button - Optimized with proper cleanup
  useEffect(() => {
    if (resendCooldown <= 0) {
      // Clear stored cooldown when it reaches 0
      sessionStorage.removeItem("resendCooldown");
      return;
    }

    const timer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          sessionStorage.removeItem("resendCooldown");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Check auth status - Optimized to prevent unnecessary checks
  useEffect(() => {
    if (loading) return;

    let isMounted = true;

    const checkAuthStatus = async () => {
      setSessionPending(true);
      try {
        await authService.waitForBootstrap();

        if (!isMounted) return;

        const isAuthenticated = authService.isAuthenticated();

        if (isAuthenticated && user) {
          const desired = sessionStorage.getItem("redirect");
          const target = resolvePostLoginPath(user.role, desired);
          navigate(target);
          return;
        }

        if (!isAuthenticated && sessionActive) {
          dispatch(clearSession());
        }
      } catch (error) {
        console.error("Auth check error:", error);
      } finally {
        if (isMounted) {
          setSessionPending(false);
        }
      }
    };

    void checkAuthStatus();

    return () => {
      isMounted = false;
    };
    // Only run when these specific values change
  }, [sessionActive, user, navigate, dispatch, loading]);

  // Load remembered email - Only runs once on mount
  useEffect(() => {
    const rememberedEmail = localStorage.getItem("rememberedEmail");
    if (rememberedEmail) {
      setRememberMe(true);
    }
  }, []);

  // Show cooldown message if there's an active cooldown on mount

  // Memoize validation function to prevent recreating on every render
  const validateForm = useCallback(
    ({ email, password }: { email: string; password: string }) => {
      const errors: { email?: string } = {};
      if (!email.trim() || !password.trim()) {
        errors.email = "Invalid email or password";
      }
      return errors;
    },
    []
  );

  // Memoize submit handler to prevent recreating on every render
  const handleSubmit = useCallback(
    async (
      { email, password }: { email: string; password: string },
      { setStatus, setErrors }: any
    ) => {
      setLoading(true);
      setStatus(undefined);
      setCanResend(false); // Reset on new login attempt

      try {
        const normalizedEmail = email.trim();
        const res = await authService.login({
          email: normalizedEmail,
          password,
        });

        if (rememberMe) {
          localStorage.setItem("rememberedEmail", normalizedEmail);
        } else {
          localStorage.removeItem("rememberedEmail");
        }

        // Block navigation if email is not verified
        if (!res.data.user.emailVerified) {
          await authService.logout();
          setCanResend(true);
          toaster(
            "Email not verified. Please use the verification link sent to your email.",
            { variant: "error" }
          );
          setStatus("Email not verified");
          return;
        }

        toaster("Login successful", { variant: "success" });

        const role = res.data.user.role as UserRole;
        const desired = sessionStorage.getItem("redirect");
        const target = resolvePostLoginPath(role, desired);
        navigate(target, { replace: true });
      } catch (error: any) {
        console.error("Login error:", error);

        let errorMessage = "Login failed";

        if (error.response?.status === 401) {
          errorMessage = "Invalid email or password";
        } else if (error.response?.data) {
          errorMessage =
            typeof error.response.data === "string"
              ? error.response.data
              : error.response.data.message ||
                error.response.data.error ||
                errorMessage;
        } else if (error.message) {
          errorMessage = error.message;
        }

        setErrors({});
        setStatus(errorMessage);
        toaster(errorMessage, { variant: "error" });
        setCanResend(/not verified/i.test(errorMessage));
      } finally {
        setLoading(false);
      }
    },
    [rememberMe, toaster, navigate]
  );

  const formik = useFormik({
    initialValues: {
      email: localStorage.getItem("rememberedEmail") || "",
      password: "",
    },
    validateOnBlur: false,
    validateOnChange: false,
    initialStatus: undefined as string | undefined,
    validate: validateForm,
    onSubmit: handleSubmit,
  });

  // Memoize reset function
  const resetInlineFeedback = useCallback(() => {
    if (formik.status || Object.keys(formik.errors).length > 0) {
      formik.setStatus(undefined);
      formik.setErrors({});
    }
  }, [formik]);

  // Memoize event handlers to prevent recreating functions
  const handleEmailChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      resetInlineFeedback();
      formik.handleChange(event);
    },
    [formik, resetInlineFeedback]
  );

  const handlePasswordChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      resetInlineFeedback();
      formik.handleChange(event);
    },
    [formik, resetInlineFeedback]
  );

  const handleResendVerification = useCallback(async () => {
    if (!formik.values.email) {
      toaster("Enter your email to resend verification.", { variant: "error" });
      return;
    }

    if (resendCooldown > 0) {
      toaster(
        `Please wait ${formatDuration(resendCooldown)} before resending.`,
        {
          variant: "error",
        }
      );
      return;
    }

    setResendLoading(true);
    setResendMessage("");

    try {
      const response: any = await authService.resendVerification(
        formik.values.email
      );
      const message =
        response?.data?.message ||
        "Verification email sent! Please check your inbox and spam folder.";

      setResendMessage(message);
      toaster(message, { variant: "success" });

      // Set cooldown for 2 minutes and persist it
      const cooldownSeconds = 120;
      const expiresAt = Date.now() + cooldownSeconds * 1000;
      setResendCooldown(cooldownSeconds);

      sessionStorage.setItem(
        "resendCooldown",
        JSON.stringify({
          expiresAt,
          email: formik.values.email,
        })
      );
    } catch (e: any) {
      if (e?.response?.status === 429) {
        const retryAfter = e?.response?.data?.retryAfter || 120;
        const minutes = Math.floor(retryAfter / 60);
        const formattedTime =
          retryAfter >= 60
            ? `${minutes} minute${minutes !== 1 ? "s" : ""}`
            : `${retryAfter} seconds`;

        const msg =
          e?.response?.data?.message ||
          `Too many requests. Please wait ${formattedTime}.`;

        // Persist the server-provided cooldown
        const expiresAt = Date.now() + retryAfter * 1000;
        setResendCooldown(retryAfter);

        sessionStorage.setItem(
          "resendCooldown",
          JSON.stringify({
            expiresAt,
            email: formik.values.email,
          })
        );

        setResendMessage(msg);
        toaster(msg, { variant: "error" });
      } else {
        const msg =
          e?.response?.data?.message ||
          e?.message ||
          "Failed to resend verification email.";
        setResendMessage(msg);
        toaster(msg, { variant: "error" });
      }
    } finally {
      setResendLoading(false);
    }
  }, [formik.values.email, resendCooldown, toaster]);

  // Memoize formatted duration for button text
  const buttonText = useMemo(() => {
    if (resendLoading) {
      return (
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
          Sending...
        </div>
      );
    }
    if (resendCooldown > 0) {
      return `Wait ${formatDuration(resendCooldown)} to resend`;
    }
    return "Resend verification email";
  }, [resendLoading, resendCooldown]);

  // Memoize message styling
  const messageClassName = useMemo(() => {
    const isSuccess =
      resendMessage.includes("sent") || resendMessage.includes("check");
    return `text-sm p-3 rounded-md ${
      isSuccess
        ? "bg-green-50 text-green-700 border border-green-200"
        : "bg-amber-50 text-amber-700 border border-amber-200"
    }`;
  }, [resendMessage]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-2xl">T</span>
            </div>
          </div>
          <CardTitle className="text-2xl">Login to Padel Mania</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={formik.handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={formik.values.email}
                onChange={handleEmailChange}
                placeholder="Email"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  autoComplete="on"
                  type={showPassword ? "text" : "password"}
                  value={formik.values.password}
                  onChange={handlePasswordChange}
                  placeholder="Password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="remember"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                  disabled={sessionPending}
                />
                <label
                  htmlFor="remember"
                  className="text-sm text-muted-foreground"
                >
                  Remember me
                </label>
              </div>
              <Button
                variant="link"
                type="button"
                onClick={() => navigate("/forgot-password")}
                className="p-0 h-auto text-primary hover:text-primary/80"
                disabled={sessionPending}
              >
                Forgot password?
              </Button>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || sessionPending}
            >
              {loading
                ? "Signing in..."
                : sessionPending
                ? "Loading..."
                : "Sign In"}
            </Button>

            {(formik.status ||
              (formik.submitCount > 0 && formik.errors.email)) && (
              <p className="text-sm text-destructive text-center">
                {formik.status ?? formik.errors.email}
              </p>
            )}

            {canResend && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={
                    resendLoading || resendCooldown > 0 || sessionPending
                  }
                  onClick={handleResendVerification}
                >
                  {buttonText}
                </Button>

                {resendMessage && (
                  <div className={messageClassName}>{resendMessage}</div>
                )}
              </>
            )}
          </form>

          <div className="mt-6 text-center text-sm">
            <p className="text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Button
                variant="link"
                onClick={() => navigate("/register")}
                className="p-0 h-auto text-primary hover:text-primary/80"
                disabled={sessionPending}
              >
                Sign up
              </Button>
            </p>
          </div>

          <div className="mt-8 text-center text-xs text-muted-foreground">
            Powered by{" "}
            <a
              href="https://www.finsense.co.ke/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-red-400 hover:text-red-500"
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

export default Login;
