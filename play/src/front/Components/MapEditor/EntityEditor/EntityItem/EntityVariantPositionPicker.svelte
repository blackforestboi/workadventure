<script lang="ts">
    import type { EntityPrefab } from "@workadventure/map-editor";
    import EntityImage from "./EntityImage.svelte";

    interface Props {
        entityPrefabsPositions: EntityPrefab[];
        selectedEntity: EntityPrefab;
        onPickItem: (entity: EntityPrefab, image?: HTMLImageElement) => void;
    }

    let { entityPrefabsPositions, selectedEntity, onPickItem }: Props = $props();
    const loadedImages = new Map<string, HTMLImageElement>();
</script>

{#if entityPrefabsPositions.length > 1}
    <p class="m-0 text-xxs">Positions</p>
    <div class="flex flex-row gap-2">
        {#each entityPrefabsPositions as item (item.id)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="hover:cursor-pointer" onclick={() => onPickItem(item, loadedImages.get(item.id))}>
                <EntityImage
                    classNames={`hover:cursor-pointer item-image max-w-[32px] ${
                        item.imagePath === selectedEntity?.imagePath ? "border-solid border-yellow-400 rounded-sm" : ""
                    }`}
                    imageSource={item.imagePath}
                    imageAlt={item.name}
                    imageLoad={(image) => loadedImages.set(item.id, image)}
                />
            </div>
        {/each}
    </div>
{/if}
