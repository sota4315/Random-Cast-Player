import { NextRequest, NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'; // Use Admin Client via alias

// Config moved inside handler to ensure runtime env loading
// const config = { ... }
// const client = ...

export const dynamic = 'force-dynamic';

// Helper to get app_user_id
async function getAppUserId(lineUserId: string): Promise<string | null> {
    const { data } = await supabase
        .from('line_mappings')
        .select('app_user_id')
        .eq('line_user_id', lineUserId)
        .single();
    return data?.app_user_id || null;
}

// Handler for Search
async function handleSearch(client: any, replyToken: string, term: string) {
    try {
        const res = await fetch(`https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(term)}&limit=5`);
        const data = await res.json();

        if (!data.results || data.results.length === 0) {
            await client.replyMessage({
                replyToken: replyToken,
                messages: [{ type: 'text', text: '見つかりませんでした。別のキーワードで試してください。' }],
            });
            return;
        }

        // Create Flex Message Carousel
        const bubbles = data.results.map((item: any) => ({
            type: 'bubble',
            hero: {
                type: 'image',
                url: item.artworkUrl600 || item.artworkUrl100,
                size: 'full',
                aspectRatio: '1:1',
                aspectMode: 'cover',
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'text',
                        text: item.collectionName,
                        weight: 'bold',
                        size: 'md',
                        wrap: true,
                    },
                    {
                        type: 'text',
                        text: item.artistName,
                        size: 'xs',
                        color: '#888888',
                        wrap: true,
                        margin: 'sm',
                    },
                ],
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'button',
                        style: 'primary',
                        color: '#1DB446', // LINE Green
                        action: {
                            type: 'message',
                            label: '追加',
                            text: `番組追加 ${item.feedUrl} ${item.collectionName}`,
                        },
                    },
                ],
            },
        }));

        await client.replyMessage({
            replyToken: replyToken,
            messages: [{
                type: 'flex',
                altText: '検索結果',
                contents: {
                    type: 'carousel',
                    contents: bubbles,
                },
            }],
        });

    } catch (e) {
        console.error('Search Error:', e);
        await client.replyMessage({
            replyToken: replyToken,
            messages: [{ type: 'text', text: '検索中にエラーが発生しました。' }],
        });
    }
}

// Handler for Adding Channel
async function handleAddChannel(client: any, replyToken: string, lineUserId: string, url: string, title: string) {
    const appUserId = await getAppUserId(lineUserId);
    if (!appUserId) {
        await client.replyMessage({
            replyToken: replyToken,
            messages: [{ type: 'text', text: 'アカウントが連携されていません。"CONNECT <ID>" で連携してください。' }],
        });
        return;
    }

    const { error } = await supabase
        .from('channels')
        .insert({
            user_id: appUserId,
            rss_url: url,
        });

    if (error) {
        // 23505 is unique violation code if constraints exist
        console.error('Add Channel Error:', error);
        await client.replyMessage({
            replyToken: replyToken,
            messages: [{ type: 'text', text: '登録に失敗しました。（既に登録済みか、エラーが発生しました）' }],
        });
    } else {
        await client.replyMessage({
            replyToken: replyToken,
            messages: [{ type: 'text', text: `登録しました！\n${title}` }],
        });
    }
}

export async function POST(req: NextRequest) {
    const config = {
        channelSecret: process.env.LINE_CHANNEL_SECRET!,
        channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
    };
    const client = new line.messagingApi.MessagingApiClient(config);

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

            // Command Handlers

            // 1. CONNECT
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
            }
            // 2. Search Command
            else if (text.match(/^(検索|search)[\s　]+(.+)$/i)) {
                const term = text.match(/^(検索|search)[\s　]+(.+)$/i)![2];
                await handleSearch(client, event.replyToken, term);
            }
            // 3. Add Channel Command
            else if (text.startsWith('番組追加 ')) {
                // Format: "番組追加 <URL> <Title...>"
                const parts = text.split(/[\s　]+/);
                const url = parts[1];
                if (!url) return;
                const title = parts.slice(2).join(' ') || 'Unknown';
                await handleAddChannel(client, event.replyToken, lineUserId, url, title);
            }
            // 4. List Schedules
            else if (text.match(/^(リスト|一覧|list|予約確認)$/i)) {
                await handleListSchedules(client, event.replyToken, lineUserId);
            }
            // 5. Delete Schedule
            else if (text.startsWith('予約削除 ')) {
                const scheduleId = text.split(' ')[1];
                if (scheduleId) {
                    await handleDeleteSchedule(client, event.replyToken, lineUserId, scheduleId);
                }
            }
            // 6. Schedule Command (Legacy)
            else {
                const scheduleData = parseScheduleMessage(text);

                if (scheduleData) {
                    // Check Link
                    const appUserId = await getAppUserId(lineUserId);
                    if (!appUserId) {
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{ type: 'text', text: '先に連携してください。\nSend "CONNECT <ID>"' }],
                        });
                        return;
                    }

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
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{ type: 'text', text: '予約の保存に失敗しました。' }],
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
                            text: '【使い方】\n\n🔍 検索:\n"検索 <キーワード>"\n\n📅 予約:\n"月曜の8時にRebuild"\n\n🔗 連携:\n"CONNECT <ID>"\n\n📋 確認:\n"リスト"'
                        }],
                    });
                }
            }
        })
    );

    return NextResponse.json({ message: 'OK' });
}

// Handler for Listing Schedules
async function handleListSchedules(client: any, replyToken: string, lineUserId: string) {
    const { data: schedules, error } = await supabase
        .from('schedules')
        .select('*')
        .eq('line_user_id', lineUserId)
        .eq('is_active', true)
        .order('day_of_week')
        .order('hour');

    if (error) {
        console.error('List Schedules Error:', error);
        await client.replyMessage({
            replyToken: replyToken,
            messages: [{ type: 'text', text: '予約の取得に失敗しました。' }],
        });
        return;
    }

    if (!schedules || schedules.length === 0) {
        await client.replyMessage({
            replyToken: replyToken,
            messages: [{ type: 'text', text: '現在、予約はありません。' }],
        });
        return;
    }

    const days = ['日', '月', '火', '水', '木', '金', '土'];

    // Flex Message Rows
    const rows = schedules.map((item: any) => ({
        type: 'box',
        layout: 'horizontal',
        margin: 'md',
        contents: [
            {
                type: 'text',
                text: `${days[item.day_of_week]}曜 ${item.hour}:00`,
                size: 'sm',
                color: '#555555',
                flex: 3,
            },
            {
                type: 'text',
                text: item.keyword,
                size: 'sm',
                color: '#111111',
                weight: 'bold',
                flex: 4,
                wrap: true,
            },
            {
                type: 'button',
                style: 'secondary',
                height: 'sm',
                action: {
                    type: 'message',
                    label: '削除',
                    text: `予約削除 ${item.id}`,
                },
                flex: 2,
            }
        ],
        alignItems: 'center',
    }));

    await client.replyMessage({
        replyToken: replyToken,
        messages: [{
            type: 'flex',
            altText: '予約一覧',
            contents: {
                type: 'bubble',
                header: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        { type: 'text', text: '予約一覧', weight: 'bold', size: 'xl', color: '#1DB446' }
                    ]
                },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: rows
                }
            }
        }],
    });
}

// Handler for Deleting Schedule
async function handleDeleteSchedule(client: any, replyToken: string, lineUserId: string, scheduleId: string) {
    const { error } = await supabase
        .from('schedules')
        .delete()
        .eq('id', scheduleId)
        .eq('line_user_id', lineUserId); // Safety check

    if (error) {
        console.error('Delete Schedule Error:', error);
        await client.replyMessage({
            replyToken: replyToken,
            messages: [{ type: 'text', text: '削除に失敗しました。' }],
        });
    } else {
        await client.replyMessage({
            replyToken: replyToken,
            messages: [{ type: 'text', text: '予約を削除しました。' }],
        });
    }
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
