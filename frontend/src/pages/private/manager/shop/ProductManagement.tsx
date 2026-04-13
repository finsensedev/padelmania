import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Badge } from "src/components/ui/badge";
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
import useNotification from "src/hooks/useNotification";
import useTwoFAPrompt from "src/hooks/useTwoFAPrompt";
import productService, { type Product, type ProductFilters } from "src/services/product.service";
import categoryService from "src/services/category.service";
import {
  Package,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  Search,
  EyeOff,
  Star,
  TrendingUp,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export default function ProductManagement() {
  const { toaster } = useNotification();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const prompt2FA = useTwoFAPrompt();

  const [filters, setFilters] = useState<ProductFilters>({
    page: 1,
    limit: 20,
    isActive: undefined,
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const [search, setSearch] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // Fetch products
  const {
    data: productData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["products", filters, search],
    queryFn: () => productService.list({ ...filters, search: search || undefined }),
    keepPreviousData: true,
    onError: () => {
      toaster("Failed to load products", { variant: "error" });
    },
  });

  // Fetch categories for filter
  const { data: categories } = useQuery({
    queryKey: ["categories-all"],
    queryFn: () => categoryService.list({ isActive: true }),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: ({ id, twoFACode }: { id: string; twoFACode: string }) => 
      productService.delete(id, twoFACode),
    onSuccess: () => {
      toaster("Product deleted successfully", { variant: "success" });
      queryClient.invalidateQueries("products");
      // Invalidate inventory queries to ensure deleted product is removed from all views
      queryClient.invalidateQueries("inventory-stats");
      queryClient.invalidateQueries("low-stock");
      queryClient.invalidateQueries("inventory-logs");
      setDeleteConfirmOpen(false);
      setProductToDelete(null);
    },
    onError: (error: any) => {
      toaster(error.response?.data?.message || "Failed to delete product", {
        variant: "error",
      });
    },
  });

  const handleDeleteClick = (product: Product) => {
    setProductToDelete(product);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!productToDelete) return;

    // Close the delete confirmation dialog first before showing 2FA modal
    const productName = productToDelete.name;
    const productId = productToDelete.id;
    setDeleteConfirmOpen(false);

    // Require 2FA confirmation for deleting products
    const code = await prompt2FA({
      title: "Confirm Product Deletion",
      description: `Enter your 2FA code to confirm deleting "${productName}". This action cannot be undone.`,
      submitLabel: "Confirm Delete",
      cancelLabel: "Cancel",
    });

    if (!code) {
      // User cancelled - clear the product to delete
      setProductToDelete(null);
      return;
    }

    // Delete product (2FA verified)
    deleteMutation.mutate({ id: productId, twoFACode: code });
  };

  const formatCurrency = (amount: number) =>
    `KSh ${amount.toLocaleString()}`;

  const handleSearch = () => {
    setFilters({ ...filters, page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    setFilters({ ...filters, page: newPage });
  };

  const getPriceDisplay = (product: Product) => {
    if (product.salePrice && product.salePrice < product.basePrice) {
      return (
        <div className="flex flex-col">
          <span className="text-sm font-bold text-green-600">
            {formatCurrency(product.salePrice)}
          </span>
          <span className="text-xs line-through text-muted-foreground">
            {formatCurrency(product.basePrice)}
          </span>
        </div>
      );
    }
    return (
      <span className="text-sm font-bold">{formatCurrency(product.basePrice)}</span>
    );
  };

  const getStockBadge = (product: Product) => {
    if (product.stockQuantity === 0) {
      return (
        <Badge variant="destructive">
          <AlertCircle className="w-3 h-3 mr-1" />
          Out of Stock
        </Badge>
      );
    }
    if (product.stockQuantity <= product.lowStockThreshold) {
      return (
        <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600">
          <AlertCircle className="w-3 h-3 mr-1" />
          Low Stock ({product.stockQuantity})
        </Badge>
      );
    }
    return (
      <Badge variant="outline">
        In Stock ({product.stockQuantity})
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Product Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage your product catalog and inventory
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => navigate("/manager/shop/products/new")}>
            <Plus className="w-4 h-4 mr-2" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Search products..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <Button onClick={handleSearch}>
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <Select
              value={filters.categoryId || "all"}
              onValueChange={(value) =>
                setFilters({
                  ...filters,
                  categoryId: value === "all" ? undefined : value,
                  page: 1,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories?.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={
                filters.isActive === undefined
                  ? "all"
                  : filters.isActive
                  ? "active"
                  : "inactive"
              }
              onValueChange={(value) =>
                setFilters({
                  ...filters,
                  isActive:
                    value === "all"
                      ? undefined
                      : value === "active"
                      ? true
                      : false,
                  page: 1,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <Button
              variant={filters.featured ? "default" : "outline"}
              size="sm"
              onClick={() =>
                setFilters({
                  ...filters,
                  featured: filters.featured ? undefined : true,
                  page: 1,
                })
              }
            >
              <Star className="w-4 h-4 mr-1" />
              Featured
            </Button>
            <Button
              variant={filters.newArrival ? "default" : "outline"}
              size="sm"
              onClick={() =>
                setFilters({
                  ...filters,
                  newArrival: filters.newArrival ? undefined : true,
                  page: 1,
                })
              }
            >
              <TrendingUp className="w-4 h-4 mr-1" />
              New Arrivals
            </Button>
            <Button
              variant={filters.inStock === false ? "default" : "outline"}
              size="sm"
              onClick={() =>
                setFilters({
                  ...filters,
                  inStock: filters.inStock === false ? undefined : false,
                  page: 1,
                })
              }
            >
              <AlertCircle className="w-4 h-4 mr-1" />
              Out of Stock
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Products Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {productData?.products.map((product) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -4, scale: 1.02 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            <Card className="overflow-hidden hover:shadow-lg transition-all duration-200 h-full flex flex-col">
              <div className="relative w-full h-36 sm:h-40 bg-muted overflow-hidden flex-shrink-0">
                {product.images && product.images.length > 0 ? (
                  <img
                    src={product.images[0].imageUrl}
                    alt={product.name}
                    className="w-full h-full object-contain object-center p-2"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-12 h-12 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute top-2 right-2 flex flex-col gap-1">
                  {product.featured && (
                    <Badge className="bg-yellow-500">
                      <Star className="w-3 h-3 mr-1" />
                      Featured
                    </Badge>
                  )}
                  {product.newArrival && (
                    <Badge className="bg-green-500">New</Badge>
                  )}
                  {!product.isActive && (
                    <Badge variant="secondary">
                      <EyeOff className="w-3 h-3 mr-1" />
                      Hidden
                    </Badge>
                  )}
                </div>
              </div>
              <CardContent className="p-3 flex-1 flex flex-col">
                <div className="flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-base line-clamp-2 flex-1 min-h-[2.5rem]">
                      {product.name}
                    </h3>
                  </div>
                  {product.brand && (
                    <p className="text-xs text-muted-foreground">{product.brand}</p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {getPriceDisplay(product)}
                    </div>
                    {getStockBadge(product)}
                  </div>
                  {product.category && (
                    <p className="text-xs text-muted-foreground">
                      {product.category.name}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => navigate(`/manager/shop/products/${product.id}`)}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteClick(product)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Empty State */}
      {productData?.products.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No products found. Create your first product to get started.
              </p>
              <Button
                onClick={() => navigate("/manager/shop/products/new")}
                className="mt-4"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Product
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {productData && productData.pagination.totalPages > 1 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(productData.pagination.page - 1) * productData.pagination.limit + 1} to{" "}
                {Math.min(
                  productData.pagination.page * productData.pagination.limit,
                  productData.pagination.totalCount
                )}{" "}
                of {productData.pagination.totalCount} products
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(productData.pagination.page - 1)}
                  disabled={!productData.pagination.hasPrev}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
                <span className="text-sm">
                  Page {productData.pagination.page} of {productData.pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(productData.pagination.page + 1)}
                  disabled={!productData.pagination.hasNext}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete "{productToDelete?.name}"? This action
            cannot be undone.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isLoading}
            >
              {deleteMutation.isLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
