import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { Badge, Button, Notice, PageHeader } from "../../../components/ui";

export const dynamic = "force-dynamic";

type Category = { slug: string; label: string; description: string | null; is_sensitive: boolean; enabled: boolean; min_post_tier: "basic" | "trusted"; min_apply_tier: "basic" | "trusted" };

const TIER = { basic: "Anyone with a verified email", trusted: "Verified (ID-checked) people only" } as const;

async function saveCategory(slug: string, fd: FormData) {
  "use server";
  if (!/^[a-z0-9-]+$/.test(slug)) redirect("/admin/categories");
  const tier = (v: FormDataEntryValue | null) => (v === "trusted" ? "trusted" : "basic");
  const r = await backendFetch(`/v1/admin/categories/${slug}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: fd.get("enabled") === "on", min_post_tier: tier(fd.get("min_post_tier")), min_apply_tier: tier(fd.get("min_apply_tier")) })
  });
  const j = (await r.json().catch(() => null)) as { message?: string } | null;
  revalidatePath("/admin/categories");
  redirect(r.ok ? `/admin/categories?saved=${slug}#${slug}` : `/admin/categories?error=${encodeURIComponent(j?.message || "Couldn't save")}#${slug}`);
}

/** Request categories: which are open, and who may post to or volunteer in each. Admins change them; moderators can look. */
export default async function Page(props: { searchParams?: Promise<{ saved?: string; error?: string }> }) {
  const sp = (await props.searchParams) || {};
  const me = await getCurrentUser();
  const canEdit = Boolean(me?.is_platform_admin);
  const res = await backendFetch("/v1/admin/categories");
  const cats = res.ok ? ((await res.json()) as { categories: Category[] }).categories : null;
  const field = "h-9 rounded border border-line-strong bg-surface px-2 text-sm";
  return (
    <>
      <PageHeader title="Categories" description="Turn categories on or off, and choose who can post requests in each and who can volunteer for them." />
      {sp.saved ? <Notice tone="success">Saved.</Notice> : null}
      {sp.error ? <Notice tone="danger">{sp.error}</Notice> : null}
      {!cats ? <Notice tone="danger">Categories couldn’t load.</Notice> : null}
      <ul className="m-0 mt-4 grid gap-3 p-0">
        {(cats ?? []).map((c) => (
          <li key={c.slug} id={c.slug} className="list-none rounded-md border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{c.label}</span>
              {c.is_sensitive ? <Badge tone="warning">Sensitive: each request is reviewed</Badge> : null}
              {!c.enabled ? <span className="text-xs text-muted">Off</span> : null}
            </div>
            {c.description ? <p className="m-0 mt-1 text-sm text-muted">{c.description}</p> : null}
            {canEdit ? (
              <form action={saveCategory.bind(null, c.slug)} className="mt-3 flex flex-wrap items-end gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="enabled" defaultChecked={c.enabled} className="h-4 w-4" />
                  Open for new requests
                </label>
                <label className="grid gap-1">
                  Who can post
                  <select name="min_post_tier" defaultValue={c.min_post_tier} className={field}>
                    <option value="basic">{TIER.basic}</option>
                    <option value="trusted">{TIER.trusted}</option>
                  </select>
                </label>
                <label className="grid gap-1">
                  Who can volunteer
                  <select name="min_apply_tier" defaultValue={c.min_apply_tier} className={field}>
                    <option value="basic">{TIER.basic}</option>
                    <option value="trusted">{TIER.trusted}</option>
                  </select>
                </label>
                <Button type="submit" size="sm" variant="secondary">
                  Save
                </Button>
              </form>
            ) : (
              <p className="m-0 mt-2 text-sm">
                Post: {TIER[c.min_post_tier]} · Volunteer: {TIER[c.min_apply_tier]}
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
