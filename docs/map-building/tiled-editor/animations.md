---
sidebar_position: 70
title: Animations
---

# Animating WorkAdventure maps

A tile can run an animation in loops, for example to render water or blinking lights. Each animation frame is a single
32x32 tile. To create an animation, edit the tileset in Tiled and click on the tile to animate (or pick a free tile to
not overwrite existing ones) and click on the animation editor:

![](../images/anims/camera.png)

You can now add all tiles that should be part of the animation via drag and drop to the "playlist" and adjust the frame duration:

![The tile animation editor](../images/anims/animation_editor.png)

<div class="text--center text--italic">The tile animation editor</div>

You can preview animations directly in Tiled, using the "Show tile animations" option:

![The Show Tile Animations option](../images/anims/settings_show_animations.png)

<div class="text--center text--italic">The Show Tile Animations option</div>

:::info Tip
The engine does tile-updates every 100ms, animations with a shorter frame duration will most likely not look that good or may even do not work.
:::

## Animated assets in the browser editor

The browser asset generator can create either a static image or a short looping animation. Enable **Animate this
asset** before generation, then choose the frame count and duration. Four frames at 200ms each are the default.

Animated terrain is stored as one horizontal strip of 32x32 frames. It appears as one terrain asset in the palette;
when it is added to a map, WorkAdventure writes native Tiled animation metadata for the first tile in that strip.

Animated objects use the same horizontal-strip convention, but their frame size is not tied to the 32px map grid.
Frame width and height describe the source image only. After placing an object, you can resize it normally: placement
width and height scale the complete animation and do not change its frame boundaries or timing.

Static and animated assets use the same catalog and placement flow. Existing assets without animation metadata stay
static. Woka sheets retain their established directional 3x4 layout and walking animations.

:::note Importing animation strips
An image is never assumed to be animated only because it is wide. Animation metadata must explicitly define the frame
grid and positive frame durations, which prevents wide static objects from being cropped accidentally.
:::
