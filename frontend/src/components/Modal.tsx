import { useTheme } from "src/contexts/useTheme";
import { AnimatePresence, motion } from "framer-motion";
import useModal from "src/hooks/useModal";

function Modal() {
  const { modalStack, popModal } = useModal();

  const { theme } = useTheme();

  return (
    <AnimatePresence>
      {modalStack.map((modal, index) => (
        <motion.div
          key={modal.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => popModal(modal.id)}
          className="fixed z-[999] inset-0 flex items-center justify-center overflow-auto"
          style={{
            zIndex: 999 + index,
            backgroundColor: `rgba(0,0,0,${
              (theme === "dark" ? 0.75 : 0.5) + index * 0.1
            })`,
          }}
        >
          {modal.content}
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

export default Modal;
