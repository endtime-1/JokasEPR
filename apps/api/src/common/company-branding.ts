/**
 * Shared company-branding lookup for PDF headers (invoices, receipts,
 * quotes, payslips, ...). Name/legal name live on the Company row; address
 * and logo are stored as SystemSetting rows ("company.address",
 * "company.logo") — the same place Settings > Company Profile already
 * reads/writes them from, so any document generator gets whatever the admin
 * configured there with no duplicate storage.
 */

type BrandingClient = {
  company: { findUnique: (args: { where: { id: string }; select: { name: true; legalName: true } }) => Promise<{ name: string; legalName: string | null } | null> };
  systemSetting: { findFirst: (args: { where: { companyId: string; key: string; deletedAt: null } }) => Promise<{ value: unknown } | null> };
};

export type CompanyBranding = {
  name: string;
  legalName: string | null;
  address: string | null;
  logoUrl: string | null;
};

export async function getCompanyBranding(db: BrandingClient, companyId: string): Promise<CompanyBranding> {
  const [company, addressSetting, logoSetting] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, select: { name: true, legalName: true } }),
    db.systemSetting.findFirst({ where: { companyId, key: "company.address", deletedAt: null } }),
    db.systemSetting.findFirst({ where: { companyId, key: "company.logo", deletedAt: null } })
  ]);
  return {
    name: company?.name ?? "Company",
    legalName: company?.legalName ?? null,
    address: (addressSetting?.value as { address?: string } | undefined)?.address || null,
    logoUrl: (logoSetting?.value as { logoUrl?: string } | undefined)?.logoUrl || null
  };
}
