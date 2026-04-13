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
import { Badge } from "src/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "src/components/ui/dialog";
import { Label } from "src/components/ui/label";
import { Textarea } from "src/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import useNotification from "src/hooks/useNotification";
import categoryService, {
  type ProductCategory,
  type CreateCategoryDto,
  type UpdateCategoryDto,
} from "src/services/category.service";
import {
  FolderTree,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Package,
  EyeOff,
} from "lucide-react";

export default function CategoryManagement() {
  const { toaster } = useNotification();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<ProductCategory | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] =
    useState<ProductCategory | null>(null);

  const [formData, setFormData] = useState<CreateCategoryDto>({
    name: "",
    description: "",
    parentId: undefined,
    displayOrder: 0,
    isActive: true,
  });

  // Fetch category tree
  const {
    data: categoryTree,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["category-tree"],
    queryFn: () => categoryService.getTree(),
    onError: () => {
      toaster("Failed to load categories", { variant: "error" });
    },
  });

  // Fetch flat list for parent selection
  const { data: allCategories } = useQuery({
    queryKey: ["categories-all"],
    queryFn: () => categoryService.list({ isActive: true }),
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: (data: CreateCategoryDto | UpdateCategoryDto) => {
      if (editingCategory) {
        return categoryService.update(editingCategory.id, data);
      }
      return categoryService.create(data as CreateCategoryDto);
    },
    onSuccess: () => {
      toaster(
        editingCategory
          ? "Category updated successfully"
          : "Category created successfully",
        { variant: "success" }
      );
      queryClient.invalidateQueries("category-tree");
      queryClient.invalidateQueries("categories-all");
      handleCloseDialog();
    },
    onError: (error: any) => {
      toaster(error.response?.data?.message || "Failed to save category", {
        variant: "error",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => categoryService.delete(id),
    onSuccess: () => {
      toaster("Category deleted successfully", { variant: "success" });
      queryClient.invalidateQueries("category-tree");
      queryClient.invalidateQueries("categories-all");
      setDeleteConfirmOpen(false);
      setCategoryToDelete(null);
    },
    onError: (error: any) => {
      toaster(error.response?.data?.message || "Failed to delete category", {
        variant: "error",
      });
    },
  });

  const handleOpenDialog = (category?: ProductCategory) => {
    if (category) {
      setEditingCategory(category);
      setFormData({
        name: category.name,
        description: category.description || "",
        parentId: category.parentId || undefined,
        displayOrder: category.displayOrder,
        isActive: category.isActive,
      });
    } else {
      setEditingCategory(null);
      setFormData({
        name: "",
        description: "",
        parentId: undefined,
        displayOrder: 0,
        isActive: true,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingCategory(null);
    setFormData({
      name: "",
      description: "",
      parentId: undefined,
      displayOrder: 0,
      isActive: true,
    });
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      toaster("Category name is required", { variant: "error" });
      return;
    }
    saveMutation.mutate(formData);
  };

  const handleDeleteClick = (category: ProductCategory) => {
    setCategoryToDelete(category);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (categoryToDelete) {
      deleteMutation.mutate(categoryToDelete.id);
    }
  };

  const toggleExpand = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const renderCategoryTree = (
    categories: ProductCategory[],
    level = 0
  ): React.ReactElement[] => {
    return categories
      .filter((cat) =>
        search
          ? cat.name.toLowerCase().includes(search.toLowerCase())
          : true
      )
      .map((category) => {
        const hasChildren = category.children && category.children.length > 0;
        const isExpanded = expandedCategories.has(category.id);

        return (
          <motion.div
            key={category.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`${level > 0 ? "ml-6 border-l-2 border-border pl-4" : ""}`}
          >
            <div className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors group">
              <div className="flex items-center gap-3 flex-1">
                {hasChildren && (
                  <button
                    onClick={() => toggleExpand(category.id)}
                    className="p-1 hover:bg-accent rounded"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                )}
                {!hasChildren && <div className="w-6" />}

                <FolderTree className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{category.name}</h4>
                    {!category.isActive && (
                      <Badge variant="secondary">
                        <EyeOff className="w-3 h-3 mr-1" />
                        Inactive
                      </Badge>
                    )}
                    {category._count && category._count.products > 0 && (
                      <Badge variant="outline">
                        <Package className="w-3 h-3 mr-1" />
                        {category._count.products}
                      </Badge>
                    )}
                  </div>
                  {category.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {category.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenDialog(category)}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteClick(category)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {hasChildren && isExpanded && (
              <div className="mt-2">
                {renderCategoryTree(category.children!, level + 1)}
              </div>
            )}
          </motion.div>
        );
      });
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
          <h1 className="text-2xl md:text-3xl font-bold">Category Management</h1>
          <p className="text-muted-foreground mt-1">
            Organize your product catalog with hierarchical categories
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="w-4 h-4 mr-2" />
            Add Category
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <Input
            placeholder="Search categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </CardContent>
      </Card>

      {/* Category Tree */}
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
        </CardHeader>
        <CardContent>
          {categoryTree && categoryTree.length > 0 ? (
            <div className="space-y-2">
              {renderCategoryTree(categoryTree)}
            </div>
          ) : (
            <div className="text-center py-12">
              <FolderTree className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No categories yet. Create your first category to get started.
              </p>
              <Button onClick={() => handleOpenDialog()} className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Create Category
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? "Edit Category" : "Create New Category"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Category Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., Padel Rackets"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Brief description of this category"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="parent">Parent Category</Label>
              <Select
                value={formData.parentId || "none"}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    parentId: value === "none" ? undefined : value,
                  })
                }
              >
                <SelectTrigger id="parent">
                  <SelectValue placeholder="Select parent category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Root Category)</SelectItem>
                  {allCategories
                    ?.filter((cat) => cat.id !== editingCategory?.id)
                    .map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="displayOrder">Display Order</Label>
              <Input
                id="displayOrder"
                type="number"
                value={formData.displayOrder}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    displayOrder: parseInt(e.target.value) || 0,
                  })
                }
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: e.target.checked })
                }
                className="w-4 h-4"
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                Active (visible to customers)
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isLoading}
            >
              {saveMutation.isLoading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete "{categoryToDelete?.name}"?
            {categoryToDelete?._count &&
              categoryToDelete._count.products > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  This category has {categoryToDelete._count.products}{" "}
                  product(s). Please move or delete them first.
                </span>
              )}
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
