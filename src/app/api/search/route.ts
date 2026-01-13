import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const term = searchParams.get('term');

    if (!term) {
        return NextResponse.json({ error: 'Missing search term' }, { status: 400 });
    }

    try {
        const itunesUrl = `https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(term)}&limit=10`;
        const response = await fetch(itunesUrl);

        if (!response.ok) {
            throw new Error(`iTunes API error: ${response.status}`);
        }

        const data = await response.json();

        // 必要なデータだけ整形して返す
        const results = data.results.map((item: any) => ({
            collectionName: item.collectionName,
            artistName: item.artistName,
            feedUrl: item.feedUrl,
            artworkUrl100: item.artworkUrl100
        })).filter((item: any) => item.feedUrl); // feedUrlがないものは除外

        return NextResponse.json({ results });

    } catch (error) {
        console.error('Search Error:', error);
        return NextResponse.json({ error: 'Failed to search podcasts' }, { status: 500 });
    }
}
