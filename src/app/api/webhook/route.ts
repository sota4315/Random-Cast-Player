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
    // console.log(`Loaded Secret: ${config.channelSecret.slice(0, 4)}***${config.channelSecret.slice(-4)}`);

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
                // Parse schedule command
                // Pattern: "月曜の8時にRebuild" or "日曜10時 ニュース"
                const scheduleData = parseScheduleMessage(text);

                if (scheduleData) {
                    const { dayOfWeek, hour, keyword } = scheduleData;

                    // Supabaseに保存
                    const { error } = await supabase
                        .from('schedules')
                        .insert({
                            line_user_id: lineUserId,
                            keyword: keyword,
                            day_of_week: dayOfWeek,
                            hour: hour,
                            minute: 0, // 今は0分固定
                            is_active: true
                        });

                    if (error) {
                        console.error('Schedule Save Error:', error);
                        // Debug: Send actual error to LINE
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{ type: 'text', text: `予約失敗エラー:\n${error.message}\nCode: ${error.code}` }],
                        });
                    } else {
                        const days = ['日', '月', '火', '水', '木', '金', '土'];
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{ type: 'text', text: `予約しました！\n番組: ${keyword}\n時間: ${days[dayOfWeek]}曜日 ${hour}:00` }],
                        });
                    }
                } else {
                    // Help message
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{
                            type: 'text',
                            text: '【使い方】\n\n1. 連携\n"CONNECT <ID>" を送信\n\n2. 予約\n"月曜の8時にRebuild" のように送信してください。\n(対応: 月〜日, 0-23時)'
                        }],
                    });
                }
            }

            // ... (rest of the file)
        })
    );

    return NextResponse.json({ message: 'OK' });
}

// Helper to parse message
function parseScheduleMessage(text: string): { dayOfWeek: number, hour: number, keyword: string } | null {
    // Regex: (Day)曜? (Hour)時 (Keyword)
    // Matches: "月曜の8時にRebuild", "月曜8時 Rebuild", etc.
    const regex = /([月火水木金土日])曜日?の?[\s　]*(\d{1,2})時に?[\s　]*(.+)/;
    const match = text.match(regex);

    if (!match) return null;

    const dayChar = match[1];
    const hourStr = match[2];
    // Remove typical suffixes like "を再生して", "を予約"
    let keyword = match[3].replace(/(を(再生|予約|かけて)?(して)?)$/, '').trim();

    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const dayOfWeek = days.indexOf(dayChar);
    const hour = parseInt(hourStr, 10);

    if (dayOfWeek === -1 || isNaN(hour) || hour < 0 || hour > 23 || !keyword) return null;

    return { dayOfWeek, hour, keyword };
}
