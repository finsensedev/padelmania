import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "react-query";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Textarea } from "src/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import { Checkbox } from "src/components/ui/checkbox";
import { Badge } from "src/components/ui/badge";
import useNotification from "src/hooks/useNotification";
import useTwoFAPrompt from "src/hooks/useTwoFAPrompt";
import productService from "src/services/product.service";
import categoryService from "src/services/category.service";
import {
  ArrowLeft,
  Upload,
  X,
  Plus,
  Trash2,
  Save,
  Loader2,
} from "lucide-react";

interface ProductFormData {
  name: string;
  description: string;
  categoryId: string;
  brand: string;
  sku: string;
  basePrice: number;
  salePrice: number | undefined;
  costPrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  specifications: any;
  featured: boolean;
  newArrival: boolean;
  bestSeller: boolean;
  isActive: boolean;
}

interface Variant {
  name: string;
  sku: string;
  price: number;
  stockQuantity: number;
  options: Record<string, string>;
}

export default function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toaster } = useNotification();
  const queryClient = useQueryClient();
  const prompt2FA = useTwoFAPrompt();
  const isEditMode = !!id;

  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    description: "",
    categoryId: "",
    brand: "",
    sku: "",
    basePrice: 0,
    salePrice: undefined,
    costPrice: 0,
    stockQuantity: 0,
    lowStockThreshold: 5,
    specifications: {},
    featured: false,
    newArrival: false,
    bestSeller: false,
    isActive: true,
  });

  const [specInput, setSpecInput] = useState({ key: "", value: "" });
  const [variants, setVariants] = useState<Variant[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<any[]>([]);

  // Fetch product if editing
  const { isLoading: productLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: () => productService.getById(id!),
    enabled: isEditMode,
    onSuccess: (data) => {
      setFormData({
        name: data.name,
        description: data.description || "",
        categoryId: data.categoryId,
        brand: data.brand || "",
        sku: data.sku || "",
        basePrice: data.basePrice,
        salePrice: data.salePrice,
        costPrice: data.costPrice || 0,
        stockQuantity: data.stockQuantity,
        lowStockThreshold: data.lowStockThreshold,
        specifications: data.specifications || {},
        featured: data.featured,
        newArrival: data.newArrival,
        bestSeller: data.bestSeller,
        isActive: data.isActive,
      });
      if (data.images) {
        setExistingImages(data.images);
      }
      if (data.variants) {
        setVariants(
          data.variants.map((v) => ({
            name: v.name,
            sku: v.sku || "",
            price: v.price || 0,
            stockQuantity: v.stockQuantity,
            options: v.options || {},
          }))
        );
      }
    },
  });

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ["categories-list"],
    queryFn: () => categoryService.list({ isActive: true }),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async ({ data, twoFACode }: { data: any; twoFACode: string }) => {
      const response = await productService.create(data, twoFACode);
      return response;
    },
    onSuccess: () => {
      toaster("Product created successfully", { variant: "success" });
      queryClient.invalidateQueries("products");
      // Invalidate inventory queries to ensure new product appears in inventory views
      queryClient.invalidateQueries("inventory-stats");
      queryClient.invalidateQueries("low-stock");
      queryClient.invalidateQueries("inventory-logs");
      navigate("/manager/shop/products");
    },
    onError: (error: any) => {
      toaster(error.response?.data?.message || "Failed to create product", {
        variant: "error",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ data, twoFACode }: { data: any; twoFACode: string }) => {
      return productService.update(id!, data, twoFACode);
    },
    onSuccess: () => {
      toaster("Product updated successfully", { variant: "success" });
      // Invalidate product queries
      queryClient.invalidateQueries(["product", id]);
      queryClient.invalidateQueries("products");
      // Invalidate inventory queries to ensure prices and stock sync across all views
      queryClient.invalidateQueries("inventory-stats");
      queryClient.invalidateQueries("low-stock");
      queryClient.invalidateQueries("inventory-logs");
      navigate("/manager/shop/products");
    },
    onError: (error: any) => {
      toaster(error.response?.data?.message || "Failed to update product", {
        variant: "error",
      });
    },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + images.length + existingImages.length > 5) {
      toaster("Maximum 5 images allowed", { variant: "error" });
      return;
    }

    setImages([...images, ...files]);
    const previews = files.map((file) => URL.createObjectURL(file));
    setImagePreviews([...imagePreviews, ...previews]);
  };

  const removeNewImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    const newPreviews = imagePreviews.filter((_, i) => i !== index);
    setImages(newImages);
    setImagePreviews(newPreviews);
  };

  const removeExistingImage = async (imageId: string) => {
    if (!id) return;
    try {
      await productService.removeImage(imageId);
      setExistingImages(existingImages.filter((img) => img.id !== imageId));
      toaster("Image removed", { variant: "success" });
    } catch (error) {
      toaster("Failed to remove image", { variant: "error" });
    }
  };

  const addSpecification = () => {
    if (specInput.key && specInput.value) {
      setFormData({
        ...formData,
        specifications: {
          ...formData.specifications,
          [specInput.key]: specInput.value,
        },
      });
      setSpecInput({ key: "", value: "" });
    }
  };

  const removeSpecification = (key: string) => {
    const specs = { ...formData.specifications };
    delete specs[key];
    setFormData({ ...formData, specifications: specs });
  };

  // Variant functions - currently not used in UI
  // const addVariant = () => {
  //   setVariants([
  //     ...variants,
  //     {
  //       name: "",
  //       sku: "",
  //       price: formData.basePrice,
  //       stockQuantity: 0,
  //       options: {},
  //     },
  //   ]);
  // };

  // const updateVariant = (index: number, field: keyof Variant, value: any) => {
  //   const newVariants = [...variants];
  //   newVariants[index] = { ...newVariants[index], [field]: value };
  //   setVariants(newVariants);
  // };

  // const removeVariant = (index: number) => {
  //   setVariants(variants.filter((_, i) => i !== index));
  // };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.categoryId || formData.basePrice <= 0) {
      toaster("Please fill in all required fields", { variant: "error" });
      return;
    }

    if (isEditMode) {
      // Require 2FA confirmation for product updates
      const code = await prompt2FA({
        title: "Confirm Product Update",
        description: "Enter your 2FA code to confirm the product update. This action will modify product information and pricing.",
        submitLabel: "Confirm Update",
        cancelLabel: "Cancel",
      });

      if (!code) {
        // User cancelled - don't proceed with update
        return;
      }

      try {
        // If there are new images to upload, upload them first
        if (images.length > 0) {
          toaster("Uploading images...", { variant: "default" });
          
          // Upload images to Cloudinary
          const uploadResult = await productService.uploadImages(images);
          
          if (uploadResult.imageUrls && uploadResult.imageUrls.length > 0) {
            // Add the uploaded images to the product (with 2FA code)
            const imagesToAdd = uploadResult.imageUrls.map((url, index) => ({
              imageUrl: url,
              altText: formData.name,
              displayOrder: existingImages.length + index,
              isPrimary: existingImages.length === 0 && index === 0, // Primary if no existing images
            }));
            
            await productService.addImages(id!, imagesToAdd, code);
          }
        }

        // Update existing product data (2FA verified)
        updateMutation.mutate({ data: formData, twoFACode: code });
      } catch (error: any) {
        toaster(error.response?.data?.message || "Failed to upload images", {
          variant: "error",
        });
      }
    } else {
      // Require 2FA confirmation for creating new products
      const code = await prompt2FA({
        title: "Confirm New Product",
        description: "Enter your 2FA code to confirm adding this new product to the inventory.",
        submitLabel: "Confirm Create",
        cancelLabel: "Cancel",
      });

      if (!code) {
        // User cancelled - don't proceed with creation
        return;
      }

      // Create new product with images (2FA verified)
      const formDataToSend = new FormData();
      formDataToSend.append("name", formData.name);
      formDataToSend.append("description", formData.description);
      formDataToSend.append("categoryId", formData.categoryId);
      formDataToSend.append("brand", formData.brand);
      formDataToSend.append("sku", formData.sku);
      formDataToSend.append("basePrice", formData.basePrice.toString());
      if (formData.salePrice) {
        formDataToSend.append("salePrice", formData.salePrice.toString());
      }
      formDataToSend.append("costPrice", formData.costPrice.toString());
      formDataToSend.append("stockQuantity", formData.stockQuantity.toString());
      formDataToSend.append(
        "lowStockThreshold",
        formData.lowStockThreshold.toString()
      );
      formDataToSend.append(
        "specifications",
        JSON.stringify(formData.specifications)
      );
      formDataToSend.append("featured", formData.featured.toString());
      formDataToSend.append("newArrival", formData.newArrival.toString());
      formDataToSend.append("bestSeller", formData.bestSeller.toString());
      formDataToSend.append("isActive", formData.isActive.toString());

      if (variants.length > 0) {
        formDataToSend.append("variants", JSON.stringify(variants));
      }

      images.forEach((image) => {
        formDataToSend.append("images", image);
      });

      createMutation.mutate({ data: formDataToSend, twoFACode: code });
    }
  };

  if (isEditMode && productLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">
            {isEditMode ? "Edit Product" : "Create New Product"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEditMode
              ? "Update product information and inventory"
              : "Add a new product to your inventory"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">
                  Product Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Enter product name"
                  required
                />
              </div>

              <div>
                <Label htmlFor="category">
                  Category <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.categoryId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, categoryId: value })
                  }
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="brand">Brand</Label>
                <Input
                  id="brand"
                  value={formData.brand}
                  onChange={(e) =>
                    setFormData({ ...formData, brand: e.target.value })
                  }
                  placeholder="Enter brand name"
                />
              </div>

              <div>
                <Label htmlFor="sku">SKU</Label>
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) =>
                    setFormData({ ...formData, sku: e.target.value })
                  }
                  placeholder="Enter SKU"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Enter product description"
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Pricing & Inventory */}
        <Card>
          <CardHeader>
            <CardTitle>Pricing & Inventory</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              <strong>Cost Price:</strong> What you paid to acquire/purchase the product from supplier<br />
              <strong>Base Price:</strong> Regular selling price shown to customers (must be higher than cost)<br />
              <strong>Sale Price:</strong> Discounted price during promotions (optional, lower than base price)
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="costPrice">
                  Cost Price (KSh)
                </Label>
                <Input
                  id="costPrice"
                  type="number"
                  value={formData.costPrice}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      costPrice: parseFloat(e.target.value) || 0,
                    })
                  }
                  min="0"
                  step="0.01"
                  placeholder="Your purchase cost"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  How much you paid to get this item
                </p>
              </div>

              <div>
                <Label htmlFor="basePrice">
                  Base Price (KSh) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="basePrice"
                  type="number"
                  value={formData.basePrice}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      basePrice: parseFloat(e.target.value) || 0,
                    })
                  }
                  min="0"
                  step="0.01"
                  required
                  placeholder="Customer sees this"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Regular selling price (includes profit)
                </p>
              </div>

              <div>
                <Label htmlFor="salePrice">Sale Price (KSh)</Label>
                <Input
                  id="salePrice"
                  type="number"
                  value={formData.salePrice || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      salePrice: e.target.value
                        ? parseFloat(e.target.value)
                        : undefined,
                    })
                  }
                  min="0"
                  step="0.01"
                  placeholder="Optional discount price"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Promotional price (leave empty if no sale)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="stockQuantity">Stock Quantity</Label>
                <Input
                  id="stockQuantity"
                  type="number"
                  value={formData.stockQuantity}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      stockQuantity: parseInt(e.target.value) || 0,
                    })
                  }
                  min="0"
                />
              </div>

              <div>
                <Label htmlFor="lowStockThreshold">Low Stock Threshold</Label>
                <Input
                  id="lowStockThreshold"
                  type="number"
                  value={formData.lowStockThreshold}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      lowStockThreshold: parseInt(e.target.value) || 0,
                    })
                  }
                  min="0"
                />
              </div>

            </div>
          </CardContent>
        </Card>

        {/* Images */}
        <Card>
          <CardHeader>
            <CardTitle>Product Images</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="images">Upload Images (Max 5)</Label>
              <div className="mt-2">
                <label
                  htmlFor="images"
                  className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent/50 transition-colors"
                >
                  <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Click to upload images
                  </p>
                  <input
                    id="images"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Existing Images */}
            {existingImages.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Current Images</p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {existingImages.map((img) => (
                    <div key={img.id} className="relative group">
                      <img
                        src={img.imageUrl}
                        alt={img.altText || "Product"}
                        className="w-full h-24 object-cover rounded-lg"
                      />
                      {img.isPrimary && (
                        <Badge className="absolute top-1 left-1 text-xs">
                          Primary
                        </Badge>
                      )}
                      <button
                        type="button"
                        onClick={() => removeExistingImage(img.id)}
                        className="absolute top-1 right-1 p-1 bg-destructive rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3 text-destructive-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* New Image Previews */}
            {imagePreviews.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">New Images</p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={preview}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-24 object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => removeNewImage(index)}
                        className="absolute top-1 right-1 p-1 bg-destructive rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3 text-destructive-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Specifications */}
        <Card>
          <CardHeader>
            <CardTitle>Specifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Key (e.g., Weight)"
                value={specInput.key}
                onChange={(e) =>
                  setSpecInput({ ...specInput, key: e.target.value })
                }
              />
              <Input
                placeholder="Value (e.g., 500g)"
                value={specInput.value}
                onChange={(e) =>
                  setSpecInput({ ...specInput, value: e.target.value })
                }
              />
              <Button type="button" onClick={addSpecification}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {Object.keys(formData.specifications).length > 0 && (
              <div className="space-y-2">
                {Object.entries(formData.specifications).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between p-2 border rounded-lg"
                  >
                    <div>
                      <span className="font-medium">{key}:</span> {String(value)}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSpecification(key)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Product Flags */}
        <Card>
          <CardHeader>
            <CardTitle>Product Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="featured"
                  checked={formData.featured}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, featured: !!checked })
                  }
                />
                <Label htmlFor="featured">Featured Product</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="newArrival"
                  checked={formData.newArrival}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, newArrival: !!checked })
                  }
                />
                <Label htmlFor="newArrival">New Arrival</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="bestSeller"
                  checked={formData.bestSeller}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, bestSeller: !!checked })
                  }
                />
                <Label htmlFor="bestSeller">Best Seller</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isActive: !!checked })
                  }
                />
                <Label htmlFor="isActive">Active (Visible to customers)</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit Buttons */}
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/manager/shop/products")}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isLoading || updateMutation.isLoading}
          >
            {createMutation.isLoading || updateMutation.isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isEditMode ? "Updating..." : "Creating..."}
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {isEditMode ? "Update Product" : "Create Product"}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
