import { useState, useEffect, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Badge } from "src/components/ui/badge";
import { Separator } from "src/components/ui/separator";
import useNotification from "src/hooks/useNotification";
import { type Product } from "src/services/product.service";
import paymentService from "src/services/payment.service";
import { useSelector } from "react-redux";
import type { RootState } from "src/redux/store";
import { SocketContext } from "src/contexts/SocketProvider";
import {
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Loader2,
  Package,
  Sparkles,
  Minus,
  Plus,
} from "lucide-react";

interface ProductDetailModalProps {
  product: Product | null;
  open: boolean;
  onClose: () => void;
}

export default function ProductDetailModal({
  product,
  open,
  onClose,
}: ProductDetailModalProps) {
  const { toaster } = useNotification();
  const { user } = useSelector((state: RootState) => state.userState);
  const queryClient = useQueryClient();

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  const { socket } = useContext(SocketContext);

  // Reset auto-rotation when user manually selects an image
  const [autoRotate, setAutoRotate] = useState(true);

  // Auto-fill phone number from user profile
  useEffect(() => {
    if (user?.phoneNumber) {
      setPhoneNumber(user.phoneNumber);
    }
  }, [user]);

  // Auto-rotate images every 5 seconds (only if autoRotate is enabled)
  useEffect(() => {
    if (!product?.images || product.images.length <= 1 || !autoRotate) return;

    const interval = setInterval(() => {
      setCurrentImageIndex((prev) =>
        prev === product.images!.length - 1 ? 0 : prev + 1
      );
    }, 5000);

    return () => clearInterval(interval);
  }, [product, autoRotate]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setCurrentImageIndex(0);
      setAutoRotate(true);
      setIsCheckingOut(false);
      setShowSuccess(false);
      setSelectedVariantId(null);
      setCurrentOrderId(null);
      setQuantity(1);
    }
  }, [open]);

  // WebSocket listener for shop order updates
  useEffect(() => {
    if (!socket || !currentOrderId) return;

    const handleShopOrderUpdate = (data: {
      orderId: string;
      orderNumber: string;
      status: string;
      paymentStatus: string;
      message?: string;
    }) => {
      // Only process if it's our current order
      if (data.orderId !== currentOrderId) return;

      // Payment successful
      if (data.status === "CONFIRMED" || data.paymentStatus === "COMPLETED") {
        setIsCheckingOut(false);
        setShowSuccess(true);
        queryClient.invalidateQueries("shop-products");
        toaster(data.message || "Payment successful!", { variant: "success" });
      }
      // Payment failed or cancelled
      else if (data.status === "CANCELLED" || data.paymentStatus === "FAILED") {
        setIsCheckingOut(false);
        toaster(data.message || "Payment failed. Please try again.", { variant: "error" });
        setCurrentOrderId(null);
      }
    };

    socket.on("shop:order:update", handleShopOrderUpdate);

    return () => {
      socket.off("shop:order:update", handleShopOrderUpdate);
    };
  }, [socket, currentOrderId, queryClient, toaster]);

  const purchaseMutation = useMutation({
    mutationFn: async (data: { productId: string; variantId?: string; phoneNumber: string; quantity: number }) => {
      const response = await paymentService.initiateShopPayment({
        productId: data.productId,
        variantId: data.variantId,
        quantity: data.quantity,
        phoneNumber: data.phoneNumber,
      });
      return response;
    },
    onSuccess: (response) => {
      setCurrentOrderId(response.orderId);
      toaster("Payment initiated. Please complete on your phone.", { variant: "default" });
      // WebSocket will handle the payment status updates
    },
    onError: (error: any) => {
      toaster(error.response?.data?.message || "Failed to initiate payment. Please try again.", {
        variant: "error",
      });
      setIsCheckingOut(false);
    },
  });

  if (!product) return null;

  const selectedVariant = product.variants?.find((v) => v.id === selectedVariantId);
  
  // Round prices to integers for M-Pesa compatibility
  const currentPrice = Math.round(
    selectedVariant
      ? selectedVariant.salePrice || selectedVariant.price || 0
      : product.salePrice || product.basePrice
  );
  
  const currentStock = selectedVariant
    ? selectedVariant.stockQuantity
    : product.stockQuantity;

  const formatCurrency = (amount: number) => `KSh ${Math.round(amount).toLocaleString()}`;

  const hasDiscount = selectedVariant
    ? selectedVariant.salePrice && selectedVariant.salePrice < (selectedVariant.price || 0)
    : product.salePrice && product.salePrice < product.basePrice;
    
  const basePrice = Math.round(selectedVariant ? selectedVariant.price || 0 : product.basePrice);
  
  const discountPercent = hasDiscount
    ? Math.round(((basePrice - currentPrice) / basePrice) * 100)
    : 0;

  const images = product.images || [];
  const hasMultipleImages = images.length > 1;

  const handlePreviousImage = () => {
    setAutoRotate(false); // Stop auto-rotation when user navigates
    setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNextImage = () => {
    setAutoRotate(false); // Stop auto-rotation when user navigates
    setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const handleThumbnailClick = (index: number) => {
    setAutoRotate(false); // Stop auto-rotation when user clicks thumbnail
    setCurrentImageIndex(index);
  };

  const handleCheckout = () => {
    if (!phoneNumber || phoneNumber.length < 10) {
      toaster("Please enter a valid phone number", { variant: "error" });
      return;
    }

    if (product.variants && product.variants.length > 0 && !selectedVariantId) {
      toaster("Please select a variant", { variant: "error" });
      return;
    }

    if (currentStock === 0) {
      toaster("This item is out of stock", { variant: "error" });
      return;
    }

    if (quantity > currentStock) {
      toaster(`Only ${currentStock} items available in stock`, { variant: "error" });
      return;
    }

    if (quantity < 1) {
      toaster("Quantity must be at least 1", { variant: "error" });
      return;
    }

    setIsCheckingOut(true);
    purchaseMutation.mutate({
      productId: product.id,
      variantId: selectedVariantId || undefined,
      phoneNumber: phoneNumber,
      quantity: quantity,
    });
  };

  const handleQuantityChange = (value: number) => {
    if (value < 1) {
      setQuantity(1);
    } else if (value > currentStock) {
      setQuantity(currentStock);
      toaster(`Maximum ${currentStock} items available`, { variant: "warning" });
    } else {
      setQuantity(value);
    }
  };

  const incrementQuantity = () => {
    if (quantity < currentStock) {
      setQuantity(quantity + 1);
    } else {
      toaster(`Maximum ${currentStock} items available`, { variant: "warning" });
    }
  };

  const decrementQuantity = () => {
    if (quantity > 1) {
      setQuantity(quantity - 1);
    }
  };

  const handleClose = () => {
    // Prevent closing during checkout
    if (isCheckingOut) {
      toaster("Please wait while we process your payment", { variant: "warning" });
      return;
    }
    
    if (showSuccess) {
      setShowSuccess(false);
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto border-border/50 dark:border-border/30 dark:bg-card">
        <AnimatePresence mode="wait">
          {showSuccess ? (
            <SuccessScreen product={product} onClose={handleClose} />
          ) : (
            <motion.div
              key="product-details"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <DialogHeader>
                <DialogTitle className="text-2xl">{product.name}</DialogTitle>
              </DialogHeader>

              <div className="grid md:grid-cols-2 gap-6 mt-4">
                {/* Image Section */}
                <div>
                  <div className="relative aspect-square bg-muted rounded-lg overflow-hidden group">
                    <AnimatePresence mode="wait">
                      {images.length > 0 ? (
                        <motion.img
                          key={currentImageIndex}
                          src={images[currentImageIndex].imageUrl}
                          alt={product.name}
                          className="w-full h-full object-contain p-2"
                          initial={{ opacity: 0, scale: 1.05 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.3 }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-24 h-24 text-muted-foreground" />
                        </div>
                      )}
                    </AnimatePresence>

                    {/* Navigation Arrows */}
                    {hasMultipleImages && (
                      <>
                        <button
                          onClick={handlePreviousImage}
                          className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <ChevronLeft className="w-6 h-6" />
                        </button>
                        <button
                          onClick={handleNextImage}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <ChevronRight className="w-6 h-6" />
                        </button>
                      </>
                    )}

                    {/* Image Indicators */}
                    {hasMultipleImages && (
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                        {images.map((_, index) => (
                          <button
                            key={index}
                            onClick={() => handleThumbnailClick(index)}
                            className={`w-2 h-2 rounded-full transition-all ${
                              index === currentImageIndex
                                ? "bg-white w-8"
                                : "bg-white/50"
                            }`}
                          />
                        ))}
                      </div>
                    )}

                    {/* Badges */}
                    <div className="absolute top-4 right-4 flex flex-col gap-2">
                      {product.featured && (
                        <Badge className="bg-yellow-500">Featured</Badge>
                      )}
                      {product.newArrival && (
                        <Badge className="bg-green-500">New</Badge>
                      )}
                      {product.bestSeller && (
                        <Badge className="bg-blue-500">Best Seller</Badge>
                      )}
                      {hasDiscount && (
                        <Badge variant="destructive">Save {discountPercent}%</Badge>
                      )}
                    </div>
                  </div>

                  {/* Thumbnail Gallery */}
                  {hasMultipleImages && (
                    <div className="mt-4">
                      <p className="text-xs text-muted-foreground mb-2">
                        Click to view different angles ({images.length} photos)
                      </p>
                      <div className="grid grid-cols-5 gap-2">
                        {images.slice(0, 5).map((img, index) => (
                          <button
                            key={img.id}
                            onClick={() => handleThumbnailClick(index)}
                            className={`aspect-square rounded-lg overflow-hidden border-2 transition-all bg-muted ${
                              index === currentImageIndex
                                ? "border-primary ring-2 ring-primary/50 scale-95"
                                : "border-transparent hover:border-muted-foreground/50"
                            }`}
                          >
                            <img
                              src={img.imageUrl}
                              alt={`${product.name} - View ${index + 1}`}
                              className="w-full h-full object-contain p-1"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Details Section */}
                <div className="space-y-4">
                  {/* Brand */}
                  {product.brand && (
                    <div>
                      <span className="text-sm text-muted-foreground">Brand</span>
                      <p className="text-lg font-medium">{product.brand}</p>
                    </div>
                  )}

                  {/* Variants */}
                  {product.variants && product.variants.length > 0 && (
                    <div>
                      <span className="text-sm text-muted-foreground mb-2 block">
                        Select Option
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {product.variants.map((variant) => (
                          <Button
                            key={variant.id}
                            variant={selectedVariantId === variant.id ? "default" : "outline"}
                            onClick={() => setSelectedVariantId(variant.id)}
                            disabled={variant.stockQuantity === 0}
                            className={variant.stockQuantity === 0 ? "opacity-50" : ""}
                          >
                            {variant.name}
                            {variant.stockQuantity === 0 && " (Out of Stock)"}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Price */}
                  <div>
                    <span className="text-sm text-muted-foreground mb-2 block">
                      Price
                    </span>
                    {hasDiscount ? (
                      <div className="flex items-center gap-3">
                        <span className="text-3xl font-bold text-green-600">
                          {formatCurrency(currentPrice)}
                        </span>
                        <span className="text-xl line-through text-muted-foreground">
                          {formatCurrency(basePrice)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-3xl font-bold">
                        {formatCurrency(currentPrice)}
                      </span>
                    )}
                  </div>

                  {/* Stock Status - Only show if out of stock */}
                  {currentStock === 0 && (
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">
                        <X className="w-3 h-3 mr-1" />
                        Out of Stock
                      </Badge>
                    </div>
                  )}

                  <Separator />

                  {/* Description */}
                  {product.description && (
                    <div>
                      <h3 className="font-semibold mb-2">Description</h3>
                      <p className="text-muted-foreground whitespace-pre-wrap">
                        {product.description}
                      </p>
                    </div>
                  )}

                  {/* Specifications */}
                  {product.specifications &&
                    Object.keys(product.specifications).length > 0 && (
                      <div>
                        <h3 className="font-semibold mb-2">Specifications</h3>
                        <div className="space-y-2">
                          {Object.entries(product.specifications).map(([key, value]) => (
                            <div
                              key={key}
                              className="flex justify-between text-sm border-b border-muted pb-2"
                            >
                              <span className="text-muted-foreground">{key}</span>
                              <span className="font-medium">{value as string}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  <Separator />

                  {/* Checkout Section */}
                  <div className="space-y-4">
                    {/* Quantity Selector */}
                    <div>
                      <Label htmlFor="quantity">Quantity</Label>
                      <div className="flex items-center gap-3 mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={decrementQuantity}
                          disabled={quantity <= 1 || isCheckingOut}
                          className="h-10 w-10"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Input
                          id="quantity"
                          type="number"
                          min="1"
                          max={currentStock}
                          value={quantity}
                          onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                          disabled={isCheckingOut}
                          className="text-center w-20"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={incrementQuantity}
                          disabled={quantity >= currentStock || isCheckingOut}
                          className="h-10 w-10"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <span className="text-sm text-muted-foreground">
                          {currentStock} available
                        </span>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="phone">M-Pesa Phone Number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="254XXXXXXXXX"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        disabled={isCheckingOut}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        You'll receive an M-Pesa prompt on this number
                      </p>
                    </div>

                    <Button
                      onClick={handleCheckout}
                      disabled={currentStock === 0 || isCheckingOut}
                      className="w-full"
                      size="lg"
                    >
                      {isCheckingOut ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Processing Payment...
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="w-5 h-5 mr-2" />
                          Buy Now - {formatCurrency(currentPrice * quantity)}
                          {quantity > 1 && (
                            <span className="ml-2 text-sm opacity-80">
                              ({quantity} × {formatCurrency(currentPrice)})
                            </span>
                          )}
                        </>
                      )}
                    </Button>

                    <p className="text-xs text-center text-muted-foreground">
                      Secure payment via M-Pesa • Confirmation email sent instantly
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

// Success Screen Component
function SuccessScreen({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="py-8 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
        className="w-24 h-24 bg-green-500 rounded-full mx-auto mb-6 flex items-center justify-center"
      >
        <Check className="w-12 h-12 text-white" />
      </motion.div>

      <h2 className="text-3xl font-bold mb-4">Purchase Successful!</h2>
      <p className="text-lg text-muted-foreground mb-6">
        Thank you for your purchase of
      </p>

      <div className="flex items-center justify-center gap-4 mb-8">
        {product.images && product.images[0] && (
          <img
            src={product.images[0].imageUrl}
            alt={product.name}
            className="w-20 h-20 object-cover rounded-lg"
          />
        )}
        <div className="text-left">
          <p className="font-semibold text-lg">{product.name}</p>
          {product.brand && (
            <p className="text-sm text-muted-foreground">{product.brand}</p>
          )}
        </div>
      </div>

      <div className="bg-muted rounded-lg p-6 mb-6 space-y-2">
        <div className="flex items-center justify-center gap-2 text-green-600 mb-4">
          <Sparkles className="w-5 h-5" />
          <p className="font-medium">Confirmation email sent!</p>
        </div>
        <p className="text-sm text-muted-foreground">
          A detailed confirmation email with your purchase details and product
          image has been sent to your registered email address.
        </p>
      </div>

      <Button onClick={onClose} size="lg" className="px-8">
        Continue Shopping
      </Button>
    </motion.div>
  );
}
