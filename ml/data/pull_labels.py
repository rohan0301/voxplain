"""Pull labels from Supabase into labels.jsonl for training.

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The service role key reads
every user's labels, so this is a local/CI training tool only — it must never be
part of the ML web service's runtime dependencies.

    python data/pull_labels.py
"""
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

OUT = Path(__file__).parent / "labels.jsonl"
PAGE_SIZE = 1000

# Read credentials from ml/.env if present; real env vars still win.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def main() -> None:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

    client = create_client(url, key)

    rows, page = [], 0
    while True:
        resp = (
            client.table("labels")
            .select("*")
            .order("created_at")
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
            .execute()
        )
        if not resp.data:
            break
        rows.extend(resp.data)
        page += 1

    with OUT.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps({
                "text": r["text"],
                "label": r["label"],
                # Default to 1 to match the analyzers' fallback, but note this
                # makes "unset" indistinguishable from "deliberately level 1".
                "audienceLevel": r["audience_level"] if r["audience_level"] is not None else 1,
                "domain": r["domain"],
                "source": r["source"],
            }, ensure_ascii=False) + "\n")

    by_source: dict[str, int] = {}
    for r in rows:
        by_source[r["source"]] = by_source.get(r["source"], 0) + 1

    print(f"Wrote {len(rows)} labels to {OUT}")
    for source, count in sorted(by_source.items()):
        print(f"  {source}: {count}")


if __name__ == "__main__":
    main()
