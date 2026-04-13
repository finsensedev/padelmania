import { useContext } from "react";
import { NotificationContext } from "src/contexts/NotificationProvider";

function useNotification() {
  return useContext(NotificationContext);
}

export default useNotification;
