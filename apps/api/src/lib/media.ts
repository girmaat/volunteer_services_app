import { z } from "zod";

/** A hosted image path, or null to clear. Anything else (another site's URL) is refused. */
export const MediaPath = z
  .string()
  .trim()
  .regex(/^\/media\/[0-9a-f-]{36}$/i, "Upload the image instead of linking to it")
  .nullable();

