import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
        return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // 1. App User ID から LINE User ID を取得
    const { data: mapping, error: mappingError } = await supabase
        .from('line_mappings')
        .select('line_user_id')
        .eq('app_user_id', userId)
        .single();

    if (mappingError || !mapping) {
        // 連携していない、またはユーザーが見つからない場合は空配列を返す
        return NextResponse.json([]);
    }

    // 2. LINE User ID に紐づく予約を取得
    const { data: schedules, error: schedulesError } = await supabase
        .from('schedules')
        .select('*')
        .eq('line_user_id', mapping.line_user_id)
        .eq('is_active', true)
        .order('day_of_week')
        .order('hour');

    if (schedulesError) {
        return NextResponse.json({ error: schedulesError.message }, { status: 500 });
    }

    return NextResponse.json(schedules);
}

export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const userId = searchParams.get('userId');

    if (!id || !userId) {
        return NextResponse.json({ error: 'ID and User ID are required' }, { status: 400 });
    }

    // 権限チェック: 削除しようとしている予約が、リクエストしたユーザーのLINE IDと一致するか確認
    const { data: mapping } = await supabase
        .from('line_mappings')
        .select('line_user_id')
        .eq('app_user_id', userId)
        .single();

    if (!mapping) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { error } = await supabase
        .from('schedules')
        .delete()
        .eq('id', id)
        .eq('line_user_id', mapping.line_user_id); // 所有権の確認

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Deleted' });
}
