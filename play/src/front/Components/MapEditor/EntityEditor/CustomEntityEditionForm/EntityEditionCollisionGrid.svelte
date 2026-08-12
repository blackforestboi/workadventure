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
    let rowCount = $derived(Math.max(1, collisionGrid.length));
    let cellSize = $derived(Math.min(collisionGridWidth / columnCount, collisionGridHeight / rowCount));
    let displayedGridWidth = $derived(cellSize * columnCount);
    let displayedGridHeight = $derived(cellSize * rowCount);
</script>

<div
    data-collision-grid
    class="pointer-events-auto absolute grid"
    style:left={`${offsetX + (collisionGridWidth - displayedGridWidth) / 2}px`}
    style:top={`${offsetY + (collisionGridHeight - displayedGridHeight) / 2}px`}
    style:width={`${displayedGridWidth}px`}
    style:height={`${displayedGridHeight}px`}
    style:grid-template-columns={`repeat(${columnCount}, minmax(0, 1fr))`}
    style:grid-template-rows={`repeat(${rowCount}, minmax(0, 1fr))`}
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
