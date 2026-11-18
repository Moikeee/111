
// ==========================================
// SHARED HELPERS
// ==========================================

const $ = id => document.getElementById(id);

function escapeHTML(value) {
    const entities = {
        "&": "&amp;", "<": "&lt;", ">": "&gt;",
        '"': "&quot;", "'": "&#039;"
    };
    return String(value ?? "").replace(/[&<>"']/g, char => entities[char]);
}

function createID() {
    return crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

async function fetchJSON(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Request failed.");
    return response.json();
}

function safeImage(url) {
    return /^https:\/\//i.test(url || "") ? escapeHTML(url) : "";
}

function formatDate(date) {
    return new Date(date).toLocaleDateString("en-PH");
}


// ==========================================
// NAVBAR
// ==========================================

const sections = document.querySelectorAll(".page-section");
const navLinks = document.querySelectorAll(".nav-link");

function updateActiveLink() {
    let current = sections[0];
    const activationPoint = innerHeight * 0.3;

    sections.forEach(section => {
        if (section.getBoundingClientRect().top <= activationPoint) {
            current = section;
        }
    });

    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 5) {
        current = sections[sections.length - 1];
    }

    navLinks.forEach(link => {
        link.classList.toggle("active", link.getAttribute("href") === `#${current.id}`);
    });
}

window.addEventListener("scroll", updateActiveLink, { passive: true });
window.addEventListener("resize", updateActiveLink);
window.addEventListener("load", updateActiveLink);

navLinks.forEach(link => link.addEventListener("click", () => {
    navLinks.forEach(nav => nav.classList.remove("active"));
    link.classList.add("active");
}));


// ==========================================
// GAME DEALS
// ==========================================

const dealsGrid = $("dealsGrid");
const dealStatus = $("dealStatus");
const searchInput = $("dealSearch");
const storeFilter = $("storeFilter");
const sortDeals = $("sortDeals");
const refreshButton = $("refreshDeals");

const DEALS_API = "https://www.cheapshark.com/api/1.0/deals";
const STORES_API = "https://www.cheapshark.com/api/1.0/stores";
const EXCHANGE_API = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=PHP";

let allDeals = [];
let activeStores = [];
let storeNames = {};
let pesoRate = null;
let isLoadingDeals = false;

function formatPeso(price) {
    if (pesoRate === null) return "Price unavailable";

    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        maximumFractionDigits: 2
    }).format(Number(price) * pesoRate);
}

// Load supported stores.
async function loadStores() {
    const stores = await fetchJSON(STORES_API);
    if (!Array.isArray(stores)) throw new Error("Invalid store data.");

    activeStores = stores.filter(store => Number(store.isActive) === 1);
    storeNames = Object.fromEntries(
        activeStores.map(store => [store.storeID, store.storeName])
    );

    updateStoreOptions();
}

// Load USD to PHP exchange rate.
async function loadExchangeRate() {
    const data = await fetchJSON(EXCHANGE_API);
    if (!data.rates?.PHP) throw new Error("Exchange rate unavailable.");

    pesoRate = Number(data.rates.PHP);
}

// Update store dropdown while keeping the selected store.
function updateStoreOptions() {
    const selected = storeFilter.value;

    storeFilter.innerHTML = '<option value="all">All Supported Stores</option>';

    activeStores.forEach(store => {
        storeFilter.add(new Option(store.storeName, store.storeID));
    });

    if (activeStores.some(store => String(store.storeID) === selected)) {
        storeFilter.value = selected;
    }
}

// Fetch game deals.
async function loadDeals() {
    if (isLoadingDeals) return;

    isLoadingDeals = true;
    refreshButton.disabled = true;
    dealStatus.textContent = "Updating deals across supported stores...";

    if (!allDeals.length) {
        dealsGrid.innerHTML = '<p class="deals-message">Fetching game deals...</p>';
    }

    try {
        const deals = await fetchJSON(
            `${DEALS_API}?onSale=1&pageSize=60&sortBy=Savings&desc=1`
        );

        if (!Array.isArray(deals)) throw new Error("Invalid deals data.");

        allDeals = deals.filter(deal =>
            deal.dealID &&
            Number(deal.normalPrice) > 0 &&
            Number(deal.salePrice) >= 0
        );

        updateStoreOptions();
        displayDeals();

        dealStatus.textContent =
            `Showing ${allDeals.length} deals. Last checked: ${new Date().toLocaleString("en-PH")}`;

    } catch (error) {
        console.error("Deals error:", error);

        if (!allDeals.length) {
            dealsGrid.innerHTML =
                '<p class="deals-message">Unable to load deals. Check your internet connection.</p>';
        }

        dealStatus.textContent = "Unable to update deals. Showing previous results if available.";

    } finally {
        isLoadingDeals = false;
        refreshButton.disabled = false;
    }
}

// Display deals based on search, store, and sorting options.
function displayDeals() {
    if (pesoRate === null) {
        dealsGrid.innerHTML = '<p class="deals-message">Exchange rate unavailable.</p>';
        return;
    }

    const search = searchInput.value.toLowerCase().trim();
    const store = storeFilter.value;
    const sort = sortDeals.value;

    const filtered = allDeals.filter(deal =>
        String(deal.title || "").toLowerCase().includes(search) &&
        (store === "all" || String(deal.storeID) === store)
    );

    const sortFunctions = {
        discount: (a, b) => Number(b.savings) - Number(a.savings),
        low: (a, b) => Number(a.salePrice) - Number(b.salePrice),
        high: (a, b) => Number(b.salePrice) - Number(a.salePrice)
    };

    if (sortFunctions[sort]) filtered.sort(sortFunctions[sort]);

    if (!filtered.length) {
        dealsGrid.innerHTML =
            '<p class="deals-message">No games found for this search or store.</p>';
        return;
    }

    dealsGrid.innerHTML = filtered.map(deal => {
        const title = escapeHTML(deal.title);
        const storeName = escapeHTML(storeNames[deal.storeID] || "Supported PC Store");
        const discount = Math.max(0, Math.round(Number(deal.savings) || 0));
        const image = safeImage(deal.thumb);
        const link = `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(deal.dealID)}`;

        return `
            <article class="deal-card">
                <div class="deal-image">
                    <img src="${image}" alt="${title}" loading="lazy">
                    <span class="discount-badge">${discount > 0 ? `-${discount}%` : "On Sale"}</span>
                </div>

                <div class="deal-content">
                    <span class="deal-store">${storeName}</span>
                    <h3>${title}</h3>

                    <div class="deal-prices">
                        <span class="old-price">${formatPeso(deal.normalPrice)}</span>
                        <span class="new-price">${formatPeso(deal.salePrice)}</span>
                    </div>

                    <p class="deal-note">Estimated Philippine peso price</p>
                    <a class="deal-button" href="${link}" target="_blank" rel="noopener noreferrer">View Deal</a>
                </div>
            </article>
        `;
    }).join("");
}

searchInput.addEventListener("input", displayDeals);
storeFilter.addEventListener("change", displayDeals);
sortDeals.addEventListener("change", displayDeals);
refreshButton.addEventListener("click", loadDeals);

// Initialize deals.
async function initializeDeals() {
    try {
        await Promise.all([loadStores(), loadExchangeRate()]);
        await loadDeals();
    } catch (error) {
        console.error("Initialization error:", error);
        dealStatus.textContent = "Could not connect to the deals service.";
        dealsGrid.innerHTML =
            '<p class="deals-message">Game deals are temporarily unavailable.</p>';
    }
}

initializeDeals();
setInterval(loadDeals, 5 * 60 * 1000);

setInterval(async () => {
    try {
        await loadExchangeRate();
        displayDeals();
        displayLibrary();
    } catch (error) {
        console.error("Exchange rate refresh failed:", error);
    }
}, 6 * 60 * 60 * 1000);


// ==========================================
// GAME NEWS
// ==========================================

const newsGrid = $("newsGrid");
const newsStatus = $("newsStatus");
const refreshNews = $("refreshNews");

const NEWS_API = "https://api.rss2json.com/v1/api.json";
const NEWS_FEED = "https://www.pcgamer.com/rss/";

async function loadNews() {
    refreshNews.disabled = true;
    newsStatus.textContent = "Fetching latest gaming news...";

    try {
        const data = await fetchJSON(
            `${NEWS_API}?rss_url=${encodeURIComponent(NEWS_FEED)}`
        );

        if (data.status !== "ok" || !Array.isArray(data.items)) {
            throw new Error("Invalid news response.");
        }

        const articles = data.items.slice(0, 9);
        if (!articles.length) throw new Error("No articles found.");

        newsGrid.innerHTML = articles.map(article => {
            const title = escapeHTML(article.title || "Untitled article");
            const description = escapeHTML(
                (article.description || "Read the full article for more details.")
                    .replace(/<[^>]*>/g, "")
                    .slice(0, 160)
            );

            const link = /^https?:\/\//i.test(article.link || "") ? article.link : "#";
            const image = safeImage(article.thumbnail);
            const date = article.pubDate && !Number.isNaN(Date.parse(article.pubDate))
                ? formatDate(article.pubDate)
                : "Recently published";

            return `
                <article class="news-card">
                    ${image ? `<img src="${image}" alt="${title}" loading="lazy">` : ""}

                    <div class="news-content">
                        <span class="news-date">${date}</span>
                        <h3>${title}</h3>
                        <p>${description}</p>

                        <a href="${escapeHTML(link)}" target="_blank"
                           rel="noopener noreferrer" class="news-link">
                            Read Full Article →
                        </a>
                    </div>
                </article>
            `;
        }).join("");

        newsStatus.textContent = `Showing ${articles.length} latest gaming articles.`;

    } catch (error) {
        console.error("News error:", error);
        newsStatus.textContent = "Unable to load gaming news.";
        newsGrid.innerHTML =
            '<p class="deals-message">Gaming news is temporarily unavailable. Please try refreshing.</p>';

    } finally {
        refreshNews.disabled = false;
    }
}

refreshNews.addEventListener("click", loadNews);
loadNews();


// ==========================================
// GAME LIBRARY AND WISHLIST
// ==========================================

const gameInput = $("gameInput");
const gameCategory = $("gameCategory");
const addGameButton = $("addGame");
const gameSuggestions = $("gameSuggestions");
const librarySearchStatus = $("librarySearchStatus");
const libraryGrid = $("libraryGrid");
const librarySearch = $("librarySearch");
const libraryFilter = $("libraryFilter");

const totalGames = $("totalGames");
const wishlistCount = $("wishlistCount");
const ownedCount = $("ownedCount");
const wishlistPriceStatus = $("wishlistPriceStatus");
const refreshWishlistPrices = $("refreshWishlistPrices");

const GAME_SEARCH_API = "https://www.cheapshark.com/api/1.0/games";
const GAME_DETAILS_API = "https://www.cheapshark.com/api/1.0/games";
const LIBRARY_KEY = "gameNotifierLibrary";

const allowedCategories = ["Wishlist", "Owned", "Currently Playing", "Completed"];

let gameLibrary = [];
let selectedGame = null;
let searchTimer = null;
let currentSearch = 0;
let isUpdatingWishlist = false;

// Load saved games.
try {
    const saved = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]");

    if (Array.isArray(saved)) {
        gameLibrary = saved.filter(game =>
            game && typeof game.title === "string" &&
            allowedCategories.includes(game.category)
        );
    }
} catch (error) {
    console.error("Unable to load library:", error);
}

function saveLibrary() {
    try {
        localStorage.setItem(LIBRARY_KEY, JSON.stringify(gameLibrary));
    } catch (error) {
        console.error("Unable to save library:", error);
        alert("Unable to save your library. Check your browser storage.");
    }
}

// Search the game database.
async function searchGames(query) {
    const searchNumber = ++currentSearch;
    librarySearchStatus.textContent = "Searching game database...";

    try {
        const games = await fetchJSON(
            `${GAME_SEARCH_API}?title=${encodeURIComponent(query)}&limit=10`
        );

        if (searchNumber !== currentSearch) return;

        if (!Array.isArray(games) || !games.length) {
            gameSuggestions.innerHTML = "";
            gameSuggestions.classList.remove("show");
            librarySearchStatus.textContent = "No matching games found. Try another title.";
            return;
        }

        displayGameSuggestions(games);
        librarySearchStatus.textContent =
            `${games.length} matching games found. Select one from the list.`;

    } catch (error) {
        if (searchNumber !== currentSearch) return;
        console.error("Game search error:", error);
        gameSuggestions.classList.remove("show");
        librarySearchStatus.textContent = "Unable to search the game database. Try again later.";
    }
}

// Display search suggestions.
function displayGameSuggestions(games) {
    gameSuggestions.innerHTML = games.map(game => `
        <button type="button" class="game-suggestion"
            data-game-id="${escapeHTML(game.gameID)}"
            data-game-title="${escapeHTML(game.external || "Unknown Game")}"
            data-game-image="${safeImage(game.thumb)}">

            <img src="${safeImage(game.thumb)}" alt="" loading="lazy">
            <span>${escapeHTML(game.external || "Unknown Game")}
                <small>Select this game</small>
            </span>
        </button>
    `).join("");

    gameSuggestions.classList.add("show");
}

// Select a suggested game.
gameSuggestions.addEventListener("click", event => {
    const button = event.target.closest(".game-suggestion");
    if (!button) return;

    selectedGame = {
        gameID: button.dataset.gameId,
        title: button.dataset.gameTitle,
        thumb: button.dataset.gameImage
    };

    gameInput.value = selectedGame.title;
    gameSuggestions.innerHTML = "";
    gameSuggestions.classList.remove("show");
    addGameButton.disabled = false;
    librarySearchStatus.textContent = "Game selected. Choose a category and click Add Game.";
});

// Search as the user types.
gameInput.addEventListener("input", () => {
    const query = gameInput.value.trim();

    selectedGame = null;
    addGameButton.disabled = true;
    clearTimeout(searchTimer);

    if (query.length < 2) {
        currentSearch++;
        gameSuggestions.innerHTML = "";
        gameSuggestions.classList.remove("show");
        librarySearchStatus.textContent = "Enter at least two characters to search.";
        return;
    }

    searchTimer = setTimeout(() => searchGames(query), 400);
});

// Hide suggestions when clicking outside.
document.addEventListener("click", event => {
    if (!event.target.closest(".game-search-wrapper")) {
        gameSuggestions.classList.remove("show");
    }
});

// Add a selected game.
function addGame() {
    if (!selectedGame) {
        alert("Please search and select a game first.");
        return;
    }

    if (gameLibrary.some(game =>
        game.title.toLowerCase() === selectedGame.title.toLowerCase()
    )) {
        alert("This game is already in your library.");
        return;
    }

    const category = gameCategory.value;

    gameLibrary.push({
        id: createID(),
        ...selectedGame,
        category,
        lastPrice: null,
        lastNormalPrice: null,
        lastStore: "",
        lastDealID: "",
        lastOnSale: null,
        lastPriceCheck: null
    });

    saveLibrary();
    displayLibrary();

    gameInput.value = "";
    selectedGame = null;
    addGameButton.disabled = true;
    librarySearchStatus.textContent = "Game successfully added to your library.";

    if (category === "Wishlist") updateWishlistPrices();
}

addGameButton.addEventListener("click", addGame);

// Format price check time.
function formatPriceCheck(timestamp) {
    if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) {
        return "Not checked yet";
    }

    return `Last checked: ${new Date(timestamp).toLocaleString("en-PH")}`;
}

// Create the wishlist price display.
function createWishlistPriceHTML(game) {
    if (!game.gameID) {
        return '<div class="wishlist-price"><span class="wishlist-no-sale">Price tracking unavailable.</span></div>';
    }

    if (game.lastPrice === null || game.lastPrice === undefined) {
        return '<div class="wishlist-price"><span class="wishlist-no-sale">Waiting for the first price check...</span></div>';
    }

    const price = Number(game.lastPrice);
    const normal = Number(game.lastNormalPrice);
    const onSale = Number.isFinite(normal) && normal > price;
    const discount = onSale ? Math.round((normal - price) / normal * 100) : 0;
    const store = escapeHTML(game.lastStore || "Supported PC Store");

    return `
        <div class="wishlist-price">
            ${onSale ? '<span class="wishlist-sale-badge">ON SALE</span>' : ""}
            <span class="wishlist-price-current">${formatPeso(price)}</span>
            ${onSale ? `
                <span class="wishlist-price-old">${formatPeso(normal)}</span>
                <span class="wishlist-price-discount">-${discount}% OFF</span>
            ` : ""}

            <span class="wishlist-price-store">Store: ${store}</span>
            <span class="wishlist-price-updated">${formatPriceCheck(game.lastPriceCheck)}</span>

            ${game.lastDealID ? `
                <a class="deal-button"
                   href="https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(game.lastDealID)}"
                   target="_blank" rel="noopener noreferrer">
                    View Deal
                </a>
            ` : ""}
        </div>
    `;
}

// Display the library.
function displayLibrary() {
    const search = librarySearch.value.toLowerCase().trim();
    const category = libraryFilter.value;

    const filtered = gameLibrary.filter(game =>
        game.title.toLowerCase().includes(search) &&
        (category === "all" || game.category === category)
    );

    totalGames.textContent = gameLibrary.length;
    wishlistCount.textContent = gameLibrary.filter(g => g.category === "Wishlist").length;
    ownedCount.textContent = gameLibrary.filter(g => g.category === "Owned").length;

    if (!filtered.length) {
        libraryGrid.innerHTML =
            '<p class="deals-message">No games found. Add a game to your collection!</p>';
        return;
    }

    libraryGrid.innerHTML = filtered.map(game => `
        <article class="library-card">
            ${safeImage(game.thumb) ? `
                <img class="library-card-image"
                     src="${safeImage(game.thumb)}"
                     alt="${escapeHTML(game.title)}"
                     loading="lazy">
            ` : ""}

            <h3>${escapeHTML(game.title)}</h3>
            ${game.category === "Wishlist" ? createWishlistPriceHTML(game) : ""}

            <p>Game Status</p>
            <select data-game-id="${escapeHTML(game.id)}"
                    class="game-status" aria-label="Change game status">
                ${allowedCategories.map(option => `
                    <option value="${option}" ${game.category === option ? "selected" : ""}>
                        ${option}
                    </option>
                `).join("")}
            </select>

            <button class="remove-game" data-remove-id="${escapeHTML(game.id)}" type="button">
                Remove Game
            </button>
        </article>
    `).join("");
}

librarySearch.addEventListener("input", displayLibrary);
libraryFilter.addEventListener("change", displayLibrary);

// Change game category.
libraryGrid.addEventListener("change", event => {
    if (!event.target.classList.contains("game-status")) return;

    const game = gameLibrary.find(g => g.id === event.target.dataset.gameId);
    if (!game || !allowedCategories.includes(event.target.value)) return;

    game.category = event.target.value;
    saveLibrary();
    displayLibrary();

    if (game.category === "Wishlist") updateWishlistPrices();
});

// Remove a game.
libraryGrid.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-id]");
    if (!button) return;

    gameLibrary = gameLibrary.filter(g => g.id !== button.dataset.removeId);
    saveLibrary();
    displayLibrary();
});


// ==========================================
// WISHLIST PRICE TRACKER
// ==========================================

// Get a game's latest available prices.
async function getWishlistPrice(gameID) {
    const data = await fetchJSON(`${GAME_DETAILS_API}?id=${encodeURIComponent(gameID)}`);

    if (!Array.isArray(data.deals)) throw new Error("No price information available.");

    const deals = data.deals.filter(deal =>
        Number.isFinite(Number(deal.price)) &&
        Number(deal.price) >= 0 &&
        Number.isFinite(Number(deal.retailPrice))
    );

    if (!deals.length) throw new Error("No active store prices found.");

    deals.sort((a, b) => Number(a.price) - Number(b.price));

    const cheapest = deals[0];
    const salePrice = Number(cheapest.price);
    const normalPrice = Number(cheapest.retailPrice);

    return {
        salePrice,
        normalPrice,
        store: storeNames[cheapest.storeID] || "Supported PC Store",
        dealID: cheapest.dealID || "",
        onSale: salePrice < normalPrice
    };
}

// Send wishlist notification.
function sendWishlistNotification(title, message) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, {
            body: message,
            icon: "public/img/homeImage.webp"
        });
    }
}

// Check one wishlist game's price.
async function checkWishlistGame(game) {
    if (!game.gameID || pesoRate === null) return false;

    const price = await getWishlistPrice(game.gameID);
    const previousPrice = game.lastPrice;
    const previousSale = game.lastOnSale;

    const priceDropped = previousPrice !== null &&
        previousPrice !== undefined &&
        price.salePrice < Number(previousPrice);

    const newlyOnSale = previousSale === false && price.onSale;

    Object.assign(game, {
        lastPrice: price.salePrice,
        lastNormalPrice: price.normalPrice,
        lastStore: price.store,
        lastDealID: price.dealID,
        lastOnSale: price.onSale,
        lastPriceCheck: new Date().toISOString()
    });

    if (priceDropped) {
        sendWishlistNotification(
            "Game Price Drop!",
            `${game.title} is now ${formatPeso(price.salePrice)}. Previous price: ${formatPeso(previousPrice)}.`
        );
    } else if (newlyOnSale) {
        sendWishlistNotification(
            "Game On Sale!",
            `${game.title} is now on sale for ${formatPeso(price.salePrice)}!`
        );
    }

    return true;
}

// Refresh all wishlist prices.
async function updateWishlistPrices() {
    if (isUpdatingWishlist) return;

    const games = gameLibrary.filter(g => g.category === "Wishlist");

    if (!games.length) {
        wishlistPriceStatus.textContent = "Add games to your Wishlist to monitor their prices.";
        return;
    }

    if (pesoRate === null) {
        wishlistPriceStatus.textContent = "Waiting for the PHP exchange rate.";
        return;
    }

    isUpdatingWishlist = true;
    refreshWishlistPrices.disabled = true;
    refreshWishlistPrices.textContent = "Checking Prices...";

    let successful = 0;
    let failed = 0;

    wishlistPriceStatus.textContent = `Checking prices for ${games.length} wishlist game(s)...`;

    try {
        for (const game of games) {
            try {
                if (await checkWishlistGame(game)) successful++;
                else failed++;
            } catch (error) {
                console.error(`Price check failed for ${game.title}:`, error);
                failed++;
            }
        }

        saveLibrary();
        displayLibrary();

        wishlistPriceStatus.textContent =
            `Updated ${successful} game(s). ${failed} unavailable. Last checked: ${new Date().toLocaleTimeString("en-PH")}`;

    } catch (error) {
        console.error("Wishlist update failed:", error);
        wishlistPriceStatus.textContent = "Unable to update wishlist prices.";

    } finally {
        isUpdatingWishlist = false;
        refreshWishlistPrices.disabled = false;
        refreshWishlistPrices.textContent = "↻ Refresh Wishlist Prices";
    }
}

refreshWishlistPrices.addEventListener("click", updateWishlistPrices);

// Display saved games on startup.
displayLibrary();

// Wait for the exchange rate before the first price check.
let wishlistStartupAttempts = 0;

const wishlistStartupTimer = setInterval(() => {
    if (pesoRate !== null) {
        clearInterval(wishlistStartupTimer);
        updateWishlistPrices();
    } else if (++wishlistStartupAttempts >= 30) {
        clearInterval(wishlistStartupTimer);
        wishlistPriceStatus.textContent = "Exchange rate unavailable. Try refreshing the page.";
    }
}, 1000);

// Automatically check wishlist prices every 30 minutes.
setInterval(updateWishlistPrices, 30 * 60 * 1000);


// ==========================================
// GAME RELEASE ALERTS
// ==========================================

const releaseName = $("releaseName");
const releaseDate = $("releaseDate");
const addReleaseButton = $("addRelease");
const releaseGrid = $("releaseGrid");
const enableNotifications = $("enableNotifications");
const notificationStatus = $("notificationStatus");

const RELEASE_KEY = "gameNotifierReleases";
const NOTIFIED_KEY = "gameNotifierSentAlerts";

let releases = [];
let notifiedReleases = [];

// Load saved releases and notification history.
try {
    const saved = JSON.parse(localStorage.getItem(RELEASE_KEY) || "[]");
    const notified = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "[]");

    if (Array.isArray(saved)) {
        releases = saved.filter(release =>
            release &&
            typeof release.id === "string" &&
            typeof release.name === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(release.date) &&
            !Number.isNaN(Date.parse(release.date + "T00:00:00"))
        );
    }

    if (Array.isArray(notified)) {
        notifiedReleases = notified.filter(id => typeof id === "string");
    }
} catch (error) {
    console.error("Unable to load release data:", error);
}

function saveReleases() {
    localStorage.setItem(RELEASE_KEY, JSON.stringify(releases));
}

// Add a release date.
function addRelease() {
    const name = releaseName.value.trim();
    const date = releaseDate.value;

    if (!name || !date) {
        alert("Please enter a game title and release date.");
        return;
    }

    const selected = new Date(date + "T00:00:00");
    if (Number.isNaN(selected.getTime())) {
        alert("Please enter a valid release date.");
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selected < today) {
        alert("Please choose today or a future release date.");
        return;
    }

    if (releases.some(r => r.name.toLowerCase() === name.toLowerCase())) {
        alert("This game is already in your release tracker.");
        return;
    }

    releases.push({ id: createID(), name, date });
    saveReleases();
    displayReleases();

    releaseName.value = "";
    releaseDate.value = "";
}

addReleaseButton.addEventListener("click", addRelease);

// Display release countdowns.
function displayReleases() {
    const sorted = [...releases].sort((a, b) => a.date.localeCompare(b.date));

    if (!sorted.length) {
        releaseGrid.innerHTML =
            '<p class="deals-message">No releases added yet. Add a game to start tracking!</p>';
        return;
    }

    releaseGrid.innerHTML = sorted.map(release => {
        const launch = new Date(release.date + "T00:00:00");
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const days = Math.round((launch - today) / 86400000);
        const status = days < 0 ? "Released" :
            days === 0 ? "Launching Today!" :
            days === 1 ? "Launching Tomorrow!" :
            `${days} days remaining`;

        return `
            <article class="release-card">
                <h3>${escapeHTML(release.name)}</h3>
                <p class="release-date-label">
                    Release Date: ${formatDate(launch)}
                </p>
                <p>${status}</p>
                <button data-release-id="${escapeHTML(release.id)}" type="button">
                    Remove Release
                </button>
            </article>
        `;
    }).join("");
}

// Remove a release.
releaseGrid.addEventListener("click", event => {
    const button = event.target.closest("[data-release-id]");
    if (!button) return;

    releases = releases.filter(r => r.id !== button.dataset.releaseId);
    saveReleases();
    displayReleases();
});


// ==========================================
// BROWSER NOTIFICATIONS
// ==========================================

function updateNotificationStatus() {
    if (!("Notification" in window)) {
        notificationStatus.textContent = "This browser does not support notifications.";
        enableNotifications.disabled = true;
        return;
    }

    const messages = {
        granted: "Browser notifications are enabled.",
        denied: "Notifications are blocked in your browser settings.",
        default: "Notifications are not enabled."
    };

    notificationStatus.textContent = messages[Notification.permission];
}

// Request permission from the browser.
async function requestNotifications() {
    if (!("Notification" in window)) {
        alert("Your browser does not support notifications.");
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        updateNotificationStatus();

        if (permission === "granted") {
            new Notification("Game Notifier", {
                body: "You will receive reminders for game releases and wishlist price drops!"
            });
        }
    } catch (error) {
        console.error("Notification error:", error);
        notificationStatus.textContent = "Unable to enable notifications.";
    }
}

// Check for releases happening today.
function checkReleaseAlerts() {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    releases.forEach(release => {
        const launch = new Date(release.date + "T00:00:00");

        if (launch.getTime() === today.getTime() &&
            !notifiedReleases.includes(release.id)) {

            new Notification("Game Release Alert!", {
                body: `${release.name} is launching today!`
            });

            notifiedReleases.push(release.id);
            localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notifiedReleases));
        }
    });
}

enableNotifications.addEventListener("click", requestNotifications);

updateNotificationStatus();
displayReleases();
checkReleaseAlerts();

// Check release dates every minute.
setInterval(checkReleaseAlerts, 60 * 1000);
