const API_URL = `https://pull.jasonsika.com`; // Add your Last.fm API endpoint here
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

// CODE FROM CLAUDE - FIXED
function buildSearchUrl(artist, song, album) {
  if (!artist || !song) {
    console.warn("Artist and song are required, got:", { artist, song });
    throw new Error("Artist and song are required");
  }

  const format = (str) => str.trim().replace(/\s+/g, "+");

  let q = format(artist);

  // Only add album if it exists and is not empty
  if (album && album.trim() && album.trim() !== song.trim()) {
    q += "_" + format(album);
  }

  q += "_" + format(song);

  console.log("Built search URL query:", q);
  return `https://pull.jasonsika.com/api/search?q=${q}`;
}

async function getSongLinks(artist, song, album) {
  try {
    // Try with album first if available
    let searchUrl = buildSearchUrl(artist, song, album);
    let searchRes = await fetch(searchUrl);
    
    // If 404 and we had an album, try without album
    if (searchRes.status === 404 && album && album.trim()) {
      console.log("Retrying without album...");
      searchUrl = buildSearchUrl(artist, song, null);
      searchRes = await fetch(searchUrl);
    }
    
    // If still 404, return null to try Last.fm fallback
    if (searchRes.status === 404) {
      console.log("Track not found on Spotify");
      return null;
    }
    
    if (!searchRes.ok) {
      throw new Error(`Search failed: ${searchRes.status}`);
    }
    
    const searchData = await searchRes.json();
    const spotifyUrl = searchData.url;

    // Step 2: Get all platform links from Songlink
    const songlinkRes = await fetch(
      `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(spotifyUrl)}`
    );
    
    if (!songlinkRes.ok) {
      throw new Error(`Songlink failed: ${songlinkRes.status}`);
    }
    
    const songlinkData = await songlinkRes.json();

    // Extract album art from Songlink
    const firstEntity = Object.values(songlinkData.entitiesByUniqueId)[0];
    const albumArt = firstEntity?.thumbnailUrl || searchData.album_art;

    // Return album art or null to fallback to Last.fm
    return albumArt || null;

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
    console.warn("fetchLrclibLyrics failed:", err);
    return "";
  }
}

// Render previous tracks
async function renderPreviousTracks(tracks = []) {
  const container = document.querySelector(".previousSongs#previousSongs");
  if (!container) return;

  const prevTracks = tracks
    .filter((t) => !(t?.["@attr"]?.nowplaying === "true"))
    .slice(0, PREV_MAX);
  container.innerHTML = "";

  if (prevTracks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "noTracks";
    empty.textContent = "No recent tracks";
    container.appendChild(empty);
    return;
  }

  await Promise.all(
    prevTracks.map(async (t, i) => {
      const title = t?.name || FALLBACK.song;
      const artist = t?.artist?.["#text"] || FALLBACK.artist;
      const album = t?.album?.["#text"] || FALLBACK.album;
      const url = t?.url || FALLBACK.url;
      const entry = document.createElement("div");
      entry.className = "songEntry";
      entry.dataset.index = String(i + 1);

      entry.addEventListener("click", () => {
        const newWindow = window.open(url, "LastFM Previous Song", "height=400px,width=400px");
        if (newWindow && newWindow.focus) {
          newWindow.focus();
        }
      });

      // Get album art - now returns string directly or null
      const art = await getSongLinks(artist, title, album);
      
      // Try Last.fm image if available
      const lastFmImage = t?.image?.[3]?.["#text"] || "";

      const img = document.createElement("img");
      img.className = "songCover";
      
      // Priority: Songlink/Spotify > Last.fm > Fallback
      if (art) {
        img.src = art;
      } else if (lastFmImage) {
        img.src = lastFmImage;
      } else {
        img.src = '../src/images/album_art.png';
      }

      const textWrap = document.createElement("div");
      textWrap.className = "songText";

      const h1 = document.createElement("h1");
      h1.className = "songTitle";
      h1.textContent = title;

      const h2 = document.createElement("h2");
      h2.className = "songArtist";
      h2.textContent = artist;

      textWrap.appendChild(h1);
      textWrap.appendChild(h2);
      entry.appendChild(img);
      entry.appendChild(textWrap);
      container.appendChild(entry);
    })
  );
}

// Main update function
async function updateNowPlaying() {
  try {
    const response = await fetch(API_URL);
    const data = await response.json();

    const track = data.recenttracks.track[0];
    const song = track?.name || FALLBACK.song;
    const artist = track?.artist?.["#text"] || FALLBACK.artist;
    const album = track?.album?.["#text"] || FALLBACK.album;
    const image4 = track?.image?.[3]?.["#text"] || "";
    const url = track?.url || FALLBACK.url;
    const nowplaying = track?.["@attr"]?.nowplaying === "true";

    // Update state
    state.song = song;
    state.artist = artist;
    state.album = album;
    state.nowplaying = nowplaying;
    state.tracks = Array.isArray(data.recenttracks.track)
      ? data.recenttracks.track
      : [data.recenttracks.track];

    const currentKey = `${artist.trim()}::${song.trim()}`;

    // Check if song changed or if this is first run
    if (lockedSongKey !== currentKey) {
      lockedSongKey = null;

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

    console.log("Track data:", {
      song,
      artist,
      album,
      nowplaying,
      image: state.image,
    });

    // Clear artwork cache after all fetches complete
    artworkCache.clear();
    console.log("Artwork cache cleared");

  } catch (error) {
    console.error("Error fetching now playing data:", error);
  }
}

// Initialize
updateNowPlaying();
setInterval(updateNowPlaying, INTERVAL_MS);