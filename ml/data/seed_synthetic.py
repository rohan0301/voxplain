"""Bootstrap training data from hand-written minimal pairs (plan §1.2).

Each pair is one concept written two ways: a jargon-heavy phrasing and a plain
phrasing. Expanding a pair across the four audience levels produces 8 rows, and
the *difference* between those rows is the level-dependence the model exists to
learn. The 31 human labels collected so far barely contain it — they cover only
levels 0 and 1, and only 27 distinct texts.

Labeling rule
-------------
    plain phrasing   → clear (0) at every level.
    jargon phrasing  → confusing (1) at every level up to and including
                       `confusing_through`, clear (0) above it.

`confusing_through` defaults to 1, which is the rule §1.2 specifies: jargon
trips novices and the partly-familiar, and reads fine to strong/expert. It is
raised to 2 for terms that genuinely require domain training (`long gamma`,
`catastrophic forgetting`, `T2N1M0`) and lowered to 0 for mild business
shorthand that anyone with a little exposure follows (`bandwidth`, `DRI`).
That variation is deliberate: with a single flat rule the model can score
perfectly by learning "level <= 1 AND jargon-ish", which is the failure mode
§1.2 warns about. It does not make the data real — see the caveat below.

**These rows are synthetic and must be tracked as such.** They are written to
the DB with `source='synthetic'` so the human-labeled rows can be held out as
the test set. A model evaluated on synthetic data is grading its own homework:
it will look excellent because it is being asked to reproduce a rule that was
written by hand. `eval_compare.py` (§1.5) must report on human rows only.

Usage
-----
    python data/seed_synthetic.py                 # write ml/data/synthetic.jsonl
    python data/seed_synthetic.py --push --dry-run # show what would go to the DB
    python data/seed_synthetic.py --push          # insert into the labels table

`--push` is opt-in on purpose: local dev points at the production Supabase
project, so anything written here is real training data.
"""
import argparse
import json
import os
from collections import Counter
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = Path(__file__).parent / "synthetic.jsonl"

# Read credentials from ml/.env if present; real env vars still win.
load_dotenv(REPO_ROOT / "ml" / ".env")

LEVELS = (0, 1, 2, 3)

# Each entry: one concept, a jargon-heavy phrasing and a plain phrasing.
# `confusing_through` (optional, default 1) — highest audience level at which
# the jargon phrasing is still confusing.
PAIRS: list[dict] = [
    # ---------------------------------------------------------------- tech --
    {
        "domain": "tech",
        "jargon": "We use RAG with a reranker over a vector store to ground responses.",
        "plain": "Before answering, the system searches our documents and uses what it finds, so answers stay tied to real sources.",
    },
    {
        "domain": "tech",
        "jargon": "We shard the write path and accept eventual consistency across replicas.",
        "plain": "We split the data across several machines, so a change can take a moment to show up everywhere.",
    },
    {
        "domain": "tech",
        "jargon": "Cold starts on the serverless tier are inflating our p99 latency.",
        "plain": "The first request after a quiet period is slow, which drags down our worst-case response time.",
    },
    {
        "domain": "tech",
        "jargon": "We backpropagate through a frozen encoder with a LoRA adapter.",
        "plain": "We train only a small add-on layer and leave the large model untouched, which is far cheaper.",
        "confusing_through": 2,
    },
    {
        "domain": "tech",
        "jargon": "The service mesh handles mTLS and circuit breaking between pods.",
        "plain": "A networking layer encrypts traffic between our services and stops a failing one from dragging down the rest.",
    },
    {
        "domain": "tech",
        "jargon": "Our CI pipeline runs hermetic builds against a pinned toolchain.",
        "plain": "Every build runs in a clean, identical environment, so the result never depends on whose laptop it was built on.",
    },
    {
        "domain": "tech",
        "jargon": "We denormalized the schema to eliminate an N+1 query pattern.",
        "plain": "We store some data twice so that loading a page no longer takes hundreds of small database trips.",
    },
    {
        "domain": "tech",
        "jargon": "Idempotency keys prevent duplicate charges on retry.",
        "plain": "If a request gets sent twice by accident, we recognize it and only charge the customer once.",
    },
    {
        "domain": "tech",
        "jargon": "The model exhibits catastrophic forgetting after sequential fine-tuning.",
        "plain": "When we train it on a new task, it loses much of what it had already learned.",
        "confusing_through": 2,
    },
    {
        "domain": "tech",
        "jargon": "A bloom filter short-circuits the lookup on the miss path.",
        "plain": "A quick pre-check tells us when something is definitely not stored, so we can skip the slow search entirely.",
        "confusing_through": 2,
    },
    {
        "domain": "tech",
        "jargon": "Feature flags let us decouple deploy from release.",
        "plain": "We can ship the code switched off, then turn it on for users whenever we choose.",
        "confusing_through": 0,
    },
    {
        "domain": "tech",
        "jargon": "Backpressure propagates upstream when the consumer lags.",
        "plain": "When the part that processes the work falls behind, it tells the part sending the work to slow down.",
    },
    {
        "domain": "tech",
        "jargon": "We quantized the weights to int8 for edge inference.",
        "plain": "We shrank the model so it runs on the phone itself instead of calling out to a server.",
        "confusing_through": 2,
    },
    {
        "domain": "tech",
        "jargon": "Our p95 tail latency regressed after the GC tuning change.",
        "plain": "For the slowest one in twenty requests, the site got noticeably worse after we changed a memory setting.",
    },
    {
        "domain": "tech",
        "jargon": "The API is eventually consistent, not read-your-writes.",
        "plain": "Right after you save something, refreshing might not show it yet.",
    },
    {
        "domain": "tech",
        "jargon": "We use the OAuth device flow for headless clients.",
        "plain": "Devices with no screen or keyboard sign in by showing you a short code to type on your phone.",
    },
    {
        "domain": "tech",
        "jargon": "Embedding drift degraded recall over six months.",
        "plain": "The way we represent documents slowly went stale, so search started missing things it used to find.",
        "confusing_through": 2,
    },
    {
        "domain": "tech",
        "jargon": "We rolled it out behind a canary with automatic rollback on SLO burn.",
        "plain": "We released it to a small slice of users first, and it turns itself off automatically if errors spike.",
    },

    # ------------------------------------------------------------- finance --
    {
        "domain": "finance",
        "jargon": "The book carries material convexity exposure under a parallel shift.",
        "plain": "If interest rates move, our losses grow faster than our gains — the risk is lopsided.",
    },
    {
        "domain": "finance",
        "jargon": "We're running a negative carry position until the curve steepens.",
        "plain": "Holding this costs us money every month, and it only pays off if long-term rates rise relative to short-term ones.",
        "confusing_through": 2,
    },
    {
        "domain": "finance",
        "jargon": "EBITDA margin compressed 200 basis points year over year.",
        "plain": "For every dollar of sales, we kept two cents less in core profit than we did last year.",
    },
    {
        "domain": "finance",
        "jargon": "The facility has a springing covenant tied to leverage.",
        "plain": "If our debt climbs too high relative to earnings, extra restrictions from the lender kick in automatically.",
        "confusing_through": 2,
    },
    {
        "domain": "finance",
        "jargon": "We're long gamma into earnings.",
        "plain": "Our position makes money if the stock moves sharply around the earnings announcement, in either direction.",
        "confusing_through": 2,
    },
    {
        "domain": "finance",
        "jargon": "Working capital swings distorted free cash flow this quarter.",
        "plain": "The timing of bills paid and money collected made our cash look worse than the business actually performed.",
    },
    {
        "domain": "finance",
        "jargon": "The deal is accretive to EPS in year two.",
        "plain": "From the second year on, the acquisition adds to our per-share profit rather than watering it down.",
    },
    {
        "domain": "finance",
        "jargon": "We hedged the FX exposure with a rolling forward.",
        "plain": "We locked in an exchange rate ahead of time, so currency swings don't hit our results.",
    },
    {
        "domain": "finance",
        "jargon": "Their DSO crept up to 68 days.",
        "plain": "Customers are now taking about ten weeks to pay us, which is longer than they used to.",
    },
    {
        "domain": "finance",
        "jargon": "It's a cov-lite unitranche with a PIK toggle.",
        "plain": "It's a single loan with few restrictions, and the borrower can pay the interest by adding it to the balance instead of in cash.",
        "confusing_through": 2,
    },
    {
        "domain": "finance",
        "jargon": "The portfolio has material duration risk.",
        "plain": "If interest rates rise, the value of what we hold falls sharply.",
    },
    {
        "domain": "finance",
        "jargon": "We took an impairment on goodwill this quarter.",
        "plain": "We acknowledged that a business we bought is worth less than we paid, and wrote down the difference.",
    },
    {
        "domain": "finance",
        "jargon": "Revenue recognition shifts under ASC 606 for multi-year contracts.",
        "plain": "The accounting rules changed for when we're allowed to count money from long-term contracts as sales.",
        "confusing_through": 2,
    },
    {
        "domain": "finance",
        "jargon": "Net dollar retention came in at 118%.",
        "plain": "Existing customers spent 18% more with us this year than last, even after counting the ones who left.",
        "confusing_through": 0,
    },
    {
        "domain": "finance",
        "jargon": "The basis widened between the cash bond and the CDS.",
        "plain": "The price of the bond and the cost of insuring it moved apart, which is unusual.",
        "confusing_through": 2,
    },
    {
        "domain": "finance",
        "jargon": "We're underweight cyclicals and overweight staples.",
        "plain": "We're holding less of the companies that suffer in a downturn and more of the ones people buy from regardless.",
    },
    {
        "domain": "finance",
        "jargon": "The waterfall pays LPs their preferred return ahead of carry.",
        "plain": "Investors collect their promised minimum return first; the fund managers only take a cut after that.",
        "confusing_through": 2,
    },
    {
        "domain": "finance",
        "jargon": "Marking to market triggered a margin call.",
        "plain": "Because prices dropped, our lender demanded more cash as security, immediately.",
    },

    # ------------------------------------------------------------- medical --
    {
        "domain": "medical",
        "jargon": "Patients presented with idiopathic dyspnea refractory to bronchodilators.",
        "plain": "Patients were short of breath, we don't know why, and the usual inhalers didn't help.",
    },
    {
        "domain": "medical",
        "jargon": "The lesion was hypoechoic on ultrasound with irregular margins.",
        "plain": "On the scan the lump showed up dark and with ragged edges, which is a concerning pattern.",
        "confusing_through": 2,
    },
    {
        "domain": "medical",
        "jargon": "We initiated empiric broad-spectrum antibiotics pending cultures.",
        "plain": "We started strong antibiotics right away, before we knew exactly which bacteria was responsible.",
    },
    {
        "domain": "medical",
        "jargon": "The patient is NPO after midnight.",
        "plain": "The patient shouldn't eat or drink anything after midnight.",
    },
    {
        "domain": "medical",
        "jargon": "She developed a nosocomial infection post-op.",
        "plain": "She picked up an infection in the hospital after her surgery.",
    },
    {
        "domain": "medical",
        "jargon": "Serum creatinine rose, suggesting acute kidney injury.",
        "plain": "A blood test showed the kidneys had suddenly started working less well.",
    },
    {
        "domain": "medical",
        "jargon": "The tumor was staged T2N1M0.",
        "plain": "The tumor is medium-sized, has reached nearby lymph nodes, and hasn't spread to distant organs.",
        "confusing_through": 2,
    },
    {
        "domain": "medical",
        "jargon": "He presented with syncope and was found to be in atrial fibrillation.",
        "plain": "He fainted, and we found that his heart was beating irregularly.",
    },
    {
        "domain": "medical",
        "jargon": "The trial met its primary endpoint with a hazard ratio of 0.72.",
        "plain": "In the study, people taking the new drug were about 28% less likely to get worse over the same period.",
        "confusing_through": 2,
    },
    {
        "domain": "medical",
        "jargon": "The rash is consistent with an urticarial drug eruption.",
        "plain": "The rash looks like hives brought on by a reaction to a medication.",
    },
    {
        "domain": "medical",
        "jargon": "We're titrating the dose against the INR.",
        "plain": "We're adjusting the amount of blood thinner based on regular tests of how quickly the blood clots.",
        "confusing_through": 2,
    },
    {
        "domain": "medical",
        "jargon": "The graft showed signs of chronic allograft nephropathy.",
        "plain": "The transplanted kidney is slowly scarring and losing function.",
        "confusing_through": 2,
    },
    {
        "domain": "medical",
        "jargon": "Findings were incidental on imaging performed for another indication.",
        "plain": "We found it by chance, on a scan that had been ordered for a completely different reason.",
    },
    {
        "domain": "medical",
        "jargon": "Prophylaxis reduced the incidence of VTE post-arthroplasty.",
        "plain": "Giving a preventive blood thinner meant fewer patients developed dangerous clots after joint replacement.",
        "confusing_through": 2,
    },
    {
        "domain": "medical",
        "jargon": "Her HbA1c is 8.4, indicating poor glycemic control.",
        "plain": "A test of her average blood sugar over the past three months came back too high.",
    },
    {
        "domain": "medical",
        "jargon": "The patient is on a PPI for GERD.",
        "plain": "The patient takes a medication that reduces stomach acid, because of heartburn and reflux.",
    },
    {
        "domain": "medical",
        "jargon": "We suspect an iatrogenic pneumothorax following line placement.",
        "plain": "We think that putting the tube in accidentally let air leak in around the lung.",
        "confusing_through": 2,
    },
    {
        "domain": "medical",
        "jargon": "The biopsy showed no evidence of malignancy.",
        "plain": "The tissue sample showed no sign of cancer.",
        "confusing_through": 0,
    },

    # ------------------------------------------------------------- general --
    {
        "domain": "general",
        "jargon": "Let's socialize the deck before we align on the north star metric.",
        "plain": "Let's share the slides with people one on one first, then agree on the single number we're aiming at.",
    },
    {
        "domain": "general",
        "jargon": "This is a P0 with a hard stop at EOQ.",
        "plain": "This is our top priority and it has to be finished by the end of the quarter.",
    },
    {
        "domain": "general",
        "jargon": "Let's take that offline and circle back.",
        "plain": "Let's discuss that separately afterwards and return to it.",
        "confusing_through": 0,
    },
    {
        "domain": "general",
        "jargon": "The findings were non-significant at conventional alpha.",
        "plain": "The differences we saw could easily have come up by chance, so we can't claim a real effect.",
        "confusing_through": 2,
    },
    {
        "domain": "general",
        "jargon": "We're operationalizing the framework across verticals.",
        "plain": "We're putting the plan into practice in each part of the business.",
    },
    {
        "domain": "general",
        "jargon": "There's a lot of low-hanging fruit in the onboarding funnel.",
        "plain": "There are some easy improvements to make in how new users get started.",
        "confusing_through": 0,
    },
    {
        "domain": "general",
        "jargon": "Force majeure excuses performance under the agreement.",
        "plain": "If something extraordinary and outside anyone's control happens, neither side has to deliver.",
    },
    {
        "domain": "general",
        "jargon": "We indemnify them against third-party IP claims.",
        "plain": "If someone sues them claiming we copied an idea, we cover the cost.",
    },
    {
        "domain": "general",
        "jargon": "Effect sizes were modest but the confidence intervals excluded zero.",
        "plain": "The improvement was small, but we're reasonably confident it's real and not noise.",
        "confusing_through": 2,
    },
    {
        "domain": "general",
        "jargon": "This is table stakes for the enterprise segment.",
        "plain": "Large customers simply won't consider us without it.",
    },
    {
        "domain": "general",
        "jargon": "We're double-clicking on the churn cohort.",
        "plain": "We're taking a closer look at the group of customers who left.",
    },
    {
        "domain": "general",
        "jargon": "Attribution is muddied by view-through conversions.",
        "plain": "It's hard to tell which ad earned a sale, because some people see an ad without clicking and buy later.",
    },
    {
        "domain": "general",
        "jargon": "We should derisk the dependency before we commit headcount.",
        "plain": "We should make sure that other piece won't fall through before we assign people to this.",
    },
    {
        "domain": "general",
        "jargon": "The study was preregistered to guard against p-hacking.",
        "plain": "We published our plan before collecting any data, so we couldn't go fishing for a flattering result.",
        "confusing_through": 2,
    },
    {
        "domain": "general",
        "jargon": "Bandwidth is constrained this sprint.",
        "plain": "The team doesn't have spare time in this two-week cycle.",
        "confusing_through": 0,
    },
    {
        "domain": "general",
        "jargon": "The contract has an auto-renewing evergreen clause.",
        "plain": "Unless someone actively cancels, the contract keeps renewing itself indefinitely.",
    },
    {
        "domain": "general",
        "jargon": "We're seeing regression to the mean in the post-campaign numbers.",
        "plain": "The unusually good results have drifted back to normal, which was always likely to happen.",
        "confusing_through": 2,
    },
    {
        "domain": "general",
        "jargon": "Let's get alignment from the DRI before we ship.",
        "plain": "Let's get a yes from the one person who owns this decision before we release it.",
        "confusing_through": 0,
    },
]


def expand(pair: dict) -> list[dict]:
    """One pair → 8 rows (2 phrasings × 4 audience levels)."""
    ceiling = pair.get("confusing_through", 1)
    rows = []
    for level in LEVELS:
        rows.append({
            "text": pair["jargon"],
            "label": 1 if level <= ceiling else 0,
            "audienceLevel": level,
            "domain": pair["domain"],
            "source": "synthetic",
        })
        rows.append({
            "text": pair["plain"],
            "label": 0,
            "audienceLevel": level,
            "domain": pair["domain"],
            "source": "synthetic",
        })
    return rows


def validate(pairs: list[dict]) -> None:
    """Catch authoring mistakes that would quietly poison the training set."""
    problems = []
    seen: dict[str, int] = {}

    for i, pair in enumerate(pairs):
        for key in ("domain", "jargon", "plain"):
            if not pair.get(key, "").strip():
                problems.append(f"pair {i}: empty {key}")

        ceiling = pair.get("confusing_through", 1)
        if ceiling not in LEVELS:
            problems.append(f"pair {i}: confusing_through={ceiling} not in {LEVELS}")

        jargon, plain = pair.get("jargon", ""), pair.get("plain", "")
        if jargon.strip().lower() == plain.strip().lower():
            problems.append(f"pair {i}: jargon and plain are identical")

        # A "plain" rewrite that is shorter than the jargon is usually a sign
        # the explanation was dropped rather than written out.
        if plain and jargon and len(plain) < len(jargon) * 0.8:
            problems.append(
                f"pair {i}: plain phrasing is much shorter than jargon "
                f"({len(plain)} vs {len(jargon)} chars) — is it really an explanation?"
            )

        for phrasing in (jargon, plain):
            key = phrasing.strip().lower()
            if key in seen and seen[key] != i:
                problems.append(f"pair {i}: text duplicates pair {seen[key]}: {phrasing[:60]!r}")
            seen[key] = i

    if problems:
        raise SystemExit("Validation failed:\n  " + "\n  ".join(problems))


def summarize(rows: list[dict]) -> None:
    print(f"{len(PAIRS)} pairs → {len(rows)} rows")
    print(f"  by domain: {dict(sorted(Counter(r['domain'] for r in rows).items()))}")
    print(f"  by level:  {dict(sorted(Counter(r['audienceLevel'] for r in rows).items()))}")
    print(f"  by label:  {dict(sorted(Counter(r['label'] for r in rows).items()))}")
    print(f"  distinct texts: {len({r['text'].strip().lower() for r in rows})}")

    # The whole point is that a text's label varies with audience level.
    varying = {
        t for t in {r["text"] for r in rows}
        if len({r["label"] for r in rows if r["text"] == t}) > 1
    }
    print(f"  texts whose label varies by level: {len(varying)}")


def dedupe_key(row: dict) -> tuple:
    """Matches import_jsonl.py so the two scripts agree on what a duplicate is."""
    return (
        row["text"].strip().lower(),
        row["label"],
        row["audience_level"],
        row["domain"],
    )


def push(rows: list[dict], dry_run: bool) -> None:
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

    client = create_client(url, key)

    db_rows = [{
        "user_id": None,
        "text": r["text"],
        "label": r["label"],
        "audience_level": r["audienceLevel"],
        "domain": r["domain"],
        "project_id": None,
        "source": "synthetic",
    } for r in rows]

    existing_resp = client.table("labels").select("text,label,audience_level,domain").execute()
    existing = {dedupe_key(r) for r in (existing_resp.data or [])}
    print(f"{len(existing)} rows already in the labels table")

    to_insert = [r for r in db_rows if dedupe_key(r) not in existing]
    print(f"{len(to_insert)} new rows to insert")

    if not to_insert:
        return
    if dry_run:
        for row in to_insert[:10]:
            print(f"  [{row['label']}] L{row['audience_level']} {row['domain']}: {row['text'][:70]}")
        if len(to_insert) > 10:
            print(f"  … and {len(to_insert) - 10} more")
        return

    # Chunked: a single insert of ~600 rows is large enough to be worth splitting.
    for i in range(0, len(to_insert), 200):
        client.table("labels").insert(to_insert[i:i + 200]).execute()
    print(f"Inserted {len(to_insert)} rows.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--push", action="store_true", help="insert into the Supabase labels table")
    parser.add_argument("--dry-run", action="store_true", help="with --push, report without writing")
    args = parser.parse_args()

    validate(PAIRS)
    rows = [row for pair in PAIRS for row in expand(pair)]
    summarize(rows)

    with OUT_PATH.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"Wrote {OUT_PATH}")

    if args.push:
        push(rows, args.dry_run)
    else:
        print("Not pushed to the database. Re-run with --push (or --push --dry-run) to load them.")


if __name__ == "__main__":
    main()
