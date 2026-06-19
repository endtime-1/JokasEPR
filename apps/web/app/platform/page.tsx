"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { DataTable } from "../../components/data-table";
import { FormField } from "../../components/form-field";
import { ApiEnvelope, apiFetch } from "../../lib/api";

type LocationRow = {
  id: string;
  code: string;
  name: string;
  location?: string;
  city?: string;
};

export default function PlatformPage() {
  const [farms, setFarms] = useState<LocationRow[]>([]);
  const [warehouses, setWarehouses] = useState<LocationRow[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [location, setLocation] = useState("");

  async function load() {
    const [farmResponse, warehouseResponse] = await Promise.all([
      apiFetch<ApiEnvelope<LocationRow[]>>("/platform/farms"),
      apiFetch<ApiEnvelope<LocationRow[]>>("/platform/warehouses")
    ]);
    setFarms(farmResponse.data);
    setWarehouses(warehouseResponse.data);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function submitFarm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await apiFetch("/platform/farms", {
      method: "POST",
      body: JSON.stringify({ name, code, location })
    });
    setName("");
    setCode("");
    setLocation("");
    await load();
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Sites</h2>
          <p className="text-sm text-ink/65">Farms, production sites, branches, and warehouses scoped to the organization.</p>
        </div>
      </div>

      <form onSubmit={submitFarm} className="mb-6 grid gap-4 rounded-md border border-line bg-white p-4 shadow-panel md:grid-cols-[1fr_150px_1fr_auto]">
        <FormField label="Farm name">
          <input className="min-h-11 rounded-md border border-line px-3" value={name} onChange={(event) => setName(event.target.value)} required />
        </FormField>
        <FormField label="Code">
          <input className="min-h-11 rounded-md border border-line px-3" value={code} onChange={(event) => setCode(event.target.value)} required />
        </FormField>
        <FormField label="Location">
          <input className="min-h-11 rounded-md border border-line px-3" value={location} onChange={(event) => setLocation(event.target.value)} />
        </FormField>
        <button className="mt-auto flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white">
          <Plus aria-hidden className="h-4 w-4" />
          Add farm
        </button>
      </form>

      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <h3 className="mb-3 text-base font-semibold">Farms</h3>
          <DataTable
            rows={farms}
            empty="No farms found"
            columns={[
              { key: "code", label: "Code", render: (row) => row.code },
              { key: "name", label: "Name", render: (row) => row.name },
              { key: "location", label: "Location", render: (row) => row.location ?? "-" }
            ]}
          />
        </section>
        <section>
          <h3 className="mb-3 text-base font-semibold">Warehouses</h3>
          <DataTable
            rows={warehouses}
            empty="No warehouses found"
            columns={[
              { key: "code", label: "Code", render: (row) => row.code },
              { key: "name", label: "Name", render: (row) => row.name },
              { key: "location", label: "Location", render: (row) => row.location ?? "-" }
            ]}
          />
        </section>
      </div>
    </AppShell>
  );
}

