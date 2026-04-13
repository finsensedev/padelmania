import { useSelector, useDispatch } from "react-redux";
import { motion } from "framer-motion";
import type { RootState } from "src/redux/store";
import { ShieldCheck, KeyRound } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import api from "src/utils/api";
import useNotification from "src/hooks/useNotification";
import { useMutation } from "react-query";
import { updateUser } from "src/redux/slicers/userSlice";
import TwoFAModal from "src/components/TwoFAModal";
import useModal from "src/hooks/useModal";

export default function FinanceOfficerSecurity() {
  const { user } = useSelector((s: RootState) => s.userState);
  const dispatch = useDispatch();
  const { toaster } = useNotification();
  const { pushModal, popModal } = useModal();

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
        dispatch(updateUser({ twoFactorEnabled: true }));
        await refreshProfile();
        popModal();
        toaster("Two-factor authentication enabled", { variant: "success" });
      },
      onError: (e: unknown) => {
        let msg = "Failed to enable 2FA";
        interface ErrLike {
          response?: { data?: { message?: string } };
          message?: string;
        }
        if (typeof e === "object" && e) {
          const maybe = e as ErrLike;
          msg = maybe.response?.data?.message || maybe.message || msg;
        }
        toaster(msg, { variant: "error" });
      },
    }
  );

  const disableMutation = useMutation(
    async (code: string) => api.post("/user/2fa/disable", { code }),
    {
      onSuccess: async () => {
        dispatch(updateUser({ twoFactorEnabled: false }));
        await refreshProfile();
        popModal();
        toaster("Two-factor authentication disabled", { variant: "success" });
      },
      onError: (e: unknown) => {
        let msg = "Failed to disable 2FA";
        interface ErrLike {
          response?: { data?: { message?: string } };
        }
        if (typeof e === "object" && e) {
          const maybe = e as ErrLike;
          msg = maybe.response?.data?.message || msg;
        }
        toaster(msg, { variant: "error" });
      },
    }
  );

  const setupMutation = useMutation(
    async () => (await api.post("/user/2fa/setup")).data,
    {
      onSuccess: (data) => {
        toaster(
          data?.message ||
            "2FA setup started. Check your email for the secret/instructions."
        );
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
      onError: () => toaster("Failed to start 2FA setup", { variant: "error" }),
    }
  );

  const startTwoFASetup = () => {
    if (!setupMutation.isLoading) setupMutation.mutate();
  };
  const openDisableModal = () => {
    pushModal(
      <TwoFAModal
        onSubmit={(code) => disableMutation.mutate(code)}
        title="Disable Two-Factor Authentication"
        description="Enter your current 6-digit code to disable 2FA."
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
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 bg-background min-h-screen">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          Security
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Manage two-factor authentication for added protection
        </p>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card className="shadow-md rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Two-Factor Authentication (2FA)
            </CardTitle>
            <CardDescription>
              Secure sensitive financial exports with an additional verification
              step.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-3 md:p-4 rounded-lg border border-border bg-muted/30">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm md:text-base">
                  Status:{" "}
                  {user?.twoFactorEnabled ? (
                    <span className="text-green-600">Enabled</span>
                  ) : (
                    <span className="text-red-500">Disabled</span>
                  )}
                </p>
                <p className="text-xs md:text-sm text-muted-foreground mt-1">
                  {user?.twoFactorEnabled
                    ? "A valid 2FA code will be required before downloading or exporting data."
                    : "Enable 2FA to require a verification code before exports and sensitive actions."}
                </p>
              </div>
              {user?.twoFactorEnabled ? (
                <Button
                  variant="destructive"
                  onClick={openDisableModal}
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                >
                  {disableMutation.isLoading ? "Disabling..." : "Disable 2FA"}
                </Button>
              ) : (
                <Button
                  onClick={startTwoFASetup}
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                >
                  <KeyRound className="w-4 h-4 mr-2" />
                  {setupMutation.isLoading ? "Starting..." : "Start Setup"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
