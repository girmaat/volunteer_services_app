"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { useRef } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

export type ContextOption = { value: string; label: string; current: boolean };

/** Switches between Volunteer · Requester · each organization · Platform admin. */
export default function ContextSwitcher({
  options,
  currentLabel,
  canAddRole,
  compact = false
}: {
  options: ContextOption[];
  currentLabel: string;
  canAddRole: boolean;
  compact?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const item =
    "flex w-full cursor-pointer items-center gap-2.5 rounded border-0 bg-transparent px-2.5 py-2 text-left text-sm text-ink outline-none data-[highlighted]:bg-primary-tint data-[highlighted]:text-primary";
  if (options.length <= 1 && !canAddRole)
    return <p className="m-0 mt-4 truncate px-2 text-xs font-medium text-muted">{currentLabel}</p>;
  return (
    <>
      <form ref={formRef} action="/api/context" method="post" hidden>
        <input type="hidden" name="context" defaultValue="" />
      </form>
      <Dropdown.Root>
        <Dropdown.Trigger
          className={`${compact ? "" : "mt-3 "}flex w-full items-center justify-between gap-2 rounded border border-line bg-surface px-2.5 py-2 text-left text-sm font-medium text-ink hover:border-line-strong`}
          aria-label={`Acting as ${currentLabel}. Switch context`}
        >
          <span className="truncate">{currentLabel}</span>
          <ChevronsUpDown aria-hidden className="h-4 w-4 shrink-0 text-muted" />
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            align="start"
            sideOffset={6}
            className="z-50 min-w-[240px] rounded-md border border-line bg-surface p-1.5 shadow-pop"
          >
            <Dropdown.Label className="px-2.5 pb-1 pt-1.5 text-xs text-muted">Switch to</Dropdown.Label>
            {options.map((o) => (
              <Dropdown.Item
                key={o.value}
                className={item}
                aria-current={o.current ? "true" : undefined}
                onSelect={() => {
                  const form = formRef.current;
                  if (!form) return;
                  (form.elements.namedItem("context") as HTMLInputElement).value = o.value;
                  form.requestSubmit();
                }}
              >
                <span className="flex h-4 w-4 items-center justify-center">
                  {o.current ? <Check aria-hidden className="h-4 w-4 text-primary" /> : null}
                </span>
                <span className={o.current ? "font-semibold" : ""}>{o.label}</span>
              </Dropdown.Item>
            ))}
            {canAddRole ? (
              <>
                <Dropdown.Separator className="my-1 h-px bg-line" />
                <Dropdown.Item asChild className={item}>
                  <Link href="/settings/roles">
                    <Plus aria-hidden className="h-4 w-4" /> Add a role
                  </Link>
                </Dropdown.Item>
              </>
            ) : null}
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </>
  );
}
