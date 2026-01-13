'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Loader2, Radio, Info } from 'lucide-react';

// RSS Feed List
const RSS_LIST = [
    "https://anchor.fm/s/100b7bfdc/podcast/rss",
    "https://feeds.acast.com/public/shows/65a19d6398c1070016f3e0f8",
    "https://anchor.fm/s/5828a764/podcast/rss",
    "https://anchor.fm/s/c4dbbf54/podcast/rss",
    "https://feeds.rebuild.fm/rebuildfm"
];

type Episode = {
    title: string;
    enclosure: { url: string };
    pubDate: string;
};

type PlayerState = 'idle' | 'loading' | 'playing' | 'error';

export default function Home() {
    const [playerState, setPlayerState] = useState<PlayerState>('idle');
    const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [isRecent, setIsRecent] = useState<boolean>(false);
    const audioRef = useRef<HTMLAudioElement>(null);

    const startRadio = async () => {
        setPlayerState('loading');
        setErrorMessage('');

        try {
            // 1. Pick a random RSS
            const randomRss = RSS_LIST[Math.floor(Math.random() * RSS_LIST.length)];

            // 2. Fetch via our API route to avoid CORS
            const res = await fetch(`/api/rss?url=${encodeURIComponent(randomRss)}`);
            if (!res.ok) throw new Error('Failed to fetch RSS feed');

            const feed = await res.json();
            const items = feed.items as any[]; // rss-parser returns items array

            if (!items || items.length === 0) {
                throw new Error('No episodes found in feed');
            }

            // 3. Filter last 1 year
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

            const recentItems = items.filter((item: any) => {
                return item.pubDate && new Date(item.pubDate) >= oneYearAgo;
            });

            let targetList = recentItems;
            let recentFlag = true;

            // Fallback to all items if no recent ones
            if (recentItems.length === 0) {
                targetList = items;
                recentFlag = false;
            }

            // 4. Pick random episode
            const randomEpisode = targetList[Math.floor(Math.random() * targetList.length)];

            if (!randomEpisode.enclosure?.url) {
                // Retry logic could go here, but for now just error
                throw new Error('Episode audio source not found. Please try again.');
            }

            setCurrentEpisode({
                title: randomEpisode.title,
                enclosure: { url: randomEpisode.enclosure.url },
                pubDate: randomEpisode.pubDate
            });
            setIsRecent(recentFlag);

            // 5. Play
            if (audioRef.current) {
                audioRef.current.src = randomEpisode.enclosure.url;
                audioRef.current.volume = 0.5;
                // Wait for ready state before playing causing issues in some browsers?
                // simple play() is usually enough after src change
                await audioRef.current.play();
                setPlayerState('playing');
            }

        } catch (error: any) {
            console.error(error);
            setPlayerState('error');
            setErrorMessage(error.message || 'Something went wrong');
        }
    };

    // Keyboard shortcut
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && playerState !== 'loading' && playerState !== 'playing') {
                startRadio();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [playerState]);

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-black text-gray-200 selection:bg-gray-800">
            <audio ref={audioRef} onEnded={() => setPlayerState('idle')} onError={() => setPlayerState('error')} />

            <div className="max-w-md w-full flex flex-col items-center space-y-12 text-center">

                {/* Header */}
                <header className="space-y-2">
                    <div className="flex items-center justify-center gap-2 mb-4">
                        <Radio className="w-6 h-6 text-gray-400" />
                    </div>
                    <h1 className="text-xl tracking-[0.2em] text-gray-500 font-light">
                        MY NIGHT RADIO
                    </h1>
                </header>

                {/* Action Button */}
                <div className="relative group">
                    {playerState === 'playing' ? (
                        <div className="px-8 py-6 rounded-full border border-green-500/30 bg-green-900/10 text-green-400 animate-pulse">
                            Running...
                        </div>
                    ) : (
                        <button
                            onClick={startRadio}
                            disabled={playerState === 'loading'}
                            className="relative px-12 py-6 text-xl bg-transparent border-2 border-zinc-700 rounded-full hover:border-zinc-500 hover:bg-zinc-900 transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group-hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                        >
                            {playerState === 'loading' ? (
                                <span className="flex items-center gap-3">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Tuning...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <Play className="w-5 h-5 fill-current" />
                                    START
                                </span>
                            )}
                        </button>
                    )}

                    {playerState === 'idle' && (
                        <div className="absolute top-full left-0 right-0 mt-4 text-xs text-zinc-600 font-medium">
                            Press Enter ↵
                        </div>
                    )}
                </div>

                {/* Status Display */}
                <div className="min-h-[120px] w-full flex flex-col items-center justify-center">
                    {playerState === 'playing' && currentEpisode && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <div className="text-sm font-medium tracking-wider text-green-400/80 uppercase">
                                Now Playing ({isRecent ? 'Recent' : 'Archive'})
                            </div>
                            <div>
                                <h2 className="text-lg md:text-xl font-medium text-white leading-relaxed line-clamp-3">
                                    {currentEpisode.title}
                                </h2>
                                <div className="mt-2 text-xs text-zinc-500">
                                    {new Date(currentEpisode.pubDate).toLocaleDateString()}
                                </div>
                            </div>
                        </div>
                    )}

                    {playerState === 'error' && (
                        <div className="text-red-400 space-y-2 animate-in fade-in zoom-in duration-300">
                            <Info className="w-8 h-8 mx-auto mb-2 opacity-80" />
                            <p className="text-sm">{errorMessage}</p>
                            <p className="text-xs text-zinc-600">Press Enter to retry</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <footer className="fixed bottom-6 text-[10px] text-zinc-800 tracking-widest uppercase">
                © 2026 Random Cast Player
            </footer>
        </main>
    );
}
