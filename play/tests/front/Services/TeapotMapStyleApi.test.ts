import { describe, expect, it, vi } from "vitest";

import { TeapotMapStyleApi } from "../../../src/front/Services/TeapotMapStyleApi";

const style = {
    id: "style-1",
    name: "Default",
    isDefault: true,
    isBuiltIn: true,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
};
const entry = {
    id: "entry-1",
    styleId: style.id,
    assetKind: "map-entity" as const,
    source: { type: "teapot-asset" as const, assetId: "asset-1", sourceVersion: 1 as const },
    metadataVersion: 1,
    metadata: { tags: ["tree"] },
    derivedFromAssetId: "asset-1",
    createdAt: style.createdAt,
};

describe("TeapotMapStyleApi", () => {
    it("sends typed owner-authorized list, create, and copy requests", async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ styles: [style], entries: [entry] }), { status: 200 }))
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ ...style, id: "style-2", name: "Ink" }), { status: 201 }),
            )
            .mockResolvedValueOnce(new Response(JSON.stringify(entry), { status: 201 }));
        const api = new TeapotMapStyleApi("https://play.example.test/", () => "token", fetcher);

        await expect(api.list(style.id, "map-entity")).resolves.toEqual({ styles: [style], entries: [entry] });
        await expect(api.create("Ink", "create-1")).resolves.toMatchObject({ id: "style-2" });
        await expect(api.copy(style.id, entry.source, "copy-1")).resolves.toEqual(entry);
        expect(new URL(fetcher.mock.calls[0][0] as URL).searchParams.get("kind")).toBe("map-entity");
        expect(JSON.parse((fetcher.mock.calls[2][1] as RequestInit).body as string)).toEqual({
            source: entry.source,
            idempotencyKey: "copy-1",
        });
    });
});
