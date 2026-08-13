import fs from "fs";

type PathExists = (path: string) => boolean;

export function resolveStaticAssetsPath(
    nodeEnvironment = process.env.NODE_ENV,
    pathExists: PathExists = fs.existsSync,
): string {
    const candidates = nodeEnvironment === "production" ? ["dist/public", "public"] : ["public", "dist/public"];
    const staticAssetsPath = candidates.find((candidate) => pathExists(candidate));

    if (staticAssetsPath === undefined) {
        throw new Error("Could not find public folder");
    }

    return staticAssetsPath;
}
