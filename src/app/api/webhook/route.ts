import { NextRequest, NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

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
                        color: '#1DB446',
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
            try {
                if (event.type !== 'message' || event.message.type !== 'text') {
                    return;
                }

                const text = event.message.text.trim();
                const lineUserId = event.source.userId;

                if (!lineUserId) return;

                // Command Handlers

                // 1. CONNECT
                if (text.startsWith('CONNECT ')) {
                    // ... (省略なし) コマンドロジックは前のままだが、ここにtry-catchが入ることで安全になる
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
                        console.error('Supabase Error:', error);
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{ type: 'text', text: 'Failed to link account. Database error.' }],
                        });
                    } else {
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{ type: 'text', text: `Successfully linked with User ID: ${appUserId}` }],
                        });
                    }
                }
                // 2. Search Command (Real Search)
                else if (text.match(/^(検索|search)[\s　]+(.+)$/i)) {
                    const term = text.match(/^(検索|search)[\s　]+(.+)$/i)![2];
                    await handleSearch(client, event.replyToken, term);
                }
                // 2.1 Search Prompt (Just "検索")
                else if (text === '検索' || text === 'search') {
                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{ type: 'text', text: '番組を検索するには\n「検索 <キーワード>」\nと送信してください。\n例: 検索 Rebuild' }],
                    });
                }
                // 3. Add Channel Command
                else if (text.startsWith('番組追加 ')) {
                    const parts = text.split(/[\s　]+/);
                    const url = parts[1];
                    if (!url) return;
                    const title = parts.slice(2).join(' ') || 'Unknown';
                    await handleAddChannel(client, event.replyToken, lineUserId, url, title);
                }
                // 4. List Channels (Manage Channels)
                else if (text.match(/^(リスト|一覧|list)$/i)) {
                    await handleListChannels(client, event.replyToken, lineUserId);
                }
                // 5. Delete Channel
                else if (text.startsWith('番組削除 ')) {
                    const channelId = text.split(' ')[1];
                    if (channelId) {
                        await handleDeleteChannel(client, event.replyToken, lineUserId, channelId);
                    }
                }
                // 6. List Schedules
                else if (text.match(/^(予約確認|予約一覧)$/i)) {
                    await handleListSchedules(client, event.replyToken, lineUserId);
                }
                // 7. Delete Schedule
                else if (text.startsWith('予約削除 ')) {
                    const scheduleId = text.split(' ')[1];
                    if (scheduleId) {
                        await handleDeleteSchedule(client, event.replyToken, lineUserId, scheduleId);
                    }
                }
                // 8. Schedule / Help
                else {
                    const scheduleData = parseScheduleMessage(text);
                    if (scheduleData) {
                        const appUserId = await getAppUserId(lineUserId);
                        if (!appUserId) {
                            await client.replyMessage({
                                replyToken: event.replyToken,
                                messages: [{ type: 'text', text: '先に連携してください。\nSend "CONNECT <ID>"' }],
                            });
                            return;
                        }
                        const { dayOfWeek, hour, keyword } = scheduleData;
                        const { error } = await supabase
                            .from('schedules')
                            .insert({
                                line_user_id: lineUserId,
                                keyword: keyword,
                                day_of_week: dayOfWeek,
                                hour: hour,
                                minute: 0,
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
                                text: '【使い方】\n\n🔍 検索:\n"検索 <キーワード>"\n\n📅 予約:\n"月曜の8時にRebuild"\n\n🔗 連携:\n"CONNECT <ID>"'
                            }],
                        });
                    }
                }
            } catch (err: any) {
                console.error('Webhook Event Error:', err);
                try {
                    // Type guard for replyToken
                    if ('replyToken' in event) {
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{ type: 'text', text: 'エラーが発生しました。\n' + (err.message || '') }],
                        });
                    }
                } catch (replyErr) {
                    console.error('Failed to reply error message:', replyErr);
                }
            }
        })
    );

    return NextResponse.json({ message: 'OK' });
}

// Handler for Listing Channels
async function handleListChannels(client: any, replyToken: string, lineUserId: string) {
    try {
        const appUserId = await getAppUserId(lineUserId);
        if (!appUserId) {
            await client.replyMessage({
                replyToken: replyToken,
                messages: [{ type: 'text', text: '連携されていません。"CONNECT <ID>" を送信してください。' }],
            });
            return;
        }

        const { data: channels, error } = await supabase
            .from('channels')
            .select('*')
            .eq('user_id', appUserId);

        if (error) {
            throw error;
        }

        const rows = channels && channels.length > 0 ? channels.map((item: any) => ({
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
                {
                    type: 'text',
                    text: item.rss_url || 'No URL',
                    size: 'xs',
                    color: '#555555',
                    flex: 4,
                    wrap: true,
                    maxLines: 2,
                },
                {
                    type: 'button',
                    style: 'secondary',
                    height: 'sm',
                    action: {
                        type: 'message',
                        label: '削除',
                        text: `番組削除 ${item.id}`,
                    },
                    flex: 1,
                }
            ],
            alignItems: 'center',
        })) : [
            {
                type: 'text',
                text: '登録番組はありません。',
                size: 'sm',
                color: '#999999',
                wrap: true,
                align: 'center'
            }
        ];

        await client.replyMessage({
            replyToken: replyToken,
            messages: [{
                type: 'flex',
                altText: '番組管理',
                contents: {
                    type: 'bubble',
                    header: {
                        type: 'box',
                        layout: 'vertical',
                        paddingAll: 'lg',
                        backgroundColor: '#f8f8f8',
                        contents: [
                            { text: '番組管理', type: 'text', weight: 'bold', size: 'lg', color: '#111111' },
                            {
                                type: 'text',
                                text: '登録済みの番組一覧',
                                size: 'xs',
                                color: '#888888',
                                margin: 'sm'
                            },
                            // Search Button (Message Action)
                            {
                                type: 'box',
                                layout: 'horizontal',
                                margin: 'lg',
                                backgroundColor: '#ffffff',
                                cornerRadius: '20px',
                                paddingAll: 'md',
                                borderColor: '#dddddd',
                                borderWidth: 'light',
                                action: {
                                    type: 'message',
                                    label: 'Search',
                                    text: '検索' // Triggers the search prompt
                                },
                                contents: [
                                    { type: 'text', text: '🔍 番組を検索する...', color: '#cccccc', size: 'sm' }
                                ]
                            }
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
    } catch (e: any) {
        console.error('List Channels Error:', e);
        await client.replyMessage({
            replyToken: replyToken,
            messages: [{ type: 'text', text: 'リストの取得中にエラーが発生しました: ' + (e.message || '') }],
        });
    }
}

// Handler for Deleting Channel
async function handleDeleteChannel(client: any, replyToken: string, lineUserId: string, channelId: string) {
    // ... (same as before) ...
    const appUserId = await getAppUserId(lineUserId);
    if (!appUserId) return;

    const { error } = await supabase
        .from('channels')
        .delete()
        .eq('id', channelId)
        .eq('user_id', appUserId);

    if (error) {
        await client.replyMessage({
            replyToken: replyToken,
            messages: [{ type: 'text', text: '削除に失敗しました。' }],
        });
    } else {
        await client.replyMessage({
            replyToken: replyToken,
            messages: [{ type: 'text', text: '番組を削除しました。' }],
        });
    }
}

// ... handleListSchedules, handleDeleteSchedule, parseScheduleMessage は変更なし ...
async function handleListSchedules(client: any, replyToken: string, lineUserId: string) {
    const { data: schedules, error } = await supabase
        .from('schedules')
        .select('*')
        .eq('line_user_id', lineUserId)
        .eq('is_active', true)
        .order('day_of_week')
        .order('hour');

    if (error) {
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
async function handleDeleteSchedule(client: any, replyToken: string, lineUserId: string, scheduleId: string) {
    const { error } = await supabase
        .from('schedules')
        .delete()
        .eq('id', scheduleId)
        .eq('line_user_id', lineUserId);
    if (error) {
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
function parseScheduleMessage(text: string): { dayOfWeek: number, hour: number, keyword: string } | null {
    const regex = /([月火水木金土日])曜日?の?[\s　]*(\d{1,2})時に?[\s　]*(.+)/;
    const match = text.match(regex);
    if (!match) return null;
    const dayChar = match[1];
    const hourStr = match[2];
    let keyword = match[3].replace(/(を(再生|予約|かけて)?(して)?)$/, '').trim();
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const dayOfWeek = days.indexOf(dayChar);
    const hour = parseInt(hourStr, 10);
    if (dayOfWeek === -1 || isNaN(hour) || hour < 0 || hour > 23 || !keyword) return null;
    return { dayOfWeek, hour, keyword };
}
