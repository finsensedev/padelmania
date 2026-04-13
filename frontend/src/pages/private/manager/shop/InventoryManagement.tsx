import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import { motion } from "framer-motion";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Badge } from "src/components/ui/badge";
import { Textarea } from "src/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "src/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import useNotification from "src/hooks/useNotification";
import inventoryService, { type LowStockItem } from "src/services/inventory.service";
import {
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  RefreshCw,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Edit,
} from "lucide-react";
import { format } from "date-fns";

export default function InventoryManagement() {
  const { toaster } = useNotification();
  const queryClient = useQueryClient();

  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<LowStockItem | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState({
    quantityChange: 0,
    changeType: "RESTOCK" as "RESTOCK" | "SALE" | "RETURN" | "DAMAGE" | "ADJUSTMENT",
    reason: "",
  });

  const [logFilters, setLogFilters] = useState({
    page: 1,
    limit: 10,
    changeType: undefined as string | undefined,
  });

  // Fetch inventory stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["inventory-stats"],
    queryFn: () => inventoryService.getStats(),
    onError: () => {
      toaster("Failed to load inventory statistics", { variant: "error" });
    },
    refetchOnMount: "always",
    staleTime: 0, // Always fetch fresh data to ensure inventory value is up-to-date
  });

  // Fetch low stock products
  const { data: lowStockProducts, isLoading: lowStockLoading } = useQuery({
    queryKey: ["low-stock"],
    queryFn: () => inventoryService.getLowStock(),
    onError: () => {
      toaster("Failed to load low stock alerts", { variant: "error" });
    },
    refetchOnMount: "always",
    staleTime: 0, // Always fetch fresh data
  });

  // Fetch inventory logs
  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ["inventory-logs", logFilters],
    queryFn: () => inventoryService.getLogs(logFilters),
    keepPreviousData: true,
    onError: () => {
      toaster("Failed to load inventory logs", { variant: "error" });
    },
    refetchOnMount: "always",
    staleTime: 0, // Always fetch fresh data
  });

  // Adjust stock mutation
  const adjustStockMutation = useMutation({
    mutationFn: (data: {
      productId: string;
      quantityChange: number;
      changeType: "RESTOCK" | "SALE" | "RETURN" | "DAMAGE" | "ADJUSTMENT";
      reason: string;
    }) => inventoryService.adjustStock(data),
    onSuccess: () => {
      toaster("Stock adjusted successfully", { variant: "success" });
      // Invalidate inventory queries
      queryClient.invalidateQueries("inventory-stats");
      queryClient.invalidateQueries("low-stock");
      queryClient.invalidateQueries("inventory-logs");
      // Also invalidate product queries to sync shop and product views
      queryClient.invalidateQueries("products");
      setAdjustDialogOpen(false);
      setSelectedProduct(null);
      setAdjustmentForm({
        quantityChange: 0,
        changeType: "RESTOCK",
        reason: "",
      });
    },
    onError: (error: any) => {
      toaster(
        error.response?.data?.message || "Failed to adjust stock",
        { variant: "error" }
      );
    },
  });

  const handleAdjustClick = (product: LowStockItem) => {
    setSelectedProduct(product);
    setAdjustDialogOpen(true);
  };

  const handleAdjustSubmit = () => {
    if (!selectedProduct) return;

    if (adjustmentForm.quantityChange === 0) {
      toaster("Quantity must be greater than 0", { variant: "error" });
      return;
    }

    adjustStockMutation.mutate({
      productId: selectedProduct.id,
      quantityChange: adjustmentForm.quantityChange,
      changeType: adjustmentForm.changeType,
      reason: adjustmentForm.reason || "Manual adjustment",
    });
  };

  const formatCurrency = (amount: number) =>
    `KSh ${amount.toLocaleString()}`;

  const getChangeTypeBadge = (changeType: string) => {
    const variants: Record<string, { label: string; variant: any; icon: any }> = {
      RESTOCK: { label: "Restock", variant: "default", icon: TrendingUp },
      SALE: { label: "Sale", variant: "secondary", icon: TrendingDown },
      RETURN: { label: "Return", variant: "outline", icon: RefreshCw },
      DAMAGE: { label: "Damage", variant: "destructive", icon: AlertTriangle },
      ADJUSTMENT: { label: "Adjustment", variant: "secondary", icon: Edit },
    };

    const config = variants[changeType] || variants.ADJUSTMENT;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const handlePageChange = (newPage: number) => {
    setLogFilters({ ...logFilters, page: newPage });
  };

  if (statsLoading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-muted rounded animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Inventory Management</h1>
        <p className="text-muted-foreground mt-1">
          Monitor stock levels and manage inventory adjustments
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div 
          className="relative overflow-hidden border-0 bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-lg hover:shadow-xl transition-all rounded-xl"
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -4 }}
        >
          <div className="relative z-10 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/90">Total Products</p>
                <p className="text-3xl font-bold mt-1 text-white">
                  {stats?.totalProducts || 0}
                </p>
              </div>
              <div className="p-2 bg-white/20 rounded-lg">
                <Package className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="relative overflow-hidden border-0 bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-lg hover:shadow-xl transition-all rounded-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          whileHover={{ y: -4 }}
        >
          <div className="relative z-10 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/90">Expected Profit</p>
                <p className="text-3xl font-bold mt-1 text-white">
                  {formatCurrency(stats?.expectedProfit || 0)}
                </p>
              </div>
              <div className="p-2 bg-white/20 rounded-lg">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="relative overflow-hidden border-0 bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg hover:shadow-xl transition-all rounded-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          whileHover={{ y: -4 }}
        >
          <div className="relative z-10 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/90">Out of Stock</p>
                <p className="text-3xl font-bold mt-1 text-white">
                  {stats?.outOfStockCount || 0}
                </p>
              </div>
              <div className="p-2 bg-white/20 rounded-lg">
                <Package className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="relative overflow-hidden border-0 bg-gradient-to-br from-green-500 to-green-600 text-white shadow-lg hover:shadow-xl transition-all rounded-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          whileHover={{ y: -4 }}
        >
          <div className="relative z-10 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/90">Inventory Value</p>
                <p className="text-3xl font-bold mt-1 text-white">
                  {formatCurrency(stats?.inventoryValue || 0)}
                </p>
              </div>
              <div className="p-2 bg-white/20 rounded-lg">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Low Stock Alerts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              Low Stock Alerts
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {lowStockLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : (lowStockProducts && (lowStockProducts.products.length > 0 || lowStockProducts.variants.length > 0)) ? (
            <div className="space-y-2">
              {lowStockProducts.products.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                      <Package className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Stock: {product.stockQuantity} / Threshold:{" "}
                        {product.lowStockThreshold}
                      </p>
                      {product.categoryName && (
                        <p className="text-xs text-muted-foreground">
                          {product.categoryName}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAdjustClick(product)}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Adjust Stock
                  </Button>
                </div>
              ))}
              {lowStockProducts.variants.map((variant) => (
                <div
                  key={variant.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                      <Package className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">{variant.productName} - {variant.variantName}</p>
                      <p className="text-sm text-muted-foreground">
                        Stock: {variant.stockQuantity} / Threshold:{" "}
                        {variant.lowStockThreshold}
                      </p>
                      {variant.categoryName && (
                        <p className="text-xs text-muted-foreground">
                          {variant.categoryName}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAdjustClick(variant)}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Adjust Stock
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No low stock alerts at this time
            </p>
          )}
        </CardContent>
      </Card>

      {/* Inventory Logs */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Inventory Logs
            </CardTitle>
            <Select
              value={logFilters.changeType || "all"}
              onValueChange={(value) =>
                setLogFilters({
                  ...logFilters,
                  changeType: value === "all" ? undefined : value,
                  page: 1,
                })
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="RESTOCK">Restock</SelectItem>
                <SelectItem value="SALE">Sale</SelectItem>
                <SelectItem value="RETURN">Return</SelectItem>
                <SelectItem value="DAMAGE">Damage</SelectItem>
                <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : logs && logs.logs.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Before</TableHead>
                      <TableHead className="text-right">After</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm">
                          {format(new Date(log.createdAt), "MMM dd, yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="font-medium">
                          {log.product?.name || "Unknown Product"}
                        </TableCell>
                        <TableCell>{getChangeTypeBadge(log.changeType)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {log.quantityChange > 0 ? "+" : ""}
                          {log.quantityChange}
                        </TableCell>
                        <TableCell className="text-right">
                          {log.quantityBefore}
                        </TableCell>
                        <TableCell className="text-right">
                          {log.quantityAfter}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.reason || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {logs.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing{" "}
                    {(logs.pagination.page - 1) * logs.pagination.limit + 1} to{" "}
                    {Math.min(
                      logs.pagination.page * logs.pagination.limit,
                      logs.pagination.totalCount
                    )}{" "}
                    of {logs.pagination.totalCount} logs
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(logs.pagination.page - 1)}
                      disabled={!logs.pagination.hasPrev}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    <span className="text-sm">
                      Page {logs.pagination.page} of {logs.pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(logs.pagination.page + 1)}
                      disabled={!logs.pagination.hasNext}
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No inventory logs found
            </p>
          )}
        </CardContent>
      </Card>

      {/* Stock Adjustment Dialog */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Stock - {selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Current Stock: <span className="font-semibold">{selectedProduct?.stockQuantity}</span>
              </p>
            </div>

            <div>
              <Label htmlFor="quantity">Quantity Change</Label>
              <Input
                id="quantity"
                type="number"
                value={adjustmentForm.quantityChange}
                onChange={(e) =>
                  setAdjustmentForm({
                    ...adjustmentForm,
                    quantityChange: parseInt(e.target.value) || 0,
                  })
                }
                placeholder="Enter quantity (positive to add, negative to remove)"
              />
            </div>

            <div>
              <Label htmlFor="changeType">Change Type</Label>
              <Select
                value={adjustmentForm.changeType}
                onValueChange={(value: any) =>
                  setAdjustmentForm({ ...adjustmentForm, changeType: value })
                }
              >
                <SelectTrigger id="changeType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RESTOCK">Restock</SelectItem>
                  <SelectItem value="SALE">Sale</SelectItem>
                  <SelectItem value="RETURN">Return</SelectItem>
                  <SelectItem value="DAMAGE">Damage</SelectItem>
                  <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="reason">Reason (Optional)</Label>
              <Textarea
                id="reason"
                value={adjustmentForm.reason}
                onChange={(e) =>
                  setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })
                }
                placeholder="Enter reason for stock adjustment"
                rows={3}
              />
            </div>

            {selectedProduct && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">Preview:</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedProduct.stockQuantity} → {selectedProduct.stockQuantity + adjustmentForm.quantityChange}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAdjustDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdjustSubmit}
              disabled={adjustStockMutation.isLoading || adjustmentForm.quantityChange === 0}
            >
              {adjustStockMutation.isLoading ? "Adjusting..." : "Adjust Stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
