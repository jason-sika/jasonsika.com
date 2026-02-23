const API_URL = `https://pull.jasonsika.com`;
const ITUNES_SEARCH = "https://itunes.apple.com/search";
const INTERVAL_MS = 10_000;
const PREV_MAX = 5;
const FALLBACK = {
  song: "Song",
  artist: "Artist",
  image: "",
  album: " ",
  url: "",
};

// Cache and state
const artworkCache = new Map();
let lockedSongKey = null;
const state = {
  song: "",
  artist: "",
  album: "",
  image: "",
  url: "",
  nowplaying: false,
  tracks: [],
};

// DOM elements
const htmlsong = document.getElementById("songname");
const htmlartist = document.getElementById("artist");
const htmlalbum = document.getElementById("album");
const htmlnowplaying = document.getElementById("nowplaying");
const htmlin = document.getElementById("in");

// jQuery boxRollovers effect for .stupidstack
document.addEventListener("DOMContentLoaded", function() {
  const stack = document.querySelector(".stupidstack");
  if (!stack) return;
  let XAngle = 0;
  let YAngle = 0;
  const Z = 20;

  stack.addEventListener("mousemove", function(e) {
    const rect = stack.getBoundingClientRect();
    // Use the new smaller size for calculations
    const width = 395;
    const height = 415;
    const XRel = Math.max(0, Math.min(width, e.clientX - rect.left));
    const YRel = Math.max(0, Math.min(height, e.clientY - rect.top));
    // Reduce tilt strength by lowering multiplier
    const tiltStrength = 2;
    YAngle = -(0.5 - (XRel / width)) * tiltStrength;
    XAngle = (0.5 - (YRel / height)) * tiltStrength;
    stack.style.transform = `perspective(525px) translateZ(${Z}px) rotateX(${XAngle}deg) rotateY(${YAngle}deg)`;
    stack.style.transition = "none";
  });

  stack.addEventListener("mouseleave", function() {
    stack.style.transform = "perspective(525px) translateZ(0) rotateX(0deg) rotateY(0deg)";
    stack.style.transition = "all 150ms linear 0s";
  });
});

// CODE FROM CLAUDE - FIXED
function buildSearchUrl(artist, song, album) {
  if (!artist || !song) {
    return null;
  }

  const format = (str) => str.trim().replace(/\s+/g, "+");

  let q = format(artist);

  // Only add album if it exists and is not empty
  if (album && album.trim() && album.trim() !== song.trim()) {
    q += "_" + format(album);
  }

  q += "_" + format(song);

  return `https://pull.jasonsika.com/api/search?q=${q}`;
}

async function getSongLinks(artist, song, album) {
  try {
    // Try with album first if available
    let searchUrl = buildSearchUrl(artist, song, album);
    if (!searchUrl) return null;

    let searchRes = await fetch(searchUrl);

    // If 404 and we had an album, try without album
    if (searchRes.status === 404 && album && album.trim()) {
      searchUrl = buildSearchUrl(artist, song, null);
      if (!searchUrl) return null;
      searchRes = await fetch(searchUrl);
    }

    // If still 404, return null to try Last.fm fallback
    if (searchRes.status === 404) {
      return null;
    }

    if (!searchRes.ok) {
      return null;
    }

    const searchData = await searchRes.json();

    // Return album art directly from API (includes Songlink art)
    return searchData.album_art || null;

  } catch (error) {
    console.error('Error fetching song links:', error);
    return null;
  }
}

// Fetch lyrics from LRCLIB
async function fetchLrclibLyrics(artist = "", track = "") {
  try {
    const q = encodeURIComponent(`${artist} ${track}`.trim());
    const url = `https://lrclib.net/api/search?q=${q}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return "";

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return "";

    const rec = data[0];
    if (rec.plainLyrics) return rec.plainLyrics;
    if (rec.syncedLyrics) return rec.syncedLyrics;

    if (rec.id) {
      try {
        const r2 = await fetch(`https://lrclib.net/api/get/${rec.id}`, {
          cache: "no-store",
        });
        if (r2.ok) {
          const d2 = await r2.json();
          return d2.plainLyrics || d2.syncedLyrics || "";
        }
      } catch (e) {
        // ignore
      }
    }

    return "";
  } catch (err) {
    return "";
  }
}

let previousNowPlayingKey = null;

async function renderPreviousTracks(tracks = []) {
  const container = document.querySelector(".previousSongs#previousSongs");
  if (!container) return;

  // Filter duplicates - keep only first occurrence of each track
  const seenTracks = new Set();
  const uniqueTracks = [];

  for (const track of tracks) {
    const trackKey = `${track?.artist?.["#text"] || FALLBACK.artist}::${track?.name || FALLBACK.song}`;
    if (!seenTracks.has(trackKey)) {
      seenTracks.add(trackKey);
      uniqueTracks.push(track);
    }
  }

  // Skip the first track (now playing) and get the next 50
  const prevTracks = uniqueTracks.slice(1, 6);

  // Get the key of the current now playing track
  const nowPlayingTrack = uniqueTracks[0];
  const currentNowPlayingKey = nowPlayingTrack
    ? `${nowPlayingTrack?.artist?.["#text"] || FALLBACK.artist}::${nowPlayingTrack?.name || FALLBACK.song}`
    : null;

  const existingEntries = Array.from(container.querySelectorAll(".songEntry"));

  // First run - create all 50 entries
  if (existingEntries.length === 0) {
    console.log("First run: creating 50 track entries");

    for (let i = 0; i < prevTracks.length; i++) {
      const track = prevTracks[i];
      await createTrackEntry(container, track, i);
    }

    previousNowPlayingKey = currentNowPlayingKey;
    return;
  }

  // Check if now playing song changed
  if (previousNowPlayingKey !== currentNowPlayingKey) {
    console.log("Now playing changed! Shifting tracks...");
    previousNowPlayingKey = currentNowPlayingKey;

    // Fade out only the last entry
    if (existingEntries.length > 0) {
      const lastEntry = existingEntries[existingEntries.length - 1];
      lastEntry.style.animation = "fadeOut 0.5s ease-out forwards";
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    // Remove the last entry after it fades out
    if (existingEntries.length > 0) {
      existingEntries[existingEntries.length - 1].remove();
    }

    // Create and insert new entry at the top
    if (prevTracks.length > 0) {
      const newTrack = prevTracks[0];
      const newEntry = await createTrackEntryElement(newTrack, 0);

      newEntry.style.opacity = "0";
      newEntry.style.animation = "fadeIn 0.5s ease-out forwards";

      container.insertBefore(newEntry, container.firstChild);
    }

    // Update indices for all remaining entries
    const remainingEntries = Array.from(container.querySelectorAll(".songEntry"));
    remainingEntries.forEach((entry, idx) => {
      entry.dataset.index = String(idx + 2);
    });
  } else {
    // No song change, just update content if needed
    const existingKeys = existingEntries.map((el) => el.dataset.trackKey);
    const newKeys = prevTracks.map(
      (t) => `${t?.artist?.["#text"] || FALLBACK.artist}::${t?.name || FALLBACK.song}`
    );

    const keysMatch =
      existingKeys.length === newKeys.length &&
      existingKeys.every((key, i) => key === newKeys[i]);

    if (!keysMatch) {
      // Silent update - just update the data without animation
      for (let i = 0; i < Math.min(existingEntries.length, prevTracks.length); i++) {
        const track = prevTracks[i];
        const entry = existingEntries[i];
        const title = track?.name || FALLBACK.song;
        const artist = track?.artist?.["#text"] || FALLBACK.artist;
        const trackKey = `${artist}::${title}`;

        if (entry.dataset.trackKey !== trackKey) {
          await updateTrackEntry(entry, track, i);
        }
      }
    }
  }
}

async function createTrackEntry(container, track, index) {
  const entry = await createTrackEntryElement(track, index);
  entry.style.opacity = "0";
  entry.style.animation = `fadeIn 0.5s ease-out ${index * 0.05}s forwards`;
  container.appendChild(entry);
}

async function createTrackEntryElement(track, index) {
  const title = track?.name || FALLBACK.song;
  const artist = track?.artist?.["#text"] || FALLBACK.artist;
  const album = track?.album?.["#text"] || FALLBACK.album;
  const url = track?.url || FALLBACK.url;
  const trackKey = `${artist}::${title}`;

  const entry = document.createElement("div");
  entry.className = "songEntry";
  entry.dataset.index = String(index + 2); // +2 to account for skipping now playing
  entry.dataset.trackKey = trackKey;

  entry.addEventListener("click", () => {
    const newWindow = window.open(url, "LastFM Previous Song", "height=400px,width=400px");
    if (newWindow && newWindow.focus) {
      newWindow.focus();
    }
  });

  const img = document.createElement("img");
  img.className = "songCover";

  const textWrap = document.createElement("div");
  textWrap.className = "songText";

  const h1 = document.createElement("h1");
  h1.className = "songTitle";
  h1.textContent = title;

  const h2 = document.createElement("h2");
  h2.className = "songArtist";
  h2.textContent = artist;

  // Get album art
  const art = await getSongLinks(artist, title, album);
  const lastFmImage = track?.image?.[3]?.["#text"] || "";

  if (art) {
    img.src = art;
  } else if (lastFmImage) {
    img.src = lastFmImage;
  } else {
    img.src = '../src/images/album_art.png';
  }

  textWrap.appendChild(h1);
  textWrap.appendChild(h2);
  entry.appendChild(img);
  entry.appendChild(textWrap);

  return entry;
}

async function updateTrackEntry(entry, track, index) {
  const title = track?.name || FALLBACK.song;
  const artist = track?.artist?.["#text"] || FALLBACK.artist;
  const album = track?.album?.["#text"] || FALLBACK.album;
  const trackKey = `${artist}::${title}`;

  entry.dataset.trackKey = trackKey;
  entry.dataset.index = String(index + 2);

  const h1 = entry.querySelector(".songTitle");
  const h2 = entry.querySelector(".songArtist");
  if (h1) h1.textContent = title;
  if (h2) h2.textContent = artist;

  const art = await getSongLinks(artist, title, album);
  const lastFmImage = track?.image?.[3]?.["#text"] || "";
  const img = entry.querySelector(".songCover");

  if (img) {
    let newSrc = '';
    if (art) {
      newSrc = art;
    } else if (lastFmImage) {
      newSrc = lastFmImage;
    } else {
      newSrc = '../src/images/album_art.png';
    }
    img.src = newSrc;
  }
}

// Main update function
async function updateNowPlaying() {
// Remove fadeIn animation style after animation completes
document.addEventListener('DOMContentLoaded', function() {
  document.body.addEventListener('animationend', function(e) {
    if (e.animationName === 'fadeIn' && e.target.classList.contains('songEntry')) {
      e.target.style.animation = '';
      // Ensure final state is visible and styled
      e.target.style.opacity = '1';
      e.target.style.filter = 'blur(0px) brightness(1)';
      e.target.style.transform = 'translateY(0px)';
    }
  }, true);
});
  try {
    const response = await fetch(`${API_URL}?limit=50`);
    const data = await response.json();

    const track = data.recenttracks.track[0];
    const song = track?.name || FALLBACK.song;
    const artist = track?.artist?.["#text"] || FALLBACK.artist;
    const album = track?.album?.["#text"] || FALLBACK.album;
    const image4 = track?.image?.[3]?.["#text"] || "";
    const url = track?.url || FALLBACK.url;
    const nowplaying = track?.["@attr"]?.nowplaying === "true";

    // Properly build tracks array - ensure it's always an array in the right order
    let allTracks = Array.isArray(data.recenttracks.track)
      ? data.recenttracks.track
      : [data.recenttracks.track];

    // Last.fm returns in reverse chronological order (newest first)
    // Make sure the now-playing track is first, then recent tracks
    // Filter out duplicates by timestamp
    const seenTimestamps = new Set();
    allTracks = allTracks.filter((t) => {
      const timestamp = t?.["@attr"]?.uts || t?.date?.uts;
      if (!timestamp) return true; // Keep tracks without timestamps
      if (seenTimestamps.has(timestamp)) return false;
      seenTimestamps.add(timestamp);
      return true;
    });

    state.tracks = allTracks;

    const currentKey = `${artist.trim()}::${song.trim()}`;

    // Check if song changed or if this is first run
    if (lockedSongKey !== currentKey) {
      lockedSongKey = null;

      console.log('Song changed! Artist:', artist, 'Song:', song, 'Now playing:', nowplaying);

      // Try to get better album artwork
      const songLinkArt = await getSongLinks(artist, song, album);

      // Priority: Songlink/Spotify > Last.fm > Fallback
      if (songLinkArt && songLinkArt !== '../src/images/album_art.png') {
        state.image = songLinkArt;
      } else if (image4) {
        state.image = image4;
      } else {
        state.image = '../src/images/album_art.png';
      }
    }

    // Update DOM elements
    if (htmlsong) htmlsong.textContent = song;
    if (htmlartist) htmlartist.textContent = artist;
    if (htmlalbum) htmlalbum.textContent = album;

    if (htmlnowplaying && state.image) {
      htmlnowplaying.style.backgroundImage = `url('${state.image}')`;
      htmlnowplaying.style.backgroundSize = "cover";
      htmlnowplaying.style.backgroundPosition = "center";

      htmlnowplaying.addEventListener("click", () => {
        const newWindow = window.open(
          url,
          "LastFM Now Playing",
          "height=400,width=400"
        );

        if (newWindow && newWindow.focus) {
          newWindow.focus();
        }
      });

      // Set album art background on .lyricsContainer via CSS variable
      const body = document.querySelector('body');
      if (body && state.image) {
        body.style.setProperty('--album-art-bg', `url('${state.image}')`);
      }
      }

      // Handle album visibility
      const albumEmpty = !album.trim();
      const albumEqualsSong = album === song;

      if (htmlin) {
        htmlin.style.visibility =
          albumEmpty || albumEqualsSong ? "hidden" : "visible";
      }

      if (htmlalbum) {
        htmlalbum.style.visibility = albumEqualsSong ? "hidden" : "visible";
      }

      // Render previous tracks if container exists
      await renderPreviousTracks(state.tracks);

      // Fetch and display lyrics if element exists
      const lyricsEl = document.querySelector("#nowLyrics");
      if (lyricsEl && !lockedSongKey) {
        lyricsEl.textContent = "Loading lyrics...";
        const lyrics = await fetchLrclibLyrics(artist, song);

        if (lyrics) {
          lyricsEl.textContent = lyrics;
          lockedSongKey = currentKey;
        } else {
          lyricsEl.textContent = "No lyrics found.";
        }
      }

      // Clear artwork cache after all fetches complete
      artworkCache.clear();

    } catch (error) {
      console.error("Error fetching now playing data:", error);
    }
  }

// Initialize
updateNowPlaying();
  setInterval(updateNowPlaying, INTERVAL_MS);