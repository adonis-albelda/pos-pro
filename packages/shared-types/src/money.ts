/**
 * Money helpers. Prices are `numeric(10,2)` in Postgres and `REAL` in SQLite,
 * so every value that crosses a boundary gets rounded to two decimals in one
 * place instead of drifting differently in each app.
 */

const PESO = "\u20B1";

export const PESO_SIGN = PESO;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatMoney(value: number): string {
  return `${PESO}${roundMoney(value).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function lineSubtotal(unitPrice: number, quantity: number): number {
  return roundMoney(unitPrice * quantity);
}

export function cartTotal(lines: { unitPrice: number; quantity: number }[]): number {
  return roundMoney(
    lines.reduce((sum, line) => sum + lineSubtotal(line.unitPrice, line.quantity), 0),
  );
}

/**
 * What the counter gave away: the gap between the shelf price and what was
 * actually charged. Always zero or positive — an attendant charging above list
 * is not a negative discount, it is a different price.
 */
export function cartDiscount(
  lines: { unitPrice: number; listPrice: number; quantity: number }[],
): number {
  return roundMoney(
    lines.reduce(
      (sum, line) => sum + Math.max(line.listPrice - line.unitPrice, 0) * line.quantity,
      0,
    ),
  );
}

export function cartCost(lines: { unitCost: number; quantity: number }[]): number {
  return roundMoney(lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0));
}

/** Gross profit on a single line, after any discount the attendant gave. */
export function lineProfit(unitPrice: number, unitCost: number, quantity: number): number {
  return roundMoney((unitPrice - unitCost) * quantity);
}

/**
 * Margin as a percentage of the selling price, which is how a shop owner reads
 * it ("I make 30% on that"), not as a markup over cost.
 */
export function marginPercent(sellingPrice: number, costPrice: number): number {
  if (sellingPrice <= 0) return 0;
  return Math.round(((sellingPrice - costPrice) / sellingPrice) * 1000) / 10;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Shelf price from supplier cost and a category markup percent.
 * `percent` is 30 for "+30%", not 0.3.
 */
export function shelfPriceFromMarkup(costPrice: number, percent: number): number {
  return roundMoney(costPrice * (1 + percent / 100));
}

/**
 * The price a product sells at for a given quantity. Contractors buying a
 * whole box get the bulk price without the attendant having to remember it.
 */
export function priceForQuantity(
  product: { price: number; bulkPrice: number | null; bulkMinQuantity: number | null },
  quantity: number,
): number {
  const { bulkPrice, bulkMinQuantity } = product;

  if (bulkPrice !== null && bulkMinQuantity !== null && quantity >= bulkMinQuantity) {
    return bulkPrice;
  }

  return product.price;
}
