/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "src/components/ui/tabs";
import { Switch } from "src/components/ui/switch";
import { Badge } from "src/components/ui/badge";
import { Checkbox } from "src/components/ui/checkbox";
import { Textarea } from "src/components/ui/textarea";

import { Edit, Trash2, Plus, TrendingDown, Percent } from "lucide-react";
import { format, parseISO } from "date-fns";
import api from "src/utils/api";
import useNotification from "src/hooks/useNotification";

interface Court {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
}

interface PricingRule {
  id: string;
  name: string;
  description?: string;
  dayOfWeek?: number[];
  startTime?: string | null;
  endTime?: string | null;
  priority: number;
  isActive: boolean;
  isPeak?: boolean;
  courtId?: string | null;
  membershipTiers?: string[];
  pricingType: "FIXED" | "PERCENTAGE" | "MULTIPLIER" | "ADDITION";
  priceValue: number;
  racketPricingType?: "FIXED" | "PERCENTAGE" | "MULTIPLIER" | "ADDITION" | null;
  racketPriceValue?: number | null;
  ballsPricingType?: "FIXED" | "PERCENTAGE" | "MULTIPLIER" | "ADDITION" | null;
  ballsPriceValue?: number | null;
  validFrom?: string;
  validUntil?: string;
}

interface PricingHistory {
  id: string;
  action: string;
  oldData: any;
  newData: any;
  createdAt: string;
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

const DAY_OPTIONS = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
];

const formatDays = (days?: number[]) => {
  if (!days || days.length === 0) return "All days";
  return DAY_OPTIONS.filter((day) => days.includes(day.value))
    .map((day) => day.label)
    .join(", ");
};

const formatTimeRange = (start?: string | null, end?: string | null) => {
  if (!start && !end) return "All day";
  if (start && end) return `${start} – ${end}`;
  return "Set both start and end";
};

function AdminCourtPricing() {
  const queryClient = useQueryClient();
  const { toaster } = useNotification();

  // UI state
  const [ruleDialog, setRuleDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<PricingRule | null>(null);

  const [newRule, setNewRule] = useState<Partial<PricingRule>>({
    name: "",
    description: "",
    dayOfWeek: [],
    startTime: "",
    endTime: "",
    priority: 0,
    isActive: true,
    isPeak: false,
    courtId: null,
    membershipTiers: [],
    pricingType: "PERCENTAGE",
    priceValue: 0,
    racketPricingType: null,
    racketPriceValue: null,
  });

  // Queries
  const { data: courts = [] } = useQuery<Court[]>(
    ["courts"],
    async () => {
      const response = await api.get("/courts");
      return response.data?.data ?? [];
    },
    {
      onError: () =>
        toaster("Failed to fetch courts", {
          variant: "error",
        }),
    }
  );

  const { data: pricingRules = [] } = useQuery<PricingRule[]>(
    ["courts-pricing-rules"],
    async () => {
      const response = await api.get("/courts/pricing/rules");
      return response.data?.data ?? [];
    },
    {
      onError: () =>
        toaster("Failed to fetch pricing rules", {
          variant: "error",
        }),
    }
  );

  const { data: pricingHistory = [] } = useQuery<PricingHistory[]>(
    ["courts-pricing-history"],
    async () => {
      const response = await api.get("/courts/pricing/history");
      return response.data?.data ?? [];
    },
    {
      onError: () =>
        toaster("Failed to fetch pricing history", {
          variant: "error",
        }),
    }
  );

  const createRuleMutation = useMutation(
    async (payload: Partial<PricingRule>) => {
      return api.post("/courts/pricing/rules", payload);
    },
    {
      onSuccess: () => {
        toaster("Pricing rule created successfully", { variant: "success" });
        setRuleDialog(false);
        setEditingRule(null);
        setNewRule({
          name: "",
          description: "",
          dayOfWeek: [],
          startTime: "",
          endTime: "",
          priority: 0,
          isActive: true,
          isPeak: false,
          courtId: null,
          membershipTiers: [],
          pricingType: "PERCENTAGE",
          priceValue: 0,
          racketPricingType: null,
          racketPriceValue: null,
        });
        queryClient.invalidateQueries(["courts-pricing-rules"]);
        queryClient.invalidateQueries(["courts-pricing-history"]);
      },
      onError: () => {
        toaster("Failed to save pricing rule", { variant: "error" });
      },
    }
  );

  const updateRuleMutation = useMutation(
    async ({ id, payload }: { id: string; payload: Partial<PricingRule> }) => {
      return api.put(`/courts/pricing/rules/${id}`, payload);
    },
    {
      onSuccess: () => {
        toaster("Pricing rule updated successfully", { variant: "success" });
        setRuleDialog(false);
        setEditingRule(null);
        setNewRule({
          name: "",
          description: "",
          dayOfWeek: [],
          startTime: "",
          endTime: "",
          priority: 0,
          isActive: true,
          isPeak: false,
          courtId: null,
          membershipTiers: [],
          pricingType: "PERCENTAGE",
          priceValue: 0,
          racketPricingType: null,
          racketPriceValue: null,
        });
        queryClient.invalidateQueries(["courts-pricing-rules"]);
        queryClient.invalidateQueries(["courts-pricing-history"]);
      },
      onError: () => {
        toaster("Failed to save pricing rule", { variant: "error" });
      },
    }
  );

  const deleteRuleMutation = useMutation(
    async (id: string) => api.delete(`/courts/pricing/rules/${id}`),
    {
      onSuccess: () => {
        toaster("Pricing rule deleted successfully", { variant: "success" });
        queryClient.invalidateQueries(["courts-pricing-rules"]);
        queryClient.invalidateQueries(["courts-pricing-history"]);
      },
      onError: () => {
        toaster("Failed to delete pricing rule", { variant: "error" });
      },
    }
  );

  const toEditableRule = (rule: PricingRule): Partial<PricingRule> => ({
    ...rule,
    dayOfWeek: rule.dayOfWeek ?? [],
    startTime: rule.startTime ?? "",
    endTime: rule.endTime ?? "",
  });

  const handleSaveRule = async () => {
    const hasStart = Boolean(newRule.startTime);
    const hasEnd = Boolean(newRule.endTime);

    if (hasStart !== hasEnd) {
      toaster("Set both start and end times or leave both blank", {
        variant: "error",
      });
      return;
    }

    const ruleData = {
      ...newRule,
      courtId: newRule.courtId === "" ? null : newRule.courtId,
      dayOfWeek: newRule.dayOfWeek || [],
      startTime: newRule.startTime || null,
      endTime: newRule.endTime || null,
      membershipTiers: newRule.membershipTiers || [],
      // Normalize racket pricing fields
      racketPricingType:
        newRule.racketPricingType &&
        newRule.racketPricingType !== ("NONE" as any)
          ? newRule.racketPricingType
          : null,
      racketPriceValue:
        newRule.racketPricingType &&
        newRule.racketPricingType !== ("NONE" as any)
          ? newRule.racketPriceValue ?? null
          : null,
    };

    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, payload: ruleData });
    } else {
      createRuleMutation.mutate(ruleData);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm("Are you sure you want to delete this pricing rule?")) return;
    deleteRuleMutation.mutate(id);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
    }).format(amount);
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background h-full overflow-auto">
      <div className="flex flex-col gap-3 sm:gap-0 sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">
            Court Pricing Management
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Manage court pricing, rules, and seasonal adjustments
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={() => {
              setEditingRule(null);
              setRuleDialog(true);
            }}
            className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-sm"
            size="sm"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Pricing Rule
          </Button>
        </div>
      </div>

      <Tabs defaultValue="rules" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="rules" className="text-xs sm:text-sm">
            Pricing Rules
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs sm:text-sm">
            Price History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardHeader className="px-4 sm:px-6">
              <CardTitle className="text-lg sm:text-xl">
                Dynamic Pricing Rules
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Configure automated pricing adjustments based on conditions
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              {/* Desktop Table View */}
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Courts</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pricingRules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{rule.name}</p>
                            {rule.description && (
                              <p className="text-sm text-muted-foreground">
                                {rule.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{rule.pricingType}</Badge>
                        </TableCell>
                        <TableCell>
                          {rule.pricingType === "PERCENTAGE" ? (
                            <span className="flex items-center">
                              <Percent className="h-3 w-3 mr-1" />
                              {rule.priceValue}%
                            </span>
                          ) : rule.pricingType === "MULTIPLIER" ? (
                            <span>×{rule.priceValue}</span>
                          ) : rule.pricingType === "ADDITION" ? (
                            <span>+{formatCurrency(rule.priceValue)}</span>
                          ) : (
                            formatCurrency(rule.priceValue)
                          )}
                        </TableCell>
                        <TableCell>{rule.priority}</TableCell>
                        <TableCell>
                          {rule.courtId
                            ? courts.find((c) => c.id === rule.courtId)?.name ||
                              "Unknown"
                            : "All courts"}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="text-sm font-medium">
                              {formatDays(rule.dayOfWeek)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatTimeRange(rule.startTime, rule.endTime)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={rule.isActive}
                            onCheckedChange={(checked) => {
                              updateRuleMutation.mutate({
                                id: rule.id,
                                payload: { ...rule, isActive: checked },
                              });
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingRule(rule);
                                setNewRule(toEditableRule(rule));
                                setRuleDialog(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteRule(rule.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View */}
              <div className="lg:hidden space-y-3 px-2">
                {pricingRules.map((rule) => (
                  <Card
                    key={rule.id}
                    className="border-l-4 border-l-primary/60"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-sm mb-1">
                            {rule.name}
                          </h3>
                          {rule.description && (
                            <p className="text-xs text-muted-foreground mb-2">
                              {rule.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            <Badge variant="outline" className="text-xs">
                              {rule.pricingType}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              Priority: {rule.priority}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 mb-3 bg-muted/30 p-2 rounded text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Value:</span>
                          <span className="font-semibold">
                            {rule.pricingType === "PERCENTAGE" ? (
                              <span className="flex items-center">
                                <Percent className="h-3 w-3 mr-1" />
                                {rule.priceValue}%
                              </span>
                            ) : rule.pricingType === "MULTIPLIER" ? (
                              <span>×{rule.priceValue}</span>
                            ) : rule.pricingType === "ADDITION" ? (
                              <span>+{formatCurrency(rule.priceValue)}</span>
                            ) : (
                              formatCurrency(rule.priceValue)
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Courts:</span>
                          <span className="font-medium">
                            {rule.courtId
                              ? courts.find((c) => c.id === rule.courtId)
                                  ?.name || "Unknown"
                              : "All courts"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Schedule:
                          </span>
                          <span className="text-right font-medium">
                            {formatDays(rule.dayOfWeek)}
                            <br />
                            <span className="text-[11px] text-muted-foreground">
                              {formatTimeRange(rule.startTime, rule.endTime)}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            Active:
                          </span>
                          <Switch
                            checked={rule.isActive}
                            onCheckedChange={(checked) => {
                              updateRuleMutation.mutate({
                                id: rule.id,
                                payload: { ...rule, isActive: checked },
                              });
                            }}
                          />
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingRule(rule);
                              setNewRule(toEditableRule(rule));
                              setRuleDialog(true);
                            }}
                            className="h-7 w-7 p-0"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteRule(rule.id)}
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {pricingRules.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No pricing rules found. Create one to get started.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pricing Change History</CardTitle>
              <CardDescription>
                Track all pricing modifications and updates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Changes</TableHead>
                    <TableHead>Modified By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pricingHistory.map((history) => (
                    <TableRow key={history.id}>
                      <TableCell>
                        {format(parseISO(history.createdAt), "PPp")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{history.action}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {history.oldData && history.newData && (
                            <div className="space-y-1">
                              {Object.keys(history.newData).map((key) => {
                                if (
                                  history.oldData[key] !== history.newData[key]
                                ) {
                                  return (
                                    <div
                                      key={key}
                                      className="flex items-center gap-2"
                                    >
                                      <span className="font-medium">
                                        {key}:
                                      </span>
                                      <span className="text-red-500">
                                        {history.oldData[key]}
                                      </span>
                                      <TrendingDown className="h-3 w-3" />
                                      <span className="text-green-500">
                                        {history.newData[key]}
                                      </span>
                                    </div>
                                  );
                                }
                                return null;
                              })}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {history.user.firstName} {history.user.lastName}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Pricing Rule Dialog */}
      <Dialog open={ruleDialog} onOpenChange={setRuleDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? "Edit Pricing Rule" : "Create Pricing Rule"}
            </DialogTitle>
            <DialogDescription>
              Configure dynamic pricing rules for courts
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <Label>Rule Name</Label>
              <Input
                value={newRule.name}
                onChange={(e) =>
                  setNewRule({ ...newRule, name: e.target.value })
                }
                placeholder="e.g., Weekend Surcharge"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={newRule.description}
                onChange={(e) =>
                  setNewRule({ ...newRule, description: e.target.value })
                }
                placeholder="Describe what this rule does..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Pricing Type</Label>
                <Select
                  value={newRule.pricingType}
                  onValueChange={(
                    value: "FIXED" | "PERCENTAGE" | "MULTIPLIER" | "ADDITION"
                  ) =>
                    setNewRule({
                      ...newRule,
                      pricingType: value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED">Fixed Amount</SelectItem>
                    <SelectItem value="PERCENTAGE">
                      Percentage Discount
                    </SelectItem>
                    <SelectItem value="MULTIPLIER">Multiplier</SelectItem>
                    <SelectItem value="ADDITION">Addition</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Value</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={newRule.priceValue}
                  onChange={(e) =>
                    setNewRule({
                      ...newRule,
                      priceValue: Number(e.target.value),
                    })
                  }
                  placeholder={
                    newRule.pricingType === "PERCENTAGE"
                      ? "e.g., 20 for 20% discount"
                      : newRule.pricingType === "MULTIPLIER"
                      ? "e.g., 1.5 for 50% increase"
                      : newRule.pricingType === "ADDITION"
                      ? "e.g., 500"
                      : "e.g., 3000"
                  }
                />
              </div>
            </div>
            {/* Rackets Pricing (optional) */}
            <div className="col-span-2">
              <div className="mt-2 space-y-2">
                <div className="text-sm font-semibold">
                  Rackets Pricing (optional)
                </div>
                <p className="text-xs text-muted-foreground -mt-1">
                  If set, this rule also adjusts the unit price for racket
                  rentals.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <Label>Rackets Pricing Type</Label>
                  <Select
                    value={(newRule.racketPricingType as any) || "NONE"}
                    onValueChange={(value: string) =>
                      setNewRule({
                        ...newRule,
                        racketPricingType:
                          value === "NONE" ? null : (value as any),
                        // Clear value when turning off
                        racketPriceValue:
                          value === "NONE"
                            ? null
                            : newRule.racketPriceValue ?? 0,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">None</SelectItem>
                      <SelectItem value="FIXED">Fixed Amount</SelectItem>
                      <SelectItem value="PERCENTAGE">
                        Percentage Discount
                      </SelectItem>
                      <SelectItem value="MULTIPLIER">Multiplier</SelectItem>
                      <SelectItem value="ADDITION">Addition</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Rackets Value</Label>
                  <Input
                    type="number"
                    step={
                      newRule.racketPricingType === "PERCENTAGE" ||
                      newRule.racketPricingType === "MULTIPLIER"
                        ? 0.01
                        : 1
                    }
                    value={newRule.racketPriceValue ?? 0}
                    onChange={(e) =>
                      setNewRule({
                        ...newRule,
                        racketPriceValue:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    placeholder={
                      newRule.racketPricingType === "PERCENTAGE"
                        ? "e.g., 20"
                        : newRule.racketPricingType === "MULTIPLIER"
                        ? "e.g., 1.5"
                        : "e.g., 300"
                    }
                    disabled={!newRule.racketPricingType}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {newRule.racketPricingType === "FIXED" &&
                      "Overrides the racket unit price with a fixed price."}
                    {newRule.racketPricingType === "PERCENTAGE" &&
                      "Applies a discount to the racket unit price (e.g., 20 = 20% off)."}
                    {newRule.racketPricingType === "MULTIPLIER" &&
                      "Multiplies the racket unit price (e.g., 1.5 = increase by 50%)."}
                    {newRule.racketPricingType === "ADDITION" &&
                      "Adds a fixed amount on top of the racket unit price."}
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Days of Week</Label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mt-2">
                  {DAY_OPTIONS.map((day) => {
                    const selected = newRule.dayOfWeek?.includes(day.value);
                    return (
                      <label
                        key={day.value}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={selected}
                          onCheckedChange={(checked) => {
                            const current = newRule.dayOfWeek || [];
                            const next = checked
                              ? Array.from(new Set([...current, day.value]))
                              : current.filter((d) => d !== day.value);
                            setNewRule({ ...newRule, dayOfWeek: next });
                          }}
                        />
                        <span>{day.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty to apply to all days.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={newRule.startTime ?? ""}
                    onChange={(e) =>
                      setNewRule({ ...newRule, startTime: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={newRule.endTime ?? ""}
                    onChange={(e) =>
                      setNewRule({ ...newRule, endTime: e.target.value })
                    }
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Set both start and end times to restrict the rule to a time
                window, or leave both blank to apply all day.
              </p>
            </div>
            <div>
              <Label>Apply to Court</Label>
              <Select
                value={newRule.courtId || "all"}
                onValueChange={(value) =>
                  setNewRule({
                    ...newRule,
                    courtId: value === "all" ? null : value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Courts</SelectItem>
                  {courts.map((court) => (
                    <SelectItem key={court.id} value={court.id}>
                      {court.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority (Higher priority rules apply first)</Label>
              <Input
                type="number"
                value={newRule.priority}
                onChange={(e) =>
                  setNewRule({ ...newRule, priority: Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Switch
                  checked={newRule.isActive}
                  onCheckedChange={(checked) =>
                    setNewRule({ ...newRule, isActive: checked })
                  }
                />
                <Label>Active</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  checked={newRule.isPeak || false}
                  onCheckedChange={(checked) =>
                    setNewRule({ ...newRule, isPeak: checked as boolean })
                  }
                />
                <div className="space-y-0.5">
                  <Label>Mark as Peak Hours</Label>
                  <p className="text-xs text-muted-foreground">
                    Display a "Peak" badge for time slots using this rule
                  </p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRuleDialog(false);
                setEditingRule(null);
              }}
              disabled={
                createRuleMutation.isLoading || updateRuleMutation.isLoading
              }
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveRule}
              disabled={
                createRuleMutation.isLoading || updateRuleMutation.isLoading
              }
            >
              {createRuleMutation.isLoading || updateRuleMutation.isLoading
                ? "Saving..."
                : editingRule
                ? "Update Rule"
                : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminCourtPricing;
