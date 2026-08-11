import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import Menu from "./menu";
import { dismissDuplicateUserConnectedModalIfShown } from "./duplicateUserModal";
import { dismissNoBrowserSoundInfoToast } from "./doNotDisturbInfoToast";

// for oidcLogin to work on mobile you must open the burger menu before calling this function
export async function oidcLogin(page: Page, userName = "User1", password = "pwd") {
    const pageUrlBeforeLogin = page.url();
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page).toHaveURL(pageUrlBeforeLogin);
    await expect(page.getByTestId("loginOverlay")).toBeVisible();

    const loginFrame = page.frameLocator('[data-testid="loginFrame"]');
    await loginFrame.locator("#Input_Username").fill(userName, {
        timeout: 40_000,
    });
    await loginFrame.locator("#Input_Password").fill(password);

    await loginFrame.locator('button:has-text("Login")').click({
        // Give ample time for login to occur
        timeout: 50000,
    });

    // Dismiss the duplicate user connected modal if it is shown
    await dismissDuplicateUserConnectedModalIfShown(page);
    // Dismiss the do not disturb info toast if it is shown
    await dismissNoBrowserSoundInfoToast(page);

    await expect(page.locator("#main-layout")).toBeVisible({
        timeout: 50_000,
    });
}

export async function oidcLogout(page: Page) {
    await Menu.openMenu(page);
    await page.getByRole("button", { name: "Log out" }).click();
}

export async function oidcAdminTagLogin(page: Page) {
    await oidcLogin(page, "User1", "pwd");
}

export async function oidcMatrixUserLogin(page: Page, userName = "UserMatrix") {
    await oidcLogin(page, userName, "pwd");
}

export async function oidcMemberTagLogin(page: Page) {
    await oidcLogin(page, "User2", "pwd");
}
