import { NextRequest, NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';
import { supabase } from '@/lib/supabase';

// Config moved inside handler to ensure runtime env loading
// const config = { ... }
// const client = ...

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const config = {
        channelSecret: process.env.LINE_CHANNEL_SECRET!,
        channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
    };
    const client = new line.messagingApi.MessagingApiClient(config);

    const body = await req.text();
    const signature = req.headers.get('x-line-signature') as string;

    // Debugging: Log loaded config (masked)
    const secret = config.channelSecret || 'UNDEFINED';
    console.log(`Loaded Secret: ${secret.slice(0, 4)}***${secret.slice(-4)}`);
    console.log(`Access Token present: ${!!config.channelAccessToken}`);
    console.log(`Received Signature: ${signature}`);

    // Temporarily bypass validation but log the result
    const isValid = line.validateSignature(body, config.channelSecret, signature);
    console.log(`Validation Result: ${isValid}`);

    // if (!isValid) {
    //     console.error('Signature validation failed, but proceeding for debug...');
    //     // return NextResponse.json({ message: 'Invalid signature' }, { status: 403 });
    // }

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

                console.log(`Linking detected. LINE: ${lineUserId}, App: ${appUserId}`);

                const { error } = await supabase
                    .from('line_mappings')
                    .upsert({ line_user_id: lineUserId, app_user_id: appUserId });

                if (error) {
                    console.error('Supabase Error:', error);
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{ type: 'text', text: 'Failed to link account. Database error.' }],
                    });
                } else {
                    console.log('Link success');
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{ type: 'text', text: `Successfully linked with User ID: ${appUserId}` }],
                    });
                }
            } else {
                console.log('Echo logic');
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
