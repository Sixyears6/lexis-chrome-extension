/**
 * ============================================================================
 * Lexis PDF Studio — Core Engine (pdf-reader.js)
 * ============================================================================
 * 1. Trích xuất văn bản PDF thông minh (nhận diện bố cục 1 cột & 2 cột học thuật,
 *    tự động nối từ gạch ngang ngắt dòng, gộp dòng thành đoạn văn chuẩn ngữ cảnh).
 * 2. 3 chế độ xem trực quan:
 *    - Song song (Split View): Canvas PDF gốc + Khung đoạn văn dịch đồng bộ tọa độ
 *    - Đè lên PDF (Overlay View): Phủ bản dịch lên đúng vị trí đoạn văn trên PDF
 *    - Chế độ Đọc (Reader View): Đọc tài liệu tập trung như Notion / Medium
 * 3. Hỗ trợ PDF Scan / Ảnh chụp (AI Vision OCR + Translation).
 * 4. Tích hợp đầy đủ Sổ từ vựng (.lw-anchor giữ nguyên từ đã thuộc), Google Dịch
 *    và Mổ xẻ Ngữ pháp ngay khi bôi đen chữ trên PDF.
 */

(() => {
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
  }

  let settings = {
    provider: 'gemini',
    displayMode: 'bilingual' // 'bilingual' | 'word_by_word' | 'replace'
  };

  let learnedWords = [];
  let pdfDoc = null;
  let currentDocTitle = 'Tai-lieu-PDF';
  let currentScale = 1.2;
  let currentPageNum = 1;
  let totalPages = 0;

  // Lưu trạng thái từng trang: { pageNum, rendered, translating, translated, paragraphs: [...], isScanned }
  const pageStates = new Map();
  let isBatchTranslating = false;
  let stopBatchRequested = false;

  let activeSelection = { text: '', sentence: '' };
  let lastQuickResult = null;
  let toastTimer = null;
  let renderObserver = null;
  let autoTranslateObserver = null;

  // DOM Elements
  const docTitlePill = document.getElementById('doc-title-pill');
  const fileInputPdf = document.getElementById('file-input-pdf');
  const emptyDropzone = document.getElementById('empty-dropzone');
  const pagesListEl = document.getElementById('pages-list');
  const mainStageEl = document.getElementById('pdf-main-stage');

  const btnPrevPage = document.getElementById('btn-prev-page');
  const btnNextPage = document.getElementById('btn-next-page');
  const inputPageNum = document.getElementById('input-page-num');
  const labelTotalPages = document.getElementById('label-total-pages');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const labelZoomLevel = document.getElementById('label-zoom-level');

  const btnTranslatePage = document.getElementById('btn-translate-page');
  const btnTranslateAll = document.getElementById('btn-translate-all');
  const btnExportDoc = document.getElementById('btn-export-doc');
  const selectDisplayMode = document.getElementById('select-display-mode');
  const chkAutoScroll = document.getElementById('chk-auto-scroll-translate');

  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const tooltipEl = document.getElementById('pdf-tooltip');
  const selPillEl = document.getElementById('pdf-sel-pill');
  const toastEl = document.getElementById('pdf-toast');

  async function init() {
    await loadStorageState();
    bindToolbarEvents();
    bindSidebarEvents();
    bindSelectionAndTooltipEvents();
    renderVocabSidebar();

    // Kiểm tra xem có tham số ?url=... được truyền từ trang PDF gốc sang không
    const params = new URLSearchParams(window.location.search);
    const pdfUrl = params.get('url');
    const autoStart = params.get('auto') === '1';

    if (pdfUrl) {
      document.getElementById('input-pdf-url').value = pdfUrl;
      await loadPdfFromUrl(pdfUrl, autoStart);
    }
  }

  async function loadStorageState() {
    try {
      const data = await chrome.storage.local.get(['settings', 'learned_words']);
      if (data.settings) {
        settings = { ...settings, ...data.settings };
      }
      if (Array.isArray(data.learned_words)) {
        learnedWords = data.learned_words;
      }
      selectDisplayMode.value = settings.displayMode || 'bilingual';
      document.body.setAttribute('data-display-mode', selectDisplayMode.value);
    } catch (_) {}
  }

  function setStatus(message, isBusy = false) {
    if (statusText) statusText.textContent = message;
    if (statusDot) statusDot.classList.toggle('busy', Boolean(isBusy));
  }

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('is-visible');
    }, 8500);
  }

  // --------------------------------------------------------------------------
  // 1. NẠP TÀI LIỆU PDF (FILE MÁY TÍNH / KÉO THẢ / URL TRỰC TUYẾN)
  // --------------------------------------------------------------------------
  async function loadPdfFromFile(file) {
    if (!file) return;
    try {
      setStatus(`Đang đọc file "${file.name}"...`, true);
      currentDocTitle = file.name.replace(/\.pdf$/i, '') || 'Tai-lieu-PDF';
      docTitlePill.textContent = file.name;
      docTitlePill.title = file.name;

      const arrayBuffer = await file.arrayBuffer();
      await openPdfBuffer(new Uint8Array(arrayBuffer), true);
    } catch (err) {
      setStatus('Lỗi đọc file PDF', false);
      showToast(`Không thể mở file PDF: ${err.message}`);
    }
  }

  async function loadPdfFromUrl(url, autoTranslateFirstPage = false) {
    const cleanUrl = (url || '').trim();
    if (!cleanUrl) return;

    try {
      setStatus('Đang tải tài liệu PDF từ đường dẫn...', true);
      const urlFileName = decodeURIComponent(cleanUrl.split('/').pop().split('?')[0] || 'document.pdf');
      currentDocTitle = urlFileName.replace(/\.pdf$/i, '') || 'Tai-lieu-PDF';
      docTitlePill.textContent = urlFileName;
      docTitlePill.title = cleanUrl;

      let uint8 = null;

      // Thử tải trực tiếp trước
      try {
        const res = await fetch(cleanUrl);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          uint8 = new Uint8Array(buf);
        }
      } catch (_) {}

      // Nếu bị chặn CORS hoặc lỗi, nhờ Background Service Worker tải hộ
      if (!uint8) {
        const bgRes = await chrome.runtime.sendMessage({
          action: 'FETCH_PDF_BASE64',
          payload: { url: cleanUrl }
        });
        if (!bgRes || !bgRes.success || !bgRes.data?.base64) {
          throw new Error(
            bgRes?.error ||
              'Không thể tải trực tiếp URL này (có thể là đường dẫn nội bộ file://). Hãy bấm "Chọn file PDF từ máy tính".'
          );
        }
        const binaryStr = atob(bgRes.data.base64);
        uint8 = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          uint8[i] = binaryStr.charCodeAt(i);
        }
      }

      await openPdfBuffer(uint8, autoTranslateFirstPage);
    } catch (err) {
      setStatus('Không thể tải URL PDF', false);
      showToast(err.message);
    }
  }

  async function openPdfBuffer(uint8Array, autoTranslateFirstPage = false) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('Thư viện PDF.js chưa sẵn sàng.');
    }

    // Dọn dẹp tài liệu cũ nếu có
    if (pdfDoc) {
      try {
        await pdfDoc.destroy();
      } catch (_) {}
    }
    pageStates.clear();
    pagesListEl.innerHTML = '';

    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true
    });

    pdfDoc = await loadingTask.promise;
    totalPages = pdfDoc.numPages;
    currentPageNum = 1;

    emptyDropzone.style.display = 'none';
    pagesListEl.style.display = 'flex';

    // Bật các nút điều khiển
    btnPrevPage.disabled = false;
    btnNextPage.disabled = false;
    inputPageNum.disabled = false;
    inputPageNum.max = String(totalPages);
    inputPageNum.value = '1';
    labelTotalPages.textContent = `/ ${totalPages}`;
    btnZoomOut.disabled = false;
    btnZoomIn.disabled = false;
    btnTranslatePage.disabled = false;
    btnTranslateAll.disabled = false;
    btnExportDoc.disabled = false;

    // Tạo khung bộ khung (skeleton) cho tất cả các trang
    for (let p = 1; p <= totalPages; p++) {
      createPageSkeleton(p);
    }

    setupObservers();

    // Dựng ngay 2 trang đầu tiên để hiển thị tức thì
    for (let p = 1; p <= Math.min(2, totalPages); p++) {
      await ensurePageRendered(p);
    }

    setStatus(`Đã mở ${totalPages} trang PDF`, false);

    if (autoTranslateFirstPage || chkAutoScroll.checked) {
      translatePage(1);
    }
  }

  function createPageSkeleton(pageNum) {
    const row = document.createElement('section');
    row.className = 'pdf-page-row';
    row.id = `pdf-page-row-${pageNum}`;
    row.setAttribute('data-page', String(pageNum));

    row.innerHTML = `
      <header class="page-row-header">
        <div class="page-num-badge">
          <span>Trang ${pageNum} / ${totalPages}</span>
          <span class="page-meta-info" id="page-meta-${pageNum}">Đang chờ hiển thị...</span>
        </div>
        <div class="page-row-actions">
          <button class="btn btn-sm" id="btn-vision-${pageNum}" title="Dùng AI Vision quét ảnh & dịch trang này (Dành cho PDF Scan / Bảng biểu phức tạp)">
            🔍 Dịch ảnh Scan (AI Vision)
          </button>
          <button class="btn btn-sm btn-primary" id="btn-trans-p-${pageNum}">
            ✨ Dịch trang ${pageNum}
          </button>
        </div>
      </header>
      <div class="page-row-body">
        <div class="pdf-canvas-col">
          <div class="pdf-canvas-wrap" id="canvas-wrap-${pageNum}" style="min-width:420px;min-height:560px;">
            <canvas id="pdf-canvas-${pageNum}"></canvas>
            <div class="pdf-bbox-layer" id="bbox-layer-${pageNum}"></div>
            <div class="pdf-text-layer" id="text-layer-${pageNum}"></div>
            <div class="pdf-overlay-layer" id="overlay-layer-${pageNum}"></div>
          </div>
        </div>
        <div class="pdf-trans-col" id="trans-col-${pageNum}">
          <div class="pdf-para-card" style="color:#a1a1aa;">
            Cuộn tới trang ${pageNum} hoặc bấm <strong>"Dịch trang ${pageNum}"</strong> để trích xuất và dịch nội dung.
          </div>
        </div>
      </div>
    `;

    pagesListEl.appendChild(row);

    pageStates.set(pageNum, {
      pageNum,
      rendered: false,
      rendering: false,
      translating: false,
      translated: false,
      translatedMode: null,
      isScanned: false,
      paragraphs: []
    });

    row.querySelector(`#btn-trans-p-${pageNum}`).addEventListener('click', () => {
      translatePage(pageNum, true);
    });

    row.querySelector(`#btn-vision-${pageNum}`).addEventListener('click', () => {
      translatePageWithVision(pageNum);
    });
  }

  function setupObservers() {
    if (renderObserver) renderObserver.disconnect();
    if (autoTranslateObserver) autoTranslateObserver.disconnect();

    // 1. Observer dựng Canvas & trích xuất đoạn văn khi trang tới gần khung nhìn
    renderObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const p = parseInt(entry.target.getAttribute('data-page'), 10);
            if (p) ensurePageRendered(p);
          }
        });
      },
      { root: mainStageEl, rootMargin: '600px 0px' }
    );

    // 2. Observer cập nhật số trang hiện tại & tự động dịch khi cuộn
    autoTranslateObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
            const p = parseInt(entry.target.getAttribute('data-page'), 10);
            if (!p) return;
            currentPageNum = p;
            inputPageNum.value = String(p);

            if (chkAutoScroll.checked && !isBatchTranslating) {
              const st = pageStates.get(p);
              if (st && !st.translated && !st.translating) {
                translatePage(p, false);
              }
            }
          }
        });
      },
      { root: mainStageEl, threshold: [0.25, 0.6] }
    );

    document.querySelectorAll('.pdf-page-row').forEach((row) => {
      renderObserver.observe(row);
      autoTranslateObserver.observe(row);
    });
  }

  // --------------------------------------------------------------------------
  // 2. DỰNG CANVAS TRANG PDF & THUẬT TOÁN GOM ĐOẠN VĂN THÔNG MINH (1 CỘT & 2 CỘT)
  // --------------------------------------------------------------------------
  async function ensurePageRendered(pageNum, forceReRenderCanvas = false) {
    const state = pageStates.get(pageNum);
    if (!state || !pdfDoc) return;
    if (state.rendering) return;
    if (state.rendered && !forceReRenderCanvas) return;

    state.rendering = true;
    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: currentScale });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);

      const canvas = document.getElementById(`pdf-canvas-${pageNum}`);
      const wrap = document.getElementById(`canvas-wrap-${pageNum}`);
      const textLayerEl = document.getElementById(`text-layer-${pageNum}`);
      const bboxLayerEl = document.getElementById(`bbox-layer-${pageNum}`);

      if (!canvas || !wrap) return;

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      wrap.style.width = `${Math.floor(viewport.width)}px`;
      wrap.style.height = `${Math.floor(viewport.height)}px`;
      wrap.style.minWidth = '0';
      wrap.style.minHeight = '0';

      const ctx = canvas.getContext('2d');
      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

      await page.render({
        canvasContext: ctx,
        transform,
        viewport
      }).promise;

      const textContent = await page.getTextContent();

      // Dựng lớp văn bản bôi đen được (.pdf-text-layer)
      renderSelectableTextLayer(textLayerEl, textContent, viewport);

      // Chỉ trích xuất lại đoạn văn nếu chưa trích xuất trước đó
      if (!state.rendered) {
        const reconstructed = extractAndReconstructPageParagraphs(textContent, viewport);
        state.paragraphs = reconstructed;
        state.isScanned = reconstructed.length === 0;
        state.rendered = true;
      }

      renderBoundingBoxes(pageNum, state.paragraphs);
      renderPageParagraphCards(pageNum);
      renderOverlayLayer(pageNum);

      const metaEl = document.getElementById(`page-meta-${pageNum}`);
      if (metaEl) {
        metaEl.textContent = state.isScanned
          ? 'Trang ảnh Scan (Dùng AI Vision để dịch)'
          : `${state.paragraphs.length} đoạn văn`;
      }
    } catch (err) {
      console.error(`Lỗi dựng trang ${pageNum}:`, err);
    } finally {
      state.rendering = false;
    }
  }

  function renderSelectableTextLayer(container, textContent, viewport) {
    if (!container) return;
    container.innerHTML = '';

    const frag = document.createDocumentFragment();
    for (const item of textContent.items) {
      if (!item.str || !item.str.trim()) continue;
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.hypot(tx[2], tx[3]);
      if (fontHeight < 4) continue;

      const span = document.createElement('span');
      span.textContent = item.str;
      span.style.left = `${tx[4]}px`;
      span.style.top = `${tx[5] - fontHeight * 0.88}px`;
      span.style.fontSize = `${fontHeight}px`;
      span.style.fontFamily = 'sans-serif';
      frag.appendChild(span);
    }
    container.appendChild(frag);
  }

  /**
   * THUẬT TOÁN TRÍCH XUẤT & GOM ĐOẠN VĂN PDF CHUẨN XÁC:
   * - Nhận diện bố cục 1 cột hoặc 2 cột (bài báo khoa học IEEE, arXiv, sách giáo trình)
   * - Loại bỏ số trang rời rạc ở đầu/cuối trang
   * - Nối tự động các từ bị gạch nối ngắt dòng (hyphenation: "inter-\nnational" -> "international")
   * - Tính toán khung tọa độ (Bounding Box %) của từng đoạn văn để đồng bộ với bản gốc
   */
  function extractAndReconstructPageParagraphs(textContent, viewport) {
    const pageW = viewport.width || 1;
    const pageH = viewport.height || 1;

    const rawItems = [];
    for (const item of textContent.items) {
      const str = String(item.str || '');
      if (!str.trim()) continue;

      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontH = Math.max(6, Math.hypot(tx[2], tx[3]));
      const x = tx[4];
      const y = tx[5] - fontH * 0.85;
      const w = Math.max(fontH * 0.4, (item.width || 0) * viewport.scale);
      const h = fontH * 1.15;

      // Bỏ qua các chữ nằm ngoài lề trang
      if (y < 0 || y > pageH || x < -20 || x > pageW + 20) continue;

      rawItems.push({
        str,
        x,
        y,
        right: x + w,
        bottom: y + h,
        w,
        h,
        fontSize: fontH
      });
    }

    if (rawItems.length === 0) return [];

    // Bước 1: Sắp xếp theo trục Y từ trên xuống, sau đó theo X từ trái sang phải
    rawItems.sort((a, b) => (Math.abs(a.y - b.y) <= Math.min(a.fontSize, b.fontSize) * 0.45 ? a.x - b.x : a.y - b.y));

    // Bước 2: Gom các mảnh chữ trên cùng 1 dòng ngang, NHƯNG tách riêng nếu có khoảng trống cột lớn
    const rawSameYGroups = [];
    for (const it of rawItems) {
      const lastGroup = rawSameYGroups[rawSameYGroups.length - 1];
      if (
        lastGroup &&
        Math.abs(it.y - lastGroup.avgY) <= Math.min(it.fontSize, lastGroup.avgFont) * 0.52
      ) {
        lastGroup.items.push(it);
        const n = lastGroup.items.length;
        lastGroup.avgY = (lastGroup.avgY * (n - 1) + it.y) / n;
        lastGroup.avgFont = (lastGroup.avgFont * (n - 1) + it.fontSize) / n;
      } else {
        rawSameYGroups.push({
          avgY: it.y,
          avgFont: it.fontSize,
          items: [it]
        });
      }
    }

    const lines = [];
    for (const grp of rawSameYGroups) {
      grp.items.sort((a, b) => a.x - b.x);
      let currentLineItems = [grp.items[0]];

      for (let i = 1; i < grp.items.length; i++) {
        const prev = grp.items[i - 1];
        const curr = grp.items[i];
        const gap = curr.x - prev.right;
        const avgFont = (prev.fontSize + curr.fontSize) / 2;

        // Nếu khoảng cách ngang lớn hơn 2.4 lần cỡ chữ (ví dụ khoảng trống giữa 2 cột hoặc bảng), tách thành dòng độc lập
        if (gap > Math.max(avgFont * 2.4, pageW * 0.045)) {
          lines.push(buildLineObject(currentLineItems, pageW, pageH));
          currentLineItems = [curr];
        } else {
          currentLineItems.push(curr);
        }
      }
      if (currentLineItems.length > 0) {
        lines.push(buildLineObject(currentLineItems, pageW, pageH));
      }
    }

    // Lọc bỏ số trang đơn lẻ ở mép trên cùng / dưới cùng
    const filteredLines = lines.filter((ln) => {
      const txt = ln.text.trim();
      if (!txt) return false;
      const isTopOrBottomMargin = ln.topPct < 4.5 || ln.topPct > 93.5;
      if (isTopOrBottomMargin && (/^\d{1,4}$/.test(txt) || /^page\s+\d+/i.test(txt))) {
        return false;
      }
      return true;
    });

    if (filteredLines.length === 0) return [];

    // Bước 3: Phát hiện và sắp xếp theo thứ tự đọc (Hỗ trợ cả 1 cột & 2 cột học thuật)
    const orderedStreams = segmentLinesIntoReadingStreams(filteredLines, pageW);

    // Bước 4: Gộp các dòng trong từng luồng cột thành đoạn văn hoàn chỉnh
    const paragraphs = [];
    let paraIndex = 1;

    for (const streamLines of orderedStreams) {
      const merged = mergeStreamLinesIntoParagraphs(streamLines, pageW, pageH);
      for (const p of merged) {
        if (p.text.length < 2) continue;
        // Bỏ qua chuỗi chỉ toàn số hoặc ký hiệu rời rạc
        if (!/[\p{L}]/u.test(p.text)) continue;

        paragraphs.push({
          id: `p-${paraIndex++}`,
          text: p.text,
          isHeading: p.isHeading,
          leftPct: p.leftPct,
          topPct: p.topPct,
          widthPct: p.widthPct,
          heightPct: p.heightPct,
          fontSize: p.fontSize,
          translatedText: null,
          wbwText: null
        });
      }
    }

    return paragraphs;
  }

  function buildLineObject(items, pageW, pageH) {
    let text = '';
    let minX = Infinity;
    let minY = Infinity;
    let maxRight = -Infinity;
    let maxBottom = -Infinity;
    let fontSum = 0;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (i > 0) {
        const prev = items[i - 1];
        const gap = it.x - prev.right;
        const spaceThreshold = Math.min(prev.fontSize, it.fontSize) * 0.16;
        if (gap > spaceThreshold && !text.endsWith(' ') && !it.str.startsWith(' ')) {
          text += ' ';
        }
      }
      text += it.str;
      minX = Math.min(minX, it.x);
      minY = Math.min(minY, it.y);
      maxRight = Math.max(maxRight, it.right);
      maxBottom = Math.max(maxBottom, it.bottom);
      fontSum += it.fontSize;
    }

    const avgFont = fontSum / items.length;
    return {
      text: text.replace(/\s+/g, ' ').trim(),
      x: minX,
      y: minY,
      right: maxRight,
      bottom: maxBottom,
      w: Math.max(8, maxRight - minX),
      h: Math.max(avgFont, maxBottom - minY),
      fontSize: avgFont,
      leftPct: Math.max(0, (minX / pageW) * 100),
      topPct: Math.max(0, (minY / pageH) * 100)
    };
  }

  /**
   * Nhận diện bố cục 1 cột hoặc 2 cột:
   * Các dòng trải rộng qua tâm trang (tiêu đề, abstract rộng) sẽ ngắt phân vùng;
   * giữa các phân vùng đó, gom cột trái đọc trước, cột phải đọc sau.
   */
  function segmentLinesIntoReadingStreams(lines, pageW) {
    const midX = pageW * 0.5;
    const leftBound = pageW * 0.53;
    const rightBound = pageW * 0.47;

    // Kiểm tra xem trang này có thực sự là bố cục 2 cột không
    let leftCount = 0;
    let rightCount = 0;
    for (const ln of lines) {
      if (ln.right <= leftBound && ln.w < pageW * 0.48) leftCount++;
      else if (ln.x >= rightBound && ln.w < pageW * 0.48) rightCount++;
    }

    const isTwoColumnPage = leftCount >= 5 && rightCount >= 5;
    if (!isTwoColumnPage) {
      lines.sort((a, b) => a.y - b.y);
      return [lines];
    }

    // Nếu là trang 2 cột, chia thành các dải theo chiều dọc khi gặp dòng toàn trang (full-width)
    const sortedByY = [...lines].sort((a, b) => a.y - b.y);
    const streams = [];
    let currentLeftCol = [];
    let currentRightCol = [];

    const flushColumns = () => {
      if (currentLeftCol.length > 0) {
        currentLeftCol.sort((a, b) => a.y - b.y);
        streams.push(currentLeftCol);
        currentLeftCol = [];
      }
      if (currentRightCol.length > 0) {
        currentRightCol.sort((a, b) => a.y - b.y);
        streams.push(currentRightCol);
        currentRightCol = [];
      }
    };

    for (const ln of sortedByY) {
      const spansCenter = ln.x < pageW * 0.38 && ln.right > pageW * 0.62;
      if (spansCenter) {
        flushColumns();
        streams.push([ln]);
      } else if (ln.x + ln.w * 0.5 <= midX) {
        currentLeftCol.push(ln);
      } else {
        currentRightCol.push(ln);
      }
    }
    flushColumns();
    return streams;
  }

  /**
   * Gộp các dòng liên tiếp trong cùng 1 cột thành đoạn văn hoàn chỉnh,
   * đồng thời nối các từ bị gạch nối ở cuối dòng.
   */
  function mergeStreamLinesIntoParagraphs(streamLines, pageW, pageH) {
    if (!streamLines || streamLines.length === 0) return [];

    const medianFont =
      [...streamLines].map((l) => l.fontSize).sort((a, b) => a - b)[Math.floor(streamLines.length / 2)] || 12;

    const blocks = [];
    let cur = null;

    for (let i = 0; i < streamLines.length; i++) {
      const ln = streamLines[i];
      const isHeadingLine = ln.fontSize >= medianFont * 1.18 && ln.text.length < 140;

      if (!cur) {
        cur = {
          text: ln.text,
          x: ln.x,
          y: ln.y,
          right: ln.right,
          bottom: ln.bottom,
          fontSize: ln.fontSize,
          lastLine: ln,
          isHeading: isHeadingLine
        };
        continue;
      }

      const prevLn = cur.lastLine;
      const verticalGap = ln.y - prevLn.bottom;
      const avgFont = (prevLn.fontSize + ln.fontSize) / 2;
      const fontDiff = Math.abs(prevLn.fontSize - ln.fontSize);

      // Các dấu hiệu bắt đầu đoạn văn mới:
      // 1. Khoảng cách dọc lớn hơn 0.85 lần chiều cao chữ
      // 2. Chênh lệch cỡ chữ (tiêu đề -> nội dung)
      // 3. Dòng mới là gạch đầu dòng / đánh số mục (•, -, 1., (a))
      // 4. Dòng trước kết thúc bằng dấu chấm câu VÀ ngắn hơn hẳn chiều rộng đoạn văn
      const isBulletStart = /^([•●▪◦\-–—*]|\d+\.|[A-Z]\.|(\[\d+\]))\s+/.test(ln.text);
      const prevEndsSentence = /[.!?:;。！？]$/.test(prevLn.text);
      const prevLineIsShort = prevLn.right < cur.right - avgFont * 3.5;

      const shouldSplit =
        verticalGap > avgFont * 0.92 ||
        fontDiff > 1.6 ||
        cur.isHeading !== isHeadingLine ||
        isBulletStart ||
        (prevEndsSentence && prevLineIsShort);

      if (shouldSplit) {
        blocks.push(finalizeParagraphBlock(cur, pageW, pageH));
        cur = {
          text: ln.text,
          x: ln.x,
          y: ln.y,
          right: ln.right,
          bottom: ln.bottom,
          fontSize: ln.fontSize,
          lastLine: ln,
          isHeading: isHeadingLine
        };
      } else {
        // Nối từ bị gạch ngang ngắt dòng (ví dụ: "con-" + "textual" -> "contextual")
        if (/[\p{L}]-\s*$/u.test(cur.text) && /^[\p{Ll}]/u.test(ln.text)) {
          cur.text = cur.text.replace(/-\s*$/, '') + ln.text;
        } else {
          cur.text += ' ' + ln.text;
        }
        cur.x = Math.min(cur.x, ln.x);
        cur.y = Math.min(cur.y, ln.y);
        cur.right = Math.max(cur.right, ln.right);
        cur.bottom = Math.max(cur.bottom, ln.bottom);
        cur.lastLine = ln;
      }
    }

    if (cur) {
      blocks.push(finalizeParagraphBlock(cur, pageW, pageH));
    }

    return blocks;
  }

  function finalizeParagraphBlock(block, pageW, pageH) {
    const pad = 2;
    const x = Math.max(0, block.x - pad);
    const y = Math.max(0, block.y - pad);
    const w = Math.min(pageW - x, block.right - block.x + pad * 2);
    const h = Math.min(pageH - y, block.bottom - block.y + pad * 2);

    return {
      text: block.text.replace(/\s+/g, ' ').trim(),
      isHeading: block.isHeading,
      fontSize: block.fontSize,
      leftPct: (x / pageW) * 100,
      topPct: (y / pageH) * 100,
      widthPct: (w / pageW) * 100,
      heightPct: (h / pageH) * 100
    };
  }

  // --------------------------------------------------------------------------
  // 3. HIỂN THỊ KHUNG ĐOẠN VĂN, ĐỒNG BỘ TỌA ĐỘ & OVERLAY LÊN PDF
  // --------------------------------------------------------------------------
  function renderBoundingBoxes(pageNum, paragraphs) {
    const bboxLayer = document.getElementById(`bbox-layer-${pageNum}`);
    if (!bboxLayer) return;
    bboxLayer.innerHTML = '';

    for (const para of paragraphs) {
      const box = document.createElement('div');
      box.className = 'pdf-bbox-rect';
      box.id = `bbox-${pageNum}-${para.id}`;
      box.style.left = `${para.leftPct.toFixed(2)}%`;
      box.style.top = `${para.topPct.toFixed(2)}%`;
      box.style.width = `${para.widthPct.toFixed(2)}%`;
      box.style.height = `${para.heightPct.toFixed(2)}%`;
      bboxLayer.appendChild(box);
    }
  }

  function renderPageParagraphCards(pageNum) {
    const state = pageStates.get(pageNum);
    const container = document.getElementById(`trans-col-${pageNum}`);
    if (!state || !container) return;

    container.innerHTML = '';

    if (state.isScanned && state.paragraphs.length === 0) {
      const banner = document.createElement('div');
      banner.className = 'scanned-page-banner';
      banner.innerHTML = `
        <h4>🔍 Phát hiện trang PDF dạng ảnh quét (Scanned PDF)</h4>
        <p>
          Trang này không chứa lớp văn bản có sẵn. Bạn có thể sử dụng công nghệ <strong>AI Vision</strong> của Lexis để nhận diện chữ (OCR), gom đoạn và dịch toàn bộ trang này sang tiếng Việt.
        </p>
        <button class="btn btn-primary" id="btn-scan-cta-${pageNum}">
          ✨ Quét OCR &amp; Dịch trang ${pageNum} bằng AI Vision
        </button>
      `;
      container.appendChild(banner);
      banner.querySelector(`#btn-scan-cta-${pageNum}`).addEventListener('click', () => {
        translatePageWithVision(pageNum);
      });
      return;
    }

    const mode = settings.displayMode || 'bilingual';

    for (const para of state.paragraphs) {
      const card = document.createElement('div');
      card.className = `pdf-para-card ${para.isHeading ? 'is-heading' : ''} ${
        para.translatedText || para.wbwText ? 'has-translation' : ''
      }`;
      card.id = `card-${pageNum}-${para.id}`;
      card.setAttribute('data-para-id', para.id);

      const origDiv = document.createElement('div');
      origDiv.className = 'para-orig';

      if (mode === 'word_by_word' && para.wbwText) {
        origDiv.appendChild(createWordByWordFragment(para.wbwText));
      } else {
        origDiv.appendChild(createFragmentWithLearnedAnchors(para.text));
      }
      card.appendChild(origDiv);

      if (mode !== 'word_by_word') {
        if (para.translatedText) {
          const transDiv = document.createElement('div');
          transDiv.className = 'para-trans';
          transDiv.appendChild(createFragmentWithLearnedAnchors(para.translatedText));
          card.appendChild(transDiv);
        } else if (state.translating) {
          const loadingDiv = document.createElement('div');
          loadingDiv.className = 'para-trans is-loading';
          loadingDiv.textContent = 'Đang dịch đoạn văn theo ngữ cảnh...';
          card.appendChild(loadingDiv);
        }
      }

      // Đồng bộ Hover giữa thẻ đoạn văn bên phải và khung tọa độ trên trang PDF bên trái
      card.addEventListener('mouseenter', () => {
        card.classList.add('is-active');
        document.getElementById(`bbox-${pageNum}-${para.id}`)?.classList.add('is-active');
      });
      card.addEventListener('mouseleave', () => {
        card.classList.remove('is-active');
        document.getElementById(`bbox-${pageNum}-${para.id}`)?.classList.remove('is-active');
      });

      container.appendChild(card);
    }
  }

  /**
   * Dựng lớp phủ bản dịch trực tiếp lên tọa độ trang PDF (Chế độ "Đè lên PDF")
   */
  function renderOverlayLayer(pageNum) {
    const state = pageStates.get(pageNum);
    const overlayLayer = document.getElementById(`overlay-layer-${pageNum}`);
    if (!state || !overlayLayer) return;

    overlayLayer.innerHTML = '';
    const mode = settings.displayMode || 'bilingual';

    for (const para of state.paragraphs) {
      if (!para.translatedText && !para.wbwText) continue;
      if (para.leftPct === undefined || para.widthPct <= 0) continue;

      const block = document.createElement('div');
      block.className = 'pdf-overlay-block';
      block.style.left = `${para.leftPct.toFixed(2)}%`;
      block.style.top = `${para.topPct.toFixed(2)}%`;
      block.style.width = `${para.widthPct.toFixed(2)}%`;
      block.style.minHeight = `${para.heightPct.toFixed(2)}%`;
      block.style.maxHeight = `${Math.min(98 - para.topPct, Math.max(para.heightPct * 1.45, 8)).toFixed(2)}%`;

      const scaledFont = Math.max(9.5, Math.min(18, (para.fontSize || 12) * 0.86));
      block.style.fontSize = `${scaledFont.toFixed(1)}px`;
      if (para.isHeading) block.style.fontWeight = '700';

      if (mode === 'word_by_word' && para.wbwText) {
        block.appendChild(createWordByWordFragment(para.wbwText));
      } else if (para.translatedText) {
        block.appendChild(createFragmentWithLearnedAnchors(para.translatedText));
      }

      overlayLayer.appendChild(block);
    }
  }

  // --------------------------------------------------------------------------
  // 4. DỊCH TRANG PDF (DỊCH VĂN BẢN THÔNG MINH & DỊCH AI VISION CHO TRANG SCAN)
  // --------------------------------------------------------------------------
  async function translatePage(pageNum, forceRetranslate = false) {
    await ensurePageRendered(pageNum);
    const state = pageStates.get(pageNum);
    if (!state || state.translating) return;

    const activeMode = settings.displayMode || 'bilingual';
    const isWbw = activeMode === 'word_by_word';

    // Nếu trang này là trang Scan ảnh chưa có văn bản, chuyển sang AI Vision tự động
    if (state.isScanned && state.paragraphs.length === 0) {
      await translatePageWithVision(pageNum);
      return;
    }

    if (
      !forceRetranslate &&
      state.translated &&
      state.translatedMode === activeMode
    ) {
      return;
    }

    const btnPage = document.getElementById(`btn-trans-p-${pageNum}`);
    state.translating = true;
    if (btnPage) {
      btnPage.disabled = true;
      btnPage.textContent = 'Đang dịch...';
    }
    setStatus(`Đang dịch Trang ${pageNum}/${totalPages}...`, true);
    renderPageParagraphCards(pageNum);

    try {
      const paras = state.paragraphs;
      if (paras.length === 0) {
        state.translated = true;
        return;
      }

      // TỐI ƯU HẠN MỨC (RATE LIMIT): Gom TOÀN BỘ các đoạn văn trong 1 trang vào DUY NHẤT 1 request
      // Không chia nhỏ chunk 18 hay 30 nữa, giảm số request tới 80-90%
      const docText = paras.map((p, idx) => `[[[${idx + 1}]]]\n${p.text}`).join('\n\n');

      const res = await chrome.runtime.sendMessage({
        action: isWbw ? 'TRANSLATE_WORD_BY_WORD' : 'TRANSLATE_BATCH',
        payload: {
          pageTitle: `${currentDocTitle} - Trang ${pageNum}`,
          documentText: docText,
          totalCount: paras.length
        }
      });

      if (!res || !res.success) {
        throw new Error(res?.error || 'Lỗi khi gọi API dịch trang PDF.');
      }

      const rawOutput = isWbw
        ? res.data?.wordByWordDocument || ''
        : res.data?.translatedDocument || '';

      const blockRegex = /\[\[\[\s*(\d+)\s*\]\]\]\s*([\s\S]*?)(?=(?:\[\[\[\s*\d+\s*\]\]\]|$))/g;
      let match;
      let count = 0;

      while ((match = blockRegex.exec(rawOutput)) !== null) {
        const idx = parseInt(match[1], 10) - 1;
        const text = match[2].trim();
        if (paras[idx] && text) {
          if (isWbw) {
            paras[idx].wbwText = text;
          } else {
            paras[idx].translatedText = text;
          }
          count++;
        }
      }

      // Fallback nếu mô hình không trả thẻ [[[ID]]]
      if (count === 0 && rawOutput.trim()) {
        const splitParas = rawOutput.split(/\n\s*\n/).filter((x) => x.trim());
        paras.forEach((item, idx) => {
          if (splitParas[idx]) {
            if (isWbw) item.wbwText = splitParas[idx].trim();
            else item.translatedText = splitParas[idx].trim();
          }
        });
      }

      renderPageParagraphCards(pageNum);
      renderOverlayLayer(pageNum);

      state.translated = true;
      state.translatedMode = activeMode;
      if (btnPage) {
        btnPage.textContent = `✓ Đã dịch trang ${pageNum}`;
      }
      setStatus(`Đã dịch xong Trang ${pageNum}/${totalPages}`, false);
    } catch (err) {
      if (btnPage) {
        btnPage.textContent = `✨ Dịch lại trang ${pageNum}`;
      }
      setStatus(`Lỗi dịch Trang ${pageNum}`, false);
      showToast(err.message);
    } finally {
      state.translating = false;
      if (btnPage) btnPage.disabled = false;
      renderPageParagraphCards(pageNum);
      renderOverlayLayer(pageNum);
    }
  }

  /**
   * Quét OCR & Dịch trang PDF dạng ảnh chụp (Scanned PDF / Bảng biểu phức tạp) bằng AI Vision
   */
  async function translatePageWithVision(pageNum) {
    await ensurePageRendered(pageNum);
    const state = pageStates.get(pageNum);
    const canvas = document.getElementById(`pdf-canvas-${pageNum}`);
    if (!state || !canvas || state.translating) return;

    const btnVision = document.getElementById(`btn-vision-${pageNum}`);
    state.translating = true;
    if (btnVision) {
      btnVision.disabled = true;
      btnVision.textContent = '🔍 Đang quét AI Vision...';
    }
    setStatus(`Đang dùng AI Vision đọc & dịch Trang ${pageNum}...`, true);

    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
      const base64Data = dataUrl.replace(/^data:image\/jpeg;base64,/, '');

      const res = await chrome.runtime.sendMessage({
        action: 'TRANSLATE_PDF_VISION_PAGE',
        payload: {
          base64Data,
          mimeType: 'image/jpeg',
          pageNumber: pageNum,
          displayMode: settings.displayMode || 'bilingual'
        }
      });

      if (!res || !res.success) {
        throw new Error(res?.error || 'AI Vision không thể xử lý trang PDF này.');
      }

      const blocks = Array.isArray(res.data?.blocks) ? res.data.blocks : [];
      if (blocks.length === 0) {
        throw new Error('Không tìm thấy văn bản nào trên trang ảnh này.');
      }

      const stepH = Math.min(18, 90 / blocks.length);
      state.paragraphs = blocks.map((b, idx) => ({
        id: `vision-${idx + 1}`,
        text: b.original || '',
        translatedText: b.translated || '',
        wbwText: b.wbw || '',
        isHeading: idx === 0 && (b.original || '').length < 95,
        fontSize: 12.5,
        leftPct: 6,
        topPct: 4 + idx * stepH,
        widthPct: 88,
        heightPct: Math.max(5, stepH - 1.5)
      }));

      state.isScanned = false;
      state.translated = true;
      state.translatedMode = settings.displayMode || 'bilingual';

      renderBoundingBoxes(pageNum, state.paragraphs);
      renderPageParagraphCards(pageNum);
      renderOverlayLayer(pageNum);

      const metaEl = document.getElementById(`page-meta-${pageNum}`);
      if (metaEl) metaEl.textContent = `${state.paragraphs.length} đoạn (AI Vision)`;
      if (btnVision) btnVision.textContent = '✓ Đã quét AI Vision';
      setStatus(`Đã dịch xong Trang ${pageNum} bằng AI Vision`, false);
    } catch (err) {
      if (btnVision) btnVision.textContent = '🔍 Dịch ảnh Scan (AI Vision)';
      setStatus('Lỗi AI Vision', false);
      showToast(err.message);
    } finally {
      state.translating = false;
      if (btnVision) btnVision.disabled = false;
    }
  }

  /**
   * Dịch tự động toàn bộ các trang của file PDF
   */
  async function toggleTranslateAllPages() {
    if (!pdfDoc) return;

    if (isBatchTranslating) {
      stopBatchRequested = true;
      btnTranslateAll.textContent = 'Đang dừng...';
      return;
    }

    isBatchTranslating = true;
    stopBatchRequested = false;
    btnTranslateAll.textContent = '⏹ Dừng dịch toàn bộ';

    try {
      for (let p = 1; p <= totalPages; p++) {
        if (stopBatchRequested) break;
        const st = pageStates.get(p);
        if (st && st.translated && st.translatedMode === (settings.displayMode || 'bilingual')) {
          continue;
        }
        setStatus(`Đang dịch toàn bộ PDF: Trang ${p} / ${totalPages}...`, true);
        await translatePage(p, false);

        // Khoảng nghỉ an toàn giữa các trang khi dịch toàn bộ để bảo vệ hạn mức RPM (Rate limit 15 req/min)
        if (p < totalPages && !stopBatchRequested) {
          await new Promise((r) => setTimeout(r, 4200));
        }
      }
      setStatus(
        stopBatchRequested ? 'Đã tạm dừng dịch hàng loạt' : `✓ Hoàn tất dịch ${totalPages} trang PDF`,
        false
      );
    } finally {
      isBatchTranslating = false;
      stopBatchRequested = false;
      btnTranslateAll.textContent = '⚡ Dịch toàn bộ PDF';
    }
  }

  // --------------------------------------------------------------------------
  // 5. ĐÁNH DẤU TỪ ĐÃ HỌC (.lw-anchor) & TỪNG TỪ RUBY GLOSS
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
    const lower = (wordText || '').toLowerCase().trim();
    return learnedWords.find((w) => (w.word || '').toLowerCase().trim() === lower) || null;
  }

  function createFragmentWithLearnedAnchors(text) {
    const fragment = document.createDocumentFragment();
    const regex = buildLearnedRegex();
    if (!regex) {
      fragment.appendChild(document.createTextNode(text || ''));
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

    while ((match = tokenRegex.exec(wbwText || '')) !== null) {
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

  function refreshAllRenderedParagraphs() {
    for (const [pageNum, st] of pageStates.entries()) {
      if (st.rendered) {
        renderPageParagraphCards(pageNum);
        renderOverlayLayer(pageNum);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 6. XUẤT / IN BẢN DỊCH PDF (HTML SONG NGỮ / PRINT TO PDF)
  // --------------------------------------------------------------------------
  function exportTranslatedDocument() {
    if (!pdfDoc) return;
    const rowsHtml = [];

    for (let p = 1; p <= totalPages; p++) {
      const st = pageStates.get(p);
      if (!st || st.paragraphs.length === 0) continue;

      const parasHtml = st.paragraphs
        .map((para) => {
          const orig = escapeHTML(para.text);
          const trans = para.translatedText ? escapeHTML(para.translatedText) : '';
          if (settings.displayMode === 'replace' && trans) {
            return `<div class="para">${para.isHeading ? `<h3>${trans}</h3>` : `<p class="vi">${trans}</p>`}</div>`;
          }
          return `
            <div class="para">
              ${para.isHeading ? `<h3>${orig}</h3>` : `<p class="orig">${orig}</p>`}
              ${trans ? `<p class="vi">${trans}</p>` : ''}
            </div>
          `;
        })
        .join('');

      rowsHtml.push(`
        <section class="page-sec">
          <div class="page-head">Trang ${p} / ${totalPages}</div>
          ${parasHtml}
        </section>
      `);
    }

    const htmlContent = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHTML(currentDocTitle)} — Bản dịch Lexis PDF</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; max-width: 820px; margin: 32px auto; padding: 0 20px; color: #18181b; line-height: 1.65; }
    .top-actions { display: flex; justify-content: space-between; align-items: center; padding-bottom: 16px; margin-bottom: 24px; border-bottom: 2px solid #e4e4e7; }
    .btn-print { padding: 8px 16px; background: #18181b; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
    .page-sec { margin-bottom: 36px; padding-bottom: 24px; border-bottom: 1px solid #e4e4e7; }
    .page-head { font-size: 12px; font-weight: 700; color: #71717a; text-transform: uppercase; margin-bottom: 12px; }
    .para { margin-bottom: 14px; }
    h3 { font-size: 17px; margin: 10px 0 4px; color: #09090b; }
    p.orig { margin: 0; color: #52525b; font-size: 14px; }
    p.vi { margin: 4px 0 0; padding-left: 10px; border-left: 2.5px solid #18181b; color: #09090b; font-size: 14.5px; font-weight: 500; }
    @media print { .top-actions { display: none; } body { margin: 0; } }
  </style>
</head>
<body>
  <div class="top-actions">
    <div>
      <h1 style="font-size:20px;margin:0;">${escapeHTML(currentDocTitle)}</h1>
      <span style="font-size:12px;color:#71717a;">Bản dịch ngữ cảnh tạo bởi Lexis PDF Studio</span>
    </div>
    <button class="btn-print" onclick="window.print()">🖨️ In hoặc Lưu thành PDF</button>
  </div>
  ${rowsHtml.join('\n')}
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  // --------------------------------------------------------------------------
  // 7. SỰ KIỆN THANH CÔNG CỤ & ĐIỀU HƯỚNG TRANG
  // --------------------------------------------------------------------------
  function bindToolbarEvents() {
    document.getElementById('btn-open-file').addEventListener('click', () => fileInputPdf.click());
    document.getElementById('btn-hero-open').addEventListener('click', () => fileInputPdf.click());

    fileInputPdf.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) loadPdfFromFile(file);
      fileInputPdf.value = '';
    });

    document.getElementById('btn-load-url').addEventListener('click', () => {
      const url = document.getElementById('input-pdf-url').value.trim();
      if (url) loadPdfFromUrl(url, true);
    });

    document.getElementById('input-pdf-url').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const url = e.target.value.trim();
        if (url) loadPdfFromUrl(url, true);
      }
    });

    // Kéo thả file PDF vào bất kỳ đâu trên cửa sổ
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      emptyDropzone?.classList.add('drag-over');
    });

    window.addEventListener('dragleave', () => {
      emptyDropzone?.classList.remove('drag-over');
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      emptyDropzone?.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
        loadPdfFromFile(file);
      }
    });

    // Chuyển đổi 3 chế độ bố cục (Song song / Đè lên PDF / Chế độ Đọc)
    document.querySelectorAll('#layout-switcher .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const layout = btn.getAttribute('data-layout');
        document.querySelectorAll('#layout-switcher .seg-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        document.body.setAttribute('data-layout', layout);
      });
    });

    // Chuyển đổi kiểu dịch (Song ngữ / Từng từ / Thay thế)
    selectDisplayMode.addEventListener('change', async (e) => {
      const newMode = e.target.value;
      settings.displayMode = newMode;
      document.body.setAttribute('data-display-mode', newMode);
      await chrome.storage.local.set({ settings });
      refreshAllRenderedParagraphs();

      // Nếu chuyển sang Dịch từng từ mà trang hiện tại chưa có dữ liệu WBW thì dịch ngay
      const curState = pageStates.get(currentPageNum);
      if (curState && curState.translated && curState.translatedMode !== newMode) {
        translatePage(currentPageNum, true);
      }
    });

    // Điều hướng trang
    btnPrevPage.addEventListener('click', () => {
      if (currentPageNum > 1) scrollToPage(currentPageNum - 1);
    });

    btnNextPage.addEventListener('click', () => {
      if (currentPageNum < totalPages) scrollToPage(currentPageNum + 1);
    });

    inputPageNum.addEventListener('change', () => {
      const p = Math.max(1, Math.min(totalPages, parseInt(inputPageNum.value, 10) || 1));
      scrollToPage(p);
    });

    // Phóng to / Thu nhỏ trang PDF
    btnZoomOut.addEventListener('click', () => updateZoom(currentScale - 0.15));
    btnZoomIn.addEventListener('click', () => updateZoom(currentScale + 0.15));

    // Dịch trang hiện tại & Dịch toàn bộ PDF
    btnTranslatePage.addEventListener('click', () => {
      translatePage(currentPageNum, true);
    });

    btnTranslateAll.addEventListener('click', () => {
      toggleTranslateAllPages();
    });

    btnExportDoc.addEventListener('click', () => {
      exportTranslatedDocument();
    });

    document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
      document.getElementById('pdf-sidebar').classList.toggle('is-collapsed');
    });

    // Giữ phím Alt để nhìn xuyên lớp phủ bản dịch khi ở chế độ Đè lên PDF
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Alt') document.body.classList.add('peek-original');
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Alt') document.body.classList.remove('peek-original');
    });
  }

  function scrollToPage(pageNum) {
    currentPageNum = pageNum;
    inputPageNum.value = String(pageNum);
    const row = document.getElementById(`pdf-page-row-${pageNum}`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'start' });
      ensurePageRendered(pageNum);
    }
  }

  async function updateZoom(nextScale) {
    if (!pdfDoc) return;
    currentScale = Math.max(0.75, Math.min(2.2, Number(nextScale.toFixed(2))));
    labelZoomLevel.textContent = `${Math.round(currentScale * 100)}%`;

    for (const [pageNum, st] of pageStates.entries()) {
      if (st.rendered) {
        await ensurePageRendered(pageNum, true);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 8. THANH BÊN: GOOGLE DỊCH, NGỮ PHÁP & SỔ TỪ VỰNG
  // --------------------------------------------------------------------------
  function switchSidebarTab(paneId) {
    const sidebar = document.getElementById('pdf-sidebar');
    sidebar.classList.remove('is-collapsed');

    document.querySelectorAll('.side-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-pane') === paneId);
    });
    document.querySelectorAll('.side-pane').forEach((pane) => {
      pane.classList.toggle('active', pane.id === paneId);
    });
  }

  function bindSidebarEvents() {
    document.querySelectorAll('.side-tab').forEach((btn) => {
      btn.addEventListener('click', () => switchSidebarTab(btn.getAttribute('data-pane')));
    });

    const gtInput = document.getElementById('gt-input-box');
    const gtSrc = document.getElementById('gt-src-lang');
    const gtTgt = document.getElementById('gt-tgt-lang');

    document.getElementById('gt-swap-lang').addEventListener('click', () => {
      const s = gtSrc.value === 'auto' ? 'Tiếng Anh' : gtSrc.value;
      const t = gtTgt.value;
      gtSrc.value = t;
      gtTgt.value = s;
      if (gtInput.value.trim()) runSidebarQuickTranslate();
    });

    document.getElementById('gt-btn-run').addEventListener('click', () => {
      runSidebarQuickTranslate();
    });

    document.getElementById('gt-btn-speak').addEventListener('click', () => {
      speakText(gtInput.value.trim());
    });

    // Sổ từ vựng
    const wordIn = document.getElementById('voc-word-in');
    const posIn = document.getElementById('voc-pos-in');
    const meanIn = document.getElementById('voc-mean-in');
    const searchIn = document.getElementById('voc-search-in');

    document.getElementById('voc-ai-btn').addEventListener('click', async (e) => {
      const w = wordIn.value.trim();
      if (!w) return;
      const btn = e.target;
      btn.textContent = '...';
      try {
        const res = await chrome.runtime.sendMessage({
          action: 'QUICK_TRANSLATE',
          payload: { text: w, sourceLang: 'auto', targetLang: 'Tiếng Việt' }
        });
        if (res?.success && res.data) {
          meanIn.value = res.data.shortMeaning || res.data.translatedText || '';
          if (res.data.pos) posIn.value = res.data.pos;
        }
      } catch (_) {}
      btn.textContent = '✨ AI';
    });

    document.getElementById('voc-save-btn').addEventListener('click', async () => {
      const word = wordIn.value.trim();
      const meaning = meanIn.value.trim();
      if (!word || !meaning) return;
      await saveVocabularyItem({ word, meaning, pos: posIn.value, phonetic: '' });
      wordIn.value = '';
      meanIn.value = '';
    });

    searchIn.addEventListener('input', () => {
      renderVocabSidebar(searchIn.value);
    });
  }

  async function runSidebarQuickTranslate(overrideText = null) {
    const gtInput = document.getElementById('gt-input-box');
    const sourceLang = document.getElementById('gt-src-lang').value;
    const targetLang = document.getElementById('gt-tgt-lang').value;
    const outArea = document.getElementById('gt-result-area');

    const text = (overrideText !== null ? overrideText : gtInput.value).trim();
    if (!text) return;
    gtInput.value = text;

    outArea.innerHTML = `<div class="side-box" style="color:#a1a1aa;">Đang dịch "${escapeHTML(text.slice(0, 40))}..."</div>`;

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'QUICK_TRANSLATE',
        payload: { text, sourceLang, targetLang }
      });

      if (!res || !res.success) throw new Error(res?.error || 'Lỗi dịch nhanh.');
      const d = res.data;
      lastQuickResult = {
        word: text,
        meaning: d.shortMeaning || d.translatedText || '',
        pos: d.pos || 'n',
        phonetic: d.phonetic || ''
      };

      const altHtml =
        Array.isArray(d.alternatives) && d.alternatives.length > 0
          ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #27272a;font-size:12px;color:#d4d4d8;">${d.alternatives
              .map((a) => `<div>• ${escapeHTML(a)}</div>`)
              .join('')}</div>`
          : '';

      outArea.innerHTML = `
        <div class="side-box">
          <div style="font-size:15px;font-weight:700;color:#ffffff;">${escapeHTML(d.translatedText)}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:4px;font-size:12px;color:#a1a1aa;">
            ${d.phonetic ? `<span>${escapeHTML(d.phonetic)}</span>` : ''}
            ${d.pos ? `<span class="brand-tag">${escapeHTML(d.pos)}</span>` : ''}
            <button class="btn btn-sm" id="gt-res-speak" style="margin-left:auto;">🔊 Phát âm</button>
          </div>
          ${altHtml}
          ${d.grammarNote ? `<div style="margin-top:6px;font-size:11.5px;color:#a1a1aa;">${escapeHTML(d.grammarNote)}</div>` : ''}
          <button class="btn btn-primary" id="gt-res-save" style="width:100%;margin-top:10px;">+ Lưu vào sổ từ vựng</button>
        </div>
      `;

      outArea.querySelector('#gt-res-speak')?.addEventListener('click', () => speakText(text));
      outArea.querySelector('#gt-res-save')?.addEventListener('click', async (e) => {
        await saveVocabularyItem(lastQuickResult);
        e.target.textContent = '✓ Đã lưu vào sổ từ';
      });
    } catch (err) {
      outArea.innerHTML = `<div class="side-box" style="color:#fca5a5;">${escapeHTML(err.message)}</div>`;
    }
  }

  async function inspectGrammarInSidebar(targetText, contextSentence) {
    const clean = (targetText || '').trim();
    if (!clean) return;

    switchSidebarTab('side-grammar');
    document.getElementById('gt-input-box').value = clean;
    runSidebarQuickTranslate(clean);

    const area = document.getElementById('grammar-result-area');
    area.innerHTML = `<div style="color:#a1a1aa;">Đang phân tích ngữ cảnh &amp; cấu trúc ngữ pháp của "${escapeHTML(clean)}"...</div>`;

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'ANALYZE_GRAMMAR',
        payload: {
          targetText: clean,
          contextSentence: contextSentence || clean,
          pageTitle: currentDocTitle
        }
      });

      if (!res || !res.success) throw new Error(res?.error || 'Không thể phân tích ngữ pháp.');
      const d = res.data;

      const bullets = Array.isArray(d.grammarBreakdown)
        ? d.grammarBreakdown.map((b) => `<li style="margin-bottom:4px;">${escapeHTML(b)}</li>`).join('')
        : '';

      area.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-size:15px;font-weight:700;color:#ffffff;">${escapeHTML(d.word || clean)}</span>
          ${d.phonetic ? `<span style="font-size:12px;color:#a1a1aa;">${escapeHTML(d.phonetic)}</span>` : ''}
          ${d.pos ? `<span class="brand-tag">${escapeHTML(d.pos)}</span>` : ''}
          <button class="btn btn-sm" id="gram-speak" style="margin-left:auto;">🔊</button>
        </div>
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid #27272a;">
          <div style="font-size:11px;font-weight:600;color:#71717a;text-transform:uppercase;">1. Bản dịch ngữ cảnh</div>
          <div style="font-size:14px;font-weight:600;color:#ffffff;margin-top:2px;">${escapeHTML(d.contextualTranslation || d.shortMeaning)}</div>
          <div style="font-size:12px;color:#a1a1aa;margin-top:4px;">${escapeHTML(d.whyThisTranslation || '')}</div>
        </div>
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid #27272a;">
          <div style="font-size:11px;font-weight:600;color:#71717a;text-transform:uppercase;">2. Mổ xẻ ngữ pháp</div>
          <ul style="padding-left:16px;margin-top:4px;font-size:12px;color:#d4d4d8;">${bullets}</ul>
        </div>
        <button class="btn btn-primary" id="gram-save" style="width:100%;margin-top:10px;">+ Lưu từ này vào sổ từ</button>
      `;

      area.querySelector('#gram-speak')?.addEventListener('click', () => speakText(d.word || clean));
      area.querySelector('#gram-save')?.addEventListener('click', async (e) => {
        await saveVocabularyItem({
          word: d.baseForm || d.word || clean,
          meaning: d.shortMeaning || d.contextualTranslation || '',
          pos: d.pos || 'n',
          phonetic: d.phonetic || ''
        });
        e.target.textContent = '✓ Đã lưu vào sổ từ';
      });
    } catch (err) {
      area.innerHTML = `<div style="color:#fca5a5;">${escapeHTML(err.message)}</div>`;
    }
  }

  async function saveVocabularyItem({ word, meaning, pos = 'n', phonetic = '' }) {
    const cleanW = (word || '').trim();
    const cleanM = (meaning || '').trim();
    if (!cleanW || !cleanM) return;

    const idx = learnedWords.findIndex((w) => (w.word || '').toLowerCase() === cleanW.toLowerCase());
    if (idx >= 0) {
      learnedWords[idx] = {
        ...learnedWords[idx],
        word: cleanW,
        meaning: cleanM,
        pos: pos || learnedWords[idx].pos || 'n',
        phonetic: phonetic || learnedWords[idx].phonetic || '',
        timestamp: Date.now()
      };
    } else {
      learnedWords.unshift({
        id: `lw-${Date.now()}`,
        word: cleanW,
        meaning: cleanM,
        pos,
        phonetic,
        timestamp: Date.now()
      });
    }

    await chrome.storage.local.set({ learned_words: learnedWords });
    renderVocabSidebar();
    refreshAllRenderedParagraphs();
  }

  function renderVocabSidebar(query = '') {
    const countEl = document.getElementById('side-vocab-count');
    if (countEl) countEl.textContent = String(learnedWords.length);

    const wrap = document.getElementById('vocab-items-wrap');
    if (!wrap) return;

    const q = (query || '').trim().toLowerCase();
    const filtered = learnedWords.filter((item) => {
      if (!q) return true;
      return (
        (item.word || '').toLowerCase().includes(q) ||
        (item.meaning || '').toLowerCase().includes(q)
      );
    });

    if (filtered.length === 0) {
      wrap.innerHTML = `<div class="side-box" style="color:#71717a;text-align:center;">Không có từ vựng nào.</div>`;
      return;
    }

    wrap.innerHTML = filtered
      .map(
        (item) => `
        <div class="vocab-mini-card">
          <div>
            <div>
              <span class="w-title">${escapeHTML(item.word)}</span>
              ${item.pos ? `<span class="w-pos">${escapeHTML(item.pos)}</span>` : ''}
            </div>
            <div class="w-mean">${escapeHTML(item.meaning)}</div>
          </div>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-sm v-spk" data-w="${escapeHTML(item.word)}">🔊</button>
            <button class="btn btn-sm v-del" data-id="${escapeHTML(item.id)}">×</button>
          </div>
        </div>
      `
      )
      .join('');

    wrap.querySelectorAll('.v-spk').forEach((btn) => {
      btn.addEventListener('click', () => speakText(btn.getAttribute('data-w')));
    });

    wrap.querySelectorAll('.v-del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        learnedWords = learnedWords.filter((w) => w.id !== id);
        await chrome.storage.local.set({ learned_words: learnedWords });
        renderVocabSidebar(query);
        refreshAllRenderedParagraphs();
      });
    });
  }

  // --------------------------------------------------------------------------
  // 9. BÔI ĐEN VĂN BẢN TRÊN PDF, NHÁY ĐÚP TRA TỪ & HOVER TOOLTIP
  // --------------------------------------------------------------------------
  function bindSelectionAndTooltipEvents() {
    document.addEventListener('mouseover', (e) => {
      const anchor = e.target.closest?.('span.lw-anchor');
      if (!anchor) return;
      const word = anchor.getAttribute('data-word') || anchor.textContent;
      const meaning = anchor.getAttribute('data-meaning') || '';
      const pos = anchor.getAttribute('data-pos') || '';
      const phonetic = anchor.getAttribute('data-phonetic') || '';

      tooltipEl.innerHTML = `
        <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:2px;">
          <strong style="color:#fff;">${escapeHTML(word)}</strong>
          ${phonetic ? `<span style="font-size:11px;color:#a1a1aa;">${escapeHTML(phonetic)}</span>` : ''}
          ${pos ? `<span class="brand-tag" style="margin-left:auto;">${escapeHTML(pos)}</span>` : ''}
        </div>
        <div style="color:#d4d4d8;font-size:12.5px;">${escapeHTML(meaning)}</div>
      `;
      tooltipEl.classList.add('is-visible');

      const rect = anchor.getBoundingClientRect();
      tooltipEl.style.top = `${Math.max(8, rect.top - tooltipEl.offsetHeight - 8)}px`;
      tooltipEl.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 290))}px`;
    });

    document.addEventListener('mouseout', (e) => {
      if (e.target.closest?.('span.lw-anchor')) {
        tooltipEl.classList.remove('is-visible');
      }
    });

    document.addEventListener('click', (e) => {
      const anchor = e.target.closest?.('span.lw-anchor');
      if (anchor) {
        const word = anchor.getAttribute('data-word') || anchor.textContent.trim();
        const card = anchor.closest('.pdf-para-card');
        const sentence = card?.querySelector('.para-orig')?.textContent || word;
        inspectGrammarInSidebar(word, sentence);
        return;
      }
      if (!e.target.closest('#pdf-sel-pill')) {
        selPillEl.classList.remove('is-visible');
      }
    });

    document.addEventListener('dblclick', (e) => {
      if (e.target.closest('#pdf-sidebar, .pdf-topbar, .pdf-subbar')) return;
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (text.length >= 2 && text.length <= 50) {
        selPillEl.classList.remove('is-visible');
        const card = e.target.closest?.('.pdf-para-card');
        const sentence = card?.querySelector('.para-orig')?.textContent || text;
        inspectGrammarInSidebar(text, sentence);
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (e.target.closest('#pdf-sidebar, .pdf-topbar, .pdf-subbar, #pdf-sel-pill')) return;
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : '';
        if (text.length >= 2 && text.length <= 320) {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const card = range.commonAncestorContainer.parentElement?.closest?.('.pdf-para-card');
          activeSelection = {
            text,
            sentence: card?.querySelector('.para-orig')?.textContent || text
          };
          selPillEl.style.top = `${Math.max(10, rect.top - 36)}px`;
          selPillEl.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - 160))}px`;
          selPillEl.classList.add('is-visible');
        } else {
          selPillEl.classList.remove('is-visible');
        }
      }, 20);
    });

    selPillEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selPillEl.classList.remove('is-visible');
      if (activeSelection.text) {
        inspectGrammarInSidebar(activeSelection.text, activeSelection.sentence);
      }
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

  function escapeHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  init();
})();
