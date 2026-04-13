import { useContext } from "react";
import { ModalContext } from "src/contexts/ModalProvider";

/**
 * Custom hook for managing modals across the application
 *
 * @returns {Object} Modal management functions
 * @returns {function} pushModal - Add a new modal to the stack
 * @returns {function} popModal - Remove a modal from the stack
 * @returns {function} closeAllModals - Close all open modals
 * @returns {Array} modalStack - The current stack of open modals
 */
const useModal = () => {
  const context = useContext(ModalContext);

  if (!context) {
    throw new Error("useModal must be used within a ModalProvider");
  }

  return context;
};

export default useModal;
