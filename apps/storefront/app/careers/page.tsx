import Link from "next/link";
import { ArrowRight, MapPin, Briefcase, CalendarDays } from "lucide-react";
import PageHero from "@/components/PageHero";
import { api, type PublicJob } from "@/lib/api";

export const revalidate = 60;
export const metadata = {
  title: "Careers",
  description: "Open jobs at Akoko Feeds. Apply online.",
};

export default async function CareersPage() {
  let jobs: PublicJob[] = [];
  let failed = false;
  try { jobs = await api.jobs.list(); } catch { failed = true; }

  return (
    <>
      <PageHero eyebrow="Careers" title={<>Work with <em className="text-brand">Akoko Feeds.</em></>} lead="See our open jobs and apply online. It takes a few minutes." image="/photos/farm-feeding.webp" />
      <section className="bg-cream py-16 lg:py-24">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          {failed ? (
            <p className="rounded-2xl bg-white p-8 text-center text-muted ring-1 ring-sand">We could not load the jobs just now. Please try again shortly.</p>
          ) : jobs.length === 0 ? (
            <p className="rounded-2xl bg-white p-8 text-center text-muted ring-1 ring-sand">There are no open jobs right now. Please check back soon.</p>
          ) : (
            <ul className="space-y-4">
              {jobs.map((j) => (
                <li key={j.reference}>
                  <Link href={`/careers/${j.reference}`} className="group flex items-center justify-between gap-4 rounded-3xl bg-white p-6 shadow-panel ring-1 ring-sand transition hover:-translate-y-0.5">
                    <div>
                      <h2 className="font-display text-2xl text-ink">{j.title}</h2>
                      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                        {j.department && <span className="inline-flex items-center gap-1.5"><Briefcase size={14} />{j.department}</span>}
                        {j.location && <span className="inline-flex items-center gap-1.5"><MapPin size={14} />{j.location}</span>}
                        {j.closingDate && <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} />Apply by {new Date(j.closingDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
                      </p>
                    </div>
                    <ArrowRight className="shrink-0 text-brand transition group-hover:translate-x-1" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
