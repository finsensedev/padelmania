export interface BallType {
  id: string;
  name: string;
  brand?: string;
  unitBase: number;
  unitFinal: number;
  isActive: boolean;
}

export interface BallTypeEquipment {
  id: string;
  name: string;
  brand: string | null;
  rentalPrice: number;
  totalQuantity: number;
  availableQty: number;
  condition: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
