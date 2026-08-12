<script lang="ts">
    import { onDestroy } from "svelte";
    import { IconLoader, IconPhotoOff } from "@wa-icons";

    interface Props {
        classNames?: string;
        imageSource: string;
        imageAlt: string;
        imageLoad?: (image: HTMLImageElement) => void;
    }

    let { classNames = undefined, imageSource, imageAlt, imageLoad = () => {} }: Props = $props();
    let imageElementRef = $state<HTMLImageElement | undefined>(undefined);
    let imageRetry = $state(false);
    let imageError = $state(false);
    const MAX_RETRY = 10;
    let retry = $state(0);
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;

    function retryImageLoading() {
        imageRetry = true;
        if (retry < MAX_RETRY) {
            clearTimeout(retryTimeout);
            retryTimeout = setTimeout(() => {
                retryTimeout = undefined;
                retry += 1;
                // Remounting the image triggers a fresh request without retaining a reference to an
                // element that Svelte unmounted while the retry spinner was visible.
                imageRetry = false;
            }, 500);
        } else {
            imageRetry = false;
            imageError = true;
        }
    }

    onDestroy(() => clearTimeout(retryTimeout));
</script>

{#if imageRetry}
    <div class="flex items-center justify-center flex-1" data-testid="entityImageLoader">
        <IconLoader class="animate-spin" />
    </div>
{/if}

{#if imageError}
    <div class="flex items-center justify-center flex-1" data-testid="entityImageError">
        <IconPhotoOff />
    </div>
{/if}

{#key retry}
    <img
        loading="lazy"
        crossorigin="anonymous"
        draggable="false"
        class={`${classNames} ${imageRetry || imageError ? "invisible flex-[0_1_0]" : "visible"}`}
        style="image-rendering: pixelated"
        src={imageSource}
        alt={imageAlt}
        onload={() => {
            if (imageElementRef) {
                imageLoad(imageElementRef);
            }
            imageError = false;
            imageRetry = false;
        }}
        bind:this={imageElementRef}
        onerror={() => retryImageLoading()}
    />
{/key}
