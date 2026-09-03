/**
 * High-Performance Resilient Jikan API Client for AniCrunch
 * - Dual-lane prioritized request scheduler (Critical vs Background)
 * - Instant cache-first (Stale-While-Revalidate) hydration
 * - Smart proxy resolution with zero-delay direct fallback
 * - Comprehensive offline fallback & curated editorial datasets
 * - Hotlink-safe image URL normalization
 */

(function (global) {
  // Global cache configuration
  const CACHE_TTL = 15 * 60 * 1000; // 15 minutes fresh
  const STALE_TTL = 24 * 60 * 60 * 1000; // 24 hours usable stale
  const memoryCache = new Map();

  // One-time cleanup: remove stale fallback-poisoned schedule cache entries
  try {
    const CACHE_CLEANUP_KEY = 'anicrunch_cache_cleanup_v3';
    if (!localStorage.getItem(CACHE_CLEANUP_KEY)) {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('anicrunch_cache_')) {
          try {
            const parsed = JSON.parse(localStorage.getItem(key));
            const items = parsed?.data?.data;
            if (Array.isArray(items) && items.length > 0 && !items[0].broadcast && key.includes('schedules')) {
              localStorage.removeItem(key);
            }
          } catch (_) {
            localStorage.removeItem(key);
          }
        }
      });
      localStorage.setItem(CACHE_CLEANUP_KEY, '1');
    }
  } catch (_) {}

  // Curated Airing Datasets by day for Schedule & Airing Today
  const FALLBACK_AIRING_CATALOG = {
    sunday: [
      {
        mal_id: 21,
        title: "One Piece",
        title_english: "One Piece",
        score: 8.72,
        type: "TV",
        status: "Currently Airing",
        synopsis: "Monkey D. Luffy sets off on a voyage with his pirate crew to find the legendary treasure known as One Piece.",
        images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/6/73245l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/6/73245.jpg" } },
        genres: [{ name: "Action" }, { name: "Adventure" }],
        broadcast: { day: "Sundays", time: "09:30", string: "Sundays at 09:30 (JST)" }
      },
      {
        mal_id: 57524,
        title: "Kami no Tou: Ouji no Kikan",
        title_english: "Tower of God Season 2",
        score: 7.65,
        type: "TV",
        status: "Currently Airing",
        synopsis: "Bam and his companions navigate the treacherous floors of the Tower.",
        images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1816/143521l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1816/143521.jpg" } },
        genres: [{ name: "Action" }, { name: "Fantasy" }],
        broadcast: { day: "Sundays", time: "23:00", string: "Sundays at 23:00 (JST)" }
      },
      {
        mal_id: 49786,
        title: "Fairy Tail: 100-nen Quest",
        title_english: "Fairy Tail: 100 Years Quest",
        score: 7.82,
        type: "TV",
        status: "Currently Airing",
        synopsis: "Natsu and the Fairy Tail guild embark on an unbroken legend quest.",
        images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1169/143169l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1169/143169.jpg" } },
        genres: [{ name: "Action" }, { name: "Fantasy" }],
        broadcast: { day: "Sundays", time: "17:30", string: "Sundays at 17:30 (JST)" }
      }
    ],
    monday: [
      {
        mal_id: 41467,
        title: "Bleach: Sennen Kessen-hen",
        title_english: "Bleach: Thousand-Year Blood War",
        score: 8.98,
        type: "TV",
        status: "Currently Airing",
        synopsis: "Ichigo Kurosaki enters the final battle against the Quincy empire.",
        images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1764/126627l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1764/126627.jpg" } },
        genres: [{ name: "Action" }, { name: "Supernatural" }],
        broadcast: { day: "Mondays", time: "23:00", string: "Mondays at 23:00 (JST)" }
      },
      {
        mal_id: 53879,
        title: "Kamonohashi Ron no Shinan Kenshuu 2nd Season",
        title_english: "Ron Kamonohashi's Forbidden Deductions Season 2",
        score: 7.45,
        type: "TV",
        status: "Currently Airing",
        synopsis: "Ron Kamonohashi solves intricate criminal mysteries.",
        images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1770/138945l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1770/138945.jpg" } },
        genres: [{ name: "Mystery" }, { name: "Comedy" }],
        broadcast: { day: "Mondays", time: "22:30", string: "Mondays at 22:30 (JST)" }
      }
    ],
    tuesday: [
      {
        mal_id: 55855,
        title: "Gisaengryeong",
        title_english: "Days with My Stepsister",
        score: 7.58,
        type: "TV",
        status: "Currently Airing",
        synopsis: "Yuta and Saki adjust to living under one roof as stepsiblings.",
        images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1206/143542l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1206/143542.jpg" } },
        genres: [{ name: "Romance" }, { name: "Slice of Life" }],
        broadcast: { day: "Tuesdays", time: "21:00", string: "Tuesdays at 21:00 (JST)" }
      }
    ],
    wednesday: [
      {
        mal_id: 55791,
        title: "Oshi no Ko 2nd Season",
        title_english: "Oshi no Ko Season 2",
        score: 8.52,
        type: "TV",
        status: "Currently Airing",
        synopsis: "Aqua delves deeper into the entertainment industry stage play.",
        images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1739/143243l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1739/143243.jpg" } },
        genres: [{ name: "Drama" }, { name: "Supernatural" }],
        broadcast: { day: "Wednesdays", time: "23:00", string: "Wednesdays at 23:00 (JST)" }
      },
      {
        mal_id: 54744,
        title: "Tokidoki Bosotto Russia-go de Derechanu Tonari no Alya-san",
        title_english: "Alya Sometimes Hides Her Feelings in Russian",
        score: 7.84,
        type: "TV",
        status: "Currently Airing",
        synopsis: "Alya murmurs sweet Russian secrets, unaware Kuze understands every word.",
        images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1090/143216l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1090/143216.jpg" } },
        genres: [{ name: "Comedy" }, { name: "Romance" }],
        broadcast: { day: "Wednesdays", time: "23:30", string: "Wednesdays at 23:30 (JST)" }
      }
    ],
    thursday: [
      {
        mal_id: 55848,
        title: "Isekai Suicide Squad",
        title_english: "Suicide Squad Isekai",
        score: 7.34,
        type: "TV",
        status: "Currently Airing",
        synopsis: "Harley Quinn and the Suicide Squad drop into a fantasy sword-and-magic world.",
        images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1586/143302l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1586/143302.jpg" } },
        genres: [{ name: "Action" }, { name: "Isekai" }],
        broadcast: { day: "Thursdays", time: "00:00", string: "Thursdays at 00:00 (JST)" }
      },
      {
        mal_id: 54855,
        title: "Senpai wa Otonoko",
        title_english: "Senpai is an Otonokonoko",
        score: 7.55,
        type: "TV",
        status: "Currently Airing",
        synopsis: "A high school love triangle blossoms with sincerity.",
        images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1915/143277l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1915/143277.jpg" } },
        genres: [{ name: "Romance" }, { name: "School" }],
        broadcast: { day: "Thursdays", time: "01:28", string: "Thursdays at 01:28 (JST)" }
      }
    ],
    friday: [
      {
        mal_id: 52991,
        title: "Sousou no Frieren",
        title_english: "Frieren: Beyond Journey's End",
        score: 9.33,
        type: "TV",
        status: "Currently Airing",
        synopsis: "An elven mage embarks on a journey to reflect on human life and memories.",
        images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1015/138006.jpg" } },
        genres: [{ name: "Adventure" }, { name: "Fantasy" }],
        broadcast: { day: "Fridays", time: "23:00", string: "Fridays at 23:00 (JST)" }
      },
      {
        mal_id: 53802,
        title: "2.5-jigen no Ririsa",
        title_english: "2.5 Dimensional Seduction",
        score: 7.42,
        type: "TV",
        status: "Currently Airing",
        synopsis: "Okumura and Lilysa bond over passion for 2D cosplay photography.",
        images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1815/143256l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1815/143256.jpg" } },
        genres: [{ name: "Comedy" }, { name: "Ecchi" }],
        broadcast: { day: "Fridays", time: "22:30", string: "Fridays at 22:30 (JST)" }
      }
    ],
    saturday: [
      {
        mal_id: 54688,
        title: "Boku no Hero Academia 7th Season",
        title_english: "My Hero Academia Season 7",
        score: 8.28,
        type: "TV",
        status: "Currently Airing",
        images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1911/142426l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1911/142426.jpg" } },
        genres: [{ name: "Action" }, { name: "Super Power" }],
        broadcast: { day: "Saturdays", time: "17:30", string: "Saturdays at 17:30 (JST)" }
      },
      {
        mal_id: 52588,
        title: "Kaijuu 8-dou",
        title_english: "Kaiju No. 8",
        score: 8.35,
        type: "TV",
        status: "Currently Airing",
        images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1170/141829l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1170/141829.jpg" } },
        genres: [{ name: "Action" }, { name: "Sci-Fi" }],
        broadcast: { day: "Saturdays", time: "23:00", string: "Saturdays at 23:00 (JST)" }
      },
      {
        mal_id: 53580,
        title: "Tensei shitara Slime Datta Ken 3rd Season",
        title_english: "That Time I Got Reincarnated as a Slime Season 3",
        score: 8.12,
        type: "TV",
        status: "Currently Airing",
        images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1209/141517l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1209/141517.jpg" } },
        genres: [{ name: "Action" }, { name: "Fantasy" }, { name: "Isekai" }],
        broadcast: { day: "Saturdays", time: "23:00", string: "Saturdays at 23:00 (JST)" }
      }
    ]
  };

  // Comprehensive Curated Catalog (includes all Home Recommendations & Editorial picks)
  const FALLBACK_ANIME_CATALOG = [
    {
      mal_id: 5114,
      title: "Fullmetal Alchemist: Brotherhood",
      title_english: "Fullmetal Alchemist: Brotherhood",
      score: 9.1,
      year: 2009,
      type: "TV",
      episodes: 64,
      status: "Finished Airing",
      synopsis: "Two brothers search for a Philosopher's Stone after an attempt to revive their deceased mother goes awry and leaves them in damaged physical forms.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1208/94745l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1208/94745.jpg" } },
      genres: [{ mal_id: 1, name: "Action" }, { mal_id: 2, name: "Adventure" }, { mal_id: 10, name: "Fantasy" }]
    },
    {
      mal_id: 9253,
      title: "Steins;Gate",
      title_english: "Steins;Gate",
      score: 9.07,
      year: 2011,
      type: "TV",
      episodes: 24,
      status: "Finished Airing",
      synopsis: "A self-proclaimed mad scientist discovers a way to send text messages to the past, triggering a terrifying series of butterfly effect events.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1935/127974l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1935/127974.jpg" } },
      genres: [{ mal_id: 24, name: "Sci-Fi" }, { mal_id: 41, name: "Suspense" }, { mal_id: 78, name: "Time Travel" }]
    },
    {
      mal_id: 16498,
      title: "Shingeki no Kyojin",
      title_english: "Attack on Titan",
      score: 8.55,
      year: 2013,
      type: "TV",
      episodes: 25,
      status: "Finished Airing",
      synopsis: "After his hometown is destroyed and his mother is killed, young Eren Jaeger vows to cleanse the earth of the giant humanoid Titans that have brought humanity to the brink of extinction.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/10/47347l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/10/47347.jpg" } },
      genres: [{ mal_id: 1, name: "Action" }, { mal_id: 8, name: "Drama" }, { mal_id: 41, name: "Suspense" }]
    },
    {
      mal_id: 52991,
      title: "Sousou no Frieren",
      title_english: "Frieren: Beyond Journey's End",
      score: 9.33,
      year: 2023,
      type: "TV",
      episodes: 28,
      status: "Finished Airing",
      synopsis: "An elven mage and her former adventurer companions defeat the Demon King and restore peace to the land. Decades later, Frieren embarks on a journey to reflect on human life.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1015/138006.jpg" } },
      genres: [{ mal_id: 2, name: "Adventure" }, { mal_id: 10, name: "Fantasy" }, { mal_id: 8, name: "Drama" }]
    },
    {
      mal_id: 48849,
      title: "Sonny Boy",
      title_english: "Sonny Boy",
      score: 7.78,
      year: 2021,
      type: "TV",
      episodes: 12,
      status: "Finished Airing",
      synopsis: "Empty classrooms, boring days. It was supposed to be a normal summer vacation. Suddenly, the school begins to drift through another dimension.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1799/117366l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1799/117366.jpg" } },
      genres: [{ mal_id: 40, name: "Psychological" }, { mal_id: 24, name: "Sci-Fi" }, { mal_id: 37, name: "Supernatural" }]
    },
    {
      mal_id: 21,
      title: "One Piece",
      title_english: "One Piece",
      score: 8.72,
      year: 1999,
      type: "TV",
      episodes: 1100,
      status: "Currently Airing",
      synopsis: "Monkey D. Luffy sets off on a voyage with his pirate crew to find the legendary treasure known as One Piece and become King of the Pirates.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/6/73245l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/6/73245.jpg" } },
      genres: [{ mal_id: 1, name: "Action" }, { mal_id: 2, name: "Adventure" }, { mal_id: 10, name: "Fantasy" }]
    },
    {
      mal_id: 1535,
      title: "Death Note",
      title_english: "Death Note",
      score: 8.62,
      year: 2006,
      type: "TV",
      episodes: 37,
      status: "Finished Airing",
      synopsis: "An intelligent high school student goes on a secret crusade to eliminate criminals from the world after discovering a notebook capable of killing anyone whose name is written into it.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/9/9443l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/9/9443.jpg" } },
      genres: [{ mal_id: 41, name: "Suspense" }, { mal_id: 37, name: "Supernatural" }, { mal_id: 7, name: "Mystery" }]
    },
    {
      mal_id: 38000,
      title: "Kimetsu no Yaiba",
      title_english: "Demon Slayer: Kimetsu no Yaiba",
      score: 8.48,
      year: 2019,
      type: "TV",
      episodes: 26,
      status: "Finished Airing",
      synopsis: "A family is attacked by demons and only two members survive - Tanjiro and his sister Nezuko. Tanjiro sets out to become a demon slayer to avenge his family.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1286/99889l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1286/99889.jpg" } },
      genres: [{ mal_id: 1, name: "Action" }, { mal_id: 10, name: "Fantasy" }, { mal_id: 37, name: "Supernatural" }]
    },
    {
      mal_id: 44511,
      title: "Chainsaw Man",
      title_english: "Chainsaw Man",
      score: 8.51,
      year: 2022,
      type: "TV",
      episodes: 12,
      status: "Finished Airing",
      synopsis: "Following a betrayal, a young man left for dead is reborn as a powerful devil-human hybrid with chainsaw body parts.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1806/126216l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1806/126216.jpg" } },
      genres: [{ mal_id: 1, name: "Action" }, { mal_id: 10, name: "Fantasy" }, { mal_id: 14, name: "Horror" }]
    },
    {
      mal_id: 30276,
      title: "One Punch Man",
      title_english: "One Punch Man",
      score: 8.5,
      year: 2015,
      type: "TV",
      episodes: 12,
      status: "Finished Airing",
      synopsis: "The story of Saitama, a hero who does it just for fun and can defeat any enemy with a single punch.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/12/76619l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/12/76619.jpg" } },
      genres: [{ mal_id: 1, name: "Action" }, { mal_id: 4, name: "Comedy" }, { mal_id: 31, name: "Super Power" }]
    },
    {
      mal_id: 11061,
      title: "Hunter x Hunter (2011)",
      title_english: "Hunter x Hunter",
      score: 9.04,
      year: 2011,
      type: "TV",
      episodes: 148,
      status: "Finished Airing",
      synopsis: "Gon Freecss aspires to become a Hunter, an exceptional being capable of greatness. With his friends and his potential, he seeks out his father.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1337/92523l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1337/92523.jpg" } },
      genres: [{ mal_id: 1, name: "Action" }, { mal_id: 2, name: "Adventure" }, { mal_id: 10, name: "Fantasy" }]
    },
    {
      mal_id: 20,
      title: "Naruto",
      title_english: "Naruto",
      score: 7.99,
      year: 2002,
      type: "TV",
      episodes: 220,
      status: "Finished Airing",
      synopsis: "Naruto Uzumaki, a hyperactive ninja, searches for recognition and dreams of becoming the Hokage, the leader of his village.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/13/17405l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/13/17405.jpg" } },
      genres: [{ mal_id: 1, name: "Action" }, { mal_id: 2, name: "Adventure" }, { mal_id: 17, name: "Martial Arts" }]
    },
    {
      mal_id: 6211,
      title: "Tokyo Magnitude 8.0",
      title_english: "Tokyo Magnitude 8.0",
      score: 7.98,
      year: 2009,
      type: "TV",
      episodes: 11,
      status: "Finished Airing",
      synopsis: "After a massive earthquake hits Tokyo, two young siblings embark on a perilous journey home with the help of a female courier.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/5/22421l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/5/22421.jpg" } },
      genres: [{ mal_id: 8, name: "Drama" }]
    },
    {
      mal_id: 387,
      title: "Haibane Renmei",
      title_english: "Haibane Renmei",
      score: 7.98,
      year: 2002,
      type: "TV",
      episodes: 13,
      status: "Finished Airing",
      synopsis: "A young girl awakens from a dream into a walled town, emerging from a cocoon with small wings and a halo, seeking purpose.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1792/95254l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1792/95254.jpg" } },
      genres: [{ mal_id: 8, name: "Drama" }, { mal_id: 10, name: "Fantasy" }, { mal_id: 40, name: "Psychological" }]
    },
    {
      mal_id: 457,
      title: "Mushishi",
      title_english: "Mushi-Shi",
      score: 8.66,
      year: 2005,
      type: "TV",
      episodes: 26,
      status: "Finished Airing",
      synopsis: "Ginko is a Mushi Master who travels the land studying ethereal primitive lifeforms and resolving spiritual anomalies.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/2/73862l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/2/73862.jpg" } },
      genres: [{ mal_id: 2, name: "Adventure" }, { mal_id: 10, name: "Fantasy" }, { mal_id: 37, name: "Supernatural" }]
    },
    {
      mal_id: 14813,
      title: "Yahari Ore no Seishun Love Comedy wa Machigatteiru. Zoku",
      title_english: "My Teen Romantic Comedy SNAFU TOO!",
      score: 8.24,
      year: 2015,
      type: "TV",
      episodes: 13,
      status: "Finished Airing",
      synopsis: "Hachiman Hikigaya and the Service Club navigate complex high school social dynamics and genuine human relationships.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/12/75271l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/12/75271.jpg" } },
      genres: [{ mal_id: 4, name: "Comedy" }, { mal_id: 22, name: "Romance" }, { mal_id: 36, name: "Slice of Life" }]
    },
    {
      mal_id: 10087,
      title: "Fate/Zero",
      title_english: "Fate/Zero",
      score: 8.28,
      year: 2011,
      type: "TV",
      episodes: 13,
      status: "Finished Airing",
      synopsis: "Seven magi summon heroic spirits to wage a clandestine war for the omnipotent Holy Grail in Fuyuki City.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/2/73862l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1522/118151.jpg" } },
      genres: [{ mal_id: 1, name: "Action" }, { mal_id: 10, name: "Fantasy" }, { mal_id: 37, name: "Supernatural" }]
    },
    {
      mal_id: 16067,
      title: "Nagi no Asu kara",
      title_english: "A Lull in the Sea",
      score: 8.04,
      year: 2013,
      type: "TV",
      episodes: 26,
      status: "Finished Airing",
      synopsis: "Four sea-dwelling childhood friends attend school on the surface, navigating culture clash and evolving feelings.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/9/55191l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/9/55191.jpg" } },
      genres: [{ mal_id: 8, name: "Drama" }, { mal_id: 10, name: "Fantasy" }, { mal_id: 22, name: "Romance" }]
    },
    {
      mal_id: 40748,
      title: "Jujutsu Kaisen 2nd Season",
      title_english: "Jujutsu Kaisen Season 2",
      score: 8.82,
      year: 2023,
      type: "TV",
      episodes: 23,
      status: "Finished Airing",
      synopsis: "Satoru Gojo and Suguru Geto take on a mission protecting the Star Plasma Vessel.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1792/138022l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1792/138022.jpg" } },
      genres: [{ mal_id: 1, name: "Action" }, { mal_id: 37, name: "Supernatural" }]
    },
    {
      mal_id: 52299,
      title: "Ore dake Hairu Kakushi Dungeon",
      title_english: "Solo Leveling",
      score: 8.51,
      year: 2024,
      type: "TV",
      episodes: 12,
      status: "Finished Airing",
      synopsis: "Sung Jinwoo awakens as a player who can level up endlessly.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1816/141870l.jpg", image_url: "https://cdn.myanimelist.net/images/anime/1816/141870.jpg" } },
      genres: [{ mal_id: 1, name: "Action" }, { mal_id: 10, name: "Fantasy" }]
    }
  ];

  const FALLBACK_MANGA_CATALOG = [
    {
      mal_id: 13,
      title: "One Piece",
      title_english: "One Piece",
      score: 9.22,
      chapters: 1100,
      type: "Manga",
      url: "https://myanimelist.net/manga/13/One_Piece",
      synopsis: "Gol D. Roger was known as the 'Pirate King.' When he was executed, his last words revealed the existence of the greatest treasure in the world, One Piece.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/manga/2/253146l.jpg", image_url: "https://cdn.myanimelist.net/images/manga/2/253146.jpg" } }
    },
    {
      mal_id: 2,
      title: "Berserk",
      title_english: "Berserk",
      score: 9.47,
      chapters: 375,
      type: "Manga",
      url: "https://myanimelist.net/manga/2/Berserk",
      synopsis: "Guts, a former mercenary now known as the 'Black Swordsman,' is out for revenge in a dark fantasy medieval world.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/manga/1/157897l.jpg", image_url: "https://cdn.myanimelist.net/images/manga/1/157897.jpg" } }
    },
    {
      mal_id: 1706,
      title: "JoJo no Kimyou na Bouken Part 7: Steel Ball Run",
      title_english: "JoJo's Bizarre Adventure Part 7: Steel Ball Run",
      score: 9.3,
      chapters: 95,
      type: "Manga",
      url: "https://myanimelist.net/manga/1706/JoJo_no_Kimyou_na_Bouken_Part_7__Steel_Ball_Run",
      synopsis: "In 1890 America, a cross-country horse race with a 50-million-dollar grand prize attracts eccentric competitors from around the world.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/manga/3/179880l.jpg", image_url: "https://cdn.myanimelist.net/images/manga/3/179880.jpg" } }
    },
    {
      mal_id: 644,
      title: "Kingdom",
      title_english: "Kingdom",
      score: 9.0,
      chapters: 790,
      type: "Manga",
      url: "https://myanimelist.net/manga/644/Kingdom",
      synopsis: "During the Warring States period in ancient China, Shin and Hyou dream of becoming Great Generals of the Heavens.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/manga/2/171872l.jpg", image_url: "https://cdn.myanimelist.net/images/manga/2/171872.jpg" } }
    },
    {
      mal_id: 44347,
      title: "Chainsaw Man",
      title_english: "Chainsaw Man",
      score: 8.52,
      chapters: 160,
      type: "Manga",
      url: "https://myanimelist.net/manga/116778/Chainsaw_Man",
      synopsis: "Denji has a simple dream—to live a happy and peaceful life, spending time with a girl he likes.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/manga/3/216464l.jpg", image_url: "https://cdn.myanimelist.net/images/manga/3/216464.jpg" } }
    },
    {
      mal_id: 23390,
      title: "Shingeki no Kyojin",
      title_english: "Attack on Titan",
      score: 8.56,
      chapters: 139,
      type: "Manga",
      url: "https://myanimelist.net/manga/23390/Shingeki_no_Kyojin",
      synopsis: "Hundreds of years ago, terrifying creatures which resembled humans appeared.",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/manga/2/37846l.jpg", image_url: "https://cdn.myanimelist.net/images/manga/2/37846.jpg" } }
    }
  ];

  const FALLBACK_REVIEWS = [
    {
      user: { username: "AniCrunch_Editorial", images: { jpg: { image_url: "https://cdn.myanimelist.net/images/userimages/1.jpg" } } },
      entry: { mal_id: 5114, title: "Fullmetal Alchemist: Brotherhood" },
      score: 10,
      review: "A masterpiece of narrative pacing and character development. The alchemy system is logical, the emotional beats land perfectly, and every side character gets a meaningful arc.",
      url: "/anime/5114-fullmetal-alchemist-brotherhood"
    },
    {
      user: { username: "OtakuScholar", images: { jpg: { image_url: "https://cdn.myanimelist.net/images/userimages/2.jpg" } } },
      entry: { mal_id: 9253, title: "Steins;Gate" },
      score: 10,
      review: "Steins;Gate starts as a fun sci-fi slice of life before escalating into one of the most intense, heart-wrenching thrillers in modern anime history.",
      url: "/anime/9253-steins-gate"
    },
    {
      user: { username: "VibeSeeker", images: { jpg: { image_url: "https://cdn.myanimelist.net/images/userimages/3.jpg" } } },
      entry: { mal_id: 52991, title: "Frieren: Beyond Journey's End" },
      score: 9,
      review: "A quiet, philosophical fantasy that reflects on time, memory, and human connection. Beautifully animated by Madhouse with breathtaking orchestral music.",
      url: "/anime/52991-frieren-beyond-journey-s-end"
    }
  ];

  const FALLBACK_TRENDING_CATALOG = FALLBACK_ANIME_CATALOG.slice(0, 10);

  // Dual-Lane Request Scheduler (Critical vs Background)
  let criticalQueue = Promise.resolve();
  let backgroundQueue = Promise.resolve();
  const CRITICAL_INTERVAL = 180; // ms
  const BACKGROUND_INTERVAL = 240; // ms
  let lastCriticalTime = 0;
  let lastBackgroundTime = 0;

  // Circuit breaker state (tracks direct upstream failures only)
  let consecutiveUpstreamFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 6;
  let circuitBreakerResetTime = 0;
  const CIRCUIT_BREAKER_COOLDOWN = 20000; // 20 seconds

  // Request deduplication
  const inflightRequests = new Map();

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getCacheKey(url) {
    return `anicrunch_cache_${url}`;
  }

  function getFromCache(url) {
    // 1. Memory Cache
    const memItem = memoryCache.get(url);
    if (memItem) {
      const isFresh = memItem.expires > Date.now();
      const isUsableStale = (Date.now() - memItem.timestamp) < STALE_TTL;
      if (isFresh) return { data: memItem.data, isStale: false };
      if (isUsableStale) return { data: memItem.data, isStale: true };
    }

    // 2. LocalStorage Cache
    try {
      const raw = localStorage.getItem(getCacheKey(url));
      if (raw) {
        const parsed = JSON.parse(raw);
        const isFresh = parsed.expires > Date.now();
        const isUsableStale = (Date.now() - (parsed.timestamp || (parsed.expires - CACHE_TTL))) < STALE_TTL;
        if (isFresh) {
          memoryCache.set(url, parsed);
          return { data: parsed.data, isStale: false };
        }
        if (isUsableStale) {
          return { data: parsed.data, isStale: true };
        }
      }
    } catch (_) {}

    return null;
  }

  function saveToCache(url, data) {
    if (!data || !data.data || data.isFallback) return;
    const now = Date.now();
    const item = { data, timestamp: now, expires: now + CACHE_TTL };
    memoryCache.set(url, item);
    try {
      localStorage.setItem(getCacheKey(url), JSON.stringify(item));
    } catch (_) {}
  }

  const DUB_LICENSORS = [
    'funimation', 'crunchyroll', 'sentai filmworks', 'viz media',
    'aniplex of america', 'bang zoom!', 'bandai entertainment',
    'geneon', 'adv films', 'media blasters', 'nozomi entertainment',
    'discotek media', 'nis america', 'ponycan usa', 'eleven arts',
    'gkids', 'shout! factory', 'manga entertainment'
  ];

  function normalizeAnimeData(item) {
    if (!item || typeof item !== 'object') return item;

    if (!item.title_english && item.title) {
      item.title_english = item.title;
    }

    if ((item.year === null || item.year === undefined) && item.aired && item.aired.from) {
      const match = String(item.aired.from).match(/^(\d{4})/);
      if (match) item.year = parseInt(match[1], 10);
    }

    if (item.episodes === null || item.episodes === undefined) item.episodes = 0;
    if (item.score === null || item.score === undefined) item.score = 0.0;
    if (!item.synopsis) item.synopsis = '';

    if (item.images) {
      ['jpg', 'webp'].forEach(format => {
        if (item.images[format]) {
          const img = item.images[format];
          const baseUrl = img.image_url || img.large_image_url || img.small_image_url;
          if (baseUrl) {
            if (!img.image_url) img.image_url = baseUrl;
            if (!img.small_image_url) img.small_image_url = baseUrl.replace(/(\.\w+)$/, 't$1');
            if (!img.large_image_url) img.large_image_url = baseUrl.replace(/(\.\w+)$/, 'l$1');
          }
        }
      });
    }

    if (!item.audio_languages) {
      item.audio_languages = ['ja'];
      item.has_dub = false;
      if (item.licensors && Array.isArray(item.licensors)) {
        for (const licensor of item.licensors) {
          const name = (typeof licensor === 'string' ? licensor : (licensor && licensor.name) || '').toLowerCase();
          if (DUB_LICENSORS.some(dl => name.includes(dl))) {
            item.audio_languages.push('en');
            item.has_dub = true;
            break;
          }
        }
      }
    }

    return item;
  }

  function normalizeResponse(response) {
    if (!response || !response.data) return response;
    if (Array.isArray(response.data)) {
      response.data = response.data.map(normalizeAnimeData);
    } else if (typeof response.data === 'object') {
      response.data = normalizeAnimeData(response.data);
    }
    return response;
  }

  function proxyImageUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (!url.includes('cdn.myanimelist.net')) return url;
    try {
      const apiBase = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';
      return `${apiBase || window.location.origin}/api/jikan/proxy/image?url=${encodeURIComponent(url)}`;
    } catch (_) {
      return url;
    }
  }

  function safeSrcset(images, format = 'jpg') {
    if (!images || !images[format]) return '';
    const img = images[format];
    const parts = [];
    if (img.small_image_url) parts.push(`${img.small_image_url} 300w`);
    if (img.image_url) parts.push(`${img.image_url} 500w`);
    if (img.large_image_url) parts.push(`${img.large_image_url} 800w`);
    return parts.join(', ');
  }

  function getFallbackResponse(url) {
    const lowerUrl = url.toLowerCase();

    // Single anime lookup by ID (e.g. /anime/9253 or /anime/5114)
    const animeIdMatch = url.match(/\/anime\/(\d+)(?:\/|$|\?)/);
    if (animeIdMatch && !url.includes('/characters') && !url.includes('/recommendations') && !url.includes('/streaming') && !url.includes('/episodes')) {
      const targetId = parseInt(animeIdMatch[1], 10);
      const match = FALLBACK_ANIME_CATALOG.find(a => a.mal_id === targetId);
      if (match) return { data: match, isFallback: true };
    }

    if (lowerUrl.includes("/manga")) {
      if (lowerUrl.includes("type=novel")) {
        return { data: FALLBACK_MANGA_CATALOG.filter(m => m.type === "Novel"), pagination: { has_next_page: false }, isFallback: true };
      }
      return { data: FALLBACK_MANGA_CATALOG, pagination: { has_next_page: false }, isFallback: true };
    }

    if (lowerUrl.includes("/reviews")) {
      return { data: FALLBACK_REVIEWS, pagination: { has_next_page: false }, isFallback: true };
    }

    if (lowerUrl.includes("/schedules") || lowerUrl.includes("/seasons/now")) {
      const filterMatch = lowerUrl.match(/filter=([a-z]+)/);
      const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const today = daysOfWeek[new Date().getDay()];
      const day = (filterMatch && daysOfWeek.includes(filterMatch[1])) ? filterMatch[1] : today;
      const fallbackList = FALLBACK_AIRING_CATALOG[day] || FALLBACK_AIRING_CATALOG.sunday || FALLBACK_AIRING_CATALOG.friday;
      return { data: fallbackList, pagination: { has_next_page: false }, isFallback: true };
    }

    if (lowerUrl.includes("top/anime") || lowerUrl.includes("filter=airing")) {
      return { data: FALLBACK_TRENDING_CATALOG, pagination: { has_next_page: false }, isFallback: true };
    }

    if (animeIdMatch && (url.includes("/characters") || url.includes("/recommendations") || url.includes("/streaming") || url.includes("/episodes"))) {
      return { data: [], pagination: { has_next_page: false }, isFallback: true };
    }

    if (lowerUrl.includes("q=")) {
      const qMatch = url.match(/q=([^&]+)/);
      if (qMatch) {
        const queryStr = decodeURIComponent(qMatch[1]).toLowerCase();
        const filtered = FALLBACK_ANIME_CATALOG.filter(a =>
          (a.title && a.title.toLowerCase().includes(queryStr)) ||
          (a.title_english && a.title_english.toLowerCase().includes(queryStr)) ||
          (a.synopsis && a.synopsis.toLowerCase().includes(queryStr))
        );
        return { data: filtered.length > 0 ? filtered : FALLBACK_ANIME_CATALOG, pagination: { has_next_page: false }, isFallback: true };
      }
    }

    return { data: FALLBACK_ANIME_CATALOG, pagination: { has_next_page: false }, isFallback: true };
  }

  // Dual-lane prioritized scheduler
  function throttledFetchLane(fetchFn, priority = 'background') {
    return new Promise((resolve, reject) => {
      const isCritical = priority === 'critical';
      const laneQueue = isCritical ? criticalQueue : backgroundQueue;
      const interval = isCritical ? CRITICAL_INTERVAL : BACKGROUND_INTERVAL;

      const next = laneQueue.catch(() => {}).then(async () => {
        const now = Date.now();
        const lastTime = isCritical ? lastCriticalTime : lastBackgroundTime;
        const elapsed = now - lastTime;
        if (elapsed < interval) {
          await delay(interval - elapsed);
        }
        if (isCritical) lastCriticalTime = Date.now();
        else lastBackgroundTime = Date.now();

        try {
          const result = await fetchFn();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      }).catch(reject);

      if (isCritical) criticalQueue = next;
      else backgroundQueue = next;
    });
  }

  async function fetchWithRetry(url, options = {}, maxRetries = 2) {
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 6000);

        const response = await fetch(url, {
          signal: options.signal || controller.signal,
          headers: { "Accept": "application/json", ...(options.headers || {}) }
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          consecutiveUpstreamFailures = 0;
          return response;
        }

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
          const backoffMs = Math.min(retryAfter * 1000, 4000);
          if (attempt < maxRetries - 1) {
            await delay(backoffMs);
            continue;
          }
        }

        if (response.status >= 500 && attempt < maxRetries - 1) {
          await delay(Math.pow(2, attempt) * 600);
          continue;
        }

        lastError = new Error(`HTTP ${response.status}`);
        lastError.status = response.status;
        lastError.response = response;
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries - 1) {
          await delay(Math.pow(2, attempt) * 600);
          continue;
        }
      }
    }

    if (url.includes('api.jikan.moe')) {
      consecutiveUpstreamFailures++;
      if (consecutiveUpstreamFailures >= MAX_CONSECUTIVE_FAILURES) {
        circuitBreakerResetTime = Date.now() + CIRCUIT_BREAKER_COOLDOWN;
      }
    }

    throw lastError || new Error('All retries exhausted');
  }

  function isCircuitBreakerOpen() {
    if (consecutiveUpstreamFailures < MAX_CONSECUTIVE_FAILURES) return false;
    if (Date.now() > circuitBreakerResetTime) {
      consecutiveUpstreamFailures = 0;
      return false;
    }
    return true;
  }

  /**
   * Main Safe Jikan Fetch with Instant Cache Return, Priority Queueing & Fallbacks
   */
  async function safeJikanFetch(url, options = {}) {
    const priority = options.priority || 'background';

    // 1. Instant Cache Return (Stale-While-Revalidate)
    const cached = getFromCache(url);
    if (cached) {
      // If fresh, return immediately
      if (!cached.isStale) {
        return normalizeResponse(cached.data);
      }
      // If stale, return immediately AND trigger background revalidation
      revalidateInBackground(url, options).catch(() => {});
      return normalizeResponse(cached.data);
    }

    // 2. Fast check: Curated Single-Item Fallback dataset (Instant 0ms resolution)
    const animeIdMatch = url.match(/\/anime\/(\d+)(?:\/|$|\?)/);
    if (animeIdMatch && !url.includes('/characters') && !url.includes('/recommendations') && !url.includes('/streaming') && !url.includes('/episodes')) {
      const targetId = parseInt(animeIdMatch[1], 10);
      const match = FALLBACK_ANIME_CATALOG.find(a => a.mal_id === targetId);
      if (match) {
        const formatted = { data: match, isFallback: false };
        saveToCache(url, formatted);
        return normalizeResponse(formatted);
      }
    }

    // 3. Request Deduplication: return existing in-flight promise if URL matches
    if (inflightRequests.has(url)) {
      return inflightRequests.get(url);
    }

    const fetchPromise = (async () => {
      try {
        // 4. Try backend proxy if API_BASE is configured or on same origin
        const apiBase = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '';
        const jikanPath = url.replace('https://api.jikan.moe/v4/', '');
        const proxyUrl = apiBase ? `${apiBase}/api/jikan/${jikanPath}` : `${window.location.origin}/api/jikan/${jikanPath}`;

        let proxySucceeded = false;
        if (apiBase || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          try {
            const proxyResponse = await throttledFetchLane(
              () => fetchWithRetry(proxyUrl, { ...options, timeout: 5000 }, 1),
              priority
            );
            if (proxyResponse && proxyResponse.ok) {
              const json = await proxyResponse.json();
              if (json && json.data && (Array.isArray(json.data) ? json.data.length > 0 : true)) {
                const formatted = {
                  data: json.data,
                  pagination: json.pagination || { has_next_page: false }
                };
                saveToCache(url, formatted);
                proxySucceeded = true;
                return normalizeResponse(formatted);
              }
            }
          } catch (_) {
            // Fall through immediately to direct Jikan without re-delaying
          }
        }

        // 5. Direct Jikan API (unless upstream circuit breaker is active)
        if (!proxySucceeded && !isCircuitBreakerOpen()) {
          try {
            const directResponse = await throttledFetchLane(
              () => fetchWithRetry(url, { ...options, timeout: 7000 }, 2),
              priority
            );
            if (directResponse && directResponse.ok) {
              const json = await directResponse.json();
              const formatted = {
                data: json.data || [],
                pagination: json.pagination || { has_next_page: false }
              };
              if (formatted.data && (Array.isArray(formatted.data) ? formatted.data.length > 0 : true)) {
                saveToCache(url, formatted);
              }
              return normalizeResponse(formatted);
            }
          } catch (_) {
            // Direct Jikan also failed — fall through to fallbacks
          }
        }

        // 6. Last resort: high-fidelity offline fallback dataset
        const fallback = getFallbackResponse(url);
        return normalizeResponse(fallback);

      } finally {
        inflightRequests.delete(url);
      }
    })();

    inflightRequests.set(url, fetchPromise);
    return fetchPromise;
  }

  async function revalidateInBackground(url, options) {
    if (inflightRequests.has(url)) return;
    try {
      const res = await throttledFetchLane(
        () => fetchWithRetry(url, { ...options, timeout: 6000 }, 1),
        'background'
      );
      if (res && res.ok) {
        const json = await res.json();
        if (json && json.data) {
          saveToCache(url, { data: json.data, pagination: json.pagination || { has_next_page: false } });
        }
      }
    } catch (_) {}
  }

  // Export to global scope
  global.safeJikanFetch = safeJikanFetch;
  global.normalizeAnimeData = normalizeAnimeData;
  global.proxyImageUrl = proxyImageUrl;
  global.safeSrcset = safeSrcset;
  global.FALLBACK_ANIME_CATALOG = FALLBACK_ANIME_CATALOG;
  global.FALLBACK_MANGA_CATALOG = FALLBACK_MANGA_CATALOG;
  global.FALLBACK_AIRING_CATALOG = FALLBACK_AIRING_CATALOG;
  global.FALLBACK_TRENDING_CATALOG = FALLBACK_TRENDING_CATALOG;

})(typeof window !== "undefined" ? window : global);
