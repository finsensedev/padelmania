import { X, LogOut, AlertTriangle } from "lucide-react";
import useModal from "src/hooks/useModal";

type ConfirmLogoutProps = {
  onSubmit: () => void;
  title?: string;
  description?: string;
  submitLabel?: string;
  cancelLabel?: string;
};

function ConfirmLogout({
  onSubmit,
  title,
  description,
  submitLabel,
  cancelLabel,
}: ConfirmLogoutProps) {
  const { popModal } = useModal();

  const handleConfirm = () => {
    onSubmit();
    popModal();
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="bg-card m-3 rounded-lg w-full max-w-md border border-border shadow-lg"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          <h2 className="text-lg font-semibold text-card-foreground">
            {title || "Confirm Logout"}
          </h2>
        </div>
        <button
          onClick={() => popModal()}
          className="p-2 hover:bg-muted rounded-lg transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      <div className="px-6 py-5">
        <p className="text-sm text-muted-foreground">
          {description ||
            "Are you sure you want to logout? You will need to sign in again to access your account."}
        </p>
      </div>

      <div className="flex gap-3 px-6 py-4 border-t border-border">
        <button
          type="button"
          autoFocus
          onClick={() => popModal()}
          className="flex-1 px-4 py-2.5 border border-border rounded-lg hover:bg-muted transition-colors text-sm font-medium"
        >
          {cancelLabel || "Cancel"}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className="flex-1 px-4 py-2.5 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors text-sm font-medium flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          {submitLabel || "Logout"}
        </button>
      </div>
    </div>
  );
}

export default ConfirmLogout;
