import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { Badge, Button, Card, Notice, PageHeader } from "../../../components/ui";
import { isoToZonedLocal, zonedLocalToIso, zoneOr } from "../../../lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Advertisements" };

type Ad = {
  id: string;
  title: string;
  body: string | null;
  link_url: string | null;
  image_url: string | null;
  placement: "left" | "right";
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  sort_order: number;
  live: boolean;
};

const UUID = /^[0-9a-f-]{36}$/i;
const field = "h-10 w-full rounded border border-line-strong bg-surface px-3 text-sm";

async function tzOfAdmin() {
  const me = await getCurrentUser();
  return zoneOr((me as { timezone?: string | null } | null)?.timezone);
}

function back(q: string): never {
  revalidatePath("/admin/ads");
  revalidatePath("/", "layout");
  redirect(`/admin/ads?${q}`);
}

async function message(r: Response) {
  return ((await r.json().catch(() => null)) as { message?: string } | null)?.message || "That didn’t save.";
}

/** Dates are whole days in the admin's time zone: an ad starts at the beginning of its start day and stops after its expiry day. */
async function payload(fd: FormData) {
  const tz = await tzOfAdmin();
  const day = (k: string, time: string) => {
    const v = String(fd.get(k) || "").trim();
    return v ? zonedLocalToIso(`${v}T${time}`, tz) : null;
  };
  return {
    title: String(fd.get("title") || "").trim(),
    body: String(fd.get("body") || "").trim() || null,
    link_url: String(fd.get("link_url") || "").trim() || null,
    placement: fd.get("placement") === "right" ? "right" : "left",
    is_active: fd.get("is_active") === "on",
    starts_at: day("starts_on", "00:00"),
    expires_at: day("expires_on", "23:59"),
    sort_order: Number(fd.get("sort_order") || 0) || 0
  };
}

async function uploadImage(id: string, fd: FormData) {
  const file = fd.get("image");
  if (!(file instanceof File) || !file.size) return null;
  const out = new FormData();
  out.set("file", file, file.name);
  const r = await backendFetch(`/v1/admin/ads/${id}/image`, { method: "POST", body: out });
  return r.ok ? null : await message(r);
}

async function saveSettings(fd: FormData) {
  "use server";
  const r = await backendFetch("/v1/admin/ads/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ left: fd.get("left") === "on", right: fd.get("right") === "on" })
  });
  back(r.ok ? "ok=settings" : `error=${encodeURIComponent(await message(r))}`);
}

async function createAd(fd: FormData) {
  "use server";
  const r = await backendFetch("/v1/admin/ads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(await payload(fd)) });
  if (!r.ok) back(`error=${encodeURIComponent(await message(r))}#new`);
  const { id } = (await r.json()) as { id: string };
  const imgError = await uploadImage(id, fd);
  back(imgError ? `error=${encodeURIComponent(`Ad created, but the image wasn’t: ${imgError}`)}#ad-${id}` : `ok=created#ad-${id}`);
}

async function updateAd(id: string, fd: FormData) {
  "use server";
  if (!UUID.test(id)) back("");
  const r = await backendFetch(`/v1/admin/ads/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(await payload(fd)) });
  if (!r.ok) back(`error=${encodeURIComponent(await message(r))}#ad-${id}`);
  const imgError = await uploadImage(id, fd);
  back(imgError ? `error=${encodeURIComponent(imgError)}#ad-${id}` : `ok=saved#ad-${id}`);
}

async function toggleAd(id: string, on: boolean) {
  "use server";
  if (!UUID.test(id)) back("");
  const r = await backendFetch(`/v1/admin/ads/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ is_active: on }) });
  back(r.ok ? `ok=${on ? "on" : "off"}#ad-${id}` : `error=${encodeURIComponent(await message(r))}#ad-${id}`);
}

async function deleteAd(id: string) {
  "use server";
  if (!UUID.test(id)) back("");
  const r = await backendFetch(`/v1/admin/ads/${id}`, { method: "DELETE" });
  back(r.ok ? "ok=deleted" : `error=${encodeURIComponent(await message(r))}`);
}

const OK: Record<string, string> = {
  settings: "Panel settings saved.",
  created: "Ad created.",
  saved: "Ad saved.",
  on: "Ad turned on.",
  off: "Ad turned off.",
  deleted: "Ad deleted."
};

function status(a: Ad, sideOn: boolean) {
  const now = Date.now();
  if (!a.is_active) return <Badge>Off</Badge>;
  if (a.expires_at && new Date(a.expires_at).getTime() <= now) return <Badge tone="danger">Expired</Badge>;
  if (a.starts_at && new Date(a.starts_at).getTime() > now) return <Badge tone="warning">Scheduled</Badge>;
  return sideOn ? <Badge tone="success">Showing</Badge> : <Badge tone="warning">On, but the {a.placement} panel is off</Badge>;
}

function AdFields({ a, tz }: { a?: Ad; tz: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium sm:col-span-2">
        Title
        <input name="title" required maxLength={80} defaultValue={a?.title} className={field} placeholder="Spring food drive — volunteers wanted" />
      </label>
      <label className="grid gap-1 text-sm font-medium sm:col-span-2">
        Text <span className="font-normal text-muted">(optional, up to 300 characters)</span>
        <textarea name="body" maxLength={300} defaultValue={a?.body ?? ""} rows={2} className="rounded border border-line-strong bg-surface px-3 py-2 text-sm" />
      </label>
      <label className="grid gap-1 text-sm font-medium sm:col-span-2">
        Link <span className="font-normal text-muted">(optional: https://… or a page here such as /opportunities)</span>
        <input name="link_url" maxLength={500} defaultValue={a?.link_url ?? ""} className={field} placeholder="https://example.org" />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Panel
        <select name="placement" defaultValue={a?.placement ?? "left"} className={field}>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Order <span className="font-normal text-muted">(lower shows first)</span>
        <input name="sort_order" type="number" min={-1000} max={1000} defaultValue={a?.sort_order ?? 0} className={field} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Starts on <span className="font-normal text-muted">(optional)</span>
        <input name="starts_on" type="date" defaultValue={isoToZonedLocal(a?.starts_at, tz, true)} className={field} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Expires after <span className="font-normal text-muted">(optional; last day shown)</span>
        <input name="expires_on" type="date" defaultValue={isoToZonedLocal(a?.expires_at, tz, true)} className={field} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Image <span className="font-normal text-muted">(optional: PNG, JPEG or WebP, up to 1 MB)</span>
        <input name="image" type="file" accept="image/png,image/jpeg,image/webp" className="text-sm" />
      </label>
      <label className="flex items-center gap-2 self-end text-sm font-medium">
        <input type="checkbox" name="is_active" defaultChecked={a ? a.is_active : true} className="h-4 w-4" />
        Turned on
      </label>
    </div>
  );
}

/** Advertisement panels on the public pages: turn each side on or off, and manage the ads in it. */
export default async function Page(props: { searchParams?: Promise<{ ok?: string; error?: string }> }) {
  const sp = (await props.searchParams) || {};
  const me = await getCurrentUser();
  if (!me) redirect("/login?returnTo=/admin/ads");
  if (!me.is_platform_admin) redirect("/403");
  const tz = await tzOfAdmin();
  const res = await backendFetch("/v1/admin/ads");
  if (res.status === 403) redirect("/403");
  const data = res.ok ? ((await res.json()) as { settings: { left: boolean; right: boolean }; ads: Ad[] }) : null;

  return (
    <>
      <PageHeader
        title="Advertisements"
        description="Ads show in panels to the left and right of the public pages (home, opportunities, organizations…) on wide screens. Each ad is labelled “Sponsored”."
      />
      {sp.ok && OK[sp.ok] ? <Notice tone="success">{OK[sp.ok]}</Notice> : null}
      {sp.error ? <Notice tone="danger">{sp.error}</Notice> : null}
      {!data ? <Notice tone="danger">Ads couldn’t load. Refresh to try again.</Notice> : null}

      {data ? (
        <div className="mt-4 grid gap-6">
          <Card>
            <h2 className="m-0 text-lg">Panels</h2>
            <p className="m-0 mt-1 text-sm text-muted">A panel that’s off shows nothing, whatever ads are in it.</p>
            <form action={saveSettings} className="mt-3 flex flex-wrap items-center gap-5 text-sm">
              <label className="flex items-center gap-2 font-medium">
                <input type="checkbox" name="left" defaultChecked={data.settings.left} className="h-4 w-4" /> Show the left panel
              </label>
              <label className="flex items-center gap-2 font-medium">
                <input type="checkbox" name="right" defaultChecked={data.settings.right} className="h-4 w-4" /> Show the right panel
              </label>
              <Button type="submit" size="sm" variant="secondary">
                Save
              </Button>
            </form>
          </Card>

          {(["left", "right"] as const).map((side) => {
            const ads = data.ads.filter((a) => a.placement === side);
            return (
              <section key={side} aria-labelledby={`h-${side}`}>
                <h2 id={`h-${side}`} className="m-0 text-lg">
                  {side === "left" ? "Left" : "Right"} panel{" "}
                  <span className="text-sm font-normal text-muted">· {data.settings[side] ? "on" : "off"} · {ads.length} ad{ads.length === 1 ? "" : "s"}</span>
                </h2>
                {!ads.length ? <p className="m-0 mt-2 text-sm text-muted">No ads yet.</p> : null}
                <ul className="m-0 mt-3 grid gap-3 p-0">
                  {ads.map((a) => (
                    <li key={a.id} id={`ad-${a.id}`} className="list-none rounded-md border border-line bg-surface p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          {a.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- uploaded images served from /media
                            <img src={a.image_url} alt="" className="h-14 w-20 shrink-0 rounded object-cover" />
                          ) : null}
                          <div className="min-w-0">
                            <p className="m-0 font-semibold">{a.title}</p>
                            <p className="m-0 mt-0.5 text-sm text-muted">
                              {a.starts_at ? `From ${isoToZonedLocal(a.starts_at, tz, true)}` : "No start date"} ·{" "}
                              {a.expires_at ? `until ${isoToZonedLocal(a.expires_at, tz, true)}` : "no expiry"}
                              {a.link_url ? ` · ${a.link_url}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {status(a, data.settings[side])}
                          <form action={toggleAd.bind(null, a.id, !a.is_active)}>
                            <Button type="submit" size="sm" variant="secondary">
                              {a.is_active ? "Turn off" : "Turn on"}
                            </Button>
                          </form>
                        </div>
                      </div>
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm font-medium text-primary">Edit</summary>
                        <form action={updateAd.bind(null, a.id)} className="mt-3 grid gap-3">
                          <AdFields a={a} tz={tz} />
                          <div className="flex flex-wrap gap-2">
                            <Button type="submit" size="sm">
                              Save
                            </Button>
                          </div>
                        </form>
                        <form action={deleteAd.bind(null, a.id)} className="mt-3">
                          <Button type="submit" size="sm" variant="danger">
                            Delete ad
                          </Button>
                        </form>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <Card id="new">
            <h2 className="m-0 text-lg">New ad</h2>
            <form action={createAd} className="mt-3 grid gap-3">
              <AdFields tz={tz} />
              <div>
                <Button type="submit">Create ad</Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </>
  );
}
