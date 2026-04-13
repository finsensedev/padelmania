import { useContext } from "react";
import { SystemConfigContext } from "../contexts/SystemConfigProvider";

export const useSystemConfig = () => {
  const context = useContext(SystemConfigContext);
  if (context === undefined) {
    throw new Error(
      "useSystemConfig must be used within a SystemConfigProvider"
    );
  }
  return context;
};
