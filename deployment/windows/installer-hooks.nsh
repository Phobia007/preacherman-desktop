!macro NSIS_HOOK_POSTINSTALL
  CreateShortcut "$SMPROGRAMS\Preacherman Local Services.lnk" "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\service-setup\Setup.ps1"' "$INSTDIR\preacherman-demo-host.exe" 0
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$SMPROGRAMS\Preacherman Local Services.lnk"
!macroend
