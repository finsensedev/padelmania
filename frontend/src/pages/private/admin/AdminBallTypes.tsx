/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import { Plus, Edit, Trash2, Package, AlertTriangle } from "lucide-react";
import { Button } from "src/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import { Badge } from "src/components/ui/badge";
import useNotification from "src/hooks/useNotification";
import api from "src/utils/api";

interface BallType {
  id: string;
  name: string;
  brand: string;
  rentalPrice: number;
  totalQuantity: number;
  availableQty: number;
  condition: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function AdminBallTypes() {
  const queryClient = useQueryClient();
  const { toaster } = useNotification();

  // UI state
  const [ballTypeDialog, setBallTypeDialog] = useState(false);
  const [editingBallType, setEditingBallType] = useState<BallType | null>(null);

  const [newBallType, setNewBallType] = useState({
    name: "",
    brand: "",
    rentalPrice: 1000,
    totalQuantity: 10,
    availableQty: 10,
    condition: "GOOD",
    isActive: true,
  });

  // Query to fetch ball types
  const { data: ballTypes = [], isLoading } = useQuery<BallType[]>(
    ["admin-ball-types"],
    async () => {
      const response = await api.get("/admin/ball-types");
      return response.data?.data ?? [];
    },
    {
      onError: () =>
        toaster("Failed to fetch ball types", {
          variant: "error",
        }),
    },
  );

  // Create ball type mutation
  const createBallTypeMutation = useMutation(
    async (payload: typeof newBallType) => {
      return api.post("/admin/ball-types", payload);
    },
    {
      onSuccess: () => {
        toaster("Ball type created successfully", { variant: "success" });
        setBallTypeDialog(false);
        setEditingBallType(null);
        resetForm();
        queryClient.invalidateQueries(["admin-ball-types"]);
      },
      onError: (error: any) => {
        toaster(
          error?.response?.data?.message || "Failed to create ball type",
          {
            variant: "error",
          },
        );
      },
    },
  );

  // Update ball type mutation
  const updateBallTypeMutation = useMutation(
    async ({ id, payload }: { id: string; payload: typeof newBallType }) => {
      return api.put(`/admin/ball-types/${id}`, payload);
    },
    {
      onSuccess: () => {
        toaster("Ball type updated successfully", { variant: "success" });
        setBallTypeDialog(false);
        setEditingBallType(null);
        resetForm();
        queryClient.invalidateQueries(["admin-ball-types"]);
      },
      onError: (error: any) => {
        toaster(
          error?.response?.data?.message || "Failed to update ball type",
          {
            variant: "error",
          },
        );
      },
    },
  );

  // Delete ball type mutation
  const deleteBallTypeMutation = useMutation(
    async (id: string) => api.delete(`/admin/ball-types/${id}`),
    {
      onSuccess: () => {
        toaster("Ball type deleted successfully", { variant: "success" });
        queryClient.invalidateQueries(["admin-ball-types"]);
      },
      onError: (error: any) => {
        toaster(
          error?.response?.data?.message || "Failed to delete ball type",
          {
            variant: "error",
          },
        );
      },
    },
  );

  // Update stock mutation
  const updateStockMutation = useMutation(
    async ({
      id,
      totalQuantity,
      availableQty,
    }: {
      id: string;
      totalQuantity: number;
      availableQty: number;
    }) => {
      return api.patch(`/admin/ball-types/${id}/stock`, {
        totalQuantity,
        availableQty,
      });
    },
    {
      onSuccess: () => {
        toaster("Stock updated successfully", { variant: "success" });
        queryClient.invalidateQueries(["admin-ball-types"]);
      },
      onError: (error: any) => {
        toaster(error?.response?.data?.message || "Failed to update stock", {
          variant: "error",
        });
      },
    },
  );

  const resetForm = () => {
    setNewBallType({
      name: "",
      brand: "",
      rentalPrice: 1000,
      totalQuantity: 10,
      availableQty: 10,
      condition: "GOOD",
      isActive: true,
    });
  };

  const handleSaveBallType = async () => {
    if (!newBallType.name.trim()) {
      toaster("Ball type name is required", { variant: "error" });
      return;
    }

    if (editingBallType) {
      updateBallTypeMutation.mutate({
        id: editingBallType.id,
        payload: newBallType,
      });
    } else {
      createBallTypeMutation.mutate(newBallType);
    }
  };

  const handleDeleteBallType = async (id: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this ball type? This will deactivate it.",
      )
    )
      return;
    deleteBallTypeMutation.mutate(id);
  };

  const handleEditBallType = (ballType: BallType) => {
    setEditingBallType(ballType);
    setNewBallType({
      name: ballType.name,
      brand: ballType.brand,
      rentalPrice: Number(ballType.rentalPrice),
      totalQuantity: ballType.totalQuantity ?? 10,
      availableQty: ballType.availableQty ?? 10,
      condition: ballType.condition,
      isActive: ballType.isActive,
    });
    setBallTypeDialog(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 bg-background h-full overflow-auto">
      <div className="flex flex-col gap-3 sm:gap-0 sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">
            Ball Types Management
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Manage different types of padel balls available for rent
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingBallType(null);
            resetForm();
            setBallTypeDialog(true);
          }}
          className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-sm"
          size="sm"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Ball Type
        </Button>
      </div>

      <Card>
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="text-lg sm:text-xl">
            Available Ball Types
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Configure different ball types with unique pricing
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          {isLoading ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Loading ball types...
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ballTypes.map((ballType) => (
                      <TableRow key={ballType.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{ballType.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{ballType.brand}</TableCell>
                        <TableCell className="font-semibold">
                          {formatCurrency(Number(ballType.rentalPrice))}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-sm font-medium ${
                                ballType.availableQty <= 0
                                  ? "text-destructive"
                                  : ballType.availableQty <= 3
                                    ? "text-amber-600 dark:text-amber-400"
                                    : ""
                              }`}
                            >
                              {ballType.availableQty}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              / {ballType.totalQuantity}
                            </span>
                            {ballType.availableQty <= 0 && (
                              <Badge
                                variant="destructive"
                                className="text-[10px] px-1.5 py-0 ml-1"
                              >
                                Out of Stock
                              </Badge>
                            )}
                            {ballType.availableQty > 0 &&
                              ballType.availableQty <= 3 && (
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                              )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{ballType.condition}</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={ballType.isActive}
                            onCheckedChange={(checked) => {
                              updateBallTypeMutation.mutate({
                                id: ballType.id,
                                payload: {
                                  ...ballType,
                                  isActive: checked,
                                  rentalPrice: Number(ballType.rentalPrice),
                                },
                              });
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditBallType(ballType)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteBallType(ballType.id)}
                              className="text-destructive hover:text-destructive"
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
                {ballTypes.map((ballType) => (
                  <Card
                    key={ballType.id}
                    className="border-l-4 border-l-primary/60"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <h3 className="font-semibold text-sm">
                              {ballType.name}
                            </h3>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {ballType.brand}
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <Badge variant="secondary" className="text-xs">
                              {formatCurrency(Number(ballType.rentalPrice))}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {ballType.condition}
                            </Badge>
                            <Badge
                              variant={
                                ballType.availableQty <= 0
                                  ? "destructive"
                                  : "outline"
                              }
                              className="text-xs"
                            >
                              {ballType.availableQty <= 0
                                ? "Out of Stock"
                                : `Stock: ${ballType.availableQty}/${ballType.totalQuantity}`}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t mt-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            Active:
                          </span>
                          <Switch
                            checked={ballType.isActive}
                            onCheckedChange={(checked) => {
                              updateBallTypeMutation.mutate({
                                id: ballType.id,
                                payload: {
                                  ...ballType,
                                  isActive: checked,
                                  rentalPrice: Number(ballType.rentalPrice),
                                },
                              });
                            }}
                          />
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditBallType(ballType)}
                            className="h-7 w-7 p-0"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteBallType(ballType.id)}
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {ballTypes.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No ball types found. Create one to get started.
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Ball Type Dialog */}
      <Dialog open={ballTypeDialog} onOpenChange={setBallTypeDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingBallType ? "Edit Ball Type" : "Create Ball Type"}
            </DialogTitle>
            <DialogDescription>
              Configure ball type details, pricing, and stock levels
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <Label>Ball Type Name *</Label>
              <Input
                value={newBallType.name}
                onChange={(e) =>
                  setNewBallType({ ...newBallType, name: e.target.value })
                }
                placeholder="e.g., Odea Balls, Regular Balls"
              />
            </div>
            <div>
              <Label>Brand</Label>
              <Input
                value={newBallType.brand}
                onChange={(e) =>
                  setNewBallType({ ...newBallType, brand: e.target.value })
                }
                placeholder="e.g., Wilson, Head, Dunlop"
              />
            </div>
            <div>
              <Label>Rental Price (KES) *</Label>
              <Input
                type="number"
                step="1"
                min="0"
                value={newBallType.rentalPrice}
                onChange={(e) =>
                  setNewBallType({
                    ...newBallType,
                    rentalPrice: Number(e.target.value),
                  })
                }
                placeholder="e.g., 1000, 1800"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Base price per pack before any pricing rules are applied
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={newBallType.isActive}
                onCheckedChange={(checked) =>
                  setNewBallType({ ...newBallType, isActive: checked })
                }
              />
              <div className="space-y-0.5">
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">
                  Only active ball types are available for booking
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Total Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  value={newBallType.totalQuantity}
                  onChange={(e) => {
                    const total = Math.max(0, Number(e.target.value));
                    setNewBallType({
                      ...newBallType,
                      totalQuantity: total,
                      availableQty: Math.min(newBallType.availableQty, total),
                    });
                  }}
                />
              </div>
              <div>
                <Label>Available Qty</Label>
                <Input
                  type="number"
                  min="0"
                  max={newBallType.totalQuantity}
                  value={newBallType.availableQty}
                  onChange={(e) =>
                    setNewBallType({
                      ...newBallType,
                      availableQty: Math.min(
                        Math.max(0, Number(e.target.value)),
                        newBallType.totalQuantity,
                      ),
                    })
                  }
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Set available qty to 0 to mark as "Out of Stock" for customers
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBallTypeDialog(false);
                setEditingBallType(null);
                resetForm();
              }}
              disabled={
                createBallTypeMutation.isLoading ||
                updateBallTypeMutation.isLoading
              }
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveBallType}
              disabled={
                createBallTypeMutation.isLoading ||
                updateBallTypeMutation.isLoading
              }
            >
              {createBallTypeMutation.isLoading ||
              updateBallTypeMutation.isLoading
                ? "Saving..."
                : editingBallType
                  ? "Update Ball Type"
                  : "Create Ball Type"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminBallTypes;
