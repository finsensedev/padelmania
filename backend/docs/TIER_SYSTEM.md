# Loyalty Tier System

## Overview
The loyalty tier system automatically promotes users through 5 tiers based on their **lifetime points earned** (not current available points).

## Tier Progression
Each tier requires **1000 lifetime points** more than the previous tier:

| Tier | Lifetime Points Required | Color |
|------|-------------------------|-------|
| BRONZE | 0 - 999 | Orange-Brown (#CD7F32) |
| SILVER | 1,000 - 1,999 | Silver-Gray (#C0C0C0) |
| GOLD | 2,000 - 2,999 | Gold-Yellow (#FFD700) |
| PLATINUM | 3,000 - 3,999 | Cyan-Blue (#00D4FF) |
| VIP | 4,000+ | Purple-Pink (#8B5CF6) |

## How It Works

### Automatic Tier Updates
- The system calculates the user's tier based on **lifetime points earned**
- Tier is automatically updated when:
  - Points are earned (bookings, referrals, bonuses)
  - User views their loyalty stats
  - User views loyalty info
- No manual intervention required

### Lifetime Points Calculation
```typescript
lifetimePoints = totalEarnedPoints + totalBonusPoints + totalAdjustments
```

**Note:** Lifetime points include:
- ✅ Points from bookings (EARNED)
- ✅ Welcome bonuses (BONUS)
- ✅ Referral bonuses (BONUS)
- ✅ Admin adjustments (ADJUSTMENT - can be positive or negative)
- ❌ NOT redeemed points (these reduce available points only)
- ❌ NOT expired points (these reduce available points only)

### Example
- User earns 1,104 lifetime points → **SILVER tier** (1,000-1,999 range)
- User needs 896 more points to reach GOLD tier
- Even if user redeems 500 points, they stay SILVER (lifetime points unchanged)

## Benefits by Tier

### BRONZE (Default)
- Earn 1 point per KES 100 spent
- Access to standard courts

### SILVER (1,000+ lifetime points)
- Earn 1.5 points per KES 100 spent
- 10% discount on court bookings
- Priority booking access
- Free guest pass once a month

### GOLD (2,000+ lifetime points)
- Earn 2 points per KES 100 spent
- 15% discount on court bookings
- Access to premium courts
- Free equipment rental
- Exclusive tournament invitations

### PLATINUM (3,000+ lifetime points)
- Earn 3 points per KES 100 spent
- 20% discount on court bookings
- VIP lounge access
- Personal coach sessions
- Free guest passes
- Priority customer support

### VIP (4,000+ lifetime points)
- Earn 5 points per KES 100 spent
- 25% discount on court bookings
- Exclusive VIP lounge access
- Personal dedicated coach
- Unlimited guest passes
- 24/7 priority customer support
- Exclusive VIP events and tournaments

## Technical Implementation

### Database
```prisma
enum MembershipTier {
  BRONZE
  SILVER
  GOLD
  PLATINUM
  VIP
}

model MembershipCard {
  tier  MembershipTier @default(BRONZE)
  // ... other fields
}
```

### Backend Functions
```typescript
// Calculate tier from lifetime points
calculateTierFromPoints(lifetimePoints: number): MembershipTier

// Get progression info
getTierProgress(lifetimePoints: number): {
  currentTier: MembershipTier,
  nextTier: MembershipTier,
  pointsToNextTier: number,
  tierProgress: number // 0-100%
}
```

### Frontend Display
- Bronze: `bg-gradient-to-r from-orange-700 to-amber-800`
- Silver: `bg-gradient-to-r from-gray-400 to-gray-500`
- Gold: `bg-gradient-to-r from-yellow-500 to-orange-500`
- Platinum: `bg-gradient-to-r from-cyan-500 to-blue-500`
- VIP: `bg-gradient-to-r from-purple-600 to-pink-600`

## Migration
The VIP tier was added via migration: `20251114062810_add_vip_tier`

All existing PLATINUM users remain PLATINUM until they earn enough lifetime points to reach VIP (4,000+ total).
