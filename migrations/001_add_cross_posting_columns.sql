-- Migration: Add cross-posting support columns
-- Run this in Supabase SQL Editor

-- Add column for tracking if poster uses fonts from random-dafont
ALTER TABLE posters ADD COLUMN IF NOT EXISTS used_fonts BOOLEAN DEFAULT false;

-- Add column for tracking SVG sources used
ALTER TABLE posters ADD COLUMN IF NOT EXISTS svg_sources JSONB DEFAULT '[]'::jsonb;

-- Add column for tracking poster origin site
ALTER TABLE posters ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'dafont' CHECK (source IN ('dafont', 'svg'));

-- Update existing records to have source = 'dafont' (they came from random-dafont)
UPDATE posters SET source = 'dafont' WHERE source IS NULL;

-- Create index for faster filtering by source
CREATE INDEX IF NOT EXISTS idx_posters_source ON posters(source);

-- Create index for cross-posting queries
CREATE INDEX IF NOT EXISTS idx_posters_used_fonts ON posters(used_fonts) WHERE used_fonts = true;
CREATE INDEX IF NOT EXISTS idx_posters_used_svg ON posters(used_svg) WHERE used_svg = true;
