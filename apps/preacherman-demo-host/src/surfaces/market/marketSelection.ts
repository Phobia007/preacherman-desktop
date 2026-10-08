import type { ModelId } from "../../preferences";

export type MarketSelection = {
  modelId: ModelId;
  basePrice: number;
  options: readonly { id: string; price: number }[];
};

export function createMarketSelection(modelId: ModelId): MarketSelection {
  return { modelId, basePrice: 81, options: [] };
}

/** Future option controls update selection.options; every price view uses this total. */
export function marketSelectionTotal(selection: MarketSelection): number {
  return Math.round((selection.basePrice + selection.options.reduce((sum, option) => sum + option.price, 0)) * 100) / 100;
}
