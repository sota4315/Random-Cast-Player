import { NextRequest, NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';
import { supabase } from '@/lib/supabase';

const config = {
    channelSecret: process.env.LINE_CHANNEL_SECRET || 'dummy-secret',
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'dummy-token',
};

const client = new line.messagingApi.MessagingApiClient(config);

export async function POST(req: NextRequest) {
    const body = await req.text();
    const signature = req.headers.get('x-line-signature') as string;

    if (!line.validateSignature(body, config.channelSecret, signature)) {
        return NextResponse.json({ message: 'Invalid signature' }, { status: 403 });
    }

    const events: line.WebhookEvent[] = JSON.parse(body).events;

    await Promise.all(
        events.map(async (event) => {
            if (event.type !== 'message' || event.message.type !== 'text') {
                return;
            }

            const text = event.message.text.trim();
            const lineUserId = event.source.userId;

            if (!lineUserId) return;

            // Command: CONNECT <APP_USER_ID>
            if (text.startsWith('CONNECT ')) {
                const appUserId = text.split(' ')[1];
                if (!appUserId) {
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{ type: 'text', text: 'Invalid format. Use: CONNECT <Your-ID>' }],
                    });
                    return;
                }

                const { error } = await supabase
                    .from('line_mappings')
                    .upsert({ line_user_id: lineUserId, app_user_id: appUserId });

                if (error) {
                    console.error(error);
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{ type: 'text', text: 'Failed to link account.' }],
                    });
                } else {
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{ type: 'text', text: `Successfully linked with User ID: ${appUserId}` }],
                    });
                }
            } else {
                // Echo or help
                await client.replyMessage({
                    replyToken: event.replyToken,
                    messages: [{ type: 'text', text: 'Send "CONNECT <ID>" to link your account.' }],
                });
            }
        })
    );

    return NextResponse.json({ message: 'OK' });
}
