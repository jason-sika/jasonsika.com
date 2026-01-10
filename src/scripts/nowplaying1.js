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

// Fetch Apple Music artwork with animated support
async function fetchAppleArtwork(artist = "", track = "") {
  const key = `${artist}::${track}`;
  if (artworkCache.has(key)) return artworkCache.get(key);

  try {
    const q = encodeURIComponent(`${artist} ${track}`.trim());
    const url = `${ITUNES_SEARCH}?term=${q}&entity=song&limit=1`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`iTunes ${res.status}`);

    const data = await res.json();
    const result = data.results?.[0];
    let artwork = result?.artworkUrl100 || "";

    if (!artwork) {
      artworkCache.set(key, "");
      return "";
    }

    // Upgrade to higher resolution and try animated variants
    let base = artwork.replace(/100x100bb/i, "600x600bb");
    const root = base.replace(/\.\w+(\?.*)?$/, "");
    const candidates = [`${root}.webp`, `${root}.gif`, `${root}.jpg`, base];

    for (const candidate of candidates) {
      try {
        const r = await fetch(candidate, { cache: "no-store" });
        if (!r.ok) continue;

        const ct = (r.headers.get("content-type") || "").toLowerCase();
        if (ct.startsWith("image/")) {
          artworkCache.set(key, candidate);
          return candidate;
        }
      } catch (err) {
        continue;
      }
    }

    artworkCache.set(key, "");
    return "";
  } catch (err) {
    console.warn("fetchAppleArtwork failed:", err);
    artworkCache.set(key, "");
    return "";
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
      const url = t?.url || FALLBACK.url;
      const entry = document.createElement("div");
      entry.className = "songEntry";
      entry.dataset.index = String(i + 1);

      entry.addEventListener("click", () => {
        window.open(url, "LastFM Previous Song", "height=400px,width=400px");
        if (window.focus) {
          newWindow.focus();
        }
      });

      const art = await fetchAppleArtwork(artist, title);

      const img = document.createElement("img");
      img.className = "songCover";
      if (art) img.src = art;
      else img.alt = "cover";

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
    const image4 = track?.image?.[3]?.["#text"] || FALLBACK.image;
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

      // Try to get better Apple Music artwork
      const appleArt = await fetchAppleArtwork(artist, song);
      if (appleArt) {
        state.image = appleArt;
      } else {
        state.image = image4;
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
          "LastFM Previous Song",
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
  } catch (error) {
    console.error("Error fetching now playing data:", error);
  }
}

// Initialize
updateNowPlaying();
setInterval(updateNowPlaying, INTERVAL_MS);
