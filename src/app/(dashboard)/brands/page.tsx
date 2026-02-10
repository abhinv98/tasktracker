"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Card, Input, Textarea } from "@/components/ui";
import { Plus, X, Tag } from "lucide-react";

const BRAND_COLORS = [
  "#d97757", "#6a9bcc", "#788c5d", "#b07cc6", "#cc8f5e",
  "#5e9e9e", "#c0392b", "#7f8c8d", "#2c3e50", "#e67e22",
];

export default function BrandsPage() {
  const router = useRouter();
  const brands = useQuery(api.brands.listBrands);
  const createBrand = useMutation(api.brands.createBrand);
  const user = useQuery(api.users.getCurrentUser);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(BRAND_COLORS[0]);

  const isAdmin = user?.role === "admin";

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const brandId = await createBrand({ name, description: description || undefined, color });
      setShowModal(false);
      setName("");
      setDescription("");
      setColor(BRAND_COLORS[0]);
      router.push(`/brands/${brandId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create brand");
    }
  }

  if (brands === undefined) {
    return (
      <div className="p-8">
        <p className="text-[14px] text-[var(--text-secondary)]">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="font-bold text-[24px] text-[var(--text-primary)] tracking-tight">
            Brands
          </h1>
          <p className="mt-1 text-[14px] text-[var(--text-secondary)]">
            Manage your client brands and projects
          </p>
        </div>
        {isAdmin && (
          <Button variant="primary" onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Create Brand
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {brands.map((brand) => (
          <Card
            key={brand._id}
            onClick={() => router.push(`/brands/${brand._id}`)}
            hover
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: brand.color + "20" }}
              >
                <Tag className="h-5 w-5" style={{ color: brand.color }} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-[15px] text-[var(--text-primary)] truncate">
                  {brand.name}
                </h3>
                {brand.description && (
                  <p className="text-[12px] text-[var(--text-secondary)] truncate">
                    {brand.description}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-3 text-[12px]">
              <span className="text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-primary)]">{brand.managerCount}</span> manager{brand.managerCount !== 1 ? "s" : ""}
              </span>
              <span className="text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-primary)]">{brand.briefCount}</span> brief{brand.briefCount !== 1 ? "s" : ""}
              </span>
              <span className="text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--accent-employee)]">{brand.activeBriefCount}</span> active
              </span>
            </div>
            {brand.managerNames.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-3">
                {brand.managerNames.map((name: string) => (
                  <Badge key={name} variant="manager">{name}</Badge>
                ))}
              </div>
            )}
          </Card>
        ))}
        {brands.length === 0 && (
          <p className="text-[13px] text-[var(--text-muted)] col-span-3">
            No brands yet.{isAdmin ? " Create one to get started." : ""}
          </p>
        )}
      </div>

      {/* Create Brand Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[18px] text-[var(--text-primary)]">
                Create Brand
              </h2>
              <button onClick={() => setShowModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <Input
                label="Brand Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Corp"
                required
              />
              <Textarea
                label="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this brand"
              />
              <div>
                <label className="font-medium text-[13px] text-[var(--text-secondary)] block mb-2">
                  Color
                </label>
                <div className="flex gap-2 flex-wrap">
                  {BRAND_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-8 h-8 rounded-lg border-2 transition-all ${
                        color === c ? "border-[var(--text-primary)] scale-110" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="primary">
                  Create
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
