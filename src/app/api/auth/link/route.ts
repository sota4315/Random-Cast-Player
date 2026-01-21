
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { lineUserId, currentAppUserId } = body;

        if (!lineUserId) {
            return NextResponse.json({ error: 'Line User ID is required' }, { status: 400 });
        }

        // 1. Check if mapping already exists
        const { data: mapping, error } = await supabase
            .from('line_mappings')
            .select('app_user_id')
            .eq('line_user_id', lineUserId)
            .single();

        if (mapping) {
            // Found existing link, return the associated app_user_id
            return NextResponse.json({ appUserId: mapping.app_user_id, isNew: false });
        }

        // 2. No link exists. Create a new one.
        // If the client sent a currentAppUserId (from localStorage), allow linking to it if it's not taken?
        // For simplicity and allowing data carry-over: Use currentAppUserId if provided, otherwise generate new.

        const appUserIdToLink = currentAppUserId || randomUUID();

        const { error: insertError } = await supabase
            .from('line_mappings')
            .upsert({
                line_user_id: lineUserId,
                app_user_id: appUserIdToLink
            });

        if (insertError) {
            console.error('Link Error:', insertError);
            return NextResponse.json({ error: 'Failed to create link' }, { status: 500 });
        }

        return NextResponse.json({ appUserId: appUserIdToLink, isNew: true });

    } catch (e: any) {
        console.error('Auth Link Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
