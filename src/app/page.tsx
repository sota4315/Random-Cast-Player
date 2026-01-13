'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Loader2, Radio, Info, Settings, Trash2, Plus, RotateCcw, X } from 'lucide-react';

// Default RSS Feed List
const DEFAULT_RSS_LIST = [
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
    const [rssList, setRssList] = useState<string[]>(DEFAULT_RSS_LIST);
    const [playerState, setPlayerState] = useState<PlayerState>('idle');
    const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [isRecent, setIsRecent] = useState<boolean>(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [newUrl, setNewUrl] = useState('');

    const audioRef = useRef<HTMLAudioElement>(null);

    // Load from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem('my_night_radio_rss');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setRssList(parsed);
                }
            } catch (e) {
                console.error("Failed to parse local storage", e);
            }
        }
    }, []);

    // Save to localStorage whenever list changes
    useEffect(() => {
        localStorage.setItem('my_night_radio_rss', JSON.stringify(rssList));
    }, [rssList]);

    const handleAddUrl = () => {
        if (!newUrl.trim()) return;
        if (rssList.includes(newUrl.trim())) {
            setNewUrl('');
            return;
        }
        const updatedList = [...rssList, newUrl.trim()];
        setRssList(updatedList);
        setNewUrl('');
    };

    const handleRemoveUrl = (urlToRemove: string) => {
        const newList = rssList.filter(url => url !== urlToRemove);
        setRssList(newList);
    };

    const handleResetDefault = () => {
        if (confirm('Are you sure you want to reset to default channels?')) {
            setRssList(DEFAULT_RSS_LIST);
        }
    };

    const startRadio = async () => {
        if (rssList.length === 0) {
            setErrorMessage('No channels configured. Please add RSS feeds in settings.');
            setPlayerState('error');
            return;
        }

        setPlayerState('loading');
        setErrorMessage('');

        try {
            // 1. Pick a random RSS
            const randomRss = rssList[Math.floor(Math.random() * rssList.length)];

            // 2. Fetch via our API route
            const res = await fetch(`/api/rss?url=${encodeURIComponent(randomRss)}`);
            if (!res.ok) throw new Error('Failed to fetch RSS feed');

            const feed = await res.json();
            const items = feed.items as any[];

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

            // Fallback
            if (recentItems.length === 0) {
                targetList = items;
                recentFlag = false;
            }

            // 4. Pick random episode
            const randomEpisode = targetList[Math.floor(Math.random() * targetList.length)];

            if (!randomEpisode.enclosure?.url) {
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
            if (e.key === 'Enter' && !isSettingsOpen && playerState !== 'loading' && playerState !== 'playing') {
                startRadio();
            }
            if (e.key === 'Escape' && isSettingsOpen) {
                setIsSettingsOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [playerState, isSettingsOpen]);

    return (
        <main className="relative flex min-h-screen flex-col items-center justify-center p-6 bg-black text-gray-200 selection:bg-gray-800 overflow-hidden">
            <audio ref={audioRef} onEnded={() => setPlayerState('idle')} onError={() => setPlayerState('error')} />

            {/* Settings Button */}
            <button
                onClick={() => setIsSettingsOpen(true)}
                className="absolute top-6 right-6 p-2 text-zinc-600 hover:text-zinc-300 transition-colors z-20 outline-none"
            >
                <Settings className="w-6 h-6" />
            </button>

            {/* Settings Modal */}
            {isSettingsOpen && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-lg bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 shadow-2xl m-4 flex flex-col max-h-[80vh]">
                        <div className="flex items-center justify-between mb-6 flex-shrink-0">
                            <h2 className="text-lg font-medium text-white flex items-center gap-2">
                                <Settings className="w-5 h-5" /> Channels
                            </h2>
                            <button onClick={() => setIsSettingsOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                            {/* Add New */}
                            <div className="flex gap-2 mb-4 flex-shrink-0">
                                <input
                                    type="text"
                                    value={newUrl}
                                    onChange={(e) => setNewUrl(e.target.value)}
                                    placeholder="Paste RSS URL..."
                                    className="flex-1 bg-black/50 border border-zinc-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-zinc-500 text-zinc-300 transition-colors"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                                />
                                <button
                                    onClick={handleAddUrl}
                                    disabled={!newUrl.trim()}
                                    className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 rounded-lg disabled:opacity-50 transition-colors"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            </div>

                            {/* List */}
                            <div className="space-y-2 overflow-y-auto custom-scrollbar flex-1 pr-2">
                                {rssList.map((url, idx) => (
                                    <div key={idx} className="group flex items-center justify-between p-3 rounded-lg bg-zinc-950/50 border border-zinc-800 hover:border-zinc-700 transition-colors">
                                        <div className="truncate text-xs text-zinc-400 font-mono flex-1 pr-4">{url}</div>
                                        <button
                                            onClick={() => handleRemoveUrl(url)}
                                            className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                {rssList.length === 0 && (
                                    <div className="text-center text-zinc-600 text-sm py-8 border border-dashed border-zinc-800 rounded-lg">
                                        No channels added yet.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-zinc-800 flex justify-end flex-shrink-0">
                            <button
                                onClick={handleResetDefault}
                                className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
                            >
                                <RotateCcw className="w-3 h-3" /> Reset to Defaults
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <div className={`max-w-md w-full flex flex-col items-center space-y-12 text-center z-10 transition-opacity duration-300 ${isSettingsOpen ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>

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
