import Link from "next/link";
import { LogoMark } from "./Logo";

const GROUPS = [
  { title: "Get involved", links: [["/opportunities", "Browse opportunities"], ["/organizations", "Organizations"], ["/signup", "Create an account"], ["/org/signup", "Register an organization"]] },
  { title: "Learn", links: [["/how-it-works", "How it works"], ["/impact-stories", "Impact stories"], ["/examples", "Ideas for helping"], ["/about", "About"]] },
  { title: "Trust & help", links: [["/trust-safety", "Trust & safety"], ["/code-of-conduct", "Code of conduct"], ["/help", "Help center"], ["/contact", "Contact us"]] },
  { title: "Legal", links: [["/terms", "Terms of service"], ["/privacy", "Privacy policy"]] }
] as const;

export default function MarketingFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-content gap-10 px-5 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <div className="flex items-center gap-2 font-display text-lg font-bold">
            <LogoMark size={26} /> Volunteer Services
          </div>
          <p className="mt-3 text-sm text-muted">
            Neighbors and nonprofits helping each other. Not for emergencies — if someone is in danger, call your local emergency number.
          </p>
        </div>
        {GROUPS.map((g) => (
          <nav key={g.title} aria-label={g.title}>
            <h2 className="m-0 mb-3 font-sans text-sm font-semibold text-ink">{g.title}</h2>
            <ul className="m-0 grid list-none gap-2 p-0 text-sm">
              {g.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-muted hover:text-ink">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto my-0 max-w-content px-5 py-5 text-xs text-muted">© {new Date().getFullYear()} Volunteer Services</p>
      </div>
    </footer>
  );
}
