import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Home, Search, Play, Pause, SkipBack, SkipForward,
  ListMusic, Heart, DownloadCloud, Music, Volume2, VolumeX,
  MoreVertical, ListPlus, Share2, Download, ExternalLink, Copy,
  Info, X, Clock, Youtube, Disc, Hash, FileCode2, PlaySquare,
  PlusCircle, FileBadge2, Settings, RefreshCw, FolderDown,
  Shuffle, Repeat, Repeat1, ListOrdered, Trash2, Pencil,
  ChevronRight, ChevronLeft, ImagePlus, AlignLeft
} from 'lucide-react';

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Track = {
  id: number;
  title: string;
  artist: string;
  duration: string;
  url: string;
  cover: string;
};

type Playlist = {
  id: string;
  name: string;
  description: string;
  tracks: Track[];
  customCover?: string;
};

type RepeatMode = 'off' | 'all' | 'one';

type CtxMenu = {
  x: number;
  y: number;
  type: 'track' | 'playlist' | 'sidebar-playlist' | 'queue-track' | 'quickpick';
  track?: Track;
  playlist?: Playlist;
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function parseDurationToSeconds(duration: string): number {
  const parts = duration.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function saveToStorage(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function clampMenuPos(x: number, y: number, w = 260, h = 400) {
  return {
    x: x + w > window.innerWidth ? window.innerWidth - w - 8 : x,
    y: y + h > window.innerHeight ? window.innerHeight - h - 8 : y,
  };
}

// ─── SETTINGS PANEL ──────────────────────────────────────────────────────────
function SettingsPanel({
  downloadQuality, setDownloadQuality,
  downloadPath, handleSelectDirectory,
}: {
  downloadQuality: string;
  setDownloadQuality: (q: string) => void;
  downloadPath: string;
  handleSelectDirectory: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-8 z-10 custom-scrollbar">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-11 h-11 rounded-lg flex items-center justify-center bg-[#39FF14]/10 border border-[#39FF14]/30 shrink-0">
          <FolderDown size={22} className="text-[#39FF14] drop-shadow-[0_0_6px_#39FF14]" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Downloads</h2>
          <p className="text-sm text-neutral-500 mt-0.5">Download path, quality and more</p>
        </div>
      </div>
      <div className="border border-neutral-800/60 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-5 border-b border-neutral-800/40">
          <div>
            <h4 className="text-white font-medium text-[15px]">Download Quality</h4>
            <p className="text-[13px] text-neutral-500 mt-1">Quality of audio extracted from YouTube.</p>
          </div>
          <div className="relative ml-8 shrink-0">
            <select
              value={downloadQuality}
              onChange={(e) => setDownloadQuality(e.target.value)}
              className="bg-[#39FF14]/10 border border-[#39FF14]/30 text-[#39FF14] font-medium text-[14px] rounded-lg px-3 py-1.5 focus:outline-none cursor-pointer appearance-none pr-7 transition-colors hover:bg-[#39FF14]/20"
            >
              <option value="High" className="bg-[#111] text-white">High</option>
              <option value="Medium" className="bg-[#111] text-white">Medium</option>
              <option value="Low" className="bg-[#111] text-white">Low</option>
            </select>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#39FF14]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </div>
          </div>
        </div>
        <div
          className="flex items-center justify-between px-5 py-5 cursor-pointer group hover:bg-white/[0.02] transition-colors"
          onClick={handleSelectDirectory}
        >
          <div className="flex-1 min-w-0">
            <h4 className="text-white font-medium text-[15px]">Download Folder</h4>
            <p className="text-[13px] text-neutral-500 mt-1 truncate font-mono">{downloadPath}</p>
          </div>
          <button className="p-2 ml-4 text-neutral-500 group-hover:text-[#39FF14] transition-colors shrink-0">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function VanguardPlayer() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>(() => loadFromStorage('vg_searchHistory', []));
  const [showHistory, setShowHistory] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(() => loadFromStorage('vg_currentTrack', null));

  // Use ref for isPlaying so the always-on poll interval reads the latest value
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const setIsPlayingSync = useCallback((val: boolean) => {
    isPlayingRef.current = val;
    setIsPlaying(val);
  }, []);

  const [isLoadingTrack, setIsLoadingTrack] = useState(false);
  const [activeNav, setActiveNav] = useState('home');
  const [progressSeconds, setProgressSeconds] = useState(0);
  const progressSecondsRef = useRef(0);
  const [isSearching, setIsSearching] = useState(false);
  const [quickPicks, setQuickPicks] = useState<Track[]>(() => loadFromStorage('vg_quickPicks', []));

  const [queue, setQueue] = useState<Track[]>(() => loadFromStorage('vg_queue', []));
  const [playHistory, setPlayHistory] = useState<Track[]>(() => loadFromStorage('vg_playHistory', []));
  const [shuffle, setShuffle] = useState<boolean>(() => loadFromStorage('vg_shuffle', false));
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(() => loadFromStorage('vg_repeatMode', 'off'));
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  const [volume, setVolume] = useState<number>(() => loadFromStorage('vg_volume', 100));
  const [previousVolume, setPreviousVolume] = useState(100);

  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const isDraggingProgressRef = useRef(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);

  const [playlists, setPlaylists] = useState<Playlist[]>(() =>
    loadFromStorage('vg_playlists', [{ id: 'p1', name: 'Liked Songs', description: 'Your liked tracks', tracks: [] }])
  );
  const [openPlaylistId, setOpenPlaylistId] = useState<string | null>(null);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  const [renamingPlaylist, setRenamingPlaylist] = useState<Playlist | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameDescValue, setRenameDescValue] = useState('');
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<Track | null>(null);
  const [sidebarPlaylistsExpanded, setSidebarPlaylistsExpanded] = useState(true);

  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [infoModalTrack, setInfoModalTrack] = useState<Track | null>(null);
  const [downloadingTracks, setDownloadingTracks] = useState<{ [key: string]: boolean }>({});
  const [hoveredTrackUrl, setHoveredTrackUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [downloadQuality, setDownloadQuality] = useState<string>(() => loadFromStorage('vg_dlQuality', 'High'));
  const [downloadPath, setDownloadPath] = useState<string>(() => loadFromStorage('vg_dlPath', '~/Downloads'));

  const searchRef = useRef<HTMLInputElement>(null);
  const endDetectedRef = useRef(false);
  const currentTrackRef = useRef(currentTrack);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

  // ─── PERSIST ──────────────────────────────────────────────────────────────
  useEffect(() => { saveToStorage('vg_playlists', playlists); }, [playlists]);
  useEffect(() => { saveToStorage('vg_queue', queue); }, [queue]);
  useEffect(() => { saveToStorage('vg_playHistory', playHistory); }, [playHistory]);
  useEffect(() => { saveToStorage('vg_shuffle', shuffle); }, [shuffle]);
  useEffect(() => { saveToStorage('vg_repeatMode', repeatMode); }, [repeatMode]);
  useEffect(() => { saveToStorage('vg_volume', volume); }, [volume]);
  useEffect(() => { saveToStorage('vg_currentTrack', currentTrack); }, [currentTrack]);
  useEffect(() => { saveToStorage('vg_searchHistory', searchHistory); }, [searchHistory]);
  useEffect(() => { saveToStorage('vg_dlQuality', downloadQuality); }, [downloadQuality]);
  useEffect(() => { saveToStorage('vg_dlPath', downloadPath); }, [downloadPath]);
  useEffect(() => { saveToStorage('vg_quickPicks', quickPicks); }, [quickPicks]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => {
    const handleClick = () => { setCtxMenu(null); setShowHistory(false); };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // ─── PLAYBACK ─────────────────────────────────────────────────────────────
  const handlePlayTrack = useCallback(async (track: Track, fromQueue = false) => {
    endDetectedRef.current = false;
    setIsLoadingTrack(true);
    setIsPlayingSync(false);
    setProgressSeconds(0);
    progressSecondsRef.current = 0;
    setCurrentTrack(track);
    currentTrackRef.current = track;

    if (currentTrackRef.current && !fromQueue) {
      setPlayHistory(prev => [currentTrackRef.current!, ...prev].slice(0, 50));
    }
    setQuickPicks(prev => {
      const filtered = prev.filter(t => t.url !== track.url);
      return [track, ...filtered].slice(0, 20);
    });

    try {
      await invoke("play_audio", { url: track.url });
      await invoke("set_volume", { volume });
      let waited = 0;
      await new Promise<void>((resolve) => {
        const timer = setInterval(async () => {
          waited += 300;
          try {
            const pos: number = await invoke("get_progress");
            if (pos > 0) { clearInterval(timer); resolve(); }
          } catch {}
          if (waited >= 20000) { clearInterval(timer); resolve(); }
        }, 300);
      });
      setIsPlayingSync(true);
    } catch {
      showToast("Playback failed — is mpv installed?");
      setIsPlayingSync(false);
    } finally {
      setIsLoadingTrack(false);
    }
  }, [volume, showToast, setIsPlayingSync]);

  const togglePlayPause = useCallback(async () => {
    if (!currentTrackRef.current) return;
    try {
      await invoke("pause_audio");
      setIsPlayingSync(!isPlayingRef.current);
    } catch {}
  }, [setIsPlayingSync]);

  const toggleMute = useCallback(async () => {
    const newVol = volume === 0 ? previousVolume : 0;
    if (volume > 0) setPreviousVolume(volume);
    setVolume(newVol);
    try { await invoke("set_volume", { volume: newVol }); } catch {}
  }, [volume, previousVolume]);

  // ─── KEYBOARD SHORTCUTS ──────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';
      if (e.code === 'Space' && !isInput) { e.preventDefault(); togglePlayPause(); }
      if (e.code === 'ArrowRight' && !isInput && currentTrackRef.current) {
        e.preventDefault();
        const newTime = Math.min(progressSecondsRef.current + 10, parseDurationToSeconds(currentTrackRef.current.duration));
        invoke("seek_audio", { time: newTime }).catch(() => {});
        progressSecondsRef.current = newTime;
        setProgressSeconds(newTime);
      }
      if (e.code === 'ArrowLeft' && !isInput && currentTrackRef.current) {
        e.preventDefault();
        const newTime = Math.max(progressSecondsRef.current - 10, 0);
        invoke("seek_audio", { time: newTime }).catch(() => {});
        progressSecondsRef.current = newTime;
        setProgressSeconds(newTime);
      }
      if (e.code === 'KeyM' && !isInput) toggleMute();
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [togglePlayPause, toggleMute]);

  // ─── TRACK END HANDLER ────────────────────────────────────────────────────
  const handleTrackEnd = useCallback(() => {
    if (endDetectedRef.current) return;
    endDetectedRef.current = true;
    setQueue(prevQueue => {
      const track = currentTrackRef.current;
      setRepeatMode(prevRepeat => {
        if (prevRepeat === 'one' && track) {
          endDetectedRef.current = false;
          invoke("seek_audio", { time: 0 }).catch(() => {});
          progressSecondsRef.current = 0;
          setProgressSeconds(0);
          return prevRepeat;
        }
        if (prevQueue.length > 0) {
          const [next, ...rest] = prevQueue;
          setTimeout(() => { setQueue(rest); handlePlayTrack(next, true); }, 0);
          return prevRepeat;
        }
        if (prevRepeat === 'all' && track) {
          setTimeout(() => handlePlayTrack(track, true), 0);
          return prevRepeat;
        }
        setIsPlayingSync(false);
        return prevRepeat;
      });
      return prevQueue;
    });
  }, [handlePlayTrack, setIsPlayingSync]);

  // ─── REAL-TIME PROGRESS POLL ─────────────────────────────────────────────
  // Single always-on interval; reads refs to avoid stale closures
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!isPlayingRef.current || isDraggingProgressRef.current) return;
      try {
        const pos: number = await invoke("get_progress");
        progressSecondsRef.current = pos;
        setProgressSeconds(pos);
        const track = currentTrackRef.current;
        if (track && pos > 5) {
          const total = parseDurationToSeconds(track.duration);
          if (total > 0 && pos >= total - 1) handleTrackEnd();
        }
      } catch {}
    }, 500);
    return () => clearInterval(interval);
  }, [handleTrackEnd]);

  // ─── FOLDER PICKER ────────────────────────────────────────────────────────
  const handleSelectDirectory = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, defaultPath: downloadPath });
      if (selected) setDownloadPath(selected as string);
    } catch {}
  };

  // ─── DRAG LOGIC ───────────────────────────────────────────────────────────
  const updateProgressFromEvent = useCallback((clientX: number) => {
    if (!progressRef.current || !currentTrackRef.current) return undefined;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = parseDurationToSeconds(currentTrackRef.current.duration) * percent;
    progressSecondsRef.current = newTime;
    setProgressSeconds(newTime);
    return newTime;
  }, []);

  const updateVolumeFromEvent = useCallback((clientX: number) => {
    if (!volumeRef.current) return;
    const rect = volumeRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setVolume(percent);
    invoke("set_volume", { volume: percent }).catch(() => {});
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isDraggingProgressRef.current) updateProgressFromEvent(e.clientX);
      if (isDraggingVolume) updateVolumeFromEvent(e.clientX);
    };
    const onUp = async (e: MouseEvent) => {
      if (isDraggingProgressRef.current) {
        const t = updateProgressFromEvent(e.clientX);
        if (t !== undefined) await invoke("seek_audio", { time: t }).catch(() => {});
        isDraggingProgressRef.current = false;
        setIsDraggingProgress(false);
      }
      if (isDraggingVolume) setIsDraggingVolume(false);
    };
    if (isDraggingProgress || isDraggingVolume) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDraggingProgress, isDraggingVolume, updateProgressFromEvent, updateVolumeFromEvent]);

  // ─── SEARCH ───────────────────────────────────────────────────────────────
  const searchMusic = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? searchQuery).trim();
    if (!q) return;
    setIsSearching(true);
    setTracks([]);
    setShowHistory(false);
    setSearchHistory(prev => [q, ...prev.filter(h => h !== q)].slice(0, 8));
    try {
      const response: string = await invoke("search_youtube", { query: q });
      const parsed = response.trim().split("\n").filter(l => l.trim()).map((line, index) => {
        const [title, uploader, duration, id] = line.split("====");
        const cleanId = id?.trim();
        return {
          id: index,
          title: title?.trim() || "Unknown Title",
          artist: uploader?.trim() || "Unknown Artist",
          duration: duration?.trim() || "0:00",
          url: `https://youtube.com/watch?v=${cleanId}`,
          cover: `https://i.ytimg.com/vi/${cleanId}/mqdefault.jpg`,
        };
      });
      setTracks(parsed);
    } catch {
      showToast("Search failed — is yt-dlp installed?");
    } finally {
      setIsSearching(false);
    }
  };

  // ─── SKIP CONTROLS ────────────────────────────────────────────────────────
  const handleSkipForward = async () => {
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);
      await handlePlayTrack(next, true);
    }
  };

  const handleSkipBack = async () => {
    if (progressSecondsRef.current > 3) {
      await invoke("seek_audio", { time: 0 }).catch(() => {});
      progressSecondsRef.current = 0;
      setProgressSeconds(0);
    } else if (playHistory.length > 0) {
      const [prev, ...rest] = playHistory;
      setPlayHistory(rest);
      await handlePlayTrack(prev, true);
    } else {
      await invoke("seek_audio", { time: 0 }).catch(() => {});
      progressSecondsRef.current = 0;
      setProgressSeconds(0);
    }
  };

  const toggleShuffle = () => setShuffle(prev => { showToast(!prev ? "Shuffle on" : "Shuffle off"); return !prev; });
  const cycleRepeat = () => setRepeatMode(prev => {
    const next: RepeatMode = prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off';
    showToast(next === 'off' ? "Repeat off" : next === 'all' ? "Repeat all" : "Repeat one");
    return next;
  });

  // ─── CONTEXT MENU HELPER ──────────────────────────────────────────────────
  const openCtx = (e: React.MouseEvent, menu: Omit<CtxMenu, 'x' | 'y'>) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = clampMenuPos(e.clientX, e.clientY);
    setCtxMenu({ x, y, ...menu });
  };

  // ─── DOWNLOAD ─────────────────────────────────────────────────────────────
  const handleDownload = async (track: Track) => {
    try {
      setDownloadingTracks(prev => ({ ...prev, [track.url]: true }));
      await invoke("download_song", { url: track.url, quality: downloadQuality, path: downloadPath });
      showToast(`Downloaded: ${track.title}`);
      setTimeout(() => setDownloadingTracks(prev => ({ ...prev, [track.url]: false })), 2000);
    } catch {
      showToast("Download failed");
      setDownloadingTracks(prev => ({ ...prev, [track.url]: false }));
    }
  };

  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); showToast("Copied to clipboard"); };
  const openInYouTube = (url: string) => window.open(url, '_blank');

  // ─── PLAYLISTS ────────────────────────────────────────────────────────────
  const confirmCreatePlaylist = () => {
    if (!newPlaylistName.trim()) return;
    setPlaylists(prev => [...prev, {
      id: `p${Date.now()}`,
      name: newPlaylistName.trim(),
      description: newPlaylistDesc.trim(),
      tracks: [],
    }]);
    setIsPlaylistModalOpen(false);
    setNewPlaylistName('');
    setNewPlaylistDesc('');
    showToast(`Playlist "${newPlaylistName.trim()}" created`);
  };

  const deletePlaylist = (id: string) => {
    if (id === 'p1') return;
    setPlaylists(prev => prev.filter(p => p.id !== id));
    if (openPlaylistId === id) setOpenPlaylistId(null);
    showToast("Playlist deleted");
  };

  const confirmRenamePlaylist = () => {
    if (!renameValue.trim() || !renamingPlaylist) return;
    setPlaylists(prev => prev.map(p =>
      p.id === renamingPlaylist.id
        ? { ...p, name: renameValue.trim(), description: renameDescValue.trim() }
        : p
    ));
    setRenamingPlaylist(null);
    showToast("Playlist updated");
  };

  const toggleLikeTrack = (t: Track) => {
    setPlaylists(prev => prev.map(p => {
      if (p.id !== 'p1') return p;
      const liked = p.tracks.some(x => x.url === t.url);
      return { ...p, tracks: liked ? p.tracks.filter(x => x.url !== t.url) : [...p.tracks, t] };
    }));
  };

  const addTrackToPlaylist = (playlistId: string, track: Track) => {
    setPlaylists(prev => prev.map(p => {
      if (p.id !== playlistId) return p;
      if (p.tracks.some(t => t.url === track.url)) { showToast("Already in playlist"); return p; }
      showToast(`Added to ${p.name}`);
      return { ...p, tracks: [...p.tracks, track] };
    }));
    setAddToPlaylistTrack(null);
    setCtxMenu(null);
  };

  const removeFromPlaylist = (playlistId: string, trackUrl: string) => {
    setPlaylists(prev => prev.map(p =>
      p.id !== playlistId ? p : { ...p, tracks: p.tracks.filter(t => t.url !== trackUrl) }
    ));
    showToast("Removed from playlist");
  };

  const handleCoverUpload = (playlistId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        if (result) {
          setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, customCover: result } : p));
          showToast("Cover updated");
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const isTrackLiked = (url: string) => playlists.find(p => p.id === 'p1')?.tracks.some(t => t.url === url) || false;
  const getPlaylistCover = (p: Playlist) => p.customCover || p.tracks[0]?.cover || null;

  // ─── QUEUE HELPERS ────────────────────────────────────────────────────────
  const playAll = (trackList: Track[]) => {
    if (!trackList.length) return;
    const list = shuffle ? [...trackList].sort(() => Math.random() - 0.5) : [...trackList];
    handlePlayTrack(list[0]);
    setQueue(list.slice(1));
    showToast(shuffle ? "Shuffle playing all" : "Playing all");
  };

  const removeFromQueue = (index: number) => setQueue(prev => prev.filter((_, i) => i !== index));

  const calculateProgressPercent = () => {
    if (!currentTrack) return 0;
    const total = parseDurationToSeconds(currentTrack.duration);
    return total === 0 ? 0 : Math.min((progressSeconds / total) * 100, 100);
  };

  // ─── TRACK ROW ────────────────────────────────────────────────────────────
  const TrackRow = ({ track, index, showRemove, onRemove }: {
    track: Track; index: number; showRemove?: boolean; onRemove?: () => void;
  }) => {
    const isActive = currentTrack?.url === track.url;
    const isHovered = hoveredTrackUrl === track.url;
    return (
      <div
        className={`flex items-center gap-4 px-4 py-3.5 rounded-lg cursor-pointer transition-all duration-150 group
          ${isActive ? 'bg-[#39FF14]/[0.07] border border-[#39FF14]/20' : 'hover:bg-white/5 border border-transparent'}`}
        onClick={() => handlePlayTrack(track)}
        onContextMenu={(e) => openCtx(e, { type: 'track', track })}
        onMouseEnter={() => setHoveredTrackUrl(track.url)}
        onMouseLeave={() => setHoveredTrackUrl(null)}
      >
        <div className="w-8 flex items-center justify-center shrink-0">
          {isActive && isLoadingTrack ? (
            <div className="w-3.5 h-3.5 border-2 border-[#39FF14] border-t-transparent rounded-full animate-spin" />
          ) : isActive && isPlaying ? (
            <div className="flex gap-[2px] items-end h-4">
              <div className="w-[3px] bg-[#39FF14] rounded-full animate-pulse shadow-[0_0_4px_#39FF14]" style={{ height: '100%' }} />
              <div className="w-[3px] bg-[#39FF14] rounded-full animate-pulse shadow-[0_0_4px_#39FF14]" style={{ height: '65%', animationDelay: '150ms' }} />
              <div className="w-[3px] bg-[#39FF14] rounded-full animate-pulse shadow-[0_0_4px_#39FF14]" style={{ height: '80%', animationDelay: '300ms' }} />
            </div>
          ) : isHovered ? (
            <Play size={16} fill="white" className="text-white" />
          ) : (
            <span className={`text-[13px] tabular-nums ${isActive ? 'text-[#39FF14]' : 'text-neutral-500'}`}>{index + 1}</span>
          )}
        </div>
        <div className="w-12 h-12 rounded-md overflow-hidden shrink-0 border border-neutral-800/60">
          <img src={track.cover} alt={track.title} className="w-full h-full object-cover" loading="lazy" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-[15px] truncate transition-colors duration-150 ${isActive ? 'text-[#39FF14]' : 'text-white'}`}>{track.title}</p>
          <p className="text-[13px] text-neutral-500 truncate mt-0.5">{track.artist}</p>
        </div>
        <div className={`flex items-center gap-1 transition-opacity duration-150 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
          <button onClick={(e) => { e.stopPropagation(); toggleLikeTrack(track); }} className="p-1.5 rounded-md hover:bg-white/10 transition-colors">
            <Heart size={14} className={isTrackLiked(track.url) ? 'text-[#39FF14] fill-[#39FF14]' : 'text-neutral-400'} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleDownload(track); }} className="p-1.5 rounded-md hover:bg-white/10 transition-colors">
            {downloadingTracks[track.url]
              ? <div className="w-3.5 h-3.5 border-2 border-[#39FF14] border-t-transparent rounded-full animate-spin" />
              : <Download size={14} className="text-neutral-400" />}
          </button>
          {showRemove && onRemove ? (
            <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-1.5 rounded-md hover:bg-red-500/20 transition-colors">
              <X size={14} className="text-neutral-400 hover:text-red-400" />
            </button>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); openCtx(e, { type: 'track', track }); }} className="p-1.5 rounded-md hover:bg-white/10 transition-colors">
              <MoreVertical size={14} className="text-neutral-400" />
            </button>
          )}
        </div>
        <span className="text-[13px] text-neutral-500 tabular-nums w-12 text-right shrink-0">{track.duration}</span>
      </div>
    );
  };

  const TrackRowSkeleton = ({ index }: { index: number }) => (
    <div className="flex items-center gap-4 px-4 py-3.5 rounded-lg border border-transparent">
      <div className="w-8 flex items-center justify-center shrink-0">
        <span className="text-[13px] text-neutral-800">{index + 1}</span>
      </div>
      <div className="w-12 h-12 rounded-md shrink-0 bg-neutral-800/60 animate-pulse" />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="h-3.5 bg-neutral-800/70 rounded-full animate-pulse" style={{ width: `${55 + (index * 13) % 35}%` }} />
        <div className="h-2.5 bg-neutral-800/50 rounded-full animate-pulse" style={{ width: `${30 + (index * 7) % 25}%` }} />
      </div>
      <div className="w-12 h-2.5 bg-neutral-800/50 rounded-full animate-pulse shrink-0" />
    </div>
  );

  const openPlaylist = playlists.find(p => p.id === openPlaylistId);

  return (
    <div className="flex flex-col h-screen w-full bg-[#050505] text-white font-sans overflow-hidden selection:bg-[#39FF14] selection:text-black relative">
      <style>{`
        @keyframes loadbar {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(150%); }
          100% { transform: translateX(400%); }
        }
        .slider-thumb { transition: opacity 0.15s ease, transform 0.15s ease; }
        .slider-track:hover .slider-thumb { opacity: 1 !important; transform: translateY(-50%) scale(1.25); }
      `}</style>

      <div className="flex flex-1 overflow-hidden">

        {/* ── SIDEBAR ── */}
        <div className="w-64 bg-[#0a0a0a] border-r border-neutral-800/50 flex flex-col p-6 z-10 shrink-0 overflow-hidden">
          <div className="flex items-center gap-3 mb-10 cursor-pointer group shrink-0">
            <div className="w-8 h-8 rounded bg-[#39FF14] flex items-center justify-center shadow-[0_0_15px_rgba(57,255,20,0.5)] group-hover:shadow-[0_0_25px_rgba(57,255,20,0.8)] transition-all duration-300">
              <Music size={20} className="text-black" />
            </div>
            <h1 className="text-2xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-200 drop-shadow-[0_0_8px_rgba(57,255,20,0.6)]">VANGUARD</h1>
          </div>

          <nav className="flex flex-col gap-1 shrink-0">
            {[{ id: 'home', label: 'Home', icon: Home }, { id: 'settings', label: 'Settings', icon: Settings }].map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveNav(id)}
                className={`flex items-center gap-4 px-4 py-3 rounded-lg transition-all duration-200 w-full text-left
                  ${activeNav === id ? 'bg-neutral-800/50 text-[#39FF14] shadow-[inset_2px_0_0_#39FF14]' : 'text-neutral-400 hover:text-[#39FF14] hover:bg-neutral-900/50'}`}>
                <Icon size={20} className={activeNav === id ? 'drop-shadow-[0_0_5px_#39FF14]' : ''} />
                <span className="font-medium">{label}</span>
              </button>
            ))}
            <button onClick={() => setIsQueueOpen(o => !o)}
              className={`flex items-center gap-4 px-4 py-3 rounded-lg transition-all duration-200 w-full text-left
                ${isQueueOpen ? 'bg-neutral-800/50 text-[#39FF14] shadow-[inset_2px_0_0_#39FF14]' : 'text-neutral-400 hover:text-[#39FF14] hover:bg-neutral-900/50'}`}>
              <ListOrdered size={20} className={isQueueOpen ? 'drop-shadow-[0_0_5px_#39FF14]' : ''} />
              <span className="font-medium">Queue</span>
              {queue.length > 0 && (
                <span className="ml-auto bg-[#39FF14] text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{queue.length}</span>
              )}
            </button>
          </nav>

          <div className="mt-5 flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between px-1 mb-2 shrink-0">
              <button
                onClick={() => { setSidebarPlaylistsExpanded(o => !o); setActiveNav('library'); setOpenPlaylistId(null); }}
                className={`flex items-center gap-3 flex-1 py-2 px-3 rounded-lg transition-all duration-200 text-left
                  ${activeNav === 'library' ? 'text-[#39FF14]' : 'text-neutral-400 hover:text-[#39FF14] hover:bg-neutral-900/50'}`}
              >
                <ListMusic size={20} className={activeNav === 'library' ? 'drop-shadow-[0_0_5px_#39FF14]' : ''} />
                <span className="font-medium">Playlists</span>
                <ChevronRight size={14} className={`ml-auto transition-transform duration-200 ${sidebarPlaylistsExpanded ? 'rotate-90' : ''}`} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setNewPlaylistName(''); setNewPlaylistDesc(''); setIsPlaylistModalOpen(true); }}
                className="p-1.5 ml-1 text-neutral-600 hover:text-[#39FF14] transition-colors rounded-md hover:bg-neutral-900/50 shrink-0"
                title="New playlist"
              >
                <PlusCircle size={15} />
              </button>
            </div>

            {sidebarPlaylistsExpanded && (
              <div className="flex-1 overflow-y-auto custom-scrollbar -mx-1 px-1">
                <div className="flex flex-col gap-0.5 pb-2">
                  {playlists.map((playlist) => {
                    const isOpen = openPlaylistId === playlist.id && activeNav === 'library';
                    const cover = getPlaylistCover(playlist);
                    return (
                      <button key={playlist.id}
                        onClick={() => { setOpenPlaylistId(playlist.id); setActiveNav('library'); }}
                        onContextMenu={(e) => openCtx(e, { type: 'sidebar-playlist', playlist })}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 w-full text-left group
                          ${isOpen ? 'bg-[#39FF14]/[0.08] text-[#39FF14] border border-[#39FF14]/15' : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-900/50 border border-transparent'}`}
                      >
                        <div className="w-7 h-7 rounded-md overflow-hidden shrink-0 border border-neutral-800/60">
                          {cover
                            ? <img src={cover} className="w-full h-full object-cover" alt="" />
                            : <div className={`w-full h-full flex items-center justify-center ${isOpen ? 'bg-[#39FF14]/15' : 'bg-neutral-800/60 group-hover:bg-neutral-800'}`}>
                                {playlist.id === 'p1'
                                  ? <Heart size={12} className={isOpen ? 'text-[#39FF14] fill-[#39FF14]' : 'text-neutral-500 group-hover:text-red-400'} />
                                  : <ListMusic size={12} className={isOpen ? 'text-[#39FF14]' : 'text-neutral-500'} />}
                              </div>}
                        </div>
                        <span className="text-[13px] font-medium truncate flex-1">{playlist.name}</span>
                        {playlist.tracks.length > 0 && (
                          <span className={`text-[10px] font-bold tabular-nums shrink-0 ${isOpen ? 'text-[#39FF14]/70' : 'text-neutral-700 group-hover:text-neutral-500'}`}>
                            {playlist.tracks.length}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 shrink-0">
            <button className="w-full relative group overflow-hidden rounded-lg bg-transparent border border-[#39FF14]/50 py-3 px-4 flex items-center justify-center gap-2 transition-all duration-300 hover:border-[#39FF14] hover:shadow-[0_0_20px_rgba(57,255,20,0.3)]">
              <div className="absolute inset-0 bg-[#39FF14]/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              <DownloadCloud size={18} className="text-[#39FF14] relative z-10" />
              <span className="text-sm font-semibold text-[#39FF14] relative z-10">Import from Spotify</span>
            </button>
          </div>
        </div>

        {/* ── CENTER ── */}
        <div className="flex-1 flex flex-col bg-gradient-to-b from-[#0f1115] to-[#050505] overflow-hidden relative">
          <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#39FF14]/10 via-transparent to-transparent" />

          {activeNav === 'home' ? (
            <>
              <div className="p-6 pb-3 relative z-30 shrink-0">
                <div className="relative w-full" onClick={(e) => e.stopPropagation()}>
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    {isSearching
                      ? <div className="w-4 h-4 border-2 border-[#39FF14]/70 border-t-transparent rounded-full animate-spin" />
                      : <Search size={18} className={`transition-colors duration-200 ${showHistory || searchQuery ? 'text-[#39FF14]' : 'text-neutral-500'}`} />}
                  </div>
                  <input ref={searchRef} type="text"
                    placeholder="Search YouTube or enter a URL... (Ctrl+F)"
                    value={searchQuery}
                    onChange={(e) => !isSearching && setSearchQuery(e.target.value)}
                    onFocus={() => !isSearching && setShowHistory(searchHistory.length > 0)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { setShowHistory(false); searchMusic(); } if (e.key === 'Escape') setShowHistory(false); }}
                    className={`w-full bg-[#111] border text-white rounded-xl py-3 pl-11 pr-4 focus:outline-none transition-all duration-200 placeholder-neutral-600 font-medium text-sm
                      ${isSearching ? 'border-[#39FF14]/40 ring-1 ring-[#39FF14]/30 opacity-70 cursor-not-allowed' : 'border-neutral-800 focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14] focus:shadow-[0_0_20px_rgba(57,255,20,0.1)]'}`}
                  />
                  {showHistory && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#0e0e0e] border border-neutral-800/80 rounded-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.6)] z-[100]">
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-800/50">
                        <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-600">Recent searches</span>
                        <button onClick={(e) => { e.stopPropagation(); setSearchHistory([]); setShowHistory(false); }} className="text-[11px] text-neutral-600 hover:text-red-400 transition-colors px-1">Clear</button>
                      </div>
                      {searchHistory.map((h, i) => (
                        <button key={i} onClick={(e) => { e.stopPropagation(); setSearchQuery(h); setShowHistory(false); searchMusic(h); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left">
                          <Clock size={13} className="text-neutral-600 shrink-0" />
                          <span className="text-sm text-neutral-300 truncate flex-1">{h}</span>
                          <ChevronRight size={12} className="text-neutral-700 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 pb-4 z-10 custom-scrollbar" onClick={() => setShowHistory(false)}>
                {!isSearching && tracks.length === 0 && quickPicks.length > 0 && (
                  <div className="mb-6 pt-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="w-1.5 h-5 bg-[#39FF14] rounded-full shadow-[0_0_8px_#39FF14] shrink-0" />
                      <h2 className="text-base font-bold text-white flex-1">Quick Picks</h2>
                      <button onClick={() => { setQuickPicks([]); showToast("Quick Picks cleared"); }} className="text-[11px] text-neutral-600 hover:text-neutral-400 transition-colors">Clear</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {quickPicks.slice(0, 8).map((track) => {
                        const isActive = currentTrack?.url === track.url;
                        const isLoading = isLoadingTrack && isActive;
                        return (
                          <div key={track.url}
                            onClick={() => handlePlayTrack(track)}
                            onContextMenu={(e) => openCtx(e, { type: 'quickpick', track })}
                            className={`flex items-center gap-3 rounded-lg p-3 cursor-pointer transition-all duration-150 group border
                              ${isActive ? 'bg-[#39FF14]/[0.07] border-[#39FF14]/20' : 'bg-neutral-900/40 border-neutral-800/30 hover:bg-neutral-800/60 hover:border-neutral-700/50'}`}>
                            <div className="relative w-12 h-12 rounded-md overflow-hidden shrink-0">
                              <img src={track.cover} alt={track.title} className="w-full h-full object-cover" loading="lazy" />
                              <div className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity duration-150 ${isLoading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                {isLoading
                                  ? <div className="w-4 h-4 border-2 border-[#39FF14] border-t-transparent rounded-full animate-spin" />
                                  : isActive && isPlaying
                                    ? <div className="flex gap-[2px] items-end h-3">
                                        <div className="w-[2px] bg-[#39FF14] rounded-full animate-pulse" style={{ height: '100%' }} />
                                        <div className="w-[2px] bg-[#39FF14] rounded-full animate-pulse" style={{ height: '65%', animationDelay: '150ms' }} />
                                        <div className="w-[2px] bg-[#39FF14] rounded-full animate-pulse" style={{ height: '80%', animationDelay: '300ms' }} />
                                      </div>
                                    : <Play size={14} fill="white" className="text-white ml-0.5" />}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold truncate ${isActive ? 'text-[#39FF14]' : 'text-white'}`}>{track.title}</p>
                              <p className="text-xs text-neutral-500 truncate mt-0.5">{track.artist}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(isSearching || tracks.length > 0) && (
                  <div className="flex items-center gap-3 mb-3 py-2">
                    <span className="w-1.5 h-5 bg-[#39FF14] rounded-full shadow-[0_0_8px_#39FF14] shrink-0" />
                    <h2 className="text-base font-bold text-white flex-1">{isSearching ? 'Scanning...' : 'Search Results'}</h2>
                    {isSearching && (
                      <div className="flex gap-1 items-end h-4">
                        {[100, 60, 80, 50].map((h, i) => (
                          <div key={i} className="w-1 bg-[#39FF14]/60 rounded-full animate-pulse shadow-[0_0_4px_#39FF14]" style={{ height: `${h}%`, animationDelay: `${i * 100}ms` }} />
                        ))}
                      </div>
                    )}
                    {tracks.length > 0 && !isSearching && (
                      <button onClick={() => playAll(tracks)} className="flex items-center gap-2 px-3 py-1.5 bg-[#39FF14]/10 border border-[#39FF14]/30 text-[#39FF14] rounded-lg text-xs font-semibold hover:bg-[#39FF14]/20 transition-colors">
                        <Play size={12} fill="currentColor" /> Play All
                      </button>
                    )}
                  </div>
                )}
                {(tracks.length > 0 || isSearching) && (
                  <div className="flex items-center gap-4 px-4 mb-1 border-b border-neutral-800/40 pb-2">
                    <div className="w-8 shrink-0" /><div className="w-12 shrink-0" />
                    <p className="flex-1 text-[11px] font-semibold uppercase tracking-widest text-neutral-600">Title</p>
                    <div className="w-20 shrink-0" />
                    <Clock size={12} className="text-neutral-600 w-12 shrink-0" />
                  </div>
                )}
                {isSearching && (
                  <div className="flex flex-col gap-1 mt-1">
                    {Array.from({ length: 8 }).map((_, i) => <TrackRowSkeleton key={i} index={i} />)}
                  </div>
                )}
                {!isSearching && tracks.length > 0 && (
                  <div className="flex flex-col gap-1 mt-1">
                    {tracks.map((track, i) => <TrackRow key={track.id} track={track} index={i} />)}
                  </div>
                )}
              </div>
            </>

          ) : activeNav === 'library' ? (
            openPlaylist ? (
              <div className="flex-1 overflow-y-auto p-8 z-10 custom-scrollbar">
                <button onClick={() => setOpenPlaylistId(null)} className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors mb-8 group">
                  <ChevronLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
                  <span className="text-sm font-medium">Playlists</span>
                </button>
                <div className="flex items-end gap-6 mb-8">
                  <div
                    className="w-28 h-28 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0 relative group cursor-pointer overflow-hidden"
                    onClick={() => handleCoverUpload(openPlaylist.id)}
                    title="Click to change cover"
                  >
                    {getPlaylistCover(openPlaylist)
                      ? <img src={getPlaylistCover(openPlaylist)!} className="w-full h-full object-cover" alt="" />
                      : openPlaylist.id === 'p1'
                        ? <Heart size={48} className="text-red-400" />
                        : <ListMusic size={48} className="text-neutral-500" />}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <ImagePlus size={22} className="text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-1">Playlist</p>
                    <h2 className="text-3xl font-black text-white truncate">{openPlaylist.name}</h2>
                    {openPlaylist.description && <p className="text-sm text-neutral-500 mt-1 italic">{openPlaylist.description}</p>}
                    <p className="text-sm text-neutral-600 mt-1">{openPlaylist.tracks.length} tracks</p>
                    <div className="flex items-center gap-3 mt-4">
                      <button onClick={() => playAll(openPlaylist.tracks)} disabled={!openPlaylist.tracks.length}
                        className="flex items-center gap-2 px-5 py-2 bg-[#39FF14] text-black font-bold rounded-lg hover:shadow-[0_0_20px_#39FF14] transition-all disabled:opacity-40 text-sm">
                        <Play size={16} fill="currentColor" /> Play All
                      </button>
                      <button onClick={() => { setRenamingPlaylist(openPlaylist); setRenameValue(openPlaylist.name); setRenameDescValue(openPlaylist.description); }}
                        className="p-2 text-neutral-500 hover:text-white transition-colors rounded-lg hover:bg-white/5">
                        <Pencil size={16} />
                      </button>
                      {openPlaylist.id !== 'p1' && (
                        <button onClick={() => { deletePlaylist(openPlaylist.id); setOpenPlaylistId(null); }}
                          className="p-2 text-neutral-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {openPlaylist.tracks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-neutral-700 gap-3">
                    <Music size={32} strokeWidth={1} />
                    <p className="text-sm">No tracks yet. Search for music and add them here.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {openPlaylist.tracks.map((t, i) => (
                      <TrackRow key={t.url} track={t} index={i} showRemove onRemove={() => removeFromPlaylist(openPlaylist.id, t.url)} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-8 z-10 custom-scrollbar">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                    <ListMusic className="text-[#39FF14] drop-shadow-[0_0_8px_#39FF14]" size={32} /> Playlists
                  </h2>
                  <button onClick={() => { setNewPlaylistName(''); setNewPlaylistDesc(''); setIsPlaylistModalOpen(true); }}
                    className="px-5 py-2.5 bg-transparent border border-[#39FF14]/50 text-[#39FF14] rounded-lg hover:bg-[#39FF14] hover:text-black transition-all duration-300 font-semibold flex items-center gap-2">
                    <ListMusic size={18} /> Create Playlist
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
                  {playlists.map((playlist) => {
                    const cover = getPlaylistCover(playlist);
                    return (
                      <div key={playlist.id}
                        className="group relative cursor-pointer bg-[#0d0d0d] p-4 rounded-xl border border-neutral-800/50 hover:border-[#39FF14]/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(57,255,20,0.12)]"
                        onClick={() => setOpenPlaylistId(playlist.id)}
                        onContextMenu={(e) => openCtx(e, { type: 'playlist', playlist })}
                      >
                        <div className="aspect-square rounded-lg overflow-hidden bg-neutral-900/80 flex items-center justify-center mb-3 group-hover:bg-[#39FF14]/10 transition-colors duration-300 relative">
                          {cover
                            ? <img src={cover} className="w-full h-full object-cover" alt="" />
                            : playlist.id === 'p1'
                              ? <Heart size={40} className="text-red-400 group-hover:text-red-500 transition-all duration-300" />
                              : <ListMusic size={40} className="text-neutral-500 group-hover:text-[#39FF14] transition-all duration-300" />}
                          {playlist.tracks.length > 0 && (
                            <div className="absolute bottom-2 right-2 bg-[#39FF14] text-black text-xs font-bold px-1.5 py-0.5 rounded-full shadow-[0_0_5px_#39FF14]">{playlist.tracks.length}</div>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); playAll(playlist.tracks); }}
                              className="w-10 h-10 bg-[#39FF14] rounded-full flex items-center justify-center shadow-[0_0_15px_#39FF14] hover:scale-110 transition-transform">
                              <Play size={18} fill="black" className="text-black ml-0.5" />
                            </button>
                          </div>
                        </div>
                        <h3 className="font-bold text-white group-hover:text-[#39FF14] transition-colors truncate text-sm">{playlist.name}</h3>
                        {playlist.description && <p className="text-xs text-neutral-600 truncate mt-0.5">{playlist.description}</p>}
                        <p className="text-xs text-neutral-600 mt-0.5">{playlist.tracks.length} tracks</p>
                        {playlist.id !== 'p1' && (
                          <button onClick={(e) => { e.stopPropagation(); deletePlaylist(playlist.id); }}
                            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 bg-black/60 rounded-md hover:bg-red-500/30 hover:text-red-400 text-neutral-500 transition-all">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ) : (
            <SettingsPanel downloadQuality={downloadQuality} setDownloadQuality={setDownloadQuality}
              downloadPath={downloadPath} handleSelectDirectory={handleSelectDirectory} />
          )}
        </div>

        {/* ── QUEUE PANEL ── */}
        <div className={`shrink-0 bg-[#0a0a0a] border-l border-neutral-800/50 flex flex-col transition-all duration-300 ease-in-out overflow-hidden ${isQueueOpen ? 'w-80' : 'w-0'}`}>
          {isQueueOpen && (
            <>
              <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800/50 shrink-0">
                <div className="flex items-center gap-2.5">
                  <ListOrdered size={18} className="text-[#39FF14]" />
                  <h3 className="font-bold text-white text-[15px]">Queue</h3>
                  {queue.length > 0 && <span className="bg-[#39FF14] text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{queue.length}</span>}
                </div>
                {queue.length > 0 && (
                  <button onClick={() => { setQueue([]); showToast("Queue cleared"); }} className="text-xs text-neutral-600 hover:text-red-400 transition-colors">Clear</button>
                )}
              </div>
              {currentTrack && (
                <div className="px-4 py-3.5 border-b border-neutral-800/40 shrink-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600 mb-3">Now Playing</p>
                  <div className="flex items-center gap-3 rounded-lg p-2.5 cursor-pointer bg-[#39FF14]/[0.05] border border-[#39FF14]/15 hover:bg-[#39FF14]/[0.09] transition-colors"
                    onContextMenu={(e) => openCtx(e, { type: 'track', track: currentTrack })}
                    onClick={() => handlePlayTrack(currentTrack, true)}>
                    <div className="relative w-11 h-11 rounded-md overflow-hidden shrink-0 border border-[#39FF14]/30">
                      <img src={currentTrack.cover} className="w-full h-full object-cover" alt="" />
                      {isLoadingTrack && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><div className="w-4 h-4 border-2 border-[#39FF14] border-t-transparent rounded-full animate-spin" /></div>}
                      {!isLoadingTrack && isPlaying && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="flex gap-[2px] items-end h-3.5">
                            <div className="w-[2.5px] bg-[#39FF14] rounded-full animate-pulse" style={{ height: '100%' }} />
                            <div className="w-[2.5px] bg-[#39FF14] rounded-full animate-pulse" style={{ height: '60%', animationDelay: '150ms' }} />
                            <div className="w-[2.5px] bg-[#39FF14] rounded-full animate-pulse" style={{ height: '80%', animationDelay: '300ms' }} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#39FF14] truncate leading-snug">{currentTrack.title}</p>
                      <p className="text-xs text-neutral-500 truncate mt-0.5">{currentTrack.artist}</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {queue.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-neutral-700 gap-2">
                    <ListOrdered size={26} strokeWidth={1} />
                    <p className="text-sm">Queue is empty</p>
                  </div>
                ) : (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600 px-5 pt-4 pb-2">Up Next</p>
                    {queue.map((track, i) => (
                      <div key={i}
                        onContextMenu={(e) => openCtx(e, { type: 'queue-track', track })}
                        onClick={() => { setQueue(prev => prev.filter((_, idx) => idx !== i)); handlePlayTrack(track, true); }}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer group transition-colors ${currentTrack?.url === track.url ? 'bg-[#39FF14]/[0.06]' : 'hover:bg-white/[0.04]'}`}>
                        <div className="w-5 shrink-0 flex items-center justify-center">
                          <span className="text-xs text-neutral-700 group-hover:hidden tabular-nums">{i + 1}</span>
                          <Play size={12} fill="white" className="text-white hidden group-hover:block" />
                        </div>
                        <img src={track.cover} className="w-10 h-10 rounded-md object-cover shrink-0 border border-neutral-800/60" alt="" />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate leading-snug ${currentTrack?.url === track.url ? 'text-[#39FF14]' : 'text-white'}`}>{track.title}</p>
                          <p className="text-xs text-neutral-500 truncate mt-0.5">{track.artist}</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); removeFromQueue(i); }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-neutral-600 hover:text-red-400 transition-all shrink-0 rounded">
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── PLAYER BAR ── */}
      <div className="h-[88px] bg-[#080808] border-t border-neutral-800/80 flex items-center justify-between px-6 relative z-20 shadow-[0_-5px_30px_rgba(0,0,0,0.5)] shrink-0">
        {isPlaying && !isLoadingTrack && (
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#39FF14]/50 to-transparent" />
        )}
        {isLoadingTrack && (
          <div className="absolute top-0 left-0 w-full h-[2px] overflow-hidden bg-neutral-800/40">
            <div className="h-full bg-[#39FF14]/80 shadow-[0_0_6px_#39FF14]" style={{ animation: 'loadbar 1.4s ease-in-out infinite', width: '35%' }} />
          </div>
        )}

        {/* Left */}
        <div className="flex items-center gap-4 w-1/4 min-w-[180px]">
          {currentTrack ? (
            <>
              <div className="relative w-14 h-14 rounded-md overflow-hidden group border border-neutral-800 shrink-0 cursor-pointer"
                onClick={() => setInfoModalTrack(currentTrack)}
                onContextMenu={(e) => openCtx(e, { type: 'track', track: currentTrack })}>
                <img src={currentTrack.cover} alt={currentTrack.title} className={`w-full h-full object-cover transition-opacity duration-300 ${isLoadingTrack ? 'opacity-40' : 'opacity-100'}`} />
                {isLoadingTrack
                  ? <div className="absolute inset-0 flex items-center justify-center bg-black/30"><div className="w-5 h-5 border-2 border-[#39FF14] border-t-transparent rounded-full animate-spin" /></div>
                  : <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"><Info size={16} className="text-white" /></div>}
              </div>
              <div className="flex flex-col overflow-hidden max-w-[140px]">
                <span className="font-bold text-white text-sm truncate cursor-pointer hover:underline" onClick={() => setInfoModalTrack(currentTrack)}>{currentTrack.title}</span>
                {isLoadingTrack
                  ? <span className="text-xs text-[#39FF14]/70 flex items-center gap-1.5 mt-0.5">
                      <span className="flex gap-[3px] items-end h-3">
                        {[1,0.6,0.8,0.5].map((h, i) => <span key={i} className="w-[2px] bg-[#39FF14]/60 rounded-full animate-pulse inline-block" style={{ height: `${h * 100}%`, animationDelay: `${i * 120}ms` }} />)}
                      </span>
                      Buffering...
                    </span>
                  : <span className="text-xs text-neutral-400 truncate">{currentTrack.artist}</span>}
              </div>
              <button onClick={() => toggleLikeTrack(currentTrack)} className="ml-1 p-1.5 focus:outline-none hover:scale-110 active:scale-95 transition-transform shrink-0">
                <Heart size={18} className={isTrackLiked(currentTrack.url) ? 'text-[#39FF14] fill-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.6)]' : 'text-neutral-400 hover:text-white'} />
              </button>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-md border border-neutral-800/50 bg-[#0d0d0d] flex items-center justify-center shrink-0"><Music size={20} className="text-neutral-600" /></div>
              <div className="flex flex-col overflow-hidden">
                <span className="font-bold text-neutral-600 text-sm">No track selected</span>
                <span className="text-xs text-neutral-700">---</span>
              </div>
            </>
          )}
        </div>

        {/* Center */}
        <div className="flex flex-col items-center justify-center w-2/4 gap-2 max-w-2xl">
          <div className="flex items-center gap-5">
            <button onClick={toggleShuffle} title="Shuffle" className={`transition-all duration-200 ${shuffle ? 'text-[#39FF14] drop-shadow-[0_0_6px_#39FF14]' : 'text-neutral-600 hover:text-neutral-300'}`}>
              <Shuffle size={18} />
            </button>
            <button onClick={handleSkipBack} className={`transition-all duration-200 ${currentTrack ? 'text-neutral-300 hover:text-[#39FF14]' : 'text-neutral-700 cursor-not-allowed'}`}>
              <SkipBack size={22} />
            </button>

            {/* PLAY/PAUSE: isPlaying=true → show Pause; isPlaying=false → show Play */}
            <button
              onClick={togglePlayPause}
              disabled={!currentTrack || isLoadingTrack}
              className="w-11 h-11 flex items-center justify-center rounded-full bg-white text-black hover:bg-[#39FF14] hover:shadow-[0_0_20px_#39FF14] hover:scale-105 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:hover:bg-white disabled:hover:shadow-none"
            >
              {isLoadingTrack
                ? <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                : isPlaying
                  ? <Pause fill="currentColor" size={22} />
                  : <Play fill="currentColor" size={22} className="ml-0.5" />}
            </button>

            <button onClick={handleSkipForward} className={`transition-all duration-200 ${queue.length > 0 ? 'text-neutral-300 hover:text-[#39FF14]' : 'text-neutral-700 cursor-not-allowed'}`}>
              <SkipForward size={22} />
            </button>
            <button onClick={cycleRepeat} title="Repeat" className={`transition-all duration-200 ${repeatMode !== 'off' ? 'text-[#39FF14] drop-shadow-[0_0_6px_#39FF14]' : 'text-neutral-600 hover:text-neutral-300'}`}>
              {repeatMode === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
            </button>
          </div>

          <div className="w-full flex items-center gap-3 group mt-1">
            <span className="text-xs font-medium text-neutral-400 tabular-nums min-w-[32px] text-right">{currentTrack ? formatTime(progressSeconds) : '0:00'}</span>
            <div
              ref={progressRef}
              className="slider-track relative flex-1 h-1 bg-neutral-800 rounded-full cursor-pointer hover:h-1.5 transition-[height] duration-150 ease-out"
              onMouseDown={(e) => { isDraggingProgressRef.current = true; setIsDraggingProgress(true); updateProgressFromEvent(e.clientX); }}
            >
              <div
                className="absolute top-0 left-0 h-full bg-[#39FF14] rounded-full shadow-[0_0_6px_rgba(57,255,20,0.5)] pointer-events-none"
                style={{ width: `${calculateProgressPercent()}%`, transition: isDraggingProgress ? 'none' : 'width 0.5s linear' }}
              >
                <div className="slider-thumb absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_6px_rgba(255,255,255,0.8)] opacity-0 pointer-events-none" />
              </div>
            </div>
            <span className="text-xs font-medium text-neutral-400 tabular-nums min-w-[32px]">{currentTrack ? currentTrack.duration : '0:00'}</span>
          </div>
        </div>

        {/* Right */}
        <div className="w-1/4 flex items-center justify-end gap-3 group pr-4">
          <button onClick={toggleMute} className="focus:outline-none shrink-0">
            {volume === 0 ? <VolumeX size={18} className="text-red-500 hover:text-red-400 transition-colors" /> : <Volume2 size={18} className="text-neutral-400 hover:text-white transition-colors" />}
          </button>
          <div
            ref={volumeRef}
            className="slider-track relative w-24 h-1 bg-neutral-800 rounded-full cursor-pointer hover:h-1.5 transition-[height] duration-150 ease-out"
            onMouseDown={(e) => { setIsDraggingVolume(true); updateVolumeFromEvent(e.clientX); }}
          >
            <div
              className="absolute top-0 left-0 h-full rounded-full pointer-events-none"
              style={{ width: `${volume}%`, background: volume > 0 ? '#39FF14' : '#404040', boxShadow: volume > 0 ? '0 0 5px rgba(57,255,20,0.45)' : 'none', transition: isDraggingVolume ? 'none' : 'width 0.15s ease-out' }}
            >
              <div className="slider-thumb absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_5px_rgba(255,255,255,0.7)] opacity-0 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* ── UNIVERSAL CONTEXT MENU ── */}
      {ctxMenu && (() => {
        const track = ctxMenu.track;
        const playlist = ctxMenu.playlist;

        if ((ctxMenu.type === 'track' || ctxMenu.type === 'quickpick' || ctxMenu.type === 'queue-track') && track) {
          return (
            <div className="fixed z-50 bg-[#0a0a0a] border border-neutral-800 rounded-xl shadow-2xl py-2 w-64 text-sm font-medium text-neutral-300"
              style={{ top: ctxMenu.y, left: ctxMenu.x }} onClick={(e) => e.stopPropagation()}>
              <div className="px-4 py-3 border-b border-neutral-800 mb-1 flex items-center gap-3">
                <img src={track.cover} className="w-10 h-10 rounded-md object-cover shrink-0" alt="" />
                <div className="flex flex-col overflow-hidden">
                  <span className="text-white truncate font-bold text-[13px]">{track.title}</span>
                  <span className="text-xs text-neutral-500 truncate">{track.artist}</span>
                </div>
              </div>
              <button onClick={() => { handlePlayTrack(track); setCtxMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors"><Play size={15} /> Play Now</button>
              <button onClick={() => { setQueue([track, ...queue]); showToast("Playing next"); setCtxMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors"><PlaySquare size={15} /> Play Next</button>
              <button onClick={() => { setQueue([...queue, track]); showToast("Added to queue"); setCtxMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors"><ListPlus size={15} /> Add to Queue</button>
              <button onClick={() => { toggleLikeTrack(track); setCtxMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors">
                <Heart size={15} className={isTrackLiked(track.url) ? 'text-[#39FF14] fill-[#39FF14]' : ''} />
                {isTrackLiked(track.url) ? 'Remove from Liked' : 'Add to Liked Songs'}
              </button>
              <button onClick={(e) => { e.stopPropagation(); setAddToPlaylistTrack(track); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors"><PlusCircle size={15} /> Add to Playlist</button>
              {ctxMenu.type === 'queue-track' && (
                <button onClick={() => { removeFromQueue(queue.findIndex(q => q.url === track.url)); setCtxMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-500/20 hover:text-red-400 transition-colors"><X size={15} /> Remove from Queue</button>
              )}
              <div className="h-px bg-neutral-800 my-1" />
              <button onClick={() => { setInfoModalTrack(track); setCtxMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors"><Info size={15} /> Track Info</button>
              <button onClick={() => { copyToClipboard(track.url); setCtxMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors"><Share2 size={15} /> Copy Link</button>
              <button onClick={() => { handleDownload(track); setCtxMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors">
                {downloadingTracks[track.url] ? <div className="w-4 h-4 rounded-full border-2 border-[#39FF14] border-t-transparent animate-spin" /> : <Download size={15} />}
                Download MP3
              </button>
              <button onClick={() => { openInYouTube(track.url); setCtxMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors"><ExternalLink size={15} /> Open in YouTube</button>
            </div>
          );
        }

        if ((ctxMenu.type === 'playlist' || ctxMenu.type === 'sidebar-playlist') && playlist) {
          return (
            <div className="fixed z-50 bg-[#0a0a0a] border border-neutral-800 rounded-xl shadow-2xl py-2 w-56 text-sm font-medium text-neutral-300"
              style={{ top: ctxMenu.y, left: ctxMenu.x }} onClick={(e) => e.stopPropagation()}>
              <div className="px-4 py-2.5 border-b border-neutral-800 mb-1">
                <span className="text-white font-bold text-[13px] truncate block">{playlist.name}</span>
                <span className="text-xs text-neutral-600">{playlist.tracks.length} tracks</span>
              </div>
              <button onClick={() => { playAll(playlist.tracks); setCtxMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors"><Play size={15} /> Play All</button>
              <button onClick={() => {
                const shuffled = [...playlist.tracks].sort(() => Math.random() - 0.5);
                if (shuffled.length) { handlePlayTrack(shuffled[0]); setQueue(shuffled.slice(1)); }
                setCtxMenu(null);
              }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors"><Shuffle size={15} /> Shuffle Play</button>
              <button onClick={() => { setQueue(prev => [...prev, ...playlist.tracks]); showToast(`Added ${playlist.tracks.length} tracks to queue`); setCtxMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors"><ListPlus size={15} /> Add to Queue</button>
              <div className="h-px bg-neutral-800 my-1" />
              <button onClick={() => { setRenamingPlaylist(playlist); setRenameValue(playlist.name); setRenameDescValue(playlist.description); setCtxMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors"><Pencil size={15} /> Edit Playlist</button>
              <button onClick={() => { handleCoverUpload(playlist.id); setCtxMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors"><ImagePlus size={15} /> Change Cover</button>
              {playlist.id !== 'p1' && (
                <button onClick={() => { deletePlaylist(playlist.id); setCtxMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-500/20 hover:text-red-400 transition-colors"><Trash2 size={15} /> Delete Playlist</button>
              )}
            </div>
          );
        }
        return null;
      })()}

      {/* ── ADD TO PLAYLIST MODAL ── */}
      {addToPlaylistTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setAddToPlaylistTrack(null)}>
          <div className="bg-[#111] border border-neutral-800 rounded-xl w-80 overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
              <h3 className="font-bold text-white">Add to Playlist</h3>
              <button onClick={() => setAddToPlaylistTrack(null)} className="text-neutral-500 hover:text-white transition-colors"><X size={18} /></button>
            </div>
            <div className="py-2 max-h-64 overflow-y-auto custom-scrollbar">
              {playlists.map(p => (
                <button key={p.id} onClick={() => addTrackToPlaylist(p.id, addToPlaylistTrack)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors text-left">
                  {p.id === 'p1' ? <Heart size={16} className="text-red-400 shrink-0" /> : <ListMusic size={16} className="text-neutral-500 shrink-0" />}
                  <span className="text-sm text-white truncate">{p.name}</span>
                  <span className="ml-auto text-xs text-neutral-600">{p.tracks.length}</span>
                </button>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-neutral-800">
              <button onClick={() => { setAddToPlaylistTrack(null); setNewPlaylistName(''); setNewPlaylistDesc(''); setIsPlaylistModalOpen(true); }}
                className="flex items-center gap-2 text-[#39FF14] text-sm font-medium hover:underline">
                <PlusCircle size={14} /> New Playlist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── INFO MODAL ── */}
      {infoModalTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="relative h-48 w-full shrink-0">
              <img src={infoModalTrack.cover} className="w-full h-full object-cover opacity-40 blur-md" alt="" />
              <div className="absolute inset-0 flex items-center justify-center pt-4">
                <img src={infoModalTrack.cover} className="h-32 w-32 rounded-lg shadow-2xl object-cover" alt="" />
              </div>
              <button onClick={() => setInfoModalTrack(null)} className="absolute top-4 right-4 bg-black/60 p-2 rounded-full hover:bg-white hover:text-black transition-colors"><X size={18} /></button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-gradient-to-b from-[#111] to-[#0a0a0a]">
              <div className="flex gap-2 mb-6">
                <span className="bg-[#1a1a1a] px-3 py-1.5 rounded-full text-xs font-bold border border-neutral-800 flex items-center gap-2 text-cyan-400"><Clock size={12} /> {infoModalTrack.duration}</span>
                <span className="bg-[#1a1a1a] px-3 py-1.5 rounded-full text-xs font-bold border border-neutral-800 flex items-center gap-2 text-red-500"><Youtube size={12} /> YouTube</span>
              </div>
              <div className="space-y-2 mb-6">
                {[
                  { icon: Music, label: 'Title', value: infoModalTrack.title, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                  { icon: FileBadge2, label: 'Artist', value: infoModalTrack.artist, color: 'text-purple-400', bg: 'bg-purple-500/10' },
                  { icon: Disc, label: 'Album', value: 'Unknown', color: 'text-pink-400', bg: 'bg-pink-500/10' },
                  { icon: Hash, label: 'Genre', value: 'VIDEO', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                ].map(({ icon: Icon, label, value, color, bg }) => (
                  <div key={label} className="flex items-center gap-4 p-3 bg-[#111] rounded-xl border border-neutral-800/50">
                    <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center ${color}`}><Icon size={20} /></div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-xs text-neutral-500">{label}</span>
                      <span className="font-bold text-sm truncate">{value}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 p-3 bg-[#111] rounded-xl border border-neutral-800/50 mb-6">
                <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400"><FileCode2 size={20} /></div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-xs text-neutral-500">Media ID</span>
                  <span className="font-mono text-sm text-neutral-300">{infoModalTrack.url.split('v=')[1] || 'Unknown'}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button onClick={() => copyToClipboard(infoModalTrack.url.split('v=')[1])} className="p-3 bg-[#111] rounded-xl hover:bg-neutral-800 transition-colors border border-neutral-800 flex items-center justify-center gap-2 text-sm font-medium"><Copy size={16} /> Copy ID</button>
                <button onClick={() => copyToClipboard(infoModalTrack.url)} className="p-3 bg-[#111] rounded-xl hover:bg-neutral-800 transition-colors border border-neutral-800 flex items-center justify-center gap-2 text-sm font-medium"><Share2 size={16} /> Copy Link</button>
              </div>
              <button onClick={() => openInYouTube(infoModalTrack.url)} className="w-full p-3 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 transition-colors border border-red-500/20 flex items-center justify-center gap-2 text-sm font-bold"><ExternalLink size={18} /> Open in YouTube</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE PLAYLIST MODAL ── */}
      {isPlaylistModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#111] border border-[#39FF14]/40 p-6 rounded-xl w-96 shadow-[0_0_30px_rgba(57,255,20,0.1)]">
            <h3 className="text-xl font-bold text-white mb-5">Create Playlist</h3>
            <div className="flex flex-col gap-3 mb-6">
              <div>
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">Name</label>
                <input autoFocus type="text" value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} placeholder="e.g. Cyberpunk Mix"
                  className="w-full bg-[#050505] border border-neutral-800 text-white rounded-lg py-2.5 px-3 focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14] transition-all placeholder-neutral-700"
                  onKeyDown={(e) => e.key === 'Enter' && confirmCreatePlaylist()} />
              </div>
              <div>
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <AlignLeft size={11} /> Description <span className="text-neutral-700 normal-case font-normal">(optional)</span>
                </label>
                <textarea value={newPlaylistDesc} onChange={(e) => setNewPlaylistDesc(e.target.value)} placeholder="What's this playlist about?" rows={2}
                  className="w-full bg-[#050505] border border-neutral-800 text-white rounded-lg py-2.5 px-3 focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14] transition-all placeholder-neutral-700 resize-none text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setIsPlaylistModalOpen(false)} className="px-4 py-2 text-sm font-medium text-neutral-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={confirmCreatePlaylist} disabled={!newPlaylistName.trim()} className="px-4 py-2 bg-[#39FF14] text-black text-sm font-bold rounded-lg hover:shadow-[0_0_15px_#39FF14] transition-all disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT PLAYLIST MODAL ── */}
      {renamingPlaylist && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#111] border border-neutral-800 p-6 rounded-xl w-96 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-5">Edit Playlist</h3>
            <div className="flex flex-col gap-3 mb-6">
              <div>
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">Name</label>
                <input autoFocus type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                  className="w-full bg-[#050505] border border-neutral-800 text-white rounded-lg py-2.5 px-3 focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14] transition-all"
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmRenamePlaylist(); if (e.key === 'Escape') setRenamingPlaylist(null); }} />
              </div>
              <div>
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><AlignLeft size={11} /> Description</label>
                <textarea value={renameDescValue} onChange={(e) => setRenameDescValue(e.target.value)} rows={2}
                  className="w-full bg-[#050505] border border-neutral-800 text-white rounded-lg py-2.5 px-3 focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14] transition-all resize-none text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setRenamingPlaylist(null)} className="px-4 py-2 text-sm font-medium text-neutral-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={confirmRenamePlaylist} className="px-4 py-2 bg-[#39FF14] text-black text-sm font-bold rounded-lg hover:shadow-[0_0_15px_#39FF14] transition-all">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 bg-[#111] border border-neutral-800/80 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-2xl pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}