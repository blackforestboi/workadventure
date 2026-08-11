<script lang="ts">
    import type { VisualAssetAnimation } from "@workadventure/map-editor";

    interface Props {
        imageSource: string;
        imageAlt: string;
        animation?: VisualAssetAnimation;
        classNames?: string;
    }

    let { imageSource, imageAlt, animation, classNames = "" }: Props = $props();
    let framePosition = $state(0);
    $effect(() => {
        framePosition = 0;
        if (animation === undefined || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
            return;
        }
        const interval = setInterval(() => {
            framePosition = (framePosition + 1) % animation.frameCount;
        }, animation.frameDurationMs);
        return () => clearInterval(interval);
    });

    const backgroundPositionX = $derived(
        animation === undefined || animation.frameCount === 1 ? 0 : (framePosition / (animation.frameCount - 1)) * 100,
    );
</script>

{#if animation === undefined}
    <img src={imageSource} alt={imageAlt} class={classNames} />
{:else}
    <div
        role="img"
        aria-label={imageAlt}
        class={`bg-no-repeat [image-rendering:pixelated] ${classNames}`}
        style:aspect-ratio={`${animation.frameWidth} / ${animation.frameHeight}`}
        style:background-image={`url(${JSON.stringify(imageSource)})`}
        style:background-size={`${animation.frameCount * 100}% 100%`}
        style:background-position={`${backgroundPositionX}% 0%`}
    ></div>
{/if}
