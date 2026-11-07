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
namespace DeThiKaraoke
{
    partial class FrmKaraoke
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            this.components = new System.ComponentModel.Container();
            this.mnuChinh = new System.Windows.Forms.MenuStrip();
            this.mnuHeThong = new System.Windows.Forms.ToolStripMenuItem();
            this.mnuLamMoi = new System.Windows.Forms.ToolStripMenuItem();
            this.mnuThoat = new System.Windows.Forms.ToolStripMenuItem();
            this.mnuChucNang = new System.Windows.Forms.ToolStripMenuItem();
            this.mnuThem = new System.Windows.Forms.ToolStripMenuItem();
            this.mnuSua = new System.Windows.Forms.ToolStripMenuItem();
            this.mnuXoa = new System.Windows.Forms.ToolStripMenuItem();
            this.mnuTroGiup = new System.Windows.Forms.ToolStripMenuItem();
            this.mnuHuongDan = new System.Windows.Forms.ToolStripMenuItem();
            this.lblTieuDe = new System.Windows.Forms.Label();
            this.lsvDanhSach = new System.Windows.Forms.ListView();
            this.colMa = ((System.Windows.Forms.ColumnHeader)(new System.Windows.Forms.ColumnHeader()));
            this.colTen = ((System.Windows.Forms.ColumnHeader)(new System.Windows.Forms.ColumnHeader()));
            this.colLoai = ((System.Windows.Forms.ColumnHeader)(new System.Windows.Forms.ColumnHeader()));
            this.colGio = ((System.Windows.Forms.ColumnHeader)(new System.Windows.Forms.ColumnHeader()));
            this.colSoGio = ((System.Windows.Forms.ColumnHeader)(new System.Windows.Forms.ColumnHeader()));
            this.colDichVu = ((System.Windows.Forms.ColumnHeader)(new System.Windows.Forms.ColumnHeader()));
            this.colThanhTien = ((System.Windows.Forms.ColumnHeader)(new System.Windows.Forms.ColumnHeader()));
            this.lblThongKe = new System.Windows.Forms.Label();
            this.grpThongTin = new System.Windows.Forms.GroupBox();
            this.txtSoGio = new System.Windows.Forms.TextBox();
            this.label3 = new System.Windows.Forms.Label();
            this.txtTenKhach = new System.Windows.Forms.TextBox();
            this.label2 = new System.Windows.Forms.Label();
            this.txtMaDat = new System.Windows.Forms.TextBox();
            this.label1 = new System.Windows.Forms.Label();
            this.grpLoaiPhong = new System.Windows.Forms.GroupBox();
            this.radParty = new System.Windows.Forms.RadioButton();
            this.radVIP = new System.Windows.Forms.RadioButton();
            this.radCouple = new System.Windows.Forms.RadioButton();
            this.radThuong = new System.Windows.Forms.RadioButton();
            this.grpKhungGio = new System.Windows.Forms.GroupBox();
            this.radToi = new System.Windows.Forms.RadioButton();
            this.radChieu = new System.Windows.Forms.RadioButton();
            this.radSang = new System.Windows.Forms.RadioButton();
            this.chkTraiCay = new System.Windows.Forms.CheckBox();
            this.chkThanhVien = new System.Windows.Forms.CheckBox();
            this.lblThanhTien = new System.Windows.Forms.Label();
            this.grpAnh = new System.Windows.Forms.GroupBox();
            this.btnChonAnh = new System.Windows.Forms.Button();
            this.picAnh = new System.Windows.Forms.PictureBox();
            this.btnThem = new System.Windows.Forms.Button();
            this.btnSua = new System.Windows.Forms.Button();
            this.btnXoa = new System.Windows.Forms.Button();
            this.btnLamMoi = new System.Windows.Forms.Button();
            this.ssTrangThai = new System.Windows.Forms.StatusStrip();
            this.sslTrangThai = new System.Windows.Forms.ToolStripStatusLabel();
            this.sslDongHo = new System.Windows.Forms.ToolStripStatusLabel();
            this.tmrDongHo = new System.Windows.Forms.Timer(this.components);
            this.ofdAnh = new System.Windows.Forms.OpenFileDialog();
            this.mnuChinh.SuspendLayout();
            this.grpThongTin.SuspendLayout();
            this.grpLoaiPhong.SuspendLayout();
            this.grpKhungGio.SuspendLayout();
            this.grpAnh.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.picAnh)).BeginInit();
            this.ssTrangThai.SuspendLayout();
            this.SuspendLayout();
            // 
            // mnuChinh
            // 
            this.mnuChinh.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.mnuHeThong,
            this.mnuChucNang,
            this.mnuTroGiup});
            this.mnuChinh.Location = new System.Drawing.Point(0, 0);
            this.mnuChinh.Name = "mnuChinh";
            this.mnuChinh.Size = new System.Drawing.Size(784, 24);
            this.mnuChinh.TabIndex = 0;
            // 
            // mnuHeThong
            // 
            this.mnuHeThong.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.mnuLamMoi,
            this.mnuThoat});
            this.mnuHeThong.Name = "mnuHeThong";
            this.mnuHeThong.Size = new System.Drawing.Size(69, 20);
            this.mnuHeThong.Text = "Hệ thống";
            // 
            // mnuLamMoi
            // 
            this.mnuLamMoi.Name = "mnuLamMoi";
            this.mnuLamMoi.ShortcutKeys = ((System.Windows.Forms.Keys)((System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.N)));
            this.mnuLamMoi.Size = new System.Drawing.Size(165, 22);
            this.mnuLamMoi.Text = "Làm mới";
            this.mnuLamMoi.Click += new System.EventHandler(this.mnuLamMoi_Click);
            // 
            // mnuThoat
            // 
            this.mnuThoat.Name = "mnuThoat";
            this.mnuThoat.Size = new System.Drawing.Size(165, 22);
            this.mnuThoat.Text = "Thoát";
            this.mnuThoat.Click += new System.EventHandler(this.mnuThoat_Click);
            // 
            // mnuChucNang
            // 
            this.mnuChucNang.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.mnuThem,
            this.mnuSua,
            this.mnuXoa});
            this.mnuChucNang.Name = "mnuChucNang";
            this.mnuChucNang.Size = new System.Drawing.Size(77, 20);
            this.mnuChucNang.Text = "Chức năng";
            // 
            // mnuThem
            // 
            this.mnuThem.Name = "mnuThem";
            this.mnuThem.ShortcutKeys = ((System.Windows.Forms.Keys)((System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.T)));
            this.mnuThem.Size = new System.Drawing.Size(147, 22);
            this.mnuThem.Text = "Thêm";
            this.mnuThem.Click += new System.EventHandler(this.mnuThem_Click);
            // 
            // mnuSua
            // 
            this.mnuSua.Name = "mnuSua";
            this.mnuSua.ShortcutKeys = ((System.Windows.Forms.Keys)((System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.E)));
            this.mnuSua.Size = new System.Drawing.Size(147, 22);
            this.mnuSua.Text = "Sửa";
            this.mnuSua.Click += new System.EventHandler(this.mnuSua_Click);
            // 
            // mnuXoa
            // 
            this.mnuXoa.Name = "mnuXoa";
            this.mnuXoa.ShortcutKeys = System.Windows.Forms.Keys.Delete;
            this.mnuXoa.Size = new System.Drawing.Size(147, 22);
            this.mnuXoa.Text = "Xóa";
            this.mnuXoa.Click += new System.EventHandler(this.mnuXoa_Click);
            // 
            // mnuTroGiup
            // 
            this.mnuTroGiup.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.mnuHuongDan});
            this.mnuTroGiup.Name = "mnuTroGiup";
            this.mnuTroGiup.Size = new System.Drawing.Size(62, 20);
            this.mnuTroGiup.Text = "Trợ giúp";
            // 
            // mnuHuongDan
            // 
            this.mnuHuongDan.Name = "mnuHuongDan";
            this.mnuHuongDan.ShortcutKeys = System.Windows.Forms.Keys.F1;
            this.mnuHuongDan.Size = new System.Drawing.Size(150, 22);
            this.mnuHuongDan.Text = "Hướng dẫn";
            this.mnuHuongDan.Click += new System.EventHandler(this.mnuHuongDan_Click);
            // 
            // lblTieuDe
            // 
            this.lblTieuDe.Font = new System.Drawing.Font("Microsoft Sans Serif", 14F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.lblTieuDe.ForeColor = System.Drawing.Color.DarkRed;
            this.lblTieuDe.Location = new System.Drawing.Point(12, 30);
            this.lblTieuDe.Name = "lblTieuDe";
            this.lblTieuDe.Size = new System.Drawing.Size(760, 28);
            this.lblTieuDe.TabIndex = 1;
            this.lblTieuDe.Text = "ĐẶT PHÒNG KARAOKE";
            this.lblTieuDe.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            // 
            // lsvDanhSach
            // 
            this.lsvDanhSach.Columns.AddRange(new System.Windows.Forms.ColumnHeader[] {
            this.colMa,
            this.colTen,
            this.colLoai,
            this.colGio,
            this.colSoGio,
            this.colDichVu,
            this.colThanhTien});
            this.lsvDanhSach.FullRowSelect = true;
            this.lsvDanhSach.GridLines = true;
            this.lsvDanhSach.HideSelection = false;
            this.lsvDanhSach.Location = new System.Drawing.Point(16, 65);
            this.lsvDanhSach.MultiSelect = false;
            this.lsvDanhSach.Name = "lsvDanhSach";
            this.lsvDanhSach.Size = new System.Drawing.Size(756, 140);
            this.lsvDanhSach.TabIndex = 2;
            this.lsvDanhSach.UseCompatibleStateImageBehavior = false;
            this.lsvDanhSach.View = System.Windows.Forms.View.Details;
            this.lsvDanhSach.SelectedIndexChanged += new System.EventHandler(this.lsvDanhSach_SelectedIndexChanged);
            // 
            // colMa
            // 
            this.colMa.Text = "Mã đặt";
            this.colMa.Width = 80;
            // 
            // colTen
            // 
            this.colTen.Text = "Tên khách";
            this.colTen.Width = 140;
            // 
            // colLoai
            // 
            this.colLoai.Text = "Loại phòng";
            this.colLoai.Width = 100;
            // 
            // colGio
            // 
            this.colGio.Text = "Khung giờ";
            this.colGio.Width = 90;
            // 
            // colSoGio
            // 
            this.colSoGio.Text = "Số giờ";
            this.colSoGio.Width = 60;
            // 
            // colDichVu
            // 
            this.colDichVu.Text = "Dịch vụ";
            this.colDichVu.Width = 130;
            // 
            // colThanhTien
            // 
            this.colThanhTien.Text = "Thành tiền";
            this.colThanhTien.Width = 120;
            // 
            // lblThongKe
            // 
            this.lblThongKe.AutoSize = true;
            this.lblThongKe.Font = new System.Drawing.Font("Microsoft Sans Serif", 9F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.lblThongKe.ForeColor = System.Drawing.Color.DarkGreen;
            this.lblThongKe.Location = new System.Drawing.Point(16, 212);
            this.lblThongKe.Name = "lblThongKe";
            this.lblThongKe.Size = new System.Drawing.Size(262, 15);
            this.lblThongKe.TabIndex = 3;
            this.lblThongKe.Text = "Tổng lượt đặt: 0 | Tổng doanh thu: 0 VNĐ";
            // 
            // grpThongTin
            // 
            this.grpThongTin.Controls.Add(this.txtSoGio);
            this.grpThongTin.Controls.Add(this.label3);
            this.grpThongTin.Controls.Add(this.txtTenKhach);
            this.grpThongTin.Controls.Add(this.label2);
            this.grpThongTin.Controls.Add(this.txtMaDat);
            this.grpThongTin.Controls.Add(this.label1);
            this.grpThongTin.Location = new System.Drawing.Point(16, 235);
            this.grpThongTin.Name = "grpThongTin";
            this.grpThongTin.Size = new System.Drawing.Size(320, 115);
            this.grpThongTin.TabIndex = 4;
            this.grpThongTin.TabStop = false;
            this.grpThongTin.Text = "Thông tin đặt phòng";
            // 
            // txtSoGio
            // 
            this.txtSoGio.Location = new System.Drawing.Point(85, 78);
            this.txtSoGio.Name = "txtSoGio";
            this.txtSoGio.Size = new System.Drawing.Size(215, 20);
            this.txtSoGio.TabIndex = 5;
            this.txtSoGio.TextChanged += new System.EventHandler(this.TinhTien_Event);
            // 
            // label3
            // 
            this.label3.AutoSize = true;
            this.label3.Location = new System.Drawing.Point(15, 81);
            this.label3.Name = "label3";
            this.label3.Size = new System.Drawing.Size(40, 13);
            this.label3.TabIndex = 4;
            this.label3.Text = "Số giờ:";
            // 
            // txtTenKhach
            // 
            this.txtTenKhach.Location = new System.Drawing.Point(85, 49);
            this.txtTenKhach.Name = "txtTenKhach";
            this.txtTenKhach.Size = new System.Drawing.Size(215, 20);
            this.txtTenKhach.TabIndex = 3;
            // 
            // label2
            // 
            this.label2.AutoSize = true;
            this.label2.Location = new System.Drawing.Point(15, 52);
            this.label2.Name = "label2";
            this.label2.Size = new System.Drawing.Size(62, 13);
            this.label2.TabIndex = 2;
            this.label2.Text = "Tên khách:";
            // 
            // txtMaDat
            // 
            this.txtMaDat.Location = new System.Drawing.Point(85, 21);
            this.txtMaDat.MaxLength = 4;
            this.txtMaDat.Name = "txtMaDat";
            this.txtMaDat.Size = new System.Drawing.Size(215, 20);
            this.txtMaDat.TabIndex = 1;
            // 
            // label1
            // 
            this.label1.AutoSize = true;
            this.label1.Location = new System.Drawing.Point(15, 24);
            this.label1.Name = "label1";
            this.label1.Size = new System.Drawing.Size(44, 13);
            this.label1.TabIndex = 0;
            this.label1.Text = "Mã đặt:";
            // 
            // grpLoaiPhong
            // 
            this.grpLoaiPhong.Controls.Add(this.radParty);
            this.grpLoaiPhong.Controls.Add(this.radVIP);
            this.grpLoaiPhong.Controls.Add(this.radCouple);
            this.grpLoaiPhong.Controls.Add(this.radThuong);
            this.grpLoaiPhong.Location = new System.Drawing.Point(16, 355);
            this.grpLoaiPhong.Name = "grpLoaiPhong";
            this.grpLoaiPhong.Size = new System.Drawing.Size(515, 50);
            this.grpLoaiPhong.TabIndex = 5;
            this.grpLoaiPhong.TabStop = false;
            this.grpLoaiPhong.Text = "Loại phòng";
            // 
            // radParty
            // 
            this.radParty.AutoSize = true;
            this.radParty.Location = new System.Drawing.Point(400, 20);
            this.radParty.Name = "radParty";
            this.radParty.Size = new System.Drawing.Size(89, 17);
            this.radParty.TabIndex = 3;
            this.radParty.TabStop = true;
            this.radParty.Text = "Phòng Party";
            this.radParty.UseVisualStyleBackColor = true;
            this.radParty.CheckedChanged += new System.EventHandler(this.TinhTien_Event);
            // 
            // radVIP
            // 
            this.radVIP.AutoSize = true;
            this.radVIP.Location = new System.Drawing.Point(280, 20);
            this.radVIP.Name = "radVIP";
            this.radVIP.Size = new System.Drawing.Size(77, 17);
            this.radVIP.TabIndex = 2;
            this.radVIP.TabStop = true;
            this.radVIP.Text = "Phòng VIP";
            this.radVIP.UseVisualStyleBackColor = true;
            this.radVIP.CheckedChanged += new System.EventHandler(this.TinhTien_Event);
            // 
            // radCouple
            // 
            this.radCouple.AutoSize = true;
            this.radCouple.Location = new System.Drawing.Point(150, 20);
            this.radCouple.Name = "radCouple";
            this.radCouple.Size = new System.Drawing.Size(93, 17);
            this.radCouple.TabIndex = 1;
            this.radCouple.TabStop = true;
            this.radCouple.Text = "Phòng Couple";
            this.radCouple.UseVisualStyleBackColor = true;
            this.radCouple.CheckedChanged += new System.EventHandler(this.TinhTien_Event);
            // 
            // radThuong
            // 
            this.radThuong.AutoSize = true;
            this.radThuong.Location = new System.Drawing.Point(20, 20);
            this.radThuong.Name = "radThuong";
            this.radThuong.Size = new System.Drawing.Size(95, 17);
            this.radThuong.TabIndex = 0;
            this.radThuong.TabStop = true;
            this.radThuong.Text = "Phòng thường";
            this.radThuong.UseVisualStyleBackColor = true;
            this.radThuong.CheckedChanged += new System.EventHandler(this.TinhTien_Event);
            // 
            // grpKhungGio
            // 
            this.grpKhungGio.Controls.Add(this.radToi);
            this.grpKhungGio.Controls.Add(this.radChieu);
            this.grpKhungGio.Controls.Add(this.radSang);
            this.grpKhungGio.Location = new System.Drawing.Point(16, 410);
            this.grpKhungGio.Name = "grpKhungGio";
            this.grpKhungGio.Size = new System.Drawing.Size(515, 50);
            this.grpKhungGio.TabIndex = 6;
            this.grpKhungGio.TabStop = false;
            this.grpKhungGio.Text = "Khung giờ";
            // 
            // radToi
            // 
            this.radToi.AutoSize = true;
            this.radToi.Location = new System.Drawing.Point(280, 20);
            this.radToi.Name = "radToi";
            this.radToi.Size = new System.Drawing.Size(84, 17);
            this.radToi.TabIndex = 2;
            this.radToi.TabStop = true;
            this.radToi.Text = "Tối (Hệ số 1.2)";
            this.radToi.UseVisualStyleBackColor = true;
            this.radToi.CheckedChanged += new System.EventHandler(this.TinhTien_Event);
            // 
            // radChieu
            // 
            this.radChieu.AutoSize = true;
            this.radChieu.Location = new System.Drawing.Point(150, 20);
            this.radChieu.Name = "radChieu";
            this.radChieu.Size = new System.Drawing.Size(96, 17);
            this.radChieu.TabIndex = 1;
            this.radChieu.TabStop = true;
            this.radChieu.Text = "Chiều (Hệ số 1.0)";
            this.radChieu.UseVisualStyleBackColor = true;
            this.radChieu.CheckedChanged += new System.EventHandler(this.TinhTien_Event);
            // 
            // radSang
            // 
            this.radSang.AutoSize = true;
            this.radSang.Location = new System.Drawing.Point(20, 20);
            this.radSang.Name = "radSang";
            this.radSang.Size = new System.Drawing.Size(94, 17);
            this.radSang.TabIndex = 0;
            this.radSang.TabStop = true;
            this.radSang.Text = "Sáng (Hệ số 0.8)";
            this.radSang.UseVisualStyleBackColor = true;
            this.radSang.CheckedChanged += new System.EventHandler(this.TinhTien_Event);
            // 
            // chkTraiCay
            // 
            this.chkTraiCay.AutoSize = true;
            this.chkTraiCay.Location = new System.Drawing.Point(26, 470);
            this.chkTraiCay.Name = "chkTraiCay";
            this.chkTraiCay.Size = new System.Drawing.Size(155, 17);
            this.chkTraiCay.TabIndex = 7;
            this.chkTraiCay.Text = "Trái cây và nước (+200.000)";
            this.chkTraiCay.UseVisualStyleBackColor = true;
            this.chkTraiCay.CheckedChanged += new System.EventHandler(this.TinhTien_Event);
            // 
            // chkThanhVien
            // 
            this.chkThanhVien.AutoSize = true;
            this.chkThanhVien.Location = new System.Drawing.Point(200, 470);
            this.chkThanhVien.Name = "chkThanhVien";
            this.chkThanhVien.Size = new System.Drawing.Size(136, 17);
            this.chkThanhVien.TabIndex = 8;
            this.chkThanhVien.Text = "Thẻ thành viên (Giảm 10%)";
            this.chkThanhVien.UseVisualStyleBackColor = true;
            this.chkThanhVien.CheckedChanged += new System.EventHandler(this.TinhTien_Event);
            // 
            // lblThanhTien
            // 
            this.lblThanhTien.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.lblThanhTien.Font = new System.Drawing.Font("Microsoft Sans Serif", 14F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
            this.lblThanhTien.ForeColor = System.Drawing.Color.Red;
            this.lblThanhTien.Location = new System.Drawing.Point(16, 500);
            this.lblThanhTien.Name = "lblThanhTien";
            this.lblThanhTien.Size = new System.Drawing.Size(515, 45);
            this.lblThanhTien.TabIndex = 9;
            this.lblThanhTien.Text = "0 VNĐ";
            this.lblThanhTien.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            // 
            // grpAnh
            // 
            this.grpAnh.Controls.Add(this.btnChonAnh);
            this.grpAnh.Controls.Add(this.picAnh);
            this.grpAnh.Location = new System.Drawing.Point(545, 235);
            this.grpAnh.Name = "grpAnh";
            this.grpAnh.Size = new System.Drawing.Size(227, 225);
            this.grpAnh.TabIndex = 10;
            this.grpAnh.TabStop = false;
            this.grpAnh.Text = "Ảnh";
            // 
            // btnChonAnh
            // 
            this.btnChonAnh.Location = new System.Drawing.Point(60, 190);
            this.btnChonAnh.Name = "btnChonAnh";
            this.btnChonAnh.Size = new System.Drawing.Size(110, 25);
            this.btnChonAnh.TabIndex = 1;
            this.btnChonAnh.Text = "Chọn ảnh...";
            this.btnChonAnh.UseVisualStyleBackColor = true;
            this.btnChonAnh.Click += new System.EventHandler(this.btnChonAnh_Click);
            // 
            // picAnh
            // 
            this.picAnh.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
            this.picAnh.Location = new System.Drawing.Point(15, 20);
            this.picAnh.Name = "picAnh";
            this.picAnh.Size = new System.Drawing.Size(198, 160);
            this.picAnh.SizeMode = System.Windows.Forms.PictureBoxSizeMode.Zoom;
            this.picAnh.TabIndex = 0;
            this.picAnh.TabStop = false;
            // 
            // btnThem
            // 
            this.btnThem.Location = new System.Drawing.Point(545, 470);
            this.btnThem.Name = "btnThem";
            this.btnThem.Size = new System.Drawing.Size(105, 32);
            this.btnThem.TabIndex = 11;
            this.btnThem.Text = "Thêm";
            this.btnThem.UseVisualStyleBackColor = true;
            this.btnThem.Click += new System.EventHandler(this.btnThem_Click);
            // 
            // btnSua
            // 
            this.btnSua.Location = new System.Drawing.Point(665, 470);
            this.btnSua.Name = "btnSua";
            this.btnSua.Size = new System.Drawing.Size(105, 32);
            this.btnSua.TabIndex = 12;
            this.btnSua.Text = "Sửa";
            this.btnSua.UseVisualStyleBackColor = true;
            this.btnSua.Click += new System.EventHandler(this.btnSua_Click);
            // 
            // btnXoa
            // 
            this.btnXoa.Location = new System.Drawing.Point(545, 513);
            this.btnXoa.Name = "btnXoa";
            this.btnXoa.Size = new System.Drawing.Size(105, 32);
            this.btnXoa.TabIndex = 13;
            this.btnXoa.Text = "Xóa";
            this.btnXoa.UseVisualStyleBackColor = true;
            this.btnXoa.Click += new System.EventHandler(this.btnXoa_Click);
            // 
            // btnLamMoi
            // 
            this.btnLamMoi.Location = new System.Drawing.Point(665, 513);
            this.btnLamMoi.Name = "btnLamMoi";
            this.btnLamMoi.Size = new System.Drawing.Size(105, 32);
            this.btnLamMoi.TabIndex = 14;
            this.btnLamMoi.Text = "Làm mới";
            this.btnLamMoi.UseVisualStyleBackColor = true;
            this.btnLamMoi.Click += new System.EventHandler(this.btnLamMoi_Click);
            // 
            // ssTrangThai
            // 
            this.ssTrangThai.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.sslTrangThai,
            this.sslDongHo});
            this.ssTrangThai.Location = new System.Drawing.Point(0, 560);
            this.ssTrangThai.Name = "ssTrangThai";
            this.ssTrangThai.Size = new System.Drawing.Size(784, 22);
            this.ssTrangThai.TabIndex = 15;
            // 
            // sslTrangThai
            // 
            this.sslTrangThai.Name = "sslTrangThai";
            this.sslTrangThai.Size = new System.Drawing.Size(51, 17);
            this.sslTrangThai.Text = "Sẵn sàng";
            // 
            // sslDongHo
            // 
            this.sslDongHo.Name = "sslDongHo";
            this.sslDongHo.Size = new System.Drawing.Size(718, 17);
            this.sslDongHo.Spring = true;
            this.sslDongHo.TextAlign = System.Drawing.ContentAlignment.MiddleRight;
            // 
            // tmrDongHo
            // 
            this.tmrDongHo.Tick += new System.EventHandler(this.tmrDongHo_Tick);
            // 
            // FrmKaraoke
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(6F, 13F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(784, 582);
            this.Controls.Add(this.ssTrangThai);
            this.Controls.Add(this.btnLamMoi);
            this.Controls.Add(this.btnXoa);
            this.Controls.Add(this.btnSua);
            this.Controls.Add(this.btnThem);
            this.Controls.Add(this.grpAnh);
            this.Controls.Add(this.lblThanhTien);
            this.Controls.Add(this.chkThanhVien);
            this.Controls.Add(this.chkTraiCay);
            this.Controls.Add(this.grpKhungGio);
            this.Controls.Add(this.grpLoaiPhong);
            this.Controls.Add(this.grpThongTin);
            this.Controls.Add(this.lblThongKe);
            this.Controls.Add(this.lsvDanhSach);
            this.Controls.Add(this.lblTieuDe);
            this.Controls.Add(this.mnuChinh);
            this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
            this.MainMenuStrip = this.mnuChinh;
            this.MaximizeBox = false;
            this.Name = "FrmKaraoke";
            this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
            this.Text = "Đề 4 - Đặt phòng karaoke";
            this.Load += new System.EventHandler(this.FrmKaraoke_Load);
            this.mnuChinh.ResumeLayout(false);
            this.mnuChinh.PerformLayout();
            this.grpThongTin.ResumeLayout(false);
            this.grpThongTin.PerformLayout();
            this.grpLoaiPhong.ResumeLayout(false);
            this.grpLoaiPhong.PerformLayout();
            this.grpKhungGio.ResumeLayout(false);
            this.grpKhungGio.PerformLayout();
            this.grpAnh.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.picAnh)).EndInit();
            this.ssTrangThai.ResumeLayout(false);
            this.ssTrangThai.PerformLayout();
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        private System.Windows.Forms.MenuStrip mnuChinh;
        private System.Windows.Forms.ToolStripMenuItem mnuHeThong;
        private System.Windows.Forms.ToolStripMenuItem mnuLamMoi;
        private System.Windows.Forms.ToolStripMenuItem mnuThoat;
        private System.Windows.Forms.ToolStripMenuItem mnuChucNang;
        private System.Windows.Forms.ToolStripMenuItem mnuThem;
        private System.Windows.Forms.ToolStripMenuItem mnuSua;
        private System.Windows.Forms.ToolStripMenuItem mnuXoa;
        private System.Windows.Forms.ToolStripMenuItem mnuTroGiup;
        private System.Windows.Forms.ToolStripMenuItem mnuHuongDan;
        private System.Windows.Forms.Label lblTieuDe;
        private System.Windows.Forms.ListView lsvDanhSach;
        private System.Windows.Forms.ColumnHeader colMa;
        private System.Windows.Forms.ColumnHeader colTen;
        private System.Windows.Forms.ColumnHeader colLoai;
        private System.Windows.Forms.ColumnHeader colGio;
        private System.Windows.Forms.ColumnHeader colSoGio;
        private System.Windows.Forms.ColumnHeader colDichVu;
        private System.Windows.Forms.ColumnHeader colThanhTien;
        private System.Windows.Forms.Label lblThongKe;
        private System.Windows.Forms.GroupBox grpThongTin;
        private System.Windows.Forms.TextBox txtSoGio;
        private System.Windows.Forms.Label label3;
        private System.Windows.Forms.TextBox txtTenKhach;
        private System.Windows.Forms.Label label2;
        private System.Windows.Forms.TextBox txtMaDat;
        private System.Windows.Forms.Label label1;
        private System.Windows.Forms.GroupBox grpLoaiPhong;
        private System.Windows.Forms.RadioButton radParty;
        private System.Windows.Forms.RadioButton radVIP;
        private System.Windows.Forms.RadioButton radCouple;
        private System.Windows.Forms.RadioButton radThuong;
        private System.Windows.Forms.GroupBox grpKhungGio;
        private System.Windows.Forms.RadioButton radToi;
        private System.Windows.Forms.RadioButton radChieu;
        private System.Windows.Forms.RadioButton radSang;
        private System.Windows.Forms.CheckBox chkTraiCay;
        private System.Windows.Forms.CheckBox chkThanhVien;
        private System.Windows.Forms.Label lblThanhTien;
        private System.Windows.Forms.GroupBox grpAnh;
        private System.Windows.Forms.Button btnChonAnh;
        private System.Windows.Forms.PictureBox picAnh;
        private System.Windows.Forms.Button btnThem;
        private System.Windows.Forms.Button btnSua;
        private System.Windows.Forms.Button btnXoa;
        private System.Windows.Forms.Button btnLamMoi;
        private System.Windows.Forms.StatusStrip ssTrangThai;
        private System.Windows.Forms.ToolStripStatusLabel sslTrangThai;
        private System.Windows.Forms.ToolStripStatusLabel sslDongHo;
        private System.Windows.Forms.Timer tmrDongHo;
        private System.Windows.Forms.OpenFileDialog ofdAnh;
    }
}
rtyfydydy




using System;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace DeThiKaraoke
{
    public partial class FrmKaraoke : Form
    {
        public FrmKaraoke()
        {
            InitializeComponent();
        }

        // Mục 1: Khởi động mặc định & bật đồng hồ[span_9](start_span)[span_9](end_span)
        private void FrmKaraoke_Load(object sender, EventArgs e)
        {
            radThuong.Checked = true;[span_10](start_span)[span_10](end_span)
            radChieu.Checked = true;[span_11](start_span)[span_11](end_span)

            tmrDongHo.Interval = 1000;
            tmrDongHo.Start();[span_12](start_span)[span_12](end_span)

            TinhTien();
            CapNhatThongKe();[span_13](start_span)[span_13](end_span)
        }

        // Mục 12: Đồng hồ hiển thị góc phải[span_14](start_span)[span_14](end_span)
        private void tmrDongHo_Tick(object sender, EventArgs e)
        {
            sslDongHo.Text = DateTime.Now.ToString("HH:mm:ss  dd/MM/yyyy");[span_15](start_span)[span_15](end_span)
        }

        // Mục 3, 4: Tính tiền tự động & ràng buộc phòng Party[span_16](start_span)[span_16](end_span)
        private void TinhTien_Event(object sender, EventArgs e)
        {
            if (radParty.Checked)[span_17](start_span)[span_17](end_span)
            {
                radSang.Enabled = false;[span_18](start_span)[span_18](end_span)
                if (radSang.Checked) radChieu.Checked = true;[span_19](start_span)[span_19](end_span)
            }
            else
            {
                radSang.Enabled = true;[span_20](start_span)[span_20](end_span)
            }

            TinhTien();
        }

        private double TinhTien()
        {
            if (!int.TryParse(txtSoGio.Text.Trim(), out int gio) || gio < 1 || gio > 8)[span_21](start_span)[span_21](end_span)
            {
                lblThanhTien.Text = "0 VNĐ";[span_22](start_span)[span_22](end_span)
                return 0;
            }

            double donGia = radParty.Checked ? 400000 : radVIP.Checked ? 250000 : radCouple.Checked ? 180000 : 150000;[span_23](start_span)[span_23](end_span)
            double heSo = radSang.Checked ? 0.8 : radToi.Checked ? 1.2 : 1.0;[span_24](start_span)[span_24](end_span)
            double phuPhi = chkTraiCay.Checked ? 200000 : 0;[span_25](start_span)[span_25](end_span)

            double tong = (donGia * gio * heSo) + phuPhi;[span_26](start_span)[span_26](end_span)
            if (chkThanhVien.Checked) tong *= 0.9;[span_27](start_span)[span_27](end_span)

            lblThanhTien.Text = $"{tong:N0} VNĐ";[span_28](start_span)[span_28](end_span)
            return tong;
        }

        // Mục 2: Kiểm tra dữ liệu đầu vào[span_29](start_span)[span_29](end_span)
        private bool ValidateData(bool isThem)
        {
            string maDat = txtMaDat.Text.Trim();
            if (!Regex.IsMatch(maDat, @"^K\d{3}$"))[span_30](start_span)[span_30](end_span)
            {
                MessageBox.Show("Mã đặt phòng phải có dạng K kèm 3 chữ số (VD: K001)!", "Lỗi nhập liệu", MessageBoxButtons.OK, MessageBoxIcon.Warning);[span_31](start_span)[span_31](end_span)
                txtMaDat.Focus();[span_32](start_span)[span_32](end_span)
                return false;
            }

            if (isThem)
            {
                foreach (ListViewItem it in lsvDanhSach.Items)
                {
                    if (it.Text.Equals(maDat, StringComparison.OrdinalIgnoreCase))[span_33](start_span)[span_33](end_span)
                    {
                        MessageBox.Show("Mã đặt phòng đã tồn tại trong danh sách!", "Lỗi trùng mã", MessageBoxButtons.OK, MessageBoxIcon.Warning);[span_34](start_span)[span_34](end_span)
                        txtMaDat.Focus();[span_35](start_span)[span_35](end_span)
                        return false;
                    }
                }
            }

            if (string.IsNullOrWhiteSpace(txtTenKhach.Text))[span_36](start_span)[span_36](end_span)
            {
                MessageBox.Show("Tên khách hàng không được để trống!", "Lỗi nhập liệu", MessageBoxButtons.OK, MessageBoxIcon.Warning);[span_37](start_span)[span_37](end_span)
                txtTenKhach.Focus();[span_38](start_span)[span_38](end_span)
                return false;
            }

            if (!int.TryParse(txtSoGio.Text.Trim(), out int gio) || gio < 1 || gio > 8)[span_39](start_span)[span_39](end_span)
            {
                MessageBox.Show("Số giờ phải là số nguyên từ 1 đến 8!", "Lỗi nhập liệu", MessageBoxButtons.OK, MessageBoxIcon.Warning);[span_40](start_span)[span_40](end_span)
                txtSoGio.Focus();[span_41](start_span)[span_41](end_span)
                return false;
            }

            return true;
        }

        private string GetLoaiPhong() => radParty.Checked ? "Party" : radVIP.Checked ? "VIP" : radCouple.Checked ? "Couple" : "Thường";
        private string GetKhungGio() => radSang.Checked ? "Sáng" : radToi.Checked ? "Tối" : "Chiều";
        private string GetDichVu() => $"{(chkTraiCay.Checked ? "Trái cây, " : "")}{(chkThanhVien.Checked ? "Thành viên, " : "")}".TrimEnd(' ', ',');[span_42](start_span)[span_42](end_span)

        // Mục 5: Chọn ảnh[span_43](start_span)[span_43](end_span)
        private void btnChonAnh_Click(object sender, EventArgs e)
        {
            ofdAnh.Filter = "Ảnh (*.jpg;*.png;*.bmp)|*.jpg;*.png;*.bmp";[span_44](start_span)[span_44](end_span)[span_45](start_span)[span_45](end_span)
            if (ofdAnh.ShowDialog() == DialogResult.OK)[span_46](start_span)[span_46](end_span)
            {
                picAnh.ImageLocation = ofdAnh.FileName;[span_47](start_span)[span_47](end_span)
                picAnh.Tag = ofdAnh.FileName;[span_48](start_span)[span_48](end_span)
            }
        }

        // Mục 6: Thêm[span_49](start_span)[span_49](end_span)
        private void btnThem_Click(object sender, EventArgs e)
        {
            if (!ValidateData(true)) return;

            ListViewItem item = new ListViewItem(txtMaDat.Text.Trim());
            item.SubItems.Add(txtTenKhach.Text.Trim());
            item.SubItems.Add(GetLoaiPhong());
            item.SubItems.Add(GetKhungGio());
            item.SubItems.Add(txtSoGio.Text.Trim());
            item.SubItems.Add(GetDichVu());
            item.SubItems.Add(lblThanhTien.Text);[span_50](start_span)[span_50](end_span)

            item.Tag = picAnh.Tag;[span_51](start_span)[span_51](end_span)
            lsvDanhSach.Items.Add(item);[span_52](start_span)[span_52](end_span)

            CapNhatThongKe();[span_53](start_span)[span_53](end_span)
        }

        // Mục 7: Đổ dữ liệu từ ListView lên controls[span_54](start_span)[span_54](end_span)
        private void lsvDanhSach_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (lsvDanhSach.SelectedItems.Count == 0) return;
            ListViewItem it = lsvDanhSach.SelectedItems[0];[span_55](start_span)[span_55](end_span)

            txtMaDat.Text = it.SubItems[0].Text;
            txtMaDat.ReadOnly = true;[span_56](start_span)[span_56](end_span)
            txtTenKhach.Text = it.SubItems[1].Text;[span_57](start_span)[span_57](end_span)

            radParty.Checked = it.SubItems[2].Text == "Party";[span_58](start_span)[span_58](end_span)
            radVIP.Checked = it.SubItems[2].Text == "VIP";[span_59](start_span)[span_59](end_span)
            radCouple.Checked = it.SubItems[2].Text == "Couple";[span_60](start_span)[span_60](end_span)
            radThuong.Checked = it.SubItems[2].Text == "Thường";[span_61](start_span)[span_61](end_span)

            radSang.Checked = it.SubItems[3].Text == "Sáng";[span_62](start_span)[span_62](end_span)
            radToi.Checked = it.SubItems[3].Text == "Tối";[span_63](start_span)[span_63](end_span)
            radChieu.Checked = it.SubItems[3].Text == "Chiều";[span_64](start_span)[span_64](end_span)

            txtSoGio.Text = it.SubItems[4].Text;[span_65](start_span)[span_65](end_span)
            chkTraiCay.Checked = it.SubItems[5].Text.Contains("Trái cây");[span_66](start_span)[span_66](end_span)
            chkThanhVien.Checked = it.SubItems[5].Text.Contains("Thành viên");[span_67](start_span)[span_67](end_span)

            if (it.Tag != null && !string.IsNullOrEmpty(it.Tag.ToString()))[span_68](start_span)[span_68](end_span)
            {
                try
                {
                    picAnh.ImageLocation = it.Tag.ToString();[span_69](start_span)[span_69](end_span)
                    picAnh.Tag = it.Tag;[span_70](start_span)[span_70](end_span)
                }
                catch { picAnh.Image = null; }
            }
            else
            {
                picAnh.Image = null;[span_71](start_span)[span_71](end_span)
                picAnh.Tag = null;[span_72](start_span)[span_72](end_span)
            }

            TinhTien();
        }

        // Mục 8: Sửa[span_73](start_span)[span_73](end_span)
        private void btnSua_Click(object sender, EventArgs e)
        {
            if (lsvDanhSach.SelectedItems.Count == 0)
            {
                MessageBox.Show("Chưa chọn dòng để sửa!", "Thông báo", MessageBoxButtons.OK, MessageBoxIcon.Warning);[span_74](start_span)[span_74](end_span)
                return;
            }

            if (!ValidateData(false)) return;

            ListViewItem it = lsvDanhSach.SelectedItems[0];[span_75](start_span)[span_75](end_span)
            it.SubItems[1].Text = txtTenKhach.Text.Trim();
            it.SubItems[2].Text = GetLoaiPhong();
            it.SubItems[3].Text = GetKhungGio();
            it.SubItems[4].Text = txtSoGio.Text.Trim();
            it.SubItems[5].Text = GetDichVu();
            it.SubItems[6].Text = lblThanhTien.Text;[span_76](start_span)[span_76](end_span)
            it.Tag = picAnh.Tag;

            CapNhatThongKe();[span_77](start_span)[span_77](end_span)
            MessageBox.Show("Cập nhật thành công!", "Thông báo");
        }

        // Mục 8: Xóa[span_78](start_span)[span_78](end_span)
        private void btnXoa_Click(object sender, EventArgs e)
        {
            if (lsvDanhSach.SelectedItems.Count == 0)
            {
                MessageBox.Show("Chưa chọn dòng cần xóa!", "Thông báo", MessageBoxButtons.OK, MessageBoxIcon.Warning);[span_79](start_span)[span_79](end_span)
                return;
            }

            DialogResult dr = MessageBox.Show("Bạn có muốn xóa mục này?", "Xác nhận", MessageBoxButtons.YesNo, MessageBoxIcon.Question);[span_80](start_span)[span_80](end_span)
            if (dr == DialogResult.Yes)[span_81](start_span)[span_81](end_span)
            {
                lsvDanhSach.Items.Remove(lsvDanhSach.SelectedItems[0]);[span_82](start_span)[span_82](end_span)
                btnLamMoi_Click(sender, e);
                CapNhatThongKe();[span_83](start_span)[span_83](end_span)
            }
        }

        // Mục 9: Làm mới[span_84](start_span)[span_84](end_span)
        private void btnLamMoi_Click(object sender, EventArgs e)
        {
            txtMaDat.ReadOnly = false;[span_85](start_span)[span_85](end_span)
            txtMaDat.Clear();[span_86](start_span)[span_86](end_span)
            txtTenKhach.Clear();[span_87](start_span)[span_87](end_span)
            txtSoGio.Clear();[span_88](start_span)[span_88](end_span)

            chkTraiCay.Checked = false;[span_89](start_span)[span_89](end_span)
            chkThanhVien.Checked = false;[span_90](start_span)[span_90](end_span)

            picAnh.Image = null;[span_91](start_span)[span_91](end_span)
            picAnh.Tag = null;[span_92](start_span)[span_92](end_span)

            radThuong.Checked = true;[span_93](start_span)[span_93](end_span)
            radChieu.Checked = true;[span_94](start_span)[span_94](end_span)

            lblThanhTien.Text = "0 VNĐ";
            txtMaDat.Focus();[span_95](start_span)[span_95](end_span)
        }

        // Mục 10: Cập nhật thống kê[span_96](start_span)[span_96](end_span)
        private void CapNhatThongKe()
        {
            double tongTien = 0;
            foreach (ListViewItem it in lsvDanhSach.Items)
            {
                string raw = it.SubItems[6].Text.Replace(" VNĐ", "").Replace(",", "").Trim();[span_97](start_span)[span_97](end_span)
                if (double.TryParse(raw, out double val))
                {
                    tongTien += val;
                }
            }

            lblThongKe.Text = $"Tổng số lượt: {lsvDanhSach.Items.Count}  |  Tổng doanh thu: {tongTien:N0} VNĐ";[span_98](start_span)[span_98](end_span)
        }

        // Mục 11: MenuStrip[span_99](start_span)[span_99](end_span)
        private void mnuLamMoi_Click(object sender, EventArgs e) => btnLamMoi_Click(sender, e);[span_100](start_span)[span_100](end_span)
        private void mnuThem_Click(object sender, EventArgs e) => btnThem_Click(sender, e);[span_101](start_span)[span_101](end_span)
        private void mnuSua_Click(object sender, EventArgs e) => btnSua_Click(sender, e);[span_102](start_span)[span_102](end_span)
        private void mnuXoa_Click(object sender, EventArgs e) => btnXoa_Click(sender, e);[span_103](start_span)[span_103](end_span)

        private void mnuThoat_Click(object sender, EventArgs e)
        {
            if (MessageBox.Show("Bạn có muốn thoát?", "Xác nhận", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)[span_104](start_span)[span_104](end_span)
            {
                Application.Exit();
            }
        }

        private void mnuHuongDan_Click(object sender, EventArgs e)
        {
            MessageBox.Show("Họ và tên: [Điền tên bạn]\nMSSV: [Điền mã số SV]", "Giới thiệu sinh viên");[span_105](start_span)[span_105](end_span)
        }
    }
}


