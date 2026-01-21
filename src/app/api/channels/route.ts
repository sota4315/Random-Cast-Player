import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
        return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const { data: channels, error } = await supabase
        .from('channels')
        .select('id, rss_url')
        .eq('user_id', userId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(channels.map(c => ({ id: c.id, url: c.rss_url })));
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { userId, url } = body;

    if (!userId || !url) {
        return NextResponse.json({ error: 'Missing userId or url' }, { status: 400 });
    }

    // 重複チェックなどはSupabase側の制約に任せるか、ここでチェック
    // Webhook側と同様の処理

    const { data, error } = await supabase
        .from('channels')
        .insert({ user_id: userId, rss_url: url })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id, url: data.rss_url });
}

export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const userId = searchParams.get('userId');

    if (!id || !userId) {
        return NextResponse.json({ error: 'Missing id or userId' }, { status: 400 });
    }

    const { error } = await supabase
        .from('channels')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Deleted' });
}
