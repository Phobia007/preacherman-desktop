#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
use tauri_plugin_shell::ShellExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(all(target_os = "windows", not(debug_assertions)))]
            {
                let (_events, _child) = app
                    .shell()
                    .sidecar("preacherman-service")
                    .expect("Windows Agent service sidecar is missing")
                    .spawn()?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Preacherman Desktop Demo");
}
