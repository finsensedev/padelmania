import { useState, createContext } from "react";
import type { ReactNode, FC } from "react";
import Modal from "src/components/Modal";

interface ModalItem {
  id: string;
  content: ReactNode;
}

type ModalContextType = {
  modalStack: ModalItem[];
  pushModal: (content: ReactNode) => string;
  popModal: (id?: string) => void;
  closeAllModals: () => void;
};

// eslint-disable-next-line react-refresh/only-export-components
export const ModalContext = createContext<ModalContextType>({
  modalStack: [],
  pushModal: () => "",
  popModal: () => {},
  closeAllModals: () => {},
});

interface ModalProviderProps {
  children: ReactNode;
}

export const ModalProvider: FC<ModalProviderProps> = ({ children }) => {
  const [modalStack, setModalStack] = useState<ModalItem[]>([]);

  const pushModal = (content: ReactNode): string => {
    const id = `modal-${Date.now()}`;
    setModalStack((prev) => [...prev, { id, content }]);
    return id;
  };

  const popModal = (id?: string) => {
    if (!id) {
      // Pop the top modal
      setModalStack((prev) => prev.slice(0, -1));
    } else {
      // Pop a specific modal
      setModalStack((prev) => prev.filter((modal) => modal.id !== id));
    }
  };

  const closeAllModals = () => {
    setModalStack([]);
  };

  return (
    <ModalContext.Provider
      value={{
        modalStack,
        pushModal,
        popModal,
        closeAllModals,
      }}
    >
      {children}
      <Modal />
    </ModalContext.Provider>
  );
};
