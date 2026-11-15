"""Create the app schema in a database and insert a few rows (CI rehearsal only).

Usage (from backend/): uv run python ../scripts/backup/seed.py DATABASE_URL
"""
import sys

from sqlalchemy import text

from app.models import Base, make_engine, upgrade_schema

engine = make_engine(sys.argv[1])
Base.metadata.create_all(engine)
upgrade_schema(engine)
with engine.begin() as c:
    for i in range(3):
        c.execute(text("INSERT INTO competitors VALUES (:i,:c,:u,'u','n','a','2026-01-01')"),
                  {"i": f"c{i}", "c": f"UC{i}", "u": f"user{i}"})
        for j in range(4):
            c.execute(text("INSERT INTO videos (id,competitor_id,competitor_username,youtube_id,permalink,caption,description,thumbnail_url,view_count,like_count,comment_count,posted_at,fetched_at) VALUES (:id,:c,'u','y','p','cap é中','d','t',1,2,3,'2026','2026')"),
                      {"id": f"v{i}{j}", "c": f"c{i}"})
    c.execute(text("INSERT INTO remixes VALUES ('r1','v00','t','h','s','c','2026','2026')"))
    c.execute(text("INSERT INTO content_plan (id,video_id,status,competitor_username,caption,thumbnail_url,permalink,posted_at,added_at,updated_at) VALUES ('p1','v01','todo','u','c','t','p','2026','2026','2026')"))
print("seeded")
