-- Ingredient groups within a recipe: a "Salad" heading with the salad's
-- ingredients under it, a "Dressing" heading with the dressing's.
--
-- Stored as a heading on each line rather than as a table of groups. A group is
-- a run of consecutive lines, in `sort_order`, sharing the same `group_name`;
-- lines with no name are ungrouped and render first. Nothing outside a recipe
-- ever needs to refer to a group, and a recipe's lines are rewritten wholesale on
-- every save, so renaming a heading costs nothing — a table would add a foreign
-- key, a policy and a join to buy an empty-group state no one needs.
--
-- Nullable with no default, so every existing line is simply ungrouped and no
-- data moves.
alter table public.recipe_ingredients
  add column group_name text
  check (group_name is null or length(trim(group_name)) between 1 and 80);

comment on column public.recipe_ingredients.group_name is
  'Heading this line sits under, e.g. "Dressing". Null means ungrouped. A group is a consecutive run in sort_order.';
