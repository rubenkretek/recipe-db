import { ShoppingScreen } from "@/components/shopping/shopping-screen";
import { getActiveShoppingList } from "@/lib/shopping";
import { listSupermarkets } from "@/lib/supermarkets";

/**
 * The active shopping list. SPEC.md §7 and §8 Phase 7.
 *
 * A kitchen with no list yet renders the same screen with nothing on it: the
 * free-text box still works and creates the list on first use, so there is no
 * "start a list" step to get past. Unlike a meal plan, a shopping list has no
 * meaningful empty ceremony.
 */
export default async function ShoppingPage() {
  const [list, supermarkets] = await Promise.all([
    getActiveShoppingList(),
    listSupermarkets(),
  ]);

  const items = list?.items ?? [];
  const remaining = items.filter((item) => !item.isChecked).length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Shopping</h1>
        <p className="text-muted-foreground text-sm">
          {items.length === 0
            ? "Nothing to buy yet."
            : `${remaining} to get, ${items.length - remaining} in the trolley.`}
        </p>
      </div>

      <ShoppingScreen items={items} supermarkets={supermarkets} />
    </div>
  );
}
