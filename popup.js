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
    openaiApiKey: '',
    geminiModel: 'gemini-3.8-flash',
    groqModel: 'llama-3.3-70b-versatile',
    openaiModel: 'gpt-4o-mini',
    autoTranslate: false,
    displayMode: 'bilingual'
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

  const MODEL_SUGGESTIONS = {
    gemini: ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-4-argon'],
    groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini']
  };

  await loadState();
  initTabs();
  initModeSelector();
  initPageActions();
  initVocabManager();
  initSettings();

  async function loadState() {
    const data = await chrome.storage.local.get(['settings', 'learned_words', 'lexis_draft']);
    if (data.settings) settings = { ...settings, ...data.settings };
    if (Array.isArray(data.learned_words)) learnedWords = data.learned_words;
    if (data.lexis_draft) draftState = { ...draftState, ...data.lexis_draft };

    // Khôi phục nội dung đang nhập dở nếu lỡ click ra ngoài làm tắt Popup
    document.getElementById('add-word').value = draftState.word || '';
    document.getElementById('add-pos').value = draftState.pos || 'n';
    document.getElementById('add-meaning').value = draftState.meaning || '';

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
  // 3. HÀNH ĐỘNG DỊCH TRANG & MỞ CỬA SỔ NỔI 400PX
  // --------------------------------------------------------------------------
  function initPageActions() {
    document.getElementById('btn-open-float')?.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'OPEN_FLOATING_WINDOW' });
        window.close();
      } catch (_) {
        showAlert('Hãy tải lại (F5) trang web đang mở để bật cửa sổ nổi 400px.', 'error');
      }
    });

    document.getElementById('btn-translate').addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'TRIGGER_PAGE_TRANSLATION' });
        window.close();
      } catch (_) {
        showAlert('Hãy tải lại (F5) trang web đang mở trước khi bấm Dịch trang.', 'error');
      }
    });

    document.getElementById('btn-restore').addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'RESTORE_ORIGINAL_PAGE' });
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
  // 5. CÀI ĐẶT API: KIỂM TRA LỖI API KEY / MODEL THỰC TẾ + LOGIN 1 LẦN / LOGOUT
  // --------------------------------------------------------------------------
  function hasActiveApiSession() {
    const p = settings.provider || 'gemini';
    if (p === 'gemini') return Boolean((settings.geminiApiKey || '').trim());
    if (p === 'groq') return Boolean((settings.groqApiKey || '').trim());
    if (p === 'openai') return Boolean((settings.openaiApiKey || '').trim());
    return false;
  }

  function getActiveModelByProvider(provider) {
    if (provider === 'gemini') return settings.geminiModel || 'gemini-3.8-flash';
    if (provider === 'groq') return settings.groqModel || 'llama-3.3-70b-versatile';
    return settings.openaiModel || 'gpt-4o-mini';
  }

  function populateModelDatalist(provider) {
    const datalist = document.getElementById('model-suggestions');
    const modelInput = document.getElementById('model-input');
    const keyInput = document.getElementById('api-key-input');
    const list = MODEL_SUGGESTIONS[provider] || MODEL_SUGGESTIONS.gemini;

    datalist.innerHTML = list.map((m) => `<option value="${m}"></option>`).join('');
    modelInput.value = getActiveModelByProvider(provider);

    if (provider === 'gemini') {
      keyInput.placeholder = 'Dán Gemini API Key (AIzaSy...)';
    } else if (provider === 'groq') {
      keyInput.placeholder = 'Dán Groq API Key (gsk_...)';
    } else {
      keyInput.placeholder = 'Dán OpenAI API Key (sk-...)';
    }
  }

  function renderSettingsView() {
    const loginView = document.getElementById('api-login-view');
    const connectedView = document.getElementById('api-connected-view');
    const keyInput = document.getElementById('api-key-input');

    // Luôn xóa trắng ô input trong DOM để không bao giờ lộ API Key
    if (keyInput) keyInput.value = '';

    document.getElementById('auto-translate').checked = Boolean(settings.autoTranslate);

    if (hasActiveApiSession()) {
      loginView.style.display = 'none';
      connectedView.style.display = 'block';

      const p = settings.provider || 'gemini';
      const activeModel = getActiveModelByProvider(p);
      document.getElementById('connected-provider-label').textContent = `${p.toUpperCase()} • ${activeModel}`;
    } else {
      loginView.style.display = 'block';
      connectedView.style.display = 'none';

      const p = settings.provider || 'gemini';
      document.getElementById('provider-select').value = p;
      populateModelDatalist(p);
    }
  }

  function initSettings() {
    const providerSelect = document.getElementById('provider-select');
    const modelInput = document.getElementById('model-input');
    const keyInput = document.getElementById('api-key-input');
    const loginBtn = document.getElementById('btn-login-api');

    providerSelect.addEventListener('change', (e) => {
      keyInput.value = '';
      hideAlert();
      populateModelDatalist(e.target.value);
    });

    // 1. XÁC THỰC TRỰC TIẾP API KEY & MODEL TRƯỚC KHI KHÓA ĐĂNG NHẬP
    loginBtn.addEventListener('click', async () => {
      const provider = providerSelect.value;
      const enteredModel = modelInput.value.trim();
      const rawKey = keyInput.value.trim();

      if (!enteredModel) {
        showAlert('Vui lòng nhập hoặc chọn tên Model AI.', 'error');
        return;
      }

      if (!rawKey) {
        showAlert('Vui lòng nhập API Key để xác thực.', 'error');
        return;
      }

      // Tạo cấu hình thử nghiệm để kiểm tra thật với máy chủ AI
      const candidateSettings = {
        ...settings,
        provider,
        geminiModel: provider === 'gemini' ? enteredModel : settings.geminiModel,
        groqModel: provider === 'groq' ? enteredModel : settings.groqModel,
        openaiModel: provider === 'openai' ? enteredModel : settings.openaiModel,
        geminiApiKey: provider === 'gemini' ? rawKey : '',
        groqApiKey: provider === 'groq' ? rawKey : '',
        openaiApiKey: provider === 'openai' ? rawKey : ''
      };

      loginBtn.disabled = true;
      loginBtn.textContent = 'Đang kiểm tra API Key & Model...';
      hideAlert();

      try {
        const res = await chrome.runtime.sendMessage({
          action: 'TEST_API_KEY',
          payload: { settings: candidateSettings }
        });

        if (!res || !res.success) {
          // Báo lỗi rõ ràng nếu sai API Key hoặc sai tên Model
          showAlert(res?.error || 'Xác thực thất bại. Vui lòng kiểm tra lại API Key và tên Model.', 'error');
          return;
        }

        // Xác thực thành công -> Xóa trắng ô input ngay lập tức và lưu khóa phiên
        keyInput.value = '';
        settings = candidateSettings;
        await chrome.storage.local.set({ settings });

        renderSettingsView();
        showAlert(
          `✓ Xác thực thành công! Đã kết nối ${provider.toUpperCase()} với model "${enteredModel}". API Key đã được ẩn bảo mật.`,
          'success'
        );
      } catch (err) {
        showAlert(`Lỗi khi kiểm tra API: ${err.message}`, 'error');
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Xác thực & Đăng nhập API';
      }
    });

    // 2. ĐĂNG XUẤT / XÓA API KEY (Muốn đổi API hoặc Model phải Logout)
    document.getElementById('btn-logout-api').addEventListener('click', async () => {
      settings = {
        ...settings,
        geminiApiKey: '',
        groqApiKey: '',
        openaiApiKey: ''
      };

      await chrome.storage.local.set({ settings });
      if (keyInput) keyInput.value = '';
      renderSettingsView();
      showAlert('Đã đăng xuất và xóa hoàn toàn API Key khỏi bộ nhớ.', 'success');
    });

    // 3. KIỂM TRA LẠI KẾT NỐI KHI ĐANG TRONG PHIÊN
    document.getElementById('btn-test-key').addEventListener('click', async () => {
      const testBtn = document.getElementById('btn-test-key');
      testBtn.disabled = true;
      testBtn.textContent = 'Đang kiểm tra...';
      hideAlert();

      try {
        const res = await chrome.runtime.sendMessage({
          action: 'TEST_API_KEY'
        });

        if (res && res.success) {
          showAlert(
            `✓ Kết nối ổn định (${res.data?.provider || settings.provider.toUpperCase()} • Model: ${res.data?.model || getActiveModelByProvider(settings.provider)}).`,
            'success'
          );
        } else {
          showAlert(res?.error || 'Kết nối thất bại. Hãy đăng xuất và kiểm tra lại API Key / Model.', 'error');
        }
      } catch (err) {
        showAlert(err.message, 'error');
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = 'Kiểm tra lại kết nối';
      }
    });

    document.getElementById('auto-translate').addEventListener('change', async (e) => {
      settings.autoTranslate = e.target.checked;
      await chrome.storage.local.set({ settings });
    });
  }

  function showAlert(message, type = 'error') {
    const box = document.getElementById('api-alert-box');
    if (!box) return;
    box.textContent = message;
    box.className = `alert-box ${type}`;
  }

  function hideAlert() {
    const box = document.getElementById('api-alert-box');
    if (!box) return;
    box.className = 'alert-box';
    box.textContent = '';
  }

  function escapeHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
});
