ALTER TABLE cached_production_lines
ADD COLUMN display_order INTEGER NOT NULL DEFAULT 1 CHECK (display_order > 0);
