import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { backendFetch } from "../../app/lib/backend";
import { Avatar, Button } from "../ui";

/**
 * Profile photo: uploaded and served from this site (links to images elsewhere aren't accepted),
 * so viewing someone's profile never tells a third party who looked.
 */
export default function PhotoUpload({ name, src, back }: { name: string; src: string | null | undefined; back: "/volunteer/profile" | "/requester/profile" }) {
  async function upload(fd: FormData) {
    "use server";
    if (fd.get("remove") === "1") {
      const r = await backendFetch("/v1/onboarding/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ avatarUrl: null }) });
      revalidatePath(back);
      redirect(r.ok ? `${back}?photo=removed` : `${back}?photo=error`);
    }
    const file = fd.get("photo");
    if (!(file instanceof File) || !file.size) redirect(`${back}?photo=missing`);
    const out = new FormData();
    out.set("file", file, file.name);
    const r = await backendFetch("/v1/me/avatar", { method: "POST", body: out });
    const j = (await r.json().catch(() => null)) as { message?: string } | null;
    revalidatePath(back);
    redirect(r.ok ? `${back}?photo=saved` : `${back}?photo=${encodeURIComponent(j?.message || "error")}`);
  }

  return (
    <form action={upload} className="flex flex-wrap items-end gap-3">
      <Avatar name={name || "You"} src={src} size={56} />
      <label className="grid gap-1 text-sm font-semibold">
        Profile photo <span className="font-normal text-muted">PNG, JPEG or WebP, up to 1 MB</span>
        <input name="photo" type="file" accept="image/png,image/jpeg,image/webp" className="text-sm font-normal" />
      </label>
      <Button type="submit" size="sm" variant="secondary">
        Upload
      </Button>
      {src ? (
        <Button type="submit" size="sm" variant="ghost" name="remove" value="1">
          Remove
        </Button>
      ) : null}
    </form>
  );
}
