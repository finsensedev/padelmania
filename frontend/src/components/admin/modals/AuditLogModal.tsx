/* eslint-disable @typescript-eslint/no-explicit-any */
import { format } from "date-fns";
import { X } from "lucide-react";
import { useMemo } from "react";
import { Button } from "src/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import useModal from "src/hooks/useModal";

function AuditLogModal({ selected }: { selected: any }) {
  const { popModal } = useModal();
  return (
    <Card
      className="w-full h-[100dvh] md:h-auto md:w-4/5 mt-0 pt-0 lg:w-3/5 xl:w-1/2 md:max-h-[90vh] overflow-auto shadow-2xl rounded-none md:rounded-2xl border border-border"
      onClick={(e) => e.stopPropagation()}
    >
      <CardHeader className="border-b p-4 sm:pt-6 sm:px-6 sm:pb-4 border-border bg-muted/30">
        <div className="flex justify-center items-center">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base sm:text-lg font-semibold text-foreground truncate">
              {selected.action}
            </CardTitle>
            <div className="text-xs sm:text-sm text-muted-foreground mt-1 break-words">
              <span className="inline-block">{selected.entity}</span>
              <span className="mx-1">•</span>
              <span className="inline-block break-all">
                {selected.entityId}
              </span>
              <span className="mx-1 hidden sm:inline">•</span>
              <span className="block sm:inline mt-1 sm:mt-0">
                {format(new Date(selected.createdAt), "PPpp")}
              </span>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => popModal()}>
            <X className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Close</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 text-sm">
          <div className="space-y-1.5 sm:space-y-2">
            <div className="text-muted-foreground font-semibold text-xs sm:text-sm">
              User
            </div>
            <div className="text-foreground text-sm break-words">
              {selected.user
                ? `${selected.user.firstName ?? ""} ${
                    selected.user.lastName ?? ""
                  }`.trim() ||
                  selected.user.email ||
                  selected.user.id
                : "System"}
            </div>
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <div className="text-muted-foreground font-semibold text-xs sm:text-sm">
              IP Address
            </div>
            <div className="text-foreground font-mono text-xs sm:text-sm break-all">
              {selected.ipAddress ?? "—"}
            </div>
          </div>
          <div className="md:col-span-2 space-y-1.5 sm:space-y-2">
            <div className="text-muted-foreground font-semibold text-xs sm:text-sm">
              User Agent
            </div>
            <div className="text-[10px] sm:text-xs break-words text-muted-foreground bg-muted/50 p-2 sm:p-3 rounded-md leading-relaxed">
              {selected.userAgent ?? "—"}
            </div>
          </div>
        </div>

        {(selected.oldData !== null || selected.newData !== null) && (
          <div className="mt-4 sm:mt-6">
            <div className="text-muted-foreground font-semibold text-xs sm:text-sm mb-3 sm:mb-4">
              Data Changes
            </div>
            <DiffView oldData={selected.oldData} newData={selected.newData} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AuditLogModal;

function DiffView({
  oldData,
  newData,
}: {
  oldData?: unknown;
  newData?: unknown;
}) {
  const prettyOld = useMemo(
    () => JSON.stringify(oldData ?? {}, null, 2),
    [oldData]
  );
  const prettyNew = useMemo(
    () => JSON.stringify(newData ?? {}, null, 2),
    [newData]
  );
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
      <div className="space-y-1.5 sm:space-y-2">
        <div className="text-xs sm:text-sm font-semibold text-muted-foreground">
          Before (Old Data)
        </div>
        <pre className="bg-muted/50 border border-border text-foreground p-2 sm:p-4 rounded-lg overflow-auto max-h-60 sm:max-h-80 text-[10px] sm:text-xs whitespace-pre-wrap font-mono leading-relaxed">
          {prettyOld}
        </pre>
      </div>
      <div className="space-y-1.5 sm:space-y-2">
        <div className="text-xs sm:text-sm font-semibold text-muted-foreground">
          After (New Data)
        </div>
        <pre className="bg-muted/50 border border-border text-foreground p-2 sm:p-4 rounded-lg overflow-auto max-h-60 sm:max-h-80 text-[10px] sm:text-xs whitespace-pre-wrap font-mono leading-relaxed">
          {prettyNew}
        </pre>
      </div>
    </div>
  );
}
