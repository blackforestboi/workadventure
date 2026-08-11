<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { TEAPOT_WOKA_SPRITE_SHEET } from "../../../common/Teapot/TeapotWoka";
    import type { WokaData, WokaTexture } from "./WokaTypes";

    interface Props {
        selectedTextures: Record<string, string>;
        wokaData?: WokaData | null;
        canvasSize?: number;
        direction?: number;
        getTextureUrl?: (url: string) => string;
        classList?: string;
        animateFrames?: boolean;
        frameDurationMs?: number;
    }

    let {
        selectedTextures,
        wokaData = null,
        canvasSize = 64,
        direction = 0,
        getTextureUrl = (url) => url,
        classList = "",
        animateFrames = false,
        frameDurationMs = 240,
    }: Props = $props();

    const bodyPartOrder = ["body", "eyes", "hair", "clothes", "hat", "accessory", "woka"];

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let images: Record<string, HTMLImageElement> = {};
    let frame: number = 0;

    let raf: number;

    function findTextureUrl(bodyPart: string): string | null {
        const textureId = selectedTextures?.[bodyPart];
        if (!textureId || !wokaData?.[bodyPart]?.collections) return null;
        for (const collection of wokaData[bodyPart].collections) {
            const texture = collection.textures.find((t: WokaTexture) => t.id === textureId);
            if (texture) return getTextureUrl(texture.url);
        }
        return null;
    }

    function loadImages() {
        images = {};
        for (const part of bodyPartOrder) {
            const url = findTextureUrl(part);
            if (url) {
                const img = new window.Image();
                // Load image with CORS headers to populate the cache with CORS headers
                img.crossOrigin = "user-credentials";
                img.src = url;
                images[part] = img;
            }
        }
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const part of bodyPartOrder) {
            const img = images[part];
            if (img && img.complete) {
                const frameWidth = img.naturalWidth / TEAPOT_WOKA_SPRITE_SHEET.frameColumns;
                const frameHeight = img.naturalHeight / TEAPOT_WOKA_SPRITE_SHEET.frameRows;
                const highResolution = frameWidth > TEAPOT_WOKA_SPRITE_SHEET.frameWidth;
                ctx.imageSmoothingEnabled = highResolution;
                canvas.style.imageRendering = highResolution ? "auto" : "pixelated";
                ctx.drawImage(
                    img,
                    frame * frameWidth,
                    direction * frameHeight,
                    frameWidth,
                    frameHeight,
                    0,
                    0,
                    canvasSize,
                    canvasSize,
                );
            }
        }
    }

    function animate(timestamp: number) {
        frame = animateFrames ? Math.floor(timestamp / frameDurationMs) % TEAPOT_WOKA_SPRITE_SHEET.frameColumns : 0;
        draw();
        raf = requestAnimationFrame(animate);
    }

    $effect(() => {
        if (selectedTextures) {
            loadImages();
        }
    });

    onMount(() => {
        const context = canvas.getContext("2d");
        if (!context) return;
        ctx = context;
        loadImages();
        raf = requestAnimationFrame(animate);
    });
    onDestroy(() => {
        cancelAnimationFrame(raf);
    });
</script>

<canvas bind:this={canvas} width={canvasSize} height={canvasSize} class={classList}></canvas>
