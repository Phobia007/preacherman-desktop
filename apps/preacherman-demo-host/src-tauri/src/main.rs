#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
use tauri_plugin_shell::ShellExt;
#[cfg(target_os = "windows")]
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(all(target_os = "windows", not(debug_assertions)))]
            {
                let ui_root = app.path().resource_dir()?.join("preacherman-ui");
                let (_events, _child) = app
                    .shell()
                    .sidecar("preacherman-service")
                    .expect("Windows Agent service sidecar is missing")
                    .env("PREACHERMAN_UI_ROOT", ui_root)
                    .spawn()?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Preacherman Desktop Demo");
}
