import { useState, useEffect, useRef } from "react";
import { useQuery } from "react-query";
import { motion } from "framer-motion";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import productService, { type Product } from "src/services/product.service";
import categoryService from "src/services/category.service";
import ProductDetailModal from "src/components/customer/ProductDetailModal";
import {
  Package,
  Search,
  ShoppingCart,
  Star,
  TrendingUp,
  Sparkles,
  Clock,
} from "lucide-react";

export default function CustomerShop() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [hasLoadedProducts, setHasLoadedProducts] = useState(false);

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ["shop-categories"],
    queryFn: () => categoryService.list({ isActive: true }),
    staleTime: 60000, // 1 minute
    refetchOnWindowFocus: false,
  });

  // Fetch products
  const { data: productData } = useQuery({
    queryKey: ["shop-products", selectedCategory, search],
    queryFn: () =>
      productService.list({
        isActive: true,
        inStock: true, // Only show products with stock > 0
        categoryId: selectedCategory === "all" ? undefined : selectedCategory,
        search: search || undefined,
        sortBy: "createdAt",
        sortOrder: "desc",
        limit: 100,
      }),
    staleTime: 60000, // 1 minute
    refetchOnWindowFocus: false, // Disable auto-refresh on background
    retry: 1,
    onSuccess: (data) => {
      if (data?.products) {
        setHasLoadedProducts(true);
      }
    },
  });

  // Show coming soon modal only when products have loaded and there are none
  const showComingSoon =
    hasLoadedProducts &&
    productData?.products.length === 0 &&
    !search &&
    selectedCategory === "all";

  // Sort categories by displayOrder
  const sortedCategories = categories?.slice().sort((a, b) => a.displayOrder - b.displayOrder);

  // Group products by category with displayOrder for sorting
  const productsByCategory = productData?.products.reduce((acc, product) => {
    const categoryName = product.category?.name || "Uncategorized";
    const categoryOrder = product.category?.displayOrder ?? 999;
    if (!acc[categoryName]) {
      acc[categoryName] = { products: [], displayOrder: categoryOrder };
    }
    acc[categoryName].products.push(product);
    return acc;
  }, {} as Record<string, { products: Product[]; displayOrder: number }>);

  // Sort categories by displayOrder for display
  const sortedProductsByCategory = productsByCategory
    ? Object.entries(productsByCategory)
        .sort(([, a], [, b]) => a.displayOrder - b.displayOrder)
        .map(([name, data]) => ({ name, products: data.products }))
    : [];

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setModalOpen(true);
  };

  const formatCurrency = (amount: number) => `KSh ${Math.round(amount).toLocaleString()}`;

  const getProductPrice = (product: Product) => {
    const salePrice = product.salePrice ? Math.round(product.salePrice) : undefined;
    const basePrice = Math.round(product.basePrice);
    
    if (salePrice && salePrice < basePrice) {
      return (
        <>
          <span className="text-base font-bold text-green-600">
            {formatCurrency(salePrice)}
          </span>
          <span className="text-xs line-through text-muted-foreground">
            {formatCurrency(basePrice)}
          </span>
        </>
      );
    }
    return (
      <span className="text-base font-bold">{formatCurrency(basePrice)}</span>
    );
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  // Product grid component - shows max 4 cards, scrolls horizontally if more
  const ProductGrid = ({ 
    products, 
    badge 
  }: { 
    products: Product[]; 
    badge?: string;
  }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isPaused, setIsPaused] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const scrollPositionRef = useRef(0);
    
    // Detect mobile screen
    useEffect(() => {
      const checkMobile = () => setIsMobile(window.innerWidth < 768);
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }, []);
    
    // On mobile: always show scrolling layout with more than 2 products
    // On desktop: only scroll if more than 4 products
    const shouldAnimate = isMobile ? products.length > 2 : products.length > 4;
    
    // Auto-scroll effect
    useEffect(() => {
      if (!shouldAnimate || !scrollRef.current) return;
      
      let animationId: number;
      const scrollSpeed = isMobile ? 0.3 : 0.5;
      
      const animate = () => {
        const container = scrollRef.current;
        if (container && !isPaused) {
          scrollPositionRef.current += scrollSpeed;
          
          // Reset when scrolled through half (content is duplicated)
          const halfWidth = container.scrollWidth / 2;
          if (scrollPositionRef.current >= halfWidth) {
            scrollPositionRef.current = 0;
          }
          
          container.scrollLeft = scrollPositionRef.current;
        }
        animationId = requestAnimationFrame(animate);
      };
      
      animationId = requestAnimationFrame(animate);
      
      return () => cancelAnimationFrame(animationId);
    }, [shouldAnimate, isPaused, isMobile]);

    // For fewer products (2 or less on mobile, 4 or less on desktop), show static grid
    if (!shouldAnimate) {
      return (
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="flex justify-center gap-3 md:gap-5 lg:gap-6 overflow-x-auto pb-2 scrollbar-hide"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {products.map((product) => (
            <motion.div 
              key={product.id} 
              variants={itemVariants}
              className="flex-shrink-0 w-[45%] sm:w-[calc(50%-0.625rem)] md:w-[calc(33.333%-0.875rem)] lg:w-[calc(25%-1rem)]"
              style={{
                maxWidth: '280px',
                minWidth: '140px',
              }}
            >
              <ProductCard
                product={product}
                onClick={handleProductClick}
                getProductPrice={getProductPrice}
                badge={badge}
              />
            </motion.div>
          ))}
        </motion.div>
      );
    }

    // For more products, show scrolling marquee with manual scroll support
    const duplicatedProducts = [...products, ...products];
    
    return (
      <div 
        className="relative overflow-hidden"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => {
          if (scrollRef.current) {
            scrollPositionRef.current = scrollRef.current.scrollLeft;
          }
          setIsPaused(false);
        }}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => {
          // Sync position and resume after a delay
          if (scrollRef.current) {
            const container = scrollRef.current;
            const halfWidth = container.scrollWidth / 2;
            // Wrap position if past halfway
            if (container.scrollLeft >= halfWidth) {
              scrollPositionRef.current = container.scrollLeft - halfWidth;
            } else {
              scrollPositionRef.current = container.scrollLeft;
            }
          }
          // Small delay before resuming auto-scroll
          setTimeout(() => setIsPaused(false), 1500);
        }}
      >
        {/* Gradient fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-6 md:w-16 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-6 md:w-16 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
        
        <div 
          ref={scrollRef}
          className="flex gap-3 md:gap-5 lg:gap-6 overflow-x-auto scrollbar-hide py-2 touch-pan-x"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {duplicatedProducts.map((product, index) => (
            <div 
              key={`${product.id}-${index}`}
              className="flex-shrink-0 w-[45%] sm:w-[45%] md:w-[calc((100%-3.75rem)/4)] lg:w-[calc((100%-4.5rem)/4)]"
              style={{
                maxWidth: '280px',
                minWidth: '140px',
              }}
            >
              <ProductCard
                product={product}
                onClick={handleProductClick}
                getProductPrice={getProductPrice}
                badge={badge}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section - Clean white background */}
      <div className="relative py-6 md:py-8 overflow-hidden border-b border-border/20 bg-white dark:bg-background">
        
        {/* Content */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold mb-1 tracking-tight text-foreground">
              Padel Mania Shop
            </h1>
            <p className="text-sm md:text-base mb-4 text-muted-foreground max-w-xl mx-auto">
              Premium Padel Equipment & Accessories
            </p>

            {/* Search and Filter */}
            <div className="max-w-2xl mx-auto flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-10 bg-background text-foreground rounded-lg border border-border shadow-sm focus:border-primary focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full sm:w-48 h-10 bg-background text-foreground rounded-lg border border-border shadow-sm">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {sortedCategories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Featured Products */}
      {productData?.products.some((p) => p.featured) && (
        <section className="py-10 md:py-14">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-center gap-3 mb-8">
              <Star className="w-6 h-6 text-yellow-500" />
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Featured Products</h2>
            </div>
            <ProductGrid 
              products={productData.products.filter((p) => p.featured)}
              badge="Featured"
            />
          </div>
        </section>
      )}

      {/* New Arrivals */}
      {productData?.products.some((p) => p.newArrival) && (
        <section className="py-10 md:py-14 bg-muted/20 dark:bg-white/[0.02]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-center gap-3 mb-8">
              <Sparkles className="w-6 h-6 text-green-500" />
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">New Arrivals</h2>
            </div>
            <ProductGrid 
              products={productData.products.filter((p) => p.newArrival)}
              badge="New"
            />
          </div>
        </section>
      )}

      {/* Best Sellers */}
      {productData?.products.some((p) => p.bestSeller) && (
        <section className="py-10 md:py-14">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-center gap-3 mb-8">
              <TrendingUp className="w-6 h-6 text-blue-500" />
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Best Sellers</h2>
            </div>
            <ProductGrid 
              products={productData.products.filter((p) => p.bestSeller)}
              badge="Best Seller"
            />
          </div>
        </section>
      )}

      {/* Products by Category */}
      {sortedProductsByCategory.length > 0 &&
        sortedProductsByCategory.map(({ name: categoryName, products }, index) => (
          <section 
            key={categoryName} 
            className={`py-10 md:py-14 ${index % 2 === 0 ? 'bg-muted/30' : ''}`}
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col items-center justify-center mb-8">
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-center">{categoryName}</h2>
                <span className="text-muted-foreground text-sm mt-2">
                  {products.length} {products.length === 1 ? "item" : "items"} available
                </span>
              </div>
              <ProductGrid products={products} />
            </div>
          </section>
        ))}

      {/* Empty State */}
      {productData?.products.length === 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <Package className="w-20 h-20 mx-auto text-muted-foreground/50 mb-6" />
          <h3 className="text-2xl font-semibold mb-3">No products found</h3>
          <p className="text-muted-foreground text-lg">
            Try adjusting your search or filters
          </p>
        </div>
      )}

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedProduct(null);
        }}
      />

      {/* Coming Soon Modal */}
      <Dialog open={showComingSoon} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex justify-center mb-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Clock className="w-10 h-10 text-white" />
                </div>
                <motion.div
                  className="absolute -top-1 -right-1"
                  animate={{
                    rotate: [0, 10, -10, 10, 0],
                    scale: [1, 1.1, 1, 1.1, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    repeatDelay: 1,
                  }}
                >
                  <Sparkles className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                </motion.div>
              </div>
            </div>
            <DialogTitle className="text-center text-2xl">
              Shop Coming Soon!
            </DialogTitle>
            <DialogDescription className="text-center space-y-3 pt-2">
              <p className="text-base">
                We're stocking up on the best padel equipment just for you! 🎾
              </p>
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <p className="font-medium text-foreground">What to expect:</p>
                <ul className="text-sm space-y-1.5 text-left">
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span>Premium padel rackets and equipment</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span>Professional sports gear and accessories</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span>Exclusive member discounts</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span>Fast delivery and pickup options</span>
                  </li>
                </ul>
              </div>
              <p className="text-sm text-muted-foreground">
                Check back soon or contact us for pre-orders!
              </p>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Product Card Component - Vertical layout like mvitapadel.com
interface ProductCardProps {
  product: Product;
  onClick: (product: Product) => void;
  getProductPrice: (product: Product) => React.ReactElement;
  badge?: string;
}

function ProductCard({
  product,
  onClick,
  getProductPrice,
  badge,
}: ProductCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -6 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="h-full group"
    >
      <div
        className="overflow-hidden cursor-pointer h-full flex flex-col bg-card dark:bg-card/80 rounded-2xl border border-border/50 dark:border-border/40 shadow-sm hover:shadow-xl hover:border-primary/30 dark:hover:border-primary/40 transition-all duration-300"
        onClick={() => onClick(product)}
      >
        {/* Top - Product Image */}
        <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-muted/30 to-muted/10 dark:from-white/5 dark:to-white/[0.02]">
          {product.images && product.images.length > 0 ? (
            <img
              src={product.images[0].imageUrl}
              alt={product.name}
              className="w-full h-full object-contain p-3 transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-12 h-12 text-muted-foreground/30" />
            </div>
          )}

          {/* Badges - Top Left */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
            {badge && (
              <span className="bg-primary/95 text-primary-foreground text-[10px] sm:text-xs px-2 sm:px-2.5 py-1 rounded-full font-semibold shadow-md">
                {badge}
              </span>
            )}
            {product.salePrice && product.salePrice < product.basePrice && (
              <span className="bg-gradient-to-r from-red-500 to-rose-500 text-white text-[10px] sm:text-xs px-2 sm:px-2.5 py-1 rounded-full font-semibold shadow-md">
                -{Math.round(
                  ((product.basePrice - product.salePrice) / product.basePrice) *
                    100
                )}%
              </span>
            )}
          </div>

          {/* Quick Buy Button - Top Right */}
          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <Button
              size="icon"
              variant="secondary"
              className="h-9 w-9 rounded-full shadow-lg backdrop-blur-sm bg-background/90 hover:bg-primary hover:text-primary-foreground"
              disabled={product.stockQuantity === 0}
              onClick={(e) => {
                e.stopPropagation();
                onClick(product);
              }}
            >
              <ShoppingCart className="w-4 h-4" />
            </Button>
          </div>

          {/* Out of Stock Overlay */}
          {product.stockQuantity === 0 && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
              <span className="bg-white text-gray-800 text-xs sm:text-sm px-4 py-1.5 rounded-full font-medium shadow-lg">
                Out of Stock
              </span>
            </div>
          )}
        </div>

        {/* Bottom - Product Info */}
        <div className="p-3 sm:p-4 flex flex-col flex-1 bg-transparent">
          {/* Brand */}
          {product.brand && (
            <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">
              {product.brand}
            </p>
          )}
          
          {/* Product Name */}
          <h3 className="font-semibold text-sm sm:text-base line-clamp-2 text-foreground group-hover:text-primary transition-colors duration-200 flex-1">
            {product.name}
          </h3>
          
          {/* Price */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40 dark:border-border/30">
            {getProductPrice(product)}
          </div>
          
          {/* Buy Button - Always visible on mobile, hover on desktop */}
          <Button
            size="sm"
            className="w-full mt-3 h-10 text-sm rounded-xl font-medium transition-all duration-200 shadow-sm hover:shadow-md md:opacity-0 md:group-hover:opacity-100"
            disabled={product.stockQuantity === 0}
            onClick={(e) => {
              e.stopPropagation();
              onClick(product);
            }}
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            Buy Now
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
