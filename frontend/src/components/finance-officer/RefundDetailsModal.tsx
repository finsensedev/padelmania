import { X } from "lucide-react";
import useModal from "src/hooks/useModal";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";

interface RefundRequest {
  id: string;
  refundReference: string;
  originalTransactionId: string;
  bookingReference?: string;
  orderReference?: string;
  customerName: string;
  customerEmail: string;
  originalAmount: number;
  refundAmount: number;
  refundReason: string;
  paymentMethod: "MPESA" | "CARD" | "BANK_TRANSFER" | "CASH";
  status: "PROCESSING" | "COMPLETED";
  requestedAt: string;
  requestedBy: string;
  processedAt?: string;
  completedAt?: string;
  rejectionReason?: string;
  refundMethod?: "ORIGINAL" | "MPESA" | "BANK_TRANSFER";
  bankDetails?: {
    accountName: string;
    accountNumber: string;
    bankName: string;
  };
  mpesaPhone?: string;
  notes?: string;
}

interface RefundDetailsModalProps {
  refund: RefundRequest;
}

export default function RefundDetailsModal({
  refund,
}: RefundDetailsModalProps) {
  const { popModal } = useModal();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-green-100 text-green-800";
      case "PROCESSING":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getMethodColor = (method: string) => {
    switch (method) {
      case "MPESA":
        return "bg-green-100 text-green-800";
      case "CARD":
        return "bg-blue-100 text-blue-800";
      case "BANK_TRANSFER":
        return "bg-purple-100 text-purple-800";
      case "CASH":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="bg-card m-3 rounded-lg w-full max-w-xl border border-border shadow-lg"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold text-card-foreground">
            Refund Details
          </h2>
          <p className="text-sm text-muted-foreground">
            Read-only information about this refund request
          </p>
        </div>
        <button
          onClick={() => popModal()}
          className="p-2 hover:bg-muted rounded-lg transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium">Reference</p>
              <p>{refund.refundReference}</p>
            </div>
            <div>
              <p className="font-medium">Customer</p>
              <p>{refund.customerName}</p>
              <p className="text-xs text-muted-foreground">
                {refund.customerEmail}
              </p>
            </div>
            <div>
              <p className="font-medium">Original Amount</p>
              <p>KSh {refund.originalAmount.toLocaleString()}</p>
            </div>
            <div>
              <p className="font-medium">Refund Amount</p>
              <p className="text-red-600 font-medium">
                KSh {refund.refundAmount.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="font-medium">Status</p>
              <p>
                <Badge className={getStatusColor(refund.status)}>
                  {refund.status}
                </Badge>
              </p>
            </div>
            <div>
              <p className="font-medium">Method</p>
              <p>
                <Badge className={getMethodColor(refund.paymentMethod)}>
                  {refund.paymentMethod}
                </Badge>
              </p>
            </div>
            <div>
              <p className="font-medium">Requested At</p>
              <p>{formatDateTime(refund.requestedAt)}</p>
            </div>
            {refund.completedAt && (
              <div>
                <p className="font-medium">Completed At</p>
                <p>{formatDateTime(refund.completedAt)}</p>
              </div>
            )}
          </div>
          {refund.refundReason && (
            <div>
              <p className="font-medium mb-1">Reason</p>
              <p className="text-sm whitespace-pre-wrap">
                {refund.refundReason}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 px-6 py-4 border-t border-border justify-end">
        <Button variant="outline" onClick={() => popModal()}>
          Close
        </Button>
      </div>
    </div>
  );
}
