import Link from "next/link";
import { MapPin, Briefcase, CalendarDays, ArrowLeft } from "lucide-react";
import JobApplyForm from "@/components/JobApplyForm";
import { api, type PublicJob } from "@/lib/api";

export const revalidate = 60;

async function load(ref: string): Promise<PublicJob | null> {
  try { return await api.jobs.get(ref); } catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ ref: string }> }) {
  const job = await load((await params).ref);
  return job ? { title: `${job.title} (Job)`, description: job.description.slice(0, 160) } : { title: "Job closed" };
}

export default async function JobPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const job = await load(ref);
  if (!job) {
    return (
      <section className="bg-cream py-28 text-center">
        <div className="mx-auto max-w-xl px-5">
          <h1 className="font-display text-4xl text-ink">This job is no longer open</h1>
          <p className="mt-3 text-muted">It may have been filled or closed. See our other open jobs.</p>
          <Link href="/careers" className="mt-6 inline-block rounded-2xl bg-brand px-6 py-3 text-sm font-bold text-white">See open jobs</Link>
        </div>
      </section>
    );
  }
  return (
    <section className="bg-cream py-12 lg:py-20">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <Link href="/careers" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-brand"><ArrowLeft size={14} /> All jobs</Link>
        <h1 className="font-display text-4xl text-ink sm:text-5xl">{job.title}</h1>
        <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
          {job.department && <span className="inline-flex items-center gap-1.5"><Briefcase size={14} />{job.department}</span>}
          {job.location && <span className="inline-flex items-center gap-1.5"><MapPin size={14} />{job.location}</span>}
          {job.employmentType && <span>{job.employmentType}</span>}
          {job.closingDate && <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} />Apply by {new Date(job.closingDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>}
        </p>
        <div className="mt-8 space-y-6 rounded-3xl bg-white p-7 ring-1 ring-sand sm:p-9">
          <div><h2 className="font-display text-2xl text-ink">About the job</h2><p className="mt-2 whitespace-pre-line leading-relaxed text-stone">{job.description}</p></div>
          {job.requirements && <div><h2 className="font-display text-2xl text-ink">Requirements</h2><p className="mt-2 whitespace-pre-line leading-relaxed text-stone">{job.requirements}</p></div>}
        </div>
        <div className="mt-8"><JobApplyForm reference={job.reference} title={job.title} /></div>
      </div>
    </section>
  );
}
