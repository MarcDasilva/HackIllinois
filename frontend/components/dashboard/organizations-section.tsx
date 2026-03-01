"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type OrgEntry = { id: string; name: string; orgId: string; role: string; orgCode: string };

function getSupabase() {
  try { return createClient(); } catch { return null; }
}

export function OrganizationsSection({ showHeading = true }: { showHeading?: boolean }) {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<OrgEntry[]>([]);
  const [showCodes, setShowCodes] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrgs = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !user?.id) { setOrgs([]); setLoading(false); return; }
    const { data, error: e } = await supabase
      .from("organizations")
      .select("id, name, org_id, role, org_code")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (e) { setError(e.message); setOrgs([]); }
    else {
      setOrgs((data ?? []).map((r) => ({
        id: r.id ?? "",
        name: r.name ?? "",
        orgId: r.org_id ?? "",
        role: r.role ?? "",
        orgCode: r.org_code ?? "",
      })));
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  const addOrg = () =>
    setOrgs((prev) => [...prev, { id: "", name: "", orgId: "", role: "", orgCode: "" }]);

  const updateOrg = (index: number, field: keyof OrgEntry, value: string) =>
    setOrgs((prev) => prev.map((o, i) => (i === index ? { ...o, [field]: value } : o)));

  const removeOrg = (index: number) =>
    setOrgs((prev) => prev.filter((_, i) => i !== index));

  const toggleCode = (index: number) =>
    setShowCodes((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });

  const saveOrgs = async () => {
    setError(null);
    const supabase = getSupabase();
    if (!supabase || !user?.id) { setError("Not signed in"); return; }
    setSaving(true);
    try {
      const { error: deleteErr } = await supabase.from("organizations").delete().eq("user_id", user.id);
      if (deleteErr) throw deleteErr;
      const valid = orgs.filter((o) => o.name.trim());
      if (valid.length > 0) {
        const { error: insertErr } = await supabase.from("organizations").insert(
          valid.map((o) => ({
            user_id: user.id,
            name: o.name.trim(),
            org_id: o.orgId.trim() || null,
            role: o.role.trim() || null,
            org_code: o.orgCode.trim() || null,
          }))
        );
        if (insertErr) throw insertErr;
      }
      await loadOrgs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="px-4 py-8 lg:px-6">
      <p className="text-muted-foreground text-sm">Loading organizations…</p>
    </div>
  );

  return (
    <div className="px-4 py-8 lg:px-6 max-w-2xl">
      {showHeading && (
        <>
          <h2 className="font-serif text-2xl text-foreground">Organizations</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Add organizations you belong to. Used to associate documents with an org.
          </p>
        </>
      )}

      <div className={showHeading ? "mt-6 flex flex-col gap-4" : "flex flex-col gap-4"}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {orgs.length} organization{orgs.length !== 1 ? "s" : ""}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={addOrg} className="gap-1.5">
            <Plus className="size-4" />
            Add organization
          </Button>
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-border bg-secondary/50 p-4">
          {orgs.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">
              No organizations yet. Click &quot;Add organization&quot; to add one.
            </p>
          ) : (
            orgs.map((org, index) => (
              <div key={index} className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
                {/* Name row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="grid flex-1 gap-2 min-w-0">
                    <label className="text-xs font-medium text-muted-foreground">Name</label>
                    <Input
                      value={org.name}
                      onChange={(e) => updateOrg(index, "name", e.target.value)}
                      placeholder="e.g. Acme Corp"
                      className="rounded-lg"
                    />
                  </div>
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive mt-6"
                    onClick={() => removeOrg(index)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                {/* ID + Role row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <label className="text-xs font-medium text-muted-foreground">Organization ID</label>
                    <Input
                      value={org.orgId}
                      onChange={(e) => updateOrg(index, "orgId", e.target.value)}
                      placeholder="org_123"
                      className="rounded-lg"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-medium text-muted-foreground">Role</label>
                    <Input
                      value={org.role}
                      onChange={(e) => updateOrg(index, "role", e.target.value)}
                      placeholder="e.g. Admin"
                      className="rounded-lg"
                    />
                  </div>
                </div>

                {/* Validation code row */}
                <div className="grid gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Validation Code</label>
                  <div className="relative flex">
                    <Input
                      type={showCodes.has(index) ? "text" : "password"}
                      value={org.orgCode}
                      onChange={(e) => updateOrg(index, "orgCode", e.target.value)}
                      placeholder="Org validation / access code"
                      className="rounded-lg pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => toggleCode(index)}
                      aria-label={showCodes.has(index) ? "Hide code" : "Show code"}
                    >
                      {showCodes.has(index)
                        ? <EyeOff className="size-4" />
                        : <Eye className="size-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {orgs.some((o) => o.name.trim()) && (
          <div className="flex items-center gap-3">
            <Button onClick={saveOrgs} disabled={saving} className="rounded-lg">
              {saving ? "Saving…" : "Save organizations"}
            </Button>
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
