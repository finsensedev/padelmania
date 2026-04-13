/* eslint-disable @typescript-eslint/no-explicit-any */
// Profile.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "src/components/ui/tabs";
import { ShieldCheck, KeyRound } from "lucide-react";
import api from "src/utils/api";
import useNotification from "src/hooks/useNotification";

function Profile() {
  const navigate = useNavigate();
  const { toaster } = useNotification();

  // 2FA State
  const [twoFAEnabled, setTwoFAEnabled] = useState<boolean>(false);
  const [twoFASecret, setTwoFASecret] = useState<string | null>(null);
  const [twoFACode, setTwoFACode] = useState<string>("");
  const [twoFALoading, setTwoFALoading] = useState<boolean>(false);

  // 2FA Handlers
  const startTwoFASetup = async () => {
    setTwoFALoading(true);
    try {
      const res = await api.post("/user/2fa/setup");
      setTwoFASecret("__pending__");
      toaster(
        res.data?.message ||
          "2FA setup started. Check your email for the secret and instructions."
      );
    } catch (e) {
      console.error(e);
      toaster("Failed to start 2FA setup", { variant: "error" });
    } finally {
      setTwoFALoading(false);
    }
  };

  const enableTwoFA = async () => {
    if (!twoFACode || twoFACode.trim().length < 6) {
      toaster("Enter the 6-digit code from your Authenticator app", {
        variant: "error",
      });
      return;
    }
    setTwoFALoading(true);
    try {
      await api.post("/user/2fa/enable", { code: twoFACode.trim() });
      setTwoFAEnabled(true);
      setTwoFASecret(null);
      setTwoFACode("");
      toaster("Two-factor authentication enabled", { variant: "success" });
    } catch (e: any) {
      const msg =
        e?.response?.data?.message || e?.message || "Failed to enable 2FA";
      toaster(msg, { variant: "error" });
    } finally {
      setTwoFALoading(false);
    }
  };

  const disableTwoFA = async () => {
    if (!confirm("Disable two-factor authentication?")) return;
    setTwoFALoading(true);
    try {
      await api.post("/user/2fa/disable");
      setTwoFAEnabled(false);
      setTwoFASecret(null);
      setTwoFACode("");
      toaster("Two-factor authentication disabled", { variant: "success" });
    } catch (e) {
      console.error(e);
      toaster("Failed to disable 2FA", { variant: "error" });
    } finally {
      setTwoFALoading(false);
    }
  };

  // Secret is not displayed; it's sent to the user's email instead

  return (
    <div className="p-6 space-y-6 bg-background min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">My Profile</h1>
          <p className="text-muted-foreground mt-1">
            Secure your account with advanced settings
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate("/customer/bookings")}
        >
          View My Bookings
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="security" className="space-y-4">
        <TabsList>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        {/* Security Tab Only */}
        <TabsContent value="security" className="space-y-4">
          <Card className="shadow-md rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Two-Factor Authentication (2FA)
              </CardTitle>
              <CardDescription>
                Add an extra layer of security to your account using an
                authenticator app
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div>
                  <p className="font-medium">
                    Status:{" "}
                    <span
                      className={
                        twoFAEnabled ? "text-green-600" : "text-red-500"
                      }
                    >
                      {twoFAEnabled ? "Enabled" : "Disabled"}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {twoFAEnabled
                      ? "You'll be asked for a code from your authenticator app during sensitive actions."
                      : "Set up 2FA to protect your account with an extra step at sign-in and sensitive actions."}
                  </p>
                </div>
                {twoFAEnabled ? (
                  <Button
                    variant="destructive"
                    onClick={disableTwoFA}
                    disabled={twoFALoading}
                  >
                    {twoFALoading ? "Disabling..." : "Disable 2FA"}
                  </Button>
                ) : (
                  <Button onClick={startTwoFASetup} disabled={twoFALoading}>
                    <KeyRound className="w-4 h-4 mr-2" />
                    {twoFALoading ? "Starting..." : "Start Setup"}
                  </Button>
                )}
              </div>

              {/* Setup Section */}
              {twoFASecret !== null && !twoFAEnabled && (
                <div className="space-y-3 p-4 rounded-lg border bg-muted/20 shadow-sm">
                  <p className="text-sm text-muted-foreground">
                    We have emailed your 2FA secret and an otpauth link to your
                    registered email. Add it to Google Authenticator, 1Password,
                    or Authy, then enter the 6‑digit code below.
                  </p>
                  <div>
                    <Label>Authenticator code</Label>
                    <Input
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="123456"
                      value={twoFACode}
                      onChange={(e) =>
                        setTwoFACode(
                          e.target.value.replace(/\D/g, "").slice(0, 6)
                        )
                      }
                      disabled={twoFALoading}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={enableTwoFA} disabled={twoFALoading}>
                      {twoFALoading ? "Enabling..." : "Enable 2FA"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTwoFASecret(null);
                        setTwoFACode("");
                      }}
                      disabled={twoFALoading}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default Profile;
