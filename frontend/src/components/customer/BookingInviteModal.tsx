import { useState } from "react";
import { X, Mail, UserPlus, Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "src/components/ui/button";
import useModal from "src/hooks/useModal";

interface BookingInviteModalProps {
  onSendInvites: (emails: string[]) => Promise<void>;
  maxInvites?: number;
  existingEmails?: string[];
}

export default function BookingInviteModal({
  onSendInvites,
  maxInvites = 3,
  existingEmails = [],
}: BookingInviteModalProps) {
  const { popModal } = useModal();
  const [emails, setEmails] = useState<string[]>(
    existingEmails.length > 0 ? [...existingEmails] : [""]
  );
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addEmailField = () => {
    if (emails.length < maxInvites) {
      setEmails([...emails, ""]);
    }
  };

  const removeEmailField = (index: number) => {
    const newEmails = emails.filter((_, i) => i !== index);
    setEmails(newEmails.length > 0 ? newEmails : [""]);
  };

  const updateEmail = (index: number, value: string) => {
    const newEmails = [...emails];
    newEmails[index] = value;
    setEmails(newEmails);
    setError(null);
  };

  const validateEmail = (email: string): boolean => {
    const trimmed = email.trim();
    return /^\S+@\S+\.\S+$/.test(trimmed);
  };

  const handleSendInvites = async () => {
    const validEmails = emails
      .map((e) => e.trim())
      .filter((e) => e && validateEmail(e));

    if (validEmails.length === 0) {
      setError("Please enter at least one valid email address.");
      return;
    }

    // Check for duplicates
    const uniqueEmails = Array.from(new Set(validEmails));
    if (uniqueEmails.length !== validEmails.length) {
      setError("Please remove duplicate email addresses.");
      return;
    }

    setError(null);
    setIsSending(true);

    try {
      await onSendInvites(uniqueEmails);
      popModal();
    } catch (err) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(
        error?.response?.data?.message ||
          "Failed to send invitations. Please try again."
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className="bg-background border border-border shadow-2xl rounded-xl max-w-md w-full mx-4 transform transition-all duration-300 scale-100 opacity-100"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
            <UserPlus className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">
              Invite Players
            </h2>
            <p className="text-sm text-muted-foreground">
              {existingEmails.length > 0
                ? `${existingEmails.length} player(s) invited • ${
                    maxInvites - existingEmails.length
                  } slot(s) remaining`
                : `Invite up to ${maxInvites} friends to join your game`}
            </p>
          </div>
        </div>
        <button
          onClick={() => popModal()}
          className="p-2 hover:bg-muted rounded-lg transition-colors"
          disabled={isSending}
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
        {error && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          {emails.map((email, index) => (
            <div key={index} className="flex gap-2">
              <div className="flex-1 relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => updateEmail(index, e.target.value)}
                  placeholder={`Email address ${index + 1}`}
                  className="w-full pl-10 pr-4 py-3 text-base border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  disabled={isSending}
                />
              </div>
              {emails.length > 1 && (
                <button
                  onClick={() => removeEmailField(index)}
                  className="p-3 hover:bg-destructive/10 text-destructive rounded-lg transition-colors flex-shrink-0"
                  disabled={isSending}
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {emails.length < maxInvites && (
          <button
            onClick={addEmailField}
            className="w-full py-3 border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 rounded-lg transition-all flex items-center justify-center gap-2 text-muted-foreground hover:text-primary"
            disabled={isSending}
          >
            <UserPlus className="h-4 w-4" />
            <span className="font-medium text-sm">Add another player</span>
          </button>
        )}

        <div className="pt-2">
          <div className="bg-muted/50 border border-border rounded-lg p-4">
            <h4 className="font-semibold text-sm text-foreground mb-2 flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              How it works
            </h4>
            <ul className="text-xs text-muted-foreground space-y-1.5 ml-6 list-disc">
              <li>Invited players will receive an email with match details</li>
              <li>They'll see the booking code, court, date, and time</li>
              <li>No payment required from invited players</li>
              <li>Maximum {maxInvites} additional players</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex gap-3 p-6 border-t border-border">
        <Button
          variant="outline"
          onClick={() => popModal()}
          className="flex-1"
          disabled={isSending}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSendInvites}
          className="flex-1"
          disabled={isSending}
        >
          {isSending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Mail className="mr-2 h-4 w-4" />
              Save
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
