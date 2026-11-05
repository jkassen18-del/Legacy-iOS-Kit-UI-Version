; Inno Setup script for Legacy iOS Kit (Windows installer).
; Build the app first (pyinstaller desktop/legacy_ios_kit.spec), then:
;   iscc desktop\installer\legacy-ios-kit.iss
; Produces dist\installer\LegacyiOSKit-Setup.exe

#define AppName "Legacy iOS Kit"
#define AppVersion "1.0.0"
#define AppPublisher "Legacy iOS Kit"
#define AppExe "Legacy iOS Kit.exe"
#define AppURL "https://github.com/LukeZGD/Legacy-iOS-Kit"

[Setup]
AppId={{B6C7B3D4-2E7A-4C1F-9E3A-6A1D9E2F7C10}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=..\..\dist\installer
OutputBaseFilename=LegacyiOSKit-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequiredOverridesAllowed=dialog
UninstallDisplayIcon={app}\{#AppExe}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"

[Files]
; The one-folder PyInstaller build produced at repo-root dist\Legacy iOS Kit\
Source: "..\..\dist\Legacy iOS Kit\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent
