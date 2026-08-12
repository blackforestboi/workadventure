<script lang="ts">
    import type { EntityDataProperties, EntityDataPropertiesKeys, EntityDataProperty } from "@workadventure/map-editor";
    import { PersonalAreaAccessClaimMode } from "@workadventure/map-editor";
    import { onDestroy } from "svelte";
    import type { ApplicationDefinitionInterface } from "@workadventure/messages";
    import { v4 as uuid } from "uuid";
    import {
        mapEditorEntityModeStore,
        mapEditorModifyCustomEntityEventStore,
        mapEditorSelectedEntityPrefabStore,
        mapEditorSelectedEntityStore,
    } from "../../../Stores/MapEditorStore";
    import { analyticsClient } from "../../../Administration/AnalyticsClient";
    import LL from "../../../../i18n/i18n-svelte";
    import AddPropertyButtonWrapper from "../PropertyEditor/AddPropertyButtonWrapper.svelte";
    import PlayAudioPropertyEditor from "../PropertyEditor/PlayAudioPropertyEditor.svelte";
    import OpenWebsitePropertyEditor from "../PropertyEditor/OpenWebsitePropertyEditor.svelte";

    import { IconChevronDown, IconArrowLeft } from "../../Icons";
    import Input from "../../Input/Input.svelte";
    import TextArea from "../../Input/TextArea.svelte";
    import InputSwitch from "../../Input/InputSwitch.svelte";
    import OpenFilePropertyEditor from "../PropertyEditor/OpenFilePropertyEditor.svelte";
    import JitsiRoomPropertyEditor from "../PropertyEditor/JitsiRoomPropertyEditor.svelte";
    import LivekitRoomPropertyEditor from "../PropertyEditor/LivekitRoomPropertyEditor.svelte";
    import SilentPropertyEditor from "../PropertyEditor/SilentPropertyEditor.svelte";
    import SpeakerMegaphonePropertyEditor from "../PropertyEditor/SpeakerMegaphonePropertyEditor.svelte";
    import ListenerMegaphonePropertyEditor from "../PropertyEditor/ListenerMegaphonePropertyEditor.svelte";
    import StartPropertyEditor from "../PropertyEditor/StartPropertyEditor.svelte";
    import ExitPropertyEditor from "../PropertyEditor/ExitPropertyEditor.svelte";
    import MatrixRoomPropertyEditor from "../PropertyEditor/MatrixRoomPropertyEditor.svelte";
    import FocusablePropertyEditor from "../PropertyEditor/FocusablePropertyEditor.svelte";
    import HighlightPropertyEditor from "../PropertyEditor/HighlightPropertyEditor.svelte";
    import TooltipPropertyButton from "../PropertyEditor/TooltipPropertyButton.svelte";
    import LockableAreaPropertyEditor from "../PropertyEditor/LockableAreaPropertyEditor.svelte";
    import MaxUsersInAreaPropertyEditor from "../PropertyEditor/MaxUsersInAreaPropertyEditor.svelte";
    import PersonalAreaPropertyEditor from "../PropertyEditor/PersonalAreaPropertyEditor.svelte";
    import RightsPropertyEditor from "../PropertyEditor/RightsPropertyEditor.svelte";
    import type { Entity } from "../../../Phaser/ECS/Entity";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import CustomEntityEditionForm from "./CustomEntityEditionForm/CustomEntityEditionForm.svelte";

    const applicationManager = gameManager.getCurrentGameScene().applicationManager;

    let properties: EntityDataProperties = $state([]);
    let entityName = $state("");
    let entityDescription = $state("");
    let entitySearchable = $state(false);
    let showDescriptionField = $state(false);
    let selectedEntity: Entity | undefined = undefined;
    let activeTab = $state<"actions" | "edit">("actions");

    let selectedEntityUnsubscriber = mapEditorSelectedEntityStore.subscribe((currentEntity) => {
        if (currentEntity) {
            currentEntity.setEditColor(0x00ffff);
            properties = currentEntity.getProperties() ?? [];
            entityName = currentEntity.getEntityData().name ?? "";
            const descriptionProperty = properties.find((p) => p.type === "entityDescriptionProperties");
            if (!descriptionProperty) {
                $mapEditorSelectedEntityStore?.addProperty({
                    id: uuid(),
                    type: "entityDescriptionProperties",
                    description: "",
                    searchable: false,
                });
            } else {
                entityDescription = descriptionProperty.description ?? "";
                entitySearchable = descriptionProperty.searchable ?? false;
            }
            selectedEntity = currentEntity;
            activeTab = "actions";
        } else {
            selectedEntity = undefined;
        }
    });

    function saveCustomAsset(prefab: ReturnType<Entity["getPrefab"]>) {
        if (prefab.type === "Custom") {
            mapEditorModifyCustomEntityEventStore.set($state.snapshot(prefab));
        }
    }

    function onAddProperty(type: EntityDataPropertiesKeys, subtype?: string) {
        if ($mapEditorSelectedEntityStore) {
            analyticsClient.addMapEditorProperty("entity", type || "unknown");
            const property = getPropertyFromType(type, subtype);
            $mapEditorSelectedEntityStore.addProperty(property);

            // refresh properties
            properties = $mapEditorSelectedEntityStore?.getProperties();
        }
    }

    function onAddSpecificProperty(app: ApplicationDefinitionInterface) {
        if (!$mapEditorSelectedEntityStore) return;
        analyticsClient.addMapEditorProperty("entity", app.name);
        const property: EntityDataProperty = {
            id: uuid(),
            type: "openWebsite",
            application: app.name,
            closable: true,
            buttonLabel: app.name,
            link: "",
            newTab: false,
            placeholder: app.description,
            label: app.name,
            policy: app.policy,
            icon: app.image,
            regexUrl: app.regexUrl,
            targetEmbedableUrl: app.targetUrl,
            forceNewTab: app.forceNewTab,
            allowAPI: app.allowAPI,
            hideUrl: false,
        };
        $mapEditorSelectedEntityStore.addProperty(property);

        // refresh properties
        properties = $mapEditorSelectedEntityStore?.getProperties();
    }

    function onUpdateName() {
        if ($mapEditorSelectedEntityStore) {
            $mapEditorSelectedEntityStore.setEntityName(entityName);
        }
    }

    function onUpdateDescription() {
        let properties = $mapEditorSelectedEntityStore
            ?.getProperties()
            .find((p) => p.type === "entityDescriptionProperties");
        if (!properties || (properties && properties.type !== "entityDescriptionProperties"))
            throw new Error("Wrong property type");

        properties.description = entityDescription;
        if ($mapEditorSelectedEntityStore) {
            $mapEditorSelectedEntityStore.updateProperty($state.snapshot(properties));
        }
    }

    function onUpdateSearchable() {
        let properties = $mapEditorSelectedEntityStore
            ?.getProperties()
            .find((p) => p.type === "entityDescriptionProperties");
        if (!properties || (properties && properties.type !== "entityDescriptionProperties"))
            throw new Error("Wrong property type");

        properties.searchable = entitySearchable;
        if ($mapEditorSelectedEntityStore) {
            $mapEditorSelectedEntityStore.updateProperty($state.snapshot(properties));
        }
    }

    function onUpdateProperty(property: EntityDataProperty) {
        if ($mapEditorSelectedEntityStore) {
            $mapEditorSelectedEntityStore.updateProperty($state.snapshot(property));
        }
    }

    function getPropertyFromType(type: EntityDataPropertiesKeys, subtype?: string): EntityDataProperty {
        const id = uuid();
        let placeholder: string;
        let buttonLabel: string;
        let policy: string | undefined;
        switch (type) {
            case "personalAreaPropertyData":
                return {
                    id,
                    type,
                    accessClaimMode: PersonalAreaAccessClaimMode.enum.dynamic,
                    allowedTags: [],
                    ownerId: null,
                };
            case "restrictedRightsPropertyData":
                return { id, type, readTags: [], writeTags: [] };
            case "silent":
                return { id, type, hideButtonLabel: true };
            case "speakerMegaphone":
                return { id, type, name: "MySpeakerZone1", chatEnabled: false, seeAttendees: false };
            case "listenerMegaphone":
                return { id, type, speakerZoneName: "", chatEnabled: false, allowTalking: false };
            case "start":
                return { id, type, isDefault: true };
            case "exit":
                return { id, type, url: "", areaName: "" };
            case "matrixRoomPropertyData":
                return { id, type, shouldOpenAutomatically: false, displayName: "" };
            case "focusable":
                return { id, type, zoom_margin: 0.5, hideButtonLabel: true };
            case "highlight":
                return {
                    id,
                    type,
                    opacity: 0.6,
                    gradientWidth: 10,
                    duration: 250,
                    color: "#000000",
                    hideButtonLabel: true,
                };
            case "tooltipPropertyData":
                return { id, type, content: "", duration: 2 };
            case "lockableAreaPropertyData":
                return { id, type, allowedTags: [] };
            case "maxUsersInAreaPropertyData":
                return { id, type, maxUsers: 15 };
            case "jitsiRoomProperty":
                return {
                    id,
                    type,
                    jitsiRoomConfig: {},
                    closable: true,
                    roomName: "JITSI ROOM",
                    buttonLabel: $LL.mapEditor.properties.jitsiRoomProperty.label(),
                };
            case "livekitRoomProperty":
                return {
                    id,
                    type,
                    roomName: "LIVEKIT ROOM",
                    buttonLabel: $LL.mapEditor.properties.livekitRoomProperty.label(),
                    livekitRoomConfig: {
                        startWithAudioMuted: false,
                        startWithVideoMuted: false,
                        disableChat: false,
                    },
                    livekitRoomAdminTag: "",
                };
            case "openFile":
                return {
                    id,
                    type,
                    link: "",
                    name: "",
                    closable: true,
                    newTab: false,
                    buttonLabel: $LL.mapEditor.properties.openFile.label(),
                    policy,
                    width: 50,
                    hideUrl: false,
                };
            case "openWebsite":
                switch (subtype) {
                    case "youtube":
                        placeholder = "https://www.youtube.com/watch?v=Y9ubBWf5w20";
                        buttonLabel = $LL.mapEditor.properties.youtube.label();
                        policy =
                            "fullscreen; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share;";
                        break;
                    case "klaxoon":
                        placeholder = "https://app.klaxoon.com/";
                        buttonLabel = $LL.mapEditor.properties.klaxoon.label();
                        break;
                    case "googleDrive":
                        placeholder = "https://drive.google.com/file/d/1DjNjZVbVeQO9EvgONLzCtl6wG-kxSr9Z/preview";
                        buttonLabel = $LL.mapEditor.properties.googleDrive.label();
                        break;
                    case "googleDocs":
                        placeholder =
                            "https://docs.google.com/document/d/1iFHmKL4HJ6WzvQI-6FlyeuCy1gzX8bWQ83dNlcTzigk/edit";
                        buttonLabel = $LL.mapEditor.properties.googleDocs.label();
                        break;
                    case "googleSheets":
                        placeholder =
                            "https://docs.google.com/spreadsheets/d/1SBIn3IBG30eeq944OhT4VI_tSg-b1CbB0TV0ejK70RA/edit";
                        buttonLabel = $LL.mapEditor.properties.googleSheets.label();
                        break;
                    case "googleSlides":
                        placeholder =
                            "https://docs.google.com/presentation/d/1fU4fOnRiDIvOoVXbksrF2Eb0L8BYavs7YSsBmR_We3g/edit";
                        buttonLabel = $LL.mapEditor.properties.googleSlides.label();
                        break;
                    case "eraser":
                        placeholder = "https://app.eraser.io/workspace/ExSd8Z4wPsaqMMgTN4VU";
                        buttonLabel = $LL.mapEditor.properties.eraser.label();
                        break;
                    case "excalidraw":
                        placeholder = "https://excalidraw.workadventu.re/";
                        buttonLabel = $LL.mapEditor.properties.excalidraw.label();
                        break;
                    case "cards":
                        placeholder =
                            "https://member.workadventu.re?tenant=<your cards tenant>&learning=<Your cards learning>";
                        buttonLabel = $LL.mapEditor.properties.cards.label();
                        break;
                    case "tldraw":
                        placeholder = "https://tldraw.com/";
                        buttonLabel = $LL.mapEditor.properties.tldraw.label();
                        break;
                    default:
                        placeholder = "https://workadventu.re";
                        buttonLabel = $LL.mapEditor.properties.openWebsite.label();
                }
                return {
                    id,
                    type,
                    closable: true,
                    buttonLabel,
                    link: "",
                    newTab: false,
                    application: subtype ?? "website",
                    placeholder,
                    forceNewTab: false,
                    allowAPI: false,
                    policy,
                    width: 50,
                    hideUrl: false,
                };
            case "playAudio":
                return {
                    id,
                    type,
                    buttonLabel: $LL.mapEditor.properties.playAudio.label(),
                    audioLink: "",
                    volume: 1,
                };
            default:
                throw new Error(`Unknown property type ${type}`);
        }
    }

    function onDeleteProperty(id: string) {
        if ($mapEditorSelectedEntityStore) {
            analyticsClient.removeMapEditorProperty("entity", properties.find((p) => p.id === id)?.type || "unknown");
            $mapEditorSelectedEntityStore.deleteProperty(id);
            // refresh properties
            properties = $mapEditorSelectedEntityStore?.getProperties();
            // $mapEditorSelectedEntityStore.delete();
            // mapEditorSelectedEntityStore.set(undefined);
            // mapEditorEntityModeStore.set("ADD");
        }
    }

    function backToSelectObject() {
        mapEditorSelectedEntityStore.set(undefined);
        mapEditorSelectedEntityPrefabStore.set(undefined);
        mapEditorEntityModeStore.set("ADD");
    }

    onDestroy(() => {
        selectedEntityUnsubscriber();
        selectedEntity?.removeEditColor();
    });

    function toggleDescriptionField() {
        showDescriptionField = !showDescriptionField;
    }
</script>

{#if $mapEditorSelectedEntityStore === undefined}
    {$LL.mapEditor.entityEditor.editInstructions()}
{:else}
    <div class="overflow-x-hidden overflow-y-auto">
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <p
            onclick={(event) => {
                event.preventDefault();
                backToSelectObject();
            }}
            class="flex flex-row items-center text-xs m-0"
        >
            <IconArrowLeft font-size="12" class="cursor-pointer" />
            <span class="ml-1 cursor-pointer">{$LL.mapEditor.entityEditor.itemPicker.backToSelectObject()}</span>
        </p>
        <div class="header-container">
            <h3 class="my-2 text-xl font-medium">
                {$LL.mapEditor.entityEditor.editing({ name: $mapEditorSelectedEntityStore.getPrefab().name })}
            </h3>
        </div>
        <div class="mb-3 flex gap-2 border-b border-white/10">
            <button
                class:font-semibold={activeTab === "actions"}
                class={`border-b-2 px-3 py-2 text-sm ${activeTab === "actions" ? "border-secondary" : "border-transparent opacity-60"}`}
                onclick={() => (activeTab = "actions")}
            >
                Actions
            </button>
            {#if selectedEntity?.getPrefab().type === "Custom"}
                <button
                    class:font-semibold={activeTab === "edit"}
                    class={`border-b-2 px-3 py-2 text-sm ${activeTab === "edit" ? "border-secondary" : "border-transparent opacity-60"}`}
                    onclick={() => (activeTab = "edit")}
                >
                    Edit
                </button>
            {/if}
        </div>
        {#if activeTab === "edit" && selectedEntity?.getPrefab().type === "Custom"}
            <CustomEntityEditionForm
                customEntity={selectedEntity.getPrefab()}
                closeForm={() => (activeTab = "actions")}
                applyEntityModifications={saveCustomAsset}
                saveLabel="Save asset"
                description="Edit the image, placement size, and collision areas."
            />
        {:else}
            <div class="properties-buttons flex flex-row flex-wrap m-2">
                <AddPropertyButtonWrapper
                    property="livekitRoomProperty"
                    onclick={() => onAddProperty("livekitRoomProperty")}
                />
                <AddPropertyButtonWrapper property="exit" onclick={() => onAddProperty("exit")} />
                <AddPropertyButtonWrapper
                    property="jitsiRoomProperty"
                    onclick={() => {
                        onAddProperty("jitsiRoomProperty");
                    }}
                />
                <AddPropertyButtonWrapper
                    property="playAudio"
                    onclick={() => {
                        onAddProperty("playAudio");
                    }}
                />
                <AddPropertyButtonWrapper
                    property="tooltipPropertyData"
                    onclick={() => onAddProperty("tooltipPropertyData")}
                />
            </div>
            <div class="properties-buttons flex flex-row flex-wrap m-2">
                <AddPropertyButtonWrapper
                    property="openWebsite"
                    onclick={() => {
                        onAddProperty("openWebsite");
                    }}
                />
                <AddPropertyButtonWrapper
                    property="openFile"
                    onclick={() => {
                        onAddProperty("openFile");
                    }}
                />
                <AddPropertyButtonWrapper
                    property="openWebsite"
                    subProperty="klaxoon"
                    onclick={() => {
                        onAddProperty("openWebsite", "klaxoon");
                    }}
                />
                <AddPropertyButtonWrapper
                    property="openWebsite"
                    subProperty="youtube"
                    onclick={() => {
                        onAddProperty("openWebsite", "youtube");
                    }}
                />
                <AddPropertyButtonWrapper
                    property="openWebsite"
                    subProperty="googleDrive"
                    onclick={() => {
                        onAddProperty("openWebsite", "googleDrive");
                    }}
                />
                <AddPropertyButtonWrapper
                    property="openWebsite"
                    subProperty="googleDocs"
                    onclick={() => {
                        onAddProperty("openWebsite", "googleDocs");
                    }}
                />
                <AddPropertyButtonWrapper
                    property="openWebsite"
                    subProperty="googleSheets"
                    onclick={() => {
                        onAddProperty("openWebsite", "googleSheets");
                    }}
                />
                <AddPropertyButtonWrapper
                    property="openWebsite"
                    subProperty="googleSlides"
                    onclick={() => {
                        onAddProperty("openWebsite", "googleSlides");
                    }}
                />
                <AddPropertyButtonWrapper
                    property="openWebsite"
                    subProperty="eraser"
                    onclick={() => {
                        onAddProperty("openWebsite", "eraser");
                    }}
                />
                <AddPropertyButtonWrapper
                    property="openWebsite"
                    subProperty="excalidraw"
                    onclick={() => {
                        onAddProperty("openWebsite", "excalidraw");
                    }}
                />
                <AddPropertyButtonWrapper
                    property="openWebsite"
                    subProperty="cards"
                    onclick={() => {
                        onAddProperty("openWebsite", "cards");
                    }}
                />
                <AddPropertyButtonWrapper
                    property="openWebsite"
                    subProperty="tldraw"
                    onclick={() => {
                        onAddProperty("openWebsite", "tldraw");
                    }}
                />
            </div>
            <div class="properties-buttons flex flex-row flex-wrap m-2">
                {#each applicationManager.applications as app, index (`my-own-app-${index}`)}
                    <AddPropertyButtonWrapper
                        property="openWebsite"
                        subProperty={app.name}
                        onclick={() => {
                            onAddSpecificProperty(app);
                        }}
                    />
                {/each}
            </div>
            <div class="entity-name-container">
                <Input
                    id="objectName"
                    label={$LL.mapEditor.entityEditor.objectName()}
                    type="text"
                    placeholder={$LL.mapEditor.entityEditor.objectNamePlaceholder()}
                    bind:value={entityName}
                    onchange={onUpdateName}
                />
            </div>
            <div class="entity-name-container">
                {#if !showDescriptionField}
                    <a
                        href="#addDescriptionField"
                        class="pl-0 text-blue-500 flex flex-row items-center"
                        onclick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleDescriptionField();
                        }}>+ {$LL.mapEditor.entityEditor.addDescriptionField()}</a
                    >
                {:else}
                    <button class="pl-0 text-blue-500 flex flex-row items-center" onclick={toggleDescriptionField}>
                        <IconChevronDown />{$LL.mapEditor.entityEditor.addDescriptionField()}</button
                    >

                    <TextArea
                        label={$LL.mapEditor.entityEditor.objectDescription()}
                        id="objectDescription"
                        placeHolder={$LL.mapEditor.entityEditor.objectDescriptionPlaceholder()}
                        bind:value={entityDescription}
                        onchange={onUpdateDescription}
                        onkeypress={() => {}}
                    />
                {/if}
            </div>

            <InputSwitch
                label={$LL.mapEditor.entityEditor.objectSearchable()}
                id="searchable"
                bind:value={entitySearchable}
                onchange={onUpdateSearchable}
            />

            <div class="properties-container flex flex-col gap-8 p-1">
                {#each properties as property, i (property.id)}
                    {#if property.type !== "entityDescriptionProperties"}
                        <div class="property-box border border-solid border-white/20 bg-white/5 rounded p-2">
                            {#if properties[i].type === "playAudio"}
                                <PlayAudioPropertyEditor
                                    bind:property={properties[i]}
                                    onclose={() => {
                                        onDeleteProperty(property.id);
                                    }}
                                    onchange={() => onUpdateProperty(properties[i])}
                                />
                            {:else if properties[i].type === "personalAreaPropertyData"}
                                <PersonalAreaPropertyEditor
                                    bind:property={properties[i]}
                                    onclose={() => onDeleteProperty(property.id)}
                                    onchange={() => onUpdateProperty(properties[i])}
                                />
                            {:else if properties[i].type === "restrictedRightsPropertyData"}
                                <RightsPropertyEditor
                                    bind:property={properties[i]}
                                    onclose={() => onDeleteProperty(property.id)}
                                    onchange={() => onUpdateProperty(properties[i])}
                                />
                            {:else if properties[i].type === "silent"}
                                <SilentPropertyEditor onclose={() => onDeleteProperty(property.id)} />
                            {:else if properties[i].type === "livekitRoomProperty"}
                                <LivekitRoomPropertyEditor
                                    bind:property={properties[i]}
                                    hasHighlightProperty={properties.some((property) => property.type === "highlight")}
                                    shouldDisableDisableChatButton={properties.some(
                                        (property) => property.type === "matrixRoomPropertyData",
                                    )}
                                    onclose={() => onDeleteProperty(property.id)}
                                    onchange={() => onUpdateProperty(properties[i])}
                                    onhighlightareaonenter={() => onAddProperty("highlight")}
                                />
                            {:else if properties[i].type === "speakerMegaphone"}
                                <SpeakerMegaphonePropertyEditor
                                    bind:property={properties[i]}
                                    onclose={() => onDeleteProperty(property.id)}
                                    onchange={() => onUpdateProperty(properties[i])}
                                />
                            {:else if properties[i].type === "listenerMegaphone"}
                                <ListenerMegaphonePropertyEditor
                                    bind:property={properties[i]}
                                    onclose={() => onDeleteProperty(property.id)}
                                    onchange={() => onUpdateProperty(properties[i])}
                                />
                            {:else if properties[i].type === "start"}
                                <StartPropertyEditor
                                    bind:property={properties[i]}
                                    startAreaName={entityName}
                                    updateStartAreaNameCallback={(name) => {
                                        entityName = name;
                                        onUpdateName();
                                    }}
                                    onclose={() => onDeleteProperty(property.id)}
                                    onchange={() => onUpdateProperty(properties[i])}
                                />
                            {:else if properties[i].type === "exit"}
                                <ExitPropertyEditor
                                    bind:property={properties[i]}
                                    onclose={() => onDeleteProperty(property.id)}
                                    onchange={() => onUpdateProperty(properties[i])}
                                />
                            {:else if properties[i].type === "matrixRoomPropertyData"}
                                <MatrixRoomPropertyEditor
                                    bind:property={properties[i]}
                                    onclose={() => onDeleteProperty(property.id)}
                                    onchange={() => onUpdateProperty(properties[i])}
                                />
                            {:else if properties[i].type === "focusable"}
                                <FocusablePropertyEditor
                                    bind:property={properties[i]}
                                    onclose={() => onDeleteProperty(property.id)}
                                    onchange={() => onUpdateProperty(properties[i])}
                                />
                            {:else if properties[i].type === "highlight"}
                                <HighlightPropertyEditor
                                    bind:property={properties[i]}
                                    onclose={() => onDeleteProperty(property.id)}
                                    onchange={() => onUpdateProperty(properties[i])}
                                />
                            {:else if properties[i].type === "tooltipPropertyData"}
                                <TooltipPropertyButton
                                    bind:property={properties[i]}
                                    onclose={() => onDeleteProperty(property.id)}
                                    onchange={() => onUpdateProperty(properties[i])}
                                />
                            {:else if properties[i].type === "lockableAreaPropertyData"}
                                <LockableAreaPropertyEditor
                                    bind:property={properties[i]}
                                    onclose={() => onDeleteProperty(property.id)}
                                    onchange={() => onUpdateProperty(properties[i])}
                                />
                            {:else if properties[i].type === "maxUsersInAreaPropertyData"}
                                <MaxUsersInAreaPropertyEditor
                                    bind:property={properties[i]}
                                    onclose={() => onDeleteProperty(property.id)}
                                    onchange={() => onUpdateProperty(properties[i])}
                                />
                            {:else if properties[i].type === "jitsiRoomProperty"}
                                <JitsiRoomPropertyEditor
                                    bind:property={properties[i]}
                                    isArea={false}
                                    onclose={() => {
                                        onDeleteProperty(property.id);
                                    }}
                                    onchange={() => onUpdateProperty(properties[i])}
                                />
                            {:else if properties[i].type === "openWebsite"}
                                <OpenWebsitePropertyEditor
                                    bind:property={properties[i]}
                                    triggerOptionActivated={false}
                                    onclose={() => {
                                        onDeleteProperty(property.id);
                                    }}
                                    onchange={() => onUpdateProperty(properties[i])}
                                />
                            {:else if properties[i].type === "openFile"}
                                <OpenFilePropertyEditor
                                    bind:property={properties[i]}
                                    onclose={() => {
                                        onDeleteProperty(property.id);
                                    }}
                                    onchange={() => onUpdateProperty(properties[i])}
                                />
                            {/if}
                        </div>
                    {/if}
                {/each}
            </div>
        {/if}
    </div>
{/if}

<style>
    .properties-container {
        overflow-y: auto;
        overflow-x: hidden;
    }

    .properties-container::-webkit-scrollbar {
        display: none;
    }

    .entity-name-container {
        display: flex;
        width: 100%;
        margin-bottom: 0.5em;
        margin-top: 0.5em;
        flex-direction: column;

        * {
            margin-bottom: 0;
        }
    }
</style>
