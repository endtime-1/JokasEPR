"use client";

import { AlertTriangle, Archive, CircleCheckBig, Clock, Database, FileArchive, HardDrive, Info, RefreshCw, Shield, Terminal } from "lucide-react";

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10">
        <Icon className="h-4.5 w-4.5 text-brand" size={18} />
      </div>
      <div>
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink/60">{subtitle}</p>}
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-white p-5 shadow-soft ${className}`}>
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-gray-50 px-4 py-3 font-mono text-xs text-ink/80 leading-relaxed">
      {children}
    </pre>
  );
}

function StatusPill({ color, label }: { color: "green" | "yellow" | "blue"; label: string }) {
  const cfg = {
    green: "bg-green-100 text-green-700",
    yellow: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700"
  }[color];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg}`}>{label}</span>;
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">{n}</span>
      <span className="text-sm text-ink/80 leading-relaxed">{children}</span>
    </li>
  );
}

function CheckItem({ done = false, children }: { done?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-ink/80">
      <CircleCheckBig size={15} className={`mt-0.5 shrink-0 ${done ? "text-green-500" : "text-ink/25"}`} />
      {children}
    </li>
  );
}

export default function BackupPage() {
  return (
    <>
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="app-kicker">Platform</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Backup & Recovery</h1>
            <p className="mt-1 text-sm text-ink/60">
              How this app is actually backed up on its Hostinger hosting plan — not a generic Linux-server writeup.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
            <AlertTriangle size={13} />
            No cron on this host
          </span>
        </div>

        <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <Info size={15} className="mt-0.5 shrink-0 text-blue-500" />
          <p className="text-sm text-blue-800">
            This Hostinger plan has no cron/crontab access. Everything below that looks cron-like is a shell script written to the server by the
            deploy pipeline and triggered by a polling loop inside <code className="font-mono text-xs">start.js</code>, not by the system crontab.
            There is also no systemd here — restart/recovery steps use PM2 and plain file operations, not <code className="font-mono text-xs">systemctl</code>.
          </p>
        </div>

        {/* Status cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Database Backup", value: "Daily, ~02:00", sub: "Polled by start.js, not cron", icon: Clock, color: "text-brand" },
            { label: "Retention", value: "7 days / 5 deploys", sub: "Daily DB+files / pre-deploy snapshots", icon: Archive, color: "text-emerald-600" },
            { label: "Storage", value: "Hostinger account only", sub: "No off-site / S3 copy", icon: HardDrive, color: "text-blue-600" },
            { label: "Restore Drill", value: "Monthly, manual", sub: "Not wired into CI", icon: RefreshCw, color: "text-violet-600" }
          ].map(({ label, value, sub, icon: Icon, color }) => (
            <Card key={label} className="flex items-start gap-3">
              <Icon size={18} className={`mt-0.5 shrink-0 ${color}`} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">{label}</p>
                <p className="mt-0.5 text-lg font-bold text-ink">{value}</p>
                <p className="text-xs text-ink/55">{sub}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* What gets backed up */}
        <Card>
          <SectionHeader
            icon={Clock}
            title="What Gets Backed Up, and How"
            subtitle="Three independent mechanisms, all triggered by start.js polling every 15 minutes"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-ink/45">
                  <th className="pb-2 pr-6">What</th>
                  <th className="pb-2 pr-6">Trigger</th>
                  <th className="pb-2 pr-6">Location</th>
                  <th className="pb-2">Retention</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[
                  { what: "Database", trigger: "start.js checkDailyBackup() — fires once during the 02:00 hour if today's file is missing", loc: "~/jokas-db-backups/db-YYYYMMDD.sql.gz", retain: "7 days" },
                  { what: "Uploaded files", trigger: "start.js checkDailyFilesBackup() — same polling pattern", loc: "~/jokas-files-backups/files-YYYYMMDD.tar.gz", retain: "7 days" },
                  { what: "Pre-deploy DB snapshot", trigger: "Every deploy, immediately before migrations run; deploy aborts if this snapshot fails", loc: "~/jokas-db-backups/pre-deploy-<timestamp>.sql.gz", retain: "5 most recent" }
                ].map(({ what, trigger, loc, retain }) => (
                  <tr key={what} className="align-top text-ink/80">
                    <td className="py-2.5 pr-6 font-semibold">{what}</td>
                    <td className="py-2.5 pr-6 text-ink/60">{trigger}</td>
                    <td className="py-2.5 pr-6 font-mono text-xs text-ink/60">{loc}</td>
                    <td className="py-2.5"><StatusPill color={what === "Pre-deploy DB snapshot" ? "yellow" : "green"} label={retain} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-ink/70">
            The database dump uses <code className="rounded bg-gray-100 px-1 font-mono text-xs">mysqldump --single-transaction --routines</code>,
            gzipped only after confirming the dump succeeded and the file is non-empty — an earlier version piped straight into gzip and reported
            success even when <code className="font-mono text-xs">mysqldump</code> silently produced nothing. Failures now land in{" "}
            <code className="rounded bg-gray-100 px-1 font-mono text-xs">~/jokas-db-backups/backup-error.log</code> instead of vanishing.
            Uploaded files (<code className="font-mono text-xs">apps/api/uploads/</code> — employee photos, HR documents, product images) are the
            only production data that lives outside MySQL.
          </p>
        </Card>

        {/* Verify */}
        <Card>
          <SectionHeader
            icon={Terminal}
            title="Verifying a Backup Actually Restores"
            subtitle="A backup that's never been restored is a guess, not a backup"
          />
          <p className="mb-3 text-sm text-ink/70">
            <code className="rounded bg-gray-100 px-1 font-mono text-xs">scripts/verify-backup-restore.sh</code> runs the real restore path
            without touching production data. Run it periodically (monthly is reasonable) — it is deliberately not wired into CI, since restoring
            a multi-MB dump on every push isn't worth the CI time or host load.
          </p>
          <CodeBlock>{`ssh -p 65002 user@host
cd ~/domains/jokasfarms.com/nodejs
./scripts/verify-backup-restore.sh                      # uses the most recent db-*.sql.gz
./scripts/verify-backup-restore.sh path/to/specific.sql.gz`}</CodeBlock>
          <ol className="mt-4 space-y-2.5">
            <Step n={1}>Verifies gzip integrity and that the file isn&apos;t suspiciously small.</Step>
            <Step n={2}>Creates a disposable scratch database (<code className="font-mono text-xs">&lt;dbname&gt;_restoretest</code>) on the same MySQL instance.</Step>
            <Step n={3}>Restores the backup into the scratch database.</Step>
            <Step n={4}>Compares row counts on core tables (User, Employee, InventoryItem, SalesOrder) against the live database — trailing counts are expected, zero everywhere is the real failure signal.</Step>
            <Step n={5}>Drops the scratch database, then sanity-checks the latest files backup is a valid tar archive (integrity only — it does not untar into place).</Step>
          </ol>
          <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              Known Hostinger constraint: some database users lack <code className="font-mono text-xs">CREATE DATABASE</code> privilege. If step 2
              fails with access-denied, the script says so explicitly — either create the scratch database once via hPanel and grant access, or ask
              Hostinger support to grant the privilege.
            </p>
          </div>
        </Card>

        {/* Restore */}
        <Card>
          <SectionHeader
            icon={Database}
            title="Restoring in a Real Incident"
            subtitle="Application-code rollback and database restore are separate, independent operations"
          />
          <div className="mb-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-500" />
            <p className="text-sm text-red-700 font-medium">
              MySQL DDL auto-commits per statement, so a migration can partially apply before failing. Restoring old code against a schema that has
              moved forward can be just as broken as the original failure — check schema state before assuming a code-only rollback fixed things.
            </p>
          </div>

          <p className="mb-1 text-sm font-semibold text-ink">Restore the database (daily backup or a pre-deploy snapshot)</p>
          <CodeBlock>{`ssh -p 65002 user@host
gunzip -c ~/jokas-db-backups/db-YYYYMMDD.sql.gz | mysql --defaults-file=~/.jokas-backup.cnf <dbname>`}</CodeBlock>
          <p className="mt-2 text-xs text-ink/55">
            <code className="font-mono">~/.jokas-backup.cnf</code> already has the right host/user/password/database — no need to re-derive
            credentials from <code className="font-mono">DATABASE_URL</code> by hand.
          </p>

          <p className="mb-1 mt-4 text-sm font-semibold text-ink">Restore uploaded files</p>
          <CodeBlock>{`tar -xzf ~/jokas-files-backups/files-YYYYMMDD.tar.gz -C ~/domains/jokasfarms.com/nodejs/apps/api/uploads/`}</CodeBlock>

          <p className="mb-1 mt-4 text-sm font-semibold text-ink">Restore application code (manual, beyond the pipeline&apos;s own auto-rollback)</p>
          <CodeBlock>{`rsync -a --delete ~/domains/jokasfarms.com/nodejs_prev/ ~/domains/jokasfarms.com/nodejs/
mkdir -p ~/domains/jokasfarms.com/nodejs/tmp
touch ~/domains/jokasfarms.com/nodejs/tmp/restart.txt`}</CodeBlock>
          <p className="mt-2 text-xs text-ink/55">
            <code className="font-mono">nodejs_prev</code> is a hardlinked snapshot of the previous deploy, refreshed before every extraction —
            this is exactly what the pipeline&apos;s own automatic rollback does after a failed smoke test, and is safe to run by hand if a problem
            surfaces after the smoke test already passed.
          </p>
        </Card>

        {/* Recovery checklist */}
        <Card>
          <SectionHeader icon={Shield} title="Recovery Scenario Checklist" />
          <div className="rounded-lg border border-line divide-y divide-line">
            {[
              { scenario: "Bad deploy, smoke test failed", action: "Pipeline auto-rolls-back code automatically (nodejs_prev → nodejs, 3 retries). No action needed unless the rollback itself failed — the job log says so explicitly." },
              { scenario: "Bad deploy, smoke test passed but something's still wrong", action: "Manual code rollback (above), then check whether a migration ran — if so, verify/restore schema state too." },
              { scenario: "Migration failed mid-deploy", action: "Read the migration step's failure output for the exact pre-deploy snapshot filename. Restore it if the partially-applied schema is causing problems." },
              { scenario: "Data corruption / accidental deletion, no bad deploy involved", action: "Restore from the most recent db-*.sql.gz (up to 24h old) or files-*.tar.gz." },
              { scenario: "Uploads directory lost/corrupted", action: "Restore from the most recent files-*.tar.gz." },
              { scenario: "Want to confirm backups actually work before you need them", action: "Run scripts/verify-backup-restore.sh — periodically, not just once." }
            ].map(({ scenario, action }) => (
              <div key={scenario} className="px-4 py-3">
                <p className="text-sm font-semibold text-ink">{scenario}</p>
                <p className="mt-1 text-sm text-ink/65">{action}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Deliberate gaps */}
        <Card>
          <SectionHeader icon={FileArchive} title="What This Setup Deliberately Does Not Do" />
          <ul className="space-y-1.5">
            <CheckItem>
              <span><strong>No off-site/S3 copy</strong> — backups live on the same Hostinger account as the data they protect. They cover bad deploys, bad migrations, and accidental deletion, but not total account loss. If that risk matters, periodically <code className="font-mono text-xs">rsync</code>/<code className="font-mono text-xs">scp</code> the backup directories somewhere off Hostinger.</span>
            </CheckItem>
            <CheckItem>
              <span><strong>No point-in-time recovery</strong> — daily snapshots plus per-deploy snapshots, not continuous binlog replication. Recovery granularity is &quot;as of the last snapshot,&quot; not &quot;as of any given second.&quot;</span>
            </CheckItem>
            <CheckItem>
              <span><strong>No automated restore-drill in CI</strong> — by design, to avoid restoring a multi-MB dump on every push.</span>
            </CheckItem>
          </ul>
        </Card>

        {/* Info footer */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p>
            Full detail lives in <code className="font-mono text-xs">docs/backup-and-recovery.md</code> — this page is a summary view of that
            document. The scripts in <code className="font-mono text-xs">scripts/backup/</code> (Postgres/Docker/crontab-flavored) are leftovers
            from an earlier deployment design and are not what runs in production; the ones that matter are{" "}
            <code className="font-mono text-xs">setup-backup-crons.sh</code> and <code className="font-mono text-xs">verify-backup-restore.sh</code> at the repo root.
          </p>
        </div>

      </div>
    </>
  );
}
