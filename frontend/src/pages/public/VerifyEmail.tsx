import { useEffect, useState } from "react";
import { isCancel } from "axios";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import api from "src/utils/api";
import { formatDuration } from "src/utils/formatDuration";

interface VerificationState {
  status: "loading" | "success" | "error";
  message: string;
}

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<VerificationState>({
    status: "loading",
    message: "Verifying your email...",
  });
  const [canResend, setCanResend] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [email, setEmail] = useState("");
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(() => {
    // Check for existing cooldown on mount
    const stored = sessionStorage.getItem("verifyPageCooldown");
    if (!stored) return 0;

    try {
      const { expiresAt } = JSON.parse(stored);
      const now = Date.now();

      if (now < expiresAt) {
        return Math.ceil((expiresAt - now) / 1000);
      }
    } catch (e) {
      console.error("Failed to parse cooldown:", e);
    }

    sessionStorage.removeItem("verifyPageCooldown");
    return 0;
  });
  const [resendMessage, setResendMessage] = useState("");

  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      setState({
        status: "error",
        message: "Invalid verification link. No token provided.",
      });
      return;
    }

    // Check if this token was already processed in this session
    const key = `verify_token_${token}`;
    const storedResult = sessionStorage.getItem(key);

    if (storedResult) {
      try {
        const { status, message } = JSON.parse(storedResult);
        setState({ status, message });
        if (status === "error") {
          setCanResend(true);
        }
        return; // Already processed this token
      } catch {
        // Invalid stored data, clear it and proceed with verification
        sessionStorage.removeItem(key);
      }
    }

    const controller = new AbortController();
    let cancelled = false;

    const verifyEmail = async () => {
      try {
        const response = await api.get(
          `/auth/verify-email?token=${encodeURIComponent(token)}`,
          { signal: controller.signal as AbortSignal }
        );
        if (cancelled) return;

        const result = {
          status: "success" as const,
          message: response.data.message || "Email verified successfully!",
        };

        // Store the result for future reloads
        sessionStorage.setItem(key, JSON.stringify(result));
        setState(result);
      } catch (error: unknown) {
        if (isCancel(error)) return; // request aborted

        const axiosError = error as {
          response?: { data?: { message?: string } };
        };

        const result = {
          status: "error" as const,
          message:
            axiosError.response?.data?.message || "Email verification failed.",
        };

        // Store the error result for future reloads
        sessionStorage.setItem(key, JSON.stringify(result));
        setState(result);
        setCanResend(true);
      }
    };

    verifyEmail();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token]);

  // Cooldown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) {
      sessionStorage.removeItem("verifyPageCooldown");
      return;
    }

    const timer = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          sessionStorage.removeItem("verifyPageCooldown");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const handleResendClick = () => {
    if (cooldownSeconds > 0) return;
    setShowEmailInput(true);
  };

  const handleResend = async () => {
    if (!email.trim()) {
      setResendMessage("Please enter your email address");
      return;
    }

    if (cooldownSeconds > 0) return;

    setIsResending(true);
    setResendMessage("");

    try {
      const response = await api.post("/auth/resend-verification", {
        email: email.trim(),
      });

      setResendMessage(
        response.data.message ||
          "Verification email sent! Please check your inbox and spam folder."
      );

      // Set cooldown for 2 minutes and persist it
      const cooldownSecs = 120;
      const expiresAt = Date.now() + cooldownSecs * 1000;
      setCooldownSeconds(cooldownSecs);

      sessionStorage.setItem(
        "verifyPageCooldown",
        JSON.stringify({
          expiresAt,
          email: email.trim(),
        })
      );

      setShowEmailInput(false);
      setEmail("");
    } catch (error: unknown) {
      const axiosError = error as {
        response?: {
          status?: number;
          data?: {
            message?: string;
            retryAfter?: number;
          };
        };
      };

      // Handle rate limiting
      if (axiosError.response?.status === 429) {
        const retryAfter = axiosError.response.data?.retryAfter || 120;
        const minutes = Math.floor(retryAfter / 60);
        const formattedTime =
          retryAfter >= 60
            ? `${minutes} minute${minutes !== 1 ? "s" : ""}`
            : `${retryAfter} seconds`;

        // Persist the server-provided cooldown
        const expiresAt = Date.now() + retryAfter * 1000;
        setCooldownSeconds(retryAfter);

        sessionStorage.setItem(
          "verifyPageCooldown",
          JSON.stringify({
            expiresAt,
            email: email.trim(),
          })
        );

        setResendMessage(
          axiosError.response.data?.message ||
            `Too many requests. Please wait ${formattedTime}.`
        );
      } else {
        setResendMessage(
          axiosError.response?.data?.message ||
            "Failed to resend verification email. Please try again later."
        );
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {state.status === "loading" && (
            <>
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              </div>
              <CardTitle className="text-2xl">Verifying Email</CardTitle>
              <p className="text-muted-foreground">{state.message}</p>
            </>
          )}

          {state.status === "success" && (
            <>
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-green-600"
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
              <CardTitle className="text-2xl">Email Verified!</CardTitle>
              <p className="text-muted-foreground">{state.message}</p>
            </>
          )}

          {state.status === "error" && (
            <>
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
              </div>
              <CardTitle className="text-2xl">Verification Failed</CardTitle>
              <p className="text-muted-foreground">{state.message}</p>
            </>
          )}
        </CardHeader>

        <CardContent className="text-center">
          {state.status === "success" && (
            <div className="space-y-3">
              <Button onClick={() => navigate("/login")} className="w-full">
                Continue to Login
              </Button>
            </div>
          )}

          {state.status === "error" && (
            <div className="space-y-3">
              {canResend && (
                <>
                  {!showEmailInput ? (
                    <Button
                      onClick={handleResendClick}
                      disabled={isResending || cooldownSeconds > 0}
                      className="w-full"
                    >
                      {cooldownSeconds > 0
                        ? `Wait ${formatDuration(cooldownSeconds)} to resend`
                        : "Resend Verification Email"}
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-left space-y-2">
                        <label htmlFor="email" className="text-sm font-medium">
                          Enter your email address
                        </label>
                        <Input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="your.email@example.com"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleResend();
                            }
                          }}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleResend}
                          disabled={isResending || cooldownSeconds > 0}
                          className="flex-1"
                        >
                          {isResending ? (
                            <div className="flex items-center justify-center">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                              Sending...
                            </div>
                          ) : cooldownSeconds > 0 ? (
                            `Wait ${formatDuration(cooldownSeconds)}`
                          ) : (
                            "Send"
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowEmailInput(false);
                            setEmail("");
                            setResendMessage("");
                          }}
                          disabled={isResending}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {resendMessage && (
                    <div
                      className={`text-sm p-3 rounded-md ${
                        resendMessage.includes("sent") ||
                        resendMessage.includes("check")
                          ? "bg-green-50 text-green-800 border border-green-200"
                          : "bg-amber-50 text-amber-800 border border-amber-200"
                      }`}
                    >
                      {resendMessage}
                    </div>
                  )}
                </>
              )}
              <Button
                variant="outline"
                onClick={() => navigate("/register")}
                className="w-full"
              >
                Back to Registration
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate("/login")}
                className="w-full"
              >
                Try Login Instead
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default VerifyEmail;
