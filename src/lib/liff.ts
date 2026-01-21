
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
    if (!liff.isInClient()) {
        console.warn('LIFF is not running in LINE App. Cannot send message.');
        return false;
    }
    try {
        await liff.sendMessages([
            {
                type: 'text',
                text: `CONNECT ${appUserId}`
            }
        ]);
        return true;
    } catch (error) {
        console.error('LIFF Send Message failed:', error);
        return false;
    }
}
