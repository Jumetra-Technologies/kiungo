import { describe, expect, it } from "vitest";
import { PARTS, getPart } from "./index";
import { VENDOR_HOSTS, vendorLinksFor } from "./vendor-links";

describe("where to buy a part", () => {
  it("searches both marketplaces for the part's own name", () => {
    const links = vendorLinksFor(getPart("dht11")!);
    expect(links[0]).toEqual({
      vendor: "Jumia Kenya",
      kind: "search",
      url: `https://www.jumia.co.ke/catalog/?q=${encodeURIComponent(getPart("dht11")!.name)}`,
    });
    expect(links[1]?.url).toBe(
      `https://jiji.co.ke/search?query=${encodeURIComponent(getPart("dht11")!.name)}`,
    );
  });

  it("adds the specialist's category page only for groups with a confirmed one", () => {
    expect(vendorLinksFor(getPart("arduino-uno")!).at(-1)).toMatchObject({
      vendor: "Nerokas",
      kind: "category",
      url: "https://store.nerokas.co.ke/Arduino",
    });
    expect(vendorLinksFor(getPart("lcd-16x2")!).map((l) => l.vendor)).not.toContain("Nerokas");
    expect(vendorLinksFor(getPart("breadboard")!).map((l) => l.vendor)).not.toContain("Nerokas");
  });

  it("only ever points at the vendors' own sites", () => {
    for (const part of PARTS)
      for (const link of vendorLinksFor(part)) {
        const url = new URL(link.url);
        expect(url.protocol).toBe("https:");
        expect(VENDOR_HOSTS).toContain(url.host);
      }
  });
});
