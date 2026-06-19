"use client";

import { AlertTriangle, Archive, CheckCircle2, Clock, Cloud, Database, FileArchive, HardDrive, Info, RefreshCw, Shield, Terminal } from "lucide-react";
import { AppShell } from "../../../components/app-shell";

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
      <CheckCircle2 size={15} className={`mt-0.5 shrink-0 ${done ? "text-green-500" : "text-ink/25"}`} />
      {children}
    </li>
  );
}

export default function BackupPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="app-kicker">Platform</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Backup & Recovery</h1>
            <p className="mt-1 text-sm text-ink/60">
              Data protection configuration, schedule, storage, and recovery procedures for this ERP system.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
            <AlertTriangle size={13} />
            Configure on deployment server
          </span>
        </div>

        {/* Status cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Daily Backup", value: "02:00 AM", sub: "Every day", icon: Clock, color: "text-brand" },
            { label: "Retention", value: "7 / 30 / 365", sub: "Days kept per tier", icon: Archive, color: "text-emerald-600" },
            { label: "Storage", value: "Local + S3", sub: "Two copies minimum", icon: Cloud, color: "text-blue-600" },
            { label: "Test Frequency", value: "Monthly", sub: "Verify restorability", icon: RefreshCw, color: "text-violet-600" }
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

        {/* Backup schedule */}
        <Card>
          <SectionHeader
            icon={Clock}
            title="Backup Schedule"
            subtitle="Three automated tiers running via cron on the deployment server"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-ink/45">
                  <th className="pb-2 pr-6">Tier</th>
                  <th className="pb-2 pr-6">When</th>
                  <th className="pb-2 pr-6">Cron</th>
                  <th className="pb-2 pr-6">Retention</th>
                  <th className="pb-2">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[
                  { tier: "Daily", when: "Every day at 02:00 AM", cron: "0 2 * * *", retain: "7 days", purpose: "Recover from yesterday's bad import" },
                  { tier: "Weekly", when: "Every Sunday at 03:00 AM", cron: "0 3 * * 0", retain: "30 days", purpose: "Recover from last month's corruption" },
                  { tier: "Monthly", when: "1st of month at 04:00 AM", cron: "0 4 1 * *", retain: "365 days", purpose: "Compliance and long-range recovery" }
                ].map(({ tier, when, cron, retain, purpose }) => (
                  <tr key={tier} className="text-ink/80">
                    <td className="py-2.5 pr-6 font-semibold">{tier}</td>
                    <td className="py-2.5 pr-6">{when}</td>
                    <td className="py-2.5 pr-6 font-mono text-xs text-ink/60">{cron}</td>
                    <td className="py-2.5 pr-6"><StatusPill color={tier === "Daily" ? "green" : tier === "Weekly" ? "blue" : "yellow"} label={retain} /></td>
                    <td className="py-2.5 text-ink/60">{purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Setup commands */}
        <Card>
          <SectionHeader
            icon={Terminal}
            title="Setup & Manual Backup Commands"
            subtitle="Run on the Linux deployment server"
          />
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-ink">1. First-time setup</p>
              <CodeBlock>{`# Copy config template and fill in your values
cp scripts/backup/backup.env.example scripts/backup/backup.env
nano scripts/backup/backup.env

# Make scripts executable
chmod +x scripts/backup/*.sh

# Create backup directory
mkdir -p /opt/jokas/backups`}</CodeBlock>
            </div>

            <div>
              <p className="text-sm font-semibold text-ink">2. Install automated cron jobs</p>
              <CodeBlock>{`scripts/backup/setup-cron.sh`}</CodeBlock>
            </div>

            <div>
              <p className="text-sm font-semibold text-ink">3. Run a manual backup</p>
              <CodeBlock>{`# Full backup (database + files)
scripts/backup/backup.sh daily

# Database only (e.g., before deploying a migration)
source scripts/backup/backup.env
scripts/backup/backup-db.sh /tmp/pre-deploy-$(date +%Y%m%d).dump`}</CodeBlock>
            </div>

            <div>
              <p className="text-sm font-semibold text-ink">4. Verify a backup</p>
              <CodeBlock>{`scripts/backup/verify-backup.sh \\
  /opt/jokas/backups/daily/jokas_daily_YYYYMMDD_HHmmss`}</CodeBlock>
            </div>
          </div>
        </Card>

        {/* Restore */}
        <Card>
          <SectionHeader
            icon={Database}
            title="How to Restore the Database"
            subtitle="Destructive operation — stops all active sessions and recreates the database"
          />
          <div className="mb-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-500" />
            <p className="text-sm text-red-700 font-medium">
              Restore drops and recreates the target database. Stop the API and ensure all
              users are logged out before proceeding.
            </p>
          </div>
          <ol className="space-y-3">
            <Step n={1}>Stop the API server: <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">systemctl stop jokas-api</code></Step>
            <Step n={2}>Choose a backup: <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">ls /opt/jokas/backups/daily/</code></Step>
            <Step n={3}>
              Run restore: <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">scripts/backup/restore-db.sh /path/to/database.dump</code>
              {" "}— type <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">yes-restore</code> at the confirmation prompt.
            </Step>
            <Step n={4}>Apply any pending Prisma migrations: <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">packages/db/node_modules/.bin/prisma migrate deploy</code></Step>
            <Step n={5}>Restart the API: <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">systemctl start jokas-api</code></Step>
            <Step n={6}>Log in and verify key records (dashboard, audit log, recent transactions).</Step>
          </ol>
        </Card>

        {/* Storage */}
        <Card>
          <SectionHeader
            icon={HardDrive}
            title="Secure Backup Storage"
            subtitle="Recommended two-copy minimum: local disk + encrypted cloud object storage"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-line p-4">
              <div className="mb-2 flex items-center gap-2">
                <HardDrive size={15} className="text-ink/60" />
                <span className="text-sm font-semibold">Local disk</span>
                <StatusPill color="green" label="Required" />
              </div>
              <p className="text-xs text-ink/60 leading-relaxed">
                Fast recovery. Stored at <code className="font-mono">/opt/jokas/backups/</code>.
                Use a separate disk or partition from the application data.
                Protect with restricted permissions (<code className="font-mono">chmod 700</code>).
              </p>
            </div>
            <div className="rounded-lg border border-line p-4">
              <div className="mb-2 flex items-center gap-2">
                <Cloud size={15} className="text-blue-500" />
                <span className="text-sm font-semibold">S3-compatible storage</span>
                <StatusPill color="blue" label="Recommended" />
              </div>
              <p className="text-xs text-ink/60 leading-relaxed">
                Off-site copy. Configure <code className="font-mono">S3_BUCKET</code> in <code className="font-mono">backup.env</code>.
                Enable versioning and MFA delete on the bucket.
                Scripts upload with AES-256 server-side encryption.
              </p>
            </div>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold text-ink">Security checklist</p>
            <ul className="space-y-1.5">
              <CheckItem>Enable server-side encryption (SSE-AES256) on the S3 bucket</CheckItem>
              <CheckItem>Restrict the backup IAM role to PutObject only — no DeleteObject</CheckItem>
              <CheckItem>Enable S3 versioning and MFA delete on the backup bucket</CheckItem>
              <CheckItem>Store <code className="font-mono text-xs">backup.env</code> in a secrets manager, not on disk in plaintext</CheckItem>
              <CheckItem>Rotate AWS access keys quarterly</CheckItem>
              <CheckItem>Test a restore every month using <code className="font-mono text-xs">verify-backup.sh</code></CheckItem>
            </ul>
          </div>
        </Card>

        {/* File uploads */}
        <Card>
          <SectionHeader
            icon={FileArchive}
            title="File Upload Backup"
            subtitle="Uploaded documents, reports, and attachments are archived alongside the database"
          />
          <p className="mb-3 text-sm text-ink/70">
            Set <code className="rounded bg-gray-100 px-1 font-mono text-xs">APP_UPLOAD_DIR</code> in{" "}
            <code className="rounded bg-gray-100 px-1 font-mono text-xs">scripts/backup/backup.env</code>{" "}
            to the path where the API stores uploaded files (matches <code className="rounded bg-gray-100 px-1 font-mono text-xs">UPLOAD_DIR</code> in the API <code className="font-mono text-xs">.env</code>).
            The main backup script archives this directory automatically.
          </p>
          <p className="mb-1 text-sm font-semibold text-ink">Restore file uploads</p>
          <CodeBlock>{`# Extract to original path (overwrites current files)
tar -xzf /path/to/backup/uploads.tar.gz -C /opt/jokas`}</CodeBlock>
        </Card>

        {/* Disaster recovery */}
        <Card>
          <SectionHeader
            icon={Shield}
            title="Disaster Recovery"
            subtitle="What to do when the production server fails completely"
          />
          <p className="mb-3 text-sm text-ink/70">
            Full recovery from a destroyed server takes approximately <strong>2–4 hours</strong> with a recent
            backup in S3. See{" "}
            <code className="rounded bg-gray-100 px-1 font-mono text-xs">docs/backup-and-recovery.md</code>{" "}
            for the complete step-by-step procedure.
          </p>
          <div className="rounded-lg border border-line divide-y divide-line">
            {[
              { phase: "Phase 1 — Assess (0–15 min)", items: ["Confirm server is unreachable", "Identify most recent backup in S3", "Notify stakeholders"] },
              { phase: "Phase 2 — New server (15–60 min)", items: ["Provision Ubuntu 22.04 or Debian 12", "Install Node.js 20+, pnpm, PostgreSQL 15+"] },
              { phase: "Phase 3 — Restore data (30–60 min)", items: ["Download backup from S3", "Run restore-db.sh", "Run prisma migrate deploy"] },
              { phase: "Phase 4 — Deploy app (30–60 min)", items: ["Clone repository and install dependencies", "Copy .env files from secrets vault", "Build and start API + web"] },
              { phase: "Phase 5 — Go live (15–30 min)", items: ["Verify API health endpoint returns 401", "Log in and check dashboard data", "Update DNS / load balancer", "Re-enable cron backups"] }
            ].map(({ phase, items }) => (
              <div key={phase} className="px-4 py-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/50">{phase}</p>
                <ul className="space-y-1">
                  {items.map((item) => (
                    <CheckItem key={item}>{item}</CheckItem>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        {/* Info footer */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p>
            All backup scripts are in <code className="font-mono text-xs">scripts/backup/</code>.
            Full documentation including server-failure playbook is in{" "}
            <code className="font-mono text-xs">docs/backup-and-recovery.md</code>.
            This page is a reference view — actual backup execution happens on the deployment server via cron or manual command.
          </p>
        </div>

      </div>
    </AppShell>
  );
}
