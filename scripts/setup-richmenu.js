
const line = require('@line/bot-sdk');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const config = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.messagingApi.MessagingApiClient(config);
const blobClient = new line.messagingApi.MessagingApiBlobClient(config);

async function setupRichMenu() {
    console.log('Initializing Rich Menu setup...');

    // 1. Define Rich Menu
    const richMenu = {
        size: { width: 1200, height: 810 },
        selected: true,
        name: 'Main Menu',
        chatBarText: 'メニューを開く',
        areas: [
            {
                bounds: { x: 0, y: 0, width: 600, height: 810 },
                action: { type: 'message', text: 'リスト' } // For Manage/List
            },
            {
                bounds: { x: 600, y: 0, width: 600, height: 810 },
                action: { type: 'message', text: '予約確認' } // For Schedule Check
            }
        ]
    };

    try {
        // 2. Create Rich Menu
        const richMenuId = await client.createRichMenu(richMenu);
        console.log(`Rich Menu created. ID: ${richMenuId.richMenuId}`);

        // 3. Upload Image
        const imagePath = 'public/richmenu.png';
        const buffer = fs.readFileSync(imagePath);

        // Node.js 18+ has global Blob. If not, this might fail.
        // mime type is crucial.
        const blob = new Blob([buffer], { type: 'image/png' });

        await blobClient.setRichMenuImage(richMenuId.richMenuId, blob);
        console.log('Image uploaded.');

        // 4. Set as Default
        await client.setDefaultRichMenu(richMenuId.richMenuId);
        console.log('Set as default rich menu.');

        console.log('SUCCESS: Rich Menu setup complete!');
    } catch (error) {
        console.error('Error setting up Rich Menu:', error.originalError?.response?.data || error);
    }
}

setupRichMenu();
