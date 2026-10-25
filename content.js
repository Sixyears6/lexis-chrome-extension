/**
 * ============================================================================
 * Lexis — Content Script (content.js)
 * ============================================================================
 * 1. Khắc phục triệt để lỗi mất icon trên YouTube (phụ đề, nút Like, thanh công cụ):
 *    - Cô lập hoàn toàn CSS bằng Shadow DOM, không dùng global reset trên trang gốc.
 *    - Bảo vệ các Web Component của YouTube (yt-icon, ytd-menu-renderer, player controls)
 *      và không gọi document.body.normalize().
 * 2. Cửa sổ nổi thông minh (400px × 300–500px) & Thanh thu nhỏ kéo thả tự do:
 *    - Có thể di chuyển (Drag & Drop) tới bất kỳ vị trí nào trên màn hình.
 *    - Có thể thu nhỏ (Minimize —) thành viên thuốc nhỏ gọn (cũng kéo thả được).
 *    - KHÔNG tự tắt khi click ra ngoài trang web — chỉ tắt khi bấm nút ×.
 *    - Tự động lưu nháp (Draft Auto-Save) mọi nội dung đang nhập, không bao giờ mất chữ.
 * 3. Tích hợp Khung dịch như Google Dịch + Thanh tìm kiếm có Gợi ý từ tự động (Autocomplete).
 */

(() => {
  if (window.__LEXIS_CONTENT_ACTIVE__) return;
  window.__LEXIS_CONTENT_ACTIVE__ = true;

  // Các thẻ kỹ thuật, media và Web Component của YouTube / Web App tuyệt đối không chạm vào
  const FORBIDDEN_TAGS = new Set([
    'IMG', 'PICTURE', 'SOURCE', 'SVG', 'PATH', 'G', 'DEFS', 'SYMBOL', 'USE',
    'VIDEO', 'AUDIO', 'CANVAS', 'TRACK', 'MAP', 'AREA',
    'CODE', 'PRE', 'KBD', 'SAMP', 'VAR',
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE',
    'IFRAME', 'OBJECT', 'EMBED', 'PORTAL',
    'TEXTAREA', 'INPUT', 'SELECT', 'BUTTON', 'OPTION', 'OPTGROUP', 'LABEL',
    'HEAD', 'META', 'LINK', 'TITLE', 'BASE', 'MATH', 'TIME',
    'NAV', 'HEADER', 'FOOTER',
    // YouTube & Custom UI Web Components (bảo vệ icon phụ đề, nút Like, thanh công cụ)
    'YT-ICON', 'YT-ICON-BUTTON', 'YT-BUTTON-SHAPE', 'YT-BUTTON-RENDERER',
    'YTD-BUTTON-RENDERER', 'YTD-TOGGLE-BUTTON-RENDERER', 'YTD-MENU-RENDERER',
    'YTD-SEGMENTED-LIKE-DISLIKE-BUTTON-RENDERER', 'YTD-DOWNLOAD-BUTTON-RENDERER',
    'TP-YT-PAPER-BUTTON', 'TP-YT-IRON-ICON', 'TP-YT-PAPER-ICON-BUTTON',
    'YT-FORMATTED-STRING-ICON'
  ]);

  const ALLOWED_READING_TAGS = new Set([
    'P', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'LI', 'TD', 'BLOCKQUOTE', 'ARTICLE'
  ]);

  const BLOCK_GROUP_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, td, blockquote, article';

  let settings = {
    provider: 'gemini',
    autoTranslate: false,
    displayMode: 'bilingual' // 'bilingual' | 'word_by_word' | 'replace'
  };

  let learnedWords = [];
  let draftState = {
    word: '',
    pos: 'n',
    phonetic: '',
    meaning: '',
    gtText: '',
    gtSourceLang: 'auto',
    gtTargetLang: 'Tiếng Việt'
  };

  let winState = {
    mode: 'minimized', // 'open' | 'minimized' | 'closed'
    winLeft: null,
    winTop: null,
    launcherLeft: null,
    launcherTop: null,
    activeTab: 'pane-gt' // 'pane-gt' | 'pane-vocab' | 'pane-grammar'
  };

  let isTranslating = false;
  let isPageTranslated = false;

  const translationMemoryCache = new Map();
  const wordByWordMemoryCache = new Map();
  const translatedUnits = new Map();
  const pageVocabularySet = new Set();

  // Tham chiếu Shadow DOM
  let shadowHost = null;
  let shadowRoot = null;
  let tooltipEl = null;
  let selectionPillEl = null;
  let launcherEl = null;
  let windowEl = null;
  let errorToastEl = null;

  let currentSelection = { text: '', sentence: '' };
  let activeInspectorItem = null;
  let lastGtResult = null;
  let errorToastTimer = null;
  let suggestDebounceTimer = null;
  let gtAutoTranslateTimer = null;
  let currentSuggestions = [];
  let activeSuggestionIdx = -1;

  async function init() {
    injectScopedLightDomStyles();
    await syncStorage();
    mountShadowUI();
    attachPageListeners();
    scanPageWordsForAutocomplete();
    markLearnedWordsInRoot(document.body);

    if (settings.autoTranslate) {
      setTimeout(() => translateCurrentPage(), 600);
    }
  }

  /**
   * Chỉ chèn đúng 5 class hiển thị văn bản vào Light DOM, tuyệt đối không có
   * quy tắc '*' hay reset margin/padding làm hỏng giao diện và icon của YouTube.
   */
  function injectScopedLightDomStyles() {
    if (document.getElementById('lexis-light-dom-style')) return;
    const style = document.createElement('style');
    style.id = 'lexis-light-dom-style';
    style.textContent = `
      span.lw-text-seg {
        color: inherit !important;
        background: transparent !important;
        font-size: inherit !important;
        font-family: inherit !important;
        font-weight: inherit !important;
        line-height: inherit !important;
        letter-spacing: inherit !important;
        display: inline !important;
      }
      span.lw-bilingual-sub {
        display: block !important;
        color: inherit !important;
        background: transparent !important;
        font-size: 0.93em !important;
        font-family: inherit !important;
        font-weight: normal !important;
        line-height: 1.6 !important;
        opacity: 0.84 !important;
        margin-top: 6px !important;
        margin-bottom: 4px !important;
        padding: 2px 0 2px 10px !important;
        border-left: 2px solid rgba(120, 120, 120, 0.42) !important;
      }
      ruby.lw-wbw-ruby {
        ruby-position: under !important;
        -webkit-ruby-position: after !important;
        color: inherit !important;
        background: transparent !important;
        font-family: inherit !important;
        font-size: inherit !important;
        margin: 0 2px !important;
        line-height: 2.1 !important;
      }
      rt.lw-wbw-rt {
        color: inherit !important;
        background: transparent !important;
        font-size: 0.68em !important;
        font-weight: 400 !important;
        opacity: 0.75 !important;
        letter-spacing: 0 !important;
        user-select: none !important;
      }
      span.lw-anchor {
        color: inherit !important;
        background: transparent !important;
        font-size: inherit !important;
        font-family: inherit !important;
        font-weight: inherit !important;
        line-height: inherit !important;
        border-bottom: 1.5px dashed rgba(120, 120, 120, 0.45) !important;
        padding-bottom: 1px !important;
        cursor: help !important;
        text-decoration: none !important;
        display: inline !important;
      }
      span.lw-anchor:hover {
        border-bottom-color: rgba(120, 120, 120, 0.9) !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  async function syncStorage() {
    try {
      const data = await chrome.storage.local.get([
        'settings',
        'learned_words',
        'lexis_draft',
        'lexis_win_state'
      ]);
      if (data.settings) settings = { ...settings, ...data.settings };
      if (Array.isArray(data.learned_words)) learnedWords = data.learned_words;
      if (data.lexis_draft) draftState = { ...draftState, ...data.lexis_draft };
      if (data.lexis_win_state) winState = { ...winState, ...data.lexis_win_state };
    } catch (_) {}
  }

  async function saveDraftState() {
    try {
      await chrome.storage.local.set({ lexis_draft: draftState });
      const statusEl = windowEl?.querySelector('#lw-draft-status');
      if (statusEl) {
        statusEl.textContent = draftState.word || draftState.meaning
          ? '✓ Đã tự lưu nháp'
          : 'Tự động lưu khi gõ';
      }
    } catch (_) {}
  }

  async function saveWinState() {
    try {
      await chrome.storage.local.set({ lexis_win_state: winState });
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // KHỞI TẠO GIAO DIỆN SHADOW DOM (CỬA SỔ NỔI 400PX & THANH THU NHỎ KÉO THẢ)
  // --------------------------------------------------------------------------
  function mountShadowUI() {
    if (document.getElementById('lexis-shadow-host')) return;

    shadowHost = document.createElement('div');
    shadowHost.id = 'lexis-shadow-host';
    shadowRoot = shadowHost.attachShadow({ mode: 'open' });

    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = chrome.runtime.getURL('shadow-style.css');
    shadowRoot.appendChild(styleLink);

    // 1. Hover Tooltip
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'lw-tooltip';
    tooltipEl.innerHTML = `
      <div class="lw-tt-top">
        <span class="lw-tt-word" id="lw-tt-word"></span>
        <span class="lw-tt-phonetic" id="lw-tt-phonetic"></span>
        <span class="lw-tt-pos" id="lw-tt-pos"></span>
      </div>
      <div class="lw-tt-meaning" id="lw-tt-meaning"></div>
    `;

    // 2. Selection Pill
    selectionPillEl = document.createElement('button');
    selectionPillEl.className = 'lw-selection-pill';
    selectionPillEl.innerHTML = `<span class="lw-pill-dot"></span><span>Dịch &amp; Giải thích</span>`;

    // 3. Draggable Minimized Launcher Pill (Có thể kéo thả tự do, không che YouTube)
    launcherEl = document.createElement('div');
    launcherEl.className = 'lw-launcher';
    launcherEl.innerHTML = `
      <div class="lw-launcher-drag" id="lw-launcher-drag" title="Giữ chuột để kéo thanh này tới vị trí bất kỳ">
        <span class="lw-launcher-grip">⋮⋮</span>
        <span>Lexis</span>
      </div>
      <button class="lw-launcher-btn" id="lw-launcher-translate">Dịch trang</button>
      <button class="lw-launcher-btn primary" id="lw-launcher-open" title="Mở cửa sổ dịch & từ vựng (Alt+L)">Mở cửa sổ ❐</button>
    `;

    // 4. Persistent Draggable Floating Window (400px × 300–500px, chỉ đóng khi bấm ×)
    windowEl = document.createElement('section');
    windowEl.className = 'lw-window';
    windowEl.innerHTML = `
      <!-- Thanh tiêu đề kéo thả (Draggable Header) -->
      <header class="lw-win-header" id="lw-win-drag-handle" title="Giữ chuột để di chuyển cửa sổ">
        <div class="lw-win-brand">
          <span class="lw-win-grip">⋮⋮</span>
          <span class="lw-win-title">Lexis Studio</span>
          <span class="lw-win-badge" id="lw-win-count">${learnedWords.length} từ</span>
        </div>
        <div class="lw-win-controls">
          <button class="lw-win-ctrl-btn" id="lw-win-minimize" title="Thu nhỏ thành thanh gọn (—)">—</button>
          <button class="lw-win-ctrl-btn close" id="lw-win-close" title="Đóng cửa sổ (Chỉ tắt khi bấm nút này)">×</button>
        </div>
      </header>

      <!-- Thanh tìm kiếm thông minh kèm gợi ý từ tự động (Autocomplete) -->
      <div class="lw-search-bar">
        <div class="lw-search-input-wrap">
          <input
            type="text"
            class="lw-search-input"
            id="lw-search-input"
            placeholder="Tìm từ vựng hoặc tra từ mới (gợi ý tự động)..."
            autocomplete="off"
            spellcheck="false"
          />
          <button class="lw-search-clear" id="lw-search-clear" title="Xóa tìm kiếm">×</button>
          <button class="lw-search-go" id="lw-search-go" title="Dịch từ này">Tra</button>
        </div>
        <div class="lw-sug-dropdown" id="lw-sug-dropdown"></div>
      </div>

      <!-- 3 Tab chức năng -->
      <nav class="lw-win-tabs">
        <button class="lw-win-tab is-active" data-tab="pane-gt">Google Dịch</button>
        <button class="lw-win-tab" data-tab="pane-vocab">Lưu &amp; Sổ từ</button>
        <button class="lw-win-tab" data-tab="pane-grammar">Ngữ pháp câu</button>
      </nav>

      <!-- Nội dung cuộn mượt trong khung 300–500px -->
      <div class="lw-win-body">
        <!-- TAB 1: GOOGLE DỊCH -->
        <div class="lw-tab-pane is-active" id="pane-gt">
          <div class="lw-gt-langbar">
            <select class="lw-gt-select" id="lw-gt-source-lang">
              <option value="auto">Tự động phát hiện</option>
              <option value="Tiếng Anh">Tiếng Anh</option>
              <option value="Tiếng Việt">Tiếng Việt</option>
              <option value="Tiếng Nhật">Tiếng Nhật</option>
              <option value="Tiếng Hàn">Tiếng Hàn</option>
              <option value="Tiếng Trung">Tiếng Trung</option>
              <option value="Tiếng Pháp">Tiếng Pháp</option>
            </select>
            <button class="lw-gt-swap" id="lw-gt-swap" title="Đảo chiều ngôn ngữ">⇄</button>
            <select class="lw-gt-select" id="lw-gt-target-lang">
              <option value="Tiếng Việt">Tiếng Việt</option>
              <option value="Tiếng Anh">Tiếng Anh</option>
              <option value="Tiếng Nhật">Tiếng Nhật</option>
              <option value="Tiếng Hàn">Tiếng Hàn</option>
              <option value="Tiếng Trung">Tiếng Trung</option>
            </select>
          </div>

          <div class="lw-gt-source-box">
            <textarea
              class="lw-gt-textarea"
              id="lw-gt-input"
              placeholder="Nhập từ, cụm từ hoặc câu cần dịch (tự động lưu nháp)..."
            ></textarea>
            <div class="lw-gt-source-Sub">
              <div class="lw-gt-mini-actions">
                <button class="lw-mini-btn" id="lw-gt-speak-src" title="Phát âm văn bản gốc">🔊 Nghe</button>
                <button class="lw-mini-btn" id="lw-gt-clear" title="Xóa ô dịch">Xóa</button>
              </div>
              <button class="lw-gt-run-btn" id="lw-gt-submit">Dịch ngay</button>
            </div>
          </div>

          <div id="lw-gt-output-area">
            <div class="lw-gt-result-card" style="color:#71717a;font-size:12px;">
              Nhập văn bản ở trên, chọn từ gợi ý trên thanh tìm kiếm, hoặc bôi đen từ trên trang để dịch tức thì.
            </div>
          </div>
        </div>

        <!-- TAB 2: LƯU TỪ & SỔ TỪ VỰNG (KHÔNG BAO GIỜ MẤT CHỮ ĐANG NHẬP) -->
        <div class="lw-tab-pane" id="pane-vocab">
          <div class="lw-vocab-composer">
            <div class="lw-composer-head">
              <span>Thêm từ vựng mới</span>
              <span class="lw-draft-status" id="lw-draft-status">Tự động lưu khi gõ</span>
            </div>
            <div class="lw-comp-row-1">
              <input type="text" class="lw-input" id="lw-add-word" placeholder="Từ / cụm từ gốc (vd: resilient)" />
              <select class="lw-gt-select" id="lw-add-pos" style="height:30px;">
                <option value="n">Danh từ (n)</option>
                <option value="v">Động từ (v)</option>
                <option value="adj">Tính từ (adj)</option>
                <option value="adv">Trạng từ (adv)</option>
                <option value="phrase">Cụm từ</option>
                <option value="idiom">Thành ngữ</option>
              </select>
            </div>
            <div class="lw-comp-row-2">
              <input type="text" class="lw-input" id="lw-add-meaning" placeholder="Nghĩa tiếng Việt (hoặc bấm AI điền)" />
              <button class="lw-mini-btn" id="lw-ai-fill-btn" title="Tự động điền nghĩa & phiên âm bằng AI" style="height:30px;padding:0 8px;">✨ AI điền</button>
              <button class="lw-gt-run-btn" id="lw-add-save-btn" style="height:30px;">+ Lưu</button>
            </div>
          </div>

          <div class="lw-win-vocab-list" id="lw-win-vocab-list"></div>
        </div>

        <!-- TAB 3: MỔ XẺ NGỮ PHÁP CÂU -->
        <div class="lw-tab-pane" id="pane-grammar">
          <div class="lw-ins-word-row">
            <span class="lw-ins-word" id="lw-ins-word">Chọn câu hoặc từ trên trang</span>
            <span class="lw-ins-pos" id="lw-ins-pos" style="display:none;"></span>
          </div>
          <div class="lw-ins-sub">
            <span id="lw-ins-phonetic">Bôi đen cụm từ bất kỳ trên trang web để phân tích ngữ pháp.</span>
            <button class="lw-mini-btn" id="lw-ins-speak" style="display:none;">🔊 Phát âm</button>
          </div>
          <div class="lw-ins-divider"></div>
          <div id="lw-ins-body">
            <div class="lw-ins-why">
              Click vào từ có gạch chân nét đứt hoặc bôi đen một câu bất kỳ trên bài viết để xem bản dịch ngữ cảnh và mổ xẻ cấu trúc ngữ pháp tại đây.
            </div>
          </div>
          <div style="margin-top:8px;display:flex;">
            <button class="lw-action-btn" id="lw-ins-action-btn" style="display:none;">Lưu vào danh sách đã học</button>
          </div>
        </div>
      </div>

      <!-- Chân cửa sổ: Điều khiển dịch toàn trang -->
      <footer class="lw-win-footer">
        <div class="lw-footer-left">
          <select class="lw-dock-select" id="lw-dock-mode" title="Chế độ hiển thị dịch trên trang">
            <option value="bilingual">Song ngữ (Bên dưới)</option>
            <option value="word_by_word">Dịch từng từ</option>
            <option value="replace">Thay thế</option>
          </select>
          <span class="lw-dock-status" id="lw-dock-status">Sẵn sàng</span>
        </div>
        <button class="lw-dock-btn" id="lw-dock-btn">Dịch trang</button>
      </footer>
    `;

    // 5. Error Notification Toast
    errorToastEl = document.createElement('div');
    errorToastEl.className = 'lw-error-toast';
    errorToastEl.innerHTML = `
      <div class="lw-err-head">
        <span class="lw-err-title">Không thể thực hiện yêu cầu API</span>
        <button class="lw-err-close" id="lw-err-close">×</button>
      </div>
      <div class="lw-err-body" id="lw-err-body"></div>
    `;

    shadowRoot.appendChild(tooltipEl);
    shadowRoot.appendChild(selectionPillEl);
    shadowRoot.appendChild(launcherEl);
    shadowRoot.appendChild(windowEl);
    shadowRoot.appendChild(errorToastEl);

    document.documentElement.appendChild(shadowHost);

    // Khôi phục vị trí, trạng thái nháp và tab đã lưu
    restoreDraftToInputs();
    restoreWindowPositionAndMode();
    renderWindowVocabList();

    // Kích hoạt kéo thả mượt mà cho cả Cửa sổ 400px và Thanh thu nhỏ
    makeDraggable(windowEl, windowEl.querySelector('#lw-win-drag-handle'), (left, top) => {
      winState.winLeft = left;
      winState.winTop = top;
      saveWinState();
    });

    makeDraggable(launcherEl, launcherEl.querySelector('#lw-launcher-drag'), (left, top) => {
      winState.launcherLeft = left;
      winState.launcherTop = top;
      saveWinState();
    });
  }

  /**
   * Hàm hỗ trợ kéo thả (Drag & Drop) mượt mà và giữ phần tử luôn nằm trong khung nhìn
   */
  function makeDraggable(targetEl, handleEl, onSavePos) {
    if (!targetEl || !handleEl) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    handleEl.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, input, select, textarea')) return;
      isDragging = true;
      handleEl.setPointerCapture(e.pointerId);

      const rect = targetEl.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = rect.left;
      initialTop = rect.top;

      targetEl.style.right = 'auto';
      targetEl.style.bottom = 'auto';
      targetEl.style.left = `${initialLeft}px`;
      targetEl.style.top = `${initialTop}px`;
    });

    handleEl.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const rect = targetEl.getBoundingClientRect();
      const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
      const maxTop = Math.max(8, window.innerHeight - rect.height - 8);

      const nextLeft = Math.max(8, Math.min(initialLeft + dx, maxLeft));
      const nextTop = Math.max(8, Math.min(initialTop + dy, maxTop));

      targetEl.style.left = `${Math.round(nextLeft)}px`;
      targetEl.style.top = `${Math.round(nextTop)}px`;
    });

    const stopDrag = (e) => {
      if (!isDragging) return;
      isDragging = false;
      try {
        handleEl.releasePointerCapture(e.pointerId);
      } catch (_) {}

      const rect = targetEl.getBoundingClientRect();
      if (onSavePos) onSavePos(Math.round(rect.left), Math.round(rect.top));
    };

    handleEl.addEventListener('pointerup', stopDrag);
    handleEl.addEventListener('pointercancel', stopDrag);
  }

  function restoreWindowPositionAndMode() {
    if (!windowEl || !launcherEl) return;

    windowEl.querySelector('#lw-dock-mode').value = settings.displayMode || 'bilingual';

    if (typeof winState.winLeft === 'number' && typeof winState.winTop === 'number') {
      const clampedLeft = Math.max(8, Math.min(winState.winLeft, window.innerWidth - 410));
      const clampedTop = Math.max(8, Math.min(winState.winTop, window.innerHeight - 340));
      windowEl.style.right = 'auto';
      windowEl.style.bottom = 'auto';
      windowEl.style.left = `${clampedLeft}px`;
      windowEl.style.top = `${clampedTop}px`;
    }

    if (typeof winState.launcherLeft === 'number' && typeof winState.launcherTop === 'number') {
      const clampedLeft = Math.max(8, Math.min(winState.launcherLeft, window.innerWidth - 220));
      const clampedTop = Math.max(8, Math.min(winState.launcherTop, window.innerHeight - 48));
      launcherEl.style.right = 'auto';
      launcherEl.style.bottom = 'auto';
      launcherEl.style.left = `${clampedLeft}px`;
      launcherEl.style.top = `${clampedTop}px`;
    }

    switchWindowTab(winState.activeTab || 'pane-gt', false);
    applyWindowVisibility(winState.mode || 'minimized', false);
  }

  function applyWindowVisibility(mode, persist = true) {
    winState.mode = mode;
    if (mode === 'open') {
      windowEl.classList.add('is-open');
      launcherEl.classList.add('is-hidden');
    } else if (mode === 'minimized') {
      windowEl.classList.remove('is-open');
      launcherEl.classList.remove('is-hidden');
    } else {
      // 'closed' khi bấm nút ×: đóng hẳn cửa sổ 400px, chỉ hiện nút mở nhỏ gọn
      windowEl.classList.remove('is-open');
      launcherEl.classList.remove('is-hidden');
    }
    if (persist) saveWinState();
  }

  function switchWindowTab(tabId, persist = true) {
    if (!windowEl) return;
    winState.activeTab = tabId;
    windowEl.querySelectorAll('.lw-win-tab').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-tab') === tabId);
    });
    windowEl.querySelectorAll('.lw-tab-pane').forEach((pane) => {
      pane.classList.toggle('is-active', pane.id === tabId);
    });
    if (persist) saveWinState();
  }

  function restoreDraftToInputs() {
    if (!windowEl) return;
    windowEl.querySelector('#lw-add-word').value = draftState.word || '';
    windowEl.querySelector('#lw-add-pos').value = draftState.pos || 'n';
    windowEl.querySelector('#lw-add-meaning').value = draftState.meaning || '';
    windowEl.querySelector('#lw-gt-input').value = draftState.gtText || '';
    windowEl.querySelector('#lw-gt-source-lang').value = draftState.gtSourceLang || 'auto';
    windowEl.querySelector('#lw-gt-target-lang').value = draftState.gtTargetLang || 'Tiếng Việt';

    const statusEl = windowEl.querySelector('#lw-draft-status');
    if (statusEl && (draftState.word || draftState.meaning)) {
      statusEl.textContent = '✓ Đã khôi phục bản nháp chưa lưu';
    }
  }

  function showErrorToast(message) {
    if (!errorToastEl) return;
    errorToastEl.querySelector('#lw-err-body').textContent = message;
    errorToastEl.classList.add('is-visible');
    clearTimeout(errorToastTimer);
    errorToastTimer = setTimeout(() => {
      errorToastEl.classList.remove('is-visible');
    }, 9000);
  }

  function hideErrorToast() {
    errorToastEl?.classList.remove('is-visible');
  }

  // --------------------------------------------------------------------------
  // BỘ LỌC BẢO VỆ GIAO DIỆN YOUTUBE & TRANG WEB GỐC
  // --------------------------------------------------------------------------
  function isTechnicalOrMediaString(rawText) {
    const str = (rawText || '').trim();
    if (!str || str.length < 2) return true;

    if (/^(https?:\/\/|ftp:\/\/|www\.|data:|blob:|mailto:|tel:|javascript:)/i.test(str)) {
      return true;
    }

    if (/\.(png|jpe?g|webp|svg|gif|ico|bmp|avif|mp4|webm|mp3|wav|ogg|pdf|zip|rar|tar|gz|js|mjs|ts|jsx|tsx|css|scss|less|html?|json|xml|yaml|yml|md|woff2?|ttf|eot)(\?[^\s]*)?$/i.test(str)) {
      return true;
    }

    if (/^(\/|\.\/|\.\.\/)[a-zA-Z0-9_.\-/]+$/.test(str)) {
      return true;
    }
    if (/https?:\/\/[^\s]+/i.test(str) && str.split(/\s+/).length <= 3) {
      return true;
    }

    if (/^<[^>]+>$/.test(str) || /^\{[\s\S]*\}$/.test(str)) {
      return true;
    }
    if (!/\s/.test(str) && (/^[a-z]+([A-Z][a-z0-9]+)+$/.test(str) || /^[a-z0-9]+(_[a-z0-9]+)+$/i.test(str))) {
      return true;
    }

    if (!/[\p{L}]/u.test(str)) {
      return true;
    }

    return false;
  }

  function isEligibleTextNode(textNode) {
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return false;
    const raw = textNode.nodeValue || '';
    if (!raw.trim()) return false;

    const parent = textNode.parentElement;
    if (!parent) return false;
    if (parent.closest('#lexis-shadow-host')) return false;
    if (parent.isContentEditable) return false;

    // Bảo vệ tuyệt đối thanh điều khiển video YouTube (phụ đề, cài đặt) & thanh nút Like/Share/Subscribe
    if (
      parent.closest(
        '.ytp-chrome-bottom, .ytp-chrome-top, .ytp-settings-menu, #top-level-buttons-computed, #flexible-item-buttons, #menu-container, ytd-menu-renderer, ytd-segmented-like-dislike-button-renderer, yt-button-shape, yt-icon, tp-yt-paper-button, [role="button"], [role="toolbar"], [role="menu"], [role="menubar"], [role="tab"], [aria-hidden="true"]'
      )
    ) {
      return false;
    }

    let cursor = parent;
    let insideAllowedReadingTag = false;

    while (cursor && cursor !== document.body && cursor !== document.documentElement) {
      if (FORBIDDEN_TAGS.has(cursor.tagName)) {
        return false;
      }
      if (ALLOWED_READING_TAGS.has(cursor.tagName)) {
        insideAllowedReadingTag = true;
      }
      const cls = typeof cursor.className === 'string' ? cursor.className : '';
      if (/\b(hljs|prism|syntax|codeblock|code-block|mathjax|katex|ytp-button|yt-spec-button-shape-next)\b/i.test(cls)) {
        return false;
      }
      cursor = cursor.parentElement;
    }

    if (!insideAllowedReadingTag) return false;
    if (isTechnicalOrMediaString(raw)) return false;

    return true;
  }

  /**
   * Quét các từ xuất hiện trên trang để phục vụ gợi ý nhanh (Autocomplete) khi tìm kiếm
   */
  function scanPageWordsForAutocomplete() {
    try {
      const text = (document.body?.innerText || '').slice(0, 60000);
      const matches = text.match(/[\p{L}]{3,24}/gu) || [];
      for (const m of matches) {
        const clean = m.toLowerCase();
        if (clean.length >= 3) {
          pageVocabularySet.add(clean);
          if (pageVocabularySet.size >= 1500) break;
        }
      }
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // THANH TÌM KIẾM KÈM GỢI Ý TỪ TỰ ĐỘNG (SEARCH + AUTOCOMPLETE SUGGESTIONS)
  // --------------------------------------------------------------------------
  async function updateSearchSuggestions(query) {
    const dropdown = windowEl?.querySelector('#lw-sug-dropdown');
    if (!dropdown) return;

    const q = (query || '').trim().toLowerCase();
    if (!q) {
      dropdown.classList.remove('is-open');
      currentSuggestions = [];
      activeSuggestionIdx = -1;
      return;
    }

    const results = [];
    const seen = new Set();

    // 1. Gợi ý từ danh sách Từ đã lưu (khớp cả từ gốc lẫn nghĩa tiếng Việt)
    for (const item of learnedWords) {
      const w = (item.word || '').trim();
      const m = (item.meaning || '').trim();
      if (w.toLowerCase().includes(q) || m.toLowerCase().includes(q)) {
        const key = w.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            word: w,
            meaning: m,
            pos: item.pos || '',
            source: 'Đã lưu',
            isSaved: true
          });
        }
      }
      if (results.length >= 4) break;
    }

    // 2. Gợi ý từ các từ xuất hiện ngay trên trang web đang đọc
    for (const pageWord of pageVocabularySet) {
      if (pageWord.startsWith(q) && !seen.has(pageWord)) {
        seen.add(pageWord);
        results.push({
          word: pageWord,
          meaning: 'Từ xuất hiện trên trang này',
          pos: '',
          source: 'Trên trang',
          isSaved: false
        });
        if (results.length >= 6) break;
      }
    }

    renderSuggestionList(results);

    // 3. Gợi ý từ điển trực tuyến (Datamuse API qua background.js)
    clearTimeout(suggestDebounceTimer);
    suggestDebounceTimer = setTimeout(async () => {
      try {
        const res = await chrome.runtime.sendMessage({
          action: 'SUGGEST_WORDS',
          payload: { query: q }
        });
        const dictWords = res?.data?.suggestions || [];
        for (const dw of dictWords) {
          const lower = dw.toLowerCase();
          if (!seen.has(lower)) {
            seen.add(lower);
            results.push({
              word: dw,
              meaning: 'Tra nghĩa & phát âm',
              pos: '',
              source: 'Gợi ý từ',
              isSaved: false
            });
          }
          if (results.length >= 8) break;
        }
        renderSuggestionList(results);
      } catch (_) {}
    }, 140);
  }

  function renderSuggestionList(items) {
    const dropdown = windowEl?.querySelector('#lw-sug-dropdown');
    if (!dropdown) return;

    currentSuggestions = items;
    activeSuggestionIdx = -1;

    if (items.length === 0) {
      dropdown.classList.remove('is-open');
      dropdown.innerHTML = '';
      return;
    }

    dropdown.innerHTML = items
      .map(
        (item, idx) => `
        <div class="lw-sug-item" data-idx="${idx}" data-word="${escapeHTML(item.word)}">
          <div class="lw-sug-left">
            <span class="lw-sug-word">${escapeHTML(item.word)}</span>
            <span class="lw-sug-meaning">${escapeHTML(item.meaning)}</span>
          </div>
          <span class="lw-sug-tag ${item.isSaved ? 'saved' : ''}">${escapeHTML(item.source)}</span>
        </div>
      `
      )
      .join('');

    dropdown.classList.add('is-open');

    dropdown.querySelectorAll('.lw-sug-item').forEach((row) => {
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const word = row.getAttribute('data-word');
        if (word) selectSearchSuggestion(word);
      });
    });
  }

  function selectSearchSuggestion(word) {
    if (!windowEl) return;
    const searchInput = windowEl.querySelector('#lw-search-input');
    const dropdown = windowEl.querySelector('#lw-sug-dropdown');

    searchInput.value = word;
    dropdown.classList.remove('is-open');

    // Đồng thời lọc danh sách từ vựng và dịch ngay trong tab Google Dịch
    renderWindowVocabList(word);
    switchWindowTab('pane-gt');

    const gtInput = windowEl.querySelector('#lw-gt-input');
    gtInput.value = word;
    draftState.gtText = word;
    saveDraftState();
    runQuickTranslate(word);
  }

  // --------------------------------------------------------------------------
  // GOOGLE DỊCH TRONG CỬA SỔ NỔI 400PX (QUICK TRANSLATE)
  // --------------------------------------------------------------------------
  async function runQuickTranslate(overrideText = null) {
    if (!windowEl) return;
    const gtInput = windowEl.querySelector('#lw-gt-input');
    const sourceLang = windowEl.querySelector('#lw-gt-source-lang').value;
    const targetLang = windowEl.querySelector('#lw-gt-target-lang').value;
    const outputArea = windowEl.querySelector('#lw-gt-output-area');

    const text = (overrideText !== null ? overrideText : gtInput.value).trim();
    if (!text) return;

    outputArea.innerHTML = `
      <div class="lw-gt-result-card">
        <div class="lw-ins-loading" style="padding:8px 0;">
          <div class="lw-spinner"></div>
          <span>Đang dịch "${escapeHTML(text.slice(0, 36))}..."</span>
        </div>
      </div>
    `;

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'QUICK_TRANSLATE',
        payload: {
          text,
          sourceLang,
          targetLang
        }
      });

      if (!res || !res.success) {
        throw new Error(res?.error || 'Không thể dịch văn bản.');
      }

      const data = res.data;
      lastGtResult = {
        word: text,
        meaning: data.shortMeaning || data.translatedText || '',
        pos: data.pos || 'n',
        phonetic: data.phonetic || '',
        translatedText: data.translatedText || ''
      };

      const altHtml =
        Array.isArray(data.alternatives) && data.alternatives.length > 0
          ? `<ul class="lw-gt-alt-list">${data.alternatives
              .map((a) => `<li>• ${escapeHTML(a)}</li>`)
              .join('')}</ul>`
          : '';

      outputArea.innerHTML = `
        <div class="lw-gt-result-card">
          <div class="lw-gt-main-out">${escapeHTML(data.translatedText)}</div>
          <div class="lw-gt-meta-row">
            ${data.phonetic ? `<span>${escapeHTML(data.phonetic)}</span>` : ''}
            ${data.pos ? `<span class="lw-gt-pos-badge">${escapeHTML(data.pos)}</span>` : ''}
            ${data.detectedLang ? `<span>(${escapeHTML(data.detectedLang)})</span>` : ''}
            <button class="lw-mini-btn" id="lw-gt-speak-out">🔊 Phát âm</button>
          </div>
          ${altHtml}
          ${data.grammarNote ? `<div class="lw-gt-note">${escapeHTML(data.grammarNote)}</div>` : ''}
          <div class="lw-gt-save-bar">
            <button class="lw-action-btn" id="lw-gt-quick-save">+ Lưu nhanh vào sổ từ</button>
            <button class="lw-mini-btn" id="lw-gt-to-form" style="padding:5px 9px;">Sửa trước khi lưu</button>
          </div>
        </div>
      `;

      outputArea.querySelector('#lw-gt-speak-out')?.addEventListener('click', () => {
        speakText(text);
      });

      outputArea.querySelector('#lw-gt-quick-save')?.addEventListener('click', async (e) => {
        await saveOrUpdateVocabularyItem({
          word: lastGtResult.word,
          meaning: lastGtResult.meaning,
          pos: lastGtResult.pos || 'n',
          phonetic: lastGtResult.phonetic || ''
        });
        e.target.textContent = '✓ Đã lưu vào sổ từ vựng';
        e.target.classList.add('is-saved');
      });

      outputArea.querySelector('#lw-gt-to-form')?.addEventListener('click', () => {
        draftState.word = lastGtResult.word;
        draftState.meaning = lastGtResult.meaning;
        draftState.pos = lastGtResult.pos || 'n';
        draftState.phonetic = lastGtResult.phonetic || '';
        saveDraftState();
        restoreDraftToInputs();
        switchWindowTab('pane-vocab');
      });
    } catch (err) {
      outputArea.innerHTML = `
        <div class="lw-gt-result-card" style="border-color:#7f1d1d;color:#fca5a5;">
          ${escapeHTML(err.message)}
        </div>
      `;
    }
  }

  // --------------------------------------------------------------------------
  // QUẢN LÝ SỔ TỪ VỰNG TRONG CỬA SỔ NỔI 400PX
  // --------------------------------------------------------------------------
  async function saveOrUpdateVocabularyItem({ word, meaning, pos, phonetic = '' }) {
    const cleanWord = (word || '').trim();
    const cleanMeaning = (meaning || '').trim();
    if (!cleanWord || !cleanMeaning) return false;

    const existingIdx = learnedWords.findIndex(
      (w) => (w.word || '').toLowerCase().trim() === cleanWord.toLowerCase()
    );

    if (existingIdx >= 0) {
      learnedWords[existingIdx] = {
        ...learnedWords[existingIdx],
        word: cleanWord,
        meaning: cleanMeaning,
        pos: pos || learnedWords[existingIdx].pos || 'n',
        phonetic: phonetic || learnedWords[existingIdx].phonetic || '',
        timestamp: Date.now()
      };
    } else {
      learnedWords.unshift({
        id: `lw-${Date.now()}`,
        word: cleanWord,
        meaning: cleanMeaning,
        pos: pos || 'n',
        phonetic: phonetic || '',
        timestamp: Date.now()
      });
    }

    await chrome.storage.local.set({ learned_words: learnedWords });
    refreshLearnedAnchors();
    renderWindowVocabList();
    updateDockStatus();
    return true;
  }

  function renderWindowVocabList(filterQuery = '') {
    if (!windowEl) return;
    const container = windowEl.querySelector('#lw-win-vocab-list');
    const countBadge = windowEl.querySelector('#lw-win-count');
    if (countBadge) countBadge.textContent = `${learnedWords.length} từ`;
    if (!container) return;

    const q = (filterQuery || windowEl.querySelector('#lw-search-input')?.value || '').trim().toLowerCase();
    const filtered = learnedWords.filter((item) => {
      if (!q) return true;
      return (
        (item.word || '').toLowerCase().includes(q) ||
        (item.meaning || '').toLowerCase().includes(q)
      );
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="lw-v-card" style="color:#71717a;justify-content:center;padding:16px;">
          ${q ? 'Không có từ đã lưu nào khớp tìm kiếm.' : 'Chưa có từ vựng nào được lưu.'}
        </div>
      `;
      return;
    }

    container.innerHTML = filtered
      .map(
        (item) => `
        <div class="lw-v-card">
          <div style="min-width:0;flex:1;">
            <div class="lw-v-top">
              <span class="lw-v-word">${escapeHTML(item.word)}</span>
              ${item.phonetic ? `<span class="lw-v-phonetic">${escapeHTML(item.phonetic)}</span>` : ''}
              ${item.pos ? `<span class="lw-v-pos">${escapeHTML(item.pos)}</span>` : ''}
            </div>
            <div class="lw-v-meaning">${escapeHTML(item.meaning)}</div>
          </div>
          <div class="lw-v-actions">
            <button class="lw-mini-btn speak-v" data-word="${escapeHTML(item.word)}" title="Phát âm">🔊</button>
            <button class="lw-mini-btn edit-v" data-id="${escapeHTML(item.id)}" title="Sửa từ này">✎</button>
            <button class="lw-mini-btn del-v" data-id="${escapeHTML(item.id)}" title="Xóa từ này">×</button>
          </div>
        </div>
      `
      )
      .join('');

    container.querySelectorAll('.speak-v').forEach((btn) => {
      btn.addEventListener('click', () => speakText(btn.getAttribute('data-word')));
    });

    container.querySelectorAll('.edit-v').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const found = learnedWords.find((w) => w.id === id);
        if (!found) return;
        draftState.word = found.word;
        draftState.meaning = found.meaning;
        draftState.pos = found.pos || 'n';
        draftState.phonetic = found.phonetic || '';
        saveDraftState();
        restoreDraftToInputs();
        windowEl.querySelector('#lw-add-word')?.focus();
      });
    });

    container.querySelectorAll('.del-v').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        learnedWords = learnedWords.filter((w) => w.id !== id);
        await chrome.storage.local.set({ learned_words: learnedWords });
        refreshLearnedAnchors();
        renderWindowVocabList();
        updateDockStatus();
      });
    });
  }

  function speakText(text) {
    if (!text || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.94;
    window.speechSynthesis.speak(u);
  }

  // --------------------------------------------------------------------------
  // ĐÁNH DẤU TỪ ĐÃ HỌC (.lw-anchor) — KHÔNG GỌI document.body.normalize()
  // --------------------------------------------------------------------------
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildLearnedRegex() {
    const words = learnedWords
      .map((w) => (w.word || '').trim())
      .filter((w) => w.length >= 2);

    if (words.length === 0) return null;

    const uniqueSorted = Array.from(new Set(words)).sort((a, b) => b.length - a.length);
    const pattern = uniqueSorted.map(escapeRegex).join('|');
    return new RegExp(`(?<![\\p{L}\\p{N}_])(${pattern})(?![\\p{L}\\p{N}_])`, 'giu');
  }

  function findLearnedMeta(wordText) {
    const lower = wordText.toLowerCase().trim();
    return learnedWords.find((w) => (w.word || '').toLowerCase().trim() === lower) || null;
  }

  function createFragmentWithLearnedAnchors(text) {
    const fragment = document.createDocumentFragment();
    const regex = buildLearnedRegex();

    if (!regex) {
      fragment.appendChild(document.createTextNode(text));
      return fragment;
    }

    let lastIdx = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        fragment.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
      }

      const matchedText = match[0];
      const meta = findLearnedMeta(matchedText);
      const anchor = document.createElement('span');
      anchor.className = 'lw-anchor';
      anchor.setAttribute('data-word', meta?.word || matchedText);
      anchor.setAttribute('data-meaning', meta?.meaning || '');
      if (meta?.pos) anchor.setAttribute('data-pos', meta.pos);
      if (meta?.phonetic) anchor.setAttribute('data-phonetic', meta.phonetic);
      anchor.textContent = matchedText;

      fragment.appendChild(anchor);
      lastIdx = regex.lastIndex;
    }

    if (lastIdx < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIdx)));
    }

    return fragment;
  }

  function createWordByWordFragment(wbwText) {
    const fragment = document.createDocumentFragment();
    const tokenRegex = /([^\s\[\]]+)\[([^\[\]]+)\]|(\S+|\s+)/g;
    let match;

    while ((match = tokenRegex.exec(wbwText)) !== null) {
      if (match[1] && match[2]) {
        const origWord = match[1];
        const viGloss = match[2].trim();
        const learnedMeta = findLearnedMeta(origWord.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''));

        if (learnedMeta) {
          const anchor = document.createElement('span');
          anchor.className = 'lw-anchor';
          anchor.setAttribute('data-word', learnedMeta.word);
          anchor.setAttribute('data-meaning', learnedMeta.meaning || '');
          if (learnedMeta.pos) anchor.setAttribute('data-pos', learnedMeta.pos);
          if (learnedMeta.phonetic) anchor.setAttribute('data-phonetic', learnedMeta.phonetic);
          anchor.textContent = origWord;
          fragment.appendChild(anchor);
        } else {
          const ruby = document.createElement('ruby');
          ruby.className = 'lw-wbw-ruby';
          ruby.appendChild(document.createTextNode(origWord));
          const rt = document.createElement('rt');
          rt.className = 'lw-wbw-rt';
          rt.textContent = viGloss;
          ruby.appendChild(rt);
          fragment.appendChild(ruby);
        }
      } else if (match[3]) {
        const token = match[3];
        if (/^\s+$/.test(token)) {
          fragment.appendChild(document.createTextNode(token));
        } else {
          fragment.appendChild(createFragmentWithLearnedAnchors(token));
        }
      }
    }

    return fragment;
  }

  function markLearnedWordsInRoot(root = document.body) {
    if (!root) return;
    const regex = buildLearnedRegex();
    if (!regex) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!isEligibleTextNode(node)) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.classList.contains('lw-anchor')) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest('ruby.lw-wbw-ruby')) return NodeFilter.FILTER_REJECT;
        regex.lastIndex = 0;
        return regex.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });

    const nodes = [];
    let n;
    while ((n = walker.nextNode())) {
      nodes.push(n);
    }

    for (const textNode of nodes) {
      const frag = createFragmentWithLearnedAnchors(textNode.nodeValue);
      textNode.parentNode?.replaceChild(frag, textNode);
    }
  }

  function unwrapAllLearnedAnchors(root = document.body) {
    if (!root) return;
    const anchors = root.querySelectorAll('span.lw-anchor');
    const touchedParents = new Set();
    anchors.forEach((a) => {
      if (a.parentElement) touchedParents.add(a.parentElement);
      a.replaceWith(document.createTextNode(a.textContent || ''));
    });
    // Chỉ normalize đúng phần tử cha trực tiếp thay vì document.body để không phá YouTube Polymer/Lit
    touchedParents.forEach((p) => {
      try {
        p.normalize();
      } catch (_) {}
    });
  }

  function refreshLearnedAnchors() {
    unwrapAllLearnedAnchors(document.body);
    markLearnedWordsInRoot(document.body);
  }

  // --------------------------------------------------------------------------
  // DỊCH TRANG (SONG NGỮ BÊN DƯỚI / DỊCH TỪNG TỪ / THAY THẾ)
  // --------------------------------------------------------------------------
  function collectReadingTextNodesByBlock() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!isEligibleTextNode(node)) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest('.lw-bilingual-sub')) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest('rt.lw-wbw-rt')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    unwrapAllLearnedAnchors(document.body);

    const blockMap = new Map();
    let current;

    while ((current = walker.nextNode())) {
      const text = current.nodeValue || '';
      if (text.trim().length < 2) continue;

      const blockEl = current.parentElement?.closest(BLOCK_GROUP_SELECTOR);
      if (!blockEl) continue;

      const style = window.getComputedStyle(blockEl);
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      if (!blockMap.has(blockEl)) {
        blockMap.set(blockEl, []);
      }
      blockMap.get(blockEl).push(current);
    }

    const units = [];
    let idx = 0;

    for (const [blockEl, textNodes] of blockMap.entries()) {
      const combined = textNodes.map((n) => n.nodeValue.trim()).join(' ').replace(/\s+/g, ' ').trim();
      if (combined.length < 18) continue;
      if (isTechnicalOrMediaString(combined)) continue;

      units.push({
        id: `lw-u-${Date.now()}-${idx++}`,
        blockEl,
        textNodes,
        combinedText: combined
      });
    }

    markLearnedWordsInRoot(document.body);
    return units;
  }

  async function translateCurrentPage() {
    if (isTranslating) return;
    isTranslating = true;
    hideErrorToast();

    const dockBtn = windowEl.querySelector('#lw-dock-btn');
    const launcherTransBtn = launcherEl.querySelector('#lw-launcher-translate');
    const dockStatus = windowEl.querySelector('#lw-dock-status');

    try {
      if (isPageTranslated) {
        restoreOriginalPage();
      }

      unwrapAllLearnedAnchors(document.body);
      const allUnits = collectReadingTextNodesByBlock();

      if (allUnits.length === 0) {
        dockStatus.textContent = 'Không có đoạn văn';
        isTranslating = false;
        return;
      }

      const windowHeight = window.innerHeight;
      allUnits.sort((a, b) => {
        const rectA = a.blockEl.getBoundingClientRect();
        const rectB = b.blockEl.getBoundingClientRect();
        const aInView = rectA.top < windowHeight && rectA.bottom > 0;
        const bInView = rectB.top < windowHeight && rectB.bottom > 0;
        if (aInView && !bInView) return -1;
        if (!aInView && bInView) return 1;
        return rectA.top - rectB.top;
      });

      dockBtn.textContent = 'Đang dịch...';
      launcherTransBtn.textContent = 'Đang dịch...';
      unwrapAllLearnedAnchors(document.body);

      const preparedUnits = [];
      let seqNum = 1;
      for (const unit of allUnits) {
        const segWrappers = [];
        for (const tNode of unit.textNodes) {
          if (!tNode.parentNode) continue;
          const wrapper = document.createElement('span');
          wrapper.className = 'lw-text-seg';
          wrapper.setAttribute('data-orig-text', tNode.nodeValue);
          wrapper.textContent = tNode.nodeValue;
          tNode.parentNode.replaceChild(wrapper, tNode);
          segWrappers.push(wrapper);
        }

        if (segWrappers.length > 0) {
          const record = {
            id: unit.id,
            numericId: seqNum++,
            blockEl: unit.blockEl,
            segWrappers,
            originalCombined: unit.combinedText,
            translatedText: null,
            wbwText: null,
            bilingualEl: null
          };
          translatedUnits.set(unit.id, record);
          preparedUnits.push(record);
        }
      }

      markLearnedWordsInRoot(document.body);

      const isWbwMode = settings.displayMode === 'word_by_word';
      const activeCache = isWbwMode ? wordByWordMemoryCache : translationMemoryCache;

      const uncachedUnits = [];
      for (const unit of preparedUnits) {
        const cached = activeCache.get(unit.originalCombined);
        if (cached) {
          if (isWbwMode) {
            unit.wbwText = cached;
          } else {
            unit.translatedText = cached;
          }
          applyUnitTranslation(unit);
        } else {
          uncachedUnits.push(unit);
        }
      }

      if (uncachedUnits.length > 0) {
        const chunkSize = isWbwMode ? 25 : 40;
        for (let i = 0; i < uncachedUnits.length; i += chunkSize) {
          const chunk = uncachedUnits.slice(i, i + chunkSize);
          dockStatus.textContent = `${Math.min(i + chunk.length, uncachedUnits.length)}/${uncachedUnits.length} đoạn`;
          await executeDocumentChunkTranslation(chunk, isWbwMode);
        }
      }

      isPageTranslated = true;
      dockBtn.textContent = 'Bản gốc';
      launcherTransBtn.textContent = 'Bản gốc';
      updateDockStatusWithCache();
    } catch (err) {
      dockBtn.textContent = 'Dịch trang';
      launcherTransBtn.textContent = 'Dịch trang';
      dockStatus.textContent = 'Lỗi API';
      showErrorToast(err.message);
    } finally {
      isTranslating = false;
    }
  }

  async function executeDocumentChunkTranslation(units, isWbwMode = false) {
    if (!units || units.length === 0) return;

    const numMap = new Map();
    units.forEach((u) => numMap.set(u.numericId, u));

    const docText = units
      .map((u) => `[[[${u.numericId}]]]\n${u.originalCombined}`)
      .join('\n\n');

    const response = await chrome.runtime.sendMessage({
      action: isWbwMode ? 'TRANSLATE_WORD_BY_WORD' : 'TRANSLATE_BATCH',
      payload: {
        pageTitle: document.title || '',
        documentText: docText,
        totalCount: units.length
      }
    });

    if (!response || !response.success) {
      throw new Error(response?.error || 'Lỗi kết nối API.');
    }

    const rawDoc = isWbwMode
      ? response.data?.wordByWordDocument || ''
      : response.data?.translatedDocument || '';

    const blockRegex = /\[\[\[\s*(\d+)\s*\]\]\]\s*([\s\S]*?)(?=(?:\[\[\[\s*\d+\s*\]\]\]|$))/g;
    let match;
    let parsedCount = 0;

    while ((match = blockRegex.exec(rawDoc)) !== null) {
      const numId = parseInt(match[1], 10);
      const text = match[2].trim();
      const rec = numMap.get(numId);
      if (rec && text) {
        if (isWbwMode) {
          rec.wbwText = text;
          wordByWordMemoryCache.set(rec.originalCombined, text);
        } else {
          rec.translatedText = text;
          translationMemoryCache.set(rec.originalCombined, text);
        }
        applyUnitTranslation(rec);
        parsedCount++;
      }
    }

    if (parsedCount === 0 && rawDoc.trim()) {
      const fallbackParagraphs = rawDoc.split(/\n\s*\n/).filter((p) => p.trim());
      units.forEach((u, i) => {
        if (fallbackParagraphs[i]) {
          const text = fallbackParagraphs[i].trim();
          if (isWbwMode) {
            u.wbwText = text;
            wordByWordMemoryCache.set(u.originalCombined, text);
          } else {
            u.translatedText = text;
            translationMemoryCache.set(u.originalCombined, text);
          }
          applyUnitTranslation(u);
        }
      });
    }
  }

  function updateDockStatusWithCache() {
    if (!windowEl) return;
    let count = 0;
    for (const [, rec] of translatedUnits.entries()) {
      if (rec.translatedText || rec.wbwText) count++;
    }
    const dockStatus = windowEl.querySelector('#lw-dock-status');
    if (dockStatus && isPageTranslated) {
      dockStatus.textContent = `Đã dịch ${count}/${translatedUnits.size}`;
    }
  }

  function applyUnitTranslation(record) {
    if (!record) return;

    if (record.bilingualEl) {
      record.bilingualEl.remove();
      record.bilingualEl = null;
    }

    if (settings.displayMode === 'word_by_word' && record.wbwText) {
      if (record.segWrappers.length === 1) {
        const w = record.segWrappers[0];
        w.textContent = '';
        w.appendChild(createWordByWordFragment(record.wbwText));
      } else {
        let primaryIdx = 0;
        let maxLen = 0;
        record.segWrappers.forEach((w, idx) => {
          const len = (w.getAttribute('data-orig-text') || '').trim().length;
          if (len > maxLen) {
            maxLen = len;
            primaryIdx = idx;
          }
        });
        record.segWrappers.forEach((w, idx) => {
          w.textContent = '';
          if (idx === primaryIdx) {
            w.appendChild(createWordByWordFragment(record.wbwText));
          }
        });
      }
      return;
    }

    if (!record.translatedText) return;

    if (settings.displayMode === 'bilingual') {
      for (const w of record.segWrappers) {
        const orig = w.getAttribute('data-orig-text') || '';
        w.textContent = '';
        w.appendChild(createFragmentWithLearnedAnchors(orig));
      }

      const sub = document.createElement('span');
      sub.className = 'lw-bilingual-sub';
      sub.appendChild(createFragmentWithLearnedAnchors(record.translatedText));
      record.blockEl.appendChild(sub);
      record.bilingualEl = sub;
      return;
    }

    if (record.segWrappers.length === 1) {
      const w = record.segWrappers[0];
      w.textContent = '';
      w.appendChild(createFragmentWithLearnedAnchors(record.translatedText));
    } else {
      let primaryIdx = 0;
      let maxLen = 0;
      record.segWrappers.forEach((w, idx) => {
        const len = (w.getAttribute('data-orig-text') || '').trim().length;
        if (len > maxLen) {
          maxLen = len;
          primaryIdx = idx;
        }
      });

      record.segWrappers.forEach((w, idx) => {
        w.textContent = '';
        if (idx === primaryIdx) {
          w.appendChild(createFragmentWithLearnedAnchors(` ${record.translatedText} `));
        }
      });
    }
  }

  function restoreOriginalPage() {
    for (const [, rec] of translatedUnits.entries()) {
      if (rec.bilingualEl) {
        rec.bilingualEl.remove();
        rec.bilingualEl = null;
      }
      for (const w of rec.segWrappers) {
        const origText = w.getAttribute('data-orig-text') ?? w.textContent ?? '';
        if (w.parentNode) {
          w.replaceWith(document.createTextNode(origText));
        }
      }
    }

    translatedUnits.clear();
    isPageTranslated = false;
    markLearnedWordsInRoot(document.body);

    if (windowEl) {
      windowEl.querySelector('#lw-dock-btn').textContent = 'Dịch trang';
      windowEl.querySelector('#lw-dock-status').textContent = 'Sẵn sàng';
    }
    if (launcherEl) {
      launcherEl.querySelector('#lw-launcher-translate').textContent = 'Dịch trang';
    }
  }

  // --------------------------------------------------------------------------
  // HOVER TOOLTIP & GRAMMAR BREAKDOWN TRONG CỬA SỔ 400PX
  // --------------------------------------------------------------------------
  function showTooltipForAnchor(anchorEl) {
    if (!tooltipEl || !anchorEl) return;

    const word = anchorEl.getAttribute('data-word') || anchorEl.textContent.trim();
    const meaning = anchorEl.getAttribute('data-meaning') || 'Đã lưu';
    const pos = anchorEl.getAttribute('data-pos') || '';
    const phonetic = anchorEl.getAttribute('data-phonetic') || '';

    tooltipEl.querySelector('#lw-tt-word').textContent = word;
    tooltipEl.querySelector('#lw-tt-phonetic').textContent = phonetic;
    const posEl = tooltipEl.querySelector('#lw-tt-pos');
    if (pos) {
      posEl.textContent = pos;
      posEl.style.display = 'inline-block';
    } else {
      posEl.style.display = 'none';
    }
    tooltipEl.querySelector('#lw-tt-meaning').textContent = meaning;

    tooltipEl.classList.add('is-visible');

    const rect = anchorEl.getBoundingClientRect();
    const ttRect = tooltipEl.getBoundingClientRect();
    const gap = 8;

    let top = rect.top - ttRect.height - gap;
    if (top < 10) {
      top = rect.bottom + gap;
    }

    let left = rect.left + rect.width / 2 - ttRect.width / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - ttRect.width - 10));

    tooltipEl.style.top = `${Math.round(top)}px`;
    tooltipEl.style.left = `${Math.round(left)}px`;
  }

  function hideTooltip() {
    tooltipEl?.classList.remove('is-visible');
  }

  function showSelectionPill(rect) {
    if (!selectionPillEl || !rect) return;
    selectionPillEl.classList.add('is-visible');

    const top = Math.max(10, rect.top - 36);
    const left = Math.max(10, Math.min(rect.left, window.innerWidth - 160));
    selectionPillEl.style.top = `${Math.round(top)}px`;
    selectionPillEl.style.left = `${Math.round(left)}px`;
  }

  function hideSelectionPill() {
    selectionPillEl?.classList.remove('is-visible');
  }

  async function openGrammarInspector(targetText, contextSentence) {
    if (!windowEl) return;
    const cleanTarget = (targetText || '').trim();
    if (!cleanTarget) return;

    // Mở cửa sổ nổi 400px và chuyển tới tab Ngữ pháp câu
    applyWindowVisibility('open');
    switchWindowTab('pane-grammar');

    // Đồng thời điền sẵn vào khung Google Dịch để người dùng tiện dùng cả hai
    windowEl.querySelector('#lw-gt-input').value = cleanTarget;
    draftState.gtText = cleanTarget;
    saveDraftState();

    windowEl.querySelector('#lw-ins-word').textContent = cleanTarget;
    windowEl.querySelector('#lw-ins-phonetic').textContent = 'Đang phân tích ngữ cảnh...';
    const posEl = windowEl.querySelector('#lw-ins-pos');
    posEl.style.display = 'none';
    const speakBtn = windowEl.querySelector('#lw-ins-speak');
    speakBtn.style.display = 'inline-block';
    const actionBtn = windowEl.querySelector('#lw-ins-action-btn');
    actionBtn.style.display = 'inline-block';

    const bodyEl = windowEl.querySelector('#lw-ins-body');
    bodyEl.innerHTML = `
      <div class="lw-ins-loading">
        <div class="lw-spinner"></div>
        <span>Đang dịch nghĩa &amp; mổ xẻ cấu trúc câu...</span>
      </div>
    `;

    activeInspectorItem = {
      word: cleanTarget,
      meaning: '',
      pos: '',
      phonetic: ''
    };
    syncInspectorActionButton();

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'ANALYZE_GRAMMAR',
        payload: {
          targetText: cleanTarget,
          contextSentence,
          pageTitle: document.title || ''
        }
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Không thể phân tích ngữ pháp.');
      }

      const data = response.data;
      activeInspectorItem = {
        word: data.baseForm || data.word || cleanTarget,
        surfaceWord: data.word || cleanTarget,
        meaning: data.shortMeaning || data.contextualTranslation || '',
        pos: data.pos || 'n',
        phonetic: data.phonetic || ''
      };

      windowEl.querySelector('#lw-ins-word').textContent = data.word || cleanTarget;
      windowEl.querySelector('#lw-ins-phonetic').textContent = data.phonetic || data.baseForm || '';
      if (data.pos) {
        posEl.textContent = data.pos;
        posEl.style.display = 'inline-block';
      }

      const breakdownItems = Array.isArray(data.grammarBreakdown)
        ? data.grammarBreakdown.map((line) => `<li>${escapeHTML(line)}</li>`).join('')
        : '';

      bodyEl.innerHTML = `
        <div class="lw-ins-section">
          <div class="lw-ins-label">1. Bản dịch theo ngữ cảnh</div>
          <div class="lw-ins-translation">${escapeHTML(data.contextualTranslation || data.shortMeaning)}</div>
          <div class="lw-ins-why">${escapeHTML(data.whyThisTranslation || '')}</div>
        </div>
        <div class="lw-ins-divider"></div>
        <div class="lw-ins-section">
          <div class="lw-ins-label">2. Mổ xẻ ngữ pháp</div>
          <ul class="lw-ins-list">
            ${breakdownItems}
          </ul>
        </div>
      `;

      syncInspectorActionButton();
    } catch (err) {
      bodyEl.innerHTML = `
        <div class="lw-ins-section">
          <div class="lw-ins-label" style="color:#f87171;">Thông báo lỗi API</div>
          <div class="lw-ins-why" style="color:#fca5a5;">${escapeHTML(err.message)}</div>
        </div>
      `;
    }
  }

  function syncInspectorActionButton() {
    if (!windowEl || !activeInspectorItem) return;
    const btn = windowEl.querySelector('#lw-ins-action-btn');
    const key1 = (activeInspectorItem.word || '').toLowerCase().trim();
    const key2 = (activeInspectorItem.surfaceWord || '').toLowerCase().trim();

    const isSaved = learnedWords.some((w) => {
      const lw = (w.word || '').toLowerCase().trim();
      return lw === key1 || (key2 && lw === key2);
    });

    if (isSaved) {
      btn.textContent = 'Quên từ này / Xóa khỏi bộ nhớ';
      btn.classList.add('is-saved');
    } else {
      btn.textContent = 'Lưu vào danh sách đã học';
      btn.classList.remove('is-saved');
    }
  }

  async function toggleSaveActiveWord() {
    if (!activeInspectorItem) return;
    const key1 = (activeInspectorItem.word || '').toLowerCase().trim();
    const key2 = (activeInspectorItem.surfaceWord || '').toLowerCase().trim();

    const existingIdx = learnedWords.findIndex((w) => {
      const lw = (w.word || '').toLowerCase().trim();
      return lw === key1 || (key2 && lw === key2);
    });

    if (existingIdx >= 0) {
      learnedWords = learnedWords.filter((_, i) => i !== existingIdx);
      await chrome.storage.local.set({ learned_words: learnedWords });
      refreshLearnedAnchors();
      renderWindowVocabList();
      syncInspectorActionButton();
      updateDockStatus();
    } else {
      await saveOrUpdateVocabularyItem({
        word: activeInspectorItem.surfaceWord || activeInspectorItem.word,
        meaning: activeInspectorItem.meaning || 'Đã học',
        pos: activeInspectorItem.pos || 'n',
        phonetic: activeInspectorItem.phonetic || ''
      });
      syncInspectorActionButton();
    }
  }

  function updateDockStatus() {
    if (!windowEl) return;
    const countBadge = windowEl.querySelector('#lw-win-count');
    if (countBadge) countBadge.textContent = `${learnedWords.length} từ`;
  }

  // --------------------------------------------------------------------------
  // SỰ KIỆN TRÊN TRANG & TRONG CỬA SỔ NỔI
  // --------------------------------------------------------------------------
  function attachPageListeners() {
    document.addEventListener('mouseover', (e) => {
      const anchor = e.target.closest?.('span.lw-anchor');
      if (!anchor) return;
      showTooltipForAnchor(anchor);
    });

    document.addEventListener('mouseout', (e) => {
      const anchor = e.target.closest?.('span.lw-anchor');
      if (!anchor) return;
      hideTooltip();
    });

    // Click ra ngoài trang web TUYỆT ĐỐI KHÔNG đóng cửa sổ #lw-window (chỉ ẩn pill chọn chữ)
    document.addEventListener('click', (e) => {
      if (e.composedPath().includes(shadowHost)) return;

      const anchor = e.target.closest?.('span.lw-anchor');
      if (anchor) {
        e.preventDefault();
        e.stopPropagation();
        hideTooltip();
        const word = anchor.getAttribute('data-word') || anchor.textContent.trim();
        const sentence = extractContextSentence(anchor, word);
        openGrammarInspector(word, sentence);
        return;
      }

      hideSelectionPill();
      windowEl?.querySelector('#lw-sug-dropdown')?.classList.remove('is-open');
    });

    // Double-Click vào từ đơn bất kỳ trên trang -> Mở cửa sổ 400px & dịch ngay
    document.addEventListener('dblclick', (e) => {
      if (e.composedPath().includes(shadowHost)) return;
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (text.length >= 2 && text.length <= 45 && !/\s/.test(text) && !isTechnicalOrMediaString(text)) {
        hideSelectionPill();
        const container = sel.getRangeAt(0).commonAncestorContainer.parentElement || e.target;
        const sentence = extractContextSentence(container, text);
        openGrammarInspector(text, sentence);
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (e.composedPath().includes(shadowHost)) return;

      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : '';

        if (text.length >= 2 && text.length <= 240 && !isTechnicalOrMediaString(text)) {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
            ? range.commonAncestorContainer
            : range.commonAncestorContainer.parentElement;

          currentSelection = {
            text,
            sentence: extractContextSentence(container, text)
          };
          showSelectionPill(rect);
        } else {
          hideSelectionPill();
        }
      }, 20);
    });

    // Phím tắt Alt+L để bật/thu nhỏ nhanh cửa sổ nổi 400px
    document.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        applyWindowVisibility(winState.mode === 'open' ? 'minimized' : 'open');
      }
    });

    selectionPillEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideSelectionPill();
      if (currentSelection.text) {
        openGrammarInspector(currentSelection.text, currentSelection.sentence);
      }
    });

    // Nút điều khiển Thanh thu nhỏ (Launcher) & Cửa sổ 400px
    launcherEl.querySelector('#lw-launcher-open').addEventListener('click', () => {
      applyWindowVisibility('open');
    });

    launcherEl.querySelector('#lw-launcher-translate').addEventListener('click', () => {
      if (isPageTranslated) {
        restoreOriginalPage();
      } else {
        translateCurrentPage();
      }
    });

    windowEl.querySelector('#lw-win-minimize').addEventListener('click', () => {
      applyWindowVisibility('minimized');
    });

    // Chỉ đóng cửa sổ khi người dùng chủ động bấm nút ×
    windowEl.querySelector('#lw-win-close').addEventListener('click', () => {
      applyWindowVisibility('closed');
    });

    // Chuyển đổi 3 Tab trong cửa sổ 400px
    windowEl.querySelectorAll('.lw-win-tab').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        switchWindowTab(tabBtn.getAttribute('data-tab'));
      });
    });

    // Sự kiện Thanh tìm kiếm + Gợi ý từ tự động (Autocomplete)
    const searchInput = windowEl.querySelector('#lw-search-input');
    const searchClear = windowEl.querySelector('#lw-search-clear');
    const searchGo = windowEl.querySelector('#lw-search-go');
    const sugDropdown = windowEl.querySelector('#lw-sug-dropdown');

    searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      searchClear.classList.toggle('is-visible', Boolean(val));
      renderWindowVocabList(val);
      updateSearchSuggestions(val);
    });

    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim()) {
        updateSearchSuggestions(searchInput.value);
      }
    });

    searchInput.addEventListener('keydown', (e) => {
      const items = sugDropdown.querySelectorAll('.lw-sug-item');
      if (e.key === 'ArrowDown' && items.length > 0) {
        e.preventDefault();
        activeSuggestionIdx = (activeSuggestionIdx + 1) % items.length;
        items.forEach((el, i) => el.classList.toggle('is-active', i === activeSuggestionIdx));
      } else if (e.key === 'ArrowUp' && items.length > 0) {
        e.preventDefault();
        activeSuggestionIdx = (activeSuggestionIdx - 1 + items.length) % items.length;
        items.forEach((el, i) => el.classList.toggle('is-active', i === activeSuggestionIdx));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeSuggestionIdx >= 0 && currentSuggestions[activeSuggestionIdx]) {
          selectSearchSuggestion(currentSuggestions[activeSuggestionIdx].word);
        } else if (searchInput.value.trim()) {
          selectSearchSuggestion(searchInput.value.trim());
        }
      } else if (e.key === 'Escape') {
        sugDropdown.classList.remove('is-open');
      }
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchClear.classList.remove('is-visible');
      sugDropdown.classList.remove('is-open');
      renderWindowVocabList('');
      searchInput.focus();
    });

    searchGo.addEventListener('click', () => {
      if (searchInput.value.trim()) {
        selectSearchSuggestion(searchInput.value.trim());
      }
    });

    // Sự kiện Tab 1: Google Dịch
    const gtInput = windowEl.querySelector('#lw-gt-input');
    const gtSourceLang = windowEl.querySelector('#lw-gt-source-lang');
    const gtTargetLang = windowEl.querySelector('#lw-gt-target-lang');

    gtInput.addEventListener('input', () => {
      draftState.gtText = gtInput.value;
      saveDraftState();

      clearTimeout(gtAutoTranslateTimer);
      if (gtInput.value.trim().length >= 2) {
        gtAutoTranslateTimer = setTimeout(() => {
          runQuickTranslate();
        }, 700);
      }
    });

    gtSourceLang.addEventListener('change', () => {
      draftState.gtSourceLang = gtSourceLang.value;
      saveDraftState();
      if (gtInput.value.trim()) runQuickTranslate();
    });

    gtTargetLang.addEventListener('change', () => {
      draftState.gtTargetLang = gtTargetLang.value;
      saveDraftState();
      if (gtInput.value.trim()) runQuickTranslate();
    });

    windowEl.querySelector('#lw-gt-swap').addEventListener('click', () => {
      const s = gtSourceLang.value === 'auto' ? 'Tiếng Anh' : gtSourceLang.value;
      const t = gtTargetLang.value;
      gtSourceLang.value = t;
      gtTargetLang.value = s;
      draftState.gtSourceLang = gtSourceLang.value;
      draftState.gtTargetLang = gtTargetLang.value;
      saveDraftState();
      if (gtInput.value.trim()) runQuickTranslate();
    });

    windowEl.querySelector('#lw-gt-submit').addEventListener('click', () => {
      clearTimeout(gtAutoTranslateTimer);
      runQuickTranslate();
    });

    windowEl.querySelector('#lw-gt-speak-src').addEventListener('click', () => {
      speakText(gtInput.value.trim());
    });

    windowEl.querySelector('#lw-gt-clear').addEventListener('click', () => {
      gtInput.value = '';
      draftState.gtText = '';
      saveDraftState();
      gtInput.focus();
    });

    // Sự kiện Tab 2: Lưu từ vựng (Tự động lưu nháp mỗi khi gõ, không bao giờ mất chữ)
    const addWordInput = windowEl.querySelector('#lw-add-word');
    const addPosSelect = windowEl.querySelector('#lw-add-pos');
    const addMeaningInput = windowEl.querySelector('#lw-add-meaning');

    addWordInput.addEventListener('input', () => {
      draftState.word = addWordInput.value;
      saveDraftState();
    });

    addPosSelect.addEventListener('change', () => {
      draftState.pos = addPosSelect.value;
      saveDraftState();
    });

    addMeaningInput.addEventListener('input', () => {
      draftState.meaning = addMeaningInput.value;
      saveDraftState();
    });

    // Nút AI tự điền nghĩa & phiên âm nếu người dùng mới chỉ gõ từ gốc
    windowEl.querySelector('#lw-ai-fill-btn').addEventListener('click', async (e) => {
      const word = addWordInput.value.trim();
      if (!word) {
        addWordInput.focus();
        return;
      }
      const btn = e.target;
      btn.textContent = 'Đang dịch...';
      try {
        const res = await chrome.runtime.sendMessage({
          action: 'QUICK_TRANSLATE',
          payload: { text: word, sourceLang: 'auto', targetLang: 'Tiếng Việt' }
        });
        if (res?.success && res.data) {
          addMeaningInput.value = res.data.shortMeaning || res.data.translatedText || '';
          if (res.data.pos) addPosSelect.value = res.data.pos;
          draftState.meaning = addMeaningInput.value;
          draftState.pos = addPosSelect.value;
          draftState.phonetic = res.data.phonetic || '';
          saveDraftState();
        }
      } catch (_) {}
      btn.textContent = '✨ AI điền';
    });

    const handleSaveVocabFromWin = async () => {
      const word = addWordInput.value.trim();
      const meaning = addMeaningInput.value.trim();
      const pos = addPosSelect.value;

      if (!word || !meaning) {
        if (!word) addWordInput.focus();
        else addMeaningInput.focus();
        return;
      }

      await saveOrUpdateVocabularyItem({
        word,
        meaning,
        pos,
        phonetic: draftState.phonetic || ''
      });

      addWordInput.value = '';
      addMeaningInput.value = '';
      draftState.word = '';
      draftState.meaning = '';
      draftState.phonetic = '';
      saveDraftState();
    };

    windowEl.querySelector('#lw-add-save-btn').addEventListener('click', handleSaveVocabFromWin);
    addMeaningInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSaveVocabFromWin();
    });

    // Sự kiện Tab 3: Ngữ pháp
    windowEl.querySelector('#lw-ins-speak').addEventListener('click', () => {
      const word = activeInspectorItem?.surfaceWord || activeInspectorItem?.word || '';
      speakText(word);
    });

    windowEl.querySelector('#lw-ins-action-btn').addEventListener('click', () => {
      toggleSaveActiveWord();
    });

    errorToastEl.querySelector('#lw-err-close').addEventListener('click', () => {
      hideErrorToast();
    });

    // Sự kiện Chân cửa sổ: Dịch toàn trang
    windowEl.querySelector('#lw-dock-mode').addEventListener('change', async (e) => {
      const newMode = e.target.value;
      settings.displayMode = newMode;
      await chrome.storage.local.set({ settings });
      if (isPageTranslated) {
        translateCurrentPage();
      }
    });

    windowEl.querySelector('#lw-dock-btn').addEventListener('click', () => {
      if (isPageTranslated) {
        restoreOriginalPage();
      } else {
        translateCurrentPage();
      }
    });

    // Đồng bộ thời gian thực giữa Popup và Cửa sổ nổi trên trang
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;

      if (changes.settings?.newValue) {
        const prevMode = settings.displayMode;
        settings = { ...settings, ...changes.settings.newValue };
        if (windowEl) {
          windowEl.querySelector('#lw-dock-mode').value = settings.displayMode || 'bilingual';
        }
        if (isPageTranslated && prevMode !== settings.displayMode) {
          translateCurrentPage();
        }
      }

      if (changes.learned_words?.newValue) {
        learnedWords = changes.learned_words.newValue;
        refreshLearnedAnchors();
        renderWindowVocabList();
        syncInspectorActionButton();
        updateDockStatus();
      }

      if (changes.lexis_draft?.newValue) {
        draftState = { ...draftState, ...changes.lexis_draft.newValue };
        if (shadowRoot && !shadowRoot.activeElement) {
          restoreDraftToInputs();
        }
      }
    });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || !msg.action) return false;
      if (msg.action === 'TRIGGER_PAGE_TRANSLATION') {
        translateCurrentPage().then(() => sendResponse({ success: true }));
        return true;
      }
      if (msg.action === 'RESTORE_ORIGINAL_PAGE') {
        restoreOriginalPage();
        sendResponse({ success: true });
        return false;
      }
      if (msg.action === 'OPEN_FLOATING_WINDOW') {
        applyWindowVisibility('open');
        sendResponse({ success: true });
        return false;
      }
      return false;
    });
  }

  function extractContextSentence(el, targetWord = '') {
    if (!el) return targetWord;
    const block = el.closest?.(BLOCK_GROUP_SELECTOR) || el;
    const raw = (block.innerText || block.textContent || '').replace(/\s+/g, ' ').trim();
    if (!raw) return targetWord;

    const sentences = raw.split(/(?<=[.!?。！？])\s+/);
    const matched = sentences.find((s) => s.toLowerCase().includes(targetWord.toLowerCase()));
    return (matched || raw).slice(0, 260);
  }

  function escapeHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
