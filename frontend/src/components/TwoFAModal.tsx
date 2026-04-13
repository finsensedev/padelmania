import { useState, useMemo } from "react";
import { X, ShieldCheck } from "lucide-react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "src/components/ui/input-otp";
import useModal from "src/hooks/useModal";

type TwoFAModalProps = {
  onSubmit: (code: string) => void;
  title?: string;
  description?: string;
  submitLabel?: string;
  cancelLabel?: string;
};

function TwoFAModal({
  onSubmit,
  title,
  description,
  submitLabel,
  cancelLabel,
}: TwoFAModalProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { popModal } = useModal();

  const isValid = useMemo(() => /^\d{6}$/.test(code.trim()), [code]);

  const handleConfirm = () => {
    const normalized = code.trim();
    if (!/^\d{6}$/.test(normalized)) {
      setError("Enter a valid 6-digit code");
      return;
    }
    setError(null);
    onSubmit(normalized);
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="bg-card rounded-lg w-full max-w-md border border-border shadow-lg"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-card-foreground">
            {title || "Two-Factor Authentication"}
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

      <div className="px-6 py-5 space-y-5">
        <p className="text-sm text-muted-foreground">
          {description ||
            "Enter your 6-digit 2FA code to authorize this action."}
        </p>

        <div className="flex justify-center">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={(val) => {
              setCode(val);
              if (error) setError(null);
            }}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}
      </div>

      <div className="flex gap-3 px-6 py-4 border-t border-border">
        <button
          type="button"
          onClick={() => popModal()}
          className="flex-1 px-4 py-2.5 border border-border rounded-lg hover:bg-muted"
        >
          {cancelLabel || "Cancel"}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!isValid}
          className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitLabel || "Confirm"}
        </button>
      </div>
    </div>
  );
}

export default TwoFAModal;
