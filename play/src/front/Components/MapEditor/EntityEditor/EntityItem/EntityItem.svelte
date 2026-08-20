<script lang="ts">
    import type { EntityVariant } from "../../../../Phaser/Game/MapEditor/Entities/EntityVariant";
    import StylePackCardMenu from "../../StylePacks/StylePackCardMenu.svelte";
    import { getObjectStyleMetadata, getObjectStyleSource } from "../ObjectStylePackMetadata";
    import EntityImage from "./EntityImage.svelte";

    interface Props {
        entityVariant: EntityVariant;
        isActive: boolean;
        onselectentity?: (entityVariant: EntityVariant, image?: HTMLImageElement) => void;
    }

    let { entityVariant, isActive, onselectentity }: Props = $props();
    let loadedImage: HTMLImageElement | undefined;
    const styleMetadata = $derived(getObjectStyleMetadata(entityVariant));
    const styleSource = $derived(getObjectStyleSource(entityVariant));
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    data-testid="entity-item"
    class={`relative flex items-center justify-center box-border py-0.5 cursor-pointer border-solid border-transparent h-full w-full bg-white/10 rounded-2xl hover:bg-white/20 hover:border-white hover:animate-pulse ${
        isActive ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-[#24344d]" : ""
    }`}
    onclick={() => onselectentity?.(entityVariant, loadedImage)}
>
    <EntityImage
        classNames="cursor-pointer w-14 h-14 object-contain rounded-md"
        imageSource={entityVariant.defaultPrefab.imagePath}
        imageAlt={entityVariant.defaultPrefab.name}
        imageLoad={(image) => (loadedImage = image)}
    />
    <StylePackCardMenu
        assetKind="object"
        source={styleSource}
        metadata={styleMetadata}
        derivedFromAssetId={entityVariant.defaultPrefab.id}
    />
</div>
