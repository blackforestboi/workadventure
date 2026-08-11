<script lang="ts">
    interface Props {
        collisionGrid: number[][];
        collisionGridWidth: number;
        collisionGridHeight: number;
        offsetX?: number;
        offsetY?: number;
        updateCollisionGrid: (rowIndex: number, columnIndex: number) => void;
    }

    let {
        collisionGrid = [],
        collisionGridWidth,
        collisionGridHeight,
        offsetX = 0,
        offsetY = 0,
        updateCollisionGrid,
    }: Props = $props();
    let columnCount = $derived(Math.max(1, ...collisionGrid.map((row) => row.length)));
</script>

<div
    class="absolute grid"
    style:left={`${offsetX}px`}
    style:top={`${offsetY}px`}
    style:width={`${collisionGridWidth}px`}
    style:height={`${collisionGridHeight}px`}
    style:grid-template-columns={`repeat(${columnCount}, minmax(0, 1fr))`}
    style:grid-template-rows={`repeat(${Math.max(1, collisionGrid.length)}, minmax(0, 1fr))`}
    aria-label="Collision areas"
>
    {#each collisionGrid as row, rowIndex (rowIndex)}
        {#each row as _, columnIndex (columnIndex)}
            <button
                type="button"
                aria-label={`Collision cell ${rowIndex + 1}, ${columnIndex + 1}`}
                aria-pressed={collisionGrid[rowIndex][columnIndex] === 1}
                class={[
                    "min-h-0 min-w-0 cursor-crosshair border border-solid border-white/35 p-0 transition-colors hover:bg-red-400/35",
                    collisionGrid[rowIndex][columnIndex] === 1 ? "bg-red-500/55" : "bg-transparent",
                ]}
                onclick={() => updateCollisionGrid(rowIndex, columnIndex)}
            ></button>
        {/each}
    {/each}
</div>
