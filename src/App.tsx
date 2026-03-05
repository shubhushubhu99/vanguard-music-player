import React, { useState, useEffect, useRef } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import { 
  Home, 
  Library, 
  Search, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  ListMusic, 
  Heart, 
  DownloadCloud,
  Music,
  Volume2,
  VolumeX,
  MoreVertical,
  ListPlus,
  Share2,
  Download,
  ExternalLink,
  Copy,
  Info,
  X,
  Clock,
  Youtube,
  Disc,
  Hash,
  FileCode2,
  PlaySquare,
  PlusCircle,
  FileBadge2,
  Settings,
  RefreshCw,
  FolderDown
} from 'lucide-react';

// --- TYPES ---
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
  icon: any;
  tracks: Track[];
};

const INITIAL_PLAYLISTS: Playlist[] = [
  { id: 'p1', name: 'Liked Songs', icon: Heart, tracks: [] },
];

export default function VanguardPlayer() {
  // Application State
  const [tracks, setTracks] = useState<Track[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeNav, setActiveNav] = useState('home');
  const [progressSeconds, setProgressSeconds] = useState(0); 
  const [queue, setQueue] = useState<Track[]>([]);
  
  // Settings State
  const [downloadQuality, setDownloadQuality] = useState('High');
  const [downloadPath, setDownloadPath] = useState('~/Downloads');

  // Volume State
  const [volume, setVolume] = useState(100);
  const [previousVolume, setPreviousVolume] = useState(100);
  
  // Drag State & Refs
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);

  // Playlist Modal State
  const [playlists, setPlaylists] = useState<Playlist[]>(INITIAL_PLAYLISTS);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  // Context Menu & Info Modal State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, track: Track } | null>(null);
  const [infoModalTrack, setInfoModalTrack] = useState<Track | null>(null);
  const [downloadingTracks, setDownloadingTracks] = useState<{ [key: string]: boolean }>({});

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

  // Fetch real playback progress from mpv via Tauri
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying && !isDraggingProgress) {
      interval = setInterval(async () => {
        try {
          const realProgress: number = await invoke("get_progress");
          setProgressSeconds(realProgress);
        } catch (error) {
          // Silently ignore if mpv hasn't fully started
        }
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isPlaying, isDraggingProgress]);

  // --- NATIVE FOLDER PICKER ---
  const handleSelectDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: downloadPath,
      });
      if (selected) {
        setDownloadPath(selected as string);
      }
    } catch (err) {
      console.error("Error opening dialog. Ensure @tauri-apps/plugin-dialog is installed.", err);
    }
  };

  // --- DRAG INTERACTION LOGIC ---

  const updateProgressFromEvent = (clientX: number) => {
    if (!progressRef.current || !currentTrack) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

    const parts = currentTrack.duration.split(':').map(Number);
    let totalSeconds = 0;
    if (parts.length === 3) totalSeconds = (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    else if (parts.length === 2) totalSeconds = (parts[0] * 60) + parts[1];
    else totalSeconds = parts[0] || 0;

    const newTime = totalSeconds * percent;
    setProgressSeconds(newTime);
    return newTime;
  };

  const updateVolumeFromEvent = (clientX: number) => {
    if (!volumeRef.current) return;
    const rect = volumeRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setVolume(percent);
    invoke("set_volume", { volume: percent }).catch(console.error);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingProgress) updateProgressFromEvent(e.clientX);
      if (isDraggingVolume) updateVolumeFromEvent(e.clientX);
    };

    const handleMouseUp = async (e: MouseEvent) => {
      if (isDraggingProgress) {
        const newTime = updateProgressFromEvent(e.clientX);
        if (newTime !== undefined) {
          await invoke("seek_audio", { time: newTime }).catch(console.error);
        }
        setIsDraggingProgress(false);
      }
      if (isDraggingVolume) {
        setIsDraggingVolume(false);
      }
    };

    if (isDraggingProgress || isDraggingVolume) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingProgress, isDraggingVolume, currentTrack]);

  // --- TAURI BACKEND INTEGRATION ---

  const searchMusic = async () => {
    if (!searchQuery.trim()) return;

    try {
      const response: string = await invoke("search_youtube", {
        query: searchQuery
      });

      const parsed = response
        .trim()
        .split("\n")
        .map((line, index) => {
          const [title, uploader, duration, id] = line.split("|");
          return {
            id: index,
            title: title?.trim() || "Unknown Title",
            artist: uploader?.trim() || "Unknown Artist",
            duration: duration?.trim() || "0:00",
            url: `https://youtube.com/watch?v=${id?.trim()}`,
            cover: `https://i.ytimg.com/vi/${id?.trim()}/mqdefault.jpg`
          };
        });

      setTracks(parsed);
    } catch (error) {
      console.error("Error searching music:", error);
    }
  };

  const handlePlayTrack = async (track: Track) => {
    try {
      await invoke("play_audio", { url: track.url });
      setCurrentTrack(track);
      setIsPlaying(true);
      setProgressSeconds(0); 
      await invoke("set_volume", { volume });
    } catch (error) {
      console.error("Error playing track:", error);
    }
  };

  const togglePlayPause = async () => {
    if (!currentTrack) return;
    try {
      await invoke("pause_audio");
      setIsPlaying(!isPlaying);
    } catch (error) {
      console.error("Error pausing track:", error);
    }
  };

  const handlePlayNext = async () => {
    if (queue.length > 0) {
      const nextTrack = queue[0];
      setQueue(queue.slice(1));
      await handlePlayTrack(nextTrack);
    }
  };

  const toggleMute = async () => {
    const newVol = volume === 0 ? previousVolume : 0;
    if (volume > 0) setPreviousVolume(volume);
    setVolume(newVol);
    try {
      await invoke("set_volume", { volume: newVol });
    } catch (error) {
      console.error("Error setting volume:", error);
    }
  };

  // --- CONTEXT ACTIONS & DOWNLOAD ---

  const handleContextMenu = (e: React.MouseEvent, track: Track) => {
    e.preventDefault();
    e.stopPropagation();
    
    const menuWidth = 260;
    const menuHeight = 350;
    let x = e.clientX;
    let y = e.clientY;
    
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
    
    setContextMenu({ x, y, track });
  };

  const handleDownload = async (track: Track) => {
    try {
      setDownloadingTracks(prev => ({ ...prev, [track.url]: true }));
      await invoke("download_song", { 
        url: track.url,
        quality: downloadQuality,
        path: downloadPath
      });
      setTimeout(() => {
         setDownloadingTracks(prev => ({ ...prev, [track.url]: false }));
      }, 2000);
    } catch (error) {
      console.error("Error downloading:", error);
      setDownloadingTracks(prev => ({ ...prev, [track.url]: false }));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const openInYouTube = (url: string) => {
    window.open(url, '_blank');
  };

  // --- PLAYLIST LOGIC ---

  const handleCreatePlaylistClick = () => {
    setNewPlaylistName('');
    setIsPlaylistModalOpen(true);
  };

  const confirmCreatePlaylist = () => {
    if (newPlaylistName.trim() === '') return;
    const newId = `p${playlists.length + 1}`;
    setPlaylists([...playlists, { id: newId, name: newPlaylistName.trim(), icon: ListMusic, tracks: [] }]);
    setIsPlaylistModalOpen(false);
  };

  const toggleLikeTrack = (trackToToggle: Track) => {
    setPlaylists(prev => prev.map(playlist => {
      if (playlist.id === 'p1') {
        const isLiked = playlist.tracks.some(t => t.url === trackToToggle.url);
        if (isLiked) {
          return { ...playlist, tracks: playlist.tracks.filter(t => t.url !== trackToToggle.url) };
        } else {
          return { ...playlist, tracks: [...playlist.tracks, trackToToggle] };
        }
      }
      return playlist;
    }));
  };

  const isTrackLiked = (trackUrl: string) => {
    const likedPlaylist = playlists.find(p => p.id === 'p1');
    return likedPlaylist?.tracks.some(t => t.url === trackUrl) || false;
  };

  // --- UTILS ---
  
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const calculateProgressPercent = () => {
    if (!currentTrack) return 0;
    const parts = currentTrack.duration.split(':').map(Number);
    let totalSeconds = 0;
    
    if (parts.length === 3) {
      totalSeconds = (parts[0] * 3600) + (parts[1] * 60) + parts[2]; 
    } else if (parts.length === 2) {
      totalSeconds = (parts[0] * 60) + parts[1]; 
    } else {
      totalSeconds = parts[0] || 0; 
    }
    
    if (totalSeconds === 0) return 0;
    return Math.min((progressSeconds / totalSeconds) * 100, 100);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#050505] text-white font-sans overflow-hidden selection:bg-[#39FF14] selection:text-black relative">
      
      {/* --- TOP SECTION (3 PANELS) --- */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* 1. LEFT SIDEBAR (NAVIGATION) */}
        <div className="w-64 bg-[#0a0a0a] border-r border-neutral-800/50 flex flex-col p-6 z-10">
          <div className="flex items-center gap-3 mb-10 cursor-pointer group">
            <div className="w-8 h-8 rounded bg-[#39FF14] flex items-center justify-center shadow-[0_0_15px_rgba(57,255,20,0.5)] group-hover:shadow-[0_0_25px_rgba(57,255,20,0.8)] transition-all duration-300">
              <Music size={20} className="text-black" />
            </div>
            <h1 className="text-2xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#39FF14] to-emerald-200 drop-shadow-[0_0_8px_rgba(57,255,20,0.6)]">
              VANGUARD
            </h1>
          </div>

          <nav className="flex flex-col gap-2 mb-auto">
            <button 
              onClick={() => setActiveNav('home')}
              className={`flex items-center gap-4 px-4 py-3 rounded-lg transition-all duration-300 w-full text-left
                ${activeNav === 'home' 
                  ? 'bg-neutral-800/50 text-[#39FF14] shadow-[inset_2px_0_0_#39FF14]' 
                  : 'text-neutral-400 hover:text-[#39FF14] hover:bg-neutral-900/50 hover:shadow-[0_0_10px_rgba(57,255,20,0.1)]'
                }`}
            >
              <Home size={20} className={activeNav === 'home' ? 'drop-shadow-[0_0_5px_#39FF14]' : ''} />
              <span className="font-medium">Home</span>
            </button>
            <button 
              onClick={() => setActiveNav('library')}
              className={`flex items-center gap-4 px-4 py-3 rounded-lg transition-all duration-300 w-full text-left
                ${activeNav === 'library' 
                  ? 'bg-neutral-800/50 text-[#39FF14] shadow-[inset_2px_0_0_#39FF14]' 
                  : 'text-neutral-400 hover:text-[#39FF14] hover:bg-neutral-900/50 hover:shadow-[0_0_10px_rgba(57,255,20,0.1)]'
                }`}
            >
              <Library size={20} className={activeNav === 'library' ? 'drop-shadow-[0_0_5px_#39FF14]' : ''} />
              <span className="font-medium">Library</span>
            </button>
            <button 
              onClick={() => setActiveNav('settings')}
              className={`flex items-center gap-4 px-4 py-3 rounded-lg transition-all duration-300 w-full text-left
                ${activeNav === 'settings' 
                  ? 'bg-neutral-800/50 text-[#39FF14] shadow-[inset_2px_0_0_#39FF14]' 
                  : 'text-neutral-400 hover:text-[#39FF14] hover:bg-neutral-900/50 hover:shadow-[0_0_10px_rgba(57,255,20,0.1)]'
                }`}
            >
              <Settings size={20} className={activeNav === 'settings' ? 'drop-shadow-[0_0_5px_#39FF14]' : ''} />
              <span className="font-medium">Settings</span>
            </button>
          </nav>

          <div className="mt-8">
            <button className="w-full relative group overflow-hidden rounded-lg bg-transparent border border-[#39FF14]/50 py-3 px-4 flex items-center justify-center gap-2 transition-all duration-300 hover:border-[#39FF14] hover:shadow-[0_0_20px_rgba(57,255,20,0.3)] hover:-translate-y-0.5">
              <div className="absolute inset-0 w-full h-full bg-[#39FF14]/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              <DownloadCloud size={18} className="text-[#39FF14] group-hover:drop-shadow-[0_0_5px_#39FF14] relative z-10" />
              <span className="text-sm font-semibold text-[#39FF14] group-hover:drop-shadow-[0_0_5px_#39FF14] relative z-10">
                Import from Spotify
              </span>
            </button>
          </div>
        </div>

        {/* 2. CENTER CONTENT AREA (MAIN) */}
        <div className="flex-1 flex flex-col bg-gradient-to-b from-[#0f1115] to-[#050505] overflow-hidden relative">
          <div className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#39FF14]/10 via-transparent to-transparent"></div>

          {activeNav === 'home' ? (
            <>
              {/* Search Bar */}
              <div className="p-8 pb-4 relative z-10">
                <div className="relative group max-w-2xl">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search size={20} className="text-neutral-500 group-focus-within:text-[#39FF14] transition-colors duration-300" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search YouTube or enter a URL..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchMusic()}
                    className="w-full bg-[#111] border border-neutral-800 text-white rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14] focus:shadow-[0_0_20px_rgba(57,255,20,0.15)] transition-all duration-300 placeholder-neutral-600 font-medium"
                  />
                </div>
              </div>

              {/* Search Results Grid */}
              <div className="flex-1 overflow-y-auto p-8 pt-4 z-10 custom-scrollbar">
                <h2 className="text-xl font-bold mb-6 text-white flex items-center gap-3">
                  <span className="w-1.5 h-6 bg-[#39FF14] rounded-full shadow-[0_0_10px_#39FF14]"></span>
                  {tracks.length > 0 ? "Search Results" : "Play something :)"}
                </h2>
                
                {tracks.length === 0 ? (
                  <div className="text-neutral-500 text-sm">No tracks loaded. Search for something above!</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                    {tracks.map((track) => (
                      <div 
                        key={track.id}
                        onContextMenu={(e) => handleContextMenu(e, track)}
                        onClick={() => handlePlayTrack(track)}
                        className="group relative bg-[#0d0d0d] rounded-xl overflow-hidden cursor-pointer border border-neutral-800/50 transition-all duration-500 hover:-translate-y-2 hover:border-[#39FF14]/50 hover:shadow-[0_10px_30px_rgba(57,255,20,0.15)]"
                      >
                        <div className="relative aspect-video overflow-hidden">
                          <img 
                            src={track.cover} 
                            alt={track.title} 
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-80 group-hover:opacity-100"
                          />
                          <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors duration-300" />
                          
                          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                            {track.duration}
                          </div>

                          <div 
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/60 p-1.5 rounded-md hover:bg-[#39FF14] hover:text-black z-20"
                            onClick={(e) => {
                              e.stopPropagation();
                              setInfoModalTrack(track);
                            }}
                          >
                            <MoreVertical size={16} />
                          </div>

                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                            <div className="w-12 h-12 bg-[#39FF14] rounded-full flex items-center justify-center shadow-[0_0_20px_#39FF14] transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                              <Play fill="black" size={20} className="text-black ml-1" />
                            </div>
                          </div>
                          
                          {currentTrack?.id === track.id && isPlaying && (
                            <div className="absolute top-2 left-2 flex gap-1 items-end h-4 z-10 bg-black/50 p-1 rounded">
                              <div className="w-1 bg-[#39FF14] rounded-full animate-pulse h-full shadow-[0_0_5px_#39FF14]"></div>
                              <div className="w-1 bg-[#39FF14] rounded-full animate-pulse h-2/3 shadow-[0_0_5px_#39FF14]" style={{ animationDelay: '150ms' }}></div>
                              <div className="w-1 bg-[#39FF14] rounded-full animate-pulse h-4/5 shadow-[0_0_5px_#39FF14]" style={{ animationDelay: '300ms' }}></div>
                            </div>
                          )}
                        </div>
                        
                        <div className="p-4 relative">
                          <div className="absolute bottom-0 left-0 h-0.5 w-0 bg-[#39FF14] transition-all duration-500 group-hover:w-full group-hover:shadow-[0_0_10px_#39FF14]"></div>
                          <h3 className="font-bold text-white truncate group-hover:text-[#39FF14] transition-colors duration-300">
                            {track.title}
                          </h3>
                          <p className="text-sm text-neutral-400 mt-1 truncate">
                            {track.artist}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : activeNav === 'library' ? (
            <div className="flex-1 overflow-y-auto p-8 z-10 custom-scrollbar">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                  <Library className="text-[#39FF14] drop-shadow-[0_0_8px_#39FF14]" size={32} />
                  Your Library
                </h2>
                <button 
                  onClick={handleCreatePlaylistClick}
                  className="px-5 py-2.5 bg-transparent border border-[#39FF14]/50 text-[#39FF14] rounded-lg hover:bg-[#39FF14] hover:text-black transition-all duration-300 font-semibold shadow-[0_0_10px_rgba(57,255,20,0.1)] hover:shadow-[0_0_20px_rgba(57,255,20,0.4)] flex items-center gap-2"
                >
                  <ListMusic size={18} />
                  Create Playlist
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-6">
                {playlists.map((playlist) => (
                  <div 
                    key={playlist.id} 
                    className="group cursor-pointer bg-[#0d0d0d] p-5 rounded-xl border border-neutral-800/50 hover:border-[#39FF14]/50 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_10px_30px_rgba(57,255,20,0.15)]"
                  >
                    <div className="aspect-square rounded-lg bg-neutral-900/80 flex items-center justify-center mb-4 group-hover:bg-[#39FF14]/10 transition-colors duration-300 relative">
                      <playlist.icon 
                        size={48} 
                        className={`transition-all duration-300 ${
                          playlist.id === 'p1' 
                            ? 'text-red-400 group-hover:text-red-500 group-hover:drop-shadow-[0_0_10px_rgba(248,113,113,0.6)]' 
                            : 'text-neutral-500 group-hover:text-[#39FF14] group-hover:drop-shadow-[0_0_10px_rgba(57,255,20,0.6)]'
                        }`} 
                      />
                      {playlist.tracks && playlist.tracks.length > 0 && (
                        <div className="absolute bottom-2 right-2 bg-[#39FF14] text-black text-xs font-bold px-2 py-0.5 rounded-full shadow-[0_0_5px_#39FF14]">
                          {playlist.tracks.length}
                        </div>
                      )}
                    </div>
                    <h3 className="font-bold text-white group-hover:text-[#39FF14] transition-colors duration-300 truncate">
                      {playlist.name}
                    </h3>
                    <p className="text-xs text-neutral-500 mt-1">Playlist</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-8 z-10 custom-scrollbar">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                  <Settings className="text-[#39FF14] drop-shadow-[0_0_8px_#39FF14]" size={32} />
                  Settings
                </h2>
              </div>

              {/* Downloads Category */}
              <div className="mb-6">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white text-white">
                    <FolderDown size={24} fill="currentColor" className="text-black" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Downloads</h3>
                    <p className="text-sm text-neutral-500">Download Path,Download Quality and more...</p>
                  </div>
                </div>

                <div className="space-y-0 pl-[56px]">
                  {/* Quality Dropdown */}
                  <div className="flex items-center justify-between border-b border-neutral-800/50 py-5">
                    <div>
                      <h4 className="text-white font-medium text-[15px]">Youtube Download Quality</h4>
                      <p className="text-[13px] text-neutral-500 mt-1">Quality of Youtube audio files downloaded from Youtube.</p>
                    </div>
                    <div className="relative">
                      <select
                        value={downloadQuality}
                        onChange={(e) => setDownloadQuality(e.target.value)}
                        className="bg-transparent text-white font-medium text-[15px] focus:outline-none cursor-pointer appearance-none pr-6"
                      >
                        <option value="High" className="bg-[#111]">High</option>
                        <option value="Medium" className="bg-[#111]">Medium</option>
                        <option value="Low" className="bg-[#111]">Low</option>
                      </select>
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400">
                         <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </div>
                    </div>
                  </div>

                  {/* Path Input */}
                  <div 
                    className="flex items-center justify-between py-5 cursor-pointer group"
                    onClick={handleSelectDirectory}
                  >
                    <div className="flex-1">
                      <h4 className="text-white font-medium text-[15px]">Download Folder</h4>
                      <p className="text-[13px] text-neutral-500 mt-1">{downloadPath}</p>
                    </div>
                    <button className="p-2 text-neutral-500 group-hover:text-white transition-colors">
                      <RefreshCw size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- BOTTOM PLAYER BAR --- */}
      <div className="h-24 bg-[#080808] border-t border-neutral-800/80 flex items-center justify-between px-6 relative z-20 shadow-[0_-5px_30px_rgba(0,0,0,0.5)]">
        
        {isPlaying && (
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#39FF14]/50 to-transparent shadow-[0_0_10px_#39FF14]"></div>
        )}

        {/* Left: Track Info & Like Button */}
        <div className="flex items-center gap-4 w-1/4 min-w-[200px]">
          {currentTrack ? (
            <>
              <div 
                className="relative w-14 h-14 rounded-md overflow-hidden group border border-neutral-800 shrink-0 cursor-pointer"
                onClick={() => setInfoModalTrack(currentTrack)}
              >
                <img 
                  src={currentTrack.cover} 
                  alt={currentTrack.title} 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                   <Info size={16} className="text-white" />
                </div>
              </div>
              
              <div className="flex flex-col overflow-hidden max-w-[150px]">
                <span className="font-bold text-white truncate drop-shadow-md hover:underline cursor-pointer" onClick={() => setInfoModalTrack(currentTrack)}>
                  {currentTrack.title}
                </span>
                <span className="text-xs text-neutral-400 truncate hover:underline cursor-pointer" onClick={() => setInfoModalTrack(currentTrack)}>
                  {currentTrack.artist}
                </span>
              </div>

              {/* Like Button */}
              <button 
                onClick={() => toggleLikeTrack(currentTrack)} 
                className="ml-2 p-1.5 focus:outline-none hover:scale-110 active:scale-95 transition-transform"
                title={isTrackLiked(currentTrack.url) ? "Remove from Liked Songs" : "Save to Liked Songs"}
              >
                <Heart 
                  size={20} 
                  className={`transition-colors duration-300 ${
                    isTrackLiked(currentTrack.url)
                      ? "text-[#39FF14] fill-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.6)]" 
                      : "text-neutral-400 hover:text-white"
                  }`} 
                />
              </button>
            </>
          ) : (
            <>
              <div className="relative w-14 h-14 rounded-md overflow-hidden border border-neutral-800/50 bg-[#0d0d0d] flex items-center justify-center shrink-0">
                <Music size={20} className="text-neutral-600" />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="font-bold text-neutral-600 truncate">No track selected</span>
                <span className="text-xs text-neutral-700 truncate">---</span>
              </div>
            </>
          )}
        </div>

        {/* Center: Controls & Progress */}
        <div className="flex flex-col items-center justify-center w-2/4 gap-2 max-w-2xl">
          <div className="flex items-center gap-6">
            <button className="text-neutral-400 hover:text-[#39FF14] hover:drop-shadow-[0_0_8px_#39FF14] transition-all duration-300">
              <SkipBack size={24} />
            </button>
            
            <button 
              onClick={togglePlayPause}
              disabled={!currentTrack}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-white text-black hover:bg-[#39FF14] hover:shadow-[0_0_20px_#39FF14] hover:scale-105 transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:hover:bg-white disabled:hover:shadow-none"
            >
              {isPlaying ? (
                <Pause fill="currentColor" size={24} />
              ) : (
                <Play fill="currentColor" size={24} className="ml-1" />
              )}
            </button>
            
            <button 
              onClick={handlePlayNext}
              className={`transition-all duration-300 ${queue.length > 0 ? 'text-white hover:text-[#39FF14] hover:drop-shadow-[0_0_8px_#39FF14]' : 'text-neutral-600 cursor-not-allowed'}`}
            >
              <SkipForward size={24} />
            </button>
          </div>

          {/* Progress Bar with Drag Interactivity */}
          <div className="w-full flex items-center gap-3 group mt-1">
            <span className="text-xs font-medium text-neutral-400 tabular-nums min-w-[32px] text-right">
              {currentTrack ? formatTime(progressSeconds) : '0:00'}
            </span>
            
            <div 
              ref={progressRef}
              className="relative flex-1 h-1.5 bg-neutral-800 rounded-full cursor-pointer overflow-hidden border border-neutral-900 group-hover:h-2 transition-all duration-300"
              onMouseDown={(e) => {
                setIsDraggingProgress(true);
                updateProgressFromEvent(e.clientX);
              }}
            >
              <div 
                className="absolute top-0 left-0 h-full bg-[#39FF14] rounded-full shadow-[0_0_10px_#39FF14] pointer-events-none"
                style={{ 
                  width: `${calculateProgressPercent()}%`,
                  transition: isDraggingProgress ? 'none' : 'width 0.2s linear' 
                }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_8px_#ffffff] opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </div>
            </div>
            
            <span className="text-xs font-medium text-neutral-400 tabular-nums min-w-[32px]">
              {currentTrack ? currentTrack.duration : '0:00'}
            </span>
          </div>
        </div>

        {/* Right: Volume Control */}
        <div className="w-1/4 flex items-center justify-end gap-3 group pr-4">
          <button onClick={toggleMute} className="focus:outline-none">
            {volume === 0 ? (
              <VolumeX size={20} className="text-red-500 hover:text-red-400 transition-colors drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]" />
            ) : (
              <Volume2 size={20} className="text-neutral-400 hover:text-white transition-colors" />
            )}
          </button>
          
          <div 
            ref={volumeRef}
            className="relative w-24 h-1.5 bg-neutral-800 rounded-full cursor-pointer overflow-hidden group-hover:h-2 transition-all duration-300"
            onMouseDown={(e) => {
              setIsDraggingVolume(true);
              updateVolumeFromEvent(e.clientX);
            }}
          >
            <div 
              className="absolute top-0 left-0 h-full bg-neutral-400 group-hover:bg-[#39FF14] rounded-full shadow-[0_0_10px_rgba(57,255,20,0)] group-hover:shadow-[0_0_10px_rgba(57,255,20,0.5)] pointer-events-none"
              style={{ 
                width: `${volume}%`,
                transition: isDraggingVolume ? 'none' : 'width 0.2s linear'
              }}
            >
               <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-[0_0_5px_white]"></div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Context Menu Overlay */}
      {contextMenu && (
        <div 
          className="fixed z-50 bg-[#0a0a0a] border border-neutral-800 rounded-xl shadow-2xl py-2 w-64 text-sm font-medium text-neutral-300"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div className="px-4 py-3 border-b border-neutral-800 mb-2 flex items-center gap-3">
             <img src={contextMenu.track.cover} className="w-10 h-10 rounded-md object-cover" alt="cover" />
             <div className="flex flex-col overflow-hidden">
               <span className="text-white truncate font-bold">{contextMenu.track.title}</span>
               <span className="text-xs text-neutral-500 truncate">{contextMenu.track.artist}</span>
             </div>
          </div>
          
          <button onClick={() => { setQueue([contextMenu.track, ...queue]); setContextMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors">
            <PlaySquare size={18} /> Play Next
          </button>
          
          <button onClick={() => { setQueue([...queue, contextMenu.track]); setContextMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors">
            <ListPlus size={18} /> Add to Queue
          </button>
          
          <button onClick={() => { toggleLikeTrack(contextMenu.track); setContextMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors">
            <Heart size={18} className={isTrackLiked(contextMenu.track.url) ? "text-[#39FF14] fill-[#39FF14]" : ""} /> 
            {isTrackLiked(contextMenu.track.url) ? 'Remove from Favorites' : 'Add to Favorites'}
          </button>
          
          <button className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors">
            <PlusCircle size={18} /> Add to Playlist
          </button>
          
          <div className="h-px bg-neutral-800 my-2"></div>
          
          <button onClick={() => { copyToClipboard(contextMenu.track.url); setContextMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors">
            <Share2 size={18} /> Share
          </button>
          
          <button onClick={() => { handleDownload(contextMenu.track); setContextMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors">
            {downloadingTracks[contextMenu.track.url] ? (
               <div className="w-4 h-4 rounded-full border-2 border-[#39FF14] border-t-transparent animate-spin"></div>
            ) : (
               <Download size={18} />
            )}
            Download
          </button>
          
          <button onClick={() => { openInYouTube(contextMenu.track.url); setContextMenu(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/80 hover:text-white transition-colors">
            <ExternalLink size={18} /> Open original link
          </button>
        </div>
      )}

      {/* Info Modal Overlay */}
      {infoModalTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
             {/* Modal Header with Cover art */}
             <div className="relative h-48 w-full flex-shrink-0">
                <img src={infoModalTrack.cover} className="w-full h-full object-cover opacity-40 blur-md" alt="bg" />
                <div className="absolute inset-0 flex items-center justify-center pt-4">
                   <img src={infoModalTrack.cover} className="h-32 w-32 rounded-lg shadow-2xl object-cover" alt="cover" />
                </div>
                <button onClick={() => setInfoModalTrack(null)} className="absolute top-4 right-4 bg-black/60 p-2 rounded-full hover:bg-white hover:text-black transition-colors">
                  <X size={18} />
                </button>
             </div>
             
             {/* Modal Content */}
             <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-gradient-to-b from-[#111] to-[#0a0a0a]">
                <div className="flex gap-2 mb-6">
                   <span className="bg-[#1a1a1a] px-3 py-1.5 rounded-full text-xs font-bold border border-neutral-800 flex items-center gap-2 text-cyan-400">
                     <Clock size={14}/> {infoModalTrack.duration}
                   </span>
                   <span className="bg-[#1a1a1a] px-3 py-1.5 rounded-full text-xs font-bold border border-neutral-800 flex items-center gap-2 text-red-500">
                     <Youtube size={14}/> YouTube
                   </span>
                </div>

                <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Details</h4>
                <div className="space-y-2 mb-8">
                   <div className="flex items-center gap-4 p-3 bg-[#111] rounded-xl border border-neutral-800/50">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400"><Music size={20} /></div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-xs text-neutral-500">Title</span>
                        <span className="font-bold text-sm truncate">{infoModalTrack.title}</span>
                      </div>
                   </div>
                   <div className="flex items-center gap-4 p-3 bg-[#111] rounded-xl border border-neutral-800/50">
                      <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400"><FileBadge2 size={20} /></div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-xs text-neutral-500">Artist</span>
                        <span className="font-bold text-sm truncate">{infoModalTrack.artist}</span>
                      </div>
                   </div>
                   <div className="flex items-center gap-4 p-3 bg-[#111] rounded-xl border border-neutral-800/50">
                      <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center text-pink-400"><Disc size={20} /></div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-xs text-neutral-500">Album</span>
                        <span className="font-bold text-sm">Unknown</span>
                      </div>
                   </div>
                   <div className="flex items-center gap-4 p-3 bg-[#111] rounded-xl border border-neutral-800/50">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400"><Hash size={20} /></div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-xs text-neutral-500">Genre</span>
                        <span className="font-bold text-sm">VIDEO</span>
                      </div>
                   </div>
                </div>

                <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Technical Info</h4>
                <div className="flex items-center gap-4 p-3 bg-[#111] rounded-xl border border-neutral-800/50 mb-8">
                   <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400"><FileCode2 size={20} /></div>
                   <div className="flex flex-col overflow-hidden">
                     <span className="text-xs text-neutral-500">Media ID</span>
                     <span className="font-mono text-sm text-neutral-300">{infoModalTrack.url.split('v=')[1] || "Unknown"}</span>
                   </div>
                </div>

                <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Actions</h4>
                <div className="grid grid-cols-2 gap-3 mb-3">
                   <button onClick={() => copyToClipboard(infoModalTrack.url.split('v=')[1])} className="p-3 bg-[#111] rounded-xl hover:bg-neutral-800 transition-colors border border-neutral-800 flex items-center justify-center gap-2 text-sm font-medium">
                      <Copy size={16} /> Copy ID
                   </button>
                   <button onClick={() => copyToClipboard(infoModalTrack.url)} className="p-3 bg-[#111] rounded-xl hover:bg-neutral-800 transition-colors border border-neutral-800 flex items-center justify-center gap-2 text-sm font-medium">
                      <Share2 size={16} /> Copy Link
                   </button>
                </div>
                <button onClick={() => openInYouTube(infoModalTrack.url)} className="w-full p-3 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 transition-colors border border-red-500/20 flex items-center justify-center gap-2 text-sm font-bold">
                   <ExternalLink size={18} /> Open in YouTube
                </button>
             </div>
          </div>
        </div>
      )}

      {/* Playlist Creation Modal */}
      {isPlaylistModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#111] border border-[#39FF14]/50 p-6 rounded-xl w-96 shadow-[0_0_30px_rgba(57,255,20,0.15)] animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-white mb-4">Name your playlist</h3>
            <input
              autoFocus
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder="e.g. Cyberpunk Mix"
              className="w-full bg-[#050505] border border-neutral-800 text-white rounded-lg py-2 px-3 mb-6 focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14] transition-all"
              onKeyDown={(e) => e.key === 'Enter' && confirmCreatePlaylist()}
            />
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setIsPlaylistModalOpen(false)} 
                className="px-4 py-2 text-sm font-medium text-neutral-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmCreatePlaylist} 
                className="px-4 py-2 bg-[#39FF14] text-black text-sm font-bold rounded-lg hover:shadow-[0_0_15px_#39FF14] transition-all"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}