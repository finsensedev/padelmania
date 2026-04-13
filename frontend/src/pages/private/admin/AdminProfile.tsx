/* eslint-disable @typescript-eslint/no-explicit-any */
// AdminProfile.tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "src/components/ui/tabs";
import { ShieldCheck, KeyRound } from "lucide-react";
import api from "src/utils/api";
import useNotification from "src/hooks/useNotification";
import { useMutation } from "react-query";
import { useSelector, useDispatch } from "react-redux";
import { updateUser } from "src/redux/slicers/userSlice";
import TwoFAModal from "src/components/TwoFAModal";
import useModal from "src/hooks/useModal";
import OperatingHoursCard from "../manager/OperatingHoursCard";

function AdminProfile() {
  const { toaster } = useNotification();
  const { user } = useSelector((state: any) => state.userState);
  const dispatch = useDispatch();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const { pushModal, popModal } = useModal();

  // Helper to refresh full profile after mutations
  const refreshProfile = async () => {
    try {
      const { data } = await api.get("/user/profile");
      dispatch(updateUser(data));
    } catch (e) {
      console.warn("Failed to refresh profile", e);
    }
  };

  const enableMutation = useMutation(
    async (code: string) => api.post("/user/2fa/enable", { code }),
    {
      onSuccess: async () => {
        dispatch(updateUser({ twoFactorEnabled: true })); // optimistic
        await refreshProfile();
        popModal();
        toaster("Two-factor authentication enabled", { variant: "success" });
      },
      onError: (e: any) => {
        const msg =
          e?.response?.data?.message || e?.message || "Failed to enable 2FA";
        toaster(msg, { variant: "error" });
      },
    }
  );

  const disableMutation = useMutation(
    async (code: string) => api.post("/user/2fa/disable", { code }),
    {
      onSuccess: async () => {
        dispatch(updateUser({ twoFactorEnabled: false })); // optimistic
        await refreshProfile();
        popModal();
        toaster("Two-factor authentication disabled", { variant: "success" });
      },
      onError: (e: any) => {
        const msg = e?.response?.data?.message || "Failed to disable 2FA";
        toaster(msg, { variant: "error" });
      },
    }
  );

  const setupMutation = useMutation(
    async () => {
      const res = await api.post("/user/2fa/setup");
      return res.data;
    },
    {
      onSuccess: (data) => {
        const msg =
          data?.message ||
          "2FA setup started. Check your email for the secret and instructions.";
        toaster(msg);
        pushModal(
          <TwoFAModal
            onSubmit={(code) => enableMutation.mutate(code)}
            title="Enable Two-Factor Authentication"
            description="Enter the 6-digit code from your authenticator app to enable 2FA."
            submitLabel={enableMutation.isLoading ? "Enabling..." : "Enable"}
            cancelLabel="Cancel"
          />
        );
      },
      onError: () => {
        toaster("Failed to start 2FA setup", { variant: "error" });
      },
    }
  );

  const startTwoFASetup = () => {
    if (setupMutation.isLoading) return;
    setupMutation.mutate();
  };

  const openDisableModal = () => {
    pushModal(
      <TwoFAModal
        onSubmit={(code) => disableMutation.mutate(code)}
        title="Disable Two-Factor Authentication"
        description="Confirm disabling 2FA by entering your current 6-digit code. This removes the extra security layer."
        submitLabel={disableMutation.isLoading ? "Disabling..." : "Disable"}
        cancelLabel="Cancel"
      />
    );
  };

  const isLoading =
    setupMutation.isLoading ||
    enableMutation.isLoading ||
    disableMutation.isLoading;

  return (
    <div className="p-6 space-y-6 bg-background min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Profile</h1>
          <p className="text-muted-foreground mt-1">
            Secure your account with advanced settings
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="security" className="space-y-4">
        <TabsList>
          <TabsTrigger value="security">Security</TabsTrigger>
          {isSuperAdmin ? (
            <TabsTrigger value="system">System Config</TabsTrigger>
          ) : null}
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
                        user.twoFactorEnabled
                          ? "text-green-600"
                          : "text-red-500"
                      }
                    >
                      {user.twoFactorEnabled ? "Enabled" : "Disabled"}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {user.twoFactorEnabled
                      ? "You'll be asked for a code from your authenticator app during sensitive actions."
                      : "Set up 2FA to protect your account with an extra step at sign-in and sensitive actions."}
                  </p>
                </div>
                {user.twoFactorEnabled ? (
                  <Button
                    variant="destructive"
                    onClick={openDisableModal}
                    disabled={isLoading}
                  >
                    {disableMutation.isLoading ? "Disabling..." : "Disable 2FA"}
                  </Button>
                ) : (
                  <Button
                    onClick={startTwoFASetup}
                    disabled={isLoading || setupMutation.isLoading}
                  >
                    <KeyRound className="w-4 h-4 mr-2" />
                    {setupMutation.isLoading ? "Starting..." : "Start Setup"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {isSuperAdmin ? (
          <TabsContent value="system" className="space-y-4">
            <OperatingHoursCard />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

export default AdminProfile;
