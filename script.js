
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
let cache = new Map();

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
      ? parsed.href : "";
  } catch {
    return "";
  }
}

function showMessage(text, error = false) {
  message.textContent = text;
  message.className = error ? "message error" : "message";
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
    throw new Error(
      "Limite de consultas atingido. Aguarde alguns segundos e tente novamente."
    );
  }

  if (!response.ok) {
    throw new Error(
      `A API retornou erro ${response.status}. Tente novamente mais tarde.`
    );
  }

  const json = await response.json();

  if (json.error) {
    throw new Error(json.message || "A API retornou um erro.");
  }

  cache.set(path, json);
  return json;
}

function buildQuery() {
  const params = new URLSearchParams();

  params.set("page", currentPage);
  params.set("limit", "20");

  const term = searchInput.value.trim();

  if (term) params.set("q", term);
  if (genreFilter.value) params.set("genres", genreFilter.value);

  const order = sortFilter.value;
  params.set("order_by", order);

  if (order === "title") {
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
  showMessage("Carregando animes...");
  setLoading(true);
  hasNextPage = false;

  try {
    let path;

    if (
      searchMode === "popular" &&
      !searchInput.value.trim() &&
      !genreFilter.value &&
      sortFilter.value === "score"
    ) {
      path = `/top/anime?page=${currentPage}&limit=20`;
    } else {
      path = buildQuery();
    }

    const json = await apiRequest(path, signal);

    if (version !== requestVersion) return;

    const animes = json.data || [];
    const unique = [
      ...new Map(animes.map(anime => [anime.mal_id, anime])).values()
    ];

    hasNextPage = Boolean(json.pagination?.has_next_page);
    renderAnime(unique);

    document.querySelector("#stat-total").textContent =
      json.pagination?.items?.total?.toLocaleString("pt-BR") ||
      unique.length;

    document.querySelector("#page-number").textContent =
      `Página ${currentPage}`;

    document.querySelector("#page-label").textContent =
      `Página ${currentPage}`;

    document.querySelector("#results-label").textContent =
      searchInput.value.trim()
        ? `Resultados para "${searchInput.value.trim()}"`
        : genreFilter.value
          ? "Animes filtrados"
          : "Animes em destaque";

    if (!unique.length) {
      showMessage("Nenhum anime encontrado. Tente outra pesquisa.");
    } else {
      message.hidden = true;
    }
  } catch (error) {
    if (error.name === "AbortError" || version !== requestVersion) return;

    showMessage(
      `${error.message} Se o problema continuar, verifique a documentação da Tenrai.`,
      true
    );
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

    const poster = document.createElement("div");
    poster.className = "poster-wrap";

    const imageURL = safeImage(
      anime.images?.webp?.large_image_url ||
      anime.images?.jpg?.large_image_url ||
      anime.image_url
    );

    if (imageURL) {
      const img = document.createElement("img");
      img.className = "poster";
      img.src = imageURL;
      img.alt = `Capa de ${anime.title || "anime"}`;
      img.loading = "lazy";

      img.onerror = () => {
        img.remove();
        poster.textContent = "✦";
      };

      poster.append(img);
    } else {
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
    title.textContent = anime.title || "Título indisponível";

    const meta = document.createElement("div");
    meta.className = "card-meta";

    const episodes = document.createElement("span");
    episodes.textContent = anime.episodes == null
      ? "Episódios: —"
      : `${anime.episodes} episódios`;

    const year = document.createElement("span");
    year.textContent = anime.year ||
      anime.aired?.prop?.from?.year || "—";

    meta.append(episodes, year);

    const genres = document.createElement("div");
    genres.className = "genres";
    genres.textContent = (anime.genres || [])
      .slice(0, 2)
      .map(item => item.name)
      .join(" · ") || "Anime";

    info.append(title, meta, genres);
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
    const json = await apiRequest(`/anime/${id}`);

    if (!modal.open) return;

    renderDetails(json.data || json);
  } catch (error) {
    if (!modal.open) return;

    modalContent.replaceChildren();

    const text = document.createElement("p");
    text.className = "message error";
    text.textContent = error.message;

    modalContent.append(text);
  }
}

function renderDetails(anime) {
  modalContent.replaceChildren();

  const layout = document.createElement("div");
  layout.className = "modal-layout";

  const imageURL = safeImage(
    anime.images?.webp?.large_image_url ||
    anime.images?.jpg?.large_image_url ||
    anime.image_url
  );

  if (imageURL) {
    const img = document.createElement("img");
    img.className = "modal-poster";
    img.src = imageURL;
    img.alt = `Capa de ${anime.title || "anime"}`;
    layout.append(img);
  }

  const info = document.createElement("div");

  const title = document.createElement("h2");
  title.textContent = anime.title || "Anime";

  const score = document.createElement("p");
  score.className = "modal-meta";
  score.textContent =
    `★ ${anime.score ?? "Sem nota"} · ${anime.year || "Ano desconhecido"} · ${anime.episodes ?? "?"} episódios`;

  const synopsis = document.createElement("p");
  synopsis.className = "modal-description";
  synopsis.textContent = anime.synopsis || "Sinopse indisponível.";

  const genres = document.createElement("div");
  genres.className = "modal-list";

  (anime.genres || []).forEach(genre => {
    const item = document.createElement("span");
    item.textContent = genre.name;
    genres.append(item);
  });

  info.append(title, score, synopsis, genres);
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
  const buttons = modalContent.querySelectorAll("button.modal-action");

  buttons.forEach(button => button.disabled = true);
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
        entry.textContent =
          `${item.character?.name || item.name || "Personagem"} — ${item.role || "Elenco"}`;
      } else {
        entry.textContent =
          `Ep. ${item.mal_id ?? item.episode ?? "—"}: ${item.title || "Título indisponível"}`;
      }

      list.append(entry);
    });

    if (!list.children.length) {
      container.append("Nenhum registro disponível.");
    } else {
      container.append(list);
    }
  } catch (error) {
    container.textContent = error.message ||
      "Não foi possível carregar os dados.";
  } finally {
    buttons.forEach(button => button.disabled = false);
  }
}

loadAnime();
