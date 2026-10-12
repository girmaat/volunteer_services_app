"use client";

import { useEffect, useState } from "react";
import { COMMON_TIMEZONES, zoneOr } from "../../lib/time";

/** Time zone picker that starts on the browser's own zone (no typing "America/New_York"). */
export default function TimezoneSelect({ name, defaultValue, id }: { name: string; defaultValue?: string | null; id: string }) {
  const [value, setValue] = useState(zoneOr(defaultValue));
  const [zones, setZones] = useState<string[]>(COMMON_TIMEZONES as unknown as string[]);
  useEffect(() => {
    if (defaultValue) return;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        setValue(tz);
        setZones((z) => (z.includes(tz) ? z : [tz, ...z]));
      }
    } catch {
      /* keep the default */
    }
  }, [defaultValue]);
  const label = (tz: string) => tz.replace(/_/g, " ").replace("/", " · ");
  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className="h-11 w-full rounded border border-line-strong bg-surface px-3 text-base"
    >
      {zones.map((z) => (
        <option key={z} value={z}>
          {label(z)}
        </option>
      ))}
    </select>
  );
}
