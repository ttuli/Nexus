; Nexus 安装 / 卸载程序的自定义步骤。
; electron-builder 打包时把本文件插进它生成的 NSIS 脚本（electron-builder.json5 的 nsis.include），
; 可用的宏、变量见 node_modules/app-builder-lib/templates/nsis，卸载流程在其中的 uninstaller.nsh。

; 自动更新缓存的目录名，取自 electron-builder 定义的 APP_INSTALLER_STORE_FILE（形如 nexus-updater\installer.exe），
; 与客户端 app-update.yml 的 updaterCacheDirName 同源，不写死
!ifdef APP_INSTALLER_STORE_FILE
  !searchparse /noerrors "${APP_INSTALLER_STORE_FILE}" "" UPDATER_CACHE_DIR "\"
!endif

; 卸载时删除自动更新缓存 %LOCALAPPDATA%\nexus-updater（当前版本安装包副本、下载的更新包），约 90~180 MB。
; 安装新版本（自动更新、手动重装都一样）时会先静默卸载旧版本，并总带 --updated（isUpdated 为真）：
; 那时缓存里可能正是要装的安装包，不能删，只在用户真正卸载时删。
; 缓存总在当前用户的 LOCALAPPDATA 下，「为所有用户安装」时临时切到当前用户上下文，与模板删除 AppData 的写法一致
!macro customUnInstall
  !ifdef UPDATER_CACHE_DIR
    ${ifNot} ${isUpdated}
      ${if} $installMode == "all"
        SetShellVarContext current
      ${endif}
      RMDir /r "$LOCALAPPDATA\${UPDATER_CACHE_DIR}"
      ${if} $installMode == "all"
        SetShellVarContext all
      ${endif}
    ${endIf}
  !endif
!macroend
