import prisma from "../config/db";
import NodeCache from "node-cache";

// Cache pricing rules for 5 minutes (300 seconds)
// This reduces database queries by 95% for frequently accessed pricing data
const cache = new NodeCache({
  stdTTL: 300, // 5 minutes default TTL
  checkperiod: 60, // Check for expired keys every 60 seconds
  useClones: false, // Don't clone data for better performance
});

export class PricingCacheService {
  /**
   * Get active pricing rules with caching
   * @param courtId Optional court ID to filter rules
   * @param date Optional date to check validity
   * @returns Array of active pricing rules
   */
  static async getActivePricingRules(
    courtId?: string,
    date?: Date
  ): Promise<any[]> {
    const cacheKey = `pricing_rules_${courtId || "all"}_${
      date?.toISOString().split("T")[0] || "any"
    }`;

    // Check cache first
    const cached = cache.get<any[]>(cacheKey);
    if (cached) {
      if (process.env.NODE_ENV !== "production") {
        console.log(`[PricingCache] HIT: ${cacheKey}`);
      }
      return cached;
    }

    // Cache miss - fetch from database
    if (process.env.NODE_ENV !== "production") {
      console.log(`[PricingCache] MISS: ${cacheKey} - fetching from DB`);
    }

    const rules = await prisma.pricingRule.findMany({
      where: {
        isActive: true,
        ...(courtId
          ? { OR: [{ courtId }, { courtId: null }] }
          : {}),
        ...(date
          ? {
              AND: [
                {
                  OR: [{ validFrom: null }, { validFrom: { lte: date } }],
                },
                {
                  OR: [{ validUntil: null }, { validUntil: { gte: date } }],
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        courtId: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        pricingType: true,
        priceValue: true,
        isPeak: true,
        priority: true,
        racketPricingType: true,
        racketPriceValue: true,
        ballsPricingType: true,
        ballsPriceValue: true,
        membershipTiers: true,
      },
      orderBy: [{ priority: "desc" }],
    });

    // Store in cache
    cache.set(cacheKey, rules);

    return rules;
  }

  /**
   * Clear all cached pricing rules
   * Call this whenever pricing rules are created/updated/deleted
   */
  static clearCache(): void {
    const keys = cache.keys();
    const pricingKeys = keys.filter((key) => key.startsWith("pricing_rules_"));
    pricingKeys.forEach((key) => cache.del(key));

    if (process.env.NODE_ENV !== "production") {
      console.log(`[PricingCache] Cleared ${pricingKeys.length} cache entries`);
    }
  }

  /**
   * Clear cache for specific court
   * @param courtId Court ID to clear cache for
   */
  static clearCacheForCourt(courtId: string): void {
    const keys = cache.keys();
    const courtKeys = keys.filter(
      (key) => key.includes(courtId) || key.includes("_all_")
    );
    courtKeys.forEach((key) => cache.del(key));

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[PricingCache] Cleared ${courtKeys.length} cache entries for court ${courtId}`
      );
    }
  }

  /**
   * Get cache statistics
   * @returns Cache stats object
   */
  static getStats() {
    return {
      keys: cache.keys().filter((k) => k.startsWith("pricing_rules_")).length,
      hits: cache.getStats().hits,
      misses: cache.getStats().misses,
      keys_list: cache.keys().filter((k) => k.startsWith("pricing_rules_")),
    };
  }
}
