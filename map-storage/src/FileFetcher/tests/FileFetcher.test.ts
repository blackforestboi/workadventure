import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { FileSystemInterface } from "../../Upload/FileSystemInterface";
import { proxyFiles } from "../FileFetcher";

describe("proxyFiles", () => {
    it.each(["/maps/world.wam", "/maps/world.tmj", "/maps/world%2Etmj"])("never caches mutable map file %s", (path) => {
        const set = vi.fn();
        const request = { path, headers: {}, hostname: "maps.example.test" } as Request;
        const response = { headersSent: false, set } as unknown as Response;
        const next = vi.fn() as NextFunction;
        const fileSystem = {
            serveStaticFile: (_virtualPath: string, _response: Response, _onMissing: NextFunction) => undefined,
        } as FileSystemInterface;

        proxyFiles(fileSystem)(request, response, next);

        expect(set).toHaveBeenCalledWith("Cache-Control", "no-store");
    });

    it("does not cache a UUID asset miss before the durable upload becomes available", () => {
        const set = vi.fn();
        const request = {
            path: "/assets/entities/fa8a803e-555d-460c-b94f-6607c52408b5-Small-Plant.png",
            headers: {},
            hostname: "maps.example.test",
        } as Request;
        const response = { headersSent: false, set } as unknown as Response;
        const next = vi.fn() as NextFunction;
        const fileSystem = {
            serveStaticFile: (_virtualPath: string, _response: Response, onMissing: NextFunction) => onMissing(),
        } as FileSystemInterface;

        proxyFiles(fileSystem)(request, response, next);

        expect(set).toHaveBeenNthCalledWith(1, "Cache-Control", "public, max-age=31536000, immutable");
        expect(set).toHaveBeenLastCalledWith("Cache-Control", "no-store");
        expect(next).toHaveBeenCalledOnce();
    });
});
