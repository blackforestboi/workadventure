export type GeneratedMapObjectGridSize = { width: 1 | 2; height: 1 | 2 };

export function getDefaultGeneratedMapObjectGridSize(
    contentWidth: number,
    contentHeight: number,
): GeneratedMapObjectGridSize {
    if (contentWidth <= 0 || contentHeight <= 0) return { width: 1, height: 1 };

    if (contentWidth >= contentHeight) {
        return {
            width: 2,
            height: Math.round((contentHeight / contentWidth) * 2) >= 2 ? 2 : 1,
        };
    }

    return {
        width: Math.round((contentWidth / contentHeight) * 2) >= 2 ? 2 : 1,
        height: 2,
    };
}
