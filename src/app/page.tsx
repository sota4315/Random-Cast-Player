'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Loader2, Radio, Info, Settings, Trash2, Plus, RotateCcw, X, Search, Check, Calendar } from 'lucide-react';

// Default RSS Feed List
import { supabase } from '@/lib/supabase';
import { initializeLiff, sendConnectMessage } from '@/lib/liff';

// Default RSS Feed List (Empty by default now)
const DEFAULT_RSS_LIST: RssChannel[] = [];

const TRANSLATIONS = {
    en: {
        title: 'MY NIGHT RADIO',
        start_btn: 'Start Radio',
        loading: 'Tuning...',
        playing: 'Running...',
        error: 'Failed to optimize...',
        settings: 'Channels',
        tab_search: 'Search Podcast',
        tab_manage: 'Manage URLs',
        tab_schedule: 'Schedules',
        connection: 'Connection',
        reconnect_btn: '🔗 Reconnect LINE',
        reconnect_alert_success: 'Redirecting to LINE app...',
        reconnect_alert_fail: 'Error: Bot ID check failed.',
        schedules_list: 'Your Schedules',
        no_schedules: 'No schedules found.',
        search_placeholder: 'Search by keywords...',
        search_btn: 'Search',
        add_btn: 'Add',
        added: 'Added',
        manage_desc: 'Add custom RSS feeds directly.',
        add_url_btn: 'Add URL',
        footer_msg: 'Manage your listening schedule via LINE Bot',
        lang_label: 'Language',
        time_to_listen: 'Time to listen!',
        play_now: 'Play Now',
        dismiss: 'Dismiss',
    },
    ja: {
        title: 'MY NIGHT RADIO',
        start_btn: 'ラジオを開始',
        loading: '選局中...',
        playing: '再生中...',
        error: '最適化に失敗しました',
        settings: 'チャンネル設定',
        tab_search: '番組検索',
        tab_manage: 'URL管理',
        tab_schedule: '予約管理',
        connection: 'LINE連携',
        reconnect_btn: '🔗 LINE連携を再実行',
        reconnect_alert_success: 'LINEアプリに移動します...',
        reconnect_alert_fail: 'エラー: Bot IDが設定されていません。',
        schedules_list: '登録済みの予約',
        no_schedules: '予約はありません',
        search_placeholder: 'キーワードで検索...',
        search_btn: '検索',
        add_btn: '追加',
        added: '登録済',
        manage_desc: 'RSSフィードのURLを直接追加できます',
        add_url_btn: '追加',
        footer_msg: 'LINE Botから予約や番組追加ができます',
        lang_label: '言語設定',
        time_to_listen: '時間になりました！',
        play_now: '今すぐ再生',
        dismiss: 'あとで',
    }
};

type Episode = {
    title: string;
    enclosure: { url: string };
    pubDate: string;
};

type SearchResult = {
    collectionName: string;
    artistName: string;
    feedUrl: string;
    artworkUrl100: string;
};

type RssChannel = {
    id?: string; // Supabase ID, optional for optimistic updates
    url: string;
};

interface Schedule {
    id: string;
    keyword: string;
    day_of_week: number;
    hour: number;
    is_active: boolean;
}

type PlayerState = 'idle' | 'loading' | 'playing' | 'error';
type SettingsTab = 'manage' | 'search' | 'schedule';

export default function Home() {
    const [rssList, setRssList] = useState<RssChannel[]>(DEFAULT_RSS_LIST);
    const [userId, setUserId] = useState<string>('');
    const [lineUserId, setLineUserId] = useState<string>('');
    const [language, setLanguage] = useState<'ja' | 'en'>('en'); // Default to English initially

    // Translation Helper
    const t = TRANSLATIONS[language];

    const [playerState, setPlayerState] = useState<PlayerState>('idle');
    const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [isRecent, setIsRecent] = useState<boolean>(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settingsTab, setSettingsTab] = useState<SettingsTab>('search');

    // Schedule State
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);
    const [alarmSchedule, setAlarmSchedule] = useState<Schedule | null>(null);

    // Custom URL Input
    const [newUrl, setNewUrl] = useState('');

    // Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [recommendedPodcasts, setRecommendedPodcasts] = useState<SearchResult[]>([]);

    const audioRef = useRef<HTMLAudioElement>(null);

    // Fetch Schedules
    const fetchSchedules = useCallback(async () => {
        if (!userId) return;
        setIsLoadingSchedules(true);
        try {
            const res = await fetch(`/api/schedules?userId=${userId}`);
            const data = await res.json();
            if (Array.isArray(data)) {
                setSchedules(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoadingSchedules(false);
        }
    }, [userId]);

    const handleDeleteSchedule = async (id: string, keyword: string) => {
        if (!confirm(`Delete schedule for "${keyword}"?`)) return;
        try {
            const res = await fetch(`/api/schedules?id=${id}&userId=${userId}`, { method: 'DELETE' });
            if (res.ok) {
                setSchedules(prev => prev.filter(s => s.id !== id));
            } else {
                alert('Failed to delete schedule');
            }
        } catch (e) {
            alert('Error deleting schedule');
        }
    };

    useEffect(() => {
        if (settingsTab === 'schedule' && isSettingsOpen) {
            fetchSchedules();
        }
    }, [settingsTab, isSettingsOpen, fetchSchedules]);

    // Fetch Recommended Podcasts on mount
    useEffect(() => {
        const fetchRecommended = async () => {
            const recommendations = ['Rebuild', 'COTEN RADIO', 'Off Topic', 'Donguri FM'];
            const results: SearchResult[] = [];

            try {
                // Fetch in parallel
                const promises = recommendations.map(term =>
                    fetch(`/api/search?term=${encodeURIComponent(term)}`)
                        .then(res => res.json())
                        .then(data => data.results?.[0]) // Take the first result
                );

                const data = await Promise.all(promises);
                data.forEach(item => {
                    if (item) results.push(item);
                });

                setRecommendedPodcasts(results);
            } catch (e) {
                console.error("Failed to fetch recommendations", e);
            }
        };

        fetchRecommended();
    }, []);

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

    // Handle Deep Linking & Language Init
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);

        // Language Init
        const langParam = params.get('lang');
        if (langParam === 'ja' || langParam === 'en') {
            setLanguage(langParam);
            localStorage.setItem('mnr_lang', langParam);
        } else {
            const savedLang = localStorage.getItem('mnr_lang');
            if (savedLang === 'ja' || savedLang === 'en') {
                setLanguage(savedLang);
            }
        }

        // Open Settings
        if (params.get('open') === 'settings') {
            setIsSettingsOpen(true);
            setSettingsTab('schedule');
        }
    }, []);

    // Initialize User ID and Fetch Data from Supabase
    useEffect(() => {
        const initUser = async () => {
            let configUserId = localStorage.getItem('mnr_user_id');

            // 1. Ensure Local ID exists first (Generate if needed)
            if (!configUserId) {
                configUserId = crypto.randomUUID();
                localStorage.setItem('mnr_user_id', configUserId);
            }

            // 2. Try LIFF Init & Auto Link
            const liffProfile = await initializeLiff();
            if (liffProfile?.lineUserId) {
                setLineUserId(liffProfile.lineUserId);
            }

            if (liffProfile?.lineUserId && liffProfile.isInClient) {
                const hasLinked = localStorage.getItem('mnr_liff_linked');
                if (!hasLinked) {
                    await sendConnectMessage(configUserId!);
                    localStorage.setItem('mnr_liff_linked', 'true');
                }
            }

            setUserId(configUserId!);

            // 3. Fetch Channels via API
            try {
                const res = await fetch(`/api/channels?userId=${configUserId}`);
                const data = await res.json();
                if (Array.isArray(data)) {
                    // Update frontend model (API returns simplified struct, may need mapping if types differ, but seems compatible)
                    setRssList(data.map((c: any) => ({ id: c.id, url: c.rss_url })));
                }
            } catch (e) {
                console.error('Error fetching channels:', e);
            }
        };

        initUser();
    }, []);

    // (LocalStorage sync removed in favor of Supabase)

    const handleAddUrl = async (url: string) => {
        if (!url) return;
        const trimmed = url.trim();

        // Optimistic check
        if (rssList.some(c => c.url === trimmed)) return;

        // Add via API
        try {
            const res = await fetch('/api/channels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, url: trimmed })
            });
            const data = await res.json();

            if (res.ok) {
                setRssList(prev => [...prev, { id: data.id, url: data.url }]);
                setNewUrl('');
                setSettingsTab('manage');
            } else {
                alert('Failed to add channel');
            }
        } catch (e) {
            console.error(e);
            alert('Error adding channel');
        }
    };

    const handleRemoveUrl = async (idToRemove: string) => {
        // Optimistic Update
        const oldList = [...rssList];
        setRssList(prev => prev.filter(c => c.id !== idToRemove));

        try {
            const res = await fetch(`/api/channels?id=${idToRemove}&userId=${userId}`, { method: 'DELETE' });
            if (!res.ok) {
                setRssList(oldList); // Revert
                alert('Failed to remove channel');
            }
        } catch (e) {
            setRssList(oldList); // Revert
            alert('Error removing channel');
        }
    };

    const handleResetDefault = async () => {
        if (confirm('Are you sure you want to clear all channels?')) {
            // Optimistic
            const oldList = [...rssList];
            setRssList([]);

            // DB Delete All
            const { error } = await supabase
                .from('channels')
                .delete()
                .eq('user_id', userId);

            if (error) {
                console.error('Failed to clear channels', error);
                setRssList(oldList);
            }
        }
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        setSearchResults([]);

        try {
            const res = await fetch(`/api/search?term=${encodeURIComponent(searchQuery)}`);
            if (!res.ok) throw new Error('Search failed');
            const data = await res.json();
            setSearchResults(data.results || []);
        } catch (e) {
            console.error(e);
            // alert('Failed to search'); 
        } finally {
            setIsSearching(false);
        }
    };

    const startRadio = async () => {
        if (rssList.length === 0) {
            setErrorMessage('No channels configured. Please add RSS feeds in settings.');
            setPlayerState('error');
            setIsSettingsOpen(true); // Auto open settings
            return;
        }

        setPlayerState('loading');
        setErrorMessage('');

        try {
            // 1. Pick a random RSS
            const randomRss = rssList[Math.floor(Math.random() * rssList.length)];

            // 2. Fetch via our API route
            const res = await fetch(`/api/rss?url=${encodeURIComponent(randomRss.url)}`);
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
            if ((e.key === 'Enter' || e.key === ' ') && !isSettingsOpen && playerState !== 'loading' && playerState !== 'playing') {
                e.preventDefault();
                startRadio();
            }
            if (e.key === 'Escape' && isSettingsOpen) {
                setIsSettingsOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [playerState, isSettingsOpen]);

    // Autoplay Logic
    const lastAutoplayRef = useRef<string>('');

    useEffect(() => {
        if (schedules.length === 0) return;

        const checkAutoplay = () => {
            if (playerState === 'playing' || playerState === 'loading') return;

            const now = new Date();
            const day = now.getDay();
            const hour = now.getHours();

            // Key: YYYY-MM-DD-HH
            const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${hour}`;

            if (lastAutoplayRef.current === key) return;

            const match = schedules.find(s => s.day_of_week === day && s.hour === hour && s.is_active);
            if (match) {
                console.log('⏰ Autoplay triggered by schedule:', match);
                lastAutoplayRef.current = key;
                setAlarmSchedule(match);
            }
        };

        const timer = setInterval(checkAutoplay, 15000); // Check every 15s
        checkAutoplay(); // Initial check

        return () => clearInterval(timer);
    }, [schedules, playerState, rssList]);

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
                    <div className="w-full max-w-lg bg-zinc-900/95 border border-zinc-800 rounded-2xl shadow-2xl m-4 flex flex-col max-h-[80vh] overflow-hidden">

                        {/* Header */}
                        <div className="flex items-center justify-between p-6 pb-2 flex-shrink-0">
                            <h2 className="text-lg font-medium text-white flex items-center gap-2">
                                <Settings className="w-5 h-5" /> {t.settings}
                            </h2>
                            <div className="flex items-center gap-3">
                                <div className="flex bg-zinc-800 rounded-lg p-0.5">
                                    <button
                                        onClick={() => { setLanguage('en'); localStorage.setItem('mnr_lang', 'en'); }}
                                        className={`px-2 py-0.5 text-xs rounded-md transition-all ${language === 'en' ? 'bg-zinc-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-300'}`}
                                    >
                                        EN
                                    </button>
                                    <button
                                        onClick={() => { setLanguage('ja'); localStorage.setItem('mnr_lang', 'ja'); }}
                                        className={`px-2 py-0.5 text-xs rounded-md transition-all ${language === 'ja' ? 'bg-zinc-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-300'}`}
                                    >
                                        JA
                                    </button>
                                </div>
                                <button onClick={() => setIsSettingsOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex px-6 gap-6 border-b border-zinc-800/50 mb-4 text-sm font-medium">
                            <button
                                onClick={() => setSettingsTab('search')}
                                className={`pb-3 border-b-2 transition-colors ${settingsTab === 'search' ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                            >
                                {t.tab_search}
                            </button>
                            <button
                                onClick={() => setSettingsTab('manage')}
                                className={`pb-3 border-b-2 transition-colors ${settingsTab === 'manage' ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                            >
                                {t.tab_manage}
                            </button>
                            <button
                                onClick={() => setSettingsTab('schedule')}
                                className={`pb-3 border-b-2 transition-colors ${settingsTab === 'schedule' ? 'border-white text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                            >
                                {t.tab_schedule}
                            </button>
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col min-h-0 px-6 pb-6">

                            {/* --- SEARCH TAB --- */}
                            {settingsTab === 'search' && (
                                <div className="flex flex-col h-full">
                                    <div className="flex gap-2 mb-4 flex-shrink-0">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                                            <input
                                                type="text"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                placeholder={t.search_placeholder}
                                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-zinc-500 text-zinc-200 placeholder:text-zinc-600 transition-colors"
                                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                            />
                                        </div>
                                        <button
                                            onClick={handleSearch}
                                            disabled={!searchQuery.trim() || isSearching}
                                            className="bg-zinc-100 hover:bg-zinc-300 text-black px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                        >
                                            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : t.search_btn}
                                        </button>
                                    </div>

                                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                                        {/* Recommendations (Show when no search query) */}
                                        {!searchQuery && recommendedPodcasts.length > 0 && (
                                            <>
                                                <div className="text-xs text-zinc-500 font-medium px-1 uppercase tracking-wider">Recommended for you</div>
                                                {recommendedPodcasts.map((result, idx) => {
                                                    const isAdded = rssList.some(r => r.url === result.feedUrl);
                                                    return (
                                                        <div key={`rec-${idx}`} className="flex gap-3 p-3 rounded-lg bg-zinc-800/20 border border-zinc-800/50 hover:bg-zinc-800/40 transition-colors">
                                                            {result.artworkUrl100 && (
                                                                <img src={result.artworkUrl100} alt={result.collectionName} className="w-12 h-12 rounded bg-zinc-800 object-cover flex-shrink-0" />
                                                            )}
                                                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                                <h3 className="text-sm font-medium text-zinc-200 truncate">{result.collectionName}</h3>
                                                                <p className="text-xs text-zinc-500 truncate">{result.artistName}</p>
                                                            </div>
                                                            <button
                                                                onClick={() => !isAdded && handleAddUrl(result.feedUrl)}
                                                                disabled={isAdded}
                                                                className={`flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 transition-all ${isAdded ? 'bg-green-500/20 text-green-500' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'}`}
                                                            >
                                                                {isAdded ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </>
                                        )}
                                        {/* Search Results */}
                                        {searchResults.map((result, idx) => {
                                            const isAdded = rssList.some(r => r.url === result.feedUrl);
                                            return (
                                                <div key={idx} className="flex gap-3 p-3 rounded-lg bg-zinc-800/20 border border-zinc-800/50 hover:bg-zinc-800/40 transition-colors">
                                                    {result.artworkUrl100 && (
                                                        <img src={result.artworkUrl100} alt={result.collectionName} className="w-12 h-12 rounded bg-zinc-800 object-cover flex-shrink-0" />
                                                    )}
                                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                        <h3 className="text-sm font-medium text-zinc-200 truncate">{result.collectionName}</h3>
                                                        <p className="text-xs text-zinc-500 truncate">{result.artistName}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => !isAdded && handleAddUrl(result.feedUrl)}
                                                        disabled={isAdded}
                                                        className={`flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 transition-all ${isAdded ? 'bg-green-500/20 text-green-500' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'}`}
                                                    >
                                                        {isAdded ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        {!isSearching && searchResults.length === 0 && searchQuery && (
                                            <div className="text-center text-zinc-600 text-xs py-8">
                                                No podcasts found. Try another keyword.
                                            </div>
                                        )}
                                        {!isSearching && !searchQuery && recommendedPodcasts.length === 0 && (
                                            <div className="text-center text-zinc-700 text-xs py-8">
                                                Loading recommendations...
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* --- MANAGE TAB --- */}
                            {settingsTab === 'manage' && (
                                <div className="flex flex-col h-full">
                                    <div className="flex gap-2 mb-4 flex-shrink-0">
                                        <input
                                            type="text"
                                            value={newUrl}
                                            onChange={(e) => setNewUrl(e.target.value)}
                                            placeholder="Paste RSS URL manually..."
                                            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-zinc-500 text-zinc-300 transition-colors placeholder:text-zinc-600"
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddUrl(newUrl)}
                                        />
                                        <button
                                            onClick={() => handleAddUrl(newUrl)}
                                            disabled={!newUrl.trim()}
                                            className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 rounded-lg disabled:opacity-50 transition-colors"
                                        >
                                            <Plus className="w-5 h-5" />
                                        </button>
                                    </div>

                                    <div className="space-y-2 overflow-y-auto custom-scrollbar flex-1 pr-2">
                                        {rssList.map((item, idx) => (
                                            <div key={item.id || idx} className="group flex items-center justify-between p-3 rounded-lg bg-zinc-950/30 border border-zinc-800/50 hover:border-zinc-700 transition-colors">
                                                <div className="truncate text-xs text-zinc-400 font-mono flex-1 pr-4">{item.url}</div>
                                                <button
                                                    onClick={() => item.id && handleRemoveUrl(item.id)}
                                                    className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                        {rssList.length === 0 && (
                                            <div className="text-center text-zinc-600 text-sm py-8 border border-dashed border-zinc-800 rounded-lg">
                                                No channels added yet.<br />
                                                Add from Search or paste RSS.
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-zinc-800 flex justify-between items-center flex-shrink-0">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Connect LINE</span>
                                            <code
                                                className="text-[10px] bg-zinc-900 px-2 py-1 rounded text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(`CONNECT ${userId}`);
                                                    alert('Command copied! Paste this to your LINE Bot.');
                                                }}
                                                title="Click to copy connection command"
                                            >
                                                {userId.slice(0, 8)}...
                                            </code>
                                        </div>
                                        <button
                                            onClick={handleResetDefault}
                                            className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
                                        >
                                            <RotateCcw className="w-3 h-3" /> Clear All
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* --- SCHEDULE TAB --- */}
                            {settingsTab === 'schedule' && (
                                <div className="flex flex-col h-full space-y-6">
                                    {/* Connection Repair Section */}
                                    <div>
                                        <h3 className="text-sm font-medium text-purple-400 mb-2">{t.connection}</h3>
                                        <div className="p-3 bg-white/5 rounded-lg">
                                            <p className="text-sm text-gray-300 mb-2">
                                                User ID: {userId.slice(0, 8)}...
                                            </p>
                                            <button
                                                onClick={async () => {
                                                    // Trigger Guide Push Message
                                                    if (lineUserId) {
                                                        await fetch('/api/trigger-guide', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ lineUserId, lang: language })
                                                        }).catch(err => console.error('Failed to trigger guide:', err));
                                                    }

                                                    const sent = await sendConnectMessage(userId);
                                                    if (sent) {
                                                        const msg = lineUserId
                                                            ? (language === 'ja'
                                                                ? '詳細をBotから送信しました。\nトーク画面に戻り、入力欄のIDをそのまま送信してください！'
                                                                : 'Please check the Bot message.\nSend the auto-filled ID in the chat!')
                                                            : t.reconnect_alert_success;

                                                        alert(msg);
                                                        localStorage.setItem('mnr_liff_linked', 'true');
                                                    } else {
                                                        alert(t.reconnect_alert_fail);
                                                    }
                                                }}
                                                className="w-full mt-2 py-2 bg-purple-600/80 text-white rounded-lg text-sm font-medium hover:bg-purple-600 transition"
                                            >
                                                {t.reconnect_btn}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Schedule List */}
                                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                                        <h3 className="text-sm font-medium text-zinc-400 mb-2">{t.schedules_list}</h3>
                                        {isLoadingSchedules ? (
                                            <div className="flex flex-col items-center justify-center p-4 text-zinc-500 gap-2">
                                                <Loader2 className="w-6 h-6 animate-spin" />
                                            </div>
                                        ) : schedules.length === 0 ? (
                                            <div className="text-center text-zinc-600 text-sm py-8 border border-dashed border-zinc-800 rounded-lg flex flex-col items-center gap-3">
                                                <Calendar className="w-8 h-8 opacity-50" />
                                                <span>{t.no_schedules}</span>
                                            </div>
                                        ) : (
                                            schedules.map(item => (
                                                <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/30 border border-zinc-800/50">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-sm font-medium text-zinc-200">{item.keyword}</span>
                                                        <span className="text-[10px] text-zinc-500 uppercase tracking-wide bg-zinc-900 px-1.5 py-0.5 rounded self-start border border-zinc-800">
                                                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][item.day_of_week]} {item.hour}:00
                                                        </span>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteSchedule(item.id, item.keyword)}
                                                        className="text-zinc-600 hover:text-red-400 p-2 transition-colors rounded-full hover:bg-red-500/10"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-zinc-800 text-center">
                                        <span className="text-[10px] text-zinc-600">
                                            {t.footer_msg}
                                        </span>
                                    </div>
                                </div>
                            )}
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
                        {t.title}
                    </h1>
                </header>

                {/* Action Button */}
                <div className="relative group">
                    {playerState === 'playing' ? (
                        <div className="px-8 py-6 rounded-full border border-green-500/30 bg-green-900/10 text-green-400 animate-pulse">
                            {t.playing}
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
                                    {t.loading}
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <Play className="w-5 h-5 fill-current" />
                                    {t.start_btn}
                                </span>
                            )}
                        </button>
                    )}

                    {playerState === 'idle' && (
                        <div className="absolute top-full left-0 right-0 mt-4 text-xs text-zinc-600 font-medium">
                            Press Space or Enter ↵
                        </div>
                    )}
                </div>

                {/* Status Display */}
                <div className="min-h-[120px] w-full flex flex-col items-center justify-center">
                    {/* Tutorial for new users */}
                    {rssList.length === 0 && !isSettingsOpen && playerState === 'idle' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-40 backdrop-blur-sm animate-in fade-in duration-500">
                            <div className="max-w-md px-8 text-center space-y-8">
                                <div className="space-y-4">
                                    <h2 className="text-3xl font-light tracking-wide text-white">
                                        Welcome to <br />
                                        <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-zinc-200 to-zinc-500">Random Cast</span>
                                    </h2>
                                    <p className="text-zinc-400 text-sm leading-relaxed">
                                        Enjoy a serendipitous listening experience.<br />
                                        Register your favorite podcasts, and we&apos;ll play a random episode from the past year.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 gap-4 text-left max-w-xs mx-auto text-sm text-zinc-300">
                                    <div className="flex gap-4 items-center p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-white">1</div>
                                        <div>Search for your favorite podcasts</div>
                                    </div>
                                    <div className="flex gap-4 items-center p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-white">2</div>
                                        <div>Add them to your mix</div>
                                    </div>
                                    <div className="flex gap-4 items-center p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-white">3</div>
                                        <div>Press SPACE to start listening!</div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setIsSettingsOpen(true)}
                                    className="px-8 py-3 bg-white text-black rounded-full font-medium hover:bg-zinc-200 transition-colors"
                                >
                                    Get Started
                                </button>
                            </div>
                        </div>
                    )}

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
            {/* Alarm Overlay */}
            {alarmSchedule && (
                <div className="fixed top-0 left-0 right-0 z-50 bg-indigo-900/95 text-white p-6 shadow-2xl border-b-2 border-indigo-500 animate-in slide-in-from-top duration-500 flex flex-col items-center justify-center gap-4 h-[33vh]">
                    <div className="text-sm font-medium opacity-80 uppercase tracking-widest">{t.time_to_listen}</div>
                    <h2 className="text-2xl font-bold text-center leading-tight line-clamp-2">
                        {alarmSchedule.keyword}
                    </h2>
                    <div className="flex gap-4 w-full max-w-sm mt-2">
                        <button
                            onClick={() => setAlarmSchedule(null)}
                            className="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-medium transition-colors"
                        >
                            {t.dismiss}
                        </button>
                        <button
                            onClick={() => {
                                setAlarmSchedule(null);
                                startRadio();
                            }}
                            className="flex-1 py-3 bg-indigo-500 hover:bg-indigo-400 rounded-xl font-bold shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2"
                        >
                            <Play className="w-5 h-5 fill-current" />
                            {t.play_now}
                        </button>
                    </div>
                </div>
            )}
        </main>
    );
}
