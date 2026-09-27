import {
  Beef,
  ChefHat,
  Coffee,
  Cookie,
  Croissant,
  CupSoda,
  Donut,
  Fish,
  Flame,
  GlassWater,
  IceCreamCone,
  Milk,
  Pizza,
  Popcorn,
  Salad,
  Sandwich,
  Soup,
  Tag,
  Utensils,
  UtensilsCrossed,
  Wheat,
  Drumstick,
  type LucideIcon,
} from "lucide-react";

// Debe mantenerse en sincronía con backend/src/lib/categoryIcons.ts.
const ICONS_BY_NAME: Record<string, LucideIcon> = {
  Beef,
  Pizza,
  Sandwich,
  CupSoda,
  Soup,
  IceCreamCone,
  Salad,
  Flame,
  UtensilsCrossed,
  Coffee,
  Cookie,
  Fish,
  Drumstick,
  Utensils,
  GlassWater,
  Popcorn,
  Croissant,
  Donut,
  Milk,
  Wheat,
  ChefHat,
  Tag,
};

export const CATEGORY_ICON_OPTIONS = Object.keys(ICONS_BY_NAME) as Array<keyof typeof ICONS_BY_NAME>;

export function getCategoryIcon(icon: string | null | undefined): LucideIcon {
  if (icon && ICONS_BY_NAME[icon]) return ICONS_BY_NAME[icon];
  return Tag;
}
