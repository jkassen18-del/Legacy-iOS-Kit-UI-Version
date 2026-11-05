/* Legacy iOS Kit — menu / action model.
 * Mirrors the real restore.sh menu structure. Each action either:
 *   launch: { flags: [...] }  -> starts restore.sh directly with those flags
 *   open:   true              -> starts the interactive (line) menu session
 * Optional `modes` lists the device modes the action is most relevant in.
 *
 * All glyphs are monochrome, single-stroke, drawn in currentColor — no colour,
 * no tinted tiles. Geometry kept simple and SF-Symbols-like.
 */

const ICONS = {
  // sections
  restore:    `<path d="M20 11a8 8 0 1 0-1.8 6.3"/><path d="M20 5v5h-5"/>`,
  shsh:       `<path d="M12 21s7-3.5 7-9V6l-7-3-7 3v6c0 5.5 7 9 7 9z"/><path d="M9.5 12l1.8 1.8L15 10"/>`,
  boot:       `<path d="M12 3v9"/><path d="M7.5 7.5a7 7 0 1 0 9 0"/>`,
  apps:       `<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>`,
  utilities:  `<path d="M14.5 6.2a3.6 3.6 0 0 0-4.8 4.8L3.5 17.2V20h2.8l6.2-6.2a3.6 3.6 0 0 0 4.8-4.8l-2.5 2.5-2.1-2.1 2.5-2.5z"/>`,
  advanced:   `<line x1="4" y1="8" x2="20" y2="8"/><circle cx="9" cy="8" r="2"/><line x1="4" y1="16" x2="20" y2="16"/><circle cx="15" cy="16" r="2"/>`,
  console:    `<rect x="3" y="4" width="18" height="16" rx="2.4"/><path d="M7.5 9l3 3-3 3"/><line x1="12.5" y1="15" x2="16.5" y2="15"/>`,
  device:     `<rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><line x1="10.5" y1="18.6" x2="13.5" y2="18.6"/>`,

  // actions
  downgrade:  `<path d="M20 11a8 8 0 1 0-1.8 6.3"/><path d="M20 5v5h-5"/>`,
  jailbreak:  `<rect x="5.5" y="11" width="13" height="9.5" rx="2"/><path d="M8.5 11V7.5a3.5 3.5 0 0 1 7 0"/>`,
  trollstore: `<path d="M4 9.2l8-5 8 5v9.3a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z"/><path d="M9.5 20v-7h5v7"/>`,
  customipsw: `<path d="M12 3l8 4.5-8 4.5-8-4.5z"/><path d="M4 16.5l8 4.5 8-4.5M4 12l8 4.5 8-4.5"/>`,
  downloader: `<path d="M12 3.5v11"/><path d="M8 11l4 3.5 4-3.5"/><path d="M4.5 18.5h15"/>`,
  blobs:      `<path d="M12 21s7-3.5 7-9V6l-7-3-7 3v6c0 5.5 7 9 7 9z"/><path d="M9.5 12l1.8 1.8L15 10"/>`,
  ramdisk:    `<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6"/><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>`,
  dfu:        `<path d="M13 2.5L4.6 12.3a.9.9 0 0 0 .7 1.5H11l-1 8 8.4-9.8a.9.9 0 0 0-.7-1.5H12z"/>`,
  kdfu:       `<path d="M9.5 2.5v5M14.5 2.5v5"/><path d="M7.5 7.5h9v4a4.5 4.5 0 0 1-9 0z"/><path d="M12 16v5"/>`,
  pwn:        `<circle cx="8.5" cy="14.5" r="3.6"/><path d="M11 12 20.5 2.5M17.5 5.5l2 2M14.5 8.5l2 2"/>`,
  justboot:   `<path d="M12 3v9"/><path d="M7.5 7.5a7 7 0 1 0 9 0"/>`,
  exit:       `<path d="M9.5 20.5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h3.5"/><path d="M15.5 16.5l4-4-4-4"/><path d="M19.5 12.5H9"/>`,
  sideload:   `<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M12 8.5v7M8.5 12h7"/>`,
  appmanage:  `<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>`,
  data:       `<ellipse cx="12" cy="5" rx="7.5" ry="2.8"/><path d="M4.5 5v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V5"/><path d="M4.5 11v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-6"/>`,
  pair:       `<path d="M9.5 16.5H8a4.5 4.5 0 0 1 0-9h1.5"/><path d="M14.5 7.5H16a4.5 4.5 0 0 1 0 9h-1.5"/><line x1="8.5" y1="12" x2="15.5" y2="12"/>`,
  activate:   `<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.6 2.6L16 9.5"/>`,
  nodevice:   `<rect x="2.5" y="4.5" width="19" height="12" rx="2"/><path d="M8.5 20.5h7M12 16.5v4"/>`,
  entry:      `<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/>`,
  chevron:    `<path d="M9 5l7 7-7 7"/>`,
};

const MENU = [
  {
    group: "Restore & downgrade", id: "restore", icon: "restore",
    blurb: "Put signed or blob-backed firmware onto the device.",
    actions: [
      { id: "restore", title: "Restore / downgrade", icon: "downgrade",
        desc: "Signed OTA, SHSH blobs, powdersn0w, DRA v6, or tethered.",
        open: true, modes: ["Normal","Recovery","DFU"] },
      { id: "jailbreak", title: "Jailbreak device", icon: "jailbreak",
        desc: "Jailbreak supported 32-bit devices on iOS 3.0–9.3.4.",
        open: true, flags: ["--jailbreak"], modes: ["Normal","Recovery","DFU"] },
      { id: "trollstore", title: "Install TrollStore", icon: "trollstore",
        desc: "Via TrollRestore on iOS 15.2–15.8.x, 16.0–16.6.1, 16.7 RC, 17.0.",
        open: true, modes: ["Normal"] },
      { id: "customipsw", title: "Create custom IPSW", icon: "customipsw",
        desc: "Build a jailbroken, hacktivated, or patched IPSW without restoring.",
        open: true },
      { id: "downloader", title: "Download IPSW", icon: "downloader",
        desc: "Fetch firmware files for your device.",
        open: true },
    ],
  },
  {
    group: "SHSH blobs", id: "shsh", icon: "shsh",
    blurb: "Save and convert the signatures that make a restore possible.",
    actions: [
      { id: "shsh", title: "Save SHSH blobs", icon: "blobs",
        desc: "From Cydia/TSS or onboard, dump raw onboard blobs, convert dumps.",
        open: true },
    ],
  },
  {
    group: "Boot, ramdisk & DFU", id: "boot", icon: "boot",
    blurb: "Enter exploit modes and boot an SSH ramdisk.",
    actions: [
      { id: "sshrd", title: "SSH ramdisk", icon: "ramdisk",
        desc: "Dump blobs/baseband, erase, install bootstrap, and more.",
        launch: { flags: ["--sshrd"] } },
      { id: "sshrd-menu", title: "Re-enter ramdisk menu", icon: "ramdisk",
        desc: "Device must already be in SSH ramdisk mode.",
        launch: { flags: ["--sshrd-menu"] } },
      { id: "dfuhelper", title: "DFU mode helper", icon: "dfu",
        desc: "A guided, step-by-step way into DFU mode.",
        launch: { flags: ["--dfuhelper"] } },
      { id: "kdfu", title: "Enter kDFU mode", icon: "kdfu",
        desc: "For supported 32-bit devices.",
        launch: { flags: ["--kdfu"] } },
      { id: "pwn", title: "Enter pwnDFU / pwned iBSS", icon: "pwn",
        desc: "Pwn the connected device for supported 32-bit devices.",
        launch: { flags: ["--pwn"] } },
      { id: "justboot", title: "Just boot (tethered)", icon: "justboot",
        desc: "Tether-boot to a chosen version. Pick the build in the console.",
        open: true, modes: ["Recovery","DFU"] },
      { id: "exit-recovery", title: "Exit recovery mode", icon: "exit",
        desc: "Take the device out of recovery.",
        launch: { flags: ["--exit-recovery"] }, modes: ["Recovery"] },
    ],
  },
  {
    group: "Apps & data", id: "apps", icon: "apps",
    blurb: "Manage apps, backups, and on-device data.",
    actions: [
      { id: "sideload", title: "Sideload IPA", icon: "sideload",
        desc: "Install an IPA file to supported devices.",
        open: true, modes: ["Normal"] },
      { id: "appmanage", title: "App management", icon: "appmanage",
        desc: "Install an IPA, dump apps as IPA, or list installed apps.",
        open: true, modes: ["Normal"] },
      { id: "datamanage", title: "Data management", icon: "data",
        desc: "Back up and restore, mount the device, or erase all content.",
        open: true, modes: ["Normal"] },
      { id: "pair", title: "Pair device", icon: "pair",
        desc: "Pair with the device on iOS 7 and later.",
        open: true, modes: ["Normal"] },
    ],
  },
  {
    group: "Utilities", id: "utilities", icon: "utilities",
    blurb: "Everyday helpers and one-off fixes.",
    actions: [
      { id: "useful", title: "Useful utilities", icon: "utilities",
        desc: "kDFU/pwnDFU, clear NVRAM, hacktivation, exploits, console.",
        open: true },
      { id: "misc", title: "Misc utilities", icon: "advanced",
        desc: "Export info, shutdown/restart, activation, baseband dump, branches.",
        open: true },
      { id: "activate", title: "Attempt activation", icon: "activate",
        desc: "Activate with ideviceactivation — handy on older iOS.",
        open: true, modes: ["Normal"] },
    ],
  },
  {
    group: "Advanced", id: "advanced", icon: "advanced",
    blurb: "Run without a device or specify one by hand.",
    actions: [
      { id: "no-device", title: "No-device mode", icon: "nodevice",
        desc: "Downloads and custom IPSW creation with nothing plugged in.",
        launch: { flags: ["--no-device"] } },
      { id: "entry-device", title: "Manual device entry", icon: "entry",
        desc: "Specify the device type and ECID instead of auto-detecting.",
        launch: { flags: ["--entry-device"] } },
    ],
  },
];

/* Toggle flags. Appended to whatever action is launched. */
const FLAGS = [
  { flag: "--enable-sudoloop", name: "Sudo loop (Linux)", desc: "Run some tools as root; fixes many Linux USB issues." },
  { flag: "--jailbreak",       name: "Enable jailbreak", desc: "Expose the jailbreak option during restore." },
  { flag: "--disable-bbupdate",name: "Disable bbupdate", desc: "Skip baseband update; dump and stitch instead." },
  { flag: "--activation-records", name: "Activation records", desc: "Dump and stitch activation records." },
  { flag: "--skip-verify",     name: "Skip IPSW verify", desc: "Skip verification checks for IPSW selection." },
  { flag: "--pwned-recovery",  name: "Pwned recovery", desc: "Assume the device is in pwned recovery (experimental)." },
  { flag: "--debug",           name: "Debug output", desc: "Verbose debug logging." },
  { flag: "--no-version-check",name: "Skip version check", desc: "Do not check for script updates." },
];
