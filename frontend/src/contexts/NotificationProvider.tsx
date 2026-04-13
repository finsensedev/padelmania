import { createContext, useCallback } from "react";
import {
  SnackbarProvider,
  useSnackbar,
  type OptionsObject,
  type SnackbarKey,
  MaterialDesignContent,
} from "notistack";
import { styled } from "@mui/material/styles";
import { useTheme } from "./useTheme";

type NotificationOptions = OptionsObject & { dedupeKey?: SnackbarKey };

type NotificationContextType = {
  toaster: (message: string, options?: NotificationOptions) => void;
};

// eslint-disable-next-line react-refresh/only-export-components
export const NotificationContext = createContext<NotificationContextType>({
  toaster: () => {},
});

function NotificationContextBridge({
  children,
}: {
  children: React.ReactNode;
}) {
  const { enqueueSnackbar } = useSnackbar();

  const toaster = useCallback(
    (message: string, options?: NotificationOptions) => {
      const {
        variant = "default",
        autoHideDuration = 5000,
        preventDuplicate,
        key,
        dedupeKey,
        ...rest
      } = options || {};

      const inferredKey: SnackbarKey =
        key || dedupeKey || `${variant}:${message}`;

      enqueueSnackbar(message, {
        variant,
        autoHideDuration,
        preventDuplicate: preventDuplicate ?? true,
        key: inferredKey,
        ...rest,
      });
    },
    [enqueueSnackbar]
  );

  return (
    <NotificationContext.Provider value={{ toaster }}>
      {children}
    </NotificationContext.Provider>
  );
}

// Styled Material Design Content for Light Theme
const StyledMaterialDesignContentLight = styled(MaterialDesignContent)(() => ({
  "&.notistack-MuiContent": {
    backgroundColor: "hsl(0 0% 100%)",
    color: "hsl(240 10% 3.9%)",
    border: "1px solid hsl(240 4.8% 85%)",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    borderRadius: "8px",
    fontFamily: "inherit",
  },
  "&.notistack-MuiContent-success": {
    backgroundColor: "hsl(155 55% 32%)",
    color: "hsl(0 0% 98%)",
    borderColor: "hsl(155 55% 42%)",
  },
  "&.notistack-MuiContent-error": {
    backgroundColor: "hsl(0 72.2% 50.6%)",
    color: "hsl(0 0% 98%)",
    borderColor: "hsl(0 72.2% 60.6%)",
  },
  "&.notistack-MuiContent-warning": {
    backgroundColor: "hsl(38 92% 50%)",
    color: "hsl(240 10% 3.9%)",
    borderColor: "hsl(38 92% 60%)",
  },
  "&.notistack-MuiContent-info": {
    backgroundColor: "hsl(217 91% 60%)",
    color: "hsl(0 0% 98%)",
    borderColor: "hsl(217 91% 70%)",
  },
}));

// Styled Material Design Content for Dark Theme
const StyledMaterialDesignContentDark = styled(MaterialDesignContent)(() => ({
  "&.notistack-MuiContent": {
    backgroundColor: "hsl(240 3.7% 15.9%)",
    color: "hsl(0 0% 98%)",
    border: "1px solid hsl(240 3.7% 25%)",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
    borderRadius: "8px",
    fontFamily: "inherit",
  },
  "&.notistack-MuiContent-success": {
    backgroundColor: "hsl(155 55% 38%)",
    color: "hsl(0 0% 98%)",
    borderColor: "hsl(155 55% 48%)",
  },
  "&.notistack-MuiContent-error": {
    backgroundColor: "hsl(0 62.8% 40%)",
    color: "hsl(0 0% 98%)",
    borderColor: "hsl(0 62.8% 50%)",
  },
  "&.notistack-MuiContent-warning": {
    backgroundColor: "hsl(38 92% 45%)",
    color: "hsl(0 0% 98%)",
    borderColor: "hsl(38 92% 55%)",
  },
  "&.notistack-MuiContent-info": {
    backgroundColor: "hsl(217 91% 55%)",
    color: "hsl(0 0% 98%)",
    borderColor: "hsl(217 91% 65%)",
  },
}));

function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();

  // Select the appropriate styled component based on theme
  const StyledContent =
    theme === "dark"
      ? StyledMaterialDesignContentDark
      : StyledMaterialDesignContentLight;

  return (
    <SnackbarProvider
      maxSnack={4}
      anchorOrigin={{ vertical: "top", horizontal: "center" }}
      autoHideDuration={5000}
      preventDuplicate
      Components={{
        default: StyledContent,
        success: StyledContent,
        error: StyledContent,
        warning: StyledContent,
        info: StyledContent,
      }}
    >
      <NotificationContextBridge>{children}</NotificationContextBridge>
    </SnackbarProvider>
  );
}

export default NotificationProvider;
