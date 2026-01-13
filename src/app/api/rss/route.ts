import Parser from 'rss-parser';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const rssUrl = searchParams.get('url');

    if (!rssUrl) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    const parser = new Parser();

    try {
        const feed = await parser.parseURL(rssUrl);
        return NextResponse.json(feed);
    } catch (error) {
        console.error('RSS Parsing Error:', error);
        return NextResponse.json({ error: 'Failed to parse RSS' }, { status: 500 });
    }
}
