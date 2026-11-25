/**
 * Where to actually buy a part: real local vendor pages, not a Kiungo
 * storefront. Kiungo doesn't sell hardware or hold inventory, so every link
 * here sends the person to a vendor's own search results or category page —
 * never a specific listing, which can sell out or disappear. That keeps the
 * links honest: whatever the vendor currently has in stock is what shows up.
 *
 * Researched for Kenya, where Kiungo's pilot schools and clubs are. Jumia
 * Kenya and Jiji Kenya both carry hobby electronics from many sellers; Nerokas
 * (Thika) is a dedicated electronics and robotics supplier with its own
 * catalog. Nerokas category pages are only added for groups with a verified,
 * real category URL — guessing one would point someone at a dead page.
 */

import type { PartGroupId, PartModel } from "./types";

export interface VendorLink {
  vendor: string;
  /** What this link actually does, shown next to the vendor name. */
  kind: "search" | "category";
  url: string;
}

const JUMIA_HOST = "www.jumia.co.ke";
const JIJI_HOST = "jiji.co.ke";
const NEROKAS_HOST = "store.nerokas.co.ke";

/** Hosts a vendor link is allowed to point at; checked again on the main-process side before anything is opened. */
export const VENDOR_HOSTS: string[] = [JUMIA_HOST, JIJI_HOST, NEROKAS_HOST];

const jumiaSearch = (query: string): string => `https://${JUMIA_HOST}/catalog/?q=${encodeURIComponent(query)}`;
const jijiSearch = (query: string): string => `https://${JIJI_HOST}/search?query=${encodeURIComponent(query)}`;

/** Nerokas category pages, confirmed by browsing the live store. Groups left out here get no Nerokas link rather than a guessed URL. */
const NEROKAS_CATEGORY: Partial<Record<PartGroupId, string>> = {
  boards: `https://${NEROKAS_HOST}/Arduino`,
  sensors: `https://${NEROKAS_HOST}/Sensors`,
  outputs: `https://${NEROKAS_HOST}/drones-robotics`,
  radios: `https://${NEROKAS_HOST}/Wireless_Devices`,
};

/** Real, live vendor links for shopping a part: a search on each general marketplace, plus a specialist's matching category page where one is confirmed. */
export function vendorLinksFor(part: PartModel): VendorLink[] {
  const links: VendorLink[] = [
    { vendor: "Jumia Kenya", kind: "search", url: jumiaSearch(part.name) },
    { vendor: "Jiji Kenya", kind: "search", url: jijiSearch(part.name) },
  ];
  const nerokas = NEROKAS_CATEGORY[part.group];
  if (nerokas) links.push({ vendor: "Nerokas", kind: "category", url: nerokas });
  return links;
}
