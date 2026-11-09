
-- 1. Add pricing_mode column to product_option_groups
ALTER TABLE product_option_groups ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'standard';

-- 2. Update burger menu_supplements to fixed prices (menu_price - base_price)
-- Most burgers: supplement = 4.00
UPDATE products SET menu_supplement = 4.00
WHERE id IN (
  '4bb5099d-b2d2-4d13-ba3f-24e3d4e17365',
  '1e0f3be5-5db7-46c9-8abb-e5a211a428e0',
  '507f16d2-4219-421f-b62e-5db2a2e89b57',
  '70ac36c2-df84-4aed-9bef-c7dfda709672',
  'c9077860-ffcf-4f83-b827-7cb81b5907fd',
  '28e27654-c989-425a-88db-46855c412a58',
  '63e39274-bc69-49bc-8b3a-7898f910a16e',
  '796416c7-7555-4922-ac14-8fdbc728ae17',
  '3de69d43-6a95-4e82-9430-b2a6f6524ca2',
  '47de0fa7-a572-4994-a792-af338dc524bd',
  '46ce6fae-f48d-4747-9882-07d89fbb18e7',
  '33ded7c7-485c-4003-a948-dbfb0d37c52c',
  '6f5b0e78-c68b-48ba-b67d-e3fc099c6d0d',
  'e2bb1a7e-3249-49cc-9c6e-b76ebfbf2755',
  '82f96c46-08e0-497f-93cd-9a6bfb96eb74'
);

-- Double Classique: 10 - 6.50 = 3.50
UPDATE products SET menu_supplement = 3.50
WHERE id = 'a42839e9-9238-4c89-a105-af3cd8a1bc17';

-- 3. Add menu formula to Durum/Wraps and Pains categories
UPDATE products SET menu_supplement = 2.20, menu_label = 'Menu (Frites + sauce + boisson)'
WHERE id IN (
  '9cfc6de2-5563-4331-a49f-d4d3fc7a7883',
  'b36db480-54df-469e-9213-dff13f5c06fb',
  'ef20fff6-39f3-40d4-9c0c-dab1804c7a4e',
  '5fd71608-5981-4cb0-a0a6-cfbfa86c68b1',
  'a397d0f5-96f9-475d-8b44-e1f72fd67b65',
  '11fce0f0-9e92-4865-9a4d-adcb20dc4206',
  '6899f264-148e-48f6-ac0f-7c3973eb6c0c',
  '2e96f3a6-f1d1-4ee8-8e1a-d717805e3f75',
  '34f97077-8649-48b5-858c-a674cffc8146',
  '239b0888-3885-4b09-bd9e-e9e70c82fa3e',
  '6d96b02f-8605-42e0-93ed-eb7eb8be9528',
  '99363681-abf5-40ad-86e1-f2a0788d0d43'
);

-- 4. Update sauces groups: max 1, free (one sauce included)
UPDATE product_option_groups SET max_selections = 1, free_count = 1, min_selections = 0
WHERE name = 'Sauces';

-- 5. Update extras groups: pair pricing (ceil(n/2) * 1€)
UPDATE product_option_groups SET pricing_mode = 'pair', group_price = 1.00
WHERE name = 'Suppléments';
