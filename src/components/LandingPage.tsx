import { ArrowRight, BarChart3, Boxes, Check, FileSpreadsheet, Search, ShieldCheck, Sparkles, Zap } from 'lucide-react';

interface LandingPageProps {
  onStart: () => void;
  onLogin: () => void;
}

export function LandingPage({ onStart, onLogin }: LandingPageProps) {
  return (
    <div id="landing" className="view active">
      <header className="nav container">
        <a className="brand landing-brand" href="#top" aria-label="VoltRAB beranda">
          <span className="brand-mark"><Zap aria-hidden="true" /></span>
          <span className="brand-copy"><strong>VoltRAB</strong><small>Electrical Cost Intelligence</small></span>
          <span className="beta-chip">BETA</span>
        </a>
        <nav className="nav-links" aria-label="Navigasi utama">
          <a href="#cara-kerja">Cara Kerja</a>
          <a href="#fitur">Keunggulan</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="nav-actions">
          <button className="btn ghost login-btn" type="button" onClick={onLogin}>Masuk</button>
          <button className="btn primary nav-cta" type="button" onClick={onStart}>
            <Zap aria-hidden="true" /> Mulai Menghitung <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </header>

      <main id="top">
        <section className="hero container">
          <div className="hero-copy">
            <div className="eyebrow"><span /> PLATFORM RAB KELISTRIKAN</div>
            <h1>Hitung RAB Kelistrikan <em>Lebih Cepat &amp; Akurat</em></h1>
            <p>Susun estimasi biaya proyek, kelola komponen pekerjaan, dan siapkan laporan RAB profesional tanpa proses manual yang rumit.</p>
            <div className="hero-actions">
              <a className="btn primary large" href="#cara-kerja">Pelajari Cara Kerja <ArrowRight aria-hidden="true" /></a>
              <button className="btn secondary large" type="button" onClick={onStart}>Mulai Hitung Sekarang <ArrowRight aria-hidden="true" /></button>
            </div>
            <div className="trust-row">
              <div className="avatars"><span>AH</span><span>DP</span><span>RF</span><span>+</span></div>
              <p><strong>Lebih praktis</strong><br />untuk proyek kelistrikan Anda</p>
            </div>
          </div>

          <div className="hero-visual" aria-label="Pratinjau dashboard VoltRAB">
            <div className="glow" />
            <div className="mock-window">
              <div className="mock-top"><span className="mock-brand"><Zap /> VoltRAB</span><div className="mock-search"><Search /> Cari proyek...</div><span className="mock-avatar">FH</span></div>
              <div className="mock-body">
                <aside><i /><i /><i /><i /><i /></aside>
                <div className="mock-content"><small>RINGKASAN PROYEK</small><h3>Dashboard RAB</h3><div className="mock-stats"><div><b>Rp 284,5 jt</b><span>Total estimasi</span></div><div><b>72%</b><span>Progres data</span></div><div><b>128</b><span>Item pekerjaan</span></div></div><div className="chart"><div className="bars"><i /><i /><i /><i /><i /><i /><i /></div><span>Distribusi biaya pekerjaan</span></div></div>
              </div>
            </div>
            <div className="floating-card cost"><span className="float-icon"><Sparkles /></span><div><small>Estimasi lebih efisien</small><b>Siap dipresentasikan</b></div></div>
            <div className="floating-card status"><span><Check /></span><div><small>Status proyek</small><b>Perhitungan tersimpan</b></div></div>
          </div>
        </section>

        <section className="logo-strip"><div className="container"><span>Dirancang untuk kebutuhan</span><b>ENGINEER</b><b>KONTRAKTOR</b><b>ESTIMATOR</b><b>KONSULTAN</b></div></section>

        <section id="fitur" className="section container">
          <div className="section-heading"><div><div className="eyebrow"><span /> KENAPA VOLTRAB</div><h2>Semua yang dibutuhkan untuk menyusun RAB.</h2></div><p>Dari input data proyek hingga laporan akhir, setiap tahap dibuat lebih ringkas dan mudah dipantau.</p></div>
          <div className="feature-grid">
            <article className="feature featured"><div className="feature-icon"><BarChart3 /></div><h3>Perhitungan lebih terstruktur</h3><p>Susun pekerjaan, volume, material, dan tenaga dalam alur yang konsisten untuk mengurangi kesalahan.</p><div className="mini-table"><span>Instalasi Penerangan <b>Rp 48.250.000</b></span><span>Panel &amp; Distribusi <b>Rp 72.800.000</b></span><span>Grounding System <b>Rp 18.450.000</b></span></div></article>
            <article className="feature"><div className="feature-icon"><Boxes /></div><h3>Dashboard proyek</h3><p>Pantau ringkasan biaya, progres kelengkapan, dan komposisi pekerjaan secara cepat.</p></article>
            <article className="feature"><div className="feature-icon"><ShieldCheck /></div><h3>Deteksi Simbol Denah</h3><p>Identifikasi saklar, stop kontak, dan titik lampu dari gambar denah langsung di dalam susunan pekerjaan proyek.</p></article>
            <article className="feature"><div className="feature-icon"><FileSpreadsheet /></div><h3>Laporan siap pakai</h3><p>Simpan hasil perhitungan dan ekspor laporan Excel yang rapi untuk evaluasi proyek.</p></article>
          </div>
        </section>

        <section id="cara-kerja" className="workflow-section"><div className="container workflow"><div><div className="eyebrow light"><span /> ALUR KERJA SEDERHANA</div><h2>Dari data proyek menjadi estimasi yang siap digunakan.</h2><p>VoltRAB memandu proses perhitungan dalam tahapan yang jelas, sehingga fokus Anda tetap pada keputusan teknis.</p><button className="btn white" type="button" onClick={onStart}>Mulai proyek pertama <ArrowRight /></button></div><ol><li><span>01</span><div><b>Informasi Proyek</b><p>Masukkan identitas dan informasi dasar pekerjaan.</p></div></li><li><span>02</span><div><b>Susunan Pekerjaan</b><p>Kelola lantai, ruangan, komponen, dan deteksi simbol denah.</p></div></li><li><span>03</span><div><b>Ringkasan RAB</b><p>Periksa biaya, simpan hasil, dan ekspor laporan.</p></div></li></ol></div></section>

        <section className="cta container"><div><div className="eyebrow"><span /> WORKSPACE RAB PROFESIONAL</div><h2>Satu tempat untuk seluruh proses estimasi proyek.</h2><p>Mulai dari data proyek sampai laporan akhir, seluruh pekerjaan tersimpan rapi dan mudah ditinjau kembali.</p></div><div className="cta-checks"><span><Check /> Data proyek terorganisir</span><span><Check /> Ringkasan biaya otomatis</span><span><Check /> Deteksi denah terintegrasi</span><span><Check /> Laporan siap digunakan</span></div><button className="btn white large" type="button" onClick={onStart}>Mulai Hitung Sekarang <ArrowRight /></button></section>

        <section id="faq" className="faq-section container">
          <div className="section-label">FAQ</div><h2>Pertanyaan yang Sering Diajukan</h2>
          <div className="faq-list">
            <details open><summary>Apa itu VoltRAB?</summary><p>VoltRAB membantu penyusunan Rencana Anggaran Biaya pekerjaan kelistrikan secara lebih terstruktur, cepat, dan mudah dipantau.</p></details>
            <details><summary>Apakah proyek tersimpan otomatis?</summary><p>Ya. Setelah masuk, perubahan proyek tersimpan otomatis ke workspace akun Anda.</p></details>
            <details><summary>Apakah VoltRAB dapat mendeteksi simbol pada gambar denah?</summary><p>Ya. Deteksi simbol denah tersedia langsung pada setiap ruangan di tahap susunan pekerjaan.</p></details>
            <details><summary>Apakah hasilnya dapat diekspor?</summary><p>Ringkasan RAB dapat disimpan sebagai laporan dan diekspor ke Excel.</p></details>
          </div>
        </section>
      </main>

      <footer><div className="container"><a className="brand" href="#top"><span className="brand-mark"><Zap /></span><span>VoltRAB</span></a><p>Solusi estimasi RAB kelistrikan yang cepat, rapi, dan terukur.</p><span>© 2026 VoltRAB</span></div></footer>
    </div>
  );
}
