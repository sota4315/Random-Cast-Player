import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import * as line from '@line/bot-sdk';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    // 1. Security Check
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');
    if (key !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // 2. Get Current Time (JST)
        // Vercel runs in UTC. We need to convert to JST (UTC+9).
        const now = new Date();
        // Add 9 hours
        now.setHours(now.getHours() + 9);

        const currentDay = now.getDay(); // 0-6 (Sun-Sat)
        const currentHour = now.getHours(); // 0-23

        console.log(`Checking schedules for Day: ${currentDay}, Hour: ${currentHour} (JST)`);

        // 3. Find matching schedules
        const { data: schedules, error } = await supabaseAdmin
            .from('schedules')
            .select(`
                id,
                user_id,
                keyword,
                day_of_week,
                hour
            `)
            .eq('day_of_week', currentDay)
            .eq('hour', currentHour)
            .eq('is_active', true);

        if (error) throw error;
        if (!schedules || schedules.length === 0) {
            return NextResponse.json({ message: 'No schedules found for this hour.' });
        }

        // 4. Get LINE User IDs
        // Collect app_user_ids
        const appUserIds = Array.from(new Set(schedules.map((s: any) => s.user_id)));

        // Fetch mappings
        const { data: mappings, error: mapError } = await supabaseAdmin
            .from('line_mappings')
            .select('line_user_id, app_user_id')
            .in('app_user_id', appUserIds);

        if (mapError) throw mapError;

        // Map app_user_id -> line_user_id
        const userMap = new Map<string, string>();
        mappings?.forEach(m => userMap.set(m.app_user_id, m.line_user_id));

        // 5. Send Push Messages
        const config = {
            channelSecret: process.env.LINE_CHANNEL_SECRET!,
            channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
        };
        const client = new line.messagingApi.MessagingApiClient(config);
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

        const results = await Promise.all(schedules.map(async (schedule) => {
            const lineUserId = userMap.get(schedule.user_id);
            if (!lineUserId) return { status: 'skipped', reason: 'No LINE ID found', id: schedule.id };

            // Construct Flex Message
            // Link to Web App with alarm trigger
            // Using &alarm=... parameter to trigger specific alarm? 
            // Or just open web app and let the client logic handle it (client checks time).
            // But if user opens it 10 mins late, client logic might accept or reject depending on tolerance.
            // Let's pass ?autoplay=true to force trigger.

            const url = liffId
                ? `https://liff.line.me/${liffId}?autoplay=true`
                : `https://random-cast-player.vercel.app/?autoplay=true`;

            try {
                await client.pushMessage({
                    to: lineUserId,
                    messages: [{
                        type: 'flex',
                        altText: `時間になりました: ${schedule.keyword}`,
                        contents: {
                            type: 'bubble',
                            body: {
                                type: 'box',
                                layout: 'vertical',
                                contents: [
                                    { type: 'text', text: '時間になりました！⏰', weight: 'bold', size: 'sm', color: '#1DB446' },
                                    { type: 'text', text: schedule.keyword, weight: 'bold', size: 'xl', margin: 'md', wrap: true },
                                    { type: 'text', text: '再生の準備ができています。', size: 'xs', color: '#aaaaaa', margin: 'sm' }
                                ]
                            },
                            footer: {
                                type: 'box',
                                layout: 'vertical',
                                contents: [
                                    {
                                        type: 'button',
                                        style: 'primary',
                                        color: '#9333ea',
                                        action: {
                                            type: 'uri',
                                            label: 'Webアプリで再生',
                                            uri: url
                                        }
                                    }
                                ]
                            }
                        }
                    }]
                });
                return { status: 'sent', id: schedule.id };
            } catch (e: any) {
                console.error(`Failed to push to ${lineUserId}`, e);
                return { status: 'failed', error: e.message, id: schedule.id };
            }
        }));

        return NextResponse.json({
            success: true,
            processed: results.length,
            results
        });

    } catch (e: any) {
        console.error('Cron Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
