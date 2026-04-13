import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "src/redux/store";
import { ShieldCheck, KeyRound, Settings as SettingsIcon } from "lucide-react";
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
import { motion } from "framer-motion";
import OperatingHoursCard from "./OperatingHoursCard";

export default function ManagerSettings() {
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
        toaster("Two-factor authentication enabled successfully", {
          variant: "success",
        });
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
        toaster("Two-factor authentication disabled successfully", {
          variant: "success",
        });
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
            "2FA setup started. Check your email for setup instructions."
        );
        pushModal(
          <TwoFAModal
            onSubmit={(code) => enableMutation.mutate(code)}
            title="Enable Two-Factor Authentication"
            description="Enter the 6-digit code from your authenticator app to enable 2FA for your manager account."
            submitLabel={
              enableMutation.isLoading ? "Enabling..." : "Enable 2FA"
            }
            cancelLabel="Cancel"
          />
        );
      },
      onError: () => toaster("Failed to start 2FA setup", { variant: "error" }),
    }
  );

  const startTwoFASetup = () => {
    if (!setupMutation.isLoading) {
      setupMutation.mutate();
    }
  };

  const openDisableModal = () => {
    pushModal(
      <TwoFAModal
        onSubmit={(code) => disableMutation.mutate(code)}
        title="Disable Two-Factor Authentication"
        description="Enter your current 6-digit authenticator code to disable 2FA. This will remove the extra security layer from your manager account."
        submitLabel={disableMutation.isLoading ? "Disabling..." : "Disable 2FA"}
        cancelLabel="Cancel"
      />
    );
  };

  const isLoading =
    setupMutation.isLoading ||
    enableMutation.isLoading ||
    disableMutation.isLoading;

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background h-full overflow-auto">
      {/* Header */}
      <motion.div
        className="flex items-start md:items-center gap-3"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <SettingsIcon className="w-6 h-6 md:w-7 md:h-7 mt-1 md:mt-0" />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Security Settings
          </h1>
          <p className="text-muted-foreground text-xs md:text-sm">
            Manage security settings and two-factor authentication
          </p>
        </div>
      </motion.div>

      {/* 2FA Settings Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <Card className="shadow-md rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
              <ShieldCheck className="w-5 h-5 md:w-6 md:h-6 text-primary" />
              Two-Factor Authentication (2FA)
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Secure your manager account with an additional verification step.
              Required for sensitive operations like user management and
              financial data exports.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 md:space-y-6">
            {/* Current Status */}
            <motion.div
              className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-4 rounded-lg border border-border bg-muted/30"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <div className="space-y-2 flex-1">
                <p className="font-medium text-sm md:text-base">
                  Current Status:{" "}
                  {user?.twoFactorEnabled ? (
                    <span className="text-green-600 font-semibold">
                      Enabled ✓
                    </span>
                  ) : (
                    <span className="text-red-500 font-semibold">Disabled</span>
                  )}
                </p>
                <p className="text-xs md:text-sm text-muted-foreground">
                  {user?.twoFactorEnabled
                    ? "Your account is protected with 2FA. A verification code will be required for sensitive manager operations."
                    : "Enable 2FA to add an extra security layer to your manager account and protect sensitive operations."}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 lg:min-w-fit">
                {user?.twoFactorEnabled ? (
                  <motion.div
                    className="w-full sm:w-auto"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      variant="destructive"
                      onClick={openDisableModal}
                      disabled={isLoading}
                      className="w-full sm:min-w-[140px]"
                    >
                      {disableMutation.isLoading
                        ? "Disabling..."
                        : "Disable 2FA"}
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div
                    className="w-full sm:w-auto"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      onClick={startTwoFASetup}
                      disabled={isLoading}
                      className="w-full sm:min-w-[140px]"
                    >
                      <KeyRound className="w-4 h-4 mr-2" />
                      {setupMutation.isLoading ? "Setting up..." : "Enable 2FA"}
                    </Button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        <OperatingHoursCard />
      </motion.div>
    </div>
  );
}
