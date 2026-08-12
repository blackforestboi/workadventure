<script lang="ts">
    import Popup from "./Popup.svelte";
    import Input from "../Input/Input.svelte";
    import Button from "../UI/Button.svelte";
    import { modals } from "@wa-modals";

    interface Props {
        isOpen: boolean;
        password: string;
        onSuccess: () => void;
    }

    let { isOpen, password, onSuccess }: Props = $props();
    let attempt = $state("");
    let incorrect = $state(false);

    function submit() {
        if (attempt !== password) {
            incorrect = true;
            return;
        }

        modals.close();
        onSuccess();
    }
</script>

<Popup {isOpen}>
    {#snippet title()}
        <h1>Enter exit password</h1>
    {/snippet}
    {#snippet content()}
        <div class="w-full">
            <Input
                id="exit-password"
                label="Password"
                type="password"
                bind:value={attempt}
                status={incorrect ? "error" : undefined}
                errorHelperText={incorrect ? "Incorrect password" : null}
                onkeydown={(event) => {
                    if (event.key === "Enter") submit();
                }}
            />
        </div>
    {/snippet}
    {#snippet action()}
        <Button class="flex-1" appearance="border" onclick={() => modals.close()}>Cancel</Button>
        <Button class="flex-1" variant="secondary" onclick={submit}>Continue</Button>
    {/snippet}
</Popup>
