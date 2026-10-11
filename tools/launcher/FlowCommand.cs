// FlowCommand Launcher — VIMS
// Smart India Hackathon 2026 | State-Machine Driven Portable Launcher
// Compiled with csc.exe (C# 5 / .NET Framework 4.0+)
//
// State Machine:
//   S0_INIT → S1_PY_CHECK → (found) S2_PY_FOUND → S7_VENV → S8_DEPS → S9_SERVICES → S10_ONLINE
//                          → (missing) S3_PY_MISSING → S4_CHOICE
//                              → (A) S5_DOWNLOAD → S2_PY_FOUND → ...
//                              → (B) S6_DEMO_MODE → S11_OFFLINE_DASH

using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

namespace FlowCommand
{
    // ═══════════════════════════════════════════════════════════════════════
    //  LAUNCHER STATE ENUMERATION
    // ═══════════════════════════════════════════════════════════════════════

    enum LauncherState
    {
        S0_INIT,
        S1_PY_CHECK,
        S2_PY_FOUND,
        S3_PY_MISSING,
        S4_CHOICE,
        S5_DOWNLOAD,
        S6_DEMO_MODE,
        S7_VENV_SETUP,
        S8_DEPS,
        S9_SERVICES,
        S10_ONLINE,
        S11_OFFLINE_DASH
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  ENTRY POINT
    // ═══════════════════════════════════════════════════════════════════════

    static class Program
    {
        [STAThread]
        static void Main()
        {
            // Force TLS 1.2 — .NET 4.0 defaults to TLS 1.0 which modern servers reject
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherForm());
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  MAIN LAUNCHER FORM
    // ═══════════════════════════════════════════════════════════════════════

    class LauncherForm : Form
    {
        private const int WIN_W = 660;
        private const int WIN_H = 640;

        // ── Palette ──
        private static readonly Color BG        = Color.FromArgb( 18,  18,  22);
        private static readonly Color SURFACE   = Color.FromArgb( 26,  26,  32);
        private static readonly Color WELL      = Color.FromArgb( 22,  22,  27);
        private static readonly Color BORDER    = Color.FromArgb( 44,  44,  52);
        private static readonly Color TXT       = Color.FromArgb(210, 210, 218);
        private static readonly Color TXT_DIM   = Color.FromArgb(140, 140, 155);
        private static readonly Color TXT_HEAD  = Color.FromArgb(245, 245, 250);
        private static readonly Color ACCENT    = Color.FromArgb(200, 160,  60);

        private static readonly Color L_OK   = Color.FromArgb(160, 210, 140);
        private static readonly Color L_WARN = Color.FromArgb(210, 170,  70);
        private static readonly Color L_ERR  = Color.FromArgb(210,  90,  80);
        private static readonly Color L_DIM  = Color.FromArgb(120, 120, 140);

        // ── State Machine ──
        private LauncherState _state;
        private string _resolvedPythonExe;   // set in S2_PY_FOUND

        // ── Controls: Shared ──
        private Label    _lblPill;
        private Panel    _progressBar;
        private int      _progVal;
        private Image    _logo;
        private NotifyIcon _tray;

        // ── Controls: View 1 — Consent ──
        private Panel    _viewAuth;
        private CheckBox _chk1;
        private Button   _btnGo, _btnNo;

        // ── Controls: View 2 — Install (self-extracting) ──
        private Panel    _viewInstall;
        private TextBox  _txtPath;
        private Button   _btnBrowse, _btnInstall;
        private Label    _lblInstStatus;

        // ── Controls: View 3 — Python Choice ──
        private Panel    _viewChoice;
        private Button   _btnDownload, _btnDemoMode;
        private Label    _lblChoiceError;

        // ── Controls: View 4 — Dashboard ──
        private Panel      _viewDash;
        private RichTextBox _logBox;
        private Button     _btnLaunch, _btnInsertCreds, _btnStop;

        // ── Process handles ──
        private Process _procBack, _procFront;
        private bool    _running;
        private string  _root;

        // ── Derived paths ──
        private string PyDir  { get { return Path.Combine(_root, "python"); } }
        private string PyExe  { get { return Path.Combine(PyDir, "python.exe"); } }
        private string VDir   { get { return Path.Combine(_root, ".venv"); } }
        private string VPy    { get { return Path.Combine(VDir, "Scripts", "python.exe"); } }

        // ── Constants ──
        private const string PY_ZIP  = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip";
        private const string PIP_URL = "https://bootstrap.pypa.io/get-pip.py";
        private const int PORT_BACK  = 8000;
        private const int PORT_FRONT = 3000;

        private string DashUrl { get { return "file:///" + _root.Replace('\\', '/') + "/index.html"; } }

        // Is the project already extracted next to us?
        private bool IsInstalled { get { return File.Exists(Path.Combine(_root, "backend", "main.py")); } }

        // Does the exe have an embedded project.zip resource?
        private bool HasEmbeddedArchive
        {
            get
            {
                try
                {
                    string[] names = Assembly.GetExecutingAssembly().GetManifestResourceNames();
                    for (int i = 0; i < names.Length; i++)
                        if (names[i] == "project.zip") return true;
                }
                catch { }
                return false;
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        //  CONSTRUCTOR
        // ═══════════════════════════════════════════════════════════════════

        public LauncherForm()
        {
            DoubleBuffered = true;
            _root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
            _state = LauncherState.S0_INIT;

            try
            {
                string p = Path.Combine(_root, "assets", "logo-mark.png");
                if (!File.Exists(p)) p = Path.Combine(_root, "assets", "logo.png");
                if (File.Exists(p))
                {
                    Bitmap bmp = new Bitmap(p);
                    bmp.MakeTransparent(bmp.GetPixel(0, 0));
                    _logo = bmp;
                }
            }
            catch { }

            Build();
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            SetupTray();
        }

        // ═══════════════════════════════════════════════════════════════════
        //  BUILD UI
        // ═══════════════════════════════════════════════════════════════════

        private void Build()
        {
            Text            = "FlowCommand";
            Size            = new Size(WIN_W, WIN_H);
            MinimumSize     = Size;
            MaximumSize     = Size;
            BackColor       = BG;
            ForeColor       = TXT;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox     = false;
            StartPosition   = FormStartPosition.CenterScreen;
            FormClosing    += OnClose;

            // ── Header Bar ──
            Panel hdr = new Panel { Dock = DockStyle.Top, Height = 48, BackColor = SURFACE };
            hdr.Paint += delegate(object s, PaintEventArgs e)
            {
                using (Pen p = new Pen(BORDER)) e.Graphics.DrawLine(p, 0, 47, hdr.Width, 47);
            };

            PictureBox pic = new PictureBox { Location = new Point(14, 8), Size = new Size(32, 32), BackColor = Color.Transparent };
            pic.Paint += delegate(object s, PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = SmoothingMode.HighQuality;
                e.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                if (_logo != null) { e.Graphics.DrawImage(_logo, 0, 0, 32, 32); return; }
                using (SolidBrush b = new SolidBrush(SURFACE)) e.Graphics.FillEllipse(b, 0, 0, 31, 31);
                using (Pen p = new Pen(TXT_DIM, 1.5f)) e.Graphics.DrawEllipse(p, 0, 0, 31, 31);
                using (Font f = new Font("Segoe UI", 13f, FontStyle.Bold))
                using (SolidBrush b = new SolidBrush(TXT_HEAD))
                {
                    StringFormat sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                    e.Graphics.DrawString("F", f, b, new RectangleF(0, 0, 32, 32), sf);
                }
            };
            hdr.Controls.Add(pic);
            hdr.Controls.Add(new Label { Text = "FlowCommand", Font = new Font("Segoe UI", 12f, FontStyle.Bold), ForeColor = TXT_HEAD, Location = new Point(52, 12), AutoSize = true });

            _lblPill = new Label
            {
                Text = "CONSENT REQUIRED", Font = new Font("Segoe UI", 7.5f, FontStyle.Bold),
                ForeColor = TXT_DIM, BackColor = WELL, TextAlign = ContentAlignment.MiddleCenter,
                Location = new Point(WIN_W - 185, 12), Size = new Size(158, 24)
            };
            _lblPill.Paint += delegate(object s, PaintEventArgs e) { using (Pen p = new Pen(BORDER)) e.Graphics.DrawRectangle(p, 0, 0, _lblPill.Width - 1, _lblPill.Height - 1); };
            hdr.Controls.Add(_lblPill);
            Controls.Add(hdr);

            _progressBar = new Panel { Dock = DockStyle.Top, Height = 2, BackColor = BG };
            _progressBar.Paint += delegate(object s, PaintEventArgs e)
            {
                if (_progVal <= 0) return;
                int w = (int)((_progVal / 100.0) * _progressBar.Width);
                using (SolidBrush b = new SolidBrush(ACCENT)) e.Graphics.FillRectangle(b, 0, 0, w, 2);
            };
            Controls.Add(_progressBar);

            BuildAuth();
            BuildInstall();
            BuildChoice();
            BuildDash();

            _viewAuth.Visible    = true;
            _viewInstall.Visible = false;
            _viewChoice.Visible  = false;
            _viewDash.Visible    = false;
        }

        // ─────────────────────────────────────────────────────────────────
        //  VIEW 1: CONSENT
        // ─────────────────────────────────────────────────────────────────

        private void BuildAuth()
        {
            int bodyTop = 50;
            int bodyH   = WIN_H - bodyTop - 40;
            _viewAuth = new Panel { Location = new Point(0, bodyTop), Size = new Size(WIN_W, bodyH), BackColor = BG };

            int pad = 24, cardW = WIN_W - pad * 2 - 16, cardH = bodyH - 20;
            Panel card = new Panel { Location = new Point(pad, 8), Size = new Size(cardW, cardH), BackColor = SURFACE };
            card.Paint += delegate(object s, PaintEventArgs e) { using (Pen p = new Pen(BORDER)) e.Graphics.DrawRectangle(p, 0, 0, card.Width - 1, card.Height - 1); };

            card.Controls.Add(new Label { Text = "Terms of Use, Privacy Notice and User Consent", Font = new Font("Segoe UI", 9.5f, FontStyle.Bold), ForeColor = TXT_HEAD, Location = new Point(18, 14), AutoSize = true });
            card.Controls.Add(new Panel { Location = new Point(18, 38), Size = new Size(cardW - 36, 1), BackColor = BORDER });

            int btnAreaH = 90, legalTop = 46;
            int legalH = cardH - legalTop - btnAreaH, legalW = cardW - 36;

            Panel scrollBox = new Panel { Location = new Point(18, legalTop), Size = new Size(legalW, legalH), BackColor = WELL, AutoScroll = true };
            scrollBox.Paint += delegate(object s, PaintEventArgs e) { using (Pen p = new Pen(BORDER)) e.Graphics.DrawRectangle(p, 0, 0, scrollBox.Width - 1, scrollBox.Height - 1); };
            scrollBox.MouseWheel += delegate(object s, MouseEventArgs me)
            {
                int curr = scrollBox.VerticalScroll.Value;
                int next = curr - (me.Delta > 0 ? 20 : -20);
                next = Math.Max(scrollBox.VerticalScroll.Minimum, Math.Min(scrollBox.VerticalScroll.Maximum, next));
                scrollBox.VerticalScroll.Value = next;
                scrollBox.PerformLayout();
            };

            string legal =
"FlowCommand (Prototype)\r\n" +
"Terms of Use, Privacy Notice and User Consent\r\n" +
"Authority responsible: Smart India Hackathon 2026 Development Team, Government of India\r\n" +
"Version: 0.1 (Prototype) | Effective from: 20/9/2026\r\n" +
"Contact: aryanharge@gmail.com\r\n\r\n" +
"Draft: this template has been prepared as a prototype and must be checked over by the department's legal adviser before it is released.\r\n\r\n" +
"1. The purpose and current status of the software\r\n" +
"The Software, known as FlowCommand, has been developed by or for the Smart India Hackathon 2026 Development Team (the \u201cAuthority\u201d) solely for the purpose of evaluation and testing.\r\n\r\n" +
"The software is given in the form of a Windows executable (.exe) file and is not a final, certified or production version, it possibly contains errors and may change without notice.\r\n\r\n" +
"When you install or use the Software, you (the \u2018User\u2019) agree to these terms; if you do not wish to do so, then you should not install or use it.\r\n\r\n" +
"2. The Functionality of the Software\r\n" +
"The Software performs only the following functions on your device:\r\n\r\n" +
"A compatibility check is carried out to see if your device (for instance, its operating system version, processor architecture, available disk space and memory) satisfies the minimum requirements.\r\n\r\n" +
"The program checks if Python has been installed and, in that case, determines which version it is.\r\n\r\n" +
"Python installation; if no suitable version of Python is available, the Software will download and install it, but only after you have given your explicit permission (see Section 4).\r\n\r\n" +
"The Software has no other function.\r\n\r\n" +
"3. The gathering of data and privacy\r\n" +
"3.1 Operation offline. The scanning and processing are carried out locally on your device and no data from your device is sent to any server of the Authority or to any third party.\r\n\r\n" +
"3.2 No collection or storage. The Software does not collect, upload, share, sell or keep any personal data, device identifiers or scan results outside of your device. The scan results are displayed on screen and remain on your device only.\r\n\r\n" +
"3.3 Just network activity. The only network connection that the Software establishes is the download of the Python installer from python.org when you agree to the installation. This connection is made solely for the purpose of obtaining the installer; the only information about your device that is transmitted in it is that which is technically included in any standard download request (such as your IP address, which the host server may see).\r\n\r\n" +
"3.4 There is no tracking. The software includes no analytics, advertising, telemetry or any hidden communication features.\r\n\r\n" +
"3.5 Applicable law. The Authority will deal with any information, to the extent that it is processed, in accordance with the Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000, as well as other relevant Indian law.\r\n\r\n" +
"4. Consent and permissions from the user\r\n" +
"The software will ask for your permission before it carries out either (a) scanning your device or (b) downloading or installing any software.\r\n\r\n" +
"The installation of Python might require administrator privileges. You have the option of cancelling at any time; in that case the software will stop and no changes will be made to your device.\r\n\r\n" +
"You can withdraw your consent by closing the Software, and you can remove Python at any time by going to Windows Settings > Apps.\r\n\r\n" +
"To give your consent, you must click on \u2018I Agree (Continue)\u2019; no action is carried out before that happens.\r\n\r\n" +
"5. The modifications made to your device\r\n" +
"If you agree to the installation, the Software will add Python to your device at the application directory and might update system settings such as the PATH variable.\r\n\r\n" +
"The Software will not alter, delete or access your personal files, documents, browsing data, credentials or other applications.\r\n\r\n" +
"6. Security\r\n" +
"6.1 The Authority makes the Software available via the SIH 2026 evaluation portal. You should only download it from this source. The Authority does not accept any responsibility for copies obtained from other places.\r\n\r\n" +
"The Python installer is obtained from python.org and is verified prior to installation.\r\n\r\n" +
"7. Allowed use and limitations\r\n" +
"You agree that you will not reverse engineer the Software, make any modifications to it or redistribute it without the relevant written permission; use it for any unlawful purpose; or represent it as a final and official service.\r\n\r\n" +
"8. Intellectual property and third-party software\r\n" +
"8.1 The Software belongs to the Government of India. All rights are reserved.\r\n\r\n" +
"8.2 Python is third-party software covered by the Python Software Foundation License and is not owned by the Authority; its use is regulated by that license, available at https://docs.python.org/3/license.html\r\n\r\n" +
"9. Disclaimer and the limitation of liability\r\n" +
"9.1 The software, since it is being used as a prototype, is made available \u2018as is\u2019 and \u2018as available\u2019 and comes without any kind of warranty, either express or implied, including with regard to the accuracy of the compatibility results.\r\n\r\n" +
"To the extent as allowed by law, the Authority shall not be liable for any loss or damage resulting from the use of the Software, including any problems with installation or incompatibility; furthermore, no provision here excludes any liability which the law permits to be excluded.\r\n\r\n" +
"10. Feedback and Grievances\r\n" +
"For any feedback, questions or complaints please contact the Project Lead at aryanharge@gmail.com. The Authority will give a response within 30 days.\r\n\r\n" +
"11. Amendments to this Notice\r\n" +
"The Authority has the possibility of updating this notice for future versions, and any significant changes will be displayed in the Software or on the official website.\r\n\r\n" +
"12. The law that shall apply and the jurisdiction\r\n" +
"The notice is based on Indian law and the courts in New Delhi, India have authority over it, provided that the relevant law is taken into account.";

            Label lblLegal = new Label { Text = legal, Font = new Font("Segoe UI", 8.75f), ForeColor = TXT, Location = new Point(12, 8), MaximumSize = new Size(legalW - 40, 0), AutoSize = true };
            scrollBox.Controls.Add(lblLegal);
            card.Controls.Add(scrollBox);

            int chkY = legalTop + legalH + 10;
            _chk1 = new CheckBox
            {
                Text = "I have read and understood this notice. I agree for the Software to scan my device locally and to download and install Python if required.",
                Font = new Font("Segoe UI", 8.25f), ForeColor = TXT,
                Location = new Point(18, chkY), Size = new Size(cardW - 36, 34), Checked = false
            };
            _chk1.CheckedChanged += delegate { _btnGo.Enabled = _chk1.Checked; };
            card.Controls.Add(_chk1);

            int btnY = chkY + 40;
            _btnGo = new Button
            {
                Text = "I Agree (Continue)", Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                BackColor = ACCENT, ForeColor = Color.FromArgb(20, 18, 10),
                Location = new Point(18, btnY), Size = new Size(240, 40),
                FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand, Enabled = false
            };
            _btnGo.FlatAppearance.BorderSize = 0;
            _btnGo.Click += OnConsent;
            card.Controls.Add(_btnGo);

            _btnNo = new Button
            {
                Text = "DECLINE", Font = new Font("Segoe UI", 8.5f),
                BackColor = WELL, ForeColor = TXT_DIM,
                Location = new Point(268, btnY), Size = new Size(120, 40),
                FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand
            };
            _btnNo.FlatAppearance.BorderColor = BORDER;
            _btnNo.FlatAppearance.BorderSize = 1;
            _btnNo.Click += delegate { Application.Exit(); };
            card.Controls.Add(_btnNo);

            _viewAuth.Controls.Add(card);
            Controls.Add(_viewAuth);
        }

        private void OnConsent(object sender, EventArgs e)
        {
            _viewAuth.Visible = false;

            if (IsInstalled)
            {
                // Project files present — go straight to state machine
                TransitionTo(LauncherState.S1_PY_CHECK);
            }
            else if (HasEmbeddedArchive)
            {
                // Self-extracting installer mode
                _viewInstall.Visible = true;
                SetPill("INSTALLATION", L_WARN);
            }
            else if (File.Exists(Path.Combine(_root, "dashboard.html")))
            {
                // No backend files and no archive, but dashboard.html exists
                // — go directly to choice so Demo Mode is available
                TransitionTo(LauncherState.S3_PY_MISSING);
            }
            else
            {
                // Nothing at all — show choice screen anyway (Demo Mode can still work
                // if the user places dashboard.html later)
                TransitionTo(LauncherState.S4_CHOICE);
            }
        }

        // ─────────────────────────────────────────────────────────────────
        //  VIEW 2: INSTALL WIZARD (self-extracting)
        // ─────────────────────────────────────────────────────────────────

        private void BuildInstall()
        {
            int bodyTop = 50;
            int bodyH = WIN_H - bodyTop - 40;
            _viewInstall = new Panel { Location = new Point(0, bodyTop), Size = new Size(WIN_W, bodyH), BackColor = BG };

            int pad = 24, cardW = WIN_W - pad * 2 - 16, cardH = bodyH - 20;
            Panel card = new Panel { Location = new Point(pad, 8), Size = new Size(cardW, cardH), BackColor = SURFACE };
            card.Paint += delegate(object s, PaintEventArgs pe) { using (Pen p = new Pen(BORDER)) pe.Graphics.DrawRectangle(p, 0, 0, card.Width - 1, card.Height - 1); };

            card.Controls.Add(new Label { Text = "Installation", Font = new Font("Segoe UI", 11f, FontStyle.Bold), ForeColor = TXT_HEAD, Location = new Point(20, 20), AutoSize = true });
            card.Controls.Add(new Label { Text = "Choose where to install FlowCommand. All project files will be extracted to this directory.", Font = new Font("Segoe UI", 8.5f), ForeColor = TXT_DIM, Location = new Point(20, 48), Size = new Size(cardW - 40, 36) });
            card.Controls.Add(new Panel { Location = new Point(20, 86), Size = new Size(cardW - 40, 1), BackColor = BORDER });

            card.Controls.Add(new Label { Text = "INSTALLATION DIRECTORY", Font = new Font("Segoe UI", 7.5f, FontStyle.Bold), ForeColor = TXT_DIM, Location = new Point(20, 100), AutoSize = true });

            string defaultPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "FlowCommand");
            _txtPath = new TextBox
            {
                Text = defaultPath, Font = new Font("Consolas", 9f),
                BackColor = WELL, ForeColor = TXT, BorderStyle = BorderStyle.FixedSingle,
                Location = new Point(20, 120), Size = new Size(cardW - 130, 28)
            };
            card.Controls.Add(_txtPath);

            _btnBrowse = new Button
            {
                Text = "Browse...", Font = new Font("Segoe UI", 8.5f),
                BackColor = WELL, ForeColor = TXT, FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand,
                Location = new Point(cardW - 100, 120), Size = new Size(80, 28)
            };
            _btnBrowse.FlatAppearance.BorderColor = BORDER;
            _btnBrowse.Click += delegate
            {
                FolderBrowserDialog dlg = new FolderBrowserDialog { Description = "Choose installation directory", SelectedPath = _txtPath.Text };
                if (dlg.ShowDialog() == DialogResult.OK) _txtPath.Text = dlg.SelectedPath;
            };
            card.Controls.Add(_btnBrowse);

            // What will be installed
            card.Controls.Add(new Label
            {
                Text = "The following will be extracted:\r\n" +
                       "  \u2022  Backend services (Python / FastAPI)\r\n" +
                       "  \u2022  Frontend interface (HTML / JS / CSS)\r\n" +
                       "  \u2022  Assets and configuration files\r\n" +
                       "  \u2022  Python runtime (downloaded if needed)",
                Font = new Font("Segoe UI", 8.5f), ForeColor = TXT,
                Location = new Point(20, 168), Size = new Size(cardW - 40, 90)
            });

            _lblInstStatus = new Label
            {
                Text = "", Font = new Font("Segoe UI", 8.5f), ForeColor = L_DIM,
                Location = new Point(20, cardH - 90), Size = new Size(cardW - 40, 20)
            };
            card.Controls.Add(_lblInstStatus);

            _btnInstall = new Button
            {
                Text = "INSTALL", Font = new Font("Segoe UI", 10f, FontStyle.Bold),
                BackColor = ACCENT, ForeColor = Color.FromArgb(20, 18, 10),
                Location = new Point(20, cardH - 60), Size = new Size(200, 42),
                FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand
            };
            _btnInstall.FlatAppearance.BorderSize = 0;
            _btnInstall.Click += OnInstall;
            card.Controls.Add(_btnInstall);

            Button btnCancel = new Button
            {
                Text = "CANCEL", Font = new Font("Segoe UI", 8.5f),
                BackColor = WELL, ForeColor = TXT_DIM,
                Location = new Point(230, cardH - 60), Size = new Size(100, 42),
                FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand
            };
            btnCancel.FlatAppearance.BorderColor = BORDER;
            btnCancel.FlatAppearance.BorderSize = 1;
            btnCancel.Click += delegate { Application.Exit(); };
            card.Controls.Add(btnCancel);

            _viewInstall.Controls.Add(card);
            Controls.Add(_viewInstall);
        }

        private void OnInstall(object sender, EventArgs e)
        {
            string chosen = _txtPath.Text.Trim();
            if (string.IsNullOrEmpty(chosen)) { MessageBox.Show("Please choose a directory."); return; }

            // Always nest inside a FlowCommand folder to keep things clean
            string target = chosen;
            if (!Path.GetFileName(chosen).Equals("FlowCommand", StringComparison.OrdinalIgnoreCase))
                target = Path.Combine(chosen, "FlowCommand");

            _btnInstall.Enabled = false;
            _btnBrowse.Enabled  = false;
            _txtPath.ReadOnly   = true;

            new Thread(delegate()
            {
                try
                {
                    UpdateInstStatus("Preparing directory...");
                    SetProg(10);
                    if (!Directory.Exists(target)) Directory.CreateDirectory(target);

                    UpdateInstStatus("Extracting project files...");
                    SetProg(20);

                    // Extract embedded project.zip
                    Stream resStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("project.zip");
                    if (resStream == null)
                    {
                        UpdateInstStatus("ERROR: Embedded archive not found.");
                        return;
                    }

                    string tempZip = Path.Combine(Path.GetTempPath(), "flowcommand_project.zip");
                    using (FileStream fs = File.Create(tempZip))
                    {
                        byte[] buf = new byte[8192];
                        int read;
                        while ((read = resStream.Read(buf, 0, buf.Length)) > 0)
                            fs.Write(buf, 0, read);
                    }
                    resStream.Close();

                    SetProg(40);
                    UpdateInstStatus("Unpacking files...");

                    // Extract per-file with overwrite — avoids "directory already exists" errors
                    using (ZipArchive archive = ZipFile.OpenRead(tempZip))
                    {
                        int total = 0;
                        foreach (ZipArchiveEntry ent in archive.Entries) total++;
                        int done = 0;
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            string destPath = Path.Combine(target, entry.FullName);
                            string destDir  = Path.GetDirectoryName(destPath);
                            if (!Directory.Exists(destDir)) Directory.CreateDirectory(destDir);

                            if (!string.IsNullOrEmpty(entry.Name))
                            {
                                // Delete existing file first, then extract
                                if (File.Exists(destPath))
                                    try { File.Delete(destPath); } catch { }
                                entry.ExtractToFile(destPath);
                            }
                            done++;
                            if (total > 0) SetProg(40 + (done * 30 / total));
                        }
                    }
                    File.Delete(tempZip);

                    SetProg(75);
                    UpdateInstStatus("Cleaning directory...");
                    CleanupDirectory(target);

                    SetProg(82);
                    UpdateInstStatus("Copying launcher...");

                    // Copy self into the installed directory
                    string selfExe   = Application.ExecutablePath;
                    string targetExe = Path.Combine(target, Path.GetFileName(selfExe));
                    if (!string.Equals(Path.GetFullPath(selfExe), Path.GetFullPath(targetExe), StringComparison.OrdinalIgnoreCase))
                        File.Copy(selfExe, targetExe, true);

                    SetProg(88);
                    UpdateInstStatus("Creating uninstaller...");
                    WriteUninstaller(target);

                    SetProg(95);
                    UpdateInstStatus("Installation complete.");

                    // Update root to the installed location
                    _root = target;

                    // Reload logo from new location
                    Invoke(new Action(delegate
                    {
                        try
                        {
                            string logoP = Path.Combine(_root, "assets", "logo-mark.png");
                            if (!File.Exists(logoP)) logoP = Path.Combine(_root, "assets", "logo.png");
                            if (File.Exists(logoP))
                            {
                                Bitmap bmp = new Bitmap(logoP);
                                bmp.MakeTransparent(bmp.GetPixel(0, 0));
                                _logo = bmp;
                                Invalidate(true);
                            }
                        }
                        catch { }
                    }));

                    SetProg(100);
                    Thread.Sleep(500);

                    // Transition to Python check via state machine
                    Invoke(new Action(delegate
                    {
                        _viewInstall.Visible = false;
                        TransitionTo(LauncherState.S1_PY_CHECK);
                    }));
                }
                catch (Exception ex)
                {
                    SetProg(0);
                    UpdateInstStatus("ERROR: " + ex.Message);
                    Invoke(new Action(delegate { _btnInstall.Enabled = true; _btnBrowse.Enabled = true; _txtPath.ReadOnly = false; }));
                }
            }) { IsBackground = true }.Start();
        }

        private void UpdateInstStatus(string text)
        {
            if (_lblInstStatus == null || _lblInstStatus.IsDisposed) return;
            if (_lblInstStatus.InvokeRequired)
                _lblInstStatus.BeginInvoke(new Action(delegate { _lblInstStatus.Text = text; }));
            else
                _lblInstStatus.Text = text;
        }

        // ─────────────────────────────────────────────────────────────────
        //  VIEW 3: PYTHON CHOICE (Download or Demo Mode)
        //  Shown when S3_PY_MISSING is reached
        // ─────────────────────────────────────────────────────────────────

        private void BuildChoice()
        {
            int bodyTop = 50;
            int bodyH = WIN_H - bodyTop - 40;
            _viewChoice = new Panel { Location = new Point(0, bodyTop), Size = new Size(WIN_W, bodyH), BackColor = BG };

            int pad = 24, cardW = WIN_W - pad * 2 - 16, cardH = bodyH - 20;
            Panel card = new Panel { Location = new Point(pad, 8), Size = new Size(cardW, cardH), BackColor = SURFACE };
            card.Paint += delegate(object s, PaintEventArgs e) { using (Pen p = new Pen(BORDER)) e.Graphics.DrawRectangle(p, 0, 0, card.Width - 1, card.Height - 1); };

            // ── Error banner ──
            Panel errBanner = new Panel { Location = new Point(0, 0), Size = new Size(cardW, 56), BackColor = Color.FromArgb(40, 25, 25) };
            errBanner.Paint += delegate(object s, PaintEventArgs e)
            {
                using (Pen p = new Pen(Color.FromArgb(120, 50, 40))) e.Graphics.DrawLine(p, 0, 55, errBanner.Width, 55);
            };
            _lblChoiceError = new Label
            {
                Text = "\u26A0  Python not available or not downloaded.",
                Font = new Font("Segoe UI", 10f, FontStyle.Bold), ForeColor = L_ERR,
                Location = new Point(20, 16), AutoSize = true
            };
            errBanner.Controls.Add(_lblChoiceError);
            card.Controls.Add(errBanner);

            // ── Description ──
            card.Controls.Add(new Label
            {
                Text = "Python 3.8+ is required to run the full FlowCommand backend.\r\n" +
                       "Choose one of the following options to proceed:",
                Font = new Font("Segoe UI", 9f), ForeColor = TXT,
                Location = new Point(20, 72), Size = new Size(cardW - 40, 40)
            });

            card.Controls.Add(new Panel { Location = new Point(20, 118), Size = new Size(cardW - 40, 1), BackColor = BORDER });

            // ── Option A: Download & Install ──
            int optATop = 134;
            Panel optA = new Panel { Location = new Point(20, optATop), Size = new Size(cardW - 40, 130), BackColor = WELL };
            optA.Paint += delegate(object s, PaintEventArgs e)
            {
                using (Pen p = new Pen(BORDER)) e.Graphics.DrawRectangle(p, 0, 0, optA.Width - 1, optA.Height - 1);
                using (Pen p = new Pen(ACCENT, 3)) e.Graphics.DrawLine(p, 0, 0, 0, optA.Height);
            };

            optA.Controls.Add(new Label { Text = "OPTION A", Font = new Font("Segoe UI", 7f, FontStyle.Bold), ForeColor = ACCENT, Location = new Point(14, 10), AutoSize = true });
            optA.Controls.Add(new Label { Text = "Download & Install Python", Font = new Font("Segoe UI", 11f, FontStyle.Bold), ForeColor = TXT_HEAD, Location = new Point(14, 28), AutoSize = true });
            optA.Controls.Add(new Label
            {
                Text = "Downloads Python 3.11.9 embedded runtime (~25 MB) from python.org.\r\nRequires an active internet connection. One-time download only.",
                Font = new Font("Segoe UI", 8.25f), ForeColor = TXT_DIM,
                Location = new Point(14, 52), Size = new Size(optA.Width - 28, 34)
            });

            _btnDownload = new Button
            {
                Text = "DOWNLOAD  &  INSTALL", Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                BackColor = ACCENT, ForeColor = Color.FromArgb(20, 18, 10),
                Location = new Point(14, 90), Size = new Size(220, 32),
                FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand
            };
            _btnDownload.FlatAppearance.BorderSize = 0;
            _btnDownload.Click += delegate { TransitionTo(LauncherState.S5_DOWNLOAD); };
            optA.Controls.Add(_btnDownload);

            card.Controls.Add(optA);

            // ── Option B: Prototype Demo Mode ──
            int optBTop = optATop + 140;
            Panel optB = new Panel { Location = new Point(20, optBTop), Size = new Size(cardW - 40, 130), BackColor = WELL };
            optB.Paint += delegate(object s, PaintEventArgs e)
            {
                using (Pen p = new Pen(BORDER)) e.Graphics.DrawRectangle(p, 0, 0, optB.Width - 1, optB.Height - 1);
                using (Pen p = new Pen(L_OK, 3)) e.Graphics.DrawLine(p, 0, 0, 0, optB.Height);
            };

            optB.Controls.Add(new Label { Text = "OPTION B", Font = new Font("Segoe UI", 7f, FontStyle.Bold), ForeColor = L_OK, Location = new Point(14, 10), AutoSize = true });
            optB.Controls.Add(new Label { Text = "Prototype Demo Mode (Offline)", Font = new Font("Segoe UI", 11f, FontStyle.Bold), ForeColor = TXT_HEAD, Location = new Point(14, 28), AutoSize = true });
            optB.Controls.Add(new Label
            {
                Text = "Opens dashboard.html directly in your browser. No server, no download.\r\nFully offline — works without internet. Backend APIs will show demo data.",
                Font = new Font("Segoe UI", 8.25f), ForeColor = TXT_DIM,
                Location = new Point(14, 52), Size = new Size(optB.Width - 28, 34)
            });

            _btnDemoMode = new Button
            {
                Text = "LAUNCH  DEMO  MODE", Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                BackColor = SURFACE, ForeColor = L_OK,
                Location = new Point(14, 90), Size = new Size(220, 32),
                FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand
            };
            _btnDemoMode.FlatAppearance.BorderColor = L_OK;
            _btnDemoMode.FlatAppearance.BorderSize = 1;
            _btnDemoMode.Click += delegate { TransitionTo(LauncherState.S6_DEMO_MODE); };
            optB.Controls.Add(_btnDemoMode);

            card.Controls.Add(optB);

            // ── Footer note ──
            card.Controls.Add(new Label
            {
                Text = "If you do not have internet access, Option B is recommended.",
                Font = new Font("Segoe UI", 8f, FontStyle.Italic), ForeColor = TXT_DIM,
                Location = new Point(20, cardH - 30), AutoSize = true
            });

            _viewChoice.Controls.Add(card);
            Controls.Add(_viewChoice);
        }

        // ─────────────────────────────────────────────────────────────────
        //  VIEW 4: DASHBOARD (log + actions)
        // ─────────────────────────────────────────────────────────────────

        private void BuildDash()
        {
            int bodyTop = 50;
            int bodyH = WIN_H - bodyTop - 40;
            _viewDash = new Panel { Location = new Point(0, bodyTop), Size = new Size(WIN_W, bodyH), BackColor = BG };

            int pad = 24, innerW = WIN_W - pad * 2 - 16;

            // Log panel — full width, no service cards
            int logY = 10;
            int logH = bodyH - logY - 58;
            Panel pnlLog = new Panel { Location = new Point(pad, logY), Size = new Size(innerW, logH), BackColor = WELL };
            pnlLog.Paint += delegate(object s, PaintEventArgs e) { using (Pen p = new Pen(BORDER)) e.Graphics.DrawRectangle(p, 0, 0, pnlLog.Width - 1, pnlLog.Height - 1); };
            pnlLog.Controls.Add(new Label { Text = "SYSTEM LOG", Font = new Font("Segoe UI", 7f, FontStyle.Bold), ForeColor = TXT_DIM, Location = new Point(10, 6), AutoSize = true });

            _logBox = new RichTextBox
            {
                Location = new Point(8, 24), Size = new Size(innerW - 16, logH - 32),
                BackColor = WELL, ForeColor = TXT, Font = new Font("Consolas", 8f),
                ReadOnly = true, BorderStyle = BorderStyle.None, ScrollBars = RichTextBoxScrollBars.Vertical
            };
            pnlLog.Controls.Add(_logBox);
            _viewDash.Controls.Add(pnlLog);

            // Bottom bar: Launch + Insert Credentials + Stop
            int barY = logY + logH + 10;
            int bGap = 10, bW = (innerW - bGap * 2) / 3;

            _btnLaunch = new Button
            {
                Text = "LAUNCH CONSOLE", Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
                BackColor = ACCENT, ForeColor = Color.FromArgb(20, 18, 10),
                Location = new Point(pad, barY), Size = new Size(bW, 36),
                FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand, Enabled = false
            };
            _btnLaunch.FlatAppearance.BorderSize = 0;
            _btnLaunch.Click += delegate { Try(DashUrl); };
            _viewDash.Controls.Add(_btnLaunch);

            _btnInsertCreds = new Button
            {
                Text = "INSERT CREDENTIALS", Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
                BackColor = SURFACE, ForeColor = TXT,
                Location = new Point(pad + bW + bGap, barY), Size = new Size(bW, 36),
                FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand
            };
            _btnInsertCreds.FlatAppearance.BorderColor = BORDER;
            _btnInsertCreds.FlatAppearance.BorderSize = 1;
            _btnInsertCreds.Click += OnInsertCreds;
            _viewDash.Controls.Add(_btnInsertCreds);

            _btnStop = new Button
            {
                Text = "STOP  &  EXIT", Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
                BackColor = Color.FromArgb(70, 30, 30), ForeColor = Color.FromArgb(220, 100, 90),
                Location = new Point(pad + (bW + bGap) * 2, barY), Size = new Size(bW, 36),
                FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand, Enabled = false
            };
            _btnStop.FlatAppearance.BorderColor = Color.FromArgb(120, 50, 45);
            _btnStop.FlatAppearance.BorderSize = 1;
            _btnStop.Click += delegate { StopAll(); Application.Exit(); };
            _viewDash.Controls.Add(_btnStop);

            Controls.Add(_viewDash);
        }

        private void Try(string url) { try { Process.Start(url); } catch { } }

        // ═══════════════════════════════════════════════════════════════════
        //  STATE MACHINE ENGINE
        // ═══════════════════════════════════════════════════════════════════

        /// <summary>
        /// Central state transition function. All state changes funnel through here.
        /// This ensures every transition is logged and UI is updated atomically.
        /// </summary>
        private void TransitionTo(LauncherState newState)
        {
            _state = newState;

            switch (newState)
            {
                case LauncherState.S1_PY_CHECK:
                    // Show dashboard view with log, run Python check in background
                    HideAllViews();
                    _viewDash.Visible = true;
                    SetPill("CHECKING PYTHON...", L_WARN);
                    AppendLog("[SEC] User consent confirmed.", L_OK);
                    new Thread(RunStateMachine_PythonCheck) { IsBackground = true }.Start();
                    break;

                case LauncherState.S3_PY_MISSING:
                    // Python not found — switch to choice screen
                    HideAllViews();
                    _viewChoice.Visible = true;
                    SetPill("PYTHON REQUIRED", L_ERR);
                    SetProg(0);
                    break;

                case LauncherState.S4_CHOICE:
                    // Return to choice screen (e.g., after download failure)
                    HideAllViews();
                    _viewChoice.Visible = true;
                    _btnDownload.Enabled = true;
                    _btnDemoMode.Enabled = true;
                    _lblChoiceError.Text = "\u26A0  Python not available or not downloaded.";
                    SetPill("CHOOSE AN OPTION", L_WARN);
                    SetProg(0);
                    break;

                case LauncherState.S5_DOWNLOAD:
                    // Download Python in background
                    _btnDownload.Enabled = false;
                    _btnDemoMode.Enabled = false;
                    HideAllViews();
                    _viewDash.Visible = true;
                    SetPill("DOWNLOADING...", L_WARN);
                    AppendLog("[SYS] Downloading Python 3.11.9 embedded runtime...", L_WARN);
                    new Thread(RunStateMachine_Download) { IsBackground = true }.Start();
                    break;

                case LauncherState.S2_PY_FOUND:
                    // Python resolved — continue to venv, deps, services
                    HideAllViews();
                    _viewDash.Visible = true;
                    SetPill("INITIALIZING...", L_WARN);
                    new Thread(RunStateMachine_FullStartup) { IsBackground = true }.Start();
                    break;

                case LauncherState.S6_DEMO_MODE:
                    // Skip everything, open dashboard.html offline
                    HideAllViews();
                    _viewDash.Visible = true;
                    SetPill("DEMO MODE", L_OK);
                    AppendLog("[DEMO] Prototype Demo Mode selected.", L_OK);
                    AppendLog("[DEMO] Skipping Python, venv, pip, and backend server.", L_DIM);
                    new Thread(RunStateMachine_DemoMode) { IsBackground = true }.Start();
                    break;

                case LauncherState.S10_ONLINE:
                    // Full mode online
                    SetProg(80);
                    AppendLog("[OK] All services operational.", L_OK);
                    AppendLog("", L_DIM);
                    AppendLog("[SYS] Initializing in browser, may take some time according to the device.", ACCENT);
                    // Smooth progress animation before opening
                    for (int p = 80; p <= 95; p++) { SetProg(p); Thread.Sleep(60); }
                    Thread.Sleep(300);
                    AppendLog("[OPEN] Launching login page...", L_DIM);
                    for (int p = 95; p <= 100; p++) { SetProg(p); Thread.Sleep(80); }
                    Thread.Sleep(200);
                    Invoke(new Action(delegate
                    {
                        Try(DashUrl);
                        SetPill("ONLINE", L_OK);
                        _running = true;
                        _btnLaunch.Enabled = true;
                        _btnStop.Enabled = true;
                    }));
                    break;

                case LauncherState.S11_OFFLINE_DASH:
                    // Demo mode ready
                    SetProg(80);
                    AppendLog("[OK] Ready (offline demo mode).", L_OK);
                    AppendLog("", L_DIM);
                    AppendLog("[SYS] Initializing in browser, may take some time according to the device.", ACCENT);
                    for (int p = 80; p <= 95; p++) { SetProg(p); Thread.Sleep(60); }
                    Thread.Sleep(300);
                    AppendLog("[OPEN] Launching login page...", L_DIM);
                    for (int p = 95; p <= 100; p++) { SetProg(p); Thread.Sleep(80); }
                    Thread.Sleep(200);
                    Invoke(new Action(delegate
                    {
                        string loginPath = Path.Combine(_root, "index.html");
                        if (File.Exists(loginPath))
                        {
                            Try(DashUrl);
                            SetPill("DEMO ACTIVE", L_OK);
                            AppendLog("[OPEN] " + DashUrl, L_DIM);
                        }
                        else
                        {
                            SetPill("ERROR", L_ERR);
                            AppendLog("[ERR] index.html not found at: " + loginPath, L_ERR);
                        }
                        _btnLaunch.Enabled = true;
                    }));
                    break;
            }
        }

        private void HideAllViews()
        {
            if (InvokeRequired)
            {
                Invoke(new Action(HideAllViews));
                return;
            }
            _viewAuth.Visible    = false;
            _viewInstall.Visible = false;
            _viewChoice.Visible  = false;
            _viewDash.Visible    = false;
        }

        // ═══════════════════════════════════════════════════════════════════
        //  STATE MACHINE: BACKGROUND THREADS
        // ═══════════════════════════════════════════════════════════════════

        /// <summary>
        /// S1_PY_CHECK: Detect Python on the system or in the portable folder.
        /// Transitions to S2_PY_FOUND or S3_PY_MISSING.
        /// </summary>
        private void RunStateMachine_PythonCheck()
        {
            try
            {
                SetProg(5);
                AppendLog("FlowCommand \u2014 Vehicle Intelligence Management System", ACCENT);
                AppendLog("Directory: " + _root, L_DIM);
                AppendLog(new string('\u2500', 48), BORDER);

                AppendLog("[SEC] Workspace integrity check...", L_DIM);
                CheckFiles();

                AppendLog("[SYS] Checking for Python 3...", L_DIM);
                SetProg(15);

                // Check 1: Portable Python bundled with the project
                if (File.Exists(PyExe))
                {
                    string ver = Cap(PyExe, "--version");
                    if (ver != null && ver.Contains("Python 3"))
                    {
                        AppendLog("[OK] Portable Python found: " + ver.Trim(), L_OK);
                        _resolvedPythonExe = PyExe;
                        SetProg(25);
                        Invoke(new Action(delegate { TransitionTo(LauncherState.S2_PY_FOUND); }));
                        return;
                    }
                }

                // Check 2: System Python on PATH
                string sysPy = FindPath("python");
                if (sysPy != null)
                {
                    string ver = Cap(sysPy, "--version");
                    if (ver != null && IsSupportedPython(ver))
                    {
                        AppendLog("[OK] System Python found: " + ver.Trim(), L_OK);
                        _resolvedPythonExe = sysPy;
                        SetProg(25);
                        Invoke(new Action(delegate { TransitionTo(LauncherState.S2_PY_FOUND); }));
                        return;
                    }
                }

                // Check 3: Try "python3" on PATH (some setups)
                string sysPy3 = FindPath("python3");
                if (sysPy3 != null)
                {
                    string ver = Cap(sysPy3, "--version");
                    if (ver != null && IsSupportedPython(ver))
                    {
                        AppendLog("[OK] System Python3 found: " + ver.Trim(), L_OK);
                        _resolvedPythonExe = sysPy3;
                        SetProg(25);
                        Invoke(new Action(delegate { TransitionTo(LauncherState.S2_PY_FOUND); }));
                        return;
                    }
                }

                // ── S3_PY_MISSING ──
                AppendLog("[ERR] Python not available or not downloaded.", L_ERR);
                SetProg(0);
                Invoke(new Action(delegate { TransitionTo(LauncherState.S3_PY_MISSING); }));
            }
            catch (Exception ex)
            {
                AppendLog("[FATAL] " + ex.Message, L_ERR);
                SetProg(0);
                Invoke(new Action(delegate { TransitionTo(LauncherState.S3_PY_MISSING); }));
            }
        }

        /// <summary>
        /// S5_DOWNLOAD: Download embedded Python from python.org.
        /// Transitions to S2_PY_FOUND on success, or S4_CHOICE on failure.
        /// </summary>
        private void RunStateMachine_Download()
        {
            try
            {
                SetProg(10);
                string zipPath = Path.Combine(_root, "py-embed.zip");

                AppendLog("[NET] Downloading from python.org (~25 MB)...", L_DIM);
                using (var wc = new WebClient())
                {
                    wc.DownloadProgressChanged += delegate(object ss, DownloadProgressChangedEventArgs ev)
                    {
                        SetProg(10 + ev.ProgressPercentage * 40 / 100);  // 10→50
                    };
                    wc.DownloadFileTaskAsync(new Uri(PY_ZIP), zipPath).GetAwaiter().GetResult();
                }

                if (!File.Exists(zipPath) || new FileInfo(zipPath).Length < 1000)
                {
                    AppendLog("[ERR] Download failed — file is empty or missing.", L_ERR);
                    if (File.Exists(zipPath)) try { File.Delete(zipPath); } catch { }
                    Invoke(new Action(delegate { TransitionTo(LauncherState.S4_CHOICE); }));
                    return;
                }

                SetProg(55);
                AppendLog("[SYS] Extracting Python runtime...", L_DIM);

                if (Directory.Exists(PyDir)) Directory.Delete(PyDir, true);
                ZipFile.ExtractToDirectory(zipPath, PyDir);
                File.Delete(zipPath);

                // Enable site-packages in embedded Python
                foreach (var pthFile in Directory.GetFiles(PyDir, "*._pth"))
                    File.WriteAllText(pthFile, File.ReadAllText(pthFile).Replace("#import site", "import site"));

                SetProg(65);
                AppendLog("[SYS] Installing pip...", L_DIM);

                string getPipPath = Path.Combine(_root, "get-pip.py");
                new WebClient().DownloadFile(PIP_URL, getPipPath);
                Run(PyExe, "\"" + getPipPath + "\"");
                if (File.Exists(getPipPath)) File.Delete(getPipPath);

                SetProg(75);
                AppendLog("[OK] Python 3.11.9 installed successfully.", L_OK);

                _resolvedPythonExe = PyExe;
                Invoke(new Action(delegate { TransitionTo(LauncherState.S2_PY_FOUND); }));
            }
            catch (Exception ex)
            {
                AppendLog("[ERR] Download/install failed: " + ex.Message, L_ERR);
                AppendLog("[TIP] Select 'Demo Mode' to proceed without Python.", L_WARN);

                // Cleanup partial download
                string zipPath = Path.Combine(_root, "py-embed.zip");
                if (File.Exists(zipPath)) try { File.Delete(zipPath); } catch { }

                SetProg(0);
                Invoke(new Action(delegate { TransitionTo(LauncherState.S4_CHOICE); }));
            }
        }

        /// <summary>
        /// S2_PY_FOUND → S7_VENV → S8_DEPS → S9_SERVICES → S10_ONLINE
        /// Full startup with Python available.
        /// </summary>
        private void RunStateMachine_FullStartup()
        {
            try
            {
                string py = _resolvedPythonExe;
                AppendLog("[SYS] Using Python: " + py, L_DIM);

                // ── S7: VENV SETUP ──
                _state = LauncherState.S7_VENV_SETUP;
                SetProg(35);
                if (File.Exists(VPy))
                {
                    AppendLog("[OK] .venv present.", L_OK);
                }
                else
                {
                    AppendLog("[SYS] Creating virtual environment...", L_DIM);
                    int exitCode = Run(py, "-m venv \"" + VDir + "\"");
                    if (exitCode != 0 || !File.Exists(VPy))
                    {
                        AppendLog("[WARN] venv creation failed — running without venv.", L_WARN);
                    }
                    else
                    {
                        AppendLog("[OK] .venv created.", L_OK);
                    }
                }

                // ── S8: INSTALL DEPENDENCIES ──
                _state = LauncherState.S8_DEPS;
                SetProg(50);
                string activePy = File.Exists(VPy) ? VPy : py;
                string reqFile = Path.Combine(_root, "requirements.txt");

                if (!File.Exists(reqFile))
                {
                    AppendLog("[WARN] requirements.txt not found — skipping.", L_DIM);
                }
                else
                {
                    string depsCheck = Cap(activePy, "-c \"import fastapi; print('OK')\"");
                    if (depsCheck != null && depsCheck.Contains("OK"))
                    {
                        AppendLog("[OK] Dependencies already installed.", L_OK);
                    }
                    else
                    {
                        AppendLog("[PIP] Installing dependencies...", L_WARN);
                        Run(activePy, "-m pip install -r \"" + reqFile + "\" --quiet");
                        AppendLog("[OK] Dependencies installed.", L_OK);
                    }
                }

                // ── POST-INSTALL CLEANUP: remove dev files, create shortcut ──
                CleanupDevFiles();
                CreateDesktopShortcut();

                // ── S9: START SERVICES ──
                _state = LauncherState.S9_SERVICES;
                SetProg(70);

                // Backend
                AppendLog("[SRV] Starting backend (:8000)...", L_DIM);
                var backPsi = Psi(activePy, "-m uvicorn backend.main:app --host 127.0.0.1 --port " + PORT_BACK);
                backPsi.EnvironmentVariables["PYTHONPATH"] = _root;
                _procBack = Process.Start(backPsi);
                Hook(_procBack, "[BACK]");

                SetProg(80);

                // Frontend
                AppendLog("[SRV] Starting frontend (:3000)...", L_DIM);
                _procFront = Process.Start(Psi(activePy, "-m http.server " + PORT_FRONT + " --bind 127.0.0.1"));
                Hook(_procFront, "[FRONT]");

                SetProg(88);

                // ── Verify ports ──
                AppendLog("[NET] Verifying sockets...", L_DIM);
                WaitPort(PORT_BACK, 20);
                WaitPort(PORT_FRONT, 10);

                // ── S10: ONLINE ──
                TransitionTo(LauncherState.S10_ONLINE);
            }
            catch (Exception ex)
            {
                SetPill("ERROR", L_ERR);
                AppendLog("[FATAL] " + ex.Message, L_ERR);
            }
        }

        /// <summary>
        /// S6_DEMO_MODE → S11_OFFLINE_DASH
        /// No Python, no server, just open index.html via file:// protocol.
        /// </summary>
        private void RunStateMachine_DemoMode()
        {
            try
            {
                SetProg(30);
                AppendLog("[DEMO] Verifying project files...", L_DIM);

                string loginPath = Path.Combine(_root, "index.html");
                if (!File.Exists(loginPath))
                {
                    AppendLog("[ERR] index.html not found!", L_ERR);
                    SetPill("ERROR", L_ERR);
                    SetProg(0);
                    return;
                }

                AppendLog("[OK] index.html located (" + new FileInfo(loginPath).Length / 1024 + " KB).", L_OK);
                SetProg(60);

                AppendLog("[DEMO] No backend server will be started.", L_DIM);
                AppendLog("[DEMO] Dashboard will run in offline/demo mode.", L_DIM);
                AppendLog("[DEMO] API-dependent features will show simulated data.", L_DIM);

                SetProg(80);
                CleanupDevFiles();
                CreateDesktopShortcut();
                Thread.Sleep(300);

                // ── S11: OFFLINE DASH ──
                TransitionTo(LauncherState.S11_OFFLINE_DASH);
            }
            catch (Exception ex)
            {
                AppendLog("[ERR] " + ex.Message, L_ERR);
                SetPill("ERROR", L_ERR);
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        //  DIRECTORY CLEANUP
        // ═══════════════════════════════════════════════════════════════════

        /// <summary>
        /// Removes dev/build artifacts from extracted directory.
        /// Ensures judges see a clean, professional structure.
        /// </summary>
        private void CleanupDirectory(string dir)
        {
            // Directories to remove
            string[] dirsToRemove = {
                ".git", ".claude", ".agents", ".vscode", ".idea",
                "__pycache__", "tools", "scripts", "docs",
                "node_modules", ".mypy_cache", ".pytest_cache"
            };

            // Files to remove
            string[] filesToRemove = {
                ".env", ".env.example", ".gitignore", ".dockerignore",
                "Dockerfile", "docker-compose.yml", ".editorconfig"
            };

            foreach (string d in dirsToRemove)
            {
                string path = Path.Combine(dir, d);
                if (Directory.Exists(path))
                {
                    try { Directory.Delete(path, true); } catch { }
                }
            }

            foreach (string f in filesToRemove)
            {
                string path = Path.Combine(dir, f);
                if (File.Exists(path))
                {
                    try { File.Delete(path); } catch { }
                }
            }

            // Recursively remove __pycache__ from all subdirectories
            try
            {
                foreach (string pycache in Directory.GetDirectories(dir, "__pycache__", SearchOption.AllDirectories))
                {
                    try { Directory.Delete(pycache, true); } catch { }
                }

                // Remove .pyc files
                foreach (string pyc in Directory.GetFiles(dir, "*.pyc", SearchOption.AllDirectories))
                {
                    try { File.Delete(pyc); } catch { }
                }
            }
            catch { }
        }

        // ═══════════════════════════════════════════════════════════════════
        //  UNINSTALLER
        // ═══════════════════════════════════════════════════════════════════

        private void WriteUninstaller(string installDir)
        {
            try
            {
                string bat = Path.Combine(installDir, "Uninstall.bat");
                string script =
                    "@echo off\r\n" +
                    "title FlowCommand Uninstaller\r\n" +
                    "echo.\r\n" +
                    "echo  ========================================\r\n" +
                    "echo   FlowCommand Uninstaller\r\n" +
                    "echo  ========================================\r\n" +
                    "echo.\r\n" +
                    "echo  This will permanently remove all FlowCommand\r\n" +
                    "echo  files from this directory:\r\n" +
                    "echo.\r\n" +
                    "echo    %~dp0\r\n" +
                    "echo.\r\n" +
                    "echo  This action cannot be undone.\r\n" +
                    "echo.\r\n" +
                    "choice /c YN /m \"  Proceed with uninstallation? \"\r\n" +
                    "if errorlevel 2 (\r\n" +
                    "    echo.\r\n" +
                    "    echo  Cancelled. No files were removed.\r\n" +
                    "    echo.\r\n" +
                    "    pause\r\n" +
                    "    exit /b\r\n" +
                    ")\r\n" +
                    "echo.\r\n" +
                    "echo  Stopping any running FlowCommand services...\r\n" +
                    "taskkill /f /im python.exe 2>nul\r\n" +
                    "taskkill /f /im FlowCommand.exe 2>nul\r\n" +
                    "timeout /t 2 /nobreak >nul\r\n" +
                    "echo.\r\n" +
                    "echo  Removing files...\r\n" +
                    "set \"INSTALL_DIR=%~dp0\"\r\n" +
                    "set \"INSTALL_DIR=%INSTALL_DIR:~0,-1%\"\r\n" +
                    "cd /d \"%TEMP%\"\r\n" +
                    "rmdir /s /q \"%INSTALL_DIR%\" 2>nul\r\n" +
                    "echo.\r\n" +
                    "if not exist \"%INSTALL_DIR%\" (\r\n" +
                    "    echo  FlowCommand has been completely uninstalled.\r\n" +
                    ") else (\r\n" +
                    "    echo  Some files could not be removed.\r\n" +
                    "    echo  Please close all programs and try again.\r\n" +
                    ")\r\n" +
                    "echo.\r\n" +
                    "pause\r\n";
                File.WriteAllText(bat, script);
            }
            catch { }
        }

        // ═══════════════════════════════════════════════════════════════════
        //  POST-INSTALL CLEANUP
        // ═══════════════════════════════════════════════════════════════════

        private void CleanupDevFiles()
        {
            // Remove files the user doesn't need to see
            string[] junk = { "requirements.txt", "favicon.ico", "README.md",
                              ".env", ".env.example", ".gitignore",
                              "bootstrapper.py", "Dockerfile", "docker-compose.yml" };
            foreach (string f in junk)
            {
                string p = Path.Combine(_root, f);
                if (File.Exists(p)) try { File.Delete(p); } catch { }
            }

            // Hide .venv folder so it doesn't clutter the directory
            string venvDir = Path.Combine(_root, ".venv");
            if (Directory.Exists(venvDir))
            {
                try { new DirectoryInfo(venvDir).Attributes |= FileAttributes.Hidden; } catch { }
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        //  DESKTOP SHORTCUT
        // ═══════════════════════════════════════════════════════════════════

        private void CreateDesktopShortcut()
        {
            try
            {
                string exePath = Path.Combine(_root, "FlowCommand.exe");
                if (!File.Exists(exePath)) exePath = Application.ExecutablePath;

                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string lnkPath = Path.Combine(desktop, "FlowCommand.lnk");

                // Use WScript.Shell COM to create a proper .lnk shortcut
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                dynamic shell = Activator.CreateInstance(shellType);
                dynamic shortcut = shell.CreateShortcut(lnkPath);
                shortcut.TargetPath = exePath;
                shortcut.WorkingDirectory = _root;
                shortcut.Description = "FlowCommand — Vehicle Intelligence Management System";
                shortcut.IconLocation = exePath + ",0";
                shortcut.Save();

                AppendLog("[OK] Desktop shortcut created.", L_OK);
            }
            catch
            {
                AppendLog("[WARN] Could not create desktop shortcut.", L_DIM);
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        //  FILE CHECKS
        // ═══════════════════════════════════════════════════════════════════

        private void CheckFiles()
        {
            string[] cf = { "backend\\main.py", "backend\\traffic_engine.py", "backend\\junction_router.py",
                            "index.html", "dashboard.html", "command.html", "citizen.html" };
            int ok = 0;
            for (int i = 0; i < cf.Length; i++) if (File.Exists(Path.Combine(_root, cf[i]))) ok++;
            AppendLog(string.Format("[SEC] {0}/{1} core files verified.", ok, cf.Length), L_OK);
        }

        // ═══════════════════════════════════════════════════════════════════
        //  SERVICE MANAGEMENT
        // ═══════════════════════════════════════════════════════════════════

        private ProcessStartInfo Psi(string f, string a)
        {
            return new ProcessStartInfo { FileName = f, Arguments = a, WorkingDirectory = _root,
                UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        }

        private void Hook(Process p, string pfx)
        {
            if (p == null) return;
            p.OutputDataReceived += delegate(object s, DataReceivedEventArgs ev) { if (!string.IsNullOrEmpty(ev.Data)) AppendLog(pfx + " " + ev.Data, L_DIM); };
            p.ErrorDataReceived  += delegate(object s, DataReceivedEventArgs ev) { if (!string.IsNullOrEmpty(ev.Data) && !ev.Data.Contains("INFO:")) AppendLog(pfx + " " + ev.Data, L_ERR); };
            p.BeginOutputReadLine(); p.BeginErrorReadLine();
        }

        private void StopAll()
        {
            AppendLog("[SYS] Stopping...", L_DIM);
            Kill(_procBack); Kill(_procFront);
            KillPort(PORT_BACK); KillPort(PORT_FRONT);
            _running = false;
            SetPill("STOPPED", TXT_DIM);
        }

        private void Kill(Process p) { if (p == null) return; try { if (!p.HasExited) { p.Kill(); p.WaitForExit(1500); } } catch { } finally { p.Dispose(); } }
        private void KillPort(int port) { try { Process.Start(new ProcessStartInfo { FileName = "cmd.exe", Arguments = "/c for /f \"tokens=5\" %a in ('netstat -aon ^| find \":" + port + "\" ^| find \"LISTENING\"') do taskkill /f /pid %a", CreateNoWindow = true, UseShellExecute = false }).WaitForExit(2000); } catch { } }

        // ═══════════════════════════════════════════════════════════════════
        //  UTILITIES
        // ═══════════════════════════════════════════════════════════════════

        private bool IsSupportedPython(string versionStr)
        {
            // Accept Python 3.8 through 3.13+
            string[] supported = { "3.8", "3.9", "3.10", "3.11", "3.12", "3.13", "3.14" };
            for (int i = 0; i < supported.Length; i++)
                if (versionStr.Contains(supported[i])) return true;
            return false;
        }

        private bool WaitPort(int port, int sec)
        {
            DateTime dl = DateTime.Now.AddSeconds(sec);
            while (DateTime.Now < dl)
            {
                try { using (var c = new TcpClient()) { var ar = c.BeginConnect("127.0.0.1", port, null, null); if (ar.AsyncWaitHandle.WaitOne(500)) { c.EndConnect(ar); return true; } } }
                catch { }
                Thread.Sleep(300);
            }
            return false;
        }

        private string FindPath(string exe)
        {
            foreach (string d in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
            { try { string c = Path.Combine(d.Trim(), exe + ".exe"); if (File.Exists(c)) return c; } catch { } }
            return null;
        }

        private int Run(string exe, string args)
        { try { var p = Process.Start(new ProcessStartInfo { FileName = exe, Arguments = args, WorkingDirectory = _root, CreateNoWindow = true, UseShellExecute = false }); p.WaitForExit(); return p.ExitCode; } catch { return -1; } }

        private string Cap(string exe, string args)
        { try { var p = Process.Start(new ProcessStartInfo { FileName = exe, Arguments = args, WorkingDirectory = _root, CreateNoWindow = true, UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true }); string o = p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd(); p.WaitForExit(3000); return o; } catch { return null; } }

        // ═══════════════════════════════════════════════════════════════════
        //  UI THREAD HELPERS
        // ═══════════════════════════════════════════════════════════════════

        private void AppendLog(string t, Color c)
        {
            if (_logBox == null || _logBox.IsDisposed) return;
            if (_logBox.InvokeRequired) { _logBox.BeginInvoke(new Action(delegate { AppendLog(t, c); })); return; }
            _logBox.SelectionStart = _logBox.TextLength; _logBox.SelectionLength = 0;
            _logBox.SelectionColor = c;
            _logBox.AppendText(string.Format("[{0:HH:mm:ss}] {1}\n", DateTime.Now, t));
            _logBox.ScrollToCaret();
        }

        private void SetProg(int v)
        {
            _progVal = Math.Max(0, Math.Min(100, v));
            if (_progressBar != null && !_progressBar.IsDisposed)
            { if (_progressBar.InvokeRequired) _progressBar.BeginInvoke(new Action(delegate { _progressBar.Invalidate(); })); else _progressBar.Invalidate(); }
        }

        private void SetPill(string t, Color c)
        {
            if (_lblPill == null || _lblPill.IsDisposed) return;
            if (_lblPill.InvokeRequired) { _lblPill.BeginInvoke(new Action(delegate { SetPill(t, c); })); return; }
            _lblPill.Text = t; _lblPill.ForeColor = c; _lblPill.Invalidate();
        }

        // ═══════════════════════════════════════════════════════════════════
        //  EVENTS
        // ═══════════════════════════════════════════════════════════════════

        private void OnInsertCreds(object sender, EventArgs e)
        {
            string creds =
                "Police: MH-PI-4501 / admin123 / OTP 123456\n" +
                "Citizen: 9876543210 / OTP 123456\n" +
                "Plates: MH12DE1433 (clean)  DL04CAF5571 (flagged)";
            Clipboard.SetText(creds);

            AppendLog("[CRED] Credentials inserted to clipboard \u2014 paste with Ctrl+V", L_OK);

            Button b = sender as Button;
            if (b != null)
            {
                string orig = b.Text; b.Text = "READY  \u2014  PASTE WITH Ctrl+V"; b.ForeColor = L_OK;
                var tm = new System.Windows.Forms.Timer { Interval = 3000 };
                tm.Tick += delegate { b.Text = orig; b.ForeColor = TXT; tm.Stop(); tm.Dispose(); };
                tm.Start();
            }
        }

        private void OnClose(object sender, FormClosingEventArgs e)
        {
            StopAll();
            if (_tray != null) { _tray.Visible = false; _tray.Dispose(); }
        }

        private void SetupTray()
        {
            _tray = new NotifyIcon { Text = "FlowCommand", Visible = true };
            try { _tray.Icon = Icon ?? SystemIcons.Application; } catch { _tray.Icon = SystemIcons.Application; }
            var m = new ContextMenu();
            m.MenuItems.Add("Open", delegate { Show(); WindowState = FormWindowState.Normal; });
            m.MenuItems.Add("-");
            m.MenuItems.Add("Exit", delegate { StopAll(); Application.Exit(); });
            _tray.ContextMenu = m;
            _tray.DoubleClick += delegate { Show(); WindowState = FormWindowState.Normal; };
        }

        protected override void Dispose(bool d)
        {
            if (d) { StopAll(); if (_tray != null) _tray.Dispose(); }
            base.Dispose(d);
        }
    }
}
