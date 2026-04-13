import { useCallback } from "react";
import TwoFAModal from "src/components/TwoFAModal";
import useModal from "src/hooks/useModal";

interface TwoFAPromptOptions {
  title?: string;
  description?: string;
  submitLabel?: string;
  cancelLabel?: string;
}

/**
 * useTwoFAPrompt returns a function that opens the TwoFAModal and resolves
 * a promise with the code entered by the user, or undefined if canceled.
 */
export default function useTwoFAPrompt() {
  const { pushModal, popModal } = useModal();

  const open = useCallback(
    (options?: TwoFAPromptOptions): Promise<string | undefined> => {
      return new Promise((resolve) => {
        let modalId = "";

        const handleClose = () => {
          popModal(modalId);
        };

        const handleSubmit = (code: string) => {
          resolve(code);
          handleClose();
        };

        modalId = pushModal(
          <TwoFAModal
            // visibility handled by modal stack; removed deprecated isOpen prop
            onSubmit={(code) => handleSubmit(code)}
            title={options?.title}
            description={options?.description}
            submitLabel={options?.submitLabel}
            cancelLabel={options?.cancelLabel}
          />
        );
      });
    },
    [popModal, pushModal]
  );

  return open;
}
