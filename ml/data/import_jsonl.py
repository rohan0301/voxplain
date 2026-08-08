"""One-shot backfill: import legacy JSONL labels into the Supabase labels table.

Before labels moved to Postgres they were appended to local JSONL files, which
Render's ephemeral filesystem wiped on every deploy. These are the rows that
survived on developer machines. They have no user_id.

Safe to re-run: rows already present in the table (matched on
text/label/audience_level/domain) are skipped.

    python data/import_jsonl.py [--dry-run]
"""
import argparse
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

REPO_ROOT = Path(__file__).resolve().parents[2]

# Read credentials from ml/.env if present; real env vars still win.
load_dotenv(REPO_ROOT / "ml" / ".env")

SOURCES = [
    REPO_ROOT / "server" / "data" / "labels.jsonl",
    REPO_ROOT / "ml" / "data" / "labels.jsonl",
]


def dedupe_key(row: dict) -> tuple:
    return (
        row["text"].strip().lower(),
        row["label"],
        row["audience_level"],
        row["domain"],
    )


def read_source(path: Path) -> list[dict]:
    if not path.exists():
        print(f"  {path} — not found, skipping")
        return []

    rows = []
    for line_num, line in enumerate(path.open(encoding="utf-8"), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError as e:
            print(f"  {path}:{line_num} — invalid JSON ({e}), skipping")
            continue

        text = (r.get("text") or "").strip()
        label = r.get("label")
        if not text or label not in (0, 1):
            continue

        level = r.get("audienceLevel")
        if level not in (0, 1, 2, 3):
            level = None

        rows.append({
            "user_id": None,
            "text": text,
            "label": int(label),
            "audience_level": level,
            "domain": (r.get("domain") or "general").strip() or "general",
            "project_id": r.get("projectId"),
            "source": "human",
        })

    print(f"  {path} — {len(rows)} usable rows")
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="report what would be inserted")
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

    client = create_client(url, key)

    print("Reading local JSONL:")
    local: dict[tuple, dict] = {}
    for path in SOURCES:
        for row in read_source(path):
            local.setdefault(dedupe_key(row), row)
    print(f"{len(local)} unique rows across sources")

    existing_resp = client.table("labels").select("text,label,audience_level,domain").execute()
    existing = {dedupe_key(r) for r in (existing_resp.data or [])}
    print(f"{len(existing)} rows already in the labels table")

    to_insert = [row for key, row in local.items() if key not in existing]
    print(f"{len(to_insert)} new rows to insert")

    if not to_insert:
        return
    if args.dry_run:
        for row in to_insert[:10]:
            print(f"  [{row['label']}] L{row['audience_level']} {row['domain']}: {row['text'][:70]}")
        if len(to_insert) > 10:
            print(f"  … and {len(to_insert) - 10} more")
        return

    client.table("labels").insert(to_insert).execute()
    print(f"Inserted {len(to_insert)} rows.")


if __name__ == "__main__":
    main()
