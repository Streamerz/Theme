/**
 * Spotify Visualizer JavaScript Integration for Vencord
 * Upload this file to your GitHub repository
 * Version: 3.1.0
 */

(function() {
    'use strict';
    
    // Prevent multiple initializations
    if (window.spotifyVisualizerActive) {
        console.log('Spotify Visualizer: Already active, skipping initialization');
        return;
    }
    
    window.spotifyVisualizerActive = true;
    console.log('🎵 Spotify Visualizer: Initializing...');
    
    // Configuration
    const CONFIG = {
        updateInterval: 50,           // Update frequency (ms)
        smoothingFactor: 0.15,       // Audio smoothing (0-1)
        fallbackMode: true,          // Use simulated audio when real audio unavailable
        enableMicrophone: false,     // Try to access microphone (requires user permission)
        debugMode: false,            // Enable debug logging
        maxLevel: 1.0,              // Maximum audio level
        bassRange: [0, 60],         // Bass frequency range
        midRange: [60, 170],        // Mid frequency range
        trebleRange: [170, 255],    // Treble frequency range
    };
    
    // State management
    let state = {
        isInitialized: false,
        audioEnabled: false,
        isPlaying: false,
        currentTrack: null,
        lastUpdate: 0,
        audioLevels: { level: 0, bass: 0, mid: 0, treble: 0 },
        smoothedLevels: { level: 0, bass: 0, mid: 0, treble: 0 },
        spotifyData: null,
        updateTimer: null
    };
    
    // Audio analysis components
    let audioContext, analyser, source, dataArray;
    
    // ===== UTILITY FUNCTIONS =====
    function log(...args) {
        if (CONFIG.debugMode) {
            console.log('🎵 Visualizer:', ...args);
        }
    }
    
    function clamp(value, min = 0, max = 1) {
        return Math.max(min, Math.min(max, value));
    }
    
    function lerp(start, end, factor) {
        return start + (end - start) * factor;
    }
    
    function getAverageFrequency(dataArray, startIndex, endIndex) {
        let sum = 0;
        let count = 0;
        
        for (let i = startIndex; i <= endIndex && i < dataArray.length; i++) {
            sum += dataArray[i];
            count++;
        }
        
        return count > 0 ? (sum / count) / 255 : 0;
    }
    
    // ===== SPOTIFY INTEGRATION =====
    function getSpotifyData() {
        try {
            // Method 1: Try Vencord SpotifyControls plugin
            const vcSpotify = window.vc?.plugins?.SpotifyControls;
            if (vcSpotify?.store) {
                const store = vcSpotify.store;
                log('Spotify data from Vencord:', store);
                
                return {
                    isPlaying: store.isPlaying || false,
                    track: store.track || null,
                    position: store.position || 0,
                    volume: store.volume || 0,
                    progress: store.track ? (store.position / store.track.duration) : 0,
                    source: 'vencord'
                };
            }
            
            // Method 2: Try Discord's built-in Spotify integration
            const discordSpotify = window.DiscordNative?.nativeModules?.powerMonitor?.getSystemIdleState?.();
            
            // Method 3: Check for any Spotify-related elements in the DOM
            const spotifyElements = document.querySelectorAll('[class*="spotify"], [class*="Spotify"]');
            if (spotifyElements.length > 0) {
                log('Found Spotify elements in DOM');
                
                // Try to extract data from DOM
                const playButton = document.querySelector('[aria-label*="play"], [aria-label*="pause"]');
                const isPlaying = playButton?.getAttribute('aria-label')?.includes('pause') || false;
                
                return {
                    isPlaying,
                    track: null,
                    position: 0,
                    volume: 0.5,
                    progress: 0,
                    source: 'dom'
                };
            }
            
            // Method 4: Check for HTML5 audio/video elements
            const mediaElements = document.querySelectorAll('audio, video');
            for (const element of mediaElements) {
                if (!element.paused && element.volume > 0) {
                    return {
                        isPlaying: true,
                        track: { title: 'Audio Playing', duration: element.duration },
                        position: element.currentTime,
                        volume: element.volume,
                        progress: element.duration ? element.currentTime / element.duration : 0,
                        source: 'html5'
                    };
                }
            }
            
            return null;
            
        } catch (error) {
            log('Error getting Spotify data:', error);
            return null;
        }
    }
    
    // ===== AUDIO ANALYSIS =====
    async function initAudioContext() {
        if (!CONFIG.enableMicrophone) {
            log('Microphone disabled, skipping audio context init');
            return false;
        }
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 44100
                }
            });
            
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            source = audioContext.createMediaStreamSource(stream);
            
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.8;
            analyser.minDecibels = -90;
            analyser.maxDecibels = -10;
            
            source.connect(analyser);
            
            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
            
            state.audioEnabled = true;
            log('Audio context initialized successfully');
            return true;
            
        } catch (error) {
            log('Failed to initialize audio context:', error);
            return false;
        }
    }
    
    function analyzeAudio() {
        if (!state.audioEnabled || !analyser || !dataArray) {
            return generateFallbackAudio();
        }
        
        analyser.getByteFrequencyData(dataArray);
        
        const bass = getAverageFrequency(dataArray, CONFIG.bassRange[0], CONFIG.bassRange[1]);
        const mid = getAverageFrequency(dataArray, CONFIG.midRange[0], CONFIG.midRange[1]);
        const treble = getAverageFrequency(dataArray, CONFIG.trebleRange[0], CONFIG.trebleRange[1]);
        const level = getAverageFrequency(dataArray, 0, dataArray.length - 1);
        
        return { level, bass, mid, treble };
    }
    
    function generateFallbackAudio() {
        if (!state.isPlaying) {
            return { level: 0, bass: 0, mid: 0, treble: 0 };
        }
        
        // Generate realistic-looking audio data when music is playing
        const time = Date.now() * 0.001;
        const baseIntensity = 0.3 + Math.random() * 0.4;
        
        return {
            level: clamp(baseIntensity + Math.sin(time * 2.1) * 0.2 + Math.random() * 0.15),
            bass: clamp(baseIntensity * 0.8 + Math.sin(time * 1.7) * 0.25 + Math.random() * 0.2),
            mid: clamp(baseIntensity * 1.1 + Math.sin(time * 2.3) * 0.18 + Math.random() * 0.12),
            treble: clamp(baseIntensity * 0.6 + Math.sin(time * 2.8) * 0.15 + Math.random() * 0.1)
        };
    }
    
    // ===== CSS VARIABLE UPDATES =====
    function updateCSSVariables() {
        const root = document.documentElement;
        const data = state.spotifyData;
        
        // Update audio levels with smoothing
        const smoothing = CONFIG.smoothingFactor;
        state.smoothedLevels.level = lerp(state.smoothedLevels.level, state.audioLevels.level, smoothing);
        state.smoothedLevels.bass = lerp(state.smoothedLevels.bass, state.audioLevels.bass, smoothing);
        state.smoothedLevels.mid = lerp(state.smoothedLevels.mid, state.audioLevels.mid, smoothing);
        state.smoothedLevels.treble = lerp(state.smoothedLevels.treble, state.audioLevels.treble, smoothing);
        
        // Apply CSS variables
        root.style.setProperty('--audio-level', state.smoothedLevels.level.toFixed(3));
        root.style.setProperty('--audio-bass', state.smoothedLevels.bass.toFixed(3));
        root.style.setProperty('--audio-mid', state.smoothedLevels.mid.toFixed(3));
        root.style.setProperty('--audio-treble', state.smoothedLevels.treble.toFixed(3));
        root.style.setProperty('--is-playing', state.isPlaying ? '1' : '0');
        
        if (data) {
            root.style.setProperty('--spotify-progress', clamp(data.progress).toFixed(3));
            root.style.setProperty('--volume-level', clamp(data.volume).toFixed(3));
        }
        
        // Mark as loaded for CSS
        document.body.setAttribute('data-visualizer-loaded', 'true');
    }
    
    // ===== MAIN UPDATE LOOP =====
    function update() {
        const now = Date.now();
        
        // Throttle updates
        if (now - state.lastUpdate < CONFIG.updateInterval) {
            return;
        }
        
        state.lastUpdate = now;
        
        // Get Spotify data
        const spotifyData = getSpotifyData();
        state.spotifyData = spotifyData;
        state.isPlaying = spotifyData?.isPlaying || false;
        
        // Get audio levels
        state.audioLevels = analyzeAudio();
        
        // Update CSS
        updateCSSVariables();
        
        // Log debug info occasionally
        if (CONFIG.debugMode && now % 2000 < CONFIG.updateInterval) {
            log('State:', {
                isPlaying: state.isPlaying,
                audioLevels: state.audioLevels,
                spotifySource: spotifyData?.source,
                audioEnabled: state.audioEnabled
            });
        }
    }
    
    // ===== INITIALIZATION =====
    async function initialize() {
        log('Starting initialization...');
        
        // Try to initialize audio context
        if (CONFIG.enableMicrophone) {
            await initAudioContext();
        }
        
        // Set up update timer
        state.updateTimer = setInterval(update, CONFIG.updateInterval);
        
        // Mark as initialized
        state.isInitialized = true;
        
        // Initial update
        update();
        
        log('Initialization complete!');
        
        // Show success message
        console.log('🎵 Spotify Visualizer: Ready! Audio levels will respond to Spotify playback.');
        
        if (!state.audioEnabled && CONFIG.fallbackMode) {
            console.log('🎵 Spotify Visualizer: Using fallback mode (simulated audio levels)');
        }
        
        // Notify CSS that JS is loaded
        const event = new CustomEvent('spotifyVisualizerReady', { 
            detail: { 
                audioEnabled: state.audioEnabled,
                fallbackMode: CONFIG.fallbackMode 
            } 
        });
        document.dispatchEvent(event);
    }
    
    // ===== PUBLIC API =====
    window.SpotifyVisualizer = {
        // Control functions
        start() {
            if (!state.isInitialized) {
                initialize();
            } else {
                log('Already initialized');
            }
        },
        
        stop() {
            if (state.updateTimer) {
                clearInterval(state.updateTimer);
                state.updateTimer = null;
            }
            
            if (source) source.disconnect();
            if (audioContext) audioContext.close();
            
            // Reset CSS variables
            const root = document.documentElement;
            root.style.setProperty('--audio-level', '0');
            root.style.setProperty('--audio-bass', '0');
            root.style.setProperty('--audio-mid', '0');
            root.style.setProperty('--audio-treble', '0');
            root.style.setProperty('--is-playing', '0');
            
            state.isInitialized = false;
            state.audioEnabled = false;
            window.spotifyVisualizerActive = false;
            
            log('Stopped');
        },
        
        // Configuration
        enableMicrophone() {
            CONFIG.enableMicrophone = true;
            if (state.isInitialized && !state.audioEnabled) {
                initAudioContext();
            }
        },
        
        disableMicrophone() {
            CONFIG.enableMicrophone = false;
            if (source) source.disconnect();
            if (audioContext) audioContext.close();
            state.audioEnabled = false;
        },
        
        setConfig(newConfig) {
            Object.assign(CONFIG, newConfig);
            log('Config updated:', CONFIG);
        },
        
        // Debug functions
        getState() {
            return { ...state, config: CONFIG };
        },
        
        enableDebug() {
            CONFIG.debugMode = true;
            log('Debug mode enabled');
        },
        
        disableDebug() {
            CONFIG.debugMode = false;
        },
        
        // Test functions
        testAudioLevels(levels = { level: 0.8, bass: 0.6, mid: 0.9, treble: 0.4 }) {
            state.audioLevels = levels;
            updateCSSVariables();
            log('Test levels applied:', levels);
        },
        
        simulatePlayback(isPlaying = true) {
            state.isPlaying = isPlaying;
            if (!isPlaying) {
                state.audioLevels = { level: 0, bass: 0, mid: 0, treble: 0 };
            }
            updateCSSVariables();
            log('Simulated playback:', isPlaying);
        }
    };
    
    // ===== EVENT LISTENERS =====
    
    // Auto-initialize when user interacts (for audio context requirements)
    function autoInit() {
        if (!state.isInitialized) {
            initialize();
        }
    }
    
    // Listen for user interactions to enable audio context
    const interactionEvents = ['click', 'keydown', 'touchstart'];
    interactionEvents.forEach(event => {
        document.addEventListener(event, autoInit, { once: true });
    });
    
    // Listen for Spotify plugin events
    document.addEventListener('spotifyTrackChanged', (event) => {
        log('Spotify track changed:', event.detail);
        state.currentTrack = event.detail;
    });
    
    // Listen for page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // Pause updates when tab is hidden to save resources
            if (state.updateTimer) {
                clearInterval(state.updateTimer);
                state.updateTimer = null;
            }
        } else {
            // Resume updates when tab becomes visible
            if (state.isInitialized && !state.updateTimer) {
                state.updateTimer = setInterval(update, CONFIG.updateInterval);
            }
        }
    });
    
    // ===== AUTO-START =====
    
    // Auto-initialize after a short delay
    setTimeout(() => {
        if (!state.isInitialized) {
            log('Auto-initializing...');
            initialize();
        }
    }, 1000);
    
    // Console shortcuts
    window.startSpotifyVisualizer = () => window.SpotifyVisualizer.start();
    window.stopSpotifyVisualizer = () => window.SpotifyVisualizer.stop();
    window.debugSpotifyVisualizer = () => {
        window.SpotifyVisualizer.enableDebug();
        console.log('Debug State:', window.SpotifyVisualizer.getState());
    };
    
    log('JavaScript loaded successfully!');
    
})();

// ===== IMMEDIATE EXECUTION CHECK =====
// This runs immediately to check if everything is working
if (typeof window !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('🎵 Spotify Visualizer: DOM loaded, visualizer should be active');
    });
} else {
    console.log('🎵 Spotify Visualizer: Script loaded and ready');
}
