CREATE INDEX IF NOT EXISTS idx_restaurants_rating ON public.restaurants (rating DESC);
CREATE INDEX IF NOT EXISTS idx_restaurants_cuisine_type ON public.restaurants (cuisine_type);
CREATE INDEX IF NOT EXISTS idx_restaurants_is_visible ON public.restaurants (is_visible) WHERE is_visible = true;
CREATE INDEX IF NOT EXISTS idx_restaurants_is_open ON public.restaurants (is_open);