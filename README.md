# Lexis — Minimalist Contextual Reading & Vocabulary (Manifest V3)

Tiện ích mở rộng Chrome thiết kế theo phong cách tối giản (Linear / Notion / Apple) hỗ trợ đọc hiểu ngoại ngữ qua dịch ngữ cảnh tự động, mổ xẻ ngữ pháp và duy trì phản xạ từ vựng đã học.

---

## Cải tiến kỹ thuật cốt lõi (v2.0)

1. **Không bao giờ dịch nhầm link ảnh, URL, code hay thuộc tính kỹ thuật:**
   - Bộ lọc `TreeWalker` chỉ trích xuất `Node.TEXT_NODE` nằm trong các thẻ đọc nội dung (`<p>`, `<span>`, `<h1>`–`<h6>`, `<li>`, `<td>`, `<blockquote>`, `<article>`).
   - Loại trừ tuyệt đối các thẻ media và kỹ thuật: `<img>`, `<picture>`, `<svg>`, `<video>`, `<audio>`, `<canvas>`, `<code>`, `<pre>`, `<script>`, `<style>`, `<noscript>`.
   - Loại bỏ mọi chuỗi văn bản là URL (`http://`, `https://`), tên file (`.png`, `.jpg`, `.webp`, `.svg`...) và biến code (`camelCase`, `snake_case`).
2. **Tương thích 100% Dark Mode & Light Mode (Không vỡ giao diện):**
   - Thao tác trực tiếp ở cấp độ `TextNode` thông qua thẻ bọc trung tính `span.lw-text-seg` với `color: inherit !important; background: transparent !important; font-size: inherit !important; font-family: inherit !important;`.
   - Bảo toàn nguyên vẹn mọi thẻ `<img>`, `<a>`, `<code>` bên trong đoạn văn.
3. **Đánh dấu từ đã lưu tinh tế (`.lw-anchor`):**
   - Không tô nền xanh/vàng gây chói mắt.
   - Giữ nguyên từ ngoại ngữ gốc trong câu dịch tiếng Việt và chỉ đánh dấu bằng đường gạch chân nét đứt mảnh (`border-bottom: 1.5px dashed rgba(120, 120, 120, 0.45); cursor: help;`).
4. **Cách ly 100% UI bằng Shadow DOM (`attachShadow({ mode: 'open' })`):**
   - Toàn bộ Tooltip, nút chọn nhanh và Grammar Inspector Card nằm bên trong Shadow DOM với bảng màu trung tính Zinc (`#18181b`, `#27272a`, `#f4f4f5`) và chuyển động 150ms `ease-out`.

---

## Cấu trúc thư mục

- `manifest.json` — Cấu hình Manifest V3, quyền `storage`, `activeTab`, `scripting`, `web_accessible_resources`.
- `background.js` — Service Worker gọi Gemini API (`gemini-3.8-flash`), Groq API (`llama-3.3-70b-versatile`) hoặc OpenAI API.
- `content.js` — `TreeWalker` lọc `Node.TEXT_NODE` an toàn, quản lý Shadow DOM, sự kiện Hover/Click/Selection/Esc.
- `shadow-style.css` — CSS cho `.lw-anchor` và các thành phần bên trong Shadow DOM.
- `popup.html` & `popup.js` — Giao diện quản lý từ vựng và cài đặt API Key.

---

## Hướng dẫn cài đặt / Cập nhật vào Chrome

1. Mở `chrome://extensions/` trên trình duyệt Chrome.
2. Bật **Developer mode (Chế độ dành cho nhà phát triển)** ở góc trên bên phải.
3. Bấm **Load unpacked (Tải tiện ích đã giải nén)** và chọn thư mục `C:\Users\ADMIN\OneDrive\Desktop\Server` *(nếu bạn đã cài bản trước đó, chỉ cần bấm biểu tượng **Reload ↻** trên thẻ tiện ích).*
4. Mở tiện ích $\rightarrow$ tab **Cài đặt API** $\rightarrow$ nhập **Gemini API Key** (hoặc **Groq API Key**) $\rightarrow$ bấm **Lưu cài đặt**.
