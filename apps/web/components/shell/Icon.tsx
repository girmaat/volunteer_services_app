import { Award, Building2, CalendarDays, ChartColumn, ClipboardList, Clock, FileText, Flag, House, Inbox, List, Search, Settings, ShieldCheck, Star, Users } from "lucide-react";
import type { IconName } from "./nav";

const MAP = {
  home: House, search: Search, clipboard: ClipboardList, calendar: CalendarDays, inbox: Inbox, award: Award,
  list: List, users: Users, star: Star, chart: ChartColumn, building: Building2, settings: Settings, shield: ShieldCheck, flag: Flag, file: FileText, clock: Clock
} as const;

export function NavIcon({ name, className }: { name: IconName; className?: string }) {
  const C = MAP[name];
  return <C aria-hidden className={className ?? "h-[18px] w-[18px]"} strokeWidth={1.9} />;
}
