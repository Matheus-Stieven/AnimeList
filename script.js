
const API = "https://api.tenrai.org/v1";

const grid = document.querySelector("#anime-grid");
const message = document.querySelector("#message");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const genreFilter = document.querySelector("#genre-filter");
const sortFilter = document.querySelector("#sort-filter");
const modal = document.querySelector("#anime-modal");
const modalContent = document.querySelector("#modal-content");

let currentPage = 1;
let hasNextPage = false;
let requestVersion = 0;
let activeController = null;
let searchMode = "popular";
let lastResults = [];

const cache = new Map();

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function safeImage(url) {
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol)
      ? parsed.href
      : "";
  } catch {
    return "";
  }
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.className = isError ? "message error" : "message";
  message.hidden = false;
}

function setLoading(loading) {
  document.querySelector("#prev-btn").disabled =
    loading || currentPage <= 1;
  document.querySelector("#next-btn").disabled =
    loading || !hasNextPage;
}

async function apiRequest(path, signal) {
  if (cache.has(path)) return cache.get(path);

  const response = await fetch(`${API}${path}`, { signal });

  if (response.status === 429) {
    throw new Error("Muitas consultas em sequência. Aguarde alguns segundos e tente novamente.");
  }

  if (!response.ok) {
    throw new Error(`Erro na API (${response.status}). Tente novamente.`);
  }

  const json = await response.json();
  cache.set(path, json);
  return json;
}

function getQueryPath() {
  const params = new URLSearchParams();
  params.set("page", currentPage);
  params.set("limit", "20");

  if (searchMode === "search") {
    params.set("q", searchInput.value.trim());
  }

  if (genreFilter.value) {
    params.set("genres", genreFilter.value);
  }

  params.set("order_by", sortFilter.value);

  if (sortFilter.value === "title") {
    params.set("sort", "asc");
  } else {
    params.set("sort", "desc");
  }

  return `/anime?${params.toString()}`;
}

async function loadAnime() {
  const version = ++requestVersion;

  if (activeController) activeController.abort();
  activeController = new AbortController();

  const signal = activeController.signal;

  grid.replaceChildren();
  showMessage("Explorando o universo dos animes...");
  setLoading(true);

  try {
    const path = searchMode === "popular" && !genreFilter.value
      && !searchInput.value.trim() && sortFilter.value === "score"
      ? `/top/anime?page=${currentPage}&limit=20`
      : getQueryPath();

    const json = await apiRequest(path, signal);

    if (version !== requestVersion) return;

    lastResults = json.data || [];
    hasNextPage = Boolean(json.pagination?.has_next_page);

    renderAnime(lastResults);

    document.querySelector("#stat-total").textContent =
      json.pagination?.items?.total?.toLocaleString("pt-BR") ||
      lastResults.length;

    document.querySelector("#page-number").textContent =
      `Página ${currentPage}`;
    document.querySelector("#page-label").textContent =
      `Página ${currentPage}`;

    document.querySelector("#results-label").textContent =
      searchMode === "search"
        ? `Resultados para "${searchInput.value.trim()}"`
        : genreFilter.value
          ? "Animes filtrados"
          : "Animes em destaque";

    if (!lastResults.length) {
      showMessage("Nenhum anime encontrado. Experimente outra pesquisa.");
    } else {
      message.hidden = true;
    }
  } catch (error) {
    if (error.name === "AbortError" || version !== requestVersion) return;

    showMessage(error.message || "Não foi possível carregar os animes.", true);
  } finally {
    if (version === requestVersion) setLoading(false);
  }
}

function renderAnime(animes) {
  grid.replaceChildren();

  const fragment = document.createDocumentFragment();

  animes.forEach(anime => {
    const card = document.createElement("article");
    card.className = "anime-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Ver detalhes de ${anime.title}`);

    const image = safeImage(anime.images?.webp?.large_image_url)
      || safeImage(anime.images?.jpg?.large_image_url);

    const genres = (anime.genres || [])
      .slice(0, 2)
      .map(genre => genre.name)
      .join(" · ");

    const poster = document.createElement("div");
    poster.className = "poster-wrap";

    if (image) {
      const img = document.createElement("img");
      img.className = "poster";
      img.src = image;
      img.alt = `Capa de ${anime.title}`;
      img.loading = "lazy";
      img.onerror = () => {
        img.remove();
        poster.classList.add("poster-fallback");
        poster.textContent = "✦";
      };
      poster.append(img);
    } else {
      poster.classList.add("poster-fallback");
      poster.textContent = "✦";
    }

    const score = document.createElement("span");
    score.className = "score";
    score.textContent = `★ ${anime.score ?? "N/A"}`;

    const type = document.createElement("span");
    type.className = "card-type";
    type.textContent = anime.type || "Anime";

    poster.append(score, type);

    const info = document.createElement("div");
    info.className = "card-info";

    const title = document.createElement("h3");
    title.textContent = anime.title;

    const meta = document.createElement("div");
    meta.className = "card-meta";

    const episodes = document.createElement("span");
    episodes.textContent = anime.episodes == null
      ? "Episódios: —"
      : `${anime.episodes} episódios`;

    const year = document.createElement("span");
    year.textContent = anime.year || "—";

    const genre = document.createElement("div");
    genre.className = "genres";
    genre.textContent = genres || "Gêneros variados";

    meta.append(episodes, year);
    info.append(title, meta, genre);
    card.append(poster, info);

    const open = () => openDetails(anime.mal_id);
    card.addEventListener("click", open);
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });

    fragment.append(card);
  });

  grid.append(fragment);
}

function setPage(page) {
  currentPage = page;
  loadAnime();
  document.querySelector("#catalogo").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

searchForm.addEventListener("submit", event => {
  event.preventDefault();
  searchMode = searchInput.value.trim() ? "search" : "popular";
  currentPage = 1;
  loadAnime();
});

genreFilter.addEventListener("change", () => {
  currentPage = 1;
  loadAnime();
});

sortFilter.addEventListener("change", () => {
  currentPage = 1;
  loadAnime();
});

document.querySelector("#popular-btn").addEventListener("click", () => {
  searchInput.value = "";
  genreFilter.value = "";
  sortFilter.value = "score";
  searchMode = "popular";
  currentPage = 1;
  loadAnime();
});

document.querySelector("#clear-btn").addEventListener("click", () => {
  searchInput.value = "";
  genreFilter.value = "";
  sortFilter.value = "score";
  searchMode = "popular";
  currentPage = 1;
  loadAnime();
});

document.querySelector("#prev-btn").addEventListener("click", () => {
  if (currentPage > 1) setPage(currentPage - 1);
});

document.querySelector("#next-btn").addEventListener("click", () => {
  if (hasNextPage) setPage(currentPage + 1);
});

document.querySelector("#close-modal").addEventListener("click", () => {
  modal.close();
});

modal.addEventListener("click", event => {
  if (event.target === modal) modal.close();
});

async function openDetails(id) {
  modalContent.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "message";
  loading.textContent = "Carregando detalhes...";
  modalContent.append(loading);
  modal.showModal();

  try {
    const json = await apiRequest(`/anime/${id}/full`);
    if (!modal.open) return;
    renderDetails(json.data);
  } catch (error) {
    if (!modal.open) return;
    modalContent.replaceChildren();
    const errorText = document.createElement("p");
    errorText.className = "message error";
    errorText.textContent = error.message || "Erro ao carregar detalhes.";
    modalContent.append(errorText);
  }
}

function renderDetails(anime) {
  modalContent.replaceChildren();

  const layout = document.createElement("div");
  layout.className = "modal-layout";

  const image = safeImage(anime.images?.webp?.large_image_url)
    || safeImage(anime.images?.jpg?.large_image_url);

  if (image) {
    const img = document.createElement("img");
    img.className = "modal-poster";
    img.src = image;
    img.alt = `Capa de ${anime.title}`;
    layout.append(img);
  }

  const info = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = anime.title;
  const score = document.createElement("p");
  score.className = "modal-meta";
  score.textContent =
    `★ ${anime.score ?? "Sem nota"} · ${anime.year || "Ano desconhecido"} · ${anime.episodes ?? "?"} episódios`;

  const description = document.createElement("p");
  description.className = "modal-description";
  description.textContent = anime.synopsis || "Sinopse indisponível.";

  const genres = document.createElement("div");
  genres.className = "modal-list";

  (anime.genres || []).forEach(genre => {
    const item = document.createElement("span");
    item.textContent = genre.name;
    genres.append(item);
  });

  info.append(title, score, description, genres);
  layout.append(info);
  modalContent.append(layout);

  const actions = document.createElement("div");
  actions.className = "modal-section";

  const heading = document.createElement("h3");
  heading.textContent = "Explore mais";
  actions.append(heading);

  const charactersButton = document.createElement("button");
  charactersButton.className = "modal-action";
  charactersButton.textContent = "Ver personagens";
  charactersButton.addEventListener("click", () =>
    loadRelated(anime.mal_id, "characters")
  );

  const episodesButton = document.createElement("button");
  episodesButton.className = "modal-action";
  episodesButton.textContent = "Ver episódios";
  episodesButton.addEventListener("click", () =>
    loadRelated(anime.mal_id, "episodes")
  );

  actions.append(charactersButton, episodesButton);

  if (anime.url) {
    const external = document.createElement("a");
    external.className = "modal-action";
    external.style.display = "inline-block";
    external.style.marginLeft = "8px";
    external.href = safeImage(anime.url) || "#";
    external.target = "_blank";
    external.rel = "noopener noreferrer";
    external.textContent = "MyAnimeList ↗";
    actions.append(external);
  }

  modalContent.append(actions);

  const related = document.createElement("div");
  related.id = "related-content";
  related.className = "modal-section";
  modalContent.append(related);
}

async function loadRelated(id, type) {
  const container = document.querySelector("#related-content");
  const buttons = modalContent.querySelectorAll(".modal-action");

  buttons.forEach(button => {
    if (button.tagName === "BUTTON") button.disabled = true;
  });

  container.textContent = "Carregando informações...";

  try {
    const json = await apiRequest(`/anime/${id}/${type}`);
    container.replaceChildren();

    const heading = document.createElement("h3");
    heading.textContent = type === "characters"
      ? "Personagens"
      : "Episódios";
    container.append(heading);

    const list = document.createElement("div");
    list.className = "modal-list";

    (json.data || []).slice(0, 20).forEach(item => {
      const entry = document.createElement("span");

      if (type === "characters") {
        entry.textContent = `${item.character?.name || "Personagem"} — ${item.role || "Elenco"}`;
      } else {
        entry.textContent = `Ep. ${item.mal_id}: ${item.title || "Título indisponível"}`;
      }

      list.append(entry);
    });

    if (!list.children.length) {
      container.append("Nenhum registro disponível.");
    } else {
      container.append(list);
    }
  } catch (error) {
    container.textContent = error.message || "Não foi possível carregar os dados.";
  } finally {
    buttons.forEach(button => {
      if (button.tagName === "BUTTON") button.disabled = false;
    });
  }
}

loadAnime();
