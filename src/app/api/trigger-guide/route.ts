import { NextRequest, NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { lineUserId, lang } = body;

        if (!lineUserId) {
            return NextResponse.json({ error: 'Missing lineUserId' }, { status: 400 });
        }

        const config = {
            channelSecret: process.env.LINE_CHANNEL_SECRET!,
            channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
        };
        const client = new line.messagingApi.MessagingApiClient(config);

        const text = lang === 'en'
            ? 'Please press the send button (paper plane icon) to send the code below!'
            : '下の入力欄にあるIDコードを、そのまま送信ボタン（紙飛行機マーク）を押して送信してください！';

        await client.pushMessage({
            to: lineUserId,
            messages: [{ type: 'text', text: text }]
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Trigger Guide Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
