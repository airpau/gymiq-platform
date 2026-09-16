#!/usr/bin/env python3
"""GymIQ Phase-1 backfill loader: applies /tmp/iqout/*.sql via the session pooler."""
import glob, os, sys, time
import psycopg2

PW = os.environ["IQ_DB_PW"]
DSN = f"host=aws-1-eu-west-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.fugixpfgwhnmhtttdzym password={PW} sslmode=require"

files = sorted(glob.glob("/tmp/iqout/*.sql"))
conn = psycopg2.connect(DSN)
conn.autocommit = False
cur = conn.cursor()
t0 = time.time()
for f in files:
    sql = open(f).read()
    t = time.time()
    cur.execute(sql)
    print(f"{os.path.basename(f)}: {cur.rowcount if cur.rowcount >= 0 else '-'} rows, {time.time()-t:.1f}s", flush=True)
conn.commit()

checks = {
    "members": "select count(*), count(*) filter (where status='cancelled') from iq.members",
    "pii": "select count(*) from iq.member_pii",
    "snapshots": "select count(*), min(snapshot_date), max(snapshot_date) from iq.member_snapshots",
    "movements": "select count(*) from iq.member_movements",
    "movements_linked": "select count(*) from iq.member_movements where member_id is not null",
    "metrics": "select count(*), min(metric_date), max(metric_date) from iq.site_metrics_daily",
    "final_day": "select total_members, active_members, mrr, overdue_mrr, paused_mrr, joiners, leavers, churn_30d_pct from iq.site_metrics_daily where metric_date='2026-07-30'",
}
for name, q in checks.items():
    cur.execute(q)
    print(name, "=", cur.fetchall()[0], flush=True)
cur.close(); conn.close()
print(f"DONE in {time.time()-t0:.1f}s")
