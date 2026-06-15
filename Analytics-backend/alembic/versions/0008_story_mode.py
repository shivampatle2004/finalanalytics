"""Add story_mode tables: stories and story_points

Revision ID: 0008_story_mode
Revises: 0007_calculated_tables
Create Date: 2026-06-15
"""
from alembic import op

revision = '0008_story_mode'
down_revision = '0007_calculated_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS stories (
            id VARCHAR NOT NULL PRIMARY KEY,
            file_id VARCHAR REFERENCES uploaded_files(id),
            user_id INTEGER REFERENCES users(id),
            name VARCHAR(255) NOT NULL,
            description TEXT,
            tags JSON DEFAULT '[]',
            theme VARCHAR(50) DEFAULT 'default',
            is_published BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_stories_file ON stories (file_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_stories_user ON stories (user_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS story_points (
            id VARCHAR NOT NULL PRIMARY KEY,
            story_id VARCHAR NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            narrative TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,

            dashboard_id VARCHAR,
            page_id VARCHAR,
            bookmark_id VARCHAR,

            filters JSON DEFAULT '[]',
            slicers JSON DEFAULT '{}',
            drill_state JSON DEFAULT '{}',
            visual_selections JSON DEFAULT '{}',
            active_visuals JSON DEFAULT '[]',

            snapshot_url TEXT,
            snapshot_data JSON DEFAULT '{}',

            transition VARCHAR(50) DEFAULT 'fade',
            duration INTEGER DEFAULT 3000,

            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_story_points_story ON story_points (story_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_story_points_order ON story_points (story_id, sort_order)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS story_points")
    op.execute("DROP TABLE IF EXISTS stories")
