/**
 * ============================================================================
 * Lexis — Background Service Worker (Manifest V3)
 * ============================================================================
 * 1. Gọi API dịch thuật (Đoạn văn ngữ cảnh, Song ngữ, Dịch từng từ Word-by-Word)
 *    và mổ xẻ ngữ pháp qua Google Gemini / Groq / OpenAI.
 * 2. Phân tích và trả về thông báo lỗi chuẩn xác khi sai API Key, sai Model,
 *    hoặc vượt hạn mức (Quota/Rate Limit).
 */

const DEFAULT_SETTINGS = {
  provider: 'gemini',              // 'gemini' | 'groq' | 'openai'
  geminiApiKey: '',
  groqApiKey: '',
  openaiApiKey: '',
  geminiModel: 'gemini-3.8-flash',
  groqModel: 'llama-3.3-70b-versatile',
  openaiModel: 'gpt-4o-mini',
  autoTranslate: false,
  displayMode: 'bilingual'         // 'bilingual' (Song ngữ bên dưới) | 'word_by_word' (Dịch từng từ) | 'replace' (Thay thế)
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

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(['settings', 'learned_words']);

  if (!stored.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  } else {
    await chrome.storage.local.set({
      settings: { ...DEFAULT_SETTINGS, ...stored.settings }
    });
  }

  if (!Array.isArray(stored.learned_words)) {
    await chrome.storage.local.set({ learned_words: DEFAULT_LEARNED_WORDS });
  }
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

    default:
      return false;
  }
});

async function getStorageState() {
  const data = await chrome.storage.local.get(['settings', 'learned_words']);
  return {
    settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
    learnedWords: Array.isArray(data.learned_words) ? data.learned_words : []
  };
}

/**
 * Chuẩn hóa thông báo lỗi chi tiết để người dùng biết chính xác:
 * Sai API Key, Sai tên Model, hay Hết hạn mức (Quota).
 */
function buildDetailedApiError(providerName, status, rawMessage, modelName) {
  const lower = String(rawMessage || '').toLowerCase();
  let errorTitle = `Lỗi ${providerName} API (HTTP ${status})`;
  let code = 'API_ERROR';

  if (
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
    errorTitle = `Sai Model (${modelName}): Model này không tồn tại, đã ngừng hỗ trợ hoặc tài khoản của bạn chưa được cấp quyền dùng model này.`;
  } else if (status === 429 || lower.includes('quota') || lower.includes('rate limit') || lower.includes('resource_exhausted')) {
    code = 'RATE_LIMIT';
    errorTitle = `Vượt giới hạn gọi API (HTTP 429): Tài khoản ${providerName} đã hết hạn mức (Quota) hoặc gửi quá nhanh.`;
  } else if (status === 400) {
    code = 'BAD_REQUEST';
    errorTitle = `Yêu cầu không hợp lệ (${providerName} - Model: ${modelName}): Kiểm tra lại API Key hoặc tên Model.`;
  }

  const err = new Error(`${errorTitle}\nChi tiết từ máy chủ: ${rawMessage}`);
  err.code = code;
  return err;
}

function extractGeminiOutputText(data) {
  if (!data) throw new Error('Phản hồi từ Gemini API rỗng.');

  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (Array.isArray(data.steps)) {
    const chunks = [];
    for (const step of data.steps) {
      if (step.type === 'model_output' && Array.isArray(step.content)) {
        for (const part of step.content) {
          if (part.type === 'text' && typeof part.text === 'string') {
            chunks.push(part.text);
          }
        }
      }
    }
    if (chunks.length > 0) return chunks.join('\n').trim();
  }

  throw new Error('Không tìm thấy dữ liệu văn bản hợp lệ từ Gemini API.');
}

function parseCleanJSON(raw) {
  const cleaned = String(raw || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

/**
 * Hàm gọi LLM thống nhất cho Gemini, Groq và OpenAI kèm bắt lỗi chi tiết
 */
async function callLLM({ systemInstruction, userPrompt, jsonSchema, overrideSettings = null }) {
  const { settings: savedSettings } = await getStorageState();
  const settings = overrideSettings ? { ...savedSettings, ...overrideSettings } : savedSettings;
  const provider = settings.provider || 'gemini';

  // 1. GOOGLE GEMINI API
  if (provider === 'gemini') {
    const apiKey = (settings.geminiApiKey || '').trim();
    if (!apiKey) {
      const err = new Error('Chưa đăng nhập Gemini API Key. Hãy mở tiện ích -> tab Cài đặt API để nhập Key.');
      err.code = 'MISSING_KEY';
      throw err;
    }

    const model = (settings.geminiModel || 'gemini-3.8-flash').trim();

    const body = {
      model,
      system_instruction: systemInstruction,
      input: userPrompt,
      store: false,
      generation_config: {
        temperature: 0.15
      }
    };

    if (jsonSchema) {
      body.response_format = {
        type: 'text',
        mime_type: 'application/json',
        schema: jsonSchema
      };
    }

    let response;
    try {
      response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
          'Api-Revision': '2026-05-20'
        },
        body: JSON.stringify(body)
      });
    } catch (networkErr) {
      throw new Error(`Lỗi kết nối mạng tới Gemini API: ${networkErr.message}`);
    }

    if (!response.ok) {
      let rawMsg = `HTTP ${response.status}`;
      try {
        const errData = await response.json();
        rawMsg = errData.error?.message || JSON.stringify(errData);
      } catch (_) {
        rawMsg = await response.text();
      }
      throw buildDetailedApiError('Google Gemini', response.status, rawMsg, model);
    }

    const data = await response.json();
    const text = extractGeminiOutputText(data);
    return jsonSchema ? parseCleanJSON(text) : text;
  }

  // 2. GROQ HOẶC OPENAI API
  const isGroq = provider === 'groq';
  const providerLabel = isGroq ? 'Groq' : 'OpenAI';
  const apiKey = isGroq
    ? (settings.groqApiKey || '').trim()
    : (settings.openaiApiKey || '').trim();

  if (!apiKey) {
    const err = new Error(`Chưa đăng nhập ${providerLabel} API Key. Hãy mở tiện ích -> tab Cài đặt API để nhập Key.`);
    err.code = 'MISSING_KEY';
    throw err;
  }

  const endpoint = isGroq
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';

  const model = isGroq
    ? (settings.groqModel || 'llama-3.3-70b-versatile').trim()
    : (settings.openaiModel || 'gpt-4o-mini').trim();

  const body = {
    model,
    temperature: 0.15,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: userPrompt }
    ]
  };

  if (jsonSchema) {
    body.response_format = { type: 'json_object' };
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });
  } catch (networkErr) {
    throw new Error(`Lỗi kết nối mạng tới ${providerLabel} API: ${networkErr.message}`);
  }

  if (!response.ok) {
    let rawMsg = `HTTP ${response.status}`;
    try {
      const errData = await response.json();
      rawMsg = errData.error?.message || JSON.stringify(errData);
    } catch (_) {
      rawMsg = await response.text();
    }
    throw buildDetailedApiError(providerLabel, response.status, rawMsg, model);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  if (!content) throw new Error(`Phản hồi từ ${providerLabel} API rỗng.`);
  return jsonSchema ? parseCleanJSON(content) : content;
}

/**
 * 1. Dịch ngữ cảnh toàn trang theo dạng Văn bản Hợp nhất (Document Text Format)
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
 * 2. Dịch từng từ / cụm từ theo ngữ cảnh (Word-by-Word Interlinear Mode)
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
 * Hỗ trợ dịch từ đơn, cụm từ, câu hoặc đoạn văn bất kỳ giữa các ngôn ngữ,
 * kèm phiên âm, từ loại, các nghĩa từ điển khác và gợi ý lưu từ.
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
 * 6. Kiểm tra kết nối API Key & Model thực tế
 */
async function handleTestConnection(payload) {
  const { settings: savedSettings } = await getStorageState();
  const activeSettings = payload?.settings ? { ...savedSettings, ...payload.settings } : savedSettings;
  const provider = activeSettings.provider || 'gemini';
  const model =
    provider === 'gemini'
      ? activeSettings.geminiModel
      : provider === 'groq'
      ? activeSettings.groqModel
      : activeSettings.openaiModel;

  await callLLM({
    systemInstruction: 'You are a connection verifier. Respond with JSON {"ok": true}.',
    userPrompt: 'Verify connection and return {"ok": true}',
    jsonSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' }
      },
      required: ['ok']
    },
    overrideSettings: activeSettings
  });

  return {
    ok: true,
    provider: provider.toUpperCase(),
    model
  };
}
