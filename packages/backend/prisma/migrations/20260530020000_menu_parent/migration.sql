-- Sidebar hierarchy: a menu item can be the child of another. The renderer
-- in packages/frontend/src/components/Layout.tsx groups children right
-- under their parent with an indent. NULL parent_module = top-level item
-- (the previous behaviour).
ALTER TABLE menu_config ADD COLUMN IF NOT EXISTS parent_module VARCHAR(100);
