/**
 * Compute whether a restaurant is currently open based on opening_hours JSON.
 * Falls back to the static is_open DB field if no hours are defined.
 */

import { isOpenAt } from "@/lib/openingHours";

export function isOpenNow(
  openingHours: unknown,
  dbIsOpen: boolean | null | undefined,
): boolean {
  // If admin manually closed (is_open = false), always closed
  if (dbIsOpen === false) return false;

  if (!openingHours || typeof openingHours !== "object" || Object.keys(openingHours).length === 0) return dbIsOpen ?? true;
  return isOpenAt(openingHours);
}
