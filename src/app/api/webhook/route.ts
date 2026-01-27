import { NextRequest, NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

const MSG = {
    ja: {
        welcome: '友だち追加ありがとうございます！🎉',
        desc: 'Random Cast Player Botへようこそ。',
        link_title: 'まずはアカウントを連携しましょう。',
        link_msg: '下のボタンからWebアプリを開き、設定画面の「LINE連携を再実行」ボタンを押してください。',
        btn_label: 'Webアプリを開く'
    },
    en: {
        welcome: 'Thanks for adding me! 🎉',
        desc: 'Welcome to Random Cast Player Bot.',
        link_title: 'Let\'s link your account.',
        link_msg: 'Tap the button below to open the Web App, then tap "Reconnect LINE" in Settings.',
        btn_label: 'Open Web App'
    }
};

// Handler for Follow Event (Language Selection)
async function handleFollow(client: any, replyToken: string) {
    await client.replyMessage({
        replyToken: replyToken,
        messages: [
            {
                type: 'flex',
                altText: 'Select Language',
                contents: {
                    type: 'bubble',
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            { type: 'text', text: 'Select Language', weight: 'bold', size: 'lg', align: 'center' },
                            { type: 'text', text: '言語を選択してください', size: 'xs', color: '#aaaaaa', align: 'center', margin: 'sm' },
                            { type: 'separator', margin: 'md' },
                            {
                                type: 'box',
                                layout: 'vertical',
                                spacing: 'sm',
                                margin: 'lg',
                                contents: [
                                    {
                                        type: 'button',
                                        style: 'primary',
                                        action: { type: 'postback', label: '🇯🇵 日本語', data: 'action=set_lang&lang=ja' }
                                    },
                                    {
                                        type: 'button',
                                        style: 'secondary',
                                        action: { type: 'postback', label: '🇺🇸 English', data: 'action=set_lang&lang=en' }
                                    }
                                ]
                            }
                        ]
                    }
                }
            }
        ]
    });
}

// Handler for Postback
async function handlePostback(client: any, replyToken: string, lineUserId: string, dataParams: string) {
    const params = new URLSearchParams(dataParams);
    const action = params.get('action');

    if (action === 'set_lang') {
        const lang = params.get('lang') || 'ja';

        // Save Language Setting
        // User must create 'line_users' table in Supabase
        await supabase.from('line_users').upsert({ line_user_id: lineUserId, language: lang });

        // Send Guide
        await sendLinkGuide(client, replyToken, lang);
    }
}

// Send Link Guide with specific language
async function sendLinkGuide(client: any, replyToken: string, lang: string) {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    const liffUrl = liffId
        ? `https://liff.line.me/${liffId}?open=settings&lang=${lang}`
        : `https://random-cast-player.vercel.app/?open=settings&lang=${lang}`;

    const m = (MSG as any)[lang] || MSG.ja;

    await client.replyMessage({
        replyToken: replyToken,
        messages: [
            {
                type: 'flex',
                altText: m.link_title,
                contents: {
                    type: 'bubble',
                    body: {
                        type: 'box',
                        layout: 'vertical',
                        contents: [
                            { type: 'text', text: m.welcome, weight: 'bold', size: 'md' },
                            { type: 'text', text: m.desc, size: 'sm', margin: 'sm', color: '#666666' },
                            { type: 'separator', margin: 'lg' },
                            { type: 'text', text: m.link_title, margin: 'lg', weight: 'bold' },
                            { type: 'text', text: m.link_msg, margin: 'md', size: 'sm', wrap: true }
                        ]
                    },
                    footer: {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'sm',
                        contents: [
                            {
                                type: 'button',
                                style: 'primary',
                                height: 'sm',
                                action: {
                                    type: 'uri',
                                    label: m.btn_label,
                                    uri: liffUrl
                                },
                                color: '#9333ea'
                            }
                        ],
                        flex: 0
                    }
                }
            }
        ],
    });
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
            messages: [
                { type: 'text', text: `「${title}」を登録しました！` },
                {
                    type: 'text',
                    text: 'この番組をいつ自動再生しますか？\n\n「月曜8時に再生」\n「毎朝7時に予約」\n\nのように話しかけて教えてください。'
                }
            ],
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
                // Handle Follow Event
                if (event.type === 'follow') {
                    if ('replyToken' in event) {
                        await handleFollow(client, event.replyToken);
                    }
                    return;
                }

                // Handle Postback Event
                if (event.type === 'postback') {
                    if (event.source.userId && event.postback.data) {
                        await handlePostback(client, event.replyToken, event.source.userId, event.postback.data);
                    }
                    return;
                }

                if (event.type !== 'message' || event.message.type !== 'text') {
                    return;
                }

                const text = event.message.text.trim();
                const lineUserId = event.source.userId;

                if (!lineUserId) return;

                // Command Handlers

                // 1. CONNECT
                if (text.startsWith('CONNECT ') || text.match(/^[0-9a-f-]{36}$/i)) { // Allow raw UUID sending
                    const appUserId = text.replace('CONNECT ', '').trim();
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
                            messages: [{ type: 'text', text: '連携に失敗しました。もう一度試してください。' }],
                        });
                    } else {
                        await client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [
                                { type: 'text', text: '連携が完了しました！✨' },
                                { type: 'text', text: '次に、どんな番組を登録しますか？\n番組名を入力して送信してください（例: Rebuild, ニュース）' }
                            ],
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
                // 8. Schedule / Search Fallback
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
                        // Fallback: AI Determine
                        const intent = await determineIntentOrChat(text);

                        if (intent.type === 'schedule') {
                            // Handle AI-detected schedule intent
                            const appUserId = await getAppUserId(lineUserId);
                            if (!appUserId) {
                                await client.replyMessage({
                                    replyToken: event.replyToken,
                                    messages: [{ type: 'text', text: '先に連携してください。\nSend "CONNECT <ID>"' }],
                                });
                                return;
                            }

                            const { dayOfWeek, hour, minute, keyword, message } = intent;
                            const { error } = await supabase
                                .from('schedules')
                                .insert({
                                    line_user_id: lineUserId,
                                    keyword: keyword,
                                    day_of_week: dayOfWeek,
                                    hour: hour,
                                    minute: minute,
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
                                const timeStr = `${hour}:${String(minute).padStart(2, '0')}`;
                                await client.replyMessage({
                                    replyToken: event.replyToken,
                                    messages: [{
                                        type: 'text',
                                        text: `${message}\n\n📻 番組: ${keyword}\n🗓 時間: ${days[dayOfWeek]}曜日 ${timeStr}`
                                    }],
                                });
                            }
                        } else if (intent.type === 'search') {
                            await handleSearch(client, event.replyToken, intent.content);
                        } else {
                            // Chat Response (type === 'talk')
                            await client.replyMessage({
                                replyToken: event.replyToken,
                                messages: [{ type: 'text', text: intent.content }]
                            });
                        }
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
                                    type: 'uri',
                                    label: 'Search',
                                    // Insert a space to trigger input field open
                                    uri: 'https://line.me/R/oaMessage/' + (process.env.LINE_BOT_ID || '@dummy') + '/?%20'
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
        // ... (rest of the file remains, moving to the next chunk for the logic change)

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

// AI Intent Type
type AIIntent =
    | { type: 'search', content: string }
    | { type: 'talk', content: string }
    | { type: 'schedule', dayOfWeek: number, hour: number, minute: number, keyword: string, message: string };

// AI Helper - Now supports SCHEDULE intent
async function determineIntentOrChat(text: string): Promise<AIIntent> {
    if (!process.env.GEMINI_API_KEY) {
        console.warn('GEMINI_API_KEY is missing.');
        return { type: 'talk', content: '⚠️ Developer: GEMINI_API_KEY is not set in Vercel environment variables.' };
    }

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        // Get current time in JST (UTC+9)
        const now = new Date();
        const jstOffset = 9 * 60; // JST is UTC+9
        const jstTime = new Date(now.getTime() + (jstOffset + now.getTimezoneOffset()) * 60000);
        const currentDay = jstTime.getDay(); // 0=Sun, 1=Mon, ...
        const currentHour = jstTime.getHours();
        const currentMinute = jstTime.getMinutes();
        const currentDate = jstTime.getDate();
        const currentMonth = jstTime.getMonth() + 1;

        const prompt = `You are a Radio DJ bot. Classify and respond with ONLY the format. No explanations.

User: "${text}"
Now: ${currentMonth}/${currentDate} (day_of_week=${currentDay}, 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat), ${currentHour}:${String(currentMinute).padStart(2, '0')} JST

RULES:
1. SCHEDULE - Time-based playback request (X時Y分, X:Y, 朝, 夜, 再生, かけて)
   - Calculate correct day_of_week from date if given (e.g., "1/27" → check what day it is)
   - Support minutes: "12時45分" → hour=12, minute=45
   - If only hour given, minute=0
   - If time already passed today, use tomorrow
   - Output: SCHEDULE:{"day_of_week":N,"hour":H,"minute":M,"keyword":"ランダム","message":"確認"}

2. SEARCH - Find podcast (検索, 探して, find + keyword)
   - Output: SEARCH:keyword

3. TALK - Chat/greeting
   - Output: TALK:response

ONE LINE ONLY. NO MARKDOWN.`;

        const result = await model.generateContent(prompt);
        const response = result.response.text().trim();

        console.log('Gemini Response:', response);

        // Parse SCHEDULE intent - handle various formats
        const scheduleMatch = response.match(/SCHEDULE:\s*(\{[\s\S]*?\})/);
        if (scheduleMatch) {
            try {
                const parsed = JSON.parse(scheduleMatch[1]);
                return {
                    type: 'schedule',
                    dayOfWeek: parsed.day_of_week,
                    hour: parsed.hour,
                    minute: parsed.minute || 0,
                    keyword: parsed.keyword || 'ランダム',
                    message: parsed.message || '予約しました！'
                };
            } catch (parseErr) {
                console.error('Failed to parse SCHEDULE JSON:', parseErr, response);
                return { type: 'talk', content: '予約は「8時に再生」のように時刻で指定してください。' };
            }
        }

        // Parse SEARCH intent
        const searchMatch = response.match(/SEARCH:\s*(.+)/);
        if (searchMatch) {
            return { type: 'search', content: searchMatch[1].trim() };
        }

        // Parse TALK intent
        const talkMatch = response.match(/TALK:\s*(.+)/);
        if (talkMatch) {
            return { type: 'talk', content: talkMatch[1].trim() };
        }

        // Fallback
        return { type: 'talk', content: response };
    } catch (e: any) {
        console.error('Gemini Error:', e);
        return { type: 'talk', content: `⚠️ System Error: ${e.message || String(e)}` };
    }
}
