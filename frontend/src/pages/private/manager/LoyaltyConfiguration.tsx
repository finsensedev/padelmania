import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import { motion } from "framer-motion";
import { Award, Save, TrendingUp, Gift } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import { Label } from "src/components/ui/label";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Input } from "src/components/ui/input";
import {
  getActiveLoyaltyConfig,
  updateLoyaltyConfig,
} from "../../../services/loyalty-config.service";
import useNotification from "../../../hooks/useNotification";
import useWithTwoFA from "../../../hooks/useWithTwoFA";

export default function LoyaltyConfiguration() {
  const { toaster } = useNotification();
  const { withTwoFA } = useWithTwoFA();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    pointsPerCurrency: 1,
    currencyUnit: 100,
    registrationBonusPoints: 40,
    referralBonusPoints: 20,
    minimumRedeemablePoints: 100,
    pointsToGiftCardRatio: 1,
  });

  const { data: config, isLoading } = useQuery(
    "loyaltyConfig",
    getActiveLoyaltyConfig,
    {
      onSuccess: (data) => {
        setFormData({
          pointsPerCurrency: data.pointsPerCurrency,
          currencyUnit: data.currencyUnit,
          registrationBonusPoints: data.registrationBonusPoints,
          referralBonusPoints: data.referralBonusPoints,
          minimumRedeemablePoints: data.minimumRedeemablePoints,
          pointsToGiftCardRatio: data.pointsToGiftCardRatio,
        });
      },
      onError: (error) => {
        console.error("Failed to load loyalty config:", error);
        toaster("Failed to load loyalty configuration", { variant: "error" });
      },
    }
  );

  const updateMutation = useMutation(
    ({
      id,
      data,
      token,
    }: {
      id: string;
      data: typeof formData;
      token: string;
    }) => updateLoyaltyConfig(id, data, token),
    {
      onSuccess: () => {
        queryClient.invalidateQueries("loyaltyConfig");
        toaster("Loyalty configuration updated successfully", {
          variant: "success",
        });
      },
      onError: (error) => {
        console.error("Failed to update loyalty config:", error);
        toaster("Failed to update loyalty configuration", { variant: "error" });
      },
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!config) return;

    // Wrap the update in 2FA protection
    await withTwoFA(
      async (sessionToken) => {
        return await updateMutation.mutateAsync({
          id: config.id,
          data: formData,
          token: sessionToken,
        });
      },
      {
        scope: "settings",
        actionName: "Update Loyalty Configuration",
      }
    );
  };

  const handleInputChange = (field: string, value: number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header Section */}
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Award className="w-8 h-8 text-primary" />
            Loyalty Points Configuration
          </h1>
          <p className="text-muted-foreground mt-2">
            Configure how customers earn and redeem loyalty points
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Spending Rewards Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Spending Rewards
              </CardTitle>
              <CardDescription>
                Configure how customers earn points from their purchases
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="pointsPerCurrency">Points Per Currency</Label>
                  <Input
                    id="pointsPerCurrency"
                    type="number"
                    min="0"
                    step="1"
                    value={formData.pointsPerCurrency}
                    onChange={(e) =>
                      handleInputChange(
                        "pointsPerCurrency",
                        parseInt(e.target.value) || 0
                      )
                    }
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    Number of points earned per currency unit
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currencyUnit">Currency Unit (KES)</Label>
                  <Input
                    id="currencyUnit"
                    type="number"
                    min="1"
                    step="1"
                    value={formData.currencyUnit}
                    onChange={(e) =>
                      handleInputChange(
                        "currencyUnit",
                        parseInt(e.target.value) || 1
                      )
                    }
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    Amount of currency spent to earn points
                  </p>
                </div>
              </div>

              <Alert className="bg-primary  border-primary ">
                <AlertDescription className="text-white">
                  Current rate: Earn {formData.pointsPerCurrency} point(s) for
                  every {formData.currencyUnit} KES spent
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Bonus Points Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-primary" />
                Bonus Points
              </CardTitle>
              <CardDescription>
                Set bonus points for registration and referrals
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="registrationBonus">Registration Bonus</Label>
                  <Input
                    id="registrationBonus"
                    type="number"
                    min="0"
                    step="1"
                    value={formData.registrationBonusPoints}
                    onChange={(e) =>
                      handleInputChange(
                        "registrationBonusPoints",
                        parseInt(e.target.value) || 0
                      )
                    }
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    Points awarded when user verifies their account
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="referralBonus">Referral Bonus</Label>
                  <Input
                    id="referralBonus"
                    type="number"
                    min="0"
                    step="1"
                    value={formData.referralBonusPoints}
                    onChange={(e) =>
                      handleInputChange(
                        "referralBonusPoints",
                        parseInt(e.target.value) || 0
                      )
                    }
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    Points awarded for successful referrals
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Redemption Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" />
                Redemption Settings
              </CardTitle>
              <CardDescription>
                Configure how customers can redeem their points
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="minimumPoints">
                    Minimum Redeemable Points
                  </Label>
                  <Input
                    id="minimumPoints"
                    type="number"
                    min="0"
                    step="1"
                    value={formData.minimumRedeemablePoints}
                    onChange={(e) =>
                      handleInputChange(
                        "minimumRedeemablePoints",
                        parseInt(e.target.value) || 0
                      )
                    }
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    Minimum points required to redeem
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pointsRatio">Points to Gift Card Ratio</Label>
                  <Input
                    id="pointsRatio"
                    type="number"
                    min="1"
                    step="1"
                    value={formData.pointsToGiftCardRatio}
                    onChange={(e) =>
                      handleInputChange(
                        "pointsToGiftCardRatio",
                        parseInt(e.target.value) || 1
                      )
                    }
                    required
                  />
                  <p className="text-sm text-muted-foreground">
                    KES value per point (1 point = X KES)
                  </p>
                </div>
              </div>

              <Alert className="bg-primary">
                <AlertDescription className="text-white">
                  Redemption rate: {formData.minimumRedeemablePoints} points ={" "}
                  {formData.minimumRedeemablePoints *
                    formData.pointsToGiftCardRatio}{" "}
                  KES gift card
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={updateMutation.isLoading}
              size="lg"
              className="min-w-[200px]"
            >
              {updateMutation.isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  Save Configuration
                </>
              )}
            </Button>
          </div>
        </form>

        {/* Information Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">How it Works</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Customers earn points from spending</li>
                <li>• Welcome bonus on verification</li>
                <li>• Referral rewards when friends join</li>
                <li>• Redeem for gift cards anytime</li>
                <li>• Changes apply immediately</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configurable Options</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <strong>Spending:</strong> Points per KES spent
                </li>
                <li>
                  <strong>Registration:</strong> Welcome bonus points
                </li>
                <li>
                  <strong>Referrals:</strong> Points for referrals
                </li>
                <li>
                  <strong>Redemption:</strong> Min points & ratio
                </li>
                <li>
                  <strong>All Users:</strong> Includes admin-created
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </div>
  );
}
