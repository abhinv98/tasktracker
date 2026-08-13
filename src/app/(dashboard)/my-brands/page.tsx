"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, PageHeader } from "@/components/ui";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Link2,
  Tag,
} from "lucide-react";

/**
 * Read-only brand view for employees: the brands they actually work on (derived
 * from their assigned tasks), and for each one the files and links they need.
 * Deliberately carries none of the management surface — no credentials, no
 * manager assignment, no client portal.
 */
export default function MyBrandsPage() {
  const brands = useQuery(api.brands.listMyInvolvedBrands, {});
  const [selectedBrandId, setSelectedBrandId] = useState<Id<"brands"> | null>(
    null
  );

  const selectedBrand = brands?.find((b) => b._id === selectedBrandId) ?? null;

  if (selectedBrand) {
    return (
      <BrandDetail
        brandId={selectedBrand._id}
        name={selectedBrand.name}
        color={selectedBrand.color}
        logoUrl={selectedBrand.logoUrl}
        onBack={() => setSelectedBrandId(null)}
      />
    );
  }

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Brands"
        subtitle="The brands you're working on. Files and links, read-only."
      />

      {brands === undefined ? (
        <p className="text-[15px] text-[var(--text-secondary)]">Loading...</p>
      ) : brands.length === 0 ? (
        <Card>
          <p className="text-[13px] text-[var(--text-muted)] text-center py-6">
            You&apos;re not assigned to any brand work yet.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand) => (
            <Card key={brand._id} onClick={() => setSelectedBrandId(brand._id)}>
              <div className="flex items-center gap-3">
                {brand.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={brand.logoUrl}
                    alt={brand.name}
                    className="h-10 w-10 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <span
                    className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: `${brand.color ?? "#6b7280"}1a`,
                    }}
                  >
                    <Tag
                      className="h-4 w-4"
                      style={{ color: brand.color ?? "#6b7280" }}
                    />
                  </span>
                )}
                <span className="font-semibold text-[15px] text-[var(--text-primary)] truncate">
                  {brand.name}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function BrandDetail({
  brandId,
  name,
  color,
  logoUrl,
  onBack,
}: {
  brandId: Id<"brands">;
  name: string;
  color: string | null;
  logoUrl: string | null;
  onBack: () => void;
}) {
  // Both queries already scope themselves for non-admins: documents come back
  // filtered to visibility "all", and credentials are not requested at all.
  const docs = useQuery(api.brandDocuments.listDocuments, { brandId });
  const links = useQuery(api.brandLinks.listLinks, { brandId });

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={onBack}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title="Back to brands"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={name}
            className="h-11 w-11 rounded-lg object-cover"
          />
        ) : (
          <span
            className="h-11 w-11 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${color ?? "#6b7280"}1a` }}
          >
            <Tag className="h-5 w-5" style={{ color: color ?? "#6b7280" }} />
          </span>
        )}
        <h1 className="font-semibold text-[20px] text-[var(--text-primary)]">
          {name}
        </h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-[var(--text-muted)]" />
            <h2 className="font-semibold text-[13px] text-[var(--text-primary)] uppercase tracking-wide">
              Important Files
            </h2>
          </div>
          {docs === undefined ? (
            <p className="text-[12px] text-[var(--text-muted)]">Loading...</p>
          ) : docs.length === 0 ? (
            <p className="text-[12px] text-[var(--text-muted)] py-2">
              No files shared for this brand.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {docs.map((doc) => (
                <li key={doc._id}>
                  <a
                    href={doc.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors group"
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-[var(--text-primary)] truncate">
                        {doc.fileName}
                      </span>
                      <span className="block text-[11px] text-[var(--text-muted)]">
                        Added by {doc.uploaderName}
                      </span>
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="h-4 w-4 text-[var(--text-muted)]" />
            <h2 className="font-semibold text-[13px] text-[var(--text-primary)] uppercase tracking-wide">
              Important Links
            </h2>
          </div>
          {links === undefined ? (
            <p className="text-[12px] text-[var(--text-muted)]">Loading...</p>
          ) : links.length === 0 ? (
            <p className="text-[12px] text-[var(--text-muted)] py-2">
              No links shared for this brand.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {links.map((link) => (
                <li key={link._id}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors group"
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-[var(--text-primary)] truncate">
                        {link.label}
                      </span>
                      {link.description && (
                        <span className="block text-[11px] text-[var(--text-muted)] truncate">
                          {link.description}
                        </span>
                      )}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
