-- Allow admin to delete orders for their restaurant
CREATE POLICY "Admin delete own orders"
ON public.orders FOR DELETE
USING (
  (has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid()))
  OR has_role(auth.uid(), 'super_admin')
);

-- Allow admin to delete order_items for their orders
CREATE POLICY "Admin delete order items"
ON public.order_items FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
    AND (
      (has_role(auth.uid(), 'restaurant_admin') AND o.restaurant_id = get_user_restaurant_id(auth.uid()))
      OR has_role(auth.uid(), 'super_admin')
    )
  )
);

-- Allow admin to delete order_item_choices
CREATE POLICY "Admin delete order item choices"
ON public.order_item_choices FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.id = order_item_choices.order_item_id
    AND (
      (has_role(auth.uid(), 'restaurant_admin') AND o.restaurant_id = get_user_restaurant_id(auth.uid()))
      OR has_role(auth.uid(), 'super_admin')
    )
  )
);

-- Allow admin to delete chat messages for their orders
CREATE POLICY "Admin delete chat messages"
ON public.chat_messages FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = chat_messages.order_id
    AND (
      (has_role(auth.uid(), 'restaurant_admin') AND o.restaurant_id = get_user_restaurant_id(auth.uid()))
      OR has_role(auth.uid(), 'super_admin')
    )
  )
);

-- Allow admin to delete admin_alerts for their restaurant
CREATE POLICY "Admin delete own alerts"
ON public.admin_alerts FOR DELETE
USING (
  (has_role(auth.uid(), 'restaurant_admin') AND restaurant_id = get_user_restaurant_id(auth.uid()))
  OR has_role(auth.uid(), 'super_admin')
);

-- Allow admin to delete delivery_assignments for their orders
CREATE POLICY "Admin delete delivery assignments"
ON public.delivery_assignments FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = delivery_assignments.order_id
    AND (
      (has_role(auth.uid(), 'restaurant_admin') AND o.restaurant_id = get_user_restaurant_id(auth.uid()))
      OR has_role(auth.uid(), 'super_admin')
    )
  )
);