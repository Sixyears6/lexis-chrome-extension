/**
 * ============================================================================
 * Lexis — Popup Controller (popup.js)
 * ============================================================================
 * 1. Thiết kế mới cho Danh sách Từ vựng (Thẻ 2 dòng rõ ràng, dễ nhìn, có phát âm).
 * 2. Hỗ trợ chọn nhanh 3 chế độ dịch:
 *    - Song ngữ dưới (bilingual)
 *    - Dịch từng từ (word_by_word)
 *    - Thay thế trực tiếp (replace)
 * 3. Xác thực trực tiếp API Key & Tên Model trước khi khóa phiên:
 *    - Nếu sai API Key hoặc sai tên Model: Báo lỗi chi tiết màu đỏ cho người dùng.
 *    - Nếu đúng: Ẩn hoàn toàn Key, muốn đổi phải bấm Đăng xuất (Logout).
 */

document.addEventListener('DOMContentLoaded', async () => {
  let settings = {
    provider: 'gemini',
    geminiApiKey: '',
    groqApiKey: '',
    openrouterApiKey: '',
    cerebrasApiKey: '',
    openaiApiKey: '',
    geminiModel: 'gemini-3.8-flash',
    groqModel: 'llama-3.3-70b-versatile',
    openrouterModel: 'deepseek/deepseek-chat:free',
    cerebrasModel: 'llama-3.3-70b',
    openaiModel: 'gpt-4o-mini',
    currentProviderIndex: 0,
    autoTranslate: false,
    displayMode: 'bilingual',
    floatingUIEnabled: true,
    uiScale: 100
  };

  let learnedWords = [];
  let draftState = {
    word: '',
    pos: 'n',
    phonetic: '',
    meaning: ''
  };
  let searchQuery = '';
  let popupSuggestTimer = null;

  // Khai báo danh sách Nhà cung cấp & Kho Model NGAY ĐẦU FILE để không bao giờ bị lỗi Temporal Dead Zone (TDZ)
  const PROVIDER_FIELD_MAP = {
    gemini: {
      name: 'Google Gemini',
      keyField: 'geminiApiKey',
      modelField: 'geminiModel',
      defaultModel: 'gemini-3.8-flash',
      placeholder: 'Dán Gemini API Key (AIzaSy...)'
    },
    groq: {
      name: 'Groq',
      keyField: 'groqApiKey',
      modelField: 'groqModel',
      defaultModel: 'llama-3.3-70b-versatile',
      placeholder: 'Dán Groq API Key (gsk_...)'
    },
    openrouter: {
      name: 'OpenRouter',
      keyField: 'openrouterApiKey',
      modelField: 'openrouterModel',
      defaultModel: 'deepseek/deepseek-chat:free',
      placeholder: 'Dán OpenRouter API Key (sk-or-v1-...)'
    },
    cerebras: {
      name: 'Cerebras',
      keyField: 'cerebrasApiKey',
      modelField: 'cerebrasModel',
      defaultModel: 'llama-3.3-70b',
      placeholder: 'Dán Cerebras API Key (csk-...)'
    }
  };

  const MODEL_CATALOG = {
    gemini: [
      { id: 'gemini-3.8-flash', badge: '★ Đang hoạt động • Khuyên dùng', desc: 'Gemini 3.8 Flash — ★ Thế hệ mới chính thức của Google, phản hồi siêu tốc' },
      { id: 'gemini-3.5-flash-lite', badge: '★ Đang hoạt động • Nhẹ', desc: 'Gemini 3.5 Flash-Lite — Siêu nhẹ, tiết kiệm quota, tốc độ cao' },
      { id: 'gemini-3.6-flash', badge: 'Đang hoạt động', desc: 'Gemini 3.6 Flash — Cân bằng tốc độ và độ chính xác' },
      { id: 'gemini-4-argon', badge: 'Flagship Gen 4', desc: 'Gemini 4 Argon — Model Flagship thế hệ mới mạnh nhất' },
      { id: 'gemini-3.1-pro-preview', badge: 'Pro 3.1', desc: 'Gemini 3.1 Pro Preview — Phân tích chuyên sâu & ngữ pháp' },
      { id: 'gemini-3.1-flash-lite', badge: 'Flash-Lite 3.1', desc: 'Gemini 3.1 Flash-Lite — Tốc độ phản hồi tức thì' },
      { id: 'gemini-3-flash-preview', badge: 'Flash 3.0', desc: 'Gemini 3 Flash Preview — Tốc độ cao' },
      { id: 'gemma-4-31b-it', badge: 'Gemma 4 31B', desc: 'Gemma 4 31B IT — Model mã nguồn mở thế hệ 4' },
      { id: 'gemma-4-26b-a4b-it', badge: 'Gemma 4 MoE', desc: 'Gemma 4 26B MoE IT — Kiến trúc MoE siêu nhanh' }
    ],
    groq: [
      { id: 'llama-3.3-70b-versatile', badge: '★ Khuyên dùng', desc: 'Meta Llama 3.3 70B Versatile — Dịch tiếng Việt mượt & chuẩn nhất' },
      { id: 'llama-3.1-8b-instant', badge: 'Siêu tốc độ', desc: 'Meta Llama 3.1 8B Instant — Phản hồi tức thì, hạn mức gọi cao nhất' },
      { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', badge: 'Llama 4 Vision', desc: 'Llama 4 Maverick 17B 128E — Thế hệ 4 mới nhất, hỗ trợ đọc ảnh PDF' },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', badge: 'Llama 4 Scout', desc: 'Llama 4 Scout 17B 16E — Thế hệ 4 siêu tốc & hỗ trợ Vision PDF' },
      { id: 'qwen/qwen3-32b', badge: 'Qwen 3 32B', desc: 'Alibaba Qwen 3 32B — Rất giỏi tiếng Việt & ngôn ngữ Á Đông' },
      { id: 'qwen-qwq-32b', badge: 'Qwen QwQ 32B', desc: 'Alibaba Qwen QwQ 32B — Suy luận sâu & phân tích ngữ pháp' },
      { id: 'deepseek-r1-distill-llama-70b', badge: 'DeepSeek R1 70B', desc: 'DeepSeek R1 Distill Llama 70B — Suy luận học thuật chuyên sâu' },
      { id: 'moonshotai/kimi-k2-instruct', badge: 'Kimi K2', desc: 'Moonshot Kimi K2 Instruct — Ngữ cảnh dài, dịch tài liệu chuẩn' },
      { id: 'openai/gpt-oss-120b', badge: 'GPT-OSS 120B', desc: 'OpenAI GPT-OSS 120B — Model 120B chạy siêu tốc trên Groq' },
      { id: 'openai/gpt-oss-20b', badge: 'GPT-OSS 20B', desc: 'OpenAI GPT-OSS 20B — Nhẹ, phản hồi tức thì' },
      { id: 'compound-beta', badge: 'Groq Compound', desc: 'Groq Compound Beta — Hệ thống AI tổng hợp thông minh' },
      { id: 'compound-beta-mini', badge: 'Compound Mini', desc: 'Groq Compound Beta Mini — Tốc độ cao' },
      { id: 'gemma2-9b-it', badge: 'Gemma 2 9B', desc: 'Google Gemma 2 9B IT — Nhẹ & tiết kiệm quota' },
      { id: 'allam-2-7b', badge: 'ALLaM 2 7B', desc: 'ALLaM 2 7B — Nhẹ, tốc độ cao' }
    ],
    openrouter: [
      { id: 'deepseek/deepseek-chat:free', badge: '★ Free • Khuyên dùng', desc: 'DeepSeek V3 (Miễn phí) — Dịch mượt, chuẩn ngữ cảnh' },
      { id: 'qwen/qwen-2.5-72b-instruct:free', badge: '★ Free • Tiếng Việt', desc: 'Qwen 2.5 72B Instruct (Miễn phí) — Cực giỏi tiếng Việt' },
      { id: 'deepseek/deepseek-chat', badge: 'Pro / Paid', desc: 'DeepSeek V3 (Bản chuẩn Paid) — Tốc độ cao, không giới hạn' },
      { id: 'deepseek/deepseek-r1', badge: 'Pro / Reasoning', desc: 'DeepSeek R1 (Bản chuẩn Paid) — Suy luận & học thuật đỉnh cao' },
      { id: 'deepseek/deepseek-r1:free', badge: 'Free • Reasoning', desc: 'DeepSeek R1 (Miễn phí) — Suy luận & phân tích ngữ pháp' },
      { id: 'openai/gpt-4.1', badge: 'OpenAI Flagship', desc: 'OpenAI GPT-4.1 — Chuẩn Flagship mới nhất của OpenAI' },
      { id: 'openai/gpt-4.1-mini', badge: 'OpenAI Mini', desc: 'OpenAI GPT-4.1 Mini — Nhanh, thông minh & hỗ trợ Vision PDF' },
      { id: 'openai/gpt-4.1-nano', badge: 'OpenAI Nano', desc: 'OpenAI GPT-4.1 Nano — Siêu tốc độ, chi phí thấp nhất' },
      { id: 'openai/gpt-4o', badge: 'OpenAI Omni', desc: 'OpenAI GPT-4o — Đa phương thức & đọc ảnh PDF Scan' },
      { id: 'openai/gpt-4o-mini', badge: 'OpenAI 4o Mini', desc: 'OpenAI GPT-4o Mini — Ổn định, nhanh, đa ngôn ngữ' },
      { id: 'openai/o3', badge: 'OpenAI Reasoning', desc: 'OpenAI o3 — Suy luận chuyên sâu' },
      { id: 'openai/o4-mini', badge: 'OpenAI Reasoning', desc: 'OpenAI o4-mini — Suy luận tốc độ cao' },
      { id: 'anthropic/claude-sonnet-4', badge: 'Claude 4', desc: 'Anthropic Claude Sonnet 4 — Dịch văn học & học thuật tự nhiên nhất' },
      { id: 'anthropic/claude-opus-4', badge: 'Claude 4 Flagship', desc: 'Anthropic Claude Opus 4 — Flagship mạnh nhất của Anthropic' },
      { id: 'anthropic/claude-3.7-sonnet', badge: 'Claude 3.7', desc: 'Anthropic Claude 3.7 Sonnet — Hybrid Reasoning & dịch thuật' },
      { id: 'anthropic/claude-3.5-sonnet', badge: 'Claude 3.5', desc: 'Anthropic Claude 3.5 Sonnet — Chuẩn dịch thuật cao cấp' },
      { id: 'anthropic/claude-3.5-haiku', badge: 'Claude Haiku', desc: 'Anthropic Claude 3.5 Haiku — Phản hồi siêu nhanh' },
      { id: 'google/gemini-2.5-pro', badge: 'Gemini Pro', desc: 'Google Gemini 2.5 Pro (qua OpenRouter) — Học thuật & Vision' },
      { id: 'google/gemini-2.5-flash', badge: 'Gemini Flash', desc: 'Google Gemini 2.5 Flash (qua OpenRouter) — Nhanh & chuẩn' },
      { id: 'google/gemini-2.0-flash-exp:free', badge: 'Free • Vision', desc: 'Google Gemini 2.0 Flash (Miễn phí) — Hỗ trợ đọc ảnh PDF' },
      { id: 'qwen/qwen3-235b-a22b', badge: 'Qwen 3 Flagship', desc: 'Alibaba Qwen 3 235B A22B (Bản chuẩn)' },
      { id: 'qwen/qwen3-235b-a22b:free', badge: 'Free • Flagship', desc: 'Alibaba Qwen 3 235B A22B (Miễn phí)' },
      { id: 'qwen/qwen3-32b:free', badge: 'Free • Qwen 3', desc: 'Alibaba Qwen 3 32B (Miễn phí) — Dịch tiếng Việt mượt' },
      { id: 'qwen/qwen-2.5-72b-instruct', badge: 'Pro / Paid', desc: 'Alibaba Qwen 2.5 72B Instruct (Bản chuẩn)' },
      { id: 'qwen/qwen-2.5-vl-72b-instruct:free', badge: 'Free • Vision PDF', desc: 'Qwen 2.5 VL 72B Vision (Miễn phí) — Dịch ảnh PDF Scan' },
      { id: 'meta-llama/llama-4-maverick', badge: 'Llama 4 Pro', desc: 'Meta Llama 4 Maverick 17B 128E (Bản chuẩn)' },
      { id: 'meta-llama/llama-4-maverick:free', badge: 'Free • Llama 4', desc: 'Meta Llama 4 Maverick (Miễn phí)' },
      { id: 'meta-llama/llama-4-scout:free', badge: 'Free • Llama 4', desc: 'Meta Llama 4 Scout (Miễn phí)' },
      { id: 'meta-llama/llama-3.3-70b-instruct', badge: 'Llama 3.3 Pro', desc: 'Meta Llama 3.3 70B Instruct (Bản chuẩn)' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', badge: 'Free • Llama 3.3', desc: 'Meta Llama 3.3 70B Instruct (Miễn phí)' },
      { id: 'x-ai/grok-3', badge: 'xAI Flagship', desc: 'xAI Grok 3 Beta — Model Flagship của xAI' },
      { id: 'x-ai/grok-3-mini', badge: 'xAI Mini', desc: 'xAI Grok 3 Mini — Suy luận nhanh' },
      { id: 'mistralai/mistral-large-2411', badge: 'Mistral Large', desc: 'Mistral Large 2411 — Đa ngôn ngữ châu Âu & quốc tế' },
      { id: 'mistralai/mistral-small-3.1-24b-instruct:free', badge: 'Free • Mistral 3.1', desc: 'Mistral Small 3.1 24B (Miễn phí)' }
    ],
    cerebras: [
      { id: 'llama-3.3-70b', badge: '★ Khuyên dùng', desc: 'Meta Llama 3.3 70B — Tốc độ 2100 token/s, dịch chuẩn nhất' },
      { id: 'llama-4-scout-17b-16e-instruct', badge: 'Llama 4 Mới nhất', desc: 'Meta Llama 4 Scout 17B — Thế hệ 4 mới nhất, 2600 token/s' },
      { id: 'llama3.1-8b', badge: 'Siêu tốc độ', desc: 'Meta Llama 3.1 8B — Phản hồi tức thì, hạn mức cực cao' },
      { id: 'qwen-3-32b', badge: 'Qwen 3 32B', desc: 'Alibaba Qwen 3 32B — Rất giỏi tiếng Việt, tốc độ siêu nhanh' },
      { id: 'qwen-3-235b-a22b', badge: 'Qwen 3 235B', desc: 'Alibaba Qwen 3 235B Flagship trên Cerebras' },
      { id: 'deepseek-r1-distill-llama-70b', badge: 'DeepSeek R1 70B', desc: 'DeepSeek R1 Distill Llama 70B — Phân tích câu khó & ngữ pháp' }
    ]
  };

  // Gắn toàn bộ sự kiện click NGAY LẬP TỨC để không bao giờ bị kẹt nút bấm
  initTabs();
  initModeSelector();
  initPageActions();
  initVocabManager();
  initSettings();
  await loadState();

  async function loadState() {
    try {
      const data = await chrome.storage.local.get(['settings', 'learned_words', 'lexis_draft']);
      if (data.settings) settings = { ...settings, ...data.settings };
      if (Array.isArray(data.learned_words)) learnedWords = data.learned_words;
      if (data.lexis_draft) draftState = { ...draftState, ...data.lexis_draft };
    } catch (_) {}

    const addWordEl = document.getElementById('add-word');
    const addPosEl = document.getElementById('add-pos');
    const addMeaningEl = document.getElementById('add-meaning');
    if (addWordEl) addWordEl.value = draftState.word || '';
    if (addPosEl) addPosEl.value = draftState.pos || 'n';
    if (addMeaningEl) addMeaningEl.value = draftState.meaning || '';

    syncModeButtonsUI();
    renderSettingsView();
    renderVocabList();
    updateCountBadge();
  }

  function updateCountBadge() {
    const badge = document.getElementById('word-count-badge');
    if (badge) badge.textContent = `${learnedWords.length} từ đã thuộc`;
  }

  // --------------------------------------------------------------------------
  // 1. CHỌN NHANH KIỂU DỊCH (SONG NGỮ BÊN DƯỚI / DỊCH TỪNG TỪ / THAY THẾ)
  // --------------------------------------------------------------------------
  function initModeSelector() {
    const pills = document.querySelectorAll('#mode-segmented .mode-pill');
    pills.forEach((pill) => {
      pill.addEventListener('click', async () => {
        const mode = pill.getAttribute('data-mode');
        settings.displayMode = mode;
        syncModeButtonsUI();
        await chrome.storage.local.set({ settings });
      });
    });
  }

  function syncModeButtonsUI() {
    const activeMode = settings.displayMode || 'bilingual';
    const pills = document.querySelectorAll('#mode-segmented .mode-pill');
    pills.forEach((pill) => {
      if (pill.getAttribute('data-mode') === activeMode) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }

  // --------------------------------------------------------------------------
  // 2. TABS ĐIỀU HƯỚNG
  // --------------------------------------------------------------------------
  function initTabs() {
    const tabs = document.querySelectorAll('.tab-item');
    const panes = document.querySelectorAll('.view-pane');

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-target');
        tabs.forEach((t) => t.classList.remove('active'));
        panes.forEach((p) => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(target)?.classList.add('active');
      });
    });
  }

  // --------------------------------------------------------------------------
  // 3. HÀNH ĐỘNG DỊCH TRANG, DỊCH PDF & MỞ CỬA SỔ NỔI 400PX
  // --------------------------------------------------------------------------
  function isPdfTabUrl(url = '') {
    return /\.pdf($|\?|#)/i.test(url) || (url.startsWith('chrome-extension://') && url.includes('pdf'));
  }

  /**
   * Gửi lệnh tới tab đang mở; nếu tab mở từ trước khi nạp lại tiện ích thì tự động tiêm lại content.js
   */
  async function sendMessageToTabWithAutoInject(tab, message) {
    if (!tab?.id) throw new Error('Không tìm thấy tab đang mở.');
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (_) {
      const url = tab.url || '';
      if (!/^https?:\/\//i.test(url)) {
        throw new Error('Trang hiện tại là trang hệ thống của trình duyệt. Hãy mở một trang web bất kỳ hoặc bấm "📄 Dịch PDF".');
      }
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await new Promise((r) => setTimeout(r, 180));
      return await chrome.tabs.sendMessage(tab.id, message);
    }
  }

  function initPageActions() {
    document.getElementById('btn-open-pdf')?.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeUrl = tab?.url || '';
      const pdfUrl = /^https?:\/\/.*\.pdf($|\?|#)/i.test(activeUrl) ? activeUrl : '';
      await chrome.runtime.sendMessage({
        action: 'OPEN_PDF_READER',
        payload: { pdfUrl, autoTranslate: Boolean(pdfUrl) }
      });
      window.close();
    });

    document.getElementById('btn-open-float')?.addEventListener('click', async () => {
      settings.floatingUIEnabled = true;
      await chrome.storage.local.set({ settings });
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      try {
        await sendMessageToTabWithAutoInject(tab, { action: 'OPEN_FLOATING_WINDOW' });
        window.close();
      } catch (err) {
        showAlert(err.message || 'Hãy tải lại (F5) trang web đang mở để bật cửa sổ nổi.', 'error');
      }
    });

    document.getElementById('btn-translate').addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      const activeUrl = tab.url || '';
      if (/^https?:\/\/.*\.pdf($|\?|#)/i.test(activeUrl)) {
        await chrome.runtime.sendMessage({
          action: 'OPEN_PDF_READER',
          payload: { pdfUrl: activeUrl, autoTranslate: true }
        });
        window.close();
        return;
      }

      if (isPdfTabUrl(activeUrl)) {
        await chrome.runtime.sendMessage({
          action: 'OPEN_PDF_READER',
          payload: { pdfUrl: '', autoTranslate: false }
        });
        window.close();
        return;
      }

      try {
        await sendMessageToTabWithAutoInject(tab, { action: 'TRIGGER_PAGE_TRANSLATION' });
        window.close();
      } catch (err) {
        showAlert(err.message || 'Hãy tải lại (F5) trang web đang mở trước khi bấm Dịch trang.', 'error');
      }
    });

    document.getElementById('btn-restore').addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      try {
        await sendMessageToTabWithAutoInject(tab, { action: 'RESTORE_ORIGINAL_PAGE' });
        window.close();
      } catch (_) {}
    });
  }

  // --------------------------------------------------------------------------
  // 4. QUẢN LÝ TỪ VỰNG (TỰ LƯU NHÁP KHI GÕ + GỢI Ý TỪ TỰ ĐỘNG KHI TÌM KIẾM)
  // --------------------------------------------------------------------------
  function initVocabManager() {
    const addWordInput = document.getElementById('add-word');
    const addMeaningInput = document.getElementById('add-meaning');
    const addPosSelect = document.getElementById('add-pos');
    const searchInput = document.getElementById('search-vocab');
    const sugDropdown = document.getElementById('popup-sug-dropdown');

    const saveDraft = () => {
      draftState.word = addWordInput.value;
      draftState.meaning = addMeaningInput.value;
      draftState.pos = addPosSelect.value;
      chrome.storage.local.set({ lexis_draft: draftState });
    };

    addWordInput.addEventListener('input', saveDraft);
    addMeaningInput.addEventListener('input', saveDraft);
    addPosSelect.addEventListener('change', saveDraft);

    const handleAddWord = async () => {
      const word = addWordInput.value.trim();
      const meaning = addMeaningInput.value.trim();
      const pos = addPosSelect.value;

      if (!word || !meaning) {
        addWordInput.focus();
        return;
      }

      const idx = learnedWords.findIndex(
        (w) => (w.word || '').toLowerCase() === word.toLowerCase()
      );

      if (idx >= 0) {
        learnedWords[idx] = {
          ...learnedWords[idx],
          word,
          meaning,
          pos,
          timestamp: Date.now()
        };
      } else {
        learnedWords.unshift({
          id: `lw-${Date.now()}`,
          word,
          meaning,
          pos,
          phonetic: draftState.phonetic || '',
          timestamp: Date.now()
        });
      }

      addWordInput.value = '';
      addMeaningInput.value = '';
      draftState.word = '';
      draftState.meaning = '';
      draftState.phonetic = '';
      await chrome.storage.local.set({
        learned_words: learnedWords,
        lexis_draft: draftState
      });

      renderVocabList();
      updateCountBadge();
    };

    document.getElementById('btn-add-word').addEventListener('click', handleAddWord);
    addMeaningInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleAddWord();
    });

    searchInput.addEventListener('input', (e) => {
      const raw = e.target.value.trim();
      searchQuery = raw.toLowerCase();
      renderVocabList();
      updatePopupSuggestions(raw);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-wrap')) {
        sugDropdown?.classList.remove('is-open');
      }
    });

    async function updatePopupSuggestions(query) {
      if (!sugDropdown) return;
      const q = (query || '').trim().toLowerCase();
      if (!q) {
        sugDropdown.classList.remove('is-open');
        return;
      }

      const items = [];
      const seen = new Set();

      for (const w of learnedWords) {
        const word = (w.word || '').trim();
        const meaning = (w.meaning || '').trim();
        if (word.toLowerCase().includes(q) || meaning.toLowerCase().includes(q)) {
          seen.add(word.toLowerCase());
          items.push({ word, meaning, tag: 'Đã lưu' });
        }
        if (items.length >= 4) break;
      }

      renderPopupDropdown(items);

      clearTimeout(popupSuggestTimer);
      popupSuggestTimer = setTimeout(async () => {
        try {
          const res = await chrome.runtime.sendMessage({
            action: 'SUGGEST_WORDS',
            payload: { query: q }
          });
          const suggestions = res?.data?.suggestions || [];
          for (const s of suggestions) {
            const lower = s.toLowerCase();
            if (!seen.has(lower)) {
              seen.add(lower);
              items.push({ word: s, meaning: 'Bấm để dịch & lưu từ này', tag: 'Gợi ý từ' });
            }
            if (items.length >= 7) break;
          }
          renderPopupDropdown(items);
        } catch (_) {}
      }, 150);
    }

    function renderPopupDropdown(items) {
      if (!sugDropdown) return;
      if (items.length === 0) {
        sugDropdown.classList.remove('is-open');
        return;
      }
      sugDropdown.innerHTML = items
        .map(
          (it) => `
          <div class="sug-item" data-word="${escapeHTML(it.word)}" data-tag="${escapeHTML(it.tag)}">
            <div>
              <span class="sug-word">${escapeHTML(it.word)}</span>
              <span class="sug-meaning">${escapeHTML(it.meaning)}</span>
            </div>
            <span class="sug-badge">${escapeHTML(it.tag)}</span>
          </div>
        `
        )
        .join('');
      sugDropdown.classList.add('is-open');

      sugDropdown.querySelectorAll('.sug-item').forEach((row) => {
        row.addEventListener('mousedown', async (e) => {
          e.preventDefault();
          const selectedWord = row.getAttribute('data-word');
          sugDropdown.classList.remove('is-open');
          searchInput.value = selectedWord;
          searchQuery = selectedWord.toLowerCase();
          renderVocabList();

          // Tự động điền từ vào khung Thêm từ và gọi AI lấy nghĩa tiếng Việt
          addWordInput.value = selectedWord;
          addMeaningInput.placeholder = 'Đang tự động tra nghĩa tiếng Việt...';
          saveDraft();

          try {
            const res = await chrome.runtime.sendMessage({
              action: 'QUICK_TRANSLATE',
              payload: { text: selectedWord, sourceLang: 'auto', targetLang: 'Tiếng Việt' }
            });
            if (res?.success && res.data) {
              addMeaningInput.value = res.data.shortMeaning || res.data.translatedText || '';
              if (res.data.pos) addPosSelect.value = res.data.pos;
              draftState.phonetic = res.data.phonetic || '';
              saveDraft();
            }
          } catch (_) {}
          addMeaningInput.placeholder = 'Nghĩa tiếng Việt (tự động lưu nháp khi gõ)';
        });
      });
    }

    document.getElementById('btn-export-json').addEventListener('click', () => {
      const content = JSON.stringify(learnedWords, null, 2);
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lexis-vocabulary-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

    const fileInput = document.getElementById('file-import-json');
    document.getElementById('btn-import-json').addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) return;

        const map = new Map();
        for (const item of learnedWords) {
          if (item.word) map.set(item.word.toLowerCase().trim(), item);
        }

        for (const raw of parsed) {
          const w = String(raw.word || '').trim();
          const m = String(raw.meaning || '').trim();
          if (!w) continue;
          map.set(w.toLowerCase(), {
            id: raw.id || `lw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            word: w,
            meaning: m || 'Đã học',
            pos: String(raw.pos || 'n').trim(),
            phonetic: String(raw.phonetic || '').trim(),
            timestamp: Number(raw.timestamp) || Date.now()
          });
        }

        learnedWords = Array.from(map.values());
        await chrome.storage.local.set({ learned_words: learnedWords });
        renderVocabList();
        updateCountBadge();
      } catch (_) {}
      fileInput.value = '';
    });
  }

  function renderVocabList() {
    const container = document.getElementById('vocab-list');
    if (!container) return;

    const filtered = learnedWords.filter((item) => {
      if (!searchQuery) return true;
      return (
        (item.word || '').toLowerCase().includes(searchQuery) ||
        (item.meaning || '').toLowerCase().includes(searchQuery)
      );
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div class="empty-box">${
        searchQuery
          ? 'Không tìm thấy từ vựng nào khớp với từ khóa.'
          : 'Chưa có từ vựng nào. Hãy thêm từ ở khung phía trên hoặc lưu trực tiếp khi đọc web.'
      }</div>`;
      return;
    }

    container.innerHTML = filtered
      .map(
        (item) => `
        <div class="vocab-card">
          <div class="vocab-card-left">
            <div class="vocab-card-header">
              <span class="v-word">${escapeHTML(item.word)}</span>
              ${item.phonetic ? `<span class="v-phonetic">${escapeHTML(item.phonetic)}</span>` : ''}
              ${item.pos ? `<span class="v-pos">${escapeHTML(item.pos)}</span>` : ''}
            </div>
            <div class="v-meaning">${escapeHTML(item.meaning)}</div>
          </div>
          <div class="vocab-card-actions">
            <button class="icon-action speak" data-word="${escapeHTML(item.word)}" title="Phát âm từ này">🔊</button>
            <button class="icon-action delete" data-id="${escapeHTML(item.id)}" title="Xóa từ này">×</button>
          </div>
        </div>
      `
      )
      .join('');

    container.querySelectorAll('.icon-action.speak').forEach((btn) => {
      btn.addEventListener('click', () => {
        const word = btn.getAttribute('data-word');
        if (word && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(word);
          u.lang = 'en-US';
          u.rate = 0.94;
          window.speechSynthesis.speak(u);
        }
      });
    });

    container.querySelectorAll('.icon-action.delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        learnedWords = learnedWords.filter((w) => w.id !== id);
        await chrome.storage.local.set({ learned_words: learnedWords });
        renderVocabList();
        updateCountBadge();
      });
    });
  }

  // --------------------------------------------------------------------------
  // 5. CÀI ĐẶT API: ĐA NHÀ CUNG CẤP AI FREE XOAY VÒNG (GEMINI, GROQ, OPENROUTER, CEREBRAS)
  // --------------------------------------------------------------------------
  function hasKeyForProvider(providerId) {
    const meta = PROVIDER_FIELD_MAP[providerId] || PROVIDER_FIELD_MAP.gemini;
    return Boolean((settings[meta.keyField] || '').trim());
  }

  function getActiveModelByProvider(providerId) {
    const meta = PROVIDER_FIELD_MAP[providerId] || PROVIDER_FIELD_MAP.gemini;
    const saved = (settings[meta.modelField] || '').trim();
    return saved || meta.defaultModel;
  }

  /**
   * Hiển thị toàn bộ danh sách Model đang hỗ trợ dưới dạng Khung thanh trượt kéo dọc (#model-scroll-box)
   * Tuyệt đối KHÔNG hiện cục (chips), giúp người dùng kéo thanh trượt chọn bất kỳ model nào (cả Free & Pro/Paid)
   */
  function populateModelSelectorAndChips(providerId, filterQuery = '') {
    const p = PROVIDER_FIELD_MAP[providerId] ? providerId : 'gemini';
    const meta = PROVIDER_FIELD_MAP[p];
    const catalog = MODEL_CATALOG[p] || MODEL_CATALOG.gemini;
    const activeModel = getActiveModelByProvider(p);

    const providerTitleEl = document.getElementById('current-provider-title');
    const countBadgeEl = document.getElementById('model-count-badge');
    const scrollBox = document.getElementById('model-scroll-box');
    const presetSelect = document.getElementById('model-preset-select');
    const modelInput = document.getElementById('model-input');
    const keyInput = document.getElementById('api-key-input');

    if (providerTitleEl) {
      providerTitleEl.textContent = meta.name;
    }

    const q = String(filterQuery || '').trim().toLowerCase();
    const filteredList = catalog.filter((item) => {
      if (!q) return true;
      return (
        item.id.toLowerCase().includes(q) ||
        (item.desc || '').toLowerCase().includes(q) ||
        (item.badge || '').toLowerCase().includes(q)
      );
    });

    if (countBadgeEl) {
      countBadgeEl.textContent = `(${catalog.length} model đang hỗ trợ)`;
    }

    if (presetSelect) {
      presetSelect.innerHTML = catalog
        .map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.desc || item.id)}</option>`)
        .join('');
      presetSelect.value = activeModel;
    }

    if (scrollBox) {
      if (filteredList.length === 0) {
        scrollBox.innerHTML = `<div style="padding:16px 10px;text-align:center;color:#71717a;font-size:11.5px;">Không tìm thấy model khớp với "${escapeHTML(filterQuery)}". Bạn có thể gõ trực tiếp vào ô "Đang chọn" bên dưới.</div>`;
      } else {
        scrollBox.innerHTML = filteredList
          .map((item) => {
            const isSelected = item.id === activeModel;
            return `
              <div class="model-scroll-row ${isSelected ? 'is-active' : ''}" data-model="${escapeHTML(item.id)}">
                <div class="model-row-main">
                  <div class="model-row-id">${isSelected ? '✓ ' : ''}${escapeHTML(item.id)}</div>
                  <div class="model-row-desc">${escapeHTML(item.desc || item.id)}</div>
                </div>
                <span class="model-row-badge">${escapeHTML(isSelected ? 'Đang chọn' : item.badge || 'Đang hỗ trợ')}</span>
              </div>
            `;
          })
          .join('');

        scrollBox.querySelectorAll('.model-scroll-row').forEach((row) => {
          row.addEventListener('click', async () => {
            const chosenModel = row.getAttribute('data-model');
            if (!chosenModel) return;
            await applySelectedModelForProvider(p, chosenModel);
          });
        });
      }
    }

    if (modelInput) {
      modelInput.value = activeModel;
    }
    if (keyInput) {
      keyInput.placeholder = meta.placeholder;
    }
  }

  async function refreshModelsFromProviderServer(providerId, silent = false) {
    const p = PROVIDER_FIELD_MAP[providerId] ? providerId : 'gemini';
    const meta = PROVIDER_FIELD_MAP[p];
    const refreshBtn = document.getElementById('btn-refresh-models');
    const keyInput = document.getElementById('api-key-input');
    const rawKey = (keyInput?.value || '').trim() || (settings[meta.keyField] || '').trim();

    if (refreshBtn && !silent) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Đang tải...';
    }

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'FETCH_PROVIDER_MODELS',
        payload: { provider: p, apiKey: rawKey }
      });

      const serverModels = res?.data?.models || [];
      if (Array.isArray(serverModels) && serverModels.length > 0) {
        const existingMap = new Map();
        for (const item of MODEL_CATALOG[p] || []) {
          existingMap.set(item.id, item);
        }
        for (const sm of serverModels) {
          if (sm?.id && !existingMap.has(sm.id)) {
            existingMap.set(sm.id, {
              id: sm.id,
              badge: sm.badge || 'Đang hỗ trợ',
              desc: sm.name || `${sm.id} — Model đang hoạt động trên ${meta.name}`
            });
          }
        }
        MODEL_CATALOG[p] = Array.from(existingMap.values());
        const filterEl = document.getElementById('model-filter-input');
        populateModelSelectorAndChips(p, filterEl?.value || '');
        if (!silent) {
          showAlert(
            `✓ Đã cập nhật danh sách đầy đủ ${MODEL_CATALOG[p].length} model đang hỗ trợ của ${meta.name}! Hãy kéo thanh trượt để chọn.`,
            'success'
          );
        }
      } else if (!silent) {
        if (!rawKey && p !== 'openrouter') {
          showAlert(
            `Danh sách hiện có sẵn ${MODEL_CATALOG[p].length} model chuẩn của ${meta.name}. (Nhập thêm API Key nếu muốn quét thêm model riêng từ tài khoản của bạn).`,
            'success'
          );
        }
      }
    } catch (_) {
    } finally {
      if (refreshBtn && !silent) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '↻ Tải từ Server';
      }
    }
  }

  async function applySelectedModelForProvider(providerId, chosenModel) {
    const p = PROVIDER_FIELD_MAP[providerId] ? providerId : 'gemini';
    const meta = PROVIDER_FIELD_MAP[p];
    const cleanModel = (chosenModel || '').trim() || meta.defaultModel;

    settings = {
      ...settings,
      [meta.modelField]: cleanModel
    };
    await chrome.storage.local.set({ settings });
    const filterEl = document.getElementById('model-filter-input');
    populateModelSelectorAndChips(p, filterEl?.value || '');

    const connectedLabel = document.getElementById('connected-provider-label');
    if (connectedLabel && hasKeyForProvider(p)) {
      connectedLabel.textContent = `${meta.name.toUpperCase()} • ${cleanModel}`;
    }
  }

  function renderPoolStatusUI() {
    const providerOrder = ['gemini', 'groq', 'openrouter', 'cerebras'];
    const currentSelected = PROVIDER_FIELD_MAP[settings.provider] ? settings.provider : 'gemini';
    let activeCount = 0;

    providerOrder.forEach((pid, idx) => {
      const hasKey = hasKeyForProvider(pid);
      if (hasKey) activeCount++;

      const pill = document.querySelector(`.pool-pill[data-provider="${pid}"]`);
      if (pill) {
        const labelShort =
          pid === 'gemini'
            ? 'Gemini'
            : pid === 'groq'
            ? 'Groq'
            : pid === 'openrouter'
            ? 'OpenRouter'
            : 'Cerebras';
        pill.textContent = `${hasKey ? '✓' : `${idx + 1}.`} ${labelShort}`;
        pill.style.borderColor = currentSelected === pid ? '#18181b' : hasKey ? '#86efac' : '#e4e4e7';
        pill.style.background = hasKey ? '#f0fdf4' : '#ffffff';
        pill.style.color = hasKey ? '#15803d' : '#52525b';
        pill.style.fontWeight = currentSelected === pid ? '700' : '600';
      }
    });

    const badge = document.getElementById('pool-active-count');
    if (badge) {
      badge.textContent = `${activeCount}/4 dịch vụ đã có Key`;
    }
  }

  function renderSettingsView() {
    const loginView = document.getElementById('api-login-view');
    const connectedView = document.getElementById('api-connected-view');
    const keyInput = document.getElementById('api-key-input');
    const providerSelect = document.getElementById('provider-select');
    const filterEl = document.getElementById('model-filter-input');

    if (!PROVIDER_FIELD_MAP[settings.provider]) {
      settings.provider = 'gemini';
    }

    // Luôn xóa trắng ô input trong DOM để không bao giờ lộ API Key
    if (keyInput) keyInput.value = '';
    if (providerSelect) providerSelect.value = settings.provider;

    document.getElementById('auto-translate').checked = Boolean(settings.autoTranslate);

    const isFloatingEnabled = settings.floatingUIEnabled !== false;
    const floatingToggle = document.getElementById('floating-ui-toggle');
    const quickFloatingToggle = document.getElementById('quick-floating-toggle');
    const quickFloatingStatus = document.getElementById('quick-floating-status');

    if (floatingToggle) floatingToggle.checked = isFloatingEnabled;
    if (quickFloatingToggle) quickFloatingToggle.checked = isFloatingEnabled;
    if (quickFloatingStatus) {
      quickFloatingStatus.textContent = isFloatingEnabled ? 'Thanh nổi: Đang Bật' : 'Thanh nổi: Đã Tắt';
    }

    const scaleRange = document.getElementById('ui-scale-range');
    const scaleLabel = document.getElementById('ui-scale-label');
    const quickScaleBadge = document.getElementById('quick-scale-badge');
    const currentScale = settings.uiScale || 100;
    if (scaleRange) scaleRange.value = currentScale;
    if (scaleLabel) scaleLabel.textContent = `${currentScale}%`;
    if (quickScaleBadge) quickScaleBadge.textContent = `${currentScale}%`;

    renderPoolStatusUI();

    const p = settings.provider || 'gemini';
    const meta = PROVIDER_FIELD_MAP[p] || PROVIDER_FIELD_MAP.gemini;

    // Luôn hiển thị danh sách thanh trượt Model của nhà cung cấp đang chọn
    populateModelSelectorAndChips(p, filterEl?.value || '');

    if (hasKeyForProvider(p)) {
      loginView.style.display = 'none';
      connectedView.style.display = 'block';

      const activeModel = getActiveModelByProvider(p);
      const labelEl = document.getElementById('connected-provider-label');
      const detectedHighlightEl = document.getElementById('detected-model-highlight');
      if (labelEl) labelEl.textContent = `${meta.name.toUpperCase()}`;
      if (detectedHighlightEl) detectedHighlightEl.textContent = activeModel;
    } else {
      loginView.style.display = 'block';
      connectedView.style.display = 'none';
    }
  }

  /**
   * Gửi message tới background kèm bộ đếm Timeout an toàn để không bao giờ bị treo nút "Đang kiểm tra..."
   */
  function sendMessageWithTimeout(message, timeoutMs = 9000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Quá thời gian chờ phản hồi (9 giây). Hãy kiểm tra kết nối mạng hoặc bấm "💾 Lưu nhanh".'));
      }, timeoutMs);

      chrome.runtime
        .sendMessage(message)
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * Cập nhật danh sách Model thực tế mà API Key vừa được máy chủ xác nhận hỗ trợ
   */
  function mergeDiscoveredModelsIntoCatalog(providerId, availableModels = [], detectedModel = '') {
    const p = PROVIDER_FIELD_MAP[providerId] ? providerId : 'gemini';
    const meta = PROVIDER_FIELD_MAP[p];
    const map = new Map();

    if (detectedModel) {
      map.set(detectedModel, {
        id: detectedModel,
        badge: '★ Tự chọn cho Key này',
        desc: `${detectedModel} — ★ Model chính xác được tự động chọn cho API Key ${meta.name} của bạn`
      });
    }

    if (Array.isArray(availableModels)) {
      for (const m of availableModels) {
        if (m?.id && !map.has(m.id)) {
          map.set(m.id, {
            id: m.id,
            badge: m.badge || 'Key hỗ trợ',
            desc: m.name || `${m.id} — Model được hỗ trợ bởi API Key này`
          });
        }
      }
    }

    for (const item of MODEL_CATALOG[p] || []) {
      if (item?.id && !map.has(item.id)) {
        map.set(item.id, item);
      } else if (item?.id && item.id === detectedModel) {
        const existing = map.get(detectedModel);
        existing.desc = item.desc || existing.desc;
      }
    }

    MODEL_CATALOG[p] = Array.from(map.values());
  }

  function initSettings() {
    const providerSelect = document.getElementById('provider-select');
    const presetSelect = document.getElementById('model-preset-select');
    const filterInput = document.getElementById('model-filter-input');
    const refreshModelsBtn = document.getElementById('btn-refresh-models');
    const modelInput = document.getElementById('model-input');
    const keyInput = document.getElementById('api-key-input');
    const loginBtn = document.getElementById('btn-login-api');
    const saveDirectBtn = document.getElementById('btn-save-key-direct');

    const selectProviderTab = async (nextProvider) => {
      if (!PROVIDER_FIELD_MAP[nextProvider]) return;
      settings.provider = nextProvider;
      if (keyInput) keyInput.value = '';
      if (filterInput) filterInput.value = '';
      hideAlert();
      await chrome.storage.local.set({ settings });
      renderSettingsView();
      refreshModelsFromProviderServer(nextProvider, true);
    };

    providerSelect?.addEventListener('change', (e) => {
      selectProviderTab(e.target.value);
    });

    document.querySelectorAll('.pool-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        const pid = pill.getAttribute('data-provider');
        if (pid) selectProviderTab(pid);
      });
    });

    // Lọc nhanh danh sách trong khung thanh trượt khi gõ tìm kiếm
    filterInput?.addEventListener('input', (e) => {
      const p = providerSelect?.value || settings.provider || 'gemini';
      populateModelSelectorAndChips(p, e.target.value);
    });

    // Bấm nút Quét lại toàn bộ Model đang hoạt động từ máy chủ của hãng
    refreshModelsBtn?.addEventListener('click', () => {
      const p = providerSelect?.value || settings.provider || 'gemini';
      refreshModelsFromProviderServer(p, false);
    });

    presetSelect?.addEventListener('change', async (e) => {
      const p = providerSelect?.value || settings.provider || 'gemini';
      await applySelectedModelForProvider(p, e.target.value);
    });

    modelInput?.addEventListener('change', async (e) => {
      const p = providerSelect?.value || settings.provider || 'gemini';
      await applySelectedModelForProvider(p, e.target.value);
    });

    // 1A. LƯU NHANH KEY & TỰ DÒ MODEL NGẦM
    saveDirectBtn?.addEventListener('click', async () => {
      const provider = providerSelect.value;
      const meta = PROVIDER_FIELD_MAP[provider] || PROVIDER_FIELD_MAP.gemini;
      const enteredModel = modelInput.value.trim() || meta.defaultModel;
      const rawKey = keyInput.value.trim();

      if (!rawKey) {
        showAlert(`Vui lòng dán API Key cho nhà phát triển ${meta.name} trước khi bấm Lưu.`, 'error');
        keyInput.focus();
        return;
      }

      settings = {
        ...settings,
        provider,
        [meta.modelField]: enteredModel,
        [meta.keyField]: rawKey
      };

      keyInput.value = '';
      await chrome.storage.local.set({ settings });
      renderSettingsView();
      showAlert(
        `⏳ Đã lưu API Key của ${meta.name}! Đang tự động kiểm tra xem Key này hỗ trợ chính xác Model nào...`,
        'success'
      );

      try {
        const res = await sendMessageWithTimeout(
          {
            action: 'TEST_API_KEY',
            payload: { settings, targetProvider: provider }
          },
          7500
        );
        if (res?.success && res.data?.model) {
          const detectedModel = res.data.model;
          mergeDiscoveredModelsIntoCatalog(provider, res.data.availableModels, detectedModel);
          settings = {
            ...settings,
            [meta.modelField]: detectedModel
          };
          await chrome.storage.local.set({ settings });
          renderSettingsView();
          showAlert(
            `✓ Đã lưu Key ${meta.name} & Tự động nhận diện Model chính xác cho Key này là: "${detectedModel}"${
              res.data.totalModels ? ` (Cùng ${res.data.totalModels} model khả dụng khác ở thanh trượt bên dưới)` : ''
            }!`,
            'success'
          );
        }
      } catch (_) {}
    });

    // 1B. GẮN API & TỰ ĐỘNG DÒ CHÍNH XÁC MODEL CHO KEY ĐÓ (Không cần biết trước tên Model!)
    loginBtn.addEventListener('click', async () => {
      const provider = providerSelect.value;
      const meta = PROVIDER_FIELD_MAP[provider] || PROVIDER_FIELD_MAP.gemini;
      const rawKey = keyInput.value.trim();

      if (!rawKey) {
        showAlert(`Vui lòng dán API Key của nhà phát triển ${meta.name} vào ô số (2).`, 'error');
        keyInput.focus();
        return;
      }

      const candidateSettings = {
        ...settings,
        provider,
        [meta.keyField]: rawKey
      };

      loginBtn.disabled = true;
      loginBtn.textContent = `⏳ Đang dò Model của Key...`;
      showAlert(`⏳ Đang kết nối tới ${meta.name} để kiểm tra API Key và tự động nhận diện Model chính xác...`, 'success');

      try {
        const res = await sendMessageWithTimeout(
          {
            action: 'TEST_API_KEY',
            payload: {
              settings: candidateSettings,
              targetProvider: provider
            }
          },
          8500
        );

        if (!res || !res.success) {
          // Nếu gặp lỗi 429 (Rate Limit), chứng tỏ API Key hợp lệ -> Vẫn lưu Key và gán Model chuẩn
          if (res?.errorCode === 'RATE_LIMIT' || String(res?.error || '').includes('429')) {
            const fallbackModel = getActiveModelByProvider(provider) || meta.defaultModel;
            keyInput.value = '';
            settings = {
              ...candidateSettings,
              [meta.modelField]: fallbackModel
            };
            await chrome.storage.local.set({ settings });
            renderSettingsView();
            showAlert(
              `✓ API Key ${meta.name} hợp lệ! Đã tự động gán Model: "${fallbackModel}". (Hiện tài khoản đang tạm chạm giới hạn 429, hệ thống sẽ tự xoay vòng).`,
              'success'
            );
            return;
          }
          showAlert(
            res?.error ||
              `Không thể xác thực API Key với ${meta.name}. Hãy kiểm tra lại mã Key hoặc bấm "💾 Lưu nhanh".`,
            'error'
          );
          return;
        }

        const detectedModel = res.data?.model || meta.defaultModel;
        const availableModels = res.data?.availableModels || [];
        mergeDiscoveredModelsIntoCatalog(provider, availableModels, detectedModel);

        keyInput.value = '';
        settings = {
          ...candidateSettings,
          [meta.modelField]: detectedModel
        };
        await chrome.storage.local.set({ settings });

        renderSettingsView();
        showAlert(
          `✓ Thành công! Đã gắn API Key cho ${meta.name}.\n🎯 Hệ thống tự động phát hiện & chọn chính xác Model của Key này là: "${detectedModel}"${
            availableModels.length > 0
              ? `\n📋 Key này hỗ trợ tổng cộng ${availableModels.length} model (Đã nạp vào thanh trượt mục 3 bên dưới).`
              : ''
          }`,
          'success'
        );
      } catch (err) {
        showAlert(
          err?.message ||
            `Kiểm tra quá thời gian chờ. Bạn có thể bấm nút "💾 Lưu nhanh" bên cạnh để lưu trực tiếp.`,
          'error'
        );
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = '🔍 Gắn API & Tự dò Model';
      }
    });

    // 2. XÓA KEY CỦA DỊCH VỤ ĐANG CHỌN KHỎI VÒNG LẶP (Giữ nguyên các dịch vụ khác)
    document.getElementById('btn-logout-api').addEventListener('click', async () => {
      const provider = settings.provider || 'gemini';
      const meta = PROVIDER_FIELD_MAP[provider] || PROVIDER_FIELD_MAP.gemini;

      settings = {
        ...settings,
        [meta.keyField]: ''
      };

      await chrome.storage.local.set({ settings });
      if (keyInput) keyInput.value = '';
      renderSettingsView();
      showAlert(`Đã xóa API Key của ${meta.name}. Bạn có thể dán Key mới vào ô phía trên.`, 'success');
    });

    // 3. TỰ DÒ LẠI MODEL TỐT NHẤT CHO KEY ĐANG GẮN
    document.getElementById('btn-test-key').addEventListener('click', async () => {
      const testBtn = document.getElementById('btn-test-key');
      const provider = settings.provider || 'gemini';
      const meta = PROVIDER_FIELD_MAP[provider] || PROVIDER_FIELD_MAP.gemini;

      testBtn.disabled = true;
      testBtn.textContent = '⏳ Đang dò Model...';
      showAlert(`⏳ Đang kiểm tra API Key ${meta.name} và tự động tìm Model hoạt động tốt nhất...`, 'success');

      try {
        const res = await sendMessageWithTimeout(
          {
            action: 'TEST_API_KEY',
            payload: { targetProvider: provider }
          },
          8500
        );

        if (res && res.success) {
          const detectedModel = res.data?.model || getActiveModelByProvider(provider);
          const availableModels = res.data?.availableModels || [];
          mergeDiscoveredModelsIntoCatalog(provider, availableModels, detectedModel);

          settings = {
            ...settings,
            [meta.modelField]: detectedModel
          };
          await chrome.storage.local.set({ settings });
          renderSettingsView();

          showAlert(
            `✓ Kết nối ${meta.name} ổn định!\n🎯 Model chính xác đang hoạt động tốt nhất cho Key này là: "${detectedModel}"${
              availableModels.length > 0 ? ` (Trong tổng số ${availableModels.length} model mà Key hỗ trợ).` : '.'
            }`,
            'success'
          );
        } else {
          showAlert(res?.error || 'Kết nối thất bại. Hãy bấm "Xóa / Đổi Key" và nhập lại.', 'error');
        }
      } catch (err) {
        showAlert(err.message, 'error');
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = '🔍 Tự dò lại Model';
      }
    });

    document.getElementById('auto-translate').addEventListener('change', async (e) => {
      settings.autoTranslate = e.target.checked;
      await chrome.storage.local.set({ settings });
    });

    const applyFloatingToggle = async (enabled) => {
      settings.floatingUIEnabled = Boolean(enabled);
      await chrome.storage.local.set({ settings });
      renderSettingsView();
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'SET_FLOATING_UI_ENABLED',
            payload: { enabled: settings.floatingUIEnabled }
          });
        } catch (_) {}
      }
    };

    document.getElementById('floating-ui-toggle')?.addEventListener('change', (e) => {
      applyFloatingToggle(e.target.checked);
    });

    document.getElementById('quick-floating-toggle')?.addEventListener('change', (e) => {
      applyFloatingToggle(e.target.checked);
    });

    const applyUiScale = async (nextScale) => {
      const clamped = Math.max(75, Math.min(150, Math.round(Number(nextScale) / 5) * 5));
      settings.uiScale = clamped;
      await chrome.storage.local.set({ settings });
      renderSettingsView();
    };

    document.getElementById('ui-scale-range')?.addEventListener('input', (e) => {
      applyUiScale(e.target.value);
    });

    document.getElementById('btn-scale-down')?.addEventListener('click', () => {
      applyUiScale((settings.uiScale || 100) - 5);
    });

    document.getElementById('btn-scale-up')?.addEventListener('click', () => {
      applyUiScale((settings.uiScale || 100) + 5);
    });

    document.getElementById('btn-scale-reset')?.addEventListener('click', async () => {
      await applyUiScale(100);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'RESET_WINDOW_GEOMETRY' });
        } catch (_) {}
      }
    });
  }

  function showAlert(message, type = 'error') {
    const inlineBox = document.getElementById('api-inline-alert-box');
    const topBox = document.getElementById('api-alert-box');
    const settingsPaneActive = document.getElementById('pane-settings')?.classList.contains('active');

    if (inlineBox) {
      inlineBox.textContent = message;
      inlineBox.className = `alert-box ${type}`;
    }
    if (topBox) {
      if (settingsPaneActive && inlineBox) {
        topBox.className = 'alert-box';
        topBox.textContent = '';
      } else {
        topBox.textContent = message;
        topBox.className = `alert-box ${type}`;
      }
    }
  }

  function hideAlert() {
    const inlineBox = document.getElementById('api-inline-alert-box');
    const topBox = document.getElementById('api-alert-box');
    if (inlineBox) {
      inlineBox.className = 'alert-box';
      inlineBox.textContent = '';
    }
    if (topBox) {
      topBox.className = 'alert-box';
      topBox.textContent = '';
    }
  }

  function escapeHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
});
