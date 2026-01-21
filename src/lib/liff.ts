
import liff from '@line/liff';

export async function initializeLiff() {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
        console.warn('LIFF ID is not set.');
        return null;
    }

    try {
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
            liff.login();
            return null;
        }
        const profile = await liff.getProfile();
        return {
            lineUserId: profile.userId,
            displayName: profile.displayName,
            pictureUrl: profile.pictureUrl,
            isInClient: liff.isInClient()
        };
    } catch (error) {
        console.error('LIFF Initialization failed:', error);
        return null;
    }
}

export async function sendConnectMessage(appUserId: string) {
    // Fallback: If we can't send messages automatically properly due to permission issues,
    // we redirect the user to the bot's chat with the message pre-filled.
    // This requires the Bot's Basic ID (e.g. @123xyz).
    // We will try to read it from env, or the user has to provide it.
    // Ideally, this should be provided via environment variable NEXT_PUBLIC_LINE_BOT_BASIC_ID

    // For now, let's assume we use the URL scheme method as a fallback or primary method.
    // Since we don't have the Bot Basic ID in the env variables visible to client yet (likely),
    // we need to ask the user to add it.

    const botId = process.env.NEXT_PUBLIC_LINE_BOT_BASIC_ID;

    if (!botId) {
        console.error('NEXT_PUBLIC_LINE_BOT_BASIC_ID is not set');
        return false;
    }

    const message = `CONNECT ${appUserId}`;
    const encodedMessage = encodeURIComponent(message);
    const lineUrl = `https://line.me/R/oaMessage/${botId}/?${encodedMessage}`;

    if (liff.isInClient()) {
        await liff.openWindow({
            url: lineUrl,
            external: false
        });
    } else {
        window.location.href = lineUrl;
    }
    return true;
}
