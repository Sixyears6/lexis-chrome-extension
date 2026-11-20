/**
 * ============================================================================
 * Lexis — Background Service Worker (Manifest V3)
 * ============================================================================
 * 1. Điều phối xoay vòng đa nhà cung cấp AI miễn phí (Multi-Provider Fallback & Round-Robin):
 *    (1) Google Gemini (gemini-2.5-flash) — Chuẩn Gemini REST API
 *    (2) Groq (llama-3.3-70b-versatile) — Chuẩn OpenAI-compatible
 *    (3) OpenRouter (deepseek/deepseek-chat:free | qwen/qwen-2.5-72b-instruct:free) — Chuẩn OpenAI-compatible
 *    (4) Cerebras (llama-3.3-70b) — Chuẩn OpenAI-compatible
 * 2. Tự động bắt lỗi HTTP 429 (Rate Limit), hết Quota, lỗi mạng/5xx và chuyển ngay
 *    request sang nhà cung cấp kế tiếp trong danh sách xoay vòng.
 */

const DEFAULT_SETTINGS = {
  provider: 'gemini',              // Nhà cung cấp đang chọn để xem/sửa trong tab Cài đặt
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
  currentProviderIndex: 0,         // Vị trí provider hiện tại trong vòng lặp xoay vòng
  autoTranslate: false,
  displayMode: 'bilingual',        // 'bilingual' (Song ngữ bên dưới) | 'word_by_word' (Dịch từng từ) | 'replace' (Thay thế)
  floatingUIEnabled: true,         // Bật/tắt thanh công cụ & cửa sổ nổi trên trang
  uiScale: 100                     // 75% -> 150% tỉ lệ kích thước giao diện
};

const DEFAULT_LEARNED_WORDS = [
  {
    id: 'lw-1',
    word: 'resilient',
    meaning: 'kiên cường, phục hồi nhanh',
    pos: 'adj',
    phonetic: '/rɪˈzɪl.i.ənt/',
    timestamp: Date.now() - 86400000 * 2
  },
  {
    id: 'lw-2',
    word: 'paradigm',
    meaning: 'mô hình, hệ tư tưởng',
    pos: 'n',
    phonetic: '/ˈpær.ə.daɪm/',
    timestamp: Date.now() - 86400000
  },
  {
    id: 'lw-3',
    word: 'inevitable',
    meaning: 'tất yếu, khó tránh khỏi',
    pos: 'adj',
    phonetic: '/ɪnˈev.ɪ.tə.bəl/',
    timestamp: Date.now()
  }
];

function normalizeStoredSettings(raw = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if (
    !merged.geminiModel ||
    merged.geminiModel === 'gemini-2.5-flash' ||
    merged.geminiModel === 'gemini-2.5-flash-lite' ||
    merged.geminiModel === 'gemini-2.0-flash' ||
    merged.geminiModel === 'gemini-2.0-flash-lite' ||
    merged.geminiModel === 'gemini-1.5-flash' ||
    merged.geminiModel === 'gemini-1.5-pro'
  ) {
    merged.geminiModel = 'gemini-3.8-flash';
  }
  if (!merged.groqModel) merged.groqModel = 'llama-3.3-70b-versatile';
  if (!merged.openrouterModel) merged.openrouterModel = 'deepseek/deepseek-chat:free';
  if (!merged.cerebrasModel) merged.cerebrasModel = 'llama-3.3-70b';
  return merged;
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(['settings', 'learned_words']);

  if (!stored.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  } else {
    await chrome.storage.local.set({
      settings: normalizeStoredSettings(stored.settings)
    });
  }

  if (!Array.isArray(stored.learned_words)) {
    await chrome.storage.local.set({ learned_words: DEFAULT_LEARNED_WORDS });
  }

  // Tự động tiêm lại content.js vào các tab đang mở để người dùng click được ngay sau khi Reload tiện ích
  try {
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    for (const tab of tabs) {
      if (tab.id) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }).catch(() => {});
      }
    }
  } catch (_) {}
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return false;

  switch (message.action) {
    case 'TRANSLATE_BATCH':
      handleTranslateBatch(message.payload)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message, errorCode: err.code || 'API_ERROR' }));
      return true;

    case 'TRANSLATE_WORD_BY_WORD':
      handleTranslateWordByWord(message.payload)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message, errorCode: err.code || 'API_ERROR' }));
      return true;

    case 'ANALYZE_GRAMMAR':
      handleAnalyzeGrammar(message.payload)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message, errorCode: err.code || 'API_ERROR' }));
      return true;

    case 'QUICK_TRANSLATE':
      handleQuickTranslate(message.payload)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message, errorCode: err.code || 'API_ERROR' }));
      return true;

    case 'SUGGEST_WORDS':
      handleSuggestWords(message.payload)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case 'TEST_API_KEY':
      handleTestConnection(message.payload)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message, errorCode: err.code || 'API_ERROR' }));
      return true;

    case 'OPEN_PDF_READER':
      handleOpenPdfReader(message.payload)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case 'FETCH_PDF_BASE64':
      handleFetchPdfBase64(message.payload)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case 'TRANSLATE_PDF_VISION_PAGE':
      handleTranslatePdfVisionPage(message.payload)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message, errorCode: err.code || 'API_ERROR' }));
      return true;

    case 'FETCH_PROVIDER_MODELS':
      handleFetchProviderModels(message.payload)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    default:
      return false;
  }
});

async function getStorageState() {
  const data = await chrome.storage.local.get(['settings', 'learned_words']);
  return {
    settings: normalizeStoredSettings(data.settings || {}),
    learnedWords: Array.isArray(data.learned_words) ? data.learned_words : []
  };
}

/**
 * Chuẩn hóa thông báo lỗi chi tiết để nhận diện chính xác:
 * Rate Limit (HTTP 429), Hết hạn mức (Quota), Lỗi Server (5xx), Sai API Key hoặc Sai Model.
 */
function buildDetailedApiError(providerName, status, rawMessage, modelName) {
  const lower = String(rawMessage || '').toLowerCase();
  let errorTitle = `Lỗi ${providerName} API (HTTP ${status})`;
  let code = 'API_ERROR';

  if (
    status === 429 ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('resource_exhausted') ||
    lower.includes('too many requests') ||
    lower.includes('tokens per minute') ||
    lower.includes('requests per minute')
  ) {
    code = 'RATE_LIMIT';
    errorTitle = `Vượt giới hạn gọi API (HTTP 429): Tài khoản ${providerName} đã chạm hạn mức (Rate Limit / Quota).`;
  } else if (status >= 500 && status < 600) {
    code = 'SERVER_ERROR';
    errorTitle = `Máy chủ ${providerName} đang quá tải hoặc bảo trì (HTTP ${status}).`;
  } else if (
    status === 401 ||
    status === 403 ||
    lower.includes('api_key_invalid') ||
    lower.includes('invalid api key') ||
    lower.includes('incorrect api key') ||
    lower.includes('permission_denied') ||
    lower.includes('unauthenticated')
  ) {
    code = 'INVALID_API_KEY';
    errorTitle = `Sai API Key (${providerName}): Mã API Key không hợp lệ, bị sai ký tự hoặc không có quyền truy cập.`;
  } else if (
    status === 404 ||
    lower.includes('model_not_found') ||
    lower.includes('not found') ||
    lower.includes('does not exist') ||
    lower.includes('not supported') ||
    (status === 400 && lower.includes('model'))
  ) {
    code = 'INVALID_MODEL';
    errorTitle = `Sai Model (${providerName} - ${modelName}): Model này không tồn tại hoặc tài khoản chưa được cấp quyền.`;
  } else if (status === 400) {
    code = 'BAD_REQUEST';
    errorTitle = `Yêu cầu không hợp lệ (${providerName} - Model: ${modelName}).`;
  }

  const err = new Error(`${errorTitle}\nChi tiết từ máy chủ: ${rawMessage}`);
  err.code = code;
  err.status = status;
  err.providerName = providerName;
  return err;
}

function extractGeminiRestText(data) {
  if (!data) throw new Error('Phản hồi từ Gemini REST API rỗng.');

  // 1. Chuẩn REST API generateContent của Gemini
  if (Array.isArray(data.candidates) && data.candidates.length > 0) {
    const parts = data.candidates[0]?.content?.parts;
    if (Array.isArray(parts) && parts.length > 0) {
      const combined = parts
        .map((p) => (typeof p.text === 'string' ? p.text : ''))
        .join('\n')
        .trim();
      if (combined) return combined;
    }
  }

  // 2. Chuẩn Interactions API (/v1beta/interactions) cho Gemini 3.x / 4.x
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (Array.isArray(data.outputs) && data.outputs.length > 0) {
    for (let i = data.outputs.length - 1; i >= 0; i--) {
      const out = data.outputs[i];
      if (typeof out?.text === 'string' && out.text.trim()) {
        return out.text.trim();
      }
      if (Array.isArray(out?.parts)) {
        const txt = out.parts.map((p) => p?.text || '').join('\n').trim();
        if (txt) return txt;
      }
    }
  }

  throw new Error('Không tìm thấy dữ liệu văn bản hợp lệ từ Gemini API.');
}

function parseCleanJSON(raw) {
  const cleaned = String(raw || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (firstErr) {
    // Fallback trích xuất khối JSON {...} nếu các model miễn phí trên OpenRouter/Cerebras chèn lời dẫn
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx !== -1 && endIdx > startIdx) {
      return JSON.parse(cleaned.slice(startIdx, endIdx + 1));
    }
    throw firstErr;
  }
}

/**
 * Hàm fetch có bộ đếm thời gian chờ (Timeout) để không bao giờ bị treo "Đang kiểm tra..." vô tận
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      const timeoutErr = new Error(`Máy chủ phản hồi quá lâu (quá ${Math.round(timeoutMs / 1000)} giây).`);
      timeoutErr.code = 'NETWORK_ERROR';
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ============================================================================
 * CLASS ĐIỀU PHỐI XOAY VÒNG ĐA NHÀ CUNG CẤP AI (MultiProviderRouter)
 * ============================================================================
 * Thứ tự ưu tiên xoay vòng (Round-Robin & Auto-Fallback):
 * (1) Google Gemini — Chuẩn Gemini REST API
 * (2) Groq — Chuẩn OpenAI-compatible
 * (3) OpenRouter — Chuẩn OpenAI-compatible
 * (4) Cerebras — Chuẩn OpenAI-compatible
 */
class MultiProviderRouter {
  constructor() {
    this.PROVIDERS = [
      {
        id: 'gemini',
        name: 'Google Gemini',
        keyField: 'geminiApiKey',
        modelField: 'geminiModel',
        defaultModel: 'gemini-3.8-flash',
        priorityModels: [
          'gemini-3.8-flash',
          'gemini-3.5-flash-lite',
          'gemini-3.6-flash',
          'gemini-4-argon',
          'gemini-3.1-pro-preview',
          'gemini-3.1-flash-lite',
          'gemini-2.5-flash',
          'gemini-2.5-flash-lite'
        ],
        type: 'gemini-rest'
      },
      {
        id: 'groq',
        name: 'Groq',
        keyField: 'groqApiKey',
        modelField: 'groqModel',
        defaultModel: 'llama-3.3-70b-versatile',
        priorityModels: [
          'llama-3.3-70b-versatile',
          'llama-3.1-8b-instant',
          'meta-llama/llama-4-scout-17b-16e-instruct',
          'meta-llama/llama-4-maverick-17b-128e-instruct',
          'qwen/qwen3-32b',
          'qwen-qwq-32b',
          'deepseek-r1-distill-llama-70b',
          'gemma2-9b-it'
        ],
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        type: 'openai-compat'
      },
      {
        id: 'openrouter',
        name: 'OpenRouter',
        keyField: 'openrouterApiKey',
        modelField: 'openrouterModel',
        defaultModel: 'deepseek/deepseek-chat:free',
        priorityModels: [
          'deepseek/deepseek-chat:free',
          'qwen/qwen-2.5-72b-instruct:free',
          'meta-llama/llama-3.3-70b-instruct:free',
          'google/gemini-2.0-flash-exp:free',
          'deepseek/deepseek-r1:free',
          'qwen/qwen3-32b:free'
        ],
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        type: 'openai-compat'
      },
      {
        id: 'cerebras',
        name: 'Cerebras',
        keyField: 'cerebrasApiKey',
        modelField: 'cerebrasModel',
        defaultModel: 'llama-3.3-70b',
        priorityModels: [
          'llama-3.3-70b',
          'llama-4-scout-17b-16e-instruct',
          'llama3.1-8b',
          'qwen-3-32b'
        ],
        endpoint: 'https://api.cerebras.ai/v1/chat/completions',
        type: 'openai-compat'
      }
    ];
    this.currentIndex = 0;
  }

  /**
   * Lọc danh sách các nhà cung cấp mà người dùng ĐÃ NHẬP API KEY
   */
  getConfiguredProviders(settings, targetProviderId = null) {
    if (targetProviderId) {
      const target = this.PROVIDERS.find((p) => p.id === targetProviderId);
      if (!target) return [];
      const key = (settings[target.keyField] || '').trim();
      return key ? [target] : [];
    }

    return this.PROVIDERS.filter((p) => {
      const key = (settings[p.keyField] || '').trim();
      return key.length > 0;
    });
  }

  /**
   * Kiểm tra lỗi có thuộc diện tự động nhảy sang model/provider tiếp theo (429, hết quota, 5xx, lỗi mạng, sai model)
   */
  shouldFallback(err) {
    if (!err) return true;
    if (
      err.code === 'RATE_LIMIT' ||
      err.code === 'SERVER_ERROR' ||
      err.code === 'NETWORK_ERROR' ||
      err.code === 'INVALID_MODEL' ||
      err.status === 429 ||
      err.status === 404 ||
      (err.status >= 500 && err.status < 600)
    ) {
      return true;
    }
    const msg = String(err.message || '').toLowerCase();
    return (
      msg.includes('429') ||
      msg.includes('rate limit') ||
      msg.includes('quota') ||
      msg.includes('resource_exhausted') ||
      msg.includes('too many requests') ||
      msg.includes('overloaded') ||
      msg.includes('not found') ||
      msg.includes('not supported') ||
      msg.includes('network') ||
      msg.includes('kết nối mạng') ||
      msg.includes('phản hồi quá lâu')
    );
  }

  /**
   * (1) Gọi Google Gemini qua chuẩn Interactions API hoặc REST generateContent
   */
  async callGeminiRest(provider, settings, { systemInstruction, userPrompt, jsonSchema, imageInput, overrideModel, timeoutMs = 28000 }) {
    const apiKey = (settings[provider.keyField] || '').trim();
    const model = (overrideModel || settings[provider.modelField] || provider.defaultModel).trim();

    const effectiveSystemInstruction = jsonSchema
      ? `${systemInstruction}\n\nQUAN TRỌNG: Chỉ trả về duy nhất chuỗi JSON hợp lệ theo yêu cầu, không kèm markdown \`\`\`json.`
      : systemInstruction;

    // 1. Thử gọi qua chuẩn Interactions API mới nhất (khuyến nghị chính thức của Google cho Gemini 3.8 / 3.5 / 4 / 2.5)
    try {
      const interactionsEndpoint = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${encodeURIComponent(apiKey)}`;
      const interactionInput = imageInput && imageInput.base64Data
        ? {
            parts: [
              { text: `${effectiveSystemInstruction}\n\n${userPrompt}` },
              {
                inline_data: {
                  mime_type: imageInput.mimeType || 'image/jpeg',
                  data: imageInput.base64Data
                }
              }
            ]
          }
        : `${effectiveSystemInstruction}\n\n${userPrompt}`;

      const interactionBody = {
        model,
        input: interactionInput
      };
      if (jsonSchema) {
        interactionBody.response_format = {
          type: 'text',
          mime_type: 'application/json',
          schema: jsonSchema
        };
      }

      const interRes = await fetchWithTimeout(
        interactionsEndpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Api-Revision': '2026-05-20'
          },
          body: JSON.stringify(interactionBody)
        },
        timeoutMs
      );

      if (interRes.ok) {
        const interData = await interRes.json();
        const interText = extractGeminiRestText(interData);
        return jsonSchema ? parseCleanJSON(interText) : interText;
      }

      // Nếu interactions báo lỗi 401/403/429 thì báo ngay
      if (interRes.status === 401 || interRes.status === 403 || interRes.status === 429) {
        let rawMsg = `HTTP ${interRes.status}`;
        try {
          const errData = await interRes.json();
          rawMsg = errData.error?.message || JSON.stringify(errData);
        } catch (_) {
          rawMsg = await interRes.text();
        }
        throw buildDetailedApiError(provider.name, interRes.status, rawMsg, model);
      }
    } catch (interErr) {
      if (interErr.code === 'INVALID_API_KEY' || interErr.code === 'RATE_LIMIT') {
        throw interErr;
      }
    }

    // 2. Fallback gọi qua chuẩn generateContent (nếu tài khoản dùng model cũ)
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const userParts = [{ text: userPrompt }];
    if (imageInput && imageInput.base64Data) {
      userParts.push({
        inlineData: {
          mimeType: imageInput.mimeType || 'image/jpeg',
          data: imageInput.base64Data
        }
      });
    }

    const body = {
      systemInstruction: {
        parts: [{ text: effectiveSystemInstruction }]
      },
      contents: [
        {
          role: 'user',
          parts: userParts
        }
      ],
      generationConfig: {
        temperature: 0.15
      }
    };

    if (jsonSchema) {
      body.generationConfig.responseMimeType = 'application/json';
    }

    let response;
    try {
      response = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        },
        timeoutMs
      );
    } catch (networkErr) {
      const err = new Error(`Lỗi kết nối mạng tới ${provider.name} API: ${networkErr.message}`);
      err.code = 'NETWORK_ERROR';
      throw err;
    }

    if (!response.ok) {
      let rawMsg = `HTTP ${response.status}`;
      try {
        const errData = await response.json();
        rawMsg = errData.error?.message || JSON.stringify(errData);
      } catch (_) {
        rawMsg = await response.text();
      }
      throw buildDetailedApiError(provider.name, response.status, rawMsg, model);
    }

    const data = await response.json();
    const text = extractGeminiRestText(data);
    return jsonSchema ? parseCleanJSON(text) : text;
  }

  /**
   * (2), (3), (4) Gọi chuẩn OpenAI-compatible cho Groq, OpenRouter, Cerebras
   */
  async callOpenAICompatible(provider, settings, { systemInstruction, userPrompt, jsonSchema, imageInput, overrideModel, timeoutMs = 28000 }) {
    const apiKey = (settings[provider.keyField] || '').trim();
    const model = (overrideModel || settings[provider.modelField] || provider.defaultModel).trim();

    const effectiveSystemInstruction = jsonSchema
      ? `${systemInstruction}\n\nIMPORTANT: Return ONLY a valid raw JSON object matching the requested fields. Do not include markdown fences or any extra commentary.`
      : systemInstruction;

    const userContent = imageInput && imageInput.base64Data
      ? [
          { type: 'text', text: userPrompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:${imageInput.mimeType || 'image/jpeg'};base64,${imageInput.base64Data}`
            }
          }
        ]
      : userPrompt;

    const body = {
      model,
      temperature: 0.15,
      messages: [
        { role: 'system', content: effectiveSystemInstruction },
        { role: 'user', content: userContent }
      ]
    };

    if (jsonSchema && provider.id === 'groq') {
      body.response_format = { type: 'json_object' };
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };

    if (provider.id === 'openrouter') {
      headers['HTTP-Referer'] = 'https://github.com/Sixyears6/lexis-chrome-extension';
      headers['X-Title'] = 'Lexis Contextual Translator';
    }

    let response;
    try {
      response = await fetchWithTimeout(
        provider.endpoint,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        },
        timeoutMs
      );
    } catch (networkErr) {
      const err = new Error(`Lỗi kết nối mạng tới ${provider.name} API: ${networkErr.message}`);
      err.code = 'NETWORK_ERROR';
      throw err;
    }

    if (!response.ok) {
      let rawMsg = `HTTP ${response.status}`;
      try {
        const errData = await response.json();
        rawMsg = errData.error?.message || JSON.stringify(errData);
      } catch (_) {
        rawMsg = await response.text();
      }
      throw buildDetailedApiError(provider.name, response.status, rawMsg, model);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    if (!content) {
      const emptyErr = new Error(`Phản hồi từ ${provider.name} API rỗng.`);
      emptyErr.code = 'SERVER_ERROR';
      throw emptyErr;
    }
    return jsonSchema ? parseCleanJSON(content) : content;
  }

  /**
   * Điều phối gọi API theo vòng lặp xoay vòng (Auto-Fallback Model trong cùng hãng & Xoay vòng sang hãng kế tiếp)
   */
  async dispatch({
    systemInstruction,
    userPrompt,
    jsonSchema = null,
    overrideSettings = null,
    imageInput = null,
    targetProvider = null
  }) {
    const { settings: savedSettings } = await getStorageState();
    const settings = overrideSettings
      ? normalizeStoredSettings({ ...savedSettings, ...overrideSettings })
      : savedSettings;

    const activeProviders = this.getConfiguredProviders(settings, targetProvider);

    if (activeProviders.length === 0) {
      const err = new Error(
        'Chưa cấu hình API Key nào. Hãy mở tiện ích -> tab Cài đặt API để nhập ít nhất 1 API Key (Google Gemini, Groq, OpenRouter hoặc Cerebras).'
      );
      err.code = 'MISSING_KEY';
      throw err;
    }

    if (!targetProvider && typeof settings.currentProviderIndex === 'number') {
      this.currentIndex = settings.currentProviderIndex;
    }

    this.currentIndex = ((this.currentIndex % activeProviders.length) + activeProviders.length) % activeProviders.length;

    const errorsEncountered = [];
    let attempts = 0;

    while (attempts < activeProviders.length) {
      const provider = activeProviders[this.currentIndex];
      const primaryModel = (settings[provider.modelField] || provider.defaultModel).trim();
      // Tạo danh sách ứng viên model của hãng này (Model đang chọn -> Các model dự phòng của hãng)
      const modelCandidates = [
        primaryModel,
        ...(provider.priorityModels || []).filter((m) => m !== primaryModel)
      ].slice(0, 3);

      let providerLastErr = null;

      for (const candidateModel of modelCandidates) {
        try {
          const result =
            provider.type === 'gemini-rest'
              ? await this.callGeminiRest(provider, settings, {
                  systemInstruction,
                  userPrompt,
                  jsonSchema,
                  imageInput,
                  overrideModel: candidateModel
                })
              : await this.callOpenAICompatible(provider, settings, {
                  systemInstruction,
                  userPrompt,
                  jsonSchema,
                  imageInput,
                  overrideModel: candidateModel
                });

          // Nếu tự động nhảy sang model khác hoặc provider khác thành công -> Lưu lại ngay
          if (!overrideSettings) {
            const updatedSettings = {
              ...savedSettings,
              currentProviderIndex: this.currentIndex,
              [provider.modelField]: candidateModel
            };
            chrome.storage.local.set({ settings: updatedSettings });
          }

          return result;
        } catch (err) {
          providerLastErr = err;
          errorsEncountered.push({
            providerName: provider.name,
            model: candidateModel,
            error: err
          });

          // Nếu lỗi là Sai API Key (401/403) thì không cần thử model khác của cùng hãng này nữa
          if (err.code === 'INVALID_API_KEY') {
            break;
          }
          // Nếu lỗi là Sai Model (404) hoặc Chạm hạn mức (429) -> thử ngay model dự phòng tiếp theo của hãng này!
        }
      }

      if (targetProvider) {
        throw providerLastErr;
      }

      // Chuyển sang nhà cung cấp tiếp theo trong danh sách xoay vòng
      this.currentIndex = (this.currentIndex + 1) % activeProviders.length;
      attempts++;

      if (!overrideSettings) {
        chrome.storage.local.set({
          settings: { ...savedSettings, currentProviderIndex: this.currentIndex }
        });
      }

      if (activeProviders.length === 1 && providerLastErr && !this.shouldFallback(providerLastErr)) {
        throw providerLastErr;
      }
    }

    const triedSummary = errorsEncountered
      .map((item) => `${item.providerName} (${item.model}): ${item.error.code || 'ERROR'}`)
      .join(' → ');

    // Kiểm tra nguyên nhân lỗi để trả về thông báo chính xác
    const hasOnly429 = errorsEncountered.every((item) => item.error.code === 'RATE_LIMIT' || item.error.status === 429);
    if (hasOnly429) {
      const finalErr = new Error(
        `Tất cả các tài khoản AI đã cấu hình đều đang chạm giới hạn tần suất gọi (HTTP 429 - Rate Limit / Hết Quota). Vui lòng đợi 1 phút rồi thử lại, hoặc thêm API Key của nhà cung cấp khác!`
      );
      finalErr.code = 'RATE_LIMIT';
      throw finalErr;
    }

    const finalErr = new Error(
      `Không thể hoàn thành yêu cầu sau khi thử các dịch vụ đã gắn Key:\n${errorsEncountered
        .map((it) => `• ${it.providerName} (${it.model}): ${it.error.message || it.error.code}`)
        .join('\n')}`
    );
    finalErr.code = errorsEncountered[errorsEncountered.length - 1].error.code || 'API_ERROR';
    throw finalErr;
  }
}

const aiRouter = new MultiProviderRouter();

/**
 * Hàm gọi LLM thống nhất qua bộ điều phối xoay vòng đa nhà cung cấp (MultiProviderRouter)
 */
async function callLLM(options) {
  return await aiRouter.dispatch(options);
}

/**
 * 1. Dịch ngữ cảnh toàn trang theo dạng Văn bản Hợp nhất (Document Text Format - 1 Request / Trang)
 */
async function handleTranslateBatch(payload) {
  const { documentText = '', pageTitle = '', totalCount = 0 } = payload || {};
  if (!documentText.trim()) {
    return { translatedDocument: '' };
  }

  const { learnedWords } = await getStorageState();

  const lowerDoc = documentText.toLowerCase();
  const matchedLearned = learnedWords.filter(
    (w) => w.word && lowerDoc.includes(w.word.toLowerCase().trim())
  );

  const keepWordsInstruction = matchedLearned.length > 0
    ? matchedLearned.map((w) => `- "${w.word}"`).join('\n')
    : '(Không có)';

  const systemInstruction = `Bạn là một biên dịch viên chuyên nghiệp.
Nhiệm vụ của bạn là dịch toàn bộ tài liệu được cung cấp sang tiếng Việt mượt mà, văn phong tự nhiên, chuẩn ngữ cảnh.

QUY TẮC CỐT LÕI (BẮT BUỘC):
1. GIỮ NGUYÊN ĐỊNH DẠNG MỐC: Tài liệu được chia thành các đoạn có gắn thẻ đánh số dạng [[[1]]], [[[2]]], [[[3]]]... Bạn PHẢI GIỮ NGUYÊN các mốc [[[ID]]] này ở đầu mỗi đoạn tương ứng trong bản dịch.
2. TỪ ĐÃ HỌC (TUYỆT ĐỐI KHÔNG DỊCH SANG TIẾNG VIỆT):
Dưới đây là danh sách các từ người dùng đã thuộc:
${keepWordsInstruction}
Nếu bất kỳ từ nào trong danh sách trên xuất hiện trong câu, HÃY GIỮ NGUYÊN TỪ TIẾNG NGOẠI NGỮ ĐÓ đặt tự nhiên trong câu tiếng Việt.
3. Không dịch URL, tên file kỹ thuật (.png, .jpg, .svg) nếu có. Chỉ trả về nội dung bản dịch kèm mốc [[[ID]]].`;

  const userPrompt = `Tiêu đề bài viết: "${pageTitle}" (Tổng cộng ${totalCount} đoạn).

NỘI DUNG TÀI LIỆU CẦN DỊCH:
${documentText}`;

  const translatedText = await callLLM({
    systemInstruction,
    userPrompt,
    jsonSchema: null
  });

  return { translatedDocument: translatedText };
}

/**
 * 2. Dịch từng từ / cụm từ theo ngữ cảnh (Word-by-Word Interlinear Mode - 1 Request / Trang)
 * Trả về các cặp từ/cụm từ gốc kèm nghĩa tiếng Việt ngắn gọn bên dưới từng từ.
 */
async function handleTranslateWordByWord(payload) {
  const { documentText = '', pageTitle = '', totalCount = 0 } = payload || {};
  if (!documentText.trim()) {
    return { wordByWordDocument: '' };
  }

  const { learnedWords } = await getStorageState();
  const learnedSet = learnedWords.map((w) => w.word).filter(Boolean);
  const keepList = learnedSet.length > 0 ? learnedSet.join(', ') : '(Không có)';

  const systemInstruction = `Bạn là trợ lý phân tách và dịch từng từ/cụm từ theo ngữ cảnh (Word-by-Word Gloss).
Nhiệm vụ: Với mỗi đoạn được đánh dấu [[[ID]]], hãy tách câu gốc thành từng từ hoặc cụm từ ngắn (1-3 từ) và ghi nghĩa tiếng Việt ngắn gọn ngay trong ngoặc vuông kế bên theo đúng định dạng:
từ_gốc[nghĩa_ngắn]

QUY TẮC BẮT BUỘC:
1. Giữ nguyên mốc [[[1]]], [[[2]]]... ở đầu mỗi đoạn.
2. Với các từ thông dụng hoặc từ vựng mới: viết dạng từ_gốc[nghĩa tiếng Việt ngắn 1-3 chữ].
   Ví dụ: "She ate a fresh apple" -> She[Cô ấy] ate[đã ăn] a[một] fresh[tươi] apple[quả táo]
3. VỚI CÁC TỪ ĐÃ THUỘC SAU ĐÂY (${keepList}): KHÔNG ghi [nghĩa] cho từ đó, chỉ giữ nguyên từ_gốc để người học tự nhớ.
4. Giữ nguyên dấu câu (.,!?) ở cuối câu. Chỉ trả về kết quả kèm mốc [[[ID]]].`;

  const userPrompt = `Tiêu đề trang: "${pageTitle}" (${totalCount} đoạn).

NỘI DUNG CẦN DỊCH TỪNG TỪ:
${documentText}`;

  const output = await callLLM({
    systemInstruction,
    userPrompt,
    jsonSchema: null
  });

  return { wordByWordDocument: output };
}

/**
 * 3. Phân tích cấu trúc ngữ pháp & giải thích từ/cụm từ
 */
async function handleAnalyzeGrammar(payload) {
  const { targetText = '', contextSentence = '', pageTitle = '' } = payload || {};
  const cleaned = targetText.trim();
  if (!cleaned) {
    throw new Error('Không có từ hoặc cụm câu nào được chọn.');
  }

  const systemInstruction = `Bạn là chuyên gia ngôn ngữ học. Hãy giải thích từ/cụm câu được chọn trong ngữ cảnh câu văn một cách tinh gọn, sắc sảo, tự nhiên.
Trả về JSON chính xác với các trường:
- word: Từ hoặc cụm từ đang xét
- baseForm: Dạng nguyên thể (lemma)
- phonetic: Phiên âm IPA (ví dụ: /rɪˈzɪl.i.ənt/)
- pos: Từ loại viết tắt ngắn gọn (n, v, adj, adv, phrase, idiom)
- shortMeaning: Nghĩa tiếng Việt ngắn gọn (2-6 từ) dùng cho thẻ lưu từ vựng
- contextualTranslation: Bản dịch mượt mà của từ/cụm này trong câu đang xét
- whyThisTranslation: Giải thích ngắn gọn tại sao trong ngữ cảnh này lại dịch như vậy thay vì dịch từng từ
- grammarBreakdown: Mảng gồm 2-3 gạch đầu dòng phân tích thành phần câu, dạng chia động từ, thì ngữ pháp, hoặc cấu trúc đặc biệt.`;

  const userPrompt = `Từ/Cụm cần mổ xẻ: "${cleaned}"
Câu ngữ cảnh: "${contextSentence || cleaned}"
Tiêu đề trang: "${pageTitle}"

Trả về JSON theo đúng cấu trúc.`;

  const jsonSchema = {
    type: 'object',
    properties: {
      word: { type: 'string' },
      baseForm: { type: 'string' },
      phonetic: { type: 'string' },
      pos: { type: 'string' },
      shortMeaning: { type: 'string' },
      contextualTranslation: { type: 'string' },
      whyThisTranslation: { type: 'string' },
      grammarBreakdown: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: [
      'word',
      'baseForm',
      'phonetic',
      'pos',
      'shortMeaning',
      'contextualTranslation',
      'whyThisTranslation',
      'grammarBreakdown'
    ]
  };

  return await callLLM({
    systemInstruction,
    userPrompt,
    jsonSchema
  });
}

/**
 * 4. Dịch nhanh kiểu Google Dịch (Quick Translate Box trong cửa sổ nổi 400px)
 */
async function handleQuickTranslate(payload) {
  const { text = '', sourceLang = 'auto', targetLang = 'Tiếng Việt' } = payload || {};
  const cleaned = text.trim();
  if (!cleaned) {
    throw new Error('Vui lòng nhập từ hoặc câu cần dịch.');
  }

  const wordCount = cleaned.split(/\s+/).length;
  const isShortTerm = wordCount <= 5;

  const systemInstruction = `Bạn là công cụ dịch thuật & từ điển thông minh (tương tự Google Dịch kết hợp Từ điển Oxford).
Hãy dịch văn bản từ "${sourceLang === 'auto' ? 'Tự động phát hiện ngôn ngữ' : sourceLang}" sang "${targetLang}".
Trả về JSON chính xác với các trường:
- translatedText: Bản dịch chính xác, tự nhiên nhất sang ${targetLang}.
- detectedLang: Tên ngôn ngữ gốc phát hiện được (ví dụ: "Tiếng Anh", "Tiếng Nhật", "Tiếng Việt").
- phonetic: Phiên âm IPA nếu văn bản gốc là từ hoặc cụm từ ngắn (để chuỗi rỗng "" nếu là đoạn văn dài).
- pos: Từ loại viết tắt (n, v, adj, adv, phrase, idiom) nếu là từ/cụm từ, hoặc "" nếu là câu dài.
- shortMeaning: Nghĩa ngắn gọn (2-6 chữ) để lưu vào sổ từ vựng.
- alternatives: Mảng gồm 2-4 nghĩa từ điển khác hoặc cách diễn đạt tương đương (mỗi phần tử dạng "từ loại: nghĩa hoặc từ đồng nghĩa").
- grammarNote: ${isShortTerm ? '1 câu ví dụ ngắn kèm bản dịch.' : 'Giải thích ngắn gọn cấu trúc ngữ pháp hoặc ngữ cảnh của câu này.'}`;

  const userPrompt = `Văn bản cần dịch: "${cleaned}"
Ngôn ngữ nguồn: ${sourceLang} -> Ngôn ngữ đích: ${targetLang}`;

  const jsonSchema = {
    type: 'object',
    properties: {
      translatedText: { type: 'string' },
      detectedLang: { type: 'string' },
      phonetic: { type: 'string' },
      pos: { type: 'string' },
      shortMeaning: { type: 'string' },
      alternatives: {
        type: 'array',
        items: { type: 'string' }
      },
      grammarNote: { type: 'string' }
    },
    required: [
      'translatedText',
      'detectedLang',
      'phonetic',
      'pos',
      'shortMeaning',
      'alternatives',
      'grammarNote'
    ]
  };

  return await callLLM({
    systemInstruction,
    userPrompt,
    jsonSchema
  });
}

/**
 * 5. Gợi ý từ tự động khi gõ vào thanh tìm kiếm (Autocomplete Suggestions)
 */
async function handleSuggestWords(payload) {
  const query = String(payload?.query || '').trim();
  if (!query || query.length < 1) {
    return { suggestions: [] };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(
      `https://api.datamuse.com/sug?s=${encodeURIComponent(query)}&max=8`,
      { signal: controller.signal }
    );
    clearTimeout(timer);

    if (!res.ok) return { suggestions: [] };
    const data = await res.json();
    const words = Array.isArray(data)
      ? data.map((item) => String(item.word || '').trim()).filter(Boolean)
      : [];
    return { suggestions: words };
  } catch (_) {
    return { suggestions: [] };
  }
}

/**
 * Nhận diện nhanh định dạng tiền tố API Key để báo ngay nếu người dùng chọn nhầm Nhà phát triển
 */
function detectKeyPrefixProvider(apiKey = '') {
  const k = String(apiKey || '').trim();
  if (k.startsWith('AIza')) return { id: 'gemini', name: 'Google Gemini' };
  if (k.startsWith('gsk_')) return { id: 'groq', name: 'Groq' };
  if (k.startsWith('sk-or-')) return { id: 'openrouter', name: 'OpenRouter' };
  if (k.startsWith('csk-')) return { id: 'cerebras', name: 'Cerebras' };
  return null;
}

/**
 * 6. TỰ ĐỘNG KIỂM TRA API KEY & TỰ ĐỘNG DÒ CHÍNH XÁC MODEL CHO KEY ĐÓ (Dưới 1.5 giây!)
 * Người dùng chỉ cần chọn Nhà phát triển (Gemini / Groq / OpenRouter / Cerebras) và dán API Key.
 * Hệ thống tự truy vấn danh sách Model của Key đó, chọn Model tốt nhất đang hoạt động và trả kết quả ngay!
 */
async function handleTestConnection(payload) {
  const { settings: savedSettings } = await getStorageState();
  const activeSettings = payload?.settings
    ? normalizeStoredSettings({ ...savedSettings, ...payload.settings })
    : savedSettings;

  const targetProvider = payload?.targetProvider || activeSettings.provider || 'gemini';
  const providerMeta = aiRouter.PROVIDERS.find((p) => p.id === targetProvider) || aiRouter.PROVIDERS[0];
  const apiKey = String(activeSettings[providerMeta.keyField] || '').trim();

  if (!apiKey) {
    const err = new Error(`Vui lòng dán API Key cho nhà phát triển ${providerMeta.name}.`);
    err.code = 'MISSING_KEY';
    throw err;
  }

  // 1. Kiểm tra nếu người dùng dán nhầm Key của hãng khác vào hãng đang chọn
  const prefixHint = detectKeyPrefixProvider(apiKey);
  if (prefixHint && prefixHint.id !== providerMeta.id) {
    const mismatchErr = new Error(
      `Phát hiện nhầm Nhà phát triển: Mã API Key bạn vừa dán có định dạng của "${prefixHint.name}", nhưng bạn đang chọn "${providerMeta.name}".\n👉 Hãy chuyển mục (1) sang "${prefixHint.name}" rồi bấm gắn lại!`
    );
    mismatchErr.code = 'PROVIDER_MISMATCH';
    throw mismatchErr;
  }

  // 2. Truy vấn trực tiếp danh sách Model mà API Key này được phép sử dụng (Timeout nhanh 5 giây)
  let discoveredModels = [];
  let keyVerifiedByModelsEndpoint = false;

  if (providerMeta.id === 'gemini') {
    const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithTimeout(modelsUrl, { method: 'GET' }, 5500);
    if (!res.ok) {
      let rawMsg = `HTTP ${res.status}`;
      try {
        const errData = await res.json();
        rawMsg = errData.error?.message || JSON.stringify(errData);
      } catch (_) {
        rawMsg = await res.text();
      }
      throw buildDetailedApiError(providerMeta.name, res.status, rawMsg, 'auto-detect');
    }

    const data = await res.json();
    keyVerifiedByModelsEndpoint = true;
    const rawList = Array.isArray(data?.models) ? data.models : [];
    discoveredModels = rawList
      .filter((m) => {
        const methods = m.supportedGenerationMethods || [];
        return methods.includes('generateContent');
      })
      .map((m) => {
        const id = String(m.name || '').replace(/^models\//, '').trim();
        const lower = id.toLowerCase();
        if (
          !id ||
          lower.includes('embedding') ||
          lower.includes('aqa') ||
          lower.includes('imagen') ||
          lower.includes('tts') ||
          lower.includes('whisper') ||
          lower.includes('veo') ||
          lower.includes('lyria') ||
          lower.includes('robotics') ||
          lower.includes('learnlm') ||
          lower.includes('bisheng')
        ) {
          return null;
        }
        return {
          id,
          name: m.displayName ? `${id} — ${m.displayName}` : id,
          badge: 'Key hỗ trợ'
        };
      })
      .filter(Boolean);
  } else if (providerMeta.id === 'groq' || providerMeta.id === 'cerebras') {
    const modelsUrl =
      providerMeta.id === 'groq'
        ? 'https://api.groq.com/openai/v1/models'
        : 'https://api.cerebras.ai/v1/models';
    const res = await fetchWithTimeout(
      modelsUrl,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` }
      },
      5500
    );

    if (!res.ok) {
      let rawMsg = `HTTP ${res.status}`;
      try {
        const errData = await res.json();
        rawMsg = errData.error?.message || JSON.stringify(errData);
      } catch (_) {
        rawMsg = await res.text();
      }
      throw buildDetailedApiError(providerMeta.name, res.status, rawMsg, 'auto-detect');
    }

    const data = await res.json();
    keyVerifiedByModelsEndpoint = true;
    const rawList = Array.isArray(data?.data) ? data.data : [];
    discoveredModels = rawList
      .filter((m) => m.active !== false)
      .map((m) => {
        const id = String(m.id || '').trim();
        const lower = id.toLowerCase();
        if (
          !id ||
          lower.includes('whisper') ||
          lower.includes('tts') ||
          lower.includes('guard') ||
          lower.includes('orpheus') ||
          lower.includes('playai')
        ) {
          return null;
        }
        return {
          id,
          name: `${id} — Đang hoạt động trên ${providerMeta.name}`,
          badge: 'Key hỗ trợ'
        };
      })
      .filter(Boolean);
  } else if (providerMeta.id === 'openrouter') {
    // Kiểm tra nhanh tính hợp lệ của OpenRouter API Key qua /api/v1/auth/key
    const authRes = await fetchWithTimeout(
      'https://openrouter.ai/api/v1/auth/key',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` }
      },
      5500
    );

    if (!authRes.ok) {
      let rawMsg = `HTTP ${authRes.status}`;
      try {
        const errData = await authRes.json();
        rawMsg = errData.error?.message || JSON.stringify(errData);
      } catch (_) {
        rawMsg = await authRes.text();
      }
      throw buildDetailedApiError(providerMeta.name, authRes.status, rawMsg, 'auto-detect');
    }

    keyVerifiedByModelsEndpoint = true;
    try {
      const modelsRes = await fetchWithTimeout(
        'https://openrouter.ai/api/v1/models',
        { headers: { Authorization: `Bearer ${apiKey}` } },
        4500
      );
      if (modelsRes.ok) {
        const modelsData = await modelsRes.json();
        const rawList = Array.isArray(modelsData?.data) ? modelsData.data : [];
        discoveredModels = rawList
          .map((m) => {
            const id = String(m.id || '').trim();
            if (!id) return null;
            const isFree =
              id.endsWith(':free') ||
              (Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0);
            return {
              id,
              name: m.name ? `${id} — ${m.name}` : id,
              badge: isFree ? 'Miễn phí' : 'Pro / Paid'
            };
          })
          .filter(Boolean);
      }
    } catch (_) {}
  }

  // 3. Tự động chọn Model tối ưu nhất nằm trong danh sách mà API Key này hỗ trợ
  const discoveredIds = new Set(discoveredModels.map((m) => m.id));
  const priorityList = providerMeta.priorityModels || [providerMeta.defaultModel];

  // Sắp xếp danh sách ứng viên để dò: ưu tiên các model chuẩn dịch thuật có trong tài khoản của người dùng
  const candidateModelsToProbe = [];
  for (const pm of priorityList) {
    if (discoveredIds.size === 0 || discoveredIds.has(pm)) {
      candidateModelsToProbe.push(pm);
    }
  }
  for (const dm of discoveredModels) {
    if (!candidateModelsToProbe.includes(dm.id)) {
      candidateModelsToProbe.push(dm.id);
    }
  }
  if (candidateModelsToProbe.length === 0) {
    candidateModelsToProbe.push(providerMeta.defaultModel);
  }

  // 4. Thử ping siêu nhẹ (timeout 3.5s) trên tối đa 2 model đầu tiên để chọn đúng model không bị 429
  let bestWorkingModel = candidateModelsToProbe[0];
  let rateLimitedDuringProbe = false;

  for (const testModel of candidateModelsToProbe.slice(0, 2)) {
    try {
      if (providerMeta.type === 'gemini-rest') {
        await aiRouter.callGeminiRest(providerMeta, activeSettings, {
          systemInstruction: 'Reply OK',
          userPrompt: 'OK',
          overrideModel: testModel,
          timeoutMs: 3800
        });
      } else {
        await aiRouter.callOpenAICompatible(providerMeta, activeSettings, {
          systemInstruction: 'Reply OK',
          userPrompt: 'OK',
          overrideModel: testModel,
          timeoutMs: 3800
        });
      }
      bestWorkingModel = testModel;
      rateLimitedDuringProbe = false;
      break;
    } catch (probeErr) {
      if (probeErr.code === 'INVALID_API_KEY') {
        throw probeErr;
      }
      if (probeErr.code === 'RATE_LIMIT' || probeErr.status === 429) {
        rateLimitedDuringProbe = true;
      }
    }
  }

  // Nếu cả endpoint /models lẫn probe đều chưa xác thực được thì báo lỗi
  if (!keyVerifiedByModelsEndpoint && !bestWorkingModel) {
    throw new Error(`Không thể xác thực API Key cho ${providerMeta.name}.`);
  }

  // 5. Tự động lưu ngay API Key và Model chính xác vừa phát hiện vào chrome.storage.local
  const updatedSettings = normalizeStoredSettings({
    ...savedSettings,
    ...activeSettings,
    provider: providerMeta.id,
    [providerMeta.keyField]: apiKey,
    [providerMeta.modelField]: bestWorkingModel
  });
  await chrome.storage.local.set({ settings: updatedSettings });

  return {
    ok: true,
    provider: providerMeta.name,
    providerId: providerMeta.id,
    model: bestWorkingModel,
    availableModels: discoveredModels,
    totalModels: discoveredModels.length,
    rateLimited: rateLimitedDuringProbe
  };
}

/**
 * 7. Mở trình đọc & dịch PDF chuyên dụng của Lexis (pdf-reader.html)
 */
async function handleOpenPdfReader(payload) {
  const { pdfUrl = '', autoTranslate = false } = payload || {};
  const params = new URLSearchParams();
  if (pdfUrl) params.set('url', pdfUrl);
  if (autoTranslate) params.set('auto', '1');

  const readerUrl = chrome.runtime.getURL(
    `pdf-reader.html${params.toString() ? `?${params.toString()}` : ''}`
  );
  const tab = await chrome.tabs.create({ url: readerUrl });
  return { tabId: tab?.id, url: readerUrl };
}

/**
 * 8. Tải dữ liệu nhị phân PDF từ URL bên ngoài dưới dạng Base64 (vượt rào cản CORS)
 */
async function handleFetchPdfBase64(payload) {
  const url = String(payload?.url || '').trim();
  if (!url) throw new Error('Không có đường dẫn URL của file PDF.');

  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Không thể tải file PDF từ máy chủ (HTTP ${res.status}). Hãy tải file về máy và chọn "Tải file PDF từ máy".`);
  }

  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return {
    base64: btoa(binary),
    byteLength: bytes.byteLength
  };
}

/**
 * 9. Dịch trang PDF dạng ảnh quét (Scanned PDF / Image OCR + Translation) bằng AI Vision (1 Request / Trang)
 */
async function handleTranslatePdfVisionPage(payload) {
  const { base64Data = '', mimeType = 'image/jpeg', pageNumber = 1, displayMode = 'bilingual' } = payload || {};
  if (!base64Data) {
    throw new Error('Không có dữ liệu hình ảnh trang PDF để phân tích.');
  }

  const { learnedWords } = await getStorageState();
  const learnedSet = learnedWords.map((w) => w.word).filter(Boolean);
  const keepList = learnedSet.length > 0 ? learnedSet.join(', ') : '(Không có)';

  const isWbw = displayMode === 'word_by_word';

  const systemInstruction = `Bạn là chuyên gia OCR và biên dịch tài liệu PDF học thuật/chuyên ngành sang tiếng Việt.
Nhiệm vụ của bạn là đọc toàn bộ văn bản trong hình ảnh trang PDF (Trang ${pageNumber}), gom các dòng bị ngắt thành từng đoạn văn hoàn chỉnh theo đúng thứ tự đọc (trái sang phải, trên xuống dưới, xử lý đúng bố cục 1 cột hoặc 2 cột), sau đó dịch sang tiếng Việt.

QUY TẮC BẮT BUỘC:
1. Trả về JSON chính xác theo cấu trúc {"blocks": [{"original": "...", "translated": "...", "wbw": "..."}]}.
2. Trường "original": Văn bản gốc trích xuất chuẩn xác của đoạn văn đó (đã nối các từ bị gạch nối ngắt dòng).
3. Trường "translated": Bản dịch tiếng Việt mượt mà, tự nhiên, chuẩn thuật ngữ.
4. VỚI CÁC TỪ ĐÃ HỌC SAU ĐÂY (${keepList}): Giữ nguyên từ ngoại ngữ đó trong câu dịch tiếng Việt, không dịch sang tiếng Việt.
5. Trường "wbw": ${
    isWbw
      ? 'Phân tách câu gốc thành từng từ/cụm ngắn kèm nghĩa trong ngoặc vuông dạng từ_gốc[nghĩa_ngắn] (ví dụ: She[Cô ấy] read[đã đọc] a[một] book[cuốn sách]).'
      : 'Để chuỗi rỗng "".'
  }`;

  const userPrompt = `Hãy trích xuất văn bản và dịch Trang ${pageNumber} của tài liệu PDF này. Trả về JSON theo đúng schema.`;

  const jsonSchema = {
    type: 'object',
    properties: {
      blocks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            original: { type: 'string' },
            translated: { type: 'string' },
            wbw: { type: 'string' }
          },
          required: ['original', 'translated', 'wbw']
        }
      }
    },
    required: ['blocks']
  };

  return await callLLM({
    systemInstruction,
    userPrompt,
    jsonSchema,
    imageInput: { base64Data, mimeType }
  });
}

/**
 * 10. Lấy danh sách toàn bộ các Model đang được hỗ trợ trực tiếp từ máy chủ của nhà cung cấp
 */
async function handleFetchProviderModels(payload) {
  const { settings } = await getStorageState();
  const providerId = payload?.provider || settings.provider || 'gemini';
  const apiKey = String(payload?.apiKey || settings[`${providerId}ApiKey`] || '').trim();

  if (providerId === 'openrouter') {
    const headers = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const res = await fetch('https://openrouter.ai/api/v1/models', { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : [];
    const models = list
      .map((m) => {
        const id = String(m.id || '').trim();
        if (!id) return null;
        const isFree = id.endsWith(':free') || (Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0);
        return {
          id,
          name: m.name || id,
          badge: isFree ? 'Miễn phí' : 'Hỗ trợ (Pro/Paid)'
        };
      })
      .filter(Boolean);
    return { provider: providerId, models };
  }

  if (providerId === 'gemini') {
    if (!apiKey) return { provider: providerId, models: [] };
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${encodeURIComponent(apiKey)}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data?.models) ? data.models : [];
    const models = list
      .filter((m) => {
        const methods = m.supportedGenerationMethods || [];
        return (
          methods.length === 0 ||
          methods.includes('generateContent') ||
          methods.includes('createInteraction')
        );
      })
      .map((m) => {
        const id = String(m.name || '').replace(/^models\//, '').trim();
        if (!id || id.includes('embedding') || id.includes('aqa') || id.includes('imagen')) return null;
        return {
          id,
          name: m.displayName ? `${id} — ${m.displayName}` : id,
          badge: 'Đang hỗ trợ'
        };
      })
      .filter(Boolean);
    return { provider: providerId, models };
  }

  if (providerId === 'groq' || providerId === 'cerebras') {
    if (!apiKey) return { provider: providerId, models: [] };
    const endpoint =
      providerId === 'groq'
        ? 'https://api.groq.com/openai/v1/models'
        : 'https://api.cerebras.ai/v1/models';
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data?.data) ? data.data : [];
    const models = list
      .filter((m) => m.active !== false)
      .map((m) => {
        const id = String(m.id || '').trim();
        if (!id || id.includes('whisper') || id.includes('tts') || id.includes('guard')) return null;
        return {
          id,
          name: id,
          badge: 'Đang hỗ trợ'
        };
      })
      .filter(Boolean);
    return { provider: providerId, models };
  }

  return { provider: providerId, models: [] };
}
